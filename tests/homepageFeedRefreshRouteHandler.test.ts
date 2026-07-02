import type { IncomingMessage, ServerResponse } from "node:http";

import { afterEach, describe, expect, it, jest } from "@jest/globals";

type HomepageFeedRefreshRoute = typeof import("../api/internal/cron/homepage-feed-refresh").default;
type RpcModule = typeof import("../api/_lib/rpc");

const originalEnv = process.env;

function setValidCronEnv() {
  process.env = {
    ...originalEnv,
    PLANETSCALE_DATABASE_URL: "postgres://plotlist:test@localhost:5432/plotlist",
    JWT_SECRET: "test-jwt-secret-with-at-least-thirty-two-chars",
    REFRESH_TOKEN_SECRET: "test-refresh-secret-with-at-least-thirty-two-chars",
    CRON_SECRET: "homepage-cron-secret",
    TMDB_API_KEY: "tmdb-test-key",
    TWILIO_ACCOUNT_SID: "twilio-account",
    TWILIO_AUTH_TOKEN: "twilio-auth",
    TWILIO_VERIFY_SERVICE_SID: "twilio-verify",
    CONTACT_HASH_SECRET: "contact-hash-secret",
    NODE_ENV: "test",
  };
}

function createMockResponse() {
  const headers = new Map<string, number | string | string[]>();
  let body = "";
  const res = {
    statusCode: 0,
    setHeader: jest.fn((name: string, value: number | string | string[]) => {
      headers.set(name.toLowerCase(), value);
      return res;
    }),
    end: jest.fn((value?: string) => {
      body = value ?? "";
      return res;
    }),
  } as unknown as ServerResponse;

  return {
    body: () => body,
    header: (name: string) => headers.get(name.toLowerCase()),
    res,
  };
}

function createRequest(headers: IncomingMessage["headers"] = {}) {
  return {
    method: "GET",
    headers,
  } as IncomingMessage;
}

function loadRoute() {
  jest.resetModules();
  setValidCronEnv();
  jest.doMock("../api/_lib/rpc", () => ({
    runRpcHandler: jest.fn(),
  }));

  const route = require("../api/internal/cron/homepage-feed-refresh")
    .default as HomepageFeedRefreshRoute;
  const rpc = require("../api/_lib/rpc") as jest.Mocked<RpcModule>;

  return { route, rpc };
}

describe("homepage feed refresh cron route", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
    process.env = originalEnv;
  });

  it("rejects unauthenticated cron requests before loading the homepage catalog", async () => {
    const { route, rpc } = loadRoute();
    const response = createMockResponse();

    await route(createRequest(), response.res);

    expect(response.res.statusCode).toBe(401);
    expect(response.header("cache-control")).toBe("no-store, max-age=0");
    expect(JSON.parse(response.body())).toEqual({
      error: {
        code: "unauthorized",
        message: "Unauthorized",
      },
    });
    expect(rpc.runRpcHandler).not.toHaveBeenCalled();
  });

  it("runs the homepage catalog action and returns no-store freshness diagnostics", async () => {
    const consoleInfo = jest.spyOn(console, "info").mockImplementation(() => {});
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { route, rpc } = loadRoute();
    rpc.runRpcHandler.mockResolvedValue({});
    const req = createRequest({
      authorization: "Bearer homepage-cron-secret",
    });
    const response = createMockResponse();

    await route(req, response.res);

    expect(rpc.runRpcHandler).toHaveBeenCalledWith("action", "shows:getHomeCatalog", {
      args: {},
      req,
    });
    expect(response.res.statusCode).toBe(503);
    expect(response.header("content-type")).toBe("application/json; charset=utf-8");
    expect(response.header("cache-control")).toBe("no-store, max-age=0");

    const body = JSON.parse(response.body());
    expect(body).toEqual(
      expect.objectContaining({
        healthy: false,
        status: "critical",
        freshness: expect.objectContaining({
          currentDemandDailyChart: expect.objectContaining({
            sourceId: "justwatch_us_daily_streaming_charts_jun1",
            sourceCheckedAt: "2026-06-01",
            sourceUrl: "https://www.justwatch.com/us/streaming-charts?ct=daily&t=shows",
            staleAt: "2026-06-09",
          }),
        }),
      }),
    );
    expect(consoleError).toHaveBeenCalledWith(
      "[homepage-feed-refresh] Action items",
      expect.objectContaining({
        statusCode: 503,
        status: "critical",
        criticalActionItemCount: expect.any(Number),
        freshness: expect.objectContaining({
          currentDemandDailyChart: expect.objectContaining({
            sourceId: "justwatch_us_daily_streaming_charts_jun1",
          }),
        }),
      }),
    );
    expect(consoleInfo).toHaveBeenCalledWith(
      "[homepage-feed-refresh] Summary",
      expect.objectContaining({
        statusCode: 503,
        status: "critical",
        healthy: false,
        freshness: expect.objectContaining({
          currentDemandDailyChart: expect.objectContaining({
            sourceId: "justwatch_us_daily_streaming_charts_jun1",
          }),
        }),
      }),
    );
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("logs compact category diagnostics when batched catalog lists fail or serve stale fallback data", async () => {
    const consoleInfo = jest.spyOn(console, "info").mockImplementation(() => {});
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { route, rpc } = loadRoute();
    rpc.runRpcHandler.mockResolvedValue({
      diagnostics: {
        failedCategories: ["hulu", "trending_day"],
        staleCategories: ["netflix"],
      },
    });
    const response = createMockResponse();

    await route(
      createRequest({
        authorization: "Bearer homepage-cron-secret",
      }),
      response.res,
    );

    expect(response.res.statusCode).toBe(503);
    const body = JSON.parse(response.body());
    expect(body).toEqual(
      expect.objectContaining({
        healthy: false,
        status: "critical",
        primaryActionItem: expect.objectContaining({
          owner: "catalog",
          severity: "critical",
          code: "catalog_list_failed",
          category: "hulu",
        }),
      }),
    );
    expect(body.actionItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: "catalog",
          severity: "critical",
          code: "catalog_list_failed",
          category: "trending_day",
        }),
        expect.objectContaining({
          owner: "catalog",
          severity: "warning",
          code: "catalog_list_stale",
          category: "netflix",
        }),
      ]),
    );
    expect(consoleError).toHaveBeenCalledWith(
      "[homepage-feed-refresh] Action items",
      expect.objectContaining({
        statusCode: 503,
        status: "critical",
        catalogDiagnostics: {
          failedCategories: ["hulu", "trending_day"],
          staleCategories: ["netflix"],
        },
      }),
    );
    expect(consoleInfo).toHaveBeenCalledWith(
      "[homepage-feed-refresh] Summary",
      expect.objectContaining({
        catalogDiagnostics: {
          failedCategories: ["hulu", "trending_day"],
          staleCategories: ["netflix"],
        },
      }),
    );
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("returns structured freshness diagnostics when the homepage catalog action fails", async () => {
    const consoleInfo = jest.spyOn(console, "info").mockImplementation(() => {});
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { route, rpc } = loadRoute();
    const catalogError = new Error("database temporarily unavailable");
    rpc.runRpcHandler.mockRejectedValue(catalogError);
    const response = createMockResponse();

    await route(
      createRequest({
        authorization: "Bearer homepage-cron-secret",
      }),
      response.res,
    );

    expect(response.res.statusCode).toBe(503);
    expect(response.header("cache-control")).toBe("no-store, max-age=0");

    const body = JSON.parse(response.body());
    expect(body).toEqual(
      expect.objectContaining({
        healthy: false,
        status: "critical",
        primaryActionItem: expect.objectContaining({
          owner: "catalog",
          severity: "critical",
          code: "catalog_action_failed",
        }),
      }),
    );
    expect(body.actionItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: "catalog",
          severity: "critical",
          code: "catalog_action_failed",
          message:
            "Homepage catalog action failed before returning rail payload; inspect RPC, TMDB, and database logs, then rerun the freshness cron.",
        }),
      ]),
    );
    expect(consoleError).toHaveBeenCalledWith(
      "[homepage-feed-refresh] Catalog action failed",
      catalogError,
    );
    expect(consoleError).toHaveBeenCalledWith(
      "[homepage-feed-refresh] Action items",
      expect.objectContaining({
        statusCode: 503,
        criticalActionItemCount: expect.any(Number),
        primaryActionItem: expect.objectContaining({
          code: "catalog_action_failed",
        }),
      }),
    );
    expect(consoleInfo).toHaveBeenCalledWith(
      "[homepage-feed-refresh] Summary",
      expect.objectContaining({
        statusCode: 503,
        status: "critical",
        primaryActionItem: expect.objectContaining({
          code: "catalog_action_failed",
        }),
      }),
    );
    expect(consoleWarn).not.toHaveBeenCalled();
  });
});

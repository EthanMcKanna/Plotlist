import type { IncomingMessage, ServerResponse } from "node:http";

import { describe, expect, it, jest } from "@jest/globals";
import { z } from "zod";

import { json, withJsonRoute } from "../api/_lib/http";

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

describe("API JSON routes", () => {
  it("marks JSON responses as no-store so freshness health checks cannot be reused stale", () => {
    const response = createMockResponse();

    json(response.res, 200, { ok: true });

    expect(response.res.statusCode).toBe(200);
    expect(response.header("cache-control")).toBe("no-store, max-age=0");
    expect(response.header("content-type")).toBe("application/json; charset=utf-8");
    expect(JSON.parse(response.body())).toEqual({ ok: true });
  });

  it("preserves no-store on GET JSON routes such as cron diagnostics", async () => {
    const response = createMockResponse();
    const route = withJsonRoute(
      z.object({}).passthrough(),
      async ({ res }) => {
        return json(res, 200, { healthy: true });
      },
      { methods: ["GET"] },
    );

    await route(
      {
        method: "GET",
        headers: {},
      } as IncomingMessage,
      response.res,
    );

    expect(response.res.statusCode).toBe(200);
    expect(response.header("cache-control")).toBe("no-store, max-age=0");
    expect(JSON.parse(response.body())).toEqual({ healthy: true });
  });
});

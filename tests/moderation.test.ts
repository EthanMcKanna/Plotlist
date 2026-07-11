import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

import { moderateImage, moderateText } from "../api/_lib/moderation";
import { resetServerEnvCache } from "../api/_lib/env";
import { ApiError } from "../api/_lib/errors";

const REQUIRED_ENV = {
  JWT_SECRET: "test-jwt-secret-test-jwt-secret-test",
  REFRESH_TOKEN_SECRET: "test-refresh-secret-test-refresh-secret",
  CRON_SECRET: "cron",
  TMDB_API_KEY: "tmdb",
  TWILIO_ACCOUNT_SID: "sid",
  TWILIO_AUTH_TOKEN: "token",
  TWILIO_VERIFY_SERVICE_SID: "verify",
  CONTACT_HASH_SECRET: "contact",
} as const;

const originalEnv: Record<string, string | undefined> = {};
const originalFetch = globalThis.fetch;

type FetchMock = jest.Mock<(...args: unknown[]) => Promise<unknown>>;

let fetchMock: FetchMock;

function moderationResponse(results: unknown[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ results }),
    text: async () => "",
  };
}

function lastRequestBody() {
  const [, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit];
  return JSON.parse(init.body as string);
}

beforeEach(() => {
  for (const [key, value] of Object.entries({ ...REQUIRED_ENV, OPENAI_MODERATION_API_KEY: "sk-test" })) {
    originalEnv[key] = process.env[key];
    process.env[key] = value;
  }
  resetServerEnvCache();
  fetchMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  resetServerEnvCache();
  globalThis.fetch = originalFetch;
});

describe("moderateText", () => {
  it("allows clean text", async () => {
    fetchMock.mockResolvedValue(moderationResponse([{ flagged: false, categories: {} }]));

    await expect(moderateText("comment", ["what a great finale"])).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = lastRequestBody();
    expect(body.model).toBe("omni-moderation-latest");
    expect(body.input).toEqual([{ type: "text", text: "what a great finale" }]);
  });

  it("rejects flagged text with a 422 content_flagged ApiError", async () => {
    fetchMock.mockResolvedValue(
      moderationResponse([{ flagged: true, categories: { harassment: true, hate: false } }]),
    );

    const attempt = moderateText("comment", ["something awful"]);
    await expect(attempt).rejects.toThrow(ApiError);
    await attempt.catch((error: ApiError) => {
      expect(error.status).toBe(422);
      expect(error.code).toBe("content_flagged");
      expect(error.details).toEqual({ surface: "comment", categories: ["harassment"] });
    });
  });

  it("skips empty and omitted fields without calling the API", async () => {
    await expect(moderateText("review", [undefined, null, "  "])).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends one input per provided field", async () => {
    fetchMock.mockResolvedValue(
      moderationResponse([
        { flagged: false, categories: {} },
        { flagged: false, categories: {} },
      ]),
    );

    await moderateText("list", ["Cozy mysteries", "Rainy-day comfort shows"]);
    expect(lastRequestBody().input).toHaveLength(2);
  });

  it("ignores plain violence on show-talk surfaces (plot discussion)", async () => {
    fetchMock.mockResolvedValue(
      moderationResponse([{ flagged: true, categories: { violence: true } }]),
    );

    await expect(moderateText("review", ["he murders half the cast in ep 3"])).resolves.toBeUndefined();
  });

  it("still rejects graphic violence on show-talk surfaces", async () => {
    fetchMock.mockResolvedValue(
      moderationResponse([{ flagged: true, categories: { violence: true, "violence/graphic": true } }]),
    );

    await expect(moderateText("review", ["…"])).rejects.toMatchObject({
      code: "content_flagged",
      details: { surface: "review", categories: ["violence/graphic"] },
    });
  });

  it("rejects violence on profile surfaces", async () => {
    fetchMock.mockResolvedValue(
      moderationResponse([{ flagged: true, categories: { violence: true } }]),
    );

    await expect(moderateText("profile", ["…"])).rejects.toMatchObject({
      code: "content_flagged",
    });
  });

  it("fails open when no API key is configured", async () => {
    delete process.env.OPENAI_MODERATION_API_KEY;
    resetServerEnvCache();

    await expect(moderateText("comment", ["anything"])).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails open on network errors", async () => {
    fetchMock.mockRejectedValue(new Error("connect timeout"));

    await expect(moderateText("comment", ["anything"])).resolves.toBeUndefined();
  });

  it("fails open on non-2xx responses", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => "server error",
    });

    await expect(moderateText("comment", ["anything"])).resolves.toBeUndefined();
  });
});

describe("moderateImage", () => {
  it("sends supported images as base64 data URLs", async () => {
    fetchMock.mockResolvedValue(moderationResponse([{ flagged: false, categories: {} }]));
    const bytes = Buffer.from("fake-jpeg-bytes");

    await expect(moderateImage("avatar", bytes, "image/jpeg")).resolves.toBeUndefined();

    const body = lastRequestBody();
    expect(body.input).toEqual([
      {
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${bytes.toString("base64")}` },
      },
    ]);
  });

  it("rejects flagged images", async () => {
    fetchMock.mockResolvedValue(
      moderationResponse([{ flagged: true, categories: { sexual: true } }]),
    );

    await expect(moderateImage("avatar", Buffer.from("x"), "image/png")).rejects.toMatchObject({
      status: 422,
      code: "content_flagged",
      details: { surface: "avatar", categories: ["sexual"] },
    });
  });

  it("skips unsupported formats instead of blocking the upload", async () => {
    await expect(moderateImage("avatar", Buffer.from("x"), "image/heic")).resolves.toBeUndefined();
    await expect(moderateImage("avatar", Buffer.from("x"), undefined)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

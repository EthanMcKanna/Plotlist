import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const freshSession = {
  accessToken: "access-old",
  refreshToken: "refresh-old",
  accessTokenExpiresAt: Date.now() + 60_000,
  refreshTokenExpiresAt: Date.now() + 60_000,
};

const expiringSession = {
  ...freshSession,
  accessTokenExpiresAt: Date.now() - 1,
};

const nextSession = {
  accessToken: "access-new",
  refreshToken: "refresh-new",
  accessTokenExpiresAt: Date.now() + 60_000,
  refreshTokenExpiresAt: Date.now() + 60_000,
};

type TestSession = typeof freshSession;

describe("api client session refresh", () => {
  const getStoredSession = jest.fn<() => Promise<TestSession | null>>();
  const setStoredSession = jest.fn<() => Promise<void>>();
  const clearStoredSession = jest.fn<() => Promise<void>>();
  const fetchMock = jest.fn<() => Promise<Response>>();

  beforeEach(() => {
    jest.resetModules();
    getStoredSession.mockReset();
    setStoredSession.mockReset().mockResolvedValue(undefined);
    clearStoredSession.mockReset().mockResolvedValue(undefined);
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;

    jest.doMock("../lib/api/session", () => ({
      clearStoredSession,
      getStoredSession,
      setStoredSession,
    }));
    jest.doMock("../lib/api/env", () => ({
      getApiBaseUrl: () => "http://api.test",
    }));
  });

  it("does not rotate a stored session while the access token is still fresh", async () => {
    getStoredSession.mockResolvedValue(freshSession);
    const { refreshSessionIfNeeded } = require("../lib/api/client") as typeof import("../lib/api/client");

    await expect(refreshSessionIfNeeded()).resolves.toBe(freshSession);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(setStoredSession).not.toHaveBeenCalled();
  });

  it("shares one refresh request across concurrent callers", async () => {
    getStoredSession.mockResolvedValue(expiringSession);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => nextSession,
    } as Response);
    const { refreshSessionIfNeeded } = require("../lib/api/client") as typeof import("../lib/api/client");

    await expect(
      Promise.all([refreshSessionIfNeeded(), refreshSessionIfNeeded()])
    ).resolves.toEqual([nextSession, nextSession]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(setStoredSession).toHaveBeenCalledTimes(1);
    expect(setStoredSession).toHaveBeenCalledWith(nextSession);
  });

  it("clears the stored session when refresh returns 401", async () => {
    getStoredSession.mockResolvedValue(expiringSession);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "expired" } }),
    } as Response);
    const { refreshSessionIfNeeded } = require("../lib/api/client") as typeof import("../lib/api/client");

    await expect(refreshSessionIfNeeded()).rejects.toThrow();
    expect(clearStoredSession).toHaveBeenCalledTimes(1);
  });

  it("preserves the stored session when refresh fails with a transient 5xx", async () => {
    getStoredSession.mockResolvedValue(expiringSession);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: { message: "bad gateway" } }),
    } as Response);
    const { refreshSessionIfNeeded } = require("../lib/api/client") as typeof import("../lib/api/client");

    await expect(refreshSessionIfNeeded()).rejects.toThrow();
    expect(clearStoredSession).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, jest } from "@jest/globals";

import { getSeasonDetailsWithCache } from "../lib/seasonDetails";
import { SEASON_DETAILS_RATE_LIMIT_ERROR } from "../lib/seasonGuide";

describe("getSeasonDetailsWithCache", () => {
  it("returns fresh cached payloads without enforcing the rate limit", async () => {
    const enforceRateLimit = jest.fn<() => Promise<void>>();
    const fetchPayload = jest.fn<() => Promise<{ id: number }>>();

    const result = await getSeasonDetailsWithCache({
      cached: {
        payload: { id: 1 },
        expiresAt: Date.now() + 60_000,
      },
      now: Date.now(),
      enforceRateLimit,
      fetchPayload,
    });

    expect(result).toEqual({ id: 1 });
    expect(enforceRateLimit).not.toHaveBeenCalled();
    expect(fetchPayload).not.toHaveBeenCalled();
  });

  it("enforces the rate limit before fetching when the cache is stale", async () => {
    const enforceRateLimit = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const fetchPayload = jest.fn<() => Promise<{ id: number }>>().mockResolvedValue({ id: 2 });

    const result = await getSeasonDetailsWithCache({
      cached: {
        payload: { id: 1 },
        expiresAt: Date.now() - 1,
      },
      now: Date.now(),
      enforceRateLimit,
      fetchPayload,
    });

    expect(result).toEqual({ id: 2 });
    expect(enforceRateLimit).toHaveBeenCalledTimes(1);
    expect(fetchPayload).toHaveBeenCalledTimes(1);
  });

  it("normalizes rate limit failures for the client", async () => {
    await expect(
      getSeasonDetailsWithCache({
        cached: null,
        now: Date.now(),
        enforceRateLimit: async () => {
          throw new Error("Rate limit exceeded");
        },
        fetchPayload: async () => ({ id: 3 }),
      }),
    ).rejects.toThrow(SEASON_DETAILS_RATE_LIMIT_ERROR);
  });
});

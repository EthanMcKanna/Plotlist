import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

import {
  HOME_WARM_CACHE_MAX_AGE_MS,
  clearHomeWarmCache,
  ensureHomeWarmCacheLoaded,
  getHomeWarmCatalog,
  getHomeWarmForYou,
  getHomeWarmQueryCacheKey,
  getHomeWarmScheduleSnapshot,
  hydrateHomeQueryClientFromWarmCache,
  isHomeWarmQueryPersistable,
  normalizeHomeWarmCache,
  recordHomeWarmCatalog,
  recordHomeWarmForYou,
  recordHomeWarmQuery,
  recordHomeWarmSchedule,
  resetHomeWarmCacheForTesting,
  shouldHydrateHomeWarmQuery,
} from "../lib/homeWarmCache";

const NOW = Date.parse("2026-07-08T12:00:00.000Z");
const TODAY = "2026-07-08";

function createMemoryStore(initial: string | null = null) {
  let value = initial;
  return {
    read: jest.fn(() => value),
    write: jest.fn((next: string) => {
      value = next;
    }),
    remove: jest.fn(() => {
      value = null;
    }),
    get value() {
      return value;
    },
  };
}

function buildCache(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    userId: "user_1",
    savedAt: NOW - 1000,
    queries: {},
    ...overrides,
  };
}

beforeEach(() => {
  resetHomeWarmCacheForTesting(createMemoryStore());
});

afterEach(() => {
  jest.useRealTimers();
  resetHomeWarmCacheForTesting(null);
});

describe("warm query whitelist", () => {
  it("persists only the queries that shape first paint", () => {
    expect(isHomeWarmQueryPersistable("users:me")).toBe(true);
    expect(isHomeWarmQueryPersistable("episodeProgress:getUpNext")).toBe(true);
    expect(isHomeWarmQueryPersistable("notifications:getUnreadCount")).toBe(true);
    expect(isHomeWarmQueryPersistable("contacts:getStatus")).toBe(true);
    expect(isHomeWarmQueryPersistable("releaseCalendar:getHomePreview")).toBe(true);
    expect(isHomeWarmQueryPersistable("shows:search")).toBe(false);
    expect(isHomeWarmQueryPersistable(undefined)).toBe(false);
  });
});

describe("shouldHydrateHomeWarmQuery", () => {
  it("hydrates fresh entries and rejects expired ones", () => {
    const entry = {
      name: "episodeProgress:getUpNext",
      args: {},
      data: [],
      savedAt: NOW - 1000,
    };
    expect(shouldHydrateHomeWarmQuery(entry, { now: NOW, today: TODAY })).toBe(true);
    expect(
      shouldHydrateHomeWarmQuery(
        { ...entry, savedAt: NOW - HOME_WARM_CACHE_MAX_AGE_MS - 1 },
        { now: NOW, today: TODAY },
      ),
    ).toBe(false);
  });

  it("only replays the schedule preview on the same local day", () => {
    const entry = {
      name: "releaseCalendar:getHomePreview",
      args: { today: TODAY },
      data: { tonightGroups: [] },
      savedAt: NOW - 1000,
    };
    expect(shouldHydrateHomeWarmQuery(entry, { now: NOW, today: TODAY })).toBe(true);
    expect(
      shouldHydrateHomeWarmQuery(entry, { now: NOW, today: "2026-07-09" }),
    ).toBe(false);
  });
});

describe("normalizeHomeWarmCache", () => {
  it("rejects unknown versions and expired snapshots", () => {
    expect(normalizeHomeWarmCache(buildCache({ version: 99 }), NOW)).toBeNull();
    expect(
      normalizeHomeWarmCache(
        buildCache({ savedAt: NOW - HOME_WARM_CACHE_MAX_AGE_MS - 1 }),
        NOW,
      ),
    ).toBeNull();
    expect(normalizeHomeWarmCache("garbage", NOW)).toBeNull();
  });

  it("drops non-whitelisted and stale query entries", () => {
    const normalized = normalizeHomeWarmCache(
      buildCache({
        queries: {
          good: {
            name: "users:me",
            args: {},
            data: { _id: "user_1" },
            savedAt: NOW - 1000,
          },
          rogue: {
            name: "shows:search",
            args: {},
            data: [],
            savedAt: NOW - 1000,
          },
          stale: {
            name: "contacts:getStatus",
            args: {},
            data: {},
            savedAt: NOW - HOME_WARM_CACHE_MAX_AGE_MS - 1,
          },
        },
      }),
      NOW,
    );

    expect(Object.keys(normalized?.queries ?? {})).toEqual([
      getHomeWarmQueryCacheKey("users:me", {}),
    ]);
  });
});

describe("record and read back", () => {
  it("round-trips the catalog, for-you, and schedule snapshots", () => {
    recordHomeWarmCatalog({ risingNow: [{ title: "Alpha" }] }, NOW);
    recordHomeWarmForYou([{ title: "Beta" }], NOW);
    recordHomeWarmSchedule({ today: TODAY, tonightCount: 2, weekCount: 3 }, NOW);

    expect(getHomeWarmCatalog(NOW)).toEqual({ risingNow: [{ title: "Alpha" }] });
    expect(getHomeWarmForYou(NOW)).toEqual([{ title: "Beta" }]);
    expect(getHomeWarmScheduleSnapshot(NOW)).toEqual({
      today: TODAY,
      tonightCount: 2,
      weekCount: 3,
    });
  });

  it("expires the catalog independently of the envelope", () => {
    recordHomeWarmCatalog({ risingNow: [] }, NOW - HOME_WARM_CACHE_MAX_AGE_MS - 1);
    expect(getHomeWarmCatalog(NOW)).toBeNull();
  });

  it("wipes the previous account's snapshot when a new user signs in", () => {
    recordHomeWarmQuery("users:me", {}, { _id: "user_1" }, NOW);
    recordHomeWarmCatalog({ risingNow: [{ title: "Alpha" }] }, NOW);

    recordHomeWarmQuery("users:me", {}, { _id: "user_2" }, NOW + 1);

    expect(getHomeWarmCatalog(NOW + 2)).toBeNull();
    expect(ensureHomeWarmCacheLoaded(NOW + 2)?.userId).toBe("user_2");
  });

  it("persists to the store after the debounce window", () => {
    jest.useFakeTimers();
    const memoryStore = createMemoryStore();
    resetHomeWarmCacheForTesting(memoryStore);

    recordHomeWarmQuery("users:me", {}, { _id: "user_1" }, NOW);
    expect(memoryStore.write).not.toHaveBeenCalled();

    jest.runAllTimers();
    expect(memoryStore.write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(memoryStore.value ?? "{}").userId).toBe("user_1");
  });

  it("clears the disk snapshot on demand", () => {
    const memoryStore = createMemoryStore(JSON.stringify(buildCache()));
    resetHomeWarmCacheForTesting(memoryStore);

    expect(ensureHomeWarmCacheLoaded(NOW)).not.toBeNull();
    clearHomeWarmCache();

    expect(memoryStore.remove).toHaveBeenCalled();
    expect(ensureHomeWarmCacheLoaded(NOW)).toBeNull();
  });
});

describe("hydrateHomeQueryClientFromWarmCache", () => {
  function createFakeQueryClient() {
    const set = jest.fn();
    const states = new Map<string, { data: unknown }>();
    return {
      setQueryData: set,
      getQueryState: (key: unknown) => states.get(JSON.stringify(key)),
      __states: states,
      __set: set,
    };
  }

  it("replays persisted whitelisted queries with their original timestamps", () => {
    const memoryStore = createMemoryStore(
      JSON.stringify(
        buildCache({
          queries: {
            upNext: {
              name: "episodeProgress:getUpNext",
              args: {},
              data: [{ showId: "show_1" }],
              savedAt: NOW - 60_000,
            },
            schedule: {
              name: "releaseCalendar:getHomePreview",
              args: { today: "2026-07-07" },
              data: { tonightGroups: [] },
              savedAt: NOW - 60_000,
            },
          },
        }),
      ),
    );
    resetHomeWarmCacheForTesting(memoryStore);

    const client = createFakeQueryClient();
    const hydrated = hydrateHomeQueryClientFromWarmCache(client as never, {
      now: NOW,
      today: TODAY,
    });

    // The stale-day schedule entry is skipped; up-next hydrates.
    expect(hydrated).toBe(1);
    expect(client.__set).toHaveBeenCalledWith(
      ["plotlist-rpc", "query", "episodeProgress:getUpNext", {}],
      [{ showId: "show_1" }],
      { updatedAt: NOW - 60_000 },
    );
  });

  it("never overwrites data a live fetch already produced", () => {
    const memoryStore = createMemoryStore(
      JSON.stringify(
        buildCache({
          queries: {
            me: {
              name: "users:me",
              args: {},
              data: { _id: "user_1" },
              savedAt: NOW - 60_000,
            },
          },
        }),
      ),
    );
    resetHomeWarmCacheForTesting(memoryStore);

    const client = createFakeQueryClient();
    client.__states.set(
      JSON.stringify(["plotlist-rpc", "query", "users:me", {}]),
      { data: { _id: "user_1", fresh: true } },
    );

    expect(
      hydrateHomeQueryClientFromWarmCache(client as never, {
        now: NOW,
        today: TODAY,
      }),
    ).toBe(0);
    expect(client.__set).not.toHaveBeenCalled();
  });
});

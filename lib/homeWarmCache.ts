import { Platform } from "react-native";
import type { QueryClient } from "@tanstack/react-query";

/**
 * Warm-start cache for the home surface. The last known payloads for the
 * queries that shape the first screen (profile, up-next, schedule counts,
 * unread badge) plus the raw home catalog are persisted to disk and hydrated
 * synchronously on launch, so the home page renders settled content on its
 * very first frame while fresh data loads behind it.
 *
 * Storage is the new expo-file-system File API (synchronous reads/writes) on
 * native, localStorage on web, and a no-op in-memory store anywhere else.
 * Everything here is best-effort: any failure degrades to a normal cold load.
 */

const WARM_CACHE_VERSION = 1;
const WARM_CACHE_FILE_NAME = "plotlist-home-warm-cache-v1.json";
const WARM_CACHE_WEB_KEY = "plotlistHomeWarmCacheV1";
const WARM_CACHE_WRITE_DELAY_MS = 400;

export const HOME_WARM_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Queries mirrored to disk. Everything else stays memory-only. */
const HOME_WARM_QUERY_NAMES = new Set([
  "users:me",
  "episodeProgress:getUpNext",
  "notifications:getUnreadCount",
  "contacts:getStatus",
  "releaseCalendar:getHomePreview",
]);

export type HomeWarmQueryEntry = {
  name: string;
  args: Record<string, unknown>;
  data: unknown;
  savedAt: number;
};

export type HomeWarmScheduleSnapshot = {
  today: string;
  tonightCount: number;
  weekCount: number;
};

export type HomeWarmCache = {
  version: number;
  userId: string | null;
  savedAt: number;
  queries: Record<string, HomeWarmQueryEntry>;
  catalog?: unknown;
  catalogSavedAt?: number;
  forYou?: unknown[];
  forYouSavedAt?: number;
  schedule?: HomeWarmScheduleSnapshot | null;
};

export function isHomeWarmQueryPersistable(name: unknown): name is string {
  return typeof name === "string" && HOME_WARM_QUERY_NAMES.has(name);
}

export function getHomeWarmQueryCacheKey(
  name: string,
  args: Record<string, unknown>,
) {
  return `${name}:${JSON.stringify(args ?? {})}`;
}

export function isHomeWarmEntryFresh(
  savedAt: number | undefined,
  now: number,
) {
  return (
    typeof savedAt === "number" &&
    Number.isFinite(savedAt) &&
    savedAt <= now &&
    now - savedAt <= HOME_WARM_CACHE_MAX_AGE_MS
  );
}

/**
 * Whether a persisted query payload may be replayed into the query client.
 * Day-scoped queries (schedule preview) only hydrate on the same local day,
 * since their cache key embeds `today` and yesterday's key would never match.
 */
export function shouldHydrateHomeWarmQuery(
  entry: HomeWarmQueryEntry,
  { now, today }: { now: number; today: string },
) {
  if (!isHomeWarmQueryPersistable(entry?.name)) return false;
  if (!isHomeWarmEntryFresh(entry.savedAt, now)) return false;
  if (entry.data === undefined) return false;
  if (entry.name === "releaseCalendar:getHomePreview") {
    return (entry.args as { today?: unknown })?.today === today;
  }
  return true;
}

export function normalizeHomeWarmCache(
  raw: unknown,
  now: number,
): HomeWarmCache | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<HomeWarmCache>;
  if (value.version !== WARM_CACHE_VERSION) return null;
  if (!isHomeWarmEntryFresh(value.savedAt, now)) return null;

  const queries: Record<string, HomeWarmQueryEntry> = {};
  if (value.queries && typeof value.queries === "object") {
    for (const entry of Object.values(value.queries)) {
      if (
        entry &&
        typeof entry === "object" &&
        isHomeWarmQueryPersistable((entry as HomeWarmQueryEntry).name) &&
        isHomeWarmEntryFresh((entry as HomeWarmQueryEntry).savedAt, now)
      ) {
        const typed = entry as HomeWarmQueryEntry;
        queries[getHomeWarmQueryCacheKey(typed.name, typed.args ?? {})] = {
          ...typed,
          args: typed.args ?? {},
        };
      }
    }
  }

  return {
    version: WARM_CACHE_VERSION,
    userId: typeof value.userId === "string" ? value.userId : null,
    savedAt: value.savedAt as number,
    queries,
    catalog: isHomeWarmEntryFresh(value.catalogSavedAt, now)
      ? value.catalog
      : undefined,
    catalogSavedAt: isHomeWarmEntryFresh(value.catalogSavedAt, now)
      ? value.catalogSavedAt
      : undefined,
    forYou:
      isHomeWarmEntryFresh(value.forYouSavedAt, now) &&
      Array.isArray(value.forYou)
        ? value.forYou
        : undefined,
    forYouSavedAt: isHomeWarmEntryFresh(value.forYouSavedAt, now)
      ? value.forYouSavedAt
      : undefined,
    schedule:
      value.schedule && typeof value.schedule === "object"
        ? (value.schedule as HomeWarmScheduleSnapshot)
        : null,
  };
}

type WarmStore = {
  read: () => string | null;
  write: (value: string) => void;
  remove: () => void;
};

function createNativeFileStore(): WarmStore | null {
  try {
    const { File, Paths } = require("expo-file-system") as {
      File: new (...parts: unknown[]) => {
        exists: boolean;
        textSync: () => string;
        write: (content: string) => void;
        delete: () => void;
      };
      Paths: { cache: unknown };
    };
    const file = new File(Paths.cache, WARM_CACHE_FILE_NAME);
    return {
      read: () => (file.exists ? file.textSync() : null),
      write: (value) => {
        file.write(value);
      },
      remove: () => {
        if (file.exists) file.delete();
      },
    };
  } catch {
    return null;
  }
}

function createWebStore(): WarmStore | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  return {
    read: () => window.localStorage.getItem(WARM_CACHE_WEB_KEY),
    write: (value) => window.localStorage.setItem(WARM_CACHE_WEB_KEY, value),
    remove: () => window.localStorage.removeItem(WARM_CACHE_WEB_KEY),
  };
}

let store: WarmStore | null | undefined;
let cache: HomeWarmCache | null = null;
let loaded = false;
let pendingWrite: ReturnType<typeof setTimeout> | null = null;

function getWarmStore(): WarmStore | null {
  if (store !== undefined) return store;
  store = Platform.OS === "web" ? createWebStore() : createNativeFileStore();
  return store;
}

export function ensureHomeWarmCacheLoaded(
  now = Date.now(),
): HomeWarmCache | null {
  if (loaded) return cache;
  loaded = true;
  try {
    const raw = getWarmStore()?.read();
    cache = raw ? normalizeHomeWarmCache(JSON.parse(raw), now) : null;
  } catch {
    cache = null;
  }
  return cache;
}

function scheduleWarmCacheWrite() {
  if (pendingWrite) clearTimeout(pendingWrite);
  pendingWrite = setTimeout(() => {
    pendingWrite = null;
    try {
      if (cache) {
        getWarmStore()?.write(JSON.stringify(cache));
      }
    } catch {
      // Persisting the warm cache is best-effort.
    }
  }, WARM_CACHE_WRITE_DELAY_MS);
}

function getWritableCache(now: number): HomeWarmCache {
  ensureHomeWarmCacheLoaded(now);
  if (!cache) {
    cache = {
      version: WARM_CACHE_VERSION,
      userId: null,
      savedAt: now,
      queries: {},
    };
  }
  cache.savedAt = now;
  return cache;
}

export function clearHomeWarmCache() {
  loaded = true;
  cache = null;
  if (pendingWrite) {
    clearTimeout(pendingWrite);
    pendingWrite = null;
  }
  try {
    getWarmStore()?.remove();
  } catch {
    // Best-effort.
  }
}

/**
 * Record a fresh query result. `users:me` doubles as the ownership check:
 * a different account id wipes the previous user's warm data before saving.
 */
export function recordHomeWarmQuery(
  name: string,
  args: Record<string, unknown>,
  data: unknown,
  now = Date.now(),
) {
  if (!isHomeWarmQueryPersistable(name) || data === undefined) return;

  if (name === "users:me") {
    const userId = (data as { _id?: unknown })?._id;
    if (typeof userId === "string") {
      const existing = ensureHomeWarmCacheLoaded(now);
      if (existing?.userId && existing.userId !== userId) {
        clearHomeWarmCache();
      }
      getWritableCache(now).userId = userId;
    }
  }

  const target = getWritableCache(now);
  target.queries[getHomeWarmQueryCacheKey(name, args)] = {
    name,
    args,
    data,
    savedAt: now,
  };
  scheduleWarmCacheWrite();
}

export function recordHomeWarmCatalog(payload: unknown, now = Date.now()) {
  const target = getWritableCache(now);
  target.catalog = payload;
  target.catalogSavedAt = now;
  scheduleWarmCacheWrite();
}

export function recordHomeWarmForYou(items: unknown[], now = Date.now()) {
  if (!Array.isArray(items)) return;
  const target = getWritableCache(now);
  target.forYou = items;
  target.forYouSavedAt = now;
  scheduleWarmCacheWrite();
}

export function recordHomeWarmSchedule(
  snapshot: HomeWarmScheduleSnapshot,
  now = Date.now(),
) {
  const target = getWritableCache(now);
  target.schedule = snapshot;
  scheduleWarmCacheWrite();
}

export function getHomeWarmCatalog(now = Date.now()): unknown | null {
  const current = ensureHomeWarmCacheLoaded(now);
  if (!current || !isHomeWarmEntryFresh(current.catalogSavedAt, now)) {
    return null;
  }
  return current.catalog ?? null;
}

export function getHomeWarmForYou(now = Date.now()): unknown[] | null {
  const current = ensureHomeWarmCacheLoaded(now);
  if (!current || !isHomeWarmEntryFresh(current.forYouSavedAt, now)) {
    return null;
  }
  return Array.isArray(current.forYou) ? current.forYou : null;
}

export function getHomeWarmScheduleSnapshot(
  now = Date.now(),
): HomeWarmScheduleSnapshot | null {
  return ensureHomeWarmCacheLoaded(now)?.schedule ?? null;
}

/**
 * Replay persisted query payloads into the query client. Entries are written
 * with their original `updatedAt`, so anything older than the client's
 * staleTime still refetches immediately — the warm data only covers the gap
 * between first paint and the network. Queries that already hold data (a
 * fetch beat us to it) are left alone.
 */
export function hydrateHomeQueryClientFromWarmCache(
  queryClient: QueryClient,
  { now, today }: { now: number; today: string },
) {
  const current = ensureHomeWarmCacheLoaded(now);
  if (!current) return 0;

  let hydrated = 0;
  for (const entry of Object.values(current.queries)) {
    if (!shouldHydrateHomeWarmQuery(entry, { now, today })) continue;
    const queryKey = ["plotlist-rpc", "query", entry.name, entry.args];
    try {
      if (queryClient.getQueryState(queryKey)?.data !== undefined) continue;
      queryClient.setQueryData(queryKey, entry.data, {
        updatedAt: entry.savedAt,
      });
      hydrated += 1;
    } catch {
      // Hydration is best-effort; a bad entry never blocks startup.
    }
  }
  return hydrated;
}

/** Test-only: reset module state and inject a fake store. */
export function resetHomeWarmCacheForTesting(testStore?: WarmStore | null) {
  loaded = false;
  cache = null;
  if (pendingWrite) {
    clearTimeout(pendingWrite);
    pendingWrite = null;
  }
  store = testStore;
}

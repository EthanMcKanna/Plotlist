import { and, desc, eq, inArray, lte } from "drizzle-orm";

import {
  releaseEvents,
  showReleaseSyncState,
  shows,
  tmdbDetailsCache,
  userTastePreferences,
  users,
  watchStates,
} from "../../db/schema";
import {
  addDaysToDateOnlyString,
  buildTmdbReleaseEventsForShow,
  getDateOnlyStartTimestamp,
  getReleaseCalendarShowIds,
  getTmdbReleaseCandidateSeasonNumbers,
  isDateOnlyString,
  isReleaseSyncStateStale,
} from "../../lib/releaseCalendar";
import { db } from "./db";
import { ApiError } from "./errors";
import { createId } from "./ids";
import { slimSeasonPayload, upsertSeasonCacheEntry } from "./season-cache";

const RELEASE_LOOKAHEAD_DAYS = 120;
const RELEASE_SYNC_TTL_MS = 12 * 60 * 60 * 1000;
const RELEASE_SYNC_FAILURE_TTL_MS = 60 * 60 * 1000;
const RELEASE_DETAILS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SEASONS_PER_SHOW = 4;

type ShowRow = typeof shows.$inferSelect;

function dateOnlyStartTs(value: string) {
  return getDateOnlyStartTimestamp(value);
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function mergeUniqueShowIds(...groups: Array<string[] | null | undefined>) {
  return Array.from(
    new Set(
      groups
        .flatMap((group) => group ?? [])
        .map((showId) => showId.trim())
        .filter((showId) => showId.length > 0),
    ),
  );
}

async function tmdb(path: string, params: Record<string, string | number | undefined> = {}) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new ApiError(500, "tmdb_unconfigured", "TMDB_API_KEY is not configured");
  }

  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", "en-US");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new ApiError(response.status, "tmdb_error", `TMDB request failed with ${response.status}`);
  }
  return await response.json();
}

async function setReleaseSyncState(
  showId: string,
  values: {
    status: "idle" | "scheduled" | "running" | "ready" | "failed";
    syncedAt?: number | null;
    expiresAt?: number | null;
    lastError?: string | null;
  },
) {
  const now = Date.now();
  const existing = await db
    .select()
    .from(showReleaseSyncState)
    .where(eq(showReleaseSyncState.showId, showId))
    .limit(1);

  const row = {
    showId,
    status: values.status,
    syncedAt: values.syncedAt ?? null,
    expiresAt: values.expiresAt ?? null,
    lastError: values.lastError ?? null,
    updatedAt: now,
  };

  if (existing[0]) {
    await db.update(showReleaseSyncState).set(row).where(eq(showReleaseSyncState.id, existing[0].id));
    return;
  }

  await db.insert(showReleaseSyncState).values({
    id: createId("relsync"),
    ...row,
  });
}

async function cacheReleaseDetails(show: ShowRow, details: any, now: number) {
  if (show.externalSource !== "tmdb") {
    return;
  }

  const existing = await db
    .select()
    .from(tmdbDetailsCache)
    .where(
      and(
        eq(tmdbDetailsCache.externalSource, show.externalSource),
        eq(tmdbDetailsCache.externalId, show.externalId),
      ),
    )
    .limit(1);
  const existingPayload =
    existing[0]?.payload && typeof existing[0].payload === "object"
      ? (existing[0].payload as Record<string, unknown>)
      : {};
  const nextPayload =
    details && typeof details === "object"
      ? { ...existingPayload, ...details }
      : existingPayload;
  const expiresAt = now + RELEASE_DETAILS_CACHE_TTL_MS;

  if (existing[0]) {
    await db
      .update(tmdbDetailsCache)
      .set({ payload: nextPayload, fetchedAt: now, expiresAt })
      .where(eq(tmdbDetailsCache.id, existing[0].id));
    return;
  }

  await db.insert(tmdbDetailsCache).values({
    id: createId("tmdbdetails"),
    externalSource: show.externalSource,
    externalId: show.externalId,
    payload: nextPayload,
    fetchedAt: now,
    expiresAt,
  });
}

async function refreshReleaseEventsForShow(show: ShowRow, now: number, anchorToday?: string) {
  if (show.externalSource !== "tmdb") {
    return { eventCount: 0, skipped: true };
  }

  await setReleaseSyncState(show.id, {
    status: "running",
    syncedAt: null,
    expiresAt: now + RELEASE_SYNC_FAILURE_TTL_MS,
    lastError: null,
  });

  const today = anchorToday && isDateOnlyString(anchorToday)
    ? anchorToday
    : isoDate(new Date(now));
  const horizon =
    addDaysToDateOnlyString(today, RELEASE_LOOKAHEAD_DAYS) ??
    isoDate(addDays(new Date(now), RELEASE_LOOKAHEAD_DAYS));

  try {
    const details = await tmdb(`/tv/${show.externalId}`, {
      append_to_response: "watch/providers",
    });
    await cacheReleaseDetails(show, details, now);
    const seasonNumbers = getTmdbReleaseCandidateSeasonNumbers({
      details,
      today,
      horizon,
      maxSeasons: MAX_SEASONS_PER_SHOW,
    });
    const seasonPayloads = await Promise.all(
      seasonNumbers.map((seasonNumber) => tmdb(`/tv/${show.externalId}/season/${seasonNumber}`)),
    );
    // Warm the up-next season cache from the same responses; the hourly
    // release cron covers exactly the shows users track.
    for (const seasonPayload of seasonPayloads) {
      const slim = slimSeasonPayload(seasonPayload);
      if (slim) {
        await upsertSeasonCacheEntry(show.externalId, slim, now).catch(() => {});
      }
    }

    const nextEvents = buildTmdbReleaseEventsForShow({
      showId: show.id,
      details,
      seasonPayloads,
      today,
      horizon,
    }).map((event) => ({
      id: createId("release"),
      ...event,
    }));

    await db.delete(releaseEvents).where(eq(releaseEvents.showId, show.id));
    if (nextEvents.length > 0) {
      await db.insert(releaseEvents).values(nextEvents as Array<typeof releaseEvents.$inferInsert>);
    }

    await setReleaseSyncState(show.id, {
      status: "ready",
      syncedAt: now,
      expiresAt: now + RELEASE_SYNC_TTL_MS,
      lastError: null,
    });

    return { eventCount: nextEvents.length, skipped: false };
  } catch (error) {
    await setReleaseSyncState(show.id, {
      status: "failed",
      syncedAt: null,
      expiresAt: now + RELEASE_SYNC_FAILURE_TTL_MS,
      lastError: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function refreshReleaseEventsForShows(showRows: ShowRow[], anchorToday?: string) {
  const now = Date.now();
  let refreshed = 0;
  let skipped = 0;
  let failed = 0;
  let cachedEvents = 0;

  for (const show of showRows) {
    try {
      const result = await refreshReleaseEventsForShow(show, now, anchorToday);
      if (result.skipped) {
        skipped += 1;
      } else {
        refreshed += 1;
        cachedEvents += result.eventCount;
      }
    } catch {
      failed += 1;
    }
  }

  return {
    refreshed,
    skipped,
    failed,
    cachedEvents,
  };
}

export async function refreshTrackedReleaseCalendarForUser(
  userId: string,
  limit = 25,
  anchorToday?: string,
) {
  const [states, userRows, tasteRows] = await Promise.all([
    db
      .select()
      .from(watchStates)
      .where(and(eq(watchStates.userId, userId), inArray(watchStates.status, ["watchlist", "watching"])))
      .orderBy(desc(watchStates.updatedAt))
      .limit(Math.max(limit * 2, limit)),
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db
      .select()
      .from(userTastePreferences)
      .where(eq(userTastePreferences.userId, userId))
      .limit(1),
  ]);
  const showIds = getReleaseCalendarShowIds({
    states,
    favoriteShowIds: mergeUniqueShowIds(
      userRows[0]?.favoriteShowIds,
      tasteRows[0]?.favoriteShowIds,
    ),
  }).slice(0, limit);
  const showRows = showIds.length ? await db.select().from(shows).where(inArray(shows.id, showIds)) : [];
  return await refreshReleaseEventsForShows(showRows, anchorToday);
}

export async function refreshStaleTrackedReleases(limit = 40) {
  const now = Date.now();
  const states = await db
    .select()
    .from(watchStates)
    .where(inArray(watchStates.status, ["watchlist", "watching"]))
    .orderBy(desc(watchStates.updatedAt))
    .limit(limit * 4);
  const candidateIds = Array.from(new Set(states.map((state) => state.showId))).slice(0, limit * 2);
  if (candidateIds.length === 0) {
    return { refreshed: 0, skipped: 0, failed: 0, cachedEvents: 0 };
  }

  const [showRows, syncRows] = await Promise.all([
    db.select().from(shows).where(inArray(shows.id, candidateIds)),
    db.select().from(showReleaseSyncState).where(inArray(showReleaseSyncState.showId, candidateIds)),
  ]);
  const syncByShowId = new Map(syncRows.map((row) => [row.showId, row]));
  const staleRows = showRows
    .filter((show) => {
      const state = syncByShowId.get(show.id);
      return isReleaseSyncStateStale(state, now);
    })
    .slice(0, limit);

  return await refreshReleaseEventsForShows(staleRows);
}

export async function getStaleReleaseShowIds(showIds: string[], now = Date.now()) {
  if (showIds.length === 0) {
    return [];
  }
  const rows = await db
    .select()
    .from(showReleaseSyncState)
    .where(inArray(showReleaseSyncState.showId, showIds));
  const byShowId = new Map(rows.map((row) => [row.showId, row]));
  return showIds.filter((showId) => {
    const row = byShowId.get(showId);
    return isReleaseSyncStateStale(row, now);
  });
}

export async function deleteExpiredReleaseEvents() {
  const today = isoDate(new Date());
  const cutoff = dateOnlyStartTs(today);
  const removed = await db
    .delete(releaseEvents)
    .where(lte(releaseEvents.airDateTs, cutoff - 24 * 60 * 60 * 1000))
    .returning({ id: releaseEvents.id });
  return { removed: removed.length };
}

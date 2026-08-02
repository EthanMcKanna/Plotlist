import { and, eq, inArray, sql } from "drizzle-orm";

import {
  episodeProgress,
  reviews,
  shows,
  tmdbDetailsCache,
  watchInsightsCache,
  watchStates,
} from "../../db/schema";
import {
  buildMonthlyRecap,
  buildWatchInsights,
  extractShowRuntimeMinutes,
  WATCH_INSIGHTS_VERSION,
  type BuildWatchInsightsInput,
  type WatchInsights,
  type WatchInsightsMonthlyRecap,
  type WatchInsightsSeasonRuntimeInput,
} from "../../lib/watchInsights";
import { db } from "./db";
import { readSeasonCacheEntries, seasonCacheKey } from "./season-cache";
import { chunkForSqlParams } from "./sql-dialect";

// Upper bound on distinct (show, season) runtime lookups per request; the
// most recently watched seasons win, everything older falls back to show or
// default runtimes. Keeps one request inside D1/Workers limits for any
// history size.
const MAX_SEASON_RUNTIME_LOOKUPS = 400;

async function getShowRowsChunked(showIds: string[]) {
  const chunks = chunkForSqlParams(Array.from(new Set(showIds)), 1, 80);
  const results = await Promise.all(
    chunks.map((chunk) => db.select().from(shows).where(inArray(shows.id, chunk))),
  );
  return results.flat();
}

async function getDetailPayloadsChunked(externalIds: string[]) {
  const chunks = chunkForSqlParams(Array.from(new Set(externalIds)), 1, 80);
  const results = await Promise.all(
    chunks.map((chunk) =>
      db
        .select({
          externalId: tmdbDetailsCache.externalId,
          payload: tmdbDetailsCache.payload,
        })
        .from(tmdbDetailsCache)
        .where(
          and(
            eq(tmdbDetailsCache.externalSource, "tmdb"),
            inArray(tmdbDetailsCache.externalId, chunk),
          ),
        ),
    ),
  );
  return results.flat();
}

// Shared loader for every insights consumer (full stats RPC + monthly recap
// cron): episode progress, states, reviews, show rows, and runtime sources.
async function loadWatchInsightsInputs(
  userId: string,
): Promise<Omit<BuildWatchInsightsInput, "now" | "utcOffsetMinutes">> {
  const [episodeRows, stateRows, reviewRows] = await Promise.all([
    db
      .select({
        id: episodeProgress.id,
        showId: episodeProgress.showId,
        seasonNumber: episodeProgress.seasonNumber,
        episodeNumber: episodeProgress.episodeNumber,
        watchedAt: episodeProgress.watchedAt,
      })
      .from(episodeProgress)
      .where(eq(episodeProgress.userId, userId)),
    db
      .select({
        showId: watchStates.showId,
        status: watchStates.status,
        updatedAt: watchStates.updatedAt,
      })
      .from(watchStates)
      .where(eq(watchStates.userId, userId)),
    db
      .select({
        id: reviews.id,
        showId: reviews.showId,
        rating: reviews.rating,
        createdAt: reviews.createdAt,
      })
      .from(reviews)
      .where(eq(reviews.authorId, userId)),
  ]);

  const showRows = await getShowRowsChunked([
    ...episodeRows.map((row) => row.showId),
    ...reviewRows.map((row) => row.showId),
  ]);
  const showById = new Map(showRows.map((row) => [row.id, row] as const));

  // Season-level runtime lookups for the most recently watched seasons.
  const pairLastWatched = new Map<string, { externalId: string; seasonNumber: number; watchedAt: number }>();
  for (const row of episodeRows) {
    const show = showById.get(row.showId);
    if (!show || show.externalSource !== "tmdb") continue;
    const key = seasonCacheKey(show.externalId, row.seasonNumber);
    const existing = pairLastWatched.get(key);
    if (!existing || row.watchedAt > existing.watchedAt) {
      pairLastWatched.set(key, {
        externalId: show.externalId,
        seasonNumber: row.seasonNumber,
        watchedAt: row.watchedAt,
      });
    }
  }
  const seasonRequests = Array.from(pairLastWatched.values())
    .sort((left, right) => right.watchedAt - left.watchedAt)
    .slice(0, MAX_SEASON_RUNTIME_LOOKUPS);
  const seasonEntries = await readSeasonCacheEntries(seasonRequests);

  const seasonRuntimes: WatchInsightsSeasonRuntimeInput[] = [];
  const coveredExternalIds = new Set<string>();
  for (const request of seasonRequests) {
    const entry = seasonEntries.get(seasonCacheKey(request.externalId, request.seasonNumber));
    if (!entry) continue;
    const episodes = entry.payload.episodes
      .filter((episode) => episode.runtime !== null)
      .map((episode) => ({ episodeNumber: episode.episodeNumber, runtime: episode.runtime }));
    if (episodes.length === 0) continue;
    seasonRuntimes.push({
      externalId: request.externalId,
      seasonNumber: request.seasonNumber,
      episodes,
    });
    coveredExternalIds.add(request.externalId);
  }

  // Show-level runtime fallback only for watched shows the season cache
  // couldn't cover.
  const uncoveredExternalIds = Array.from(
    new Set(
      episodeRows
        .map((row) => showById.get(row.showId))
        .filter(
          (show): show is typeof shows.$inferSelect =>
            Boolean(show) &&
            show!.externalSource === "tmdb" &&
            !coveredExternalIds.has(show!.externalId),
        )
        .map((show) => show.externalId),
    ),
  );
  const detailRows =
    uncoveredExternalIds.length > 0 ? await getDetailPayloadsChunked(uncoveredExternalIds) : [];
  const showRuntimes = detailRows.flatMap((row) => {
    const runtimeMinutes = extractShowRuntimeMinutes(row.payload);
    return runtimeMinutes !== null ? [{ externalId: row.externalId, runtimeMinutes }] : [];
  });

  return {
    episodes: episodeRows,
    watchStates: stateRows,
    reviews: reviewRows,
    shows: showRows,
    seasonRuntimes,
    showRuntimes,
  };
}

// The user's local calendar day (YYYY-MM-DD) for a given wall-clock instant,
// matching the shifted-date convention the insights engine uses.
function localDayKey(now: number, utcOffsetMinutes: number): string {
  return new Date(now + utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

// Cheap change digest that stands in for the full-history read: three tiny
// (count, max timestamp) aggregates over the tables the insights derive from.
// Any insert/delete/edit moves a counter or a max. The offset + local-day
// terms expire the cache at the user's midnight (streaks and pace windows are
// day-sensitive) or when their timezone changes; the engine version term
// expires it when the payload shape changes.
async function computeInsightsFingerprint(
  userId: string,
  utcOffsetMinutes: number,
): Promise<string> {
  const [episodeAgg, stateAgg, reviewAgg] = await Promise.all([
    db
      .select({
        count: sql<number>`count(*)`,
        latest: sql<number | null>`max(${episodeProgress.watchedAt})`,
      })
      .from(episodeProgress)
      .where(eq(episodeProgress.userId, userId)),
    db
      .select({
        count: sql<number>`count(*)`,
        latest: sql<number | null>`max(${watchStates.updatedAt})`,
      })
      .from(watchStates)
      .where(eq(watchStates.userId, userId)),
    db
      .select({
        count: sql<number>`count(*)`,
        latest: sql<number | null>`max(coalesce(${reviews.updatedAt}, ${reviews.createdAt}))`,
      })
      .from(reviews)
      .where(eq(reviews.authorId, userId)),
  ]);
  const part = (row: { count: number; latest: number | null } | undefined) =>
    `${row?.count ?? 0}:${row?.latest ?? 0}`;
  return [
    `v${WATCH_INSIGHTS_VERSION}`,
    `e${part(episodeAgg[0])}`,
    `s${part(stateAgg[0])}`,
    `r${part(reviewAgg[0])}`,
    `off${utcOffsetMinutes}`,
    localDayKey(Date.now(), utcOffsetMinutes),
  ].join("|");
}

export async function getWatchInsightsForUser(
  userId: string,
  utcOffsetMinutes: number,
): Promise<WatchInsights> {
  const [fingerprint, cachedRows] = await Promise.all([
    computeInsightsFingerprint(userId, utcOffsetMinutes),
    // Best-effort read: a missing table (deploy before migration) or a bad
    // row must degrade to a full recompute, never fail the RPC.
    db
      .select()
      .from(watchInsightsCache)
      .where(eq(watchInsightsCache.userId, userId))
      .limit(1)
      .catch(() => []),
  ]);
  const cached = cachedRows[0];
  if (
    cached &&
    cached.fingerprint === fingerprint &&
    typeof cached.payload === "object" &&
    cached.payload !== null
  ) {
    return cached.payload as WatchInsights;
  }

  const inputs = await loadWatchInsightsInputs(userId);
  const insights = buildWatchInsights({ ...inputs, utcOffsetMinutes });

  // Best-effort write-through; a failed cache write must never fail the read.
  const computedAt = Date.now();
  await db
    .insert(watchInsightsCache)
    .values({ userId, fingerprint, payload: insights, computedAt })
    .onConflictDoUpdate({
      target: watchInsightsCache.userId,
      set: { fingerprint, payload: insights, computedAt },
    })
    .catch(() => {});

  return insights;
}

// Last completed local month's rollup for the monthly recap push. Null when
// that month had no watched episodes.
export async function getMonthlyRecapForUser(
  userId: string,
  utcOffsetMinutes: number,
  now: number,
): Promise<WatchInsightsMonthlyRecap | null> {
  const inputs = await loadWatchInsightsInputs(userId);
  return buildMonthlyRecap({ ...inputs, utcOffsetMinutes, now });
}

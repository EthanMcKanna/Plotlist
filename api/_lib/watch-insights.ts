import { and, eq, inArray } from "drizzle-orm";

import {
  episodeProgress,
  reviews,
  shows,
  tmdbDetailsCache,
  watchStates,
} from "../../db/schema";
import {
  buildWatchInsights,
  extractShowRuntimeMinutes,
  type WatchInsights,
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
  const rows: Array<typeof shows.$inferSelect> = [];
  for (const chunk of chunkForSqlParams(Array.from(new Set(showIds)), 1, 80)) {
    rows.push(...(await db.select().from(shows).where(inArray(shows.id, chunk))));
  }
  return rows;
}

async function getDetailPayloadsChunked(externalIds: string[]) {
  const rows: Array<{ externalId: string; payload: unknown }> = [];
  for (const chunk of chunkForSqlParams(Array.from(new Set(externalIds)), 1, 80)) {
    rows.push(
      ...(await db
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
        )),
    );
  }
  return rows;
}

export async function getWatchInsightsForUser(
  userId: string,
  utcOffsetMinutes: number,
): Promise<WatchInsights> {
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

  return buildWatchInsights({
    episodes: episodeRows,
    watchStates: stateRows,
    reviews: reviewRows,
    shows: showRows,
    seasonRuntimes,
    showRuntimes,
    utcOffsetMinutes,
  });
}

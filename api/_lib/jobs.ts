import { desc, eq, lte, or } from "drizzle-orm";

import {
  authSessions,
  imdbRatingsCache,
  phoneVerificationRequests,
  rateLimits,
  tmdbDetailsCache,
  tmdbEpisodeCacheJobs,
  tmdbImportJobs,
  tmdbListCache,
  tmdbSearchCache,
  tmdbSeasonCache,
} from "../../db/schema";
import { db } from "./db";
import { createId } from "./ids";
import { getHomeCatalogCacheCleanupCutoff } from "../../lib/homeCatalogCache";

const HOT_SHOW_TARGET_COUNT = 3_000;
const FULL_SHOW_TARGET_COUNT = 10_000;
const HOT_EPISODE_TARGET_COUNT = 1_500;
const FULL_EPISODE_TARGET_COUNT = 10_000;
const HOT_SHOW_FRESHNESS_MS = 6 * 60 * 60 * 1000;
const FULL_SHOW_FRESHNESS_MS = 6 * 24 * 60 * 60 * 1000;
const HOT_EPISODE_FRESHNESS_MS = 12 * 60 * 60 * 1000;
const FULL_EPISODE_FRESHNESS_MS = 6 * 24 * 60 * 60 * 1000;

type JobResult = {
  started: boolean;
  reason: string;
  jobId?: string;
  status?: string;
};

async function latestTmdbImportJob() {
  const rows = await db
    .select()
    .from(tmdbImportJobs)
    .orderBy(desc(tmdbImportJobs.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

async function latestEpisodeCacheJob() {
  const rows = await db
    .select()
    .from(tmdbEpisodeCacheJobs)
    .orderBy(desc(tmdbEpisodeCacheJobs.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

export async function cleanupExpiredTmdbCache() {
  const now = Date.now();

  const [details, search, list, seasons, imdbRatings] = await Promise.all([
    db
      .delete(tmdbDetailsCache)
      .where(lte(tmdbDetailsCache.expiresAt, now))
      .returning({ id: tmdbDetailsCache.id }),
    db
      .delete(tmdbSearchCache)
      .where(lte(tmdbSearchCache.expiresAt, now))
      .returning({ id: tmdbSearchCache.id }),
    db
      .delete(tmdbListCache)
      .where(lte(tmdbListCache.expiresAt, getHomeCatalogCacheCleanupCutoff(now)))
      .returning({ id: tmdbListCache.id }),
    // Season rows serve stale-if-available for up-next, so only drop entries
    // that have sat unrefreshed for a week past expiry.
    db
      .delete(tmdbSeasonCache)
      .where(lte(tmdbSeasonCache.expiresAt, now - 7 * 24 * 60 * 60 * 1000))
      .returning({ id: tmdbSeasonCache.id }),
    // IMDb rating rows also serve stale-if-available on OMDb failure.
    db
      .delete(imdbRatingsCache)
      .where(lte(imdbRatingsCache.expiresAt, now - 7 * 24 * 60 * 60 * 1000))
      .returning({ id: imdbRatingsCache.id }),
  ]);

  return {
    removed:
      details.length + search.length + list.length + seasons.length + imdbRatings.length,
  };
}

// Housekeeping for auth/rate-limit tables that used to grow unbounded on the
// old backend: expired sessions, stale OTP requests, and settled rate windows.
export async function cleanupExpiredAuthArtifacts() {
  const now = Date.now();
  const [sessions, verifications, limits] = await Promise.all([
    db
      .delete(authSessions)
      .where(lte(authSessions.expiresAt, now - 7 * 24 * 60 * 60 * 1000))
      .returning({ id: authSessions.id }),
    db
      .delete(phoneVerificationRequests)
      .where(lte(phoneVerificationRequests.expiresAt, now - 24 * 60 * 60 * 1000))
      .returning({ id: phoneVerificationRequests.id }),
    db
      .delete(rateLimits)
      .where(lte(rateLimits.resetAt, now - 60 * 60 * 1000))
      .returning({ id: rateLimits.id }),
  ]);

  return {
    removedSessions: sessions.length,
    removedVerificationRequests: verifications.length,
    removedRateLimits: limits.length,
  };
}

export async function maybeStartTopTvImport(args: {
  targetCount: number;
  pagesPerBatch?: number;
  minFreshMs?: number;
}): Promise<JobResult> {
  const latestJob = await latestTmdbImportJob();
  if (latestJob && (latestJob.status === "queued" || latestJob.status === "running")) {
    return {
      started: false,
      reason: "tmdb import already active",
      jobId: latestJob.id,
      status: latestJob.status,
    };
  }

  if (
    latestJob?.status === "completed" &&
    latestJob.targetCount >= args.targetCount &&
    latestJob.completedAt &&
    args.minFreshMs !== undefined &&
    latestJob.completedAt >= Date.now() - args.minFreshMs
  ) {
    return {
      started: false,
      reason: "tmdb import already fresh",
      jobId: latestJob.id,
      status: latestJob.status,
    };
  }

  const now = Date.now();
  const jobId = createId("tmdbjob");
  await db.insert(tmdbImportJobs).values({
    id: jobId,
    kind: "top_tv",
    status: "queued",
    requestedBy: null,
    targetCount: args.targetCount,
    pageSize: 20,
    maxPage: 500,
    nextPage: 1,
    pagesProcessed: 0,
    showsProcessed: 0,
    totalPages: null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  });

  return {
    started: true,
    reason: "started",
    jobId,
    status: "queued",
  };
}

export async function maybeStartEpisodeCacheBackfill(args: {
  targetShowCount: number;
  batchSize?: number;
  minFreshMs?: number;
}): Promise<JobResult> {
  const latestJob = await latestEpisodeCacheJob();
  if (latestJob && (latestJob.status === "queued" || latestJob.status === "running")) {
    return {
      started: false,
      reason: "episode cache job already active",
      jobId: latestJob.id,
      status: latestJob.status,
    };
  }

  if (
    latestJob?.status === "completed" &&
    latestJob.targetShowCount >= args.targetShowCount &&
    latestJob.completedAt &&
    args.minFreshMs !== undefined &&
    latestJob.completedAt >= Date.now() - args.minFreshMs
  ) {
    return {
      started: false,
      reason: "episode cache already fresh",
      jobId: latestJob.id,
      status: latestJob.status,
    };
  }

  const now = Date.now();
  const jobId = createId("episodejob");
  await db.insert(tmdbEpisodeCacheJobs).values({
    id: jobId,
    kind: "season_cache",
    status: "queued",
    requestedBy: null,
    targetShowCount: args.targetShowCount,
    batchSize: args.batchSize ?? 8,
    nextOffset: 0,
    processedShowCount: 0,
    cachedSeasonCount: 0,
    skippedSeasonCount: 0,
    failedShowCount: 0,
    totalShowCount: null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  });

  return {
    started: true,
    reason: "started",
    jobId,
    status: "queued",
  };
}

export async function scheduleHotShowCatalogRefresh() {
  return await maybeStartTopTvImport({
    targetCount: HOT_SHOW_TARGET_COUNT,
    pagesPerBatch: 10,
    minFreshMs: HOT_SHOW_FRESHNESS_MS,
  });
}

export async function scheduleFullShowCatalogRefresh() {
  return await maybeStartTopTvImport({
    targetCount: FULL_SHOW_TARGET_COUNT,
    pagesPerBatch: 10,
    minFreshMs: FULL_SHOW_FRESHNESS_MS,
  });
}

export async function scheduleHotEpisodeCacheRefresh() {
  return await maybeStartEpisodeCacheBackfill({
    targetShowCount: HOT_EPISODE_TARGET_COUNT,
    batchSize: 8,
    minFreshMs: HOT_EPISODE_FRESHNESS_MS,
  });
}

export async function scheduleFullEpisodeCacheRefresh() {
  return await maybeStartEpisodeCacheBackfill({
    targetShowCount: FULL_EPISODE_TARGET_COUNT,
    batchSize: 6,
    minFreshMs: FULL_EPISODE_FRESHNESS_MS,
  });
}

export async function listRunnableJobs() {
  const now = Date.now();
  const [imports, episodes] = await Promise.all([
    db
      .select()
      .from(tmdbImportJobs)
      .where(or(eq(tmdbImportJobs.status, "queued"), eq(tmdbImportJobs.status, "running"))),
    db
      .select()
      .from(tmdbEpisodeCacheJobs)
      .where(
        or(
          eq(tmdbEpisodeCacheJobs.status, "queued"),
          eq(tmdbEpisodeCacheJobs.status, "running"),
        ),
      ),
  ]);

  return {
    now,
    imports,
    episodes,
  };
}

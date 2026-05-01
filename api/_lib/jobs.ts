import { count, desc, eq, lte, or } from "drizzle-orm";

import {
  showEmbeddingJobs,
  shows,
  tmdbDetailsCache,
  tmdbEpisodeCacheJobs,
  tmdbImportJobs,
  tmdbListCache,
  tmdbSearchCache,
} from "../../db/schema";
import { db } from "./db";
import { createId } from "./ids";

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

async function latestEmbeddingJob() {
  const rows = await db
    .select()
    .from(showEmbeddingJobs)
    .orderBy(desc(showEmbeddingJobs.createdAt))
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

  const [details, search, list] = await Promise.all([
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
      .where(lte(tmdbListCache.expiresAt, now))
      .returning({ id: tmdbListCache.id }),
  ]);

  return {
    removed: details.length + search.length + list.length,
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

export async function maybeStartEmbeddingBackfill(): Promise<JobResult> {
  const [latestJob, showCountResult] = await Promise.all([
    latestEmbeddingJob(),
    db.select({ count: count() }).from(shows),
  ]);

  if (latestJob && (latestJob.status === "queued" || latestJob.status === "running")) {
    return {
      started: false,
      reason: "embedding backfill already active",
      jobId: latestJob.id,
      status: latestJob.status,
    };
  }

  const showCount = showCountResult[0]?.count ?? 0;

  if (
    latestJob?.status === "completed" &&
    latestJob.totalCount !== null &&
    latestJob.embeddedCount >= showCount
  ) {
    return {
      started: false,
      reason: "embeddings already current",
      jobId: latestJob.id,
      status: latestJob.status,
    };
  }

  const now = Date.now();
  const jobId = createId("embedjob");
  await db.insert(showEmbeddingJobs).values({
    id: jobId,
    kind: "show_catalog",
    status: "queued",
    embeddingVersion: process.env.GEMINI_EMBEDDING_VERSION ?? "shows-v1",
    model: process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-2-preview",
    dimensions: 1536,
    batchSize: 20,
    nextCursor: null,
    processedCount: 0,
    embeddedCount: 0,
    skippedCount: 0,
    totalCount: showCount,
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

export async function scheduleHotEmbeddingRefresh() {
  return await maybeStartEmbeddingBackfill();
}

export async function scheduleFullEmbeddingRefresh() {
  return await maybeStartEmbeddingBackfill();
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
  const [imports, embeddings, episodes] = await Promise.all([
    db
      .select()
      .from(tmdbImportJobs)
      .where(or(eq(tmdbImportJobs.status, "queued"), eq(tmdbImportJobs.status, "running"))),
    db
      .select()
      .from(showEmbeddingJobs)
      .where(or(eq(showEmbeddingJobs.status, "queued"), eq(showEmbeddingJobs.status, "running"))),
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
    embeddings,
    episodes,
  };
}

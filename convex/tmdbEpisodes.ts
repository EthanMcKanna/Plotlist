import { internal } from "./_generated/api";
import {
  type ActionCtx,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";

const DEFAULT_TARGET_SHOW_COUNT = 10_000;
const DEFAULT_SHOWS_PER_BATCH = 5;
const EXCLUDED_EPISODE_BACKFILL_GENRE_IDS = new Set([10763, 10764, 10766, 10767]);

type ShowDoc = Doc<"shows">;
type EpisodeCacheJobId = Id<"tmdbEpisodeCacheJobs">;

function tmdbUrl(path: string) {
  const base = process.env.TMDB_BASE_URL ?? "https://api.themoviedb.org/3";
  return `${base}${path}`;
}

function getTmdbApiKey() {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error("Missing TMDB_API_KEY env var");
  }
  return apiKey;
}

function sortShowsForEpisodeCache(left: ShowDoc, right: ShowDoc) {
  return (
    (right.tmdbPopularity ?? -1) - (left.tmdbPopularity ?? -1) ||
    (right.tmdbVoteCount ?? -1) - (left.tmdbVoteCount ?? -1) ||
    (right.year ?? -1) - (left.year ?? -1) ||
    left.title.localeCompare(right.title)
  );
}

export const listTopTmdbShowsForEpisodeCache = internalQuery({
  args: {
    offset: v.number(),
    batchSize: v.number(),
  },
  handler: async (ctx, args) => {
    const shows = await ctx.db
      .query("shows")
      .withIndex("by_external", (q) => q.eq("externalSource", "tmdb"))
      .collect();
    const sorted = shows
      .filter((show) =>
        !(show.genreIds ?? []).some((genreId) => EXCLUDED_EPISODE_BACKFILL_GENRE_IDS.has(genreId)),
      )
      .sort(sortShowsForEpisodeCache);
    const page = sorted.slice(args.offset, args.offset + args.batchSize);
    return {
      page,
      totalCount: sorted.length,
      isDone: args.offset + page.length >= sorted.length,
    };
  },
});

export const createEpisodeCacheJob = internalMutation({
  args: {
    requestedBy: v.optional(v.id("users")),
    targetShowCount: v.optional(v.number()),
    batchSize: v.optional(v.number()),
    totalShowCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const totalShowCount = args.totalShowCount ?? 0;
    const targetShowCount = Math.min(
      Math.max(args.targetShowCount ?? DEFAULT_TARGET_SHOW_COUNT, 1),
      totalShowCount || DEFAULT_TARGET_SHOW_COUNT,
    );

    return await ctx.db.insert("tmdbEpisodeCacheJobs", {
      kind: "season_cache",
      status: "queued",
      requestedBy: args.requestedBy,
      targetShowCount,
      batchSize: Math.max(1, Math.min(args.batchSize ?? DEFAULT_SHOWS_PER_BATCH, 10)),
      nextOffset: 0,
      processedShowCount: 0,
      cachedSeasonCount: 0,
      skippedSeasonCount: 0,
      failedShowCount: 0,
      totalShowCount: totalShowCount || undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getEpisodeCacheJob = internalQuery({
  args: { jobId: v.id("tmdbEpisodeCacheJobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

export const getLatestEpisodeCacheJob = internalQuery({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db
      .query("tmdbEpisodeCacheJobs")
      .withIndex("by_createdAt")
      .order("desc")
      .take(1);
    return jobs[0] ?? null;
  },
});

export const markEpisodeCacheJobRunning = internalMutation({
  args: { jobId: v.id("tmdbEpisodeCacheJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status === "completed" || job.status === "failed") {
      return job;
    }

    const now = Date.now();
    await ctx.db.patch(args.jobId, {
      status: "running",
      startedAt: job.startedAt ?? now,
      updatedAt: now,
    });
    return await ctx.db.get(args.jobId);
  },
});

export const advanceEpisodeCacheJob = internalMutation({
  args: {
    jobId: v.id("tmdbEpisodeCacheJobs"),
    nextOffset: v.number(),
    processedShowCount: v.number(),
    cachedSeasonCount: v.number(),
    skippedSeasonCount: v.number(),
    failedShowCount: v.number(),
    totalShowCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      nextOffset: args.nextOffset,
      processedShowCount: args.processedShowCount,
      cachedSeasonCount: args.cachedSeasonCount,
      skippedSeasonCount: args.skippedSeasonCount,
      failedShowCount: args.failedShowCount,
      totalShowCount: args.totalShowCount,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(args.jobId);
  },
});

export const completeEpisodeCacheJob = internalMutation({
  args: {
    jobId: v.id("tmdbEpisodeCacheJobs"),
    nextOffset: v.number(),
    processedShowCount: v.number(),
    cachedSeasonCount: v.number(),
    skippedSeasonCount: v.number(),
    failedShowCount: v.number(),
    totalShowCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.jobId, {
      status: "completed",
      nextOffset: args.nextOffset,
      processedShowCount: args.processedShowCount,
      cachedSeasonCount: args.cachedSeasonCount,
      skippedSeasonCount: args.skippedSeasonCount,
      failedShowCount: args.failedShowCount,
      totalShowCount: args.totalShowCount,
      completedAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(args.jobId);
  },
});

export const failEpisodeCacheJob = internalMutation({
  args: {
    jobId: v.id("tmdbEpisodeCacheJobs"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.jobId, {
      status: "failed",
      error: args.error,
      failedAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(args.jobId);
  },
});

async function listSeasonNumbersForShow(ctx: ActionCtx, show: ShowDoc) {
  const now = Date.now();
  const cachedDetails = await ctx.runQuery(internal.shows.getDetailsCache, {
    externalSource: "tmdb",
    externalId: show.externalId,
  });

  if (
    cachedDetails &&
    cachedDetails.expiresAt > now &&
    Array.isArray((cachedDetails.payload as any)?.seasons)
  ) {
    return ((cachedDetails.payload as any).seasons ?? [])
      .filter((season: any) => (season?.season_number ?? 0) > 0)
      .map((season: any) => season.season_number as number);
  }

  const response = await fetch(
    tmdbUrl(`/tv/${show.externalId}?api_key=${getTmdbApiKey()}&language=en-US`),
  );
  if (!response.ok) {
    throw new Error(`TMDB show details request failed: ${response.status}`);
  }

  const data = await response.json();
  return (data.seasons ?? [])
    .filter((season: any) => (season?.season_number ?? 0) > 0)
    .map((season: any) => season.season_number as number);
}

async function cacheEpisodesForShow(
  ctx: ActionCtx,
  show: ShowDoc,
) {
  const seasonNumbers = await listSeasonNumbersForShow(ctx, show);
  let cachedSeasonCount = 0;
  let skippedSeasonCount = 0;

  for (const seasonNumber of seasonNumbers) {
    const cacheExternalId = `${show.externalId}:season:${seasonNumber}`;
    const existing = await ctx.runQuery(internal.shows.getDetailsCache, {
      externalSource: "tmdb-season",
      externalId: cacheExternalId,
    });
    if (existing && existing.expiresAt > Date.now()) {
      skippedSeasonCount += 1;
      continue;
    }

    await ctx.runAction(internal.shows.getSeasonDetailsInternal, {
      externalId: show.externalId,
      seasonNumber,
    });
    cachedSeasonCount += 1;
  }

  return {
    cachedSeasonCount,
    skippedSeasonCount,
  };
}

async function runEpisodeCacheBatchInternal(ctx: ActionCtx, jobId: EpisodeCacheJobId) {
  const job = await ctx.runQuery(internal.tmdbEpisodes.getEpisodeCacheJob, {
    jobId,
  });
  if (!job || job.status === "completed" || job.status === "failed") {
    return job;
  }

  await ctx.runMutation(internal.tmdbEpisodes.markEpisodeCacheJobRunning, { jobId: job._id });

  const remaining = Math.max(0, job.targetShowCount - job.processedShowCount);
  if (remaining === 0) {
    return await ctx.runMutation(internal.tmdbEpisodes.completeEpisodeCacheJob, {
      jobId: job._id,
      nextOffset: job.nextOffset,
      processedShowCount: job.processedShowCount,
      cachedSeasonCount: job.cachedSeasonCount,
      skippedSeasonCount: job.skippedSeasonCount,
      failedShowCount: job.failedShowCount,
      totalShowCount: job.totalShowCount,
    });
  }

  const page = await ctx.runQuery(internal.tmdbEpisodes.listTopTmdbShowsForEpisodeCache, {
    offset: job.nextOffset,
    batchSize: Math.min(job.batchSize, remaining),
  }) as { page: ShowDoc[]; totalCount: number; isDone: boolean };

  if (page.page.length === 0) {
    return await ctx.runMutation(internal.tmdbEpisodes.completeEpisodeCacheJob, {
      jobId: job._id,
      nextOffset: job.nextOffset,
      processedShowCount: job.processedShowCount,
      cachedSeasonCount: job.cachedSeasonCount,
      skippedSeasonCount: job.skippedSeasonCount,
      failedShowCount: job.failedShowCount,
      totalShowCount: page.totalCount,
    });
  }

  let cachedSeasonCount = job.cachedSeasonCount;
  let skippedSeasonCount = job.skippedSeasonCount;
  let failedShowCount = job.failedShowCount;

  for (const show of page.page) {
    try {
      const result = await cacheEpisodesForShow(ctx, show);
      cachedSeasonCount += result.cachedSeasonCount;
      skippedSeasonCount += result.skippedSeasonCount;
    } catch {
      failedShowCount += 1;
    }
  }

  const processedShowCount = job.processedShowCount + page.page.length;
  const nextOffset = job.nextOffset + page.page.length;
  const isDone = page.isDone || processedShowCount >= job.targetShowCount;

  if (isDone) {
    return await ctx.runMutation(internal.tmdbEpisodes.completeEpisodeCacheJob, {
      jobId: job._id,
      nextOffset,
      processedShowCount,
      cachedSeasonCount,
      skippedSeasonCount,
      failedShowCount,
      totalShowCount: page.totalCount,
    });
  }

  const updatedJob = await ctx.runMutation(internal.tmdbEpisodes.advanceEpisodeCacheJob, {
    jobId: job._id,
    nextOffset,
    processedShowCount,
    cachedSeasonCount,
    skippedSeasonCount,
    failedShowCount,
    totalShowCount: page.totalCount,
  });

  await ctx.scheduler.runAfter(0, internal.tmdbEpisodes.runEpisodeCacheBatch, {
    jobId: job._id,
  });

  return updatedJob;
}

export const runEpisodeCacheBatch = internalAction({
  args: {
    jobId: v.id("tmdbEpisodeCacheJobs"),
  },
  handler: async (ctx, args) => {
    try {
      return await runEpisodeCacheBatchInternal(ctx, args.jobId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown episode cache backfill error";
      await ctx.runMutation(internal.tmdbEpisodes.failEpisodeCacheJob, {
        jobId: args.jobId,
        error: message,
      });
      throw error;
    }
  },
});

export const startEpisodeCacheBackfill = internalAction({
  args: {
    targetShowCount: v.optional(v.number()),
    batchSize: v.optional(v.number()),
    requestedBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    getTmdbApiKey();
    const { totalCount } = await ctx.runQuery(internal.tmdbEpisodes.listTopTmdbShowsForEpisodeCache, {
      offset: 0,
      batchSize: 1,
    }) as { totalCount: number };

    const jobId = await ctx.runMutation(internal.tmdbEpisodes.createEpisodeCacheJob, {
      requestedBy: args.requestedBy,
      targetShowCount: args.targetShowCount ?? totalCount,
      batchSize: args.batchSize,
      totalShowCount: totalCount,
    });

    await ctx.scheduler.runAfter(0, internal.tmdbEpisodes.runEpisodeCacheBatch, { jobId });

    return {
      jobId,
      status: "queued" as const,
      totalShowCount: totalCount,
    };
  },
});

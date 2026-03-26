import { internal } from "./_generated/api";
import { internalAction, internalMutation, mutation, type ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./utils";

const HOT_SHOW_TARGET_COUNT = 500;
const FULL_SHOW_TARGET_COUNT = 2_000;
const HOT_EPISODE_TARGET_COUNT = 250;
const FULL_EPISODE_TARGET_COUNT = 1_000;
const HOT_SHOW_FRESHNESS_MS = 24 * 60 * 60 * 1000;
const FULL_SHOW_FRESHNESS_MS = 14 * 24 * 60 * 60 * 1000;
const HOT_EPISODE_FRESHNESS_MS = 24 * 60 * 60 * 1000;
const FULL_EPISODE_FRESHNESS_MS = 14 * 24 * 60 * 60 * 1000;

async function maybeStartTopTvImport(ctx: ActionCtx, args: {
  targetCount: number;
  pagesPerBatch?: number;
  minFreshMs?: number;
}) {
  const latestJob = await ctx.runQuery(internal.tmdbImport.getLatestTopTvImportJob, {});
  if (latestJob && (latestJob.status === "queued" || latestJob.status === "running")) {
    return {
      started: false,
      reason: "tmdb import already active",
      jobId: latestJob._id,
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
      jobId: latestJob._id,
      status: latestJob.status,
    };
  }

  const started = await ctx.runAction(internal.tmdbImport.startTopTvImport, {
    targetCount: args.targetCount,
    pagesPerBatch: args.pagesPerBatch,
  });
  return {
    started: true,
    reason: "started",
    ...started,
  };
}

async function maybeStartEmbeddingBackfill(ctx: ActionCtx) {
  const [latestEmbeddingJob, latestImportJob, embeddingCount, showCount] = await Promise.all([
    ctx.runQuery(internal.embeddings.getLatestEmbeddingJob, {}),
    ctx.runQuery(internal.tmdbImport.getLatestTopTvImportJob, {}),
    ctx.runQuery(internal.embeddings.countEmbeddings, {}),
    ctx.runQuery(internal.embeddings.countTmdbShows, {}),
  ]);

  if (latestEmbeddingJob && (latestEmbeddingJob.status === "queued" || latestEmbeddingJob.status === "running")) {
    return {
      started: false,
      reason: "embedding backfill already active",
      jobId: latestEmbeddingJob._id,
      status: latestEmbeddingJob.status,
    };
  }

  const latestEmbeddingCompletedAt = latestEmbeddingJob?.completedAt ?? 0;
  const latestCatalogCompletedAt = latestImportJob?.completedAt ?? 0;
  if (
    latestEmbeddingJob?.status === "completed" &&
    latestEmbeddingCompletedAt >= latestCatalogCompletedAt &&
    embeddingCount >= showCount
  ) {
    return {
      started: false,
      reason: "embeddings already current",
      jobId: latestEmbeddingJob._id,
      status: latestEmbeddingJob.status,
    };
  }

  const started = await ctx.runAction(internal.embeddings.startEmbeddingBackfill, {});
  return {
    started: true,
    reason: "started",
    ...started,
  };
}

async function maybeStartEpisodeCacheBackfill(ctx: ActionCtx, args: {
  targetShowCount: number;
  batchSize?: number;
  minFreshMs?: number;
}) {
  const latestJob = await ctx.runQuery(internal.tmdbEpisodes.getLatestEpisodeCacheJob, {});
  if (latestJob && (latestJob.status === "queued" || latestJob.status === "running")) {
    return {
      started: false,
      reason: "episode cache job already active",
      jobId: latestJob._id,
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
      jobId: latestJob._id,
      status: latestJob.status,
    };
  }

  const started = await ctx.runAction(internal.tmdbEpisodes.startEpisodeCacheBackfill, {
    targetShowCount: args.targetShowCount,
    batchSize: args.batchSize,
  });
  return {
    started: true,
    reason: "started",
    ...started,
  };
}

export const cleanupRateLimits = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const expired = await ctx.db
      .query("rateLimits")
      .filter((q) => q.lte(q.field("resetAt"), now))
      .collect();
    await Promise.all(expired.map((item) => ctx.db.delete(item._id)));
    return { removed: expired.length };
  },
});

export const cleanupTmdbCache = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const [detailExpired, searchExpired, listExpired] = await Promise.all([
      ctx.db
        .query("tmdbDetailsCache")
        .filter((q) => q.lte(q.field("expiresAt"), now))
        .collect(),
      ctx.db
        .query("tmdbSearchCache")
        .filter((q) => q.lte(q.field("expiresAt"), now))
        .collect(),
      ctx.db
        .query("tmdbListCache")
        .filter((q) => q.lte(q.field("expiresAt"), now))
        .collect(),
    ]);
    await Promise.all([
      ...detailExpired.map((item) => ctx.db.delete(item._id)),
      ...searchExpired.map((item) => ctx.db.delete(item._id)),
      ...listExpired.map((item) => ctx.db.delete(item._id)),
    ]);
    return {
      removed:
        detailExpired.length + searchExpired.length + listExpired.length,
    };
  },
});

export const scheduleTopTvImport = internalAction({
  args: {
    targetCount: v.number(),
    pagesPerBatch: v.optional(v.number()),
    minFreshMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await maybeStartTopTvImport(ctx, args);
  },
});

export const scheduleEmbeddingRefresh = internalAction({
  args: {},
  handler: async (ctx) => {
    return await maybeStartEmbeddingBackfill(ctx);
  },
});

export const scheduleEpisodeCacheRefresh = internalAction({
  args: {
    targetShowCount: v.number(),
    batchSize: v.optional(v.number()),
    minFreshMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await maybeStartEpisodeCacheBackfill(ctx, args);
  },
});

export const scheduleHotShowCatalogRefresh = internalAction({
  args: {},
  handler: async (ctx) => {
    return await maybeStartTopTvImport(ctx, {
      targetCount: HOT_SHOW_TARGET_COUNT,
      pagesPerBatch: 3,
      minFreshMs: HOT_SHOW_FRESHNESS_MS,
    });
  },
});

export const scheduleFullShowCatalogRefresh = internalAction({
  args: {},
  handler: async (ctx) => {
    return await maybeStartTopTvImport(ctx, {
      targetCount: FULL_SHOW_TARGET_COUNT,
      pagesPerBatch: 5,
      minFreshMs: FULL_SHOW_FRESHNESS_MS,
    });
  },
});

export const scheduleHotEpisodeCacheRefresh = internalAction({
  args: {},
  handler: async (ctx) => {
    return await maybeStartEpisodeCacheBackfill(ctx, {
      targetShowCount: HOT_EPISODE_TARGET_COUNT,
      batchSize: 4,
      minFreshMs: HOT_EPISODE_FRESHNESS_MS,
    });
  },
});

export const scheduleFullEpisodeCacheRefresh = internalAction({
  args: {},
  handler: async (ctx) => {
    return await maybeStartEpisodeCacheBackfill(ctx, {
      targetShowCount: FULL_EPISODE_TARGET_COUNT,
      batchSize: 4,
      minFreshMs: FULL_EPISODE_FRESHNESS_MS,
    });
  },
});

export const scheduleHotCatalogMaintenance = internalAction({
  args: {},
  handler: async (ctx) => {
    const [shows, embeddings, episodes] = await Promise.all([
      maybeStartTopTvImport(ctx, {
        targetCount: HOT_SHOW_TARGET_COUNT,
        pagesPerBatch: 3,
        minFreshMs: HOT_SHOW_FRESHNESS_MS,
      }),
      maybeStartEmbeddingBackfill(ctx),
      maybeStartEpisodeCacheBackfill(ctx, {
        targetShowCount: HOT_EPISODE_TARGET_COUNT,
        batchSize: 4,
        minFreshMs: HOT_EPISODE_FRESHNESS_MS,
      }),
    ]);

    return { shows, embeddings, episodes };
  },
});

export const scheduleFullCatalogMaintenance = internalAction({
  args: {},
  handler: async (ctx) => {
    const [shows, embeddings, episodes] = await Promise.all([
      maybeStartTopTvImport(ctx, {
        targetCount: FULL_SHOW_TARGET_COUNT,
        pagesPerBatch: 5,
        minFreshMs: FULL_SHOW_FRESHNESS_MS,
      }),
      maybeStartEmbeddingBackfill(ctx),
      maybeStartEpisodeCacheBackfill(ctx, {
        targetShowCount: FULL_EPISODE_TARGET_COUNT,
        batchSize: 4,
        minFreshMs: FULL_EPISODE_FRESHNESS_MS,
      }),
    ]);

    return { shows, embeddings, episodes };
  },
});

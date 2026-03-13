import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { normalizeSearchText } from "./utils";

const DEFAULT_TARGET_COUNT = 10_000;
const TMDB_PAGE_SIZE = 20;
const TMDB_MAX_PAGE = 500;
const DEFAULT_PAGES_PER_BATCH = 10;

function tmdbUrl(path: string) {
  const base = process.env.TMDB_BASE_URL ?? "https://api.themoviedb.org/3";
  return `${base}${path}`;
}

function getTopTvDiscoverUrl(apiKey: string, page: number) {
  return tmdbUrl(
    `/discover/tv?api_key=${apiKey}` +
      `&language=en-US` +
      `&sort_by=popularity.desc` +
      `&include_adult=false` +
      `&include_null_first_air_dates=false` +
      `&page=${page}`,
  );
}

function mapTmdbShow(result: any) {
  const title = result.name ?? result.original_name ?? "Untitled";
  const originalTitle =
    result.original_name && result.original_name !== title
      ? result.original_name
      : undefined;

  return {
    externalSource: "tmdb" as const,
    externalId: String(result.id),
    title,
    originalTitle,
    year: result.first_air_date
      ? Number(String(result.first_air_date).slice(0, 4))
      : undefined,
    overview: result.overview ?? undefined,
    posterUrl: result.poster_path
      ? `https://image.tmdb.org/t/p/w500${result.poster_path}`
      : undefined,
    backdropUrl: result.backdrop_path
      ? `https://image.tmdb.org/t/p/w1280${result.backdrop_path}`
      : undefined,
    genreIds: Array.isArray(result.genre_ids) ? result.genre_ids : undefined,
    originalLanguage: result.original_language ?? undefined,
    originCountries: Array.isArray(result.origin_country)
      ? result.origin_country
      : undefined,
    tmdbPopularity:
      typeof result.popularity === "number" ? result.popularity : undefined,
    tmdbVoteAverage:
      typeof result.vote_average === "number" ? result.vote_average : undefined,
    tmdbVoteCount:
      typeof result.vote_count === "number" ? result.vote_count : undefined,
    searchText: normalizeSearchText(`${title} ${result.original_name ?? ""}`),
  };
}

const importShowValidator = v.object({
  externalSource: v.string(),
  externalId: v.string(),
  title: v.string(),
  originalTitle: v.optional(v.string()),
  year: v.optional(v.number()),
  overview: v.optional(v.string()),
  posterUrl: v.optional(v.string()),
  backdropUrl: v.optional(v.string()),
  genreIds: v.optional(v.array(v.number())),
  originalLanguage: v.optional(v.string()),
  originCountries: v.optional(v.array(v.string())),
  tmdbPopularity: v.optional(v.number()),
  tmdbVoteAverage: v.optional(v.number()),
  tmdbVoteCount: v.optional(v.number()),
  searchText: v.string(),
});

export const createTopTvImportJob = internalMutation({
  args: {
    requestedBy: v.optional(v.id("users")),
    targetCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("tmdbImportJobs", {
      kind: "top_tv",
      status: "queued",
      requestedBy: args.requestedBy,
      targetCount: Math.min(
        Math.max(args.targetCount ?? DEFAULT_TARGET_COUNT, 1),
        TMDB_PAGE_SIZE * TMDB_MAX_PAGE,
      ),
      pageSize: TMDB_PAGE_SIZE,
      maxPage: TMDB_MAX_PAGE,
      nextPage: 1,
      pagesProcessed: 0,
      showsProcessed: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getImportJob = internalQuery({
  args: { jobId: v.id("tmdbImportJobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

export const getLatestTopTvImportJob = internalQuery({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db
      .query("tmdbImportJobs")
      .withIndex("by_createdAt")
      .order("desc")
      .take(1);
    return jobs[0] ?? null;
  },
});

export const markJobRunning = internalMutation({
  args: { jobId: v.id("tmdbImportJobs") },
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

export const advanceImportJob = internalMutation({
  args: {
    jobId: v.id("tmdbImportJobs"),
    nextPage: v.number(),
    pagesProcessed: v.number(),
    showsProcessed: v.number(),
    totalPages: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      nextPage: args.nextPage,
      pagesProcessed: args.pagesProcessed,
      showsProcessed: args.showsProcessed,
      totalPages: args.totalPages,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(args.jobId);
  },
});

export const completeImportJob = internalMutation({
  args: {
    jobId: v.id("tmdbImportJobs"),
    nextPage: v.number(),
    pagesProcessed: v.number(),
    showsProcessed: v.number(),
    totalPages: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.jobId, {
      status: "completed",
      nextPage: args.nextPage,
      pagesProcessed: args.pagesProcessed,
      showsProcessed: args.showsProcessed,
      totalPages: args.totalPages,
      completedAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(args.jobId);
  },
});

export const failImportJob = internalMutation({
  args: {
    jobId: v.id("tmdbImportJobs"),
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

export const upsertTmdbShowsBatch = internalMutation({
  args: {
    shows: v.array(importShowValidator),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const show of args.shows) {
      const existing = await ctx.db
        .query("shows")
        .withIndex("by_external", (q) =>
          q.eq("externalSource", show.externalSource).eq("externalId", show.externalId),
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          title: show.title,
          originalTitle: show.originalTitle,
          year: show.year,
          overview: show.overview,
          posterUrl: show.posterUrl,
          backdropUrl: show.backdropUrl,
          genreIds: show.genreIds,
          originalLanguage: show.originalLanguage,
          originCountries: show.originCountries,
          tmdbPopularity: show.tmdbPopularity,
          tmdbVoteAverage: show.tmdbVoteAverage,
          tmdbVoteCount: show.tmdbVoteCount,
          searchText: show.searchText,
          updatedAt: now,
        });
        continue;
      }

      await ctx.db.insert("shows", {
        externalSource: show.externalSource,
        externalId: show.externalId,
        title: show.title,
        originalTitle: show.originalTitle,
        year: show.year,
        overview: show.overview,
        posterUrl: show.posterUrl,
        backdropUrl: show.backdropUrl,
        genreIds: show.genreIds,
        originalLanguage: show.originalLanguage,
        originCountries: show.originCountries,
        tmdbPopularity: show.tmdbPopularity,
        tmdbVoteAverage: show.tmdbVoteAverage,
        tmdbVoteCount: show.tmdbVoteCount,
        searchText: show.searchText,
        createdAt: now,
        updatedAt: now,
      });
    }

    return args.shows.length;
  },
});

export const countTmdbShows = internalQuery({
  args: {},
  handler: async (ctx) => {
    const shows = await ctx.db
      .query("shows")
      .withIndex("by_external", (q) => q.eq("externalSource", "tmdb"))
      .collect();
    return shows.length;
  },
});

export const runTopTvImportBatch = internalAction({
  args: {
    jobId: v.id("tmdbImportJobs"),
    pagesPerBatch: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.tmdbImport.getImportJob, {
      jobId: args.jobId,
    });
    if (!job || job.status === "completed" || job.status === "failed") {
      return job;
    }

    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
      throw new Error("Missing TMDB_API_KEY env var");
    }

    await ctx.runMutation(internal.tmdbImport.markJobRunning, {
      jobId: args.jobId,
    });

    const pagesPerBatch = Math.max(args.pagesPerBatch ?? DEFAULT_PAGES_PER_BATCH, 1);
    const targetPage = Math.min(
      job.maxPage + 1,
      job.nextPage +
        Math.min(
          pagesPerBatch,
          Math.ceil((job.targetCount - job.showsProcessed) / job.pageSize),
        ),
    );

    let nextPage = job.nextPage;
    let pagesProcessed = job.pagesProcessed;
    let showsProcessed = job.showsProcessed;
    let totalPages = job.totalPages ?? job.maxPage;

    try {
      while (nextPage < targetPage && showsProcessed < job.targetCount) {
        const response = await fetch(getTopTvDiscoverUrl(apiKey, nextPage));
        if (!response.ok) {
          throw new Error(`TMDB top TV import failed on page ${nextPage}: ${response.status}`);
        }

        const data = await response.json();
        totalPages = Math.min(
          job.maxPage,
          typeof data.total_pages === "number" ? data.total_pages : totalPages,
        );

        const remaining = job.targetCount - showsProcessed;
        const shows = (data.results ?? [])
          .slice(0, remaining)
          .map(mapTmdbShow);

        if (shows.length === 0) {
          break;
        }

        await ctx.runMutation(internal.tmdbImport.upsertTmdbShowsBatch, {
          shows,
        });

        showsProcessed += shows.length;
        pagesProcessed += 1;
        nextPage += 1;

        if (nextPage > totalPages) {
          break;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown TMDB import error";
      await ctx.runMutation(internal.tmdbImport.failImportJob, {
        jobId: args.jobId,
        error: message,
      });
      throw error;
    }

    const completed =
      showsProcessed >= job.targetCount || nextPage > totalPages || nextPage > job.maxPage;

    if (completed) {
      return await ctx.runMutation(internal.tmdbImport.completeImportJob, {
        jobId: args.jobId,
        nextPage,
        pagesProcessed,
        showsProcessed,
        totalPages,
      });
    }

    const updatedJob = await ctx.runMutation(internal.tmdbImport.advanceImportJob, {
      jobId: args.jobId,
      nextPage,
      pagesProcessed,
      showsProcessed,
      totalPages,
    });

    await ctx.scheduler.runAfter(0, internal.tmdbImport.runTopTvImportBatch, {
      jobId: args.jobId,
      pagesPerBatch,
    });

    return updatedJob;
  },
});

export const startTopTvImport = internalAction({
  args: {
    targetCount: v.optional(v.number()),
    pagesPerBatch: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const jobId = await ctx.runMutation(internal.tmdbImport.createTopTvImportJob, {
      targetCount: args.targetCount,
    });

    await ctx.scheduler.runAfter(0, internal.tmdbImport.runTopTvImportBatch, {
      jobId,
      pagesPerBatch: args.pagesPerBatch,
    });

    return {
      jobId,
      status: "queued" as const,
    };
  },
});

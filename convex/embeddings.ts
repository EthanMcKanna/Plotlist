import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, query, type ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  buildRecommendationSignalFingerprint,
  buildShowEmbeddingText,
  cosineSimilarity,
  fnv1aHash,
  mapGenreIdsToNames,
  mergeHybridCandidates,
  overlapRatio,
  weightedCentroid,
} from "./embeddingUtils";

const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-2-preview";
const EMBEDDING_VERSION = process.env.GEMINI_EMBEDDING_VERSION ?? "shows-v1";
const EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_BATCH_SIZE = 20;
const GEMINI_API_BASE = process.env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com/v1beta";
const USER_TASTE_CACHE_LIMIT = 20;
const USER_TASTE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const SMART_LIST_LIMIT = 12;

type ShowDoc = Doc<"shows">;
type ShowEmbeddingDoc = Doc<"showEmbeddings">;
type UserDoc = Doc<"users">;
type UserTastePreferenceDoc = Doc<"userTastePreferences">;
type UserTasteProfileDoc = Doc<"userTasteProfiles">;
type VectorSearchResult = { _id: Id<"showEmbeddings">; _score: number };
type UserVectorSearchResult = { _id: Id<"userTasteProfiles">; _score: number };
type SharedFavoriteShow = {
  showId: Id<"shows">;
  title: string;
  year?: number;
  posterUrl?: string;
};
type TasteMatchDetails = {
  percent: number;
  sharedFavoriteShows: SharedFavoriteShow[];
};
type RecommendationResult = {
  showId: Id<"shows">;
  title: string;
  year?: number;
  posterUrl?: string;
  overview?: string;
  reason: string;
  score: number;
};
type RecommendationRail = {
  key: string;
  title: string;
  description?: string;
  items: RecommendationResult[];
};
type SmartListCuration = {
  boostGenreIds?: number[];
  requiredKeywordGroups?: string[][];
  keywordBoostTerms?: string[];
};
type SmartListConfig = {
  key: string;
  title: string;
  description: string;
  theme: string;
  tmdbSeedIds: string[];
  curation?: SmartListCuration;
};
type PublicSearchResult = {
  _id?: Id<"shows">;
  coverageScore?: number;
  externalSource: string;
  externalId: string;
  intentScore?: number;
  title: string;
  year?: number;
  overview?: string;
  posterUrl?: string;
  matchLabel?: string;
  lexicalScore?: number;
  semanticScore?: number;
  popularity?: number;
  exactTitleMatch?: boolean;
  prefixTitleMatch?: boolean;
};

function getGeminiApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY env var");
  }
  return apiKey;
}

function getModelResourceName() {
  return EMBEDDING_MODEL.startsWith("models/")
    ? EMBEDDING_MODEL
    : `models/${EMBEDDING_MODEL}`;
}

function getModelActionPath() {
  return getModelResourceName().replace(/^models\//, "");
}

function buildThemeKey(theme?: string) {
  const normalized = (theme ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized || "__default__";
}

function humanizeTheme(theme?: string) {
  const key = buildThemeKey(theme);
  if (key === "__default__") {
    return "your taste";
  }
  return key
    .split(" ")
    .filter(Boolean)
    .map((token) => token[0].toUpperCase() + token.slice(1))
    .join(" ");
}

function normalizeTokenForMatch(token: string) {
  if (token.length <= 3) {
    return token;
  }

  if (token.endsWith("ies") && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.endsWith("es") && token.length > 4) {
    return token.slice(0, -2);
  }
  if (token.endsWith("s") && token.length > 4) {
    return token.slice(0, -1);
  }

  return token;
}

function toTastePercent(score: number) {
  return Math.max(1, Math.min(99, Math.round(score * 100)));
}

function buildSharedFavoriteShows(args: {
  sourceFavoriteShowIds: Id<"shows">[];
  candidateFavoriteShows: Array<{
    _id: Id<"shows">;
    title: string;
    posterUrl?: string | null;
    year?: number;
  }>;
  limit?: number;
}): SharedFavoriteShow[] {
  const sourceSet = new Set(args.sourceFavoriteShowIds);
  return args.candidateFavoriteShows
    .filter((show) => sourceSet.has(show._id))
    .slice(0, args.limit ?? 3)
    .map((show) => ({
      showId: show._id,
      title: show.title,
      year: show.year ?? undefined,
      posterUrl: show.posterUrl ?? undefined,
    }));
}

function tokenMatches(left: string, right: string) {
  const normalizedLeft = normalizeTokenForMatch(left);
  const normalizedRight = normalizeTokenForMatch(right);

  if (normalizedLeft === normalizedRight) {
    return true;
  }
  if (normalizedLeft.length >= 4 && normalizedRight.startsWith(normalizedLeft)) {
    return true;
  }
  if (normalizedRight.length >= 4 && normalizedLeft.startsWith(normalizedRight)) {
    return true;
  }
  return false;
}

function tokenCoverage(tokens: string[], queryTokens: string[]) {
  if (!queryTokens.length) {
    return 0;
  }

  let matched = 0;
  for (const queryToken of queryTokens) {
    if (tokens.some((token) => tokenMatches(token, queryToken))) {
      matched += 1;
    }
  }

  return matched / queryTokens.length;
}

function normalizeFreeformText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SEARCH_GENRE_HINTS: Array<{ genreId: number; tokens: string[] }> = [
  { genreId: 35, tokens: ["funny", "comedy", "comedic", "humorous", "witty", "comfort", "cozy"] },
  { genreId: 9648, tokens: ["mystery", "mysterious", "detective", "sleuth", "whodunit", "investigation", "secret"] },
  { genreId: 80, tokens: ["crime", "criminal", "cartel", "gang", "gangster", "mafia", "heist", "noir"] },
  { genreId: 10765, tokens: ["sci fi", "scifi", "science fiction", "dystopia", "dystopian", "futuristic", "mind bending"] },
  { genreId: 10751, tokens: ["family", "parents", "wholesome", "kid friendly"] },
  { genreId: 18, tokens: ["drama", "dramatic", "emotional", "prestige", "dialogue", "character"] },
];

function extractIntentGenreIds(text: string) {
  const normalized = normalizeFreeformText(text);
  const intentGenreIds = new Set<number>();

  for (const hint of SEARCH_GENRE_HINTS) {
    if (hint.tokens.some((token) => normalized.includes(token))) {
      intentGenreIds.add(hint.genreId);
    }
  }

  return Array.from(intentGenreIds);
}

function buildShowCurationText(show: ShowDoc) {
  return normalizeFreeformText([
    show.title,
    show.originalTitle,
    mapGenreIdsToNames(show.genreIds).join(" "),
    show.overview,
  ].filter(Boolean).join(" "));
}

function countMatchedTerms(text: string, terms?: string[]) {
  if (!terms?.length) {
    return 0;
  }

  return terms.filter((term) => text.includes(normalizeFreeformText(term))).length;
}

function matchesKeywordGroup(text: string, terms: string[]) {
  return terms.some((term) => text.includes(normalizeFreeformText(term)));
}

function buildEmbeddingTextHash(show: ShowDoc) {
  return fnv1aHash(buildShowEmbeddingText(show));
}

async function batchEmbedTexts(args: {
  taskType: "SEMANTIC_SIMILARITY" | "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";
  texts: Array<{ text: string; title?: string }>;
}) {
  const apiKey = getGeminiApiKey();
  const response = await fetch(
    `${GEMINI_API_BASE}/models/${getModelActionPath()}:batchEmbedContents?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: args.texts.map((item) => ({
          model: getModelResourceName(),
          content: {
            parts: [{ text: item.text }],
          },
          taskType: args.taskType,
          outputDimensionality: EMBEDDING_DIMENSIONS,
          ...(args.taskType === "RETRIEVAL_DOCUMENT" && item.title
            ? { title: item.title }
            : {}),
        })),
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini embedding request failed: ${response.status}`);
  }

  const data = await response.json();
  const embeddings = (data.embeddings ?? []).map((item: any) => item.values as number[]);
  if (embeddings.length !== args.texts.length) {
    throw new Error("Gemini embedding response length mismatch");
  }

  return embeddings;
}

function toSearchResult(show: ShowDoc, extras?: Record<string, unknown>) {
  return {
    _id: show._id,
    externalSource: show.externalSource,
    externalId: show.externalId,
    title: show.title,
    year: show.year,
    overview: show.overview,
    posterUrl: show.posterUrl,
    ...extras,
  } as PublicSearchResult;
}

export const getEmbeddingByShowId = internalQuery({
  args: {
    showId: v.id("shows"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("showEmbeddings")
      .withIndex("by_showId", (q) => q.eq("showId", args.showId))
      .unique();
  },
});

export const getEmbeddingsByShowIds = internalQuery({
  args: {
    showIds: v.array(v.id("shows")),
  },
  handler: async (ctx, args) => {
    const rows = await Promise.all(
      args.showIds.map((showId) =>
        ctx.db
          .query("showEmbeddings")
          .withIndex("by_showId", (q) => q.eq("showId", showId))
          .unique(),
      ),
    );

    return rows.filter((row): row is NonNullable<typeof row> => Boolean(row));
  },
});

export const getEmbeddingsByIds = internalQuery({
  args: {
    embeddingIds: v.array(v.id("showEmbeddings")),
  },
  handler: async (ctx, args) => {
    const rows = await Promise.all(args.embeddingIds.map((embeddingId) => ctx.db.get(embeddingId)));
    return rows.filter((row): row is NonNullable<typeof row> => Boolean(row));
  },
});

export const getShowsByIds = internalQuery({
  args: {
    showIds: v.array(v.id("shows")),
  },
  handler: async (ctx, args) => {
    const shows = await Promise.all(args.showIds.map((showId) => ctx.db.get(showId)));
    return shows.filter((show): show is NonNullable<typeof show> => Boolean(show));
  },
});

export const getLexicalSearchResults = internalQuery({
  args: {
    text: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const normalized = args.text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) {
      return [];
    }

    return await ctx.db
      .query("shows")
      .withSearchIndex("search_shows", (q) =>
        q.search("searchText", normalized).eq("externalSource", "tmdb"),
      )
      .take(Math.min(args.limit ?? 12, 24));
  },
});

export const listTmdbShowsForEmbedding = internalQuery({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("shows")
      .withIndex("by_external", (q) => q.eq("externalSource", "tmdb"))
      .paginate({
        cursor: args.cursor ?? null,
        numItems: Math.min(args.batchSize ?? EMBEDDING_BATCH_SIZE, EMBEDDING_BATCH_SIZE),
      });
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

export const getLatestEmbeddingJob = internalQuery({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db
      .query("showEmbeddingJobs")
      .withIndex("by_createdAt")
      .order("desc")
      .take(1);
    return jobs[0] ?? null;
  },
});

export const getEmbeddingJob = internalQuery({
  args: {
    jobId: v.id("showEmbeddingJobs"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

export const getUserTasteSignals = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const [watchStates, reviews] = await Promise.all([
      ctx.db
        .query("watchStates")
        .withIndex("by_user_updatedAt", (q) => q.eq("userId", args.userId))
        .order("desc")
        .take(250),
      ctx.db
        .query("reviews")
        .withIndex("by_author_createdAt", (q) => q.eq("authorId", args.userId))
        .order("desc")
        .take(200),
    ]);

    return { watchStates, reviews };
  },
});

export const getUserTastePreferences = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userTastePreferences")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

export const getUserTasteProfile = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userTasteProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

export const getUserTasteProfilesByIds = internalQuery({
  args: {
    profileIds: v.array(v.id("userTasteProfiles")),
  },
  handler: async (ctx, args) => {
    const rows = await Promise.all(args.profileIds.map((profileId) => ctx.db.get(profileId)));
    return rows.filter((row): row is NonNullable<typeof row> => Boolean(row));
  },
});

export const getUsersByIds = internalQuery({
  args: {
    userIds: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const users = await Promise.all(args.userIds.map((userId) => ctx.db.get(userId)));
    return users.filter((user): user is NonNullable<typeof user> => Boolean(user));
  },
});

export const upsertUserTastePreferences = internalMutation({
  args: {
    userId: v.id("users"),
    favoriteShowIds: v.array(v.id("shows")),
    favoriteThemes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userTastePreferences")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    const now = Date.now();
    const payload = {
      userId: args.userId,
      favoriteShowIds: args.favoriteShowIds,
      favoriteThemes: args.favoriteThemes,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return await ctx.db.get(existing._id);
    }

    const preferenceId = await ctx.db.insert("userTastePreferences", {
      ...payload,
      createdAt: now,
    });
    return await ctx.db.get(preferenceId);
  },
});

export const upsertUserTasteProfile = internalMutation({
  args: {
    userId: v.id("users"),
    signalFingerprint: v.string(),
    favoriteShowIds: v.array(v.id("shows")),
    favoriteThemes: v.array(v.string()),
    positiveShowIds: v.array(v.id("shows")),
    negativeShowIds: v.array(v.id("shows")),
    similarityEmbedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userTasteProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    const now = Date.now();
    const payload = {
      userId: args.userId,
      embeddingVersion: EMBEDDING_VERSION,
      signalFingerprint: args.signalFingerprint,
      favoriteShowIds: args.favoriteShowIds,
      favoriteThemes: args.favoriteThemes,
      positiveShowIds: args.positiveShowIds,
      negativeShowIds: args.negativeShowIds,
      similarityEmbedding: args.similarityEmbedding,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return await ctx.db.get(existing._id);
    }

    const profileId = await ctx.db.insert("userTasteProfiles", {
      ...payload,
      createdAt: now,
    });
    return await ctx.db.get(profileId);
  },
});

export const getUserTasteCache = internalQuery({
  args: {
    userId: v.id("users"),
    themeKey: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userTasteCaches")
      .withIndex("by_user_theme", (q) =>
        q.eq("userId", args.userId).eq("themeKey", args.themeKey),
      )
      .unique();
  },
});

export const upsertUserTasteCache = internalMutation({
  args: {
    userId: v.id("users"),
    themeKey: v.string(),
    signalFingerprint: v.string(),
    recommendations: v.array(
      v.object({
        showId: v.id("shows"),
        title: v.string(),
        year: v.optional(v.number()),
        posterUrl: v.optional(v.string()),
        overview: v.optional(v.string()),
        reason: v.string(),
        score: v.number(),
      }),
    ),
    positiveShowIds: v.array(v.id("shows")),
    negativeShowIds: v.array(v.id("shows")),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userTasteCaches")
      .withIndex("by_user_theme", (q) =>
        q.eq("userId", args.userId).eq("themeKey", args.themeKey),
      )
      .unique();
    const now = Date.now();
    const payload = {
      userId: args.userId,
      themeKey: args.themeKey,
      embeddingVersion: EMBEDDING_VERSION,
      signalFingerprint: args.signalFingerprint,
      recommendations: args.recommendations,
      positiveShowIds: args.positiveShowIds,
      negativeShowIds: args.negativeShowIds,
      expiresAt: args.expiresAt,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return await ctx.db.get(existing._id);
    }

    const cacheId = await ctx.db.insert("userTasteCaches", {
      ...payload,
      createdAt: now,
    });
    return await ctx.db.get(cacheId);
  },
});

export const clearUserTasteCaches = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const caches = await ctx.db
      .query("userTasteCaches")
      .withIndex("by_user_updatedAt", (q) => q.eq("userId", args.userId))
      .collect();
    await Promise.all(caches.map((cache) => ctx.db.delete(cache._id)));
    return caches.length;
  },
});

export const clearUserTasteArtifacts = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const [caches, profile] = await Promise.all([
      ctx.db
        .query("userTasteCaches")
        .withIndex("by_user_updatedAt", (q) => q.eq("userId", args.userId))
        .collect(),
      ctx.db
        .query("userTasteProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .unique(),
    ]);

    await Promise.all([
      ...caches.map((cache) => ctx.db.delete(cache._id)),
      ...(profile ? [ctx.db.delete(profile._id)] : []),
    ]);

    return {
      cacheCount: caches.length,
      profileCleared: Boolean(profile),
    };
  },
});

export const createEmbeddingJob = internalMutation({
  args: {
    totalCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("showEmbeddingJobs", {
      kind: "show_catalog",
      status: "queued",
      embeddingVersion: EMBEDDING_VERSION,
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      batchSize: EMBEDDING_BATCH_SIZE,
      processedCount: 0,
      embeddedCount: 0,
      skippedCount: 0,
      totalCount: args.totalCount,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const markEmbeddingJobRunning = internalMutation({
  args: {
    jobId: v.id("showEmbeddingJobs"),
  },
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

export const advanceEmbeddingJob = internalMutation({
  args: {
    jobId: v.id("showEmbeddingJobs"),
    nextCursor: v.optional(v.string()),
    processedCount: v.number(),
    embeddedCount: v.number(),
    skippedCount: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      nextCursor: args.nextCursor,
      processedCount: args.processedCount,
      embeddedCount: args.embeddedCount,
      skippedCount: args.skippedCount,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(args.jobId);
  },
});

export const setEmbeddingJobBatchSize = internalMutation({
  args: {
    jobId: v.id("showEmbeddingJobs"),
    batchSize: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      batchSize: Math.max(1, Math.min(args.batchSize, EMBEDDING_BATCH_SIZE)),
      updatedAt: Date.now(),
    });
    return await ctx.db.get(args.jobId);
  },
});

export const completeEmbeddingJob = internalMutation({
  args: {
    jobId: v.id("showEmbeddingJobs"),
    processedCount: v.number(),
    embeddedCount: v.number(),
    skippedCount: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.jobId, {
      status: "completed",
      processedCount: args.processedCount,
      embeddedCount: args.embeddedCount,
      skippedCount: args.skippedCount,
      completedAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(args.jobId);
  },
});

export const failEmbeddingJob = internalMutation({
  args: {
    jobId: v.id("showEmbeddingJobs"),
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

export const upsertShowEmbeddingsBatch = internalMutation({
  args: {
    rows: v.array(
      v.object({
        showId: v.id("shows"),
        externalSource: v.string(),
        externalId: v.string(),
        inputText: v.string(),
        inputHash: v.string(),
        similarityEmbedding: v.array(v.float64()),
        retrievalEmbedding: v.array(v.float64()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const row of args.rows) {
      const existing = await ctx.db
        .query("showEmbeddings")
        .withIndex("by_showId", (q) => q.eq("showId", row.showId))
        .unique();

      const payload = {
        showId: row.showId,
        externalSource: row.externalSource,
        externalId: row.externalId,
        embeddingVersion: EMBEDDING_VERSION,
        model: EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
        inputText: row.inputText,
        inputHash: row.inputHash,
        similarityEmbedding: row.similarityEmbedding,
        retrievalEmbedding: row.retrievalEmbedding,
        updatedAt: now,
      };

      if (existing) {
        await ctx.db.patch(existing._id, payload);
      } else {
        await ctx.db.insert("showEmbeddings", payload);
      }
    }

    return args.rows.length;
  },
});

export const ensureShowEmbedding = internalAction({
  args: {
    showId: v.id("shows"),
  },
  handler: async (ctx, args) => {
    const show = await ctx.runQuery(api.shows.get, { showId: args.showId }) as ShowDoc | null;
    if (!show) {
      throw new Error("Show not found");
    }

    const existing = await ctx.runQuery(internal.embeddings.getEmbeddingByShowId, {
      showId: args.showId,
    });
    const inputText = buildShowEmbeddingText(show);
    const inputHash = fnv1aHash(inputText);

    if (
      existing &&
      existing.embeddingVersion === EMBEDDING_VERSION &&
      existing.inputHash === inputHash &&
      existing.dimensions === EMBEDDING_DIMENSIONS
    ) {
      return existing;
    }

    const [similarityEmbedding, retrievalEmbedding] = await Promise.all([
      batchEmbedTexts({
        taskType: "SEMANTIC_SIMILARITY",
        texts: [{ text: inputText }],
      }).then((embeddings) => embeddings[0]),
      batchEmbedTexts({
        taskType: "RETRIEVAL_DOCUMENT",
        texts: [{ text: inputText, title: show.title }],
      }).then((embeddings) => embeddings[0]),
    ]);

    await ctx.runMutation(internal.embeddings.upsertShowEmbeddingsBatch, {
      rows: [
        {
          showId: show._id,
          externalSource: show.externalSource,
          externalId: show.externalId,
          inputText,
          inputHash,
          similarityEmbedding,
          retrievalEmbedding,
        },
      ],
    });

    return await ctx.runQuery(internal.embeddings.getEmbeddingByShowId, {
      showId: args.showId,
    });
  },
});

export const runEmbeddingBackfillBatch = internalAction({
  args: {
    jobId: v.id("showEmbeddingJobs"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.embeddings.getEmbeddingJob, { jobId: args.jobId });
    if (!job || job.status === "completed" || job.status === "failed") {
      return job;
    }

    await ctx.runMutation(internal.embeddings.markEmbeddingJobRunning, { jobId: args.jobId });

    try {
      const page = await ctx.runQuery(internal.embeddings.listTmdbShowsForEmbedding, {
        cursor: job.nextCursor,
        batchSize: job.batchSize,
      }) as { page: ShowDoc[]; continueCursor: string; isDone: boolean };

      if (page.page.length === 0) {
        return await ctx.runMutation(internal.embeddings.completeEmbeddingJob, {
          jobId: args.jobId,
          processedCount: job.processedCount,
          embeddedCount: job.embeddedCount,
          skippedCount: job.skippedCount,
        });
      }

      const existingEmbeddings = await ctx.runQuery(internal.embeddings.getEmbeddingsByShowIds, {
        showIds: page.page.map((show) => show._id),
      }) as ShowEmbeddingDoc[];
      const existingByShowId = new Map(existingEmbeddings.map((row) => [row.showId, row]));
      const staleShows = page.page.filter((show) => {
        const existing = existingByShowId.get(show._id);
        return !existing ||
          existing.embeddingVersion !== EMBEDDING_VERSION ||
          existing.dimensions !== EMBEDDING_DIMENSIONS ||
          existing.inputHash !== buildEmbeddingTextHash(show);
      });

      let embeddedCount = 0;
      if (staleShows.length > 0) {
        const similarityEmbeddings = await batchEmbedTexts({
          taskType: "SEMANTIC_SIMILARITY",
          texts: staleShows.map((show) => ({ text: buildShowEmbeddingText(show) })),
        });
        const retrievalEmbeddings = await batchEmbedTexts({
          taskType: "RETRIEVAL_DOCUMENT",
          texts: staleShows.map((show) => ({
            text: buildShowEmbeddingText(show),
            title: show.title,
          })),
        });

        await ctx.runMutation(internal.embeddings.upsertShowEmbeddingsBatch, {
          rows: staleShows.map((show, index) => ({
            showId: show._id,
            externalSource: show.externalSource,
            externalId: show.externalId,
            inputText: buildShowEmbeddingText(show),
            inputHash: fnv1aHash(buildShowEmbeddingText(show)),
            similarityEmbedding: similarityEmbeddings[index],
            retrievalEmbedding: retrievalEmbeddings[index],
          })),
        });
        embeddedCount = staleShows.length;
      }

      const processedCount = job.processedCount + page.page.length;
      const skippedCount = job.skippedCount + (page.page.length - embeddedCount);
      const nextCursor = page.isDone ? undefined : page.continueCursor;

      if (page.isDone) {
        return await ctx.runMutation(internal.embeddings.completeEmbeddingJob, {
          jobId: args.jobId,
          processedCount,
          embeddedCount: job.embeddedCount + embeddedCount,
          skippedCount,
        });
      }

      const updatedJob = await ctx.runMutation(internal.embeddings.advanceEmbeddingJob, {
        jobId: args.jobId,
        nextCursor,
        processedCount,
        embeddedCount: job.embeddedCount + embeddedCount,
        skippedCount,
      });

      await ctx.scheduler.runAfter(0, internal.embeddings.runEmbeddingBackfillBatch, {
        jobId: args.jobId,
      });

      return updatedJob;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown embedding backfill error";
      await ctx.runMutation(internal.embeddings.failEmbeddingJob, {
        jobId: args.jobId,
        error: message,
      });
      throw error;
    }
  },
});

export const startEmbeddingBackfill = internalAction({
  args: {},
  handler: async (ctx) => {
    getGeminiApiKey();
    const totalCount = await ctx.runQuery(internal.embeddings.countTmdbShows, {});
    const jobId = await ctx.runMutation(internal.embeddings.createEmbeddingJob, {
      totalCount,
    });

    await ctx.scheduler.runAfter(0, internal.embeddings.runEmbeddingBackfillBatch, {
      jobId,
    });

    return { jobId, status: "queued" as const };
  },
});

export const countEmbeddings = internalQuery({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db
      .query("showEmbeddingJobs")
      .withIndex("by_createdAt")
      .order("desc")
      .take(1);
    const latestJob = jobs[0];
    return latestJob?.embeddedCount ?? 0;
  },
});

export const searchShows = action({
  args: {
    text: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const query = args.text.trim();
    if (!query) {
      return [];
    }

    const limit = Math.min(args.limit ?? 12, 20);
    const userId = await getAuthUserId(ctx);
    if (userId) {
      await ctx.runMutation(internal.rateLimit.enforce, {
        key: `semantic-show-search:${userId}`,
        limit: 40,
        windowMs: 60_000,
      });
    }

    const likeMatch = query.match(/^shows?\s+like\s+(.+?)(?:\s+but\s+(.+))?$/i);
    if (likeMatch) {
      const seedQuery = likeMatch[1]?.trim();
      const modifier = likeMatch[2]?.trim();
      if (seedQuery) {
        const seedCandidates = await ctx.runQuery(api.shows.search, {
          text: seedQuery,
          limit: 5,
        }) as ShowDoc[];
        const normalizedSeedQuery = normalizeFreeformText(seedQuery);
        const seedShow = seedCandidates.find((show) =>
          normalizeFreeformText(show.title) === normalizedSeedQuery,
        ) ?? seedCandidates[0];

        if (seedShow) {
          const recommendations = await buildRecommendationCandidates({
            ctx,
            positiveShowIds: [seedShow._id],
            negativeShowIds: [],
            excludedShowIds: new Set([seedShow._id]),
            theme: modifier ? `${seedShow.title}, but ${modifier}` : undefined,
            limit,
          });

          return recommendations.map((item) => ({
            ...toSearchResult(item.show, {
              matchLabel: modifier
                ? `Like ${seedShow.title}, but ${modifier}`
                : `Like ${seedShow.title}`,
              semanticScore: item.score,
              popularity: item.show.tmdbPopularity,
            }),
          }));
        }
      }
    }

    const normalizedQuery = normalizeFreeformText(query);
    const queryTokens = normalizedQuery.split(" ").filter(Boolean);
    const isDescriptiveQuery = queryTokens.length >= 4;
    const intentGenreIds = extractIntentGenreIds(query);
    const lexicalResults = await ctx.runQuery(internal.embeddings.getLexicalSearchResults, {
      text: query,
      limit: Math.max(limit, 10),
    }) as ShowDoc[];

    const scored = new Map<string, PublicSearchResult>();

    lexicalResults.forEach((show, index) => {
      const normalizedTitle = show.title
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const normalizedDocument = `${show.title} ${show.overview ?? ""}`
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const exactTitleMatch = normalizedTitle === normalizedQuery;
      const prefixTitleMatch =
        !exactTitleMatch &&
        normalizedTitle.startsWith(normalizedQuery) &&
        normalizedQuery.length >= 3;
      const titleTokens = normalizedTitle.split(" ").filter(Boolean);
      const documentTokens = normalizedDocument.split(" ").filter(Boolean);
      const sharedTokens = titleTokens.filter((token) =>
        queryTokens.some((queryToken) => tokenMatches(token, queryToken)),
      ).length;
      const documentCoverage = tokenCoverage(documentTokens, queryTokens);
      const intentScore = overlapRatio(show.genreIds, intentGenreIds);
      const tokenOverlap = queryTokens.length ? sharedTokens / queryTokens.length : 0;
      const lexicalBaseScore = Math.max(0.25, 1 - index * 0.08);
      const lexicalScore = isDescriptiveQuery && !exactTitleMatch && !prefixTitleMatch
        ? lexicalBaseScore * Math.max(tokenOverlap, 0.08)
        : lexicalBaseScore;

      scored.set(String(show._id), {
        ...toSearchResult(show, { matchLabel: exactTitleMatch ? "Exact match" : "Close match" }),
        coverageScore: documentCoverage,
        intentScore,
        lexicalScore,
        popularity: show.tmdbPopularity,
        exactTitleMatch,
        prefixTitleMatch,
      });
    });

    try {
      const [queryEmbedding] = await batchEmbedTexts({
        taskType: "RETRIEVAL_QUERY",
        texts: [{ text: query }],
      });
      const semanticResults = await ctx.vectorSearch("showEmbeddings", "by_retrieval_embedding", {
        vector: queryEmbedding,
        limit: Math.min(limit * 3, 40),
        filter: (q) => q.eq("embeddingVersion", EMBEDDING_VERSION),
      }) as VectorSearchResult[];

      const embeddingRows = await ctx.runQuery(internal.embeddings.getEmbeddingsByIds, {
        embeddingIds: semanticResults.map((result) => result._id),
      }) as ShowEmbeddingDoc[];
      const embeddingById = new Map(embeddingRows.map((row) => [row._id, row]));
      const candidateShows = await ctx.runQuery(internal.embeddings.getShowsByIds, {
        showIds: embeddingRows.map((row) => row.showId),
      }) as ShowDoc[];
      const showById = new Map(candidateShows.map((show) => [show._id, show]));

      for (const result of semanticResults) {
        const embedding = embeddingById.get(result._id);
        const show = embedding ? showById.get(embedding.showId) : null;
        if (!show) {
          continue;
        }

        const normalizedDocument = `${show.title} ${show.overview ?? ""}`
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[^a-z0-9\s]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const documentTokens = normalizedDocument.split(" ").filter(Boolean);
        const coverageScore = tokenCoverage(documentTokens, queryTokens);
        const intentScore = overlapRatio(show.genreIds, intentGenreIds);

        const existing = scored.get(String(show._id));
        scored.set(String(show._id), {
          ...(existing ?? toSearchResult(show, { matchLabel: "Vibe match" })),
          coverageScore: Math.max(existing?.coverageScore ?? 0, coverageScore),
          intentScore: Math.max(existing?.intentScore ?? 0, intentScore),
          lexicalScore: existing?.lexicalScore,
          semanticScore: result._score,
          popularity: show.tmdbPopularity,
          exactTitleMatch: existing?.exactTitleMatch ?? false,
          prefixTitleMatch: existing?.prefixTitleMatch ?? false,
          matchLabel: existing?.matchLabel ?? "Vibe match",
        });
      }
    } catch {
      // Fall back to lexical results when embeddings are unavailable.
    }

    const hybridResults = mergeHybridCandidates(
      Array.from(scored.values()).map((item) => ({
        id: String(item._id ?? `${item.externalSource}:${item.externalId}`),
        coverageScore: item.coverageScore,
        intentScore: item.intentScore,
        lexicalScore: item.lexicalScore,
        semanticScore: item.semanticScore,
        popularity: item.popularity,
        exactTitleMatch: item.exactTitleMatch,
        prefixTitleMatch: item.prefixTitleMatch,
      })),
      limit,
    )
      .map((item) => scored.get(item.id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    if (hybridResults.length >= limit) {
      return hybridResults;
    }

    const tmdbApiKey = process.env.TMDB_API_KEY;
    if (!tmdbApiKey) {
      return hybridResults;
    }

    const fallbackResponse = await fetch(
      `https://api.themoviedb.org/3/search/tv?api_key=${tmdbApiKey}&language=en-US&query=${encodeURIComponent(query)}`,
    );
    if (!fallbackResponse.ok) {
      return hybridResults;
    }

    const fallbackJson = await fallbackResponse.json();
    for (const result of (fallbackJson.results ?? []) as any[]) {
      if (hybridResults.length >= limit) {
        break;
      }
      const externalId = String(result.id);
      const duplicate = hybridResults.some((item) => item.externalId === externalId);
      if (duplicate) {
        continue;
      }

      hybridResults.push({
        externalSource: "tmdb",
        externalId,
        title: result.name ?? result.original_name ?? "Untitled",
        year: result.first_air_date
          ? Number(String(result.first_air_date).slice(0, 4))
          : undefined,
        overview: result.overview ?? undefined,
        posterUrl: result.poster_path
          ? `https://image.tmdb.org/t/p/w500${result.poster_path}`
          : undefined,
        matchLabel: "Catalog result",
      });
    }

    return hybridResults;
  },
});

export const getSimilarShows = action({
  args: {
    showId: v.id("shows"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const show = await ctx.runQuery(api.shows.get, { showId: args.showId }) as ShowDoc | null;
    if (!show) {
      return [];
    }

    let seedEmbedding = await ctx.runQuery(internal.embeddings.getEmbeddingByShowId, {
      showId: args.showId,
    });
    if (!seedEmbedding) {
      seedEmbedding = await ctx.runAction(internal.embeddings.ensureShowEmbedding, {
        showId: args.showId,
      });
    }
    if (!seedEmbedding) {
      return [];
    }

    const limit = Math.min(args.limit ?? 10, 20);
    const results = await ctx.vectorSearch("showEmbeddings", "by_similarity_embedding", {
      vector: seedEmbedding.similarityEmbedding,
      limit: Math.min(limit * 4, 48),
      filter: (q) => q.eq("embeddingVersion", EMBEDDING_VERSION),
    }) as VectorSearchResult[];

    const embeddings = await ctx.runQuery(internal.embeddings.getEmbeddingsByIds, {
      embeddingIds: results.map((result) => result._id),
    }) as ShowEmbeddingDoc[];
    const embeddingById = new Map(embeddings.map((embedding) => [embedding._id, embedding]));
    const shows = await ctx.runQuery(internal.embeddings.getShowsByIds, {
      showIds: embeddings.map((embedding) => embedding.showId),
    }) as ShowDoc[];
    const showById = new Map(shows.map((item) => [item._id, item]));

    return results
      .map((result) => {
        const embedding = embeddingById.get(result._id);
        const candidate = embedding ? showById.get(embedding.showId) : null;
        if (!candidate || candidate._id === show._id) {
          return null;
        }

        const genreBonus = overlapRatio(show.genreIds, candidate.genreIds) * 0.12;
        const ratingBonus = Math.min((candidate.tmdbVoteAverage ?? 0) / 100, 0.08);

        return {
          _score: result._score + genreBonus + ratingBonus,
          sharedGenres: mapGenreIdsToNames(candidate.genreIds)
            .filter((genre) => mapGenreIdsToNames(show.genreIds).includes(genre))
            .slice(0, 2),
          show: candidate,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((left, right) => right._score - left._score)
      .slice(0, limit)
      .map((item) => ({
        showId: item.show._id,
        title: item.show.title,
        year: item.show.year,
        posterUrl: item.show.posterUrl,
        overview: item.show.overview,
        sharedGenres: item.sharedGenres,
        score: item._score,
      }));
  },
});

function buildTasteWeights(args: {
  watchStates: Array<Doc<"watchStates">>;
  reviews: Array<Doc<"reviews">>;
  favoriteShowIds?: Id<"shows">[];
}) {
  const weights = new Map<Id<"shows">, number>();

  const addWeight = (showId: Id<"shows">, weight: number) => {
    weights.set(showId, (weights.get(showId) ?? 0) + weight);
  };

  for (const state of args.watchStates) {
    switch (state.status) {
      case "completed":
        addWeight(state.showId, 1.15);
        break;
      case "watching":
        addWeight(state.showId, 0.9);
        break;
      case "watchlist":
        addWeight(state.showId, 0.4);
        break;
      case "dropped":
        addWeight(state.showId, -1.25);
        break;
      default:
        break;
    }
  }

  for (const review of args.reviews) {
    addWeight(review.showId, (review.rating - 2.5) / 1.6);
  }

  for (const showId of args.favoriteShowIds ?? []) {
    addWeight(showId, 1.75);
  }

  return weights;
}

function buildTasteSignalFingerprint(args: {
  watchStates: Array<Doc<"watchStates">>;
  reviews: Array<Doc<"reviews">>;
  themeKey: string;
  favoriteShowIds?: Id<"shows">[];
  favoriteThemes?: string[];
}) {
  return buildRecommendationSignalFingerprint({
    embeddingVersion: EMBEDDING_VERSION,
    themeKey: args.themeKey,
    watchSignals: [
      ...args.watchStates.map((state) =>
      `${state.showId}:${state.status}:${state.updatedAt}`,
      ),
      ...(args.favoriteShowIds ?? []).map((showId) => `favorite:${showId}`),
    ],
    reviewSignals: [
      ...args.reviews.map((review) =>
      `${review.showId}:${review.rating}:${review.createdAt}:${review.updatedAt ?? 0}`,
      ),
      ...(args.favoriteThemes ?? []).map((theme) => `theme:${buildThemeKey(theme)}`),
    ],
  });
}

function combineThemes(themes: string[]) {
  const uniqueThemes = Array.from(
    new Set(
      themes
        .map((theme) => theme.trim())
        .filter(Boolean),
    ),
  );
  return uniqueThemes.join(". ");
}

function dedupeShowIds(showIds: Id<"shows">[]) {
  return Array.from(new Set(showIds));
}

function toRecommendationResults(
  recommendations: Array<{ show: ShowDoc; score: number; reason: string }>,
): RecommendationResult[] {
  return recommendations.map((item) => ({
    showId: item.show._id,
    title: item.show.title,
    year: item.show.year,
    posterUrl: item.show.posterUrl,
    overview: item.show.overview,
    reason: item.reason,
    score: item.score,
  }));
}

async function ensureShowEmbeddingsForIds(ctx: ActionCtx, showIds: Id<"shows">[]) {
  const uniqueShowIds = dedupeShowIds(showIds);
  if (uniqueShowIds.length === 0) {
    return [];
  }

  const existingEmbeddings = await ctx.runQuery(internal.embeddings.getEmbeddingsByShowIds, {
    showIds: uniqueShowIds,
  }) as ShowEmbeddingDoc[];
  const existingShowIds = new Set(existingEmbeddings.map((embedding) => embedding.showId));
  const missingShowIds = uniqueShowIds.filter((showId) => !existingShowIds.has(showId));

  if (missingShowIds.length > 0) {
    await Promise.all(
      missingShowIds.map((showId) =>
        ctx.runAction(internal.embeddings.ensureShowEmbedding, { showId }),
      ),
    );
  }

  return await ctx.runQuery(internal.embeddings.getEmbeddingsByShowIds, {
    showIds: uniqueShowIds,
  }) as ShowEmbeddingDoc[];
}

async function buildRecommendationCandidates(args: {
  ctx: ActionCtx;
  positiveShowIds: Id<"shows">[];
  negativeShowIds: Id<"shows">[];
  excludedShowIds: Set<Id<"shows">>;
  theme?: string;
  limit: number;
}): Promise<Array<{ show: ShowDoc; score: number; reason: string }>> {
  const [positiveEmbeddings, negativeEmbeddings] = await Promise.all([
    ensureShowEmbeddingsForIds(args.ctx, args.positiveShowIds),
    ensureShowEmbeddingsForIds(args.ctx, args.negativeShowIds),
  ]);
  const positiveShows = await args.ctx.runQuery(internal.embeddings.getShowsByIds, {
    showIds: args.positiveShowIds,
  }) as ShowDoc[];

  const positiveCentroid = weightedCentroid(
    positiveEmbeddings.map((embedding) => ({
      vector: embedding.similarityEmbedding,
      weight: 1,
    })),
  );
  const negativeCentroid = weightedCentroid(
    negativeEmbeddings.map((embedding) => ({
      vector: embedding.similarityEmbedding,
      weight: 1,
    })),
  );

  const scored = new Map<Id<"shows">, { score: number; reason: string }>();

  if (positiveCentroid) {
    const similar = await args.ctx.vectorSearch("showEmbeddings", "by_similarity_embedding", {
      vector: positiveCentroid,
      limit: Math.min(args.limit * 5, 80),
      filter: (q) => q.eq("embeddingVersion", EMBEDDING_VERSION),
    }) as VectorSearchResult[];
    const rows = await args.ctx.runQuery(internal.embeddings.getEmbeddingsByIds, {
      embeddingIds: similar.map((item) => item._id),
    }) as ShowEmbeddingDoc[];
    for (const item of rows) {
      if (args.excludedShowIds.has(item.showId)) {
        continue;
      }
      const existing = scored.get(item.showId);
      const penalty = negativeCentroid
        ? Math.max(0, cosineSimilarity(item.similarityEmbedding, negativeCentroid)) * 0.3
        : 0;
      const baseScore =
        (similar.find((result) => result._id === item._id)?._score ?? 0) - penalty;
      scored.set(item.showId, {
        score: Math.max(existing?.score ?? 0, baseScore),
        reason: existing?.reason ?? "Based on shows you liked",
      });
    }
  }

  if (args.theme?.trim()) {
    const [themeEmbedding] = await batchEmbedTexts({
      taskType: "RETRIEVAL_QUERY",
      texts: [{ text: args.theme.trim() }],
    });
    const themed = await args.ctx.vectorSearch("showEmbeddings", "by_retrieval_embedding", {
      vector: themeEmbedding,
      limit: Math.min(args.limit * 4, 60),
      filter: (q) => q.eq("embeddingVersion", EMBEDDING_VERSION),
    }) as VectorSearchResult[];
    const rows = await args.ctx.runQuery(internal.embeddings.getEmbeddingsByIds, {
      embeddingIds: themed.map((item) => item._id),
    }) as ShowEmbeddingDoc[];
    for (const item of rows) {
      if (args.excludedShowIds.has(item.showId)) {
        continue;
      }
      const existing = scored.get(item.showId);
      const themeScore =
        (themed.find((result) => result._id === item._id)?._score ?? 0) * 0.7;
      scored.set(item.showId, {
        score: Math.max(existing?.score ?? 0, (existing?.score ?? 0) + themeScore),
        reason: existing?.reason ?? "Matched to your theme",
      });
    }
  }

  const candidateShows = await args.ctx.runQuery(internal.embeddings.getShowsByIds, {
    showIds: Array.from(scored.keys()),
  }) as ShowDoc[];

  return candidateShows
    .map((show) => ({
      show,
      score:
        (scored.get(show._id)?.score ?? 0) +
        Math.max(
          0,
          ...positiveShows.map((seedShow) => overlapRatio(show.genreIds, seedShow.genreIds) * 0.14),
        ) +
        Math.min((show.tmdbVoteAverage ?? 0) / 100, 0.07),
      reason: scored.get(show._id)?.reason ?? "Recommended for you",
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, args.limit);
}

async function getUserTasteState(args: {
  ctx: ActionCtx;
  userId: Id<"users">;
  theme?: string;
}) {
  const [signals, preferences] = await Promise.all([
    args.ctx.runQuery(internal.embeddings.getUserTasteSignals, {
      userId: args.userId,
    }),
    args.ctx.runQuery(internal.embeddings.getUserTastePreferences, {
      userId: args.userId,
    }),
  ]) as [
    { watchStates: Array<Doc<"watchStates">>; reviews: Array<Doc<"reviews">> },
    UserTastePreferenceDoc | null,
  ];

  const favoriteShowIds = dedupeShowIds(preferences?.favoriteShowIds ?? []);
  const favoriteThemes = Array.from(
    new Set((preferences?.favoriteThemes ?? []).map((theme) => theme.trim()).filter(Boolean)),
  );
  const effectiveTheme = combineThemes([
    ...favoriteThemes,
    ...(args.theme?.trim() ? [args.theme.trim()] : []),
  ]);
  const themeKey = buildThemeKey(effectiveTheme);
  const signalFingerprint = buildTasteSignalFingerprint({
    watchStates: signals.watchStates,
    reviews: signals.reviews,
    themeKey,
    favoriteShowIds,
    favoriteThemes,
  });
  const weights = buildTasteWeights({
    watchStates: signals.watchStates,
    reviews: signals.reviews,
    favoriteShowIds,
  });
  const positiveShowIds = dedupeShowIds(
    Array.from(weights.entries())
      .filter(([, weight]) => weight > 0.25)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 25)
      .map(([showId]) => showId),
  );
  const negativeShowIds = dedupeShowIds(
    Array.from(weights.entries())
      .filter(([, weight]) => weight < -0.25)
      .slice(0, 10)
      .map(([showId]) => showId),
  );
  const excludedShowIds = new Set<Id<"shows">>([
    ...signals.watchStates.map((state) => state.showId),
    ...signals.reviews.map((review) => review.showId),
  ]);

  return {
    signals,
    preferences,
    favoriteShowIds,
    favoriteThemes,
    effectiveTheme,
    themeKey,
    signalFingerprint,
    positiveShowIds,
    negativeShowIds,
    excludedShowIds,
  };
}

async function ensureUserTasteProfileInternal(ctx: ActionCtx, userId: Id<"users">) {
  const tasteState = await getUserTasteState({ ctx, userId });
  const existing = await ctx.runQuery(internal.embeddings.getUserTasteProfile, { userId });

  if (
    existing &&
    existing.embeddingVersion === EMBEDDING_VERSION &&
    existing.signalFingerprint === tasteState.signalFingerprint
  ) {
    return existing;
  }

  if (tasteState.positiveShowIds.length === 0 && tasteState.favoriteThemes.length === 0) {
    return null;
  }

  const positiveEmbeddings = await ensureShowEmbeddingsForIds(ctx, tasteState.positiveShowIds);
  const similarityVectors = positiveEmbeddings.map((embedding) => ({
    vector: embedding.similarityEmbedding,
    weight: 1,
  }));

  if (tasteState.favoriteThemes.length > 0) {
    const themeEmbeddings = await batchEmbedTexts({
      taskType: "SEMANTIC_SIMILARITY",
      texts: tasteState.favoriteThemes.map((theme) => ({ text: theme })),
    });
    themeEmbeddings.forEach((vector: number[]) => {
      similarityVectors.push({ vector, weight: 0.75 });
    });
  }

  const similarityEmbedding = weightedCentroid(similarityVectors);
  if (!similarityEmbedding) {
    return null;
  }

  await ctx.runMutation(internal.embeddings.upsertUserTasteProfile, {
    userId,
    signalFingerprint: tasteState.signalFingerprint,
    favoriteShowIds: tasteState.favoriteShowIds,
    favoriteThemes: tasteState.favoriteThemes,
    positiveShowIds: tasteState.positiveShowIds,
    negativeShowIds: tasteState.negativeShowIds,
    similarityEmbedding,
  });

  return await ctx.runQuery(internal.embeddings.getUserTasteProfile, { userId });
}

async function getCachedPersonalizedRecommendations(args: {
  ctx: ActionCtx;
  userId: Id<"users">;
  limit: number;
  theme?: string;
}) {
  const tasteState = await getUserTasteState({
    ctx: args.ctx,
    userId: args.userId,
    theme: args.theme,
  });

  if (tasteState.positiveShowIds.length === 0 && !tasteState.effectiveTheme) {
    return [];
  }

  const cache = await args.ctx.runQuery(internal.embeddings.getUserTasteCache, {
    userId: args.userId,
    themeKey: tasteState.themeKey,
  });
  if (
    cache &&
    cache.embeddingVersion === EMBEDDING_VERSION &&
    cache.signalFingerprint === tasteState.signalFingerprint &&
    cache.expiresAt > Date.now()
  ) {
    return cache.recommendations.slice(0, args.limit);
  }

  const recommendations = await buildRecommendationCandidates({
    ctx: args.ctx,
    positiveShowIds: tasteState.positiveShowIds,
    negativeShowIds: tasteState.negativeShowIds,
    excludedShowIds: tasteState.excludedShowIds,
    theme: tasteState.effectiveTheme,
    limit: USER_TASTE_CACHE_LIMIT,
  });
  const results = toRecommendationResults(recommendations);

  await args.ctx.runMutation(internal.embeddings.upsertUserTasteCache, {
    userId: args.userId,
    themeKey: tasteState.themeKey,
    signalFingerprint: tasteState.signalFingerprint,
    recommendations: results,
    positiveShowIds: tasteState.positiveShowIds,
    negativeShowIds: tasteState.negativeShowIds,
    expiresAt: Date.now() + USER_TASTE_CACHE_TTL_MS,
  });

  return results.slice(0, args.limit);
}

async function buildRecommendationRail(args: {
  ctx: ActionCtx;
  key: string;
  title: string;
  description?: string;
  positiveShowIds: Id<"shows">[];
  excludedShowIds?: Set<Id<"shows">>;
  theme?: string;
  limit?: number;
}) {
  const items = toRecommendationResults(
    await buildRecommendationCandidates({
      ctx: args.ctx,
      positiveShowIds: dedupeShowIds(args.positiveShowIds),
      negativeShowIds: [],
      excludedShowIds: args.excludedShowIds ?? new Set<Id<"shows">>(),
      theme: args.theme,
      limit: Math.min(args.limit ?? 10, 12),
    }),
  );

  if (items.length === 0) {
    return null;
  }

  return {
    key: args.key,
    title: args.title,
    description: args.description,
    items,
  } satisfies RecommendationRail;
}

function rerankCuratedRecommendations(
  recommendations: Array<{ show: ShowDoc; score: number; reason: string }>,
  curation?: SmartListCuration,
) {
  if (!curation) {
    return recommendations;
  }

  return recommendations
    .map((item) => {
      const text = buildShowCurationText(item.show);
      if (
        curation.requiredKeywordGroups?.some((group) => !matchesKeywordGroup(text, group))
      ) {
        return null;
      }

      const keywordBoost = countMatchedTerms(text, curation.keywordBoostTerms) * 0.05;
      const genreBoost = overlapRatio(item.show.genreIds, curation.boostGenreIds) * 0.18;

      return {
        ...item,
        score: item.score + keywordBoost + genreBoost,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => right.score - left.score);
}

async function getTasteMatchCandidates(args: {
  ctx: ActionCtx;
  sourceUserId: Id<"users">;
  viewerId: Id<"users">;
  limit: number;
}) {
  const profile = await ensureUserTasteProfileInternal(args.ctx, args.sourceUserId);
  if (!profile) {
    return [];
  }

  const results = await args.ctx.vectorSearch("userTasteProfiles", "by_similarity_embedding", {
    vector: profile.similarityEmbedding,
    limit: Math.min(args.limit * 4, 40),
    filter: (q) => q.eq("embeddingVersion", EMBEDDING_VERSION),
  }) as UserVectorSearchResult[];

  const profiles = await args.ctx.runQuery(internal.embeddings.getUserTasteProfilesByIds, {
    profileIds: results.map((result) => result._id),
  }) as UserTasteProfileDoc[];
  const scoreByProfileId = new Map(results.map((result) => [result._id, result._score]));
  const filteredProfiles = profiles.filter((candidate) => candidate.userId !== args.sourceUserId);
  const users = await args.ctx.runQuery(internal.embeddings.getUsersByIds, {
    userIds: filteredProfiles.map((candidate) => candidate.userId),
  }) as UserDoc[];
  const userById = new Map(users.map((user) => [user._id, user]));
  const previews = await args.ctx.runQuery(internal.people.buildPreviewsByUserIds, {
    viewerId: args.viewerId,
    candidateIds: filteredProfiles.map((candidate) => candidate.userId),
  }) as Array<any>;
  const previewByUserId = new Map(previews.map((preview: any) => [preview.user._id, preview]));
  const visibleFavoriteRows = await args.ctx.runQuery(
    (internal as any).users.getVisibleFavoriteShowsByUserIds,
    {
      viewerId: args.viewerId,
      userIds: filteredProfiles.map((candidate) => candidate.userId),
    },
  ) as Array<{
    userId: Id<"users">;
    favoriteShows: Array<{
      _id: Id<"shows">;
      title: string;
      posterUrl?: string | null;
      year?: number;
    }>;
  }>;
  const visibleFavoritesByUserId = new Map(
    visibleFavoriteRows.map((row) => [row.userId, row.favoriteShows]),
  );

  return filteredProfiles
    .map((candidate) => {
      const preview = previewByUserId.get(candidate.userId);
      const user = userById.get(candidate.userId);
      if (!preview || !user) {
        return null;
      }

      const score = scoreByProfileId.get(candidate._id) ?? 0;
      const taste = {
        percent: toTastePercent(score),
        sharedFavoriteShows: buildSharedFavoriteShows({
          sourceFavoriteShowIds: profile.favoriteShowIds,
          candidateFavoriteShows: visibleFavoritesByUserId.get(candidate.userId) ?? [],
          limit: 3,
        }),
      } satisfies TasteMatchDetails;
      const sharedTitles = taste.sharedFavoriteShows
        .map((show) => show.title)
        .slice(0, 2);

      return {
        ...preview,
        subtitle: sharedTitles.length > 0
          ? `${taste.percent}% taste match · Both like ${sharedTitles.join(" + ")}`
          : `${taste.percent}% taste match`,
        tasteMatch: score,
        taste,
        favoriteThemes: candidate.favoriteThemes,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .slice(0, args.limit);
}

async function resolveTmdbSeedShowId(ctx: ActionCtx, externalId: string) {
  const show = await ctx.runQuery(internal.shows.getByExternalInternal, {
    externalSource: "tmdb",
    externalId,
  }) as ShowDoc | null;
  return show?._id ?? null;
}

const SMART_LIST_CONFIGS: SmartListConfig[] = [
  {
    key: "workplace_thrillers",
    title: "Best Workplace Thrillers",
    description: "Corporate secrets, pressure, and creeping dread.",
    theme: "workplace thriller with corporate secrets, psychological tension, and smart suspense",
    tmdbSeedIds: ["95396", "80335", "81349", "62560"],
    curation: {
      boostGenreIds: [18, 9648, 80],
      keywordBoostTerms: [
        "office",
        "corporate",
        "company",
        "employer",
        "employee",
        "firm",
        "bank",
        "startup",
        "prosecuting attorney",
        "auditor",
        "technology company",
        "caseworker",
        "division",
        "surveillance",
        "conspiracy",
        "mystery",
        "secret",
      ],
    },
  },
  {
    key: "comfort_watches",
    title: "Comfort Watches",
    description: "Warm, funny, easy-to-fall-into series.",
    theme: "comfort comedy drama with lovable characters, emotional warmth, and low stress",
    tmdbSeedIds: [],
  },
  {
    key: "short_prestige_dramas",
    title: "Short Prestige Dramas",
    description: "High-quality, tightly written, easy to finish.",
    theme: "prestige drama with short seasons, excellent writing, and critical acclaim",
    tmdbSeedIds: [],
  },
  {
    key: "good_with_parents",
    title: "Good With Parents",
    description: "Accessible, compelling shows with broad appeal.",
    theme: "accessible drama or mystery with broad appeal, strong storytelling, and not too graphic",
    tmdbSeedIds: [],
  },
  {
    key: "after_breaking_bad",
    title: "Shows to Binge After Breaking Bad",
    description: "Crime stories with pressure, consequence, and moral collapse.",
    theme: "crime drama with moral collapse, cartel pressure, and escalating consequences",
    tmdbSeedIds: ["1396", "60059"],
  },
];

export const getViewerTastePreferences = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { favoriteShowIds: [], favoriteThemes: [] };
    }

    const preferences = await ctx.runQuery(internal.embeddings.getUserTastePreferences, { userId });
    return {
      favoriteShowIds: preferences?.favoriteShowIds ?? [],
      favoriteThemes: preferences?.favoriteThemes ?? [],
    };
  },
});

export const saveViewerTastePreferences = action({
  args: {
    favoriteShowIds: v.array(v.id("shows")),
    favoriteThemes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const favoriteShowIds = dedupeShowIds(args.favoriteShowIds).slice(0, 5);
    const favoriteThemes = Array.from(
      new Set(
        args.favoriteThemes
          .map((theme) => theme.trim().slice(0, 48))
          .filter(Boolean),
      ),
    ).slice(0, 5);

    await ctx.runMutation(internal.embeddings.upsertUserTastePreferences, {
      userId,
      favoriteShowIds,
      favoriteThemes,
    });
    await ctx.runMutation(internal.embeddings.clearUserTasteArtifacts, { userId });
    await ensureShowEmbeddingsForIds(ctx, favoriteShowIds);
    await ensureUserTasteProfileInternal(ctx, userId);
    const preview = await getCachedPersonalizedRecommendations({
      ctx,
      userId,
      limit: 12,
    });

    return {
      favoriteShowIds,
      favoriteThemes,
      preview,
    };
  },
});

export const getPersonalizedRecommendations = action({
  args: {
    limit: v.optional(v.number()),
    theme: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    return await getCachedPersonalizedRecommendations({
      ctx,
      userId,
      limit: Math.min(args.limit ?? 12, 20),
      theme: args.theme,
    });
  },
});

export const previewPersonalizedRecommendationsForUser = internalAction({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
    theme: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await getCachedPersonalizedRecommendations({
      ctx,
      userId: args.userId,
      limit: Math.min(args.limit ?? 12, 20),
      theme: args.theme,
    });
  },
});

export const ensureUserTasteProfile = internalAction({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ensureUserTasteProfileInternal(ctx, args.userId);
  },
});

export const getSimilarTasteUsers = action({
  args: {
    userId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewerId = await getAuthUserId(ctx);
    const sourceUserId = args.userId ?? viewerId;
    if (!viewerId || !sourceUserId) {
      throw new Error("Not authenticated");
    }

    return await getTasteMatchCandidates({
      ctx,
      sourceUserId,
      viewerId,
      limit: Math.min(args.limit ?? 6, 10),
    });
  },
});

export const getHomeRecommendationRails = action({
  args: {
    limitPerRail: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const tasteState = await getUserTasteState({ ctx, userId });
    const seedShows = await ctx.runQuery(internal.embeddings.getShowsByIds, {
      showIds: tasteState.positiveShowIds.slice(0, 3),
    }) as ShowDoc[];
    const rails: RecommendationRail[] = [];
    const limitPerRail = Math.min(args.limitPerRail ?? 10, 12);

    if (seedShows[0]) {
      const rail = await buildRecommendationRail({
        ctx,
        key: `because_${seedShows[0]._id}`,
        title: `Because you liked ${seedShows[0].title}`,
        description: "Shows with a similar feel and style.",
        positiveShowIds: [seedShows[0]._id],
        excludedShowIds: new Set([seedShows[0]._id]),
        limit: limitPerRail,
      });
      if (rail) rails.push(rail);
    }

    if (seedShows[0] && seedShows[1]) {
      const pairIds = [seedShows[0]._id, seedShows[1]._id];
      const rail = await buildRecommendationRail({
        ctx,
        key: `because_pair_${seedShows[0]._id}_${seedShows[1]._id}`,
        title: `Because you liked ${seedShows[0].title} and ${seedShows[1].title}`,
        description: "A blend of both worlds.",
        positiveShowIds: pairIds,
        excludedShowIds: new Set(pairIds),
        limit: limitPerRail,
      });
      if (rail) rails.push(rail);
    }

    if (tasteState.favoriteThemes[0]) {
      const theme = tasteState.favoriteThemes[0];
      const rail = await buildRecommendationRail({
        ctx,
        key: `theme_${buildThemeKey(theme)}`,
        title: `More ${humanizeTheme(theme)}`,
        description: "Based on the vibes you gravitate toward.",
        positiveShowIds: tasteState.positiveShowIds.slice(0, 2),
        excludedShowIds: tasteState.excludedShowIds,
        theme,
        limit: limitPerRail,
      });
      if (rail) rails.push(rail);
    }

    return rails;
  },
});

export const getShowRecommendationRails = action({
  args: {
    showId: v.id("shows"),
    limitPerRail: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const show = await ctx.runQuery(api.shows.get, { showId: args.showId }) as ShowDoc | null;
    if (!show) {
      return [];
    }

    const viewerId = await getAuthUserId(ctx);
    const limitPerRail = Math.min(args.limitPerRail ?? 10, 12);
    const rails: RecommendationRail[] = [];

    const primaryRail = await buildRecommendationRail({
      ctx,
      key: `show_${args.showId}`,
      title: `Because you liked ${show.title}`,
      description: "Shows with a similar feel and style.",
      positiveShowIds: [args.showId],
      excludedShowIds: new Set([args.showId]),
      limit: limitPerRail,
    });
    if (primaryRail) rails.push(primaryRail);

    if (viewerId) {
      const tasteState = await getUserTasteState({ ctx, userId: viewerId });
      const secondarySeed = tasteState.positiveShowIds.find((showId) => showId !== args.showId);
      if (secondarySeed) {
        const [secondaryShow] = await ctx.runQuery(internal.embeddings.getShowsByIds, {
          showIds: [secondarySeed],
        }) as ShowDoc[];
        if (secondaryShow) {
          const rail = await buildRecommendationRail({
            ctx,
            key: `show_pair_${args.showId}_${secondarySeed}`,
            title: `Because you liked ${show.title} and ${secondaryShow.title}`,
            description: "A blend of both worlds.",
            positiveShowIds: [args.showId, secondarySeed],
            excludedShowIds: new Set([args.showId, secondarySeed]),
            limit: limitPerRail,
          });
          if (rail) rails.push(rail);
        }
      }

      if (tasteState.favoriteThemes[0]) {
        const theme = tasteState.favoriteThemes[0];
        const rail = await buildRecommendationRail({
          ctx,
          key: `show_theme_${buildThemeKey(theme)}`,
          title: `More ${humanizeTheme(theme)}`,
          description: `Similar to ${show.title}, leaning into that vibe.`,
          positiveShowIds: [args.showId],
          excludedShowIds: new Set([args.showId]),
          theme,
          limit: limitPerRail,
        });
        if (rail) rails.push(rail);
      }
    }

    return rails;
  },
});

export const getSmartLists = action({
  args: {
    limitPerList: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limitPerList = Math.min(args.limitPerList ?? SMART_LIST_LIMIT, 12);
    const rails: RecommendationRail[] = [];

    for (const config of SMART_LIST_CONFIGS) {
      const seedIds = (await Promise.all(
        config.tmdbSeedIds.map((externalId) => resolveTmdbSeedShowId(ctx, externalId)),
      )).filter((showId): showId is Id<"shows"> => Boolean(showId));

      const recommendations = rerankCuratedRecommendations(
        await buildRecommendationCandidates({
          ctx,
          positiveShowIds: seedIds,
          negativeShowIds: [],
          excludedShowIds: new Set(seedIds),
          theme: config.theme,
          limit: Math.max(limitPerList * 3, 18),
        }),
        config.curation,
      );
      const items = toRecommendationResults(recommendations.slice(0, limitPerList));
      if (items.length > 0) {
        rails.push({
          key: config.key,
          title: config.title,
          description: config.description,
          items,
        });
      }
    }

    return rails;
  },
});

export const getListsFromSimilarTasteUsers = action({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewerId = await getAuthUserId(ctx);
    if (!viewerId) {
      throw new Error("Not authenticated");
    }

    const similarUsers = await getTasteMatchCandidates({
      ctx,
      sourceUserId: viewerId,
      viewerId,
      limit: 5,
    });
    const lists = await ctx.runQuery(internal.lists.listPublicByOwnerIds, {
      ownerIds: similarUsers.map((user) => user.user._id),
      limit: Math.min(args.limit ?? 6, 10),
      limitPerOwner: 2,
    }) as Array<Doc<"lists">>;
    const owners = await ctx.runQuery(internal.embeddings.getUsersByIds, {
      userIds: Array.from(new Set(lists.map((list) => list.ownerId))),
    }) as UserDoc[];
    const ownerById = new Map(owners.map((owner) => [owner._id, owner]));

    return lists.map((list) => {
      const owner = ownerById.get(list.ownerId);
      return {
        _id: list._id,
        title: list.title,
        description: list.description,
        ownerId: list.ownerId,
        ownerName: owner?.displayName ?? owner?.username ?? owner?.name ?? "User",
      };
    });
  },
});

export const getRelevantReviewsForShow = action({
  args: {
    showId: v.id("shows"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewerId = await getAuthUserId(ctx);
    if (!viewerId) {
      return [];
    }

    const similarUsers = await getTasteMatchCandidates({
      ctx,
      sourceUserId: viewerId,
      viewerId,
      limit: 8,
    });
    if (similarUsers.length === 0) {
      return [];
    }

    const scoreByAuthorId = new Map(
      similarUsers.map((candidate) => [candidate.user._id, candidate.tasteMatch]),
    );
    const reviews = await ctx.runQuery(internal.reviews.listForShowDetailedByAuthors, {
      showId: args.showId,
      authorIds: similarUsers.map((candidate) => candidate.user._id),
      limit: Math.min(args.limit ?? 4, 6),
    }) as Array<any>;

    return reviews
      .map((item) => ({
        ...item,
        tasteMatch: scoreByAuthorId.get(item.review.authorId) ?? 0,
      }))
      .sort((left, right) => right.tasteMatch - left.tasteMatch)
      .slice(0, Math.min(args.limit ?? 4, 6));
  },
});

export const getShowTasteSocialProof = action({
  args: {
    showId: v.id("shows"),
  },
  handler: async (ctx, args) => {
    const viewerId = await getAuthUserId(ctx);
    if (!viewerId) {
      throw new Error("Not authenticated");
    }

    const [followeeIds, similarUsers] = await Promise.all([
      ctx.runQuery((internal as any).follows.getFolloweeIds, { userId: viewerId }) as Promise<Id<"users">[]>,
      getTasteMatchCandidates({
        ctx,
        sourceUserId: viewerId,
        viewerId,
        limit: 20,
      }),
    ]);

    const followeeReviews = followeeIds.length > 0
      ? await ctx.runQuery(internal.reviews.listForShowDetailedByAuthors, {
        showId: args.showId,
        authorIds: followeeIds,
        limit: 12,
      }) as Array<any>
      : [];

    const friendsWhoLiked = followeeReviews
      .filter((item) => item.review.rating >= 4)
      .slice(0, 3)
      .map((item) => ({
        user: item.author,
        avatarUrl: item.authorAvatarUrl ?? null,
        reviewId: item.review._id,
        rating: item.review.rating,
        reviewText: item.review.reviewText ?? undefined,
      }));

    const similarStateRows = similarUsers.length > 0
      ? await ctx.runQuery((internal as any).watchStates.getStatesForShowByUserIds, {
        showId: args.showId,
        userIds: similarUsers.map((candidate) => candidate.user._id),
      }) as Array<{
        userId: Id<"users">;
        state: {
          status: "watchlist" | "watching" | "completed" | "dropped";
        };
      }>
      : [];

    let sampleSize = 0;
    let finishedCount = 0;
    let droppedCount = 0;
    for (const row of similarStateRows) {
      if (row.state.status === "completed") {
        finishedCount += 1;
        sampleSize += 1;
      } else if (row.state.status === "dropped") {
        droppedCount += 1;
        sampleSize += 1;
      }
    }

    const similarAudience = sampleSize >= 4
      ? {
        sampleSize,
        finishedCount,
        droppedCount,
        finishedPercent: Math.round((finishedCount / sampleSize) * 100),
        droppedPercent: Math.round((droppedCount / sampleSize) * 100),
      }
      : null;

    return {
      friendsWhoLiked,
      similarAudience,
    };
  },
});

export const getProfileTasteExperience = action({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const viewerId = await getAuthUserId(ctx);
    const targetProfile = await ensureUserTasteProfileInternal(ctx, args.userId);
    if (!targetProfile) {
      return {
        tasteMatch: null,
        rails: [],
        similarUsers: [],
      };
    }

    const seedShows = await ctx.runQuery(internal.embeddings.getShowsByIds, {
      showIds: targetProfile.positiveShowIds.slice(0, 2),
    }) as ShowDoc[];
    const rails: RecommendationRail[] = [];

    if (seedShows[0]) {
      const rail = await buildRecommendationRail({
        ctx,
        key: `profile_${args.userId}_${seedShows[0]._id}`,
        title: `Because they liked ${seedShows[0].title}`,
        description: "Shows with a similar feel and style.",
        positiveShowIds: [seedShows[0]._id],
        excludedShowIds: new Set([seedShows[0]._id]),
        limit: 10,
      });
      if (rail) rails.push(rail);
    }

    if (seedShows[0] && seedShows[1]) {
      const pairIds = [seedShows[0]._id, seedShows[1]._id];
      const rail = await buildRecommendationRail({
        ctx,
        key: `profile_pair_${args.userId}`,
        title: `Because they liked ${seedShows[0].title} and ${seedShows[1].title}`,
        description: "A blend of both worlds.",
        positiveShowIds: pairIds,
        excludedShowIds: new Set(pairIds),
        limit: 10,
      });
      if (rail) rails.push(rail);
    }

    if (targetProfile.favoriteThemes[0]) {
      const theme = targetProfile.favoriteThemes[0];
      const rail = await buildRecommendationRail({
        ctx,
        key: `profile_theme_${args.userId}`,
        title: `More ${humanizeTheme(theme)}`,
        description: "Based on the vibes they gravitate toward.",
        positiveShowIds: targetProfile.positiveShowIds.slice(0, 2),
        excludedShowIds: new Set(targetProfile.positiveShowIds.slice(0, 2)),
        theme,
        limit: 10,
      });
      if (rail) rails.push(rail);
    }

    const similarUsers = viewerId
      ? await getTasteMatchCandidates({
        ctx,
        sourceUserId: args.userId,
        viewerId,
        limit: 6,
      })
      : [];

    let tasteMatch: null | (TasteMatchDetails & { sharedThemes: string[] }) = null;
    if (viewerId && viewerId !== args.userId) {
      const viewerProfile = await ensureUserTasteProfileInternal(ctx, viewerId);
      if (viewerProfile) {
        const score = cosineSimilarity(
          viewerProfile.similarityEmbedding,
          targetProfile.similarityEmbedding,
        );
        const [visibleFavoriteRow] = await ctx.runQuery(
          (internal as any).users.getVisibleFavoriteShowsByUserIds,
          {
            viewerId,
            userIds: [args.userId],
          },
        ) as Array<{
          userId: Id<"users">;
          favoriteShows: Array<{
            _id: Id<"shows">;
            title: string;
            posterUrl?: string | null;
            year?: number;
          }>;
        }>;
        tasteMatch = {
          percent: toTastePercent(score),
          sharedFavoriteShows: buildSharedFavoriteShows({
            sourceFavoriteShowIds: viewerProfile.favoriteShowIds,
            candidateFavoriteShows: visibleFavoriteRow?.favoriteShows ?? [],
            limit: 3,
          }),
          sharedThemes: targetProfile.favoriteThemes
            .filter((theme: string) => viewerProfile.favoriteThemes.includes(theme))
            .slice(0, 2),
        };
      }
    }

    return {
      tasteMatch,
      rails,
      similarUsers,
    };
  },
});

export const previewRecommendationsFromShows = internalAction({
  args: {
    showIds: v.array(v.id("shows")),
    theme: v.optional(v.string()),
    excludeShowIds: v.optional(v.array(v.id("shows"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 10, 20);
    const uniqueShowIds = Array.from(new Set(args.showIds));

    await Promise.all(
      uniqueShowIds.map((showId) =>
        ctx.runAction(internal.embeddings.ensureShowEmbedding, { showId }),
      ),
    );

    const recommendations = await buildRecommendationCandidates({
      ctx,
      positiveShowIds: uniqueShowIds,
      negativeShowIds: [],
      excludedShowIds: new Set(args.excludeShowIds ?? uniqueShowIds),
      theme: args.theme,
      limit,
    });

    return toRecommendationResults(recommendations).map((item) => ({
      showId: item.showId,
      title: item.title,
      year: item.year,
      reason: item.reason,
      score: item.score,
    }));
  },
});

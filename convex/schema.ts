import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { ProfileVisibility } from "./profileVisibility";

const Status = v.union(
  v.literal("watchlist"),
  v.literal("watching"),
  v.literal("completed"),
  v.literal("dropped"),
);

const TargetType = v.union(
  v.literal("review"),
  v.literal("log"),
  v.literal("list"),
);

const { users: _authUsers, ...authOnlyTables } = authTables;

export default defineSchema({
  ...authOnlyTables,
  users: defineTable({
    // Convex Auth fields
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    phoneHash: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
    isAdmin: v.optional(v.boolean()),
    // Plotlist profile fields
    username: v.optional(v.string()),
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
    searchText: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    lastSeenAt: v.optional(v.number()),
    countsFollowers: v.optional(v.number()),
    countsFollowing: v.optional(v.number()),
    countsReviews: v.optional(v.number()),
    countsLogs: v.optional(v.number()),
    countsLists: v.optional(v.number()),
    countsWatchlist: v.optional(v.number()),
    countsWatching: v.optional(v.number()),
    countsCompleted: v.optional(v.number()),
    countsDropped: v.optional(v.number()),
    countsTotalShows: v.optional(v.number()),
    onboardingStep: v.optional(
      v.union(
        v.literal("profile"),
        v.literal("follow"),
        v.literal("shows"),
        v.literal("complete"),
      ),
    ),
    onboardingCompletedAt: v.optional(v.number()),
    favoriteShowIds: v.optional(v.array(v.id("shows"))),
    favoriteGenres: v.optional(v.array(v.string())),
    profileVisibility: v.optional(ProfileVisibility),
    releaseCalendarPreferences: v.optional(
      v.object({
        selectedProviders: v.array(v.string()),
      }),
    ),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_phoneHash", ["phoneHash"])
    .index("by_username", ["username"])
    .index("by_createdAt", ["createdAt"])
    .index("by_lastSeenAt", ["lastSeenAt"])
    .searchIndex("search_users", {
      searchField: "searchText",
      filterFields: [],
    }),

  shows: defineTable({
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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_external", ["externalSource", "externalId"])
    .searchIndex("search_shows", {
      searchField: "searchText",
      filterFields: ["externalSource"],
    }),

  watchStates: defineTable({
    userId: v.id("users"),
    showId: v.id("shows"),
    status: Status,
    updatedAt: v.number(),
  })
    .index("by_user_updatedAt", ["userId", "updatedAt"])
    .index("by_user_show", ["userId", "showId"]),

  watchLogs: defineTable({
    userId: v.id("users"),
    showId: v.id("shows"),
    watchedAt: v.number(),
    note: v.optional(v.string()),
    seasonNumber: v.optional(v.number()),
    episodeNumber: v.optional(v.number()),
    episodeTitle: v.optional(v.string()),
  })
    .index("by_user_watchedAt", ["userId", "watchedAt"])
    .index("by_show_watchedAt", ["showId", "watchedAt"])
    .index("by_watchedAt", ["watchedAt"]),

  episodeProgress: defineTable({
    userId: v.id("users"),
    showId: v.id("shows"),
    seasonNumber: v.number(),
    episodeNumber: v.number(),
    watchedAt: v.number(),
  })
    .index("by_user_show", ["userId", "showId"])
    .index("by_user_watchedAt", ["userId", "watchedAt"])
    .index("by_user_show_season_episode", [
      "userId",
      "showId",
      "seasonNumber",
      "episodeNumber",
    ]),

  reviews: defineTable({
    authorId: v.id("users"),
    showId: v.id("shows"),
    rating: v.number(),
    reviewText: v.optional(v.string()),
    spoiler: v.boolean(),
    seasonNumber: v.optional(v.number()),
    episodeNumber: v.optional(v.number()),
    episodeTitle: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_show_createdAt", ["showId", "createdAt"])
    .index("by_author_createdAt", ["authorId", "createdAt"])
    .index("by_author_show", ["authorId", "showId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_show_episode", ["showId", "seasonNumber", "episodeNumber"]),

  follows: defineTable({
    followerId: v.id("users"),
    followeeId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_follower_createdAt", ["followerId", "createdAt"])
    .index("by_followee_createdAt", ["followeeId", "createdAt"])
    .index("by_pair", ["followerId", "followeeId"]),

  contactSyncEntries: defineTable({
    ownerId: v.id("users"),
    sourceRecordId: v.optional(v.string()),
    displayName: v.string(),
    contactHash: v.string(),
    matchedUserId: v.optional(v.id("users")),
    invitedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_updatedAt", ["ownerId", "updatedAt"])
    .index("by_owner_contactHash", ["ownerId", "contactHash"])
    .index("by_matchedUserId", ["matchedUserId"]),

  likes: defineTable({
    userId: v.id("users"),
    targetType: TargetType,
    targetId: v.string(),
    createdAt: v.number(),
  })
    .index("by_user_createdAt", ["userId", "createdAt"])
    .index("by_target_createdAt", ["targetType", "targetId", "createdAt"])
    .index("by_user_target", ["userId", "targetType", "targetId"]),

  comments: defineTable({
    authorId: v.id("users"),
    targetType: TargetType,
    targetId: v.string(),
    text: v.string(),
    createdAt: v.number(),
  })
    .index("by_target_createdAt", ["targetType", "targetId", "createdAt"])
    .index("by_author_createdAt", ["authorId", "createdAt"]),

  lists: defineTable({
    ownerId: v.id("users"),
    title: v.string(),
    description: v.optional(v.string()),
    isPublic: v.boolean(),
    coverStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner_updatedAt", ["ownerId", "updatedAt"]),

  listItems: defineTable({
    listId: v.id("lists"),
    showId: v.id("shows"),
    position: v.number(),
    addedAt: v.number(),
  })
    .index("by_list_position", ["listId", "position"])
    .index("by_list_show", ["listId", "showId"]),

  feedItems: defineTable({
    ownerId: v.id("users"),
    actorId: v.id("users"),
    type: v.union(v.literal("review"), v.literal("log")),
    targetId: v.string(),
    showId: v.id("shows"),
    timestamp: v.number(),
    createdAt: v.number(),
  })
    .index("by_owner_timestamp", ["ownerId", "timestamp"])
    .index("by_target", ["type", "targetId"]),

  tmdbDetailsCache: defineTable({
    externalSource: v.string(),
    externalId: v.string(),
    payload: v.any(),
    fetchedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_external", ["externalSource", "externalId"])
    .index("by_expiresAt", ["expiresAt"]),

  tmdbSearchCache: defineTable({
    query: v.string(),
    results: v.any(),
    fetchedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_query", ["query"])
    .index("by_expiresAt", ["expiresAt"]),

  tmdbListCache: defineTable({
    category: v.string(),
    results: v.any(),
    fetchedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_category", ["category"])
    .index("by_expiresAt", ["expiresAt"]),

  tmdbImportJobs: defineTable({
    kind: v.literal("top_tv"),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    requestedBy: v.optional(v.id("users")),
    targetCount: v.number(),
    pageSize: v.number(),
    maxPage: v.number(),
    nextPage: v.number(),
    pagesProcessed: v.number(),
    showsProcessed: v.number(),
    totalPages: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_status_createdAt", ["status", "createdAt"]),

  tmdbEpisodeCacheJobs: defineTable({
    kind: v.literal("season_cache"),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    requestedBy: v.optional(v.id("users")),
    targetShowCount: v.number(),
    batchSize: v.number(),
    nextOffset: v.number(),
    processedShowCount: v.number(),
    cachedSeasonCount: v.number(),
    skippedSeasonCount: v.number(),
    failedShowCount: v.number(),
    totalShowCount: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_status_createdAt", ["status", "createdAt"]),

  showReleaseSyncState: defineTable({
    showId: v.id("shows"),
    syncedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    status: v.union(
      v.literal("idle"),
      v.literal("scheduled"),
      v.literal("running"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    lastError: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_showId", ["showId"])
    .index("by_status_updatedAt", ["status", "updatedAt"])
    .index("by_expiresAt", ["expiresAt"]),

  releaseEvents: defineTable({
    showId: v.id("shows"),
    airDate: v.string(),
    airDateTs: v.number(),
    seasonNumber: v.number(),
    episodeNumber: v.number(),
    episodeTitle: v.optional(v.string()),
    isPremiere: v.boolean(),
    isReturningSeason: v.boolean(),
    isSeasonFinale: v.boolean(),
    isSeriesFinale: v.boolean(),
  })
    .index("by_show_airDateTs", ["showId", "airDateTs"])
    .index("by_airDateTs", ["airDateTs"]),

  showEmbeddings: defineTable({
    showId: v.id("shows"),
    externalSource: v.string(),
    externalId: v.string(),
    embeddingVersion: v.string(),
    model: v.string(),
    dimensions: v.number(),
    inputText: v.string(),
    inputHash: v.string(),
    similarityEmbedding: v.array(v.float64()),
    retrievalEmbedding: v.array(v.float64()),
    updatedAt: v.number(),
  })
    .index("by_showId", ["showId"])
    .index("by_external", ["externalSource", "externalId"])
    .index("by_version_updatedAt", ["embeddingVersion", "updatedAt"])
    .vectorIndex("by_similarity_embedding", {
      vectorField: "similarityEmbedding",
      dimensions: 1536,
      filterFields: ["embeddingVersion"],
    })
    .vectorIndex("by_retrieval_embedding", {
      vectorField: "retrievalEmbedding",
      dimensions: 1536,
      filterFields: ["embeddingVersion"],
    }),

  showEmbeddingJobs: defineTable({
    kind: v.literal("show_catalog"),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    embeddingVersion: v.string(),
    model: v.string(),
    dimensions: v.number(),
    batchSize: v.number(),
    nextCursor: v.optional(v.string()),
    processedCount: v.number(),
    embeddedCount: v.number(),
    skippedCount: v.number(),
    totalCount: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_status_createdAt", ["status", "createdAt"]),

  userTasteCaches: defineTable({
    userId: v.id("users"),
    themeKey: v.string(),
    embeddingVersion: v.string(),
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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_theme", ["userId", "themeKey"])
    .index("by_user_updatedAt", ["userId", "updatedAt"]),

  userTastePreferences: defineTable({
    userId: v.id("users"),
    favoriteShowIds: v.array(v.id("shows")),
    favoriteThemes: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  userTasteProfiles: defineTable({
    userId: v.id("users"),
    embeddingVersion: v.string(),
    signalFingerprint: v.string(),
    favoriteShowIds: v.array(v.id("shows")),
    favoriteThemes: v.array(v.string()),
    positiveShowIds: v.array(v.id("shows")),
    negativeShowIds: v.array(v.id("shows")),
    similarityEmbedding: v.array(v.float64()),
    updatedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_updatedAt", ["updatedAt"])
    .vectorIndex("by_similarity_embedding", {
      vectorField: "similarityEmbedding",
      dimensions: 1536,
      filterFields: ["embeddingVersion"],
    }),

  reports: defineTable({
    reporterId: v.id("users"),
    targetType: TargetType,
    targetId: v.string(),
    reason: v.optional(v.string()),
    createdAt: v.number(),
    status: v.union(v.literal("open"), v.literal("resolved")),
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.id("users")),
    action: v.optional(v.union(v.literal("dismiss"), v.literal("delete"))),
  }).index("by_reporter_createdAt", ["reporterId", "createdAt"]),

  rateLimits: defineTable({
    key: v.string(),
    count: v.number(),
    resetAt: v.number(),
  }).index("by_key", ["key"]),
});

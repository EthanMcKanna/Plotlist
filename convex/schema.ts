import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

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
    year: v.optional(v.number()),
    overview: v.optional(v.string()),
    posterUrl: v.optional(v.string()),
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
  })
    .index("by_user_watchedAt", ["userId", "watchedAt"])
    .index("by_show_watchedAt", ["showId", "watchedAt"])
    .index("by_watchedAt", ["watchedAt"]),

  reviews: defineTable({
    authorId: v.id("users"),
    showId: v.id("shows"),
    rating: v.number(),
    reviewText: v.string(),
    spoiler: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_show_createdAt", ["showId", "createdAt"])
    .index("by_author_createdAt", ["authorId", "createdAt"])
    .index("by_author_show", ["authorId", "showId"])
    .index("by_createdAt", ["createdAt"]),

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

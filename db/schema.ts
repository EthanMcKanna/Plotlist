import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { vector } from "./vector";

const timestampMs = (name: string) => bigint(name, { mode: "number" });

export const onboardingStepEnum = pgEnum("onboarding_step", [
  "profile",
  "follow",
  "shows",
  "complete",
]);

export const watchStatusEnum = pgEnum("watch_status", [
  "watchlist",
  "watching",
  "completed",
  "dropped",
]);

export const targetTypeEnum = pgEnum("target_type", ["review", "log", "list"]);
export const feedItemTypeEnum = pgEnum("feed_item_type", ["review", "log"]);
export const reportStatusEnum = pgEnum("report_status", ["open", "resolved"]);
export const reportActionEnum = pgEnum("report_action", ["dismiss", "delete"]);
export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "running",
  "completed",
  "failed",
]);
export const releaseSyncStatusEnum = pgEnum("release_sync_status", [
  "idle",
  "scheduled",
  "running",
  "ready",
  "failed",
]);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    image: text("image"),
    email: text("email"),
    emailVerificationTime: timestampMs("email_verification_time"),
    phone: text("phone"),
    phoneVerificationTime: timestampMs("phone_verification_time"),
    phoneHash: text("phone_hash"),
    isAnonymous: boolean("is_anonymous"),
    isAdmin: boolean("is_admin"),
    username: text("username"),
    displayName: text("display_name"),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    searchText: text("search_text"),
    createdAt: timestampMs("created_at").notNull(),
    lastSeenAt: timestampMs("last_seen_at"),
    countsFollowers: integer("counts_followers").default(0).notNull(),
    countsFollowing: integer("counts_following").default(0).notNull(),
    countsReviews: integer("counts_reviews").default(0).notNull(),
    countsLogs: integer("counts_logs").default(0).notNull(),
    countsLists: integer("counts_lists").default(0).notNull(),
    countsWatchlist: integer("counts_watchlist").default(0).notNull(),
    countsWatching: integer("counts_watching").default(0).notNull(),
    countsCompleted: integer("counts_completed").default(0).notNull(),
    countsDropped: integer("counts_dropped").default(0).notNull(),
    countsTotalShows: integer("counts_total_shows").default(0).notNull(),
    onboardingStep: onboardingStepEnum("onboarding_step").default("profile"),
    onboardingCompletedAt: timestampMs("onboarding_completed_at"),
    favoriteShowIds: jsonb("favorite_show_ids").$type<string[]>(),
    favoriteGenres: jsonb("favorite_genres").$type<string[]>(),
    profileVisibility: jsonb("profile_visibility").$type<Record<string, unknown>>(),
    releaseCalendarPreferences: jsonb("release_calendar_preferences").$type<{
      selectedProviders: string[];
    }>(),
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
    phoneIdx: uniqueIndex("users_phone_idx").on(table.phone),
    phoneHashIdx: uniqueIndex("users_phone_hash_idx").on(table.phoneHash),
    usernameIdx: uniqueIndex("users_username_idx").on(table.username),
    createdAtIdx: index("users_created_at_idx").on(table.createdAt),
    lastSeenAtIdx: index("users_last_seen_at_idx").on(table.lastSeenAt),
    searchIdx: index("users_search_text_idx").using(
      "gin",
      table.searchText.op("gin_trgm_ops"),
    ),
  }),
);

export const userIdentities = pgTable(
  "user_identities",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => ({
    providerIdx: uniqueIndex("user_identities_provider_account_idx").on(
      table.provider,
      table.providerAccountId,
    ),
    userIdx: index("user_identities_user_idx").on(table.userId),
  }),
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    expiresAt: timestampMs("expires_at").notNull(),
    createdAt: timestampMs("created_at").notNull(),
    lastUsedAt: timestampMs("last_used_at").notNull(),
    revokedAt: timestampMs("revoked_at"),
  },
  (table) => ({
    userIdx: index("auth_sessions_user_idx").on(table.userId),
    tokenIdx: uniqueIndex("auth_sessions_refresh_token_hash_idx").on(table.refreshTokenHash),
    expiresIdx: index("auth_sessions_expires_at_idx").on(table.expiresAt),
  }),
);

export const phoneVerificationRequests = pgTable(
  "phone_verification_requests",
  {
    id: text("id").primaryKey(),
    phone: text("phone").notNull(),
    requestedAt: timestampMs("requested_at").notNull(),
    expiresAt: timestampMs("expires_at").notNull(),
    completedAt: timestampMs("completed_at"),
  },
  (table) => ({
    phoneIdx: index("phone_verification_requests_phone_idx").on(table.phone),
    expiresIdx: index("phone_verification_requests_expires_at_idx").on(table.expiresAt),
  }),
);

export const shows = pgTable(
  "shows",
  {
    id: text("id").primaryKey(),
    externalSource: text("external_source").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    originalTitle: text("original_title"),
    year: integer("year"),
    overview: text("overview"),
    posterUrl: text("poster_url"),
    backdropUrl: text("backdrop_url"),
    genreIds: jsonb("genre_ids").$type<number[]>(),
    originalLanguage: text("original_language"),
    originCountries: jsonb("origin_countries").$type<string[]>(),
    tmdbPopularity: doublePrecision("tmdb_popularity"),
    tmdbVoteAverage: doublePrecision("tmdb_vote_average"),
    tmdbVoteCount: integer("tmdb_vote_count"),
    searchText: text("search_text").notNull(),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => ({
    externalIdx: uniqueIndex("shows_external_idx").on(
      table.externalSource,
      table.externalId,
    ),
    searchIdx: index("shows_search_text_idx").using(
      "gin",
      table.searchText.op("gin_trgm_ops"),
    ),
    updatedAtIdx: index("shows_updated_at_idx").on(table.updatedAt),
  }),
);

export const watchStates = pgTable(
  "watch_states",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    showId: text("show_id")
      .notNull()
      .references(() => shows.id, { onDelete: "cascade" }),
    status: watchStatusEnum("status").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => ({
    userUpdatedIdx: index("watch_states_user_updated_idx").on(table.userId, table.updatedAt),
    userShowIdx: uniqueIndex("watch_states_user_show_idx").on(table.userId, table.showId),
  }),
);

export const watchLogs = pgTable(
  "watch_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    showId: text("show_id")
      .notNull()
      .references(() => shows.id, { onDelete: "cascade" }),
    watchedAt: timestampMs("watched_at").notNull(),
    note: text("note"),
    seasonNumber: integer("season_number"),
    episodeNumber: integer("episode_number"),
    episodeTitle: text("episode_title"),
  },
  (table) => ({
    userWatchedIdx: index("watch_logs_user_watched_idx").on(table.userId, table.watchedAt),
    showWatchedIdx: index("watch_logs_show_watched_idx").on(table.showId, table.watchedAt),
    watchedIdx: index("watch_logs_watched_idx").on(table.watchedAt),
  }),
);

export const episodeProgress = pgTable(
  "episode_progress",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    showId: text("show_id")
      .notNull()
      .references(() => shows.id, { onDelete: "cascade" }),
    seasonNumber: integer("season_number").notNull(),
    episodeNumber: integer("episode_number").notNull(),
    watchedAt: timestampMs("watched_at").notNull(),
  },
  (table) => ({
    userShowIdx: index("episode_progress_user_show_idx").on(table.userId, table.showId),
    userWatchedIdx: index("episode_progress_user_watched_idx").on(table.userId, table.watchedAt),
    userEpisodeIdx: uniqueIndex("episode_progress_user_episode_idx").on(
      table.userId,
      table.showId,
      table.seasonNumber,
      table.episodeNumber,
    ),
  }),
);

export const reviews = pgTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    showId: text("show_id")
      .notNull()
      .references(() => shows.id, { onDelete: "cascade" }),
    rating: doublePrecision("rating").notNull(),
    reviewText: text("review_text"),
    spoiler: boolean("spoiler").notNull(),
    seasonNumber: integer("season_number"),
    episodeNumber: integer("episode_number"),
    episodeTitle: text("episode_title"),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at"),
  },
  (table) => ({
    showCreatedIdx: index("reviews_show_created_idx").on(table.showId, table.createdAt),
    authorCreatedIdx: index("reviews_author_created_idx").on(table.authorId, table.createdAt),
    authorShowIdx: index("reviews_author_show_idx").on(table.authorId, table.showId),
    createdIdx: index("reviews_created_idx").on(table.createdAt),
    episodeIdx: index("reviews_show_episode_idx").on(
      table.showId,
      table.seasonNumber,
      table.episodeNumber,
    ),
  }),
);

export const follows = pgTable(
  "follows",
  {
    id: text("id").primaryKey(),
    followerId: text("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followeeId: text("followee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestampMs("created_at").notNull(),
  },
  (table) => ({
    followerIdx: index("follows_follower_created_idx").on(table.followerId, table.createdAt),
    followeeIdx: index("follows_followee_created_idx").on(table.followeeId, table.createdAt),
    pairIdx: uniqueIndex("follows_pair_idx").on(table.followerId, table.followeeId),
  }),
);

export const contactSyncEntries = pgTable(
  "contact_sync_entries",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceRecordId: text("source_record_id"),
    displayName: text("display_name").notNull(),
    contactHash: text("contact_hash").notNull(),
    matchedUserId: text("matched_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    invitedAt: timestampMs("invited_at"),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => ({
    ownerUpdatedIdx: index("contact_sync_entries_owner_updated_idx").on(
      table.ownerId,
      table.updatedAt,
    ),
    ownerHashIdx: uniqueIndex("contact_sync_entries_owner_hash_idx").on(
      table.ownerId,
      table.contactHash,
    ),
    matchedIdx: index("contact_sync_entries_matched_user_idx").on(table.matchedUserId),
  }),
);

export const likes = pgTable(
  "likes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetType: targetTypeEnum("target_type").notNull(),
    targetId: text("target_id").notNull(),
    createdAt: timestampMs("created_at").notNull(),
  },
  (table) => ({
    userCreatedIdx: index("likes_user_created_idx").on(table.userId, table.createdAt),
    targetCreatedIdx: index("likes_target_created_idx").on(
      table.targetType,
      table.targetId,
      table.createdAt,
    ),
    userTargetIdx: uniqueIndex("likes_user_target_idx").on(
      table.userId,
      table.targetType,
      table.targetId,
    ),
  }),
);

export const comments = pgTable(
  "comments",
  {
    id: text("id").primaryKey(),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetType: targetTypeEnum("target_type").notNull(),
    targetId: text("target_id").notNull(),
    text: text("text").notNull(),
    createdAt: timestampMs("created_at").notNull(),
  },
  (table) => ({
    targetCreatedIdx: index("comments_target_created_idx").on(
      table.targetType,
      table.targetId,
      table.createdAt,
    ),
    authorCreatedIdx: index("comments_author_created_idx").on(table.authorId, table.createdAt),
  }),
);

export const lists = pgTable(
  "lists",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    isPublic: boolean("is_public").notNull(),
    coverUrl: text("cover_url"),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => ({
    ownerUpdatedIdx: index("lists_owner_updated_idx").on(table.ownerId, table.updatedAt),
  }),
);

export const listItems = pgTable(
  "list_items",
  {
    id: text("id").primaryKey(),
    listId: text("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    showId: text("show_id")
      .notNull()
      .references(() => shows.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    addedAt: timestampMs("added_at").notNull(),
  },
  (table) => ({
    listPositionIdx: index("list_items_list_position_idx").on(table.listId, table.position),
    listShowIdx: uniqueIndex("list_items_list_show_idx").on(table.listId, table.showId),
  }),
);

export const feedItems = pgTable(
  "feed_items",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: feedItemTypeEnum("type").notNull(),
    targetId: text("target_id").notNull(),
    showId: text("show_id")
      .notNull()
      .references(() => shows.id, { onDelete: "cascade" }),
    timestamp: timestampMs("timestamp").notNull(),
    createdAt: timestampMs("created_at").notNull(),
  },
  (table) => ({
    ownerTimestampIdx: index("feed_items_owner_timestamp_idx").on(table.ownerId, table.timestamp),
    targetIdx: index("feed_items_target_idx").on(table.type, table.targetId),
  }),
);

export const tmdbDetailsCache = pgTable(
  "tmdb_details_cache",
  {
    id: text("id").primaryKey(),
    externalSource: text("external_source").notNull(),
    externalId: text("external_id").notNull(),
    payload: jsonb("payload").notNull(),
    fetchedAt: timestampMs("fetched_at").notNull(),
    expiresAt: timestampMs("expires_at").notNull(),
  },
  (table) => ({
    externalIdx: uniqueIndex("tmdb_details_cache_external_idx").on(
      table.externalSource,
      table.externalId,
    ),
    expiresIdx: index("tmdb_details_cache_expires_idx").on(table.expiresAt),
  }),
);

export const tmdbSearchCache = pgTable(
  "tmdb_search_cache",
  {
    id: text("id").primaryKey(),
    query: text("query").notNull(),
    results: jsonb("results").notNull(),
    fetchedAt: timestampMs("fetched_at").notNull(),
    expiresAt: timestampMs("expires_at").notNull(),
  },
  (table) => ({
    queryIdx: uniqueIndex("tmdb_search_cache_query_idx").on(table.query),
    expiresIdx: index("tmdb_search_cache_expires_idx").on(table.expiresAt),
  }),
);

export const tmdbListCache = pgTable(
  "tmdb_list_cache",
  {
    id: text("id").primaryKey(),
    category: text("category").notNull(),
    results: jsonb("results").notNull(),
    fetchedAt: timestampMs("fetched_at").notNull(),
    expiresAt: timestampMs("expires_at").notNull(),
  },
  (table) => ({
    categoryIdx: uniqueIndex("tmdb_list_cache_category_idx").on(table.category),
    expiresIdx: index("tmdb_list_cache_expires_idx").on(table.expiresAt),
  }),
);

export const tmdbImportJobs = pgTable(
  "tmdb_import_jobs",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    status: jobStatusEnum("status").notNull(),
    requestedBy: text("requested_by").references(() => users.id, { onDelete: "set null" }),
    targetCount: integer("target_count").notNull(),
    pageSize: integer("page_size").notNull(),
    maxPage: integer("max_page").notNull(),
    nextPage: integer("next_page").notNull(),
    pagesProcessed: integer("pages_processed").notNull(),
    showsProcessed: integer("shows_processed").notNull(),
    totalPages: integer("total_pages"),
    startedAt: timestampMs("started_at"),
    completedAt: timestampMs("completed_at"),
    failedAt: timestampMs("failed_at"),
    error: text("error"),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => ({
    createdIdx: index("tmdb_import_jobs_created_idx").on(table.createdAt),
    statusCreatedIdx: index("tmdb_import_jobs_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
  }),
);

export const tmdbEpisodeCacheJobs = pgTable(
  "tmdb_episode_cache_jobs",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    status: jobStatusEnum("status").notNull(),
    requestedBy: text("requested_by").references(() => users.id, { onDelete: "set null" }),
    targetShowCount: integer("target_show_count").notNull(),
    batchSize: integer("batch_size").notNull(),
    nextOffset: integer("next_offset").notNull(),
    processedShowCount: integer("processed_show_count").notNull(),
    cachedSeasonCount: integer("cached_season_count").notNull(),
    skippedSeasonCount: integer("skipped_season_count").notNull(),
    failedShowCount: integer("failed_show_count").notNull(),
    totalShowCount: integer("total_show_count"),
    startedAt: timestampMs("started_at"),
    completedAt: timestampMs("completed_at"),
    failedAt: timestampMs("failed_at"),
    error: text("error"),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => ({
    createdIdx: index("tmdb_episode_cache_jobs_created_idx").on(table.createdAt),
    statusCreatedIdx: index("tmdb_episode_cache_jobs_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
  }),
);

export const showReleaseSyncState = pgTable(
  "show_release_sync_state",
  {
    id: text("id").primaryKey(),
    showId: text("show_id")
      .notNull()
      .references(() => shows.id, { onDelete: "cascade" }),
    syncedAt: timestampMs("synced_at"),
    expiresAt: timestampMs("expires_at"),
    status: releaseSyncStatusEnum("status").notNull(),
    lastError: text("last_error"),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => ({
    showIdx: uniqueIndex("show_release_sync_state_show_idx").on(table.showId),
    statusUpdatedIdx: index("show_release_sync_state_status_updated_idx").on(
      table.status,
      table.updatedAt,
    ),
    expiresIdx: index("show_release_sync_state_expires_idx").on(table.expiresAt),
  }),
);

export const releaseEvents = pgTable(
  "release_events",
  {
    id: text("id").primaryKey(),
    showId: text("show_id")
      .notNull()
      .references(() => shows.id, { onDelete: "cascade" }),
    airDate: text("air_date").notNull(),
    airDateTs: timestampMs("air_date_ts").notNull(),
    seasonNumber: integer("season_number").notNull(),
    episodeNumber: integer("episode_number").notNull(),
    episodeTitle: text("episode_title"),
    isPremiere: boolean("is_premiere").notNull(),
    isReturningSeason: boolean("is_returning_season").notNull(),
    isSeasonFinale: boolean("is_season_finale").notNull(),
    isSeriesFinale: boolean("is_series_finale").notNull(),
  },
  (table) => ({
    showAirDateIdx: index("release_events_show_air_date_idx").on(table.showId, table.airDateTs),
    airDateIdx: index("release_events_air_date_idx").on(table.airDateTs),
  }),
);

export const showEmbeddings = pgTable(
  "show_embeddings",
  {
    id: text("id").primaryKey(),
    showId: text("show_id")
      .notNull()
      .references(() => shows.id, { onDelete: "cascade" }),
    externalSource: text("external_source").notNull(),
    externalId: text("external_id").notNull(),
    embeddingVersion: text("embedding_version").notNull(),
    model: text("model").notNull(),
    dimensions: integer("dimensions").notNull(),
    inputText: text("input_text").notNull(),
    inputHash: text("input_hash").notNull(),
    similarityEmbedding: vector("similarity_embedding", { dimensions: 1536 }).notNull(),
    retrievalEmbedding: vector("retrieval_embedding", { dimensions: 1536 }).notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => ({
    showIdx: uniqueIndex("show_embeddings_show_idx").on(table.showId),
    externalIdx: uniqueIndex("show_embeddings_external_idx").on(
      table.externalSource,
      table.externalId,
    ),
    versionUpdatedIdx: index("show_embeddings_version_updated_idx").on(
      table.embeddingVersion,
      table.updatedAt,
    ),
  }),
);

export const showEmbeddingJobs = pgTable(
  "show_embedding_jobs",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    status: jobStatusEnum("status").notNull(),
    embeddingVersion: text("embedding_version").notNull(),
    model: text("model").notNull(),
    dimensions: integer("dimensions").notNull(),
    batchSize: integer("batch_size").notNull(),
    nextCursor: text("next_cursor"),
    processedCount: integer("processed_count").notNull(),
    embeddedCount: integer("embedded_count").notNull(),
    skippedCount: integer("skipped_count").notNull(),
    totalCount: integer("total_count"),
    startedAt: timestampMs("started_at"),
    completedAt: timestampMs("completed_at"),
    failedAt: timestampMs("failed_at"),
    error: text("error"),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => ({
    createdIdx: index("show_embedding_jobs_created_idx").on(table.createdAt),
    statusCreatedIdx: index("show_embedding_jobs_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
  }),
);

export const userTasteCaches = pgTable(
  "user_taste_caches",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    themeKey: text("theme_key").notNull(),
    embeddingVersion: text("embedding_version").notNull(),
    signalFingerprint: text("signal_fingerprint").notNull(),
    recommendations: jsonb("recommendations").notNull(),
    positiveShowIds: jsonb("positive_show_ids").$type<string[]>().notNull(),
    negativeShowIds: jsonb("negative_show_ids").$type<string[]>().notNull(),
    expiresAt: timestampMs("expires_at").notNull(),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => ({
    userThemeIdx: uniqueIndex("user_taste_caches_user_theme_idx").on(table.userId, table.themeKey),
    userUpdatedIdx: index("user_taste_caches_user_updated_idx").on(table.userId, table.updatedAt),
  }),
);

export const userTastePreferences = pgTable(
  "user_taste_preferences",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    favoriteShowIds: jsonb("favorite_show_ids").$type<string[]>().notNull(),
    favoriteThemes: jsonb("favorite_themes").$type<string[]>().notNull(),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => ({
    userIdx: uniqueIndex("user_taste_preferences_user_idx").on(table.userId),
  }),
);

export const userTasteProfiles = pgTable(
  "user_taste_profiles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    embeddingVersion: text("embedding_version").notNull(),
    signalFingerprint: text("signal_fingerprint").notNull(),
    favoriteShowIds: jsonb("favorite_show_ids").$type<string[]>().notNull(),
    favoriteThemes: jsonb("favorite_themes").$type<string[]>().notNull(),
    positiveShowIds: jsonb("positive_show_ids").$type<string[]>().notNull(),
    negativeShowIds: jsonb("negative_show_ids").$type<string[]>().notNull(),
    similarityEmbedding: vector("similarity_embedding", { dimensions: 1536 }).notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
    createdAt: timestampMs("created_at").notNull(),
  },
  (table) => ({
    userIdx: uniqueIndex("user_taste_profiles_user_idx").on(table.userId),
    updatedIdx: index("user_taste_profiles_updated_idx").on(table.updatedAt),
  }),
);

export const reports = pgTable(
  "reports",
  {
    id: text("id").primaryKey(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetType: targetTypeEnum("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason"),
    createdAt: timestampMs("created_at").notNull(),
    status: reportStatusEnum("status").notNull(),
    resolvedAt: timestampMs("resolved_at"),
    resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
    action: reportActionEnum("action"),
  },
  (table) => ({
    reporterCreatedIdx: index("reports_reporter_created_idx").on(
      table.reporterId,
      table.createdAt,
    ),
  }),
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    count: integer("count").notNull(),
    resetAt: timestampMs("reset_at").notNull(),
  },
  (table) => ({
    keyIdx: uniqueIndex("rate_limits_key_idx").on(table.key),
  }),
);

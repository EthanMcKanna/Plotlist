/* eslint-disable */
/**
 * Generated data model types.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  DocumentByName,
  TableNamesInDataModel,
  SystemTableNames,
  AnyDataModel,
} from "convex/server";
import type { GenericId } from "convex/values";

/**
 * A type describing your Convex data model.
 *
 * This type includes information about what tables you have, the type of
 * documents stored in those tables, and the indexes defined on them.
 *
 * This type is used to parameterize methods like `queryGeneric` and
 * `mutationGeneric` to make them type-safe.
 */

export type DataModel = {
  authAccounts: {
    document: {
      emailVerified?: string;
      phoneVerified?: string;
      provider: string;
      providerAccountId: string;
      secret?: string;
      userId: Id<"users">;
      _id: Id<"authAccounts">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "emailVerified"
      | "phoneVerified"
      | "provider"
      | "providerAccountId"
      | "secret"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      providerAndAccountId: ["provider", "providerAccountId", "_creationTime"];
      userIdAndProvider: ["userId", "provider", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  authRateLimits: {
    document: {
      attemptsLeft: number;
      identifier: string;
      lastAttemptTime: number;
      _id: Id<"authRateLimits">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "attemptsLeft"
      | "identifier"
      | "lastAttemptTime";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      identifier: ["identifier", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  authRefreshTokens: {
    document: {
      expirationTime: number;
      firstUsedTime?: number;
      parentRefreshTokenId?: Id<"authRefreshTokens">;
      sessionId: Id<"authSessions">;
      _id: Id<"authRefreshTokens">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "expirationTime"
      | "firstUsedTime"
      | "parentRefreshTokenId"
      | "sessionId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      sessionId: ["sessionId", "_creationTime"];
      sessionIdAndParentRefreshTokenId: [
        "sessionId",
        "parentRefreshTokenId",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  authSessions: {
    document: {
      expirationTime: number;
      userId: Id<"users">;
      _id: Id<"authSessions">;
      _creationTime: number;
    };
    fieldPaths: "_creationTime" | "_id" | "expirationTime" | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      userId: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  authVerificationCodes: {
    document: {
      accountId: Id<"authAccounts">;
      code: string;
      emailVerified?: string;
      expirationTime: number;
      phoneVerified?: string;
      provider: string;
      verifier?: string;
      _id: Id<"authVerificationCodes">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "accountId"
      | "code"
      | "emailVerified"
      | "expirationTime"
      | "phoneVerified"
      | "provider"
      | "verifier";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      accountId: ["accountId", "_creationTime"];
      code: ["code", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  authVerifiers: {
    document: {
      sessionId?: Id<"authSessions">;
      signature?: string;
      _id: Id<"authVerifiers">;
      _creationTime: number;
    };
    fieldPaths: "_creationTime" | "_id" | "sessionId" | "signature";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      signature: ["signature", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  comments: {
    document: {
      authorId: Id<"users">;
      createdAt: number;
      targetId: string;
      targetType: "review" | "log" | "list";
      text: string;
      _id: Id<"comments">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "authorId"
      | "createdAt"
      | "targetId"
      | "targetType"
      | "text";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_author_createdAt: ["authorId", "createdAt", "_creationTime"];
      by_target_createdAt: [
        "targetType",
        "targetId",
        "createdAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  contactSyncEntries: {
    document: {
      contactHash: string;
      createdAt: number;
      displayName: string;
      invitedAt?: number;
      matchedUserId?: Id<"users">;
      ownerId: Id<"users">;
      sourceRecordId?: string;
      updatedAt: number;
      _id: Id<"contactSyncEntries">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "contactHash"
      | "createdAt"
      | "displayName"
      | "invitedAt"
      | "matchedUserId"
      | "ownerId"
      | "sourceRecordId"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_matchedUserId: ["matchedUserId", "_creationTime"];
      by_owner_contactHash: ["ownerId", "contactHash", "_creationTime"];
      by_owner_updatedAt: ["ownerId", "updatedAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  episodeProgress: {
    document: {
      episodeNumber: number;
      seasonNumber: number;
      showId: Id<"shows">;
      userId: Id<"users">;
      watchedAt: number;
      _id: Id<"episodeProgress">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "episodeNumber"
      | "seasonNumber"
      | "showId"
      | "userId"
      | "watchedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_user_show: ["userId", "showId", "_creationTime"];
      by_user_show_season_episode: [
        "userId",
        "showId",
        "seasonNumber",
        "episodeNumber",
        "_creationTime",
      ];
      by_user_watchedAt: ["userId", "watchedAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  feedItems: {
    document: {
      actorId: Id<"users">;
      createdAt: number;
      ownerId: Id<"users">;
      showId: Id<"shows">;
      targetId: string;
      timestamp: number;
      type: "review" | "log";
      _id: Id<"feedItems">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "actorId"
      | "createdAt"
      | "ownerId"
      | "showId"
      | "targetId"
      | "timestamp"
      | "type";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_owner_timestamp: ["ownerId", "timestamp", "_creationTime"];
      by_target: ["type", "targetId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  follows: {
    document: {
      createdAt: number;
      followeeId: Id<"users">;
      followerId: Id<"users">;
      _id: Id<"follows">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "followeeId"
      | "followerId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_followee_createdAt: ["followeeId", "createdAt", "_creationTime"];
      by_follower_createdAt: ["followerId", "createdAt", "_creationTime"];
      by_pair: ["followerId", "followeeId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  likes: {
    document: {
      createdAt: number;
      targetId: string;
      targetType: "review" | "log" | "list";
      userId: Id<"users">;
      _id: Id<"likes">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "targetId"
      | "targetType"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_target_createdAt: [
        "targetType",
        "targetId",
        "createdAt",
        "_creationTime",
      ];
      by_user_createdAt: ["userId", "createdAt", "_creationTime"];
      by_user_target: ["userId", "targetType", "targetId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  listItems: {
    document: {
      addedAt: number;
      listId: Id<"lists">;
      position: number;
      showId: Id<"shows">;
      _id: Id<"listItems">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "addedAt"
      | "listId"
      | "position"
      | "showId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_list_position: ["listId", "position", "_creationTime"];
      by_list_show: ["listId", "showId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  lists: {
    document: {
      coverStorageId?: Id<"_storage">;
      createdAt: number;
      description?: string;
      isPublic: boolean;
      ownerId: Id<"users">;
      title: string;
      updatedAt: number;
      _id: Id<"lists">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "coverStorageId"
      | "createdAt"
      | "description"
      | "isPublic"
      | "ownerId"
      | "title"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_owner_updatedAt: ["ownerId", "updatedAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  rateLimits: {
    document: {
      count: number;
      key: string;
      resetAt: number;
      _id: Id<"rateLimits">;
      _creationTime: number;
    };
    fieldPaths: "_creationTime" | "_id" | "count" | "key" | "resetAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_key: ["key", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  releaseEvents: {
    document: {
      airDate: string;
      airDateTs: number;
      episodeNumber: number;
      episodeTitle?: string;
      isPremiere: boolean;
      isReturningSeason: boolean;
      isSeasonFinale: boolean;
      isSeriesFinale: boolean;
      seasonNumber: number;
      showId: Id<"shows">;
      _id: Id<"releaseEvents">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "airDate"
      | "airDateTs"
      | "episodeNumber"
      | "episodeTitle"
      | "isPremiere"
      | "isReturningSeason"
      | "isSeasonFinale"
      | "isSeriesFinale"
      | "seasonNumber"
      | "showId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_airDateTs: ["airDateTs", "_creationTime"];
      by_show_airDateTs: ["showId", "airDateTs", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  reports: {
    document: {
      action?: "dismiss" | "delete";
      createdAt: number;
      reason?: string;
      reporterId: Id<"users">;
      resolvedAt?: number;
      resolvedBy?: Id<"users">;
      status: "open" | "resolved";
      targetId: string;
      targetType: "review" | "log" | "list";
      _id: Id<"reports">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "action"
      | "createdAt"
      | "reason"
      | "reporterId"
      | "resolvedAt"
      | "resolvedBy"
      | "status"
      | "targetId"
      | "targetType";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_reporter_createdAt: ["reporterId", "createdAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  reviews: {
    document: {
      authorId: Id<"users">;
      createdAt: number;
      episodeNumber?: number;
      episodeTitle?: string;
      rating: number;
      reviewText?: string;
      seasonNumber?: number;
      showId: Id<"shows">;
      spoiler: boolean;
      updatedAt?: number;
      _id: Id<"reviews">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "authorId"
      | "createdAt"
      | "episodeNumber"
      | "episodeTitle"
      | "rating"
      | "reviewText"
      | "seasonNumber"
      | "showId"
      | "spoiler"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_author_createdAt: ["authorId", "createdAt", "_creationTime"];
      by_author_show: ["authorId", "showId", "_creationTime"];
      by_createdAt: ["createdAt", "_creationTime"];
      by_show_createdAt: ["showId", "createdAt", "_creationTime"];
      by_show_episode: [
        "showId",
        "seasonNumber",
        "episodeNumber",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  showEmbeddingJobs: {
    document: {
      batchSize: number;
      completedAt?: number;
      createdAt: number;
      dimensions: number;
      embeddedCount: number;
      embeddingVersion: string;
      error?: string;
      failedAt?: number;
      kind: "show_catalog";
      model: string;
      nextCursor?: string;
      processedCount: number;
      skippedCount: number;
      startedAt?: number;
      status: "queued" | "running" | "completed" | "failed";
      totalCount?: number;
      updatedAt: number;
      _id: Id<"showEmbeddingJobs">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "batchSize"
      | "completedAt"
      | "createdAt"
      | "dimensions"
      | "embeddedCount"
      | "embeddingVersion"
      | "error"
      | "failedAt"
      | "kind"
      | "model"
      | "nextCursor"
      | "processedCount"
      | "skippedCount"
      | "startedAt"
      | "status"
      | "totalCount"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_createdAt: ["createdAt", "_creationTime"];
      by_status_createdAt: ["status", "createdAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  showEmbeddings: {
    document: {
      dimensions: number;
      embeddingVersion: string;
      externalId: string;
      externalSource: string;
      inputHash: string;
      inputText: string;
      model: string;
      retrievalEmbedding: Array<number>;
      showId: Id<"shows">;
      similarityEmbedding: Array<number>;
      updatedAt: number;
      _id: Id<"showEmbeddings">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "dimensions"
      | "embeddingVersion"
      | "externalId"
      | "externalSource"
      | "inputHash"
      | "inputText"
      | "model"
      | "retrievalEmbedding"
      | "showId"
      | "similarityEmbedding"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_external: ["externalSource", "externalId", "_creationTime"];
      by_showId: ["showId", "_creationTime"];
      by_version_updatedAt: ["embeddingVersion", "updatedAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {
      by_retrieval_embedding: {
        vectorField: "retrievalEmbedding";
        dimensions: number;
        filterFields: "embeddingVersion";
      };
      by_similarity_embedding: {
        vectorField: "similarityEmbedding";
        dimensions: number;
        filterFields: "embeddingVersion";
      };
    };
  };
  showReleaseSyncState: {
    document: {
      expiresAt?: number;
      lastError?: string;
      showId: Id<"shows">;
      status: "idle" | "scheduled" | "running" | "ready" | "failed";
      syncedAt?: number;
      updatedAt: number;
      _id: Id<"showReleaseSyncState">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "expiresAt"
      | "lastError"
      | "showId"
      | "status"
      | "syncedAt"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_expiresAt: ["expiresAt", "_creationTime"];
      by_showId: ["showId", "_creationTime"];
      by_status_updatedAt: ["status", "updatedAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  shows: {
    document: {
      backdropUrl?: string;
      createdAt: number;
      externalId: string;
      externalSource: string;
      genreIds?: Array<number>;
      originCountries?: Array<string>;
      originalLanguage?: string;
      originalTitle?: string;
      overview?: string;
      posterUrl?: string;
      searchText: string;
      title: string;
      tmdbPopularity?: number;
      tmdbVoteAverage?: number;
      tmdbVoteCount?: number;
      updatedAt: number;
      year?: number;
      _id: Id<"shows">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "backdropUrl"
      | "createdAt"
      | "externalId"
      | "externalSource"
      | "genreIds"
      | "originalLanguage"
      | "originalTitle"
      | "originCountries"
      | "overview"
      | "posterUrl"
      | "searchText"
      | "title"
      | "tmdbPopularity"
      | "tmdbVoteAverage"
      | "tmdbVoteCount"
      | "updatedAt"
      | "year";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_external: ["externalSource", "externalId", "_creationTime"];
    };
    searchIndexes: {
      search_shows: {
        searchField: "searchText";
        filterFields: "externalSource";
      };
    };
    vectorIndexes: {};
  };
  tmdbDetailsCache: {
    document: {
      expiresAt: number;
      externalId: string;
      externalSource: string;
      fetchedAt: number;
      payload: any;
      _id: Id<"tmdbDetailsCache">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "expiresAt"
      | "externalId"
      | "externalSource"
      | "fetchedAt"
      | "payload";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_expiresAt: ["expiresAt", "_creationTime"];
      by_external: ["externalSource", "externalId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  tmdbEpisodeCacheJobs: {
    document: {
      batchSize: number;
      cachedSeasonCount: number;
      completedAt?: number;
      createdAt: number;
      error?: string;
      failedAt?: number;
      failedShowCount: number;
      kind: "season_cache";
      nextOffset: number;
      processedShowCount: number;
      requestedBy?: Id<"users">;
      skippedSeasonCount: number;
      startedAt?: number;
      status: "queued" | "running" | "completed" | "failed";
      targetShowCount: number;
      totalShowCount?: number;
      updatedAt: number;
      _id: Id<"tmdbEpisodeCacheJobs">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "batchSize"
      | "cachedSeasonCount"
      | "completedAt"
      | "createdAt"
      | "error"
      | "failedAt"
      | "failedShowCount"
      | "kind"
      | "nextOffset"
      | "processedShowCount"
      | "requestedBy"
      | "skippedSeasonCount"
      | "startedAt"
      | "status"
      | "targetShowCount"
      | "totalShowCount"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_createdAt: ["createdAt", "_creationTime"];
      by_status_createdAt: ["status", "createdAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  tmdbImportJobs: {
    document: {
      completedAt?: number;
      createdAt: number;
      error?: string;
      failedAt?: number;
      kind: "top_tv";
      maxPage: number;
      nextPage: number;
      pageSize: number;
      pagesProcessed: number;
      requestedBy?: Id<"users">;
      showsProcessed: number;
      startedAt?: number;
      status: "queued" | "running" | "completed" | "failed";
      targetCount: number;
      totalPages?: number;
      updatedAt: number;
      _id: Id<"tmdbImportJobs">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "completedAt"
      | "createdAt"
      | "error"
      | "failedAt"
      | "kind"
      | "maxPage"
      | "nextPage"
      | "pageSize"
      | "pagesProcessed"
      | "requestedBy"
      | "showsProcessed"
      | "startedAt"
      | "status"
      | "targetCount"
      | "totalPages"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_createdAt: ["createdAt", "_creationTime"];
      by_status_createdAt: ["status", "createdAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  tmdbListCache: {
    document: {
      category: string;
      expiresAt: number;
      fetchedAt: number;
      results: any;
      _id: Id<"tmdbListCache">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "category"
      | "expiresAt"
      | "fetchedAt"
      | "results";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_category: ["category", "_creationTime"];
      by_expiresAt: ["expiresAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  tmdbSearchCache: {
    document: {
      expiresAt: number;
      fetchedAt: number;
      query: string;
      results: any;
      _id: Id<"tmdbSearchCache">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "expiresAt"
      | "fetchedAt"
      | "query"
      | "results";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_expiresAt: ["expiresAt", "_creationTime"];
      by_query: ["query", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  users: {
    document: {
      avatarStorageId?: Id<"_storage">;
      bio?: string;
      countsCompleted?: number;
      countsDropped?: number;
      countsFollowers?: number;
      countsFollowing?: number;
      countsLists?: number;
      countsLogs?: number;
      countsReviews?: number;
      countsTotalShows?: number;
      countsWatching?: number;
      countsWatchlist?: number;
      createdAt?: number;
      displayName?: string;
      email?: string;
      emailVerificationTime?: number;
      favoriteGenres?: Array<string>;
      favoriteShowIds?: Array<Id<"shows">>;
      image?: string;
      isAdmin?: boolean;
      isAnonymous?: boolean;
      lastSeenAt?: number;
      name?: string;
      onboardingCompletedAt?: number;
      onboardingStep?: "profile" | "follow" | "shows" | "complete";
      phone?: string;
      phoneHash?: string;
      phoneVerificationTime?: number;
      profileVisibility?: {
        currentlyWatching: "public" | "following" | "private";
        favorites: "public" | "following" | "private";
        watchlist: "public" | "following" | "private";
      };
      releaseCalendarPreferences?: { selectedProviders: Array<string> };
      searchText?: string;
      username?: string;
      _id: Id<"users">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "avatarStorageId"
      | "bio"
      | "countsCompleted"
      | "countsDropped"
      | "countsFollowers"
      | "countsFollowing"
      | "countsLists"
      | "countsLogs"
      | "countsReviews"
      | "countsTotalShows"
      | "countsWatching"
      | "countsWatchlist"
      | "createdAt"
      | "displayName"
      | "email"
      | "emailVerificationTime"
      | "favoriteGenres"
      | "favoriteShowIds"
      | "image"
      | "isAdmin"
      | "isAnonymous"
      | "lastSeenAt"
      | "name"
      | "onboardingCompletedAt"
      | "onboardingStep"
      | "phone"
      | "phoneHash"
      | "phoneVerificationTime"
      | "profileVisibility"
      | "profileVisibility.currentlyWatching"
      | "profileVisibility.favorites"
      | "profileVisibility.watchlist"
      | "releaseCalendarPreferences"
      | "releaseCalendarPreferences.selectedProviders"
      | "searchText"
      | "username";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_createdAt: ["createdAt", "_creationTime"];
      by_lastSeenAt: ["lastSeenAt", "_creationTime"];
      by_phoneHash: ["phoneHash", "_creationTime"];
      by_username: ["username", "_creationTime"];
      email: ["email", "_creationTime"];
      phone: ["phone", "_creationTime"];
    };
    searchIndexes: {
      search_users: {
        searchField: "searchText";
        filterFields: never;
      };
    };
    vectorIndexes: {};
  };
  userTasteCaches: {
    document: {
      createdAt: number;
      embeddingVersion: string;
      expiresAt: number;
      negativeShowIds: Array<Id<"shows">>;
      positiveShowIds: Array<Id<"shows">>;
      recommendations: Array<{
        overview?: string;
        posterUrl?: string;
        reason: string;
        score: number;
        showId: Id<"shows">;
        title: string;
        year?: number;
      }>;
      signalFingerprint: string;
      themeKey: string;
      updatedAt: number;
      userId: Id<"users">;
      _id: Id<"userTasteCaches">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "embeddingVersion"
      | "expiresAt"
      | "negativeShowIds"
      | "positiveShowIds"
      | "recommendations"
      | "signalFingerprint"
      | "themeKey"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_user_theme: ["userId", "themeKey", "_creationTime"];
      by_user_updatedAt: ["userId", "updatedAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  userTastePreferences: {
    document: {
      createdAt: number;
      favoriteShowIds: Array<Id<"shows">>;
      favoriteThemes: Array<string>;
      updatedAt: number;
      userId: Id<"users">;
      _id: Id<"userTastePreferences">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "favoriteShowIds"
      | "favoriteThemes"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_userId: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  userTasteProfiles: {
    document: {
      createdAt: number;
      embeddingVersion: string;
      favoriteShowIds: Array<Id<"shows">>;
      favoriteThemes: Array<string>;
      negativeShowIds: Array<Id<"shows">>;
      positiveShowIds: Array<Id<"shows">>;
      signalFingerprint: string;
      similarityEmbedding: Array<number>;
      updatedAt: number;
      userId: Id<"users">;
      _id: Id<"userTasteProfiles">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "embeddingVersion"
      | "favoriteShowIds"
      | "favoriteThemes"
      | "negativeShowIds"
      | "positiveShowIds"
      | "signalFingerprint"
      | "similarityEmbedding"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_updatedAt: ["updatedAt", "_creationTime"];
      by_userId: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {
      by_similarity_embedding: {
        vectorField: "similarityEmbedding";
        dimensions: number;
        filterFields: "embeddingVersion";
      };
    };
  };
  watchLogs: {
    document: {
      episodeNumber?: number;
      episodeTitle?: string;
      note?: string;
      seasonNumber?: number;
      showId: Id<"shows">;
      userId: Id<"users">;
      watchedAt: number;
      _id: Id<"watchLogs">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "episodeNumber"
      | "episodeTitle"
      | "note"
      | "seasonNumber"
      | "showId"
      | "userId"
      | "watchedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_show_watchedAt: ["showId", "watchedAt", "_creationTime"];
      by_user_watchedAt: ["userId", "watchedAt", "_creationTime"];
      by_watchedAt: ["watchedAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  watchStates: {
    document: {
      showId: Id<"shows">;
      status: "watchlist" | "watching" | "completed" | "dropped";
      updatedAt: number;
      userId: Id<"users">;
      _id: Id<"watchStates">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "showId"
      | "status"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_user_show: ["userId", "showId", "_creationTime"];
      by_user_updatedAt: ["userId", "updatedAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
};

/**
 * The names of all of your Convex tables.
 */
export type TableNames = TableNamesInDataModel<DataModel>;

/**
 * The type of a document stored in Convex.
 *
 * @typeParam TableName - A string literal type of the table name (like "users").
 */
export type Doc<TableName extends TableNames> = DocumentByName<
  DataModel,
  TableName
>;

/**
 * An identifier for a document in Convex.
 *
 * Convex documents are uniquely identified by their `Id`, which is accessible
 * on the `_id` field. To learn more, see [Document IDs](https://docs.convex.dev/using/document-ids).
 *
 * Documents can be loaded using `db.get(tableName, id)` in query and mutation functions.
 *
 * IDs are just strings at runtime, but this type can be used to distinguish them from other
 * strings when type checking.
 *
 * @typeParam TableName - A string literal type of the table name (like "users").
 */
export type Id<TableName extends TableNames | SystemTableNames> =
  GenericId<TableName>;

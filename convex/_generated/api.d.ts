/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: {
  auth: {
    isAuthenticated: FunctionReference<"query", "public", {}, any>;
    signIn: FunctionReference<
      "action",
      "public",
      {
        calledBy?: string;
        params?: any;
        provider?: string;
        refreshToken?: string;
        verifier?: string;
      },
      any
    >;
    signOut: FunctionReference<"action", "public", {}, any>;
  };
  comments: {
    add: FunctionReference<
      "mutation",
      "public",
      { targetId: string; targetType: "review" | "log" | "list"; text: string },
      any
    >;
    deleteComment: FunctionReference<
      "mutation",
      "public",
      { commentId: Id<"comments"> },
      any
    >;
    listForTarget: FunctionReference<
      "query",
      "public",
      {
        paginationOpts: {
          cursor: string | null;
          endCursor?: string | null;
          id?: number;
          maximumBytesRead?: number;
          maximumRowsRead?: number;
          numItems: number;
        };
        targetId: string;
        targetType: "review" | "log" | "list";
      },
      any
    >;
  };
  contacts: {
    clearSync: FunctionReference<"mutation", "public", {}, any>;
    getInviteCandidates: FunctionReference<
      "query",
      "public",
      { limit?: number },
      any
    >;
    getMatches: FunctionReference<"query", "public", { limit?: number }, any>;
    getStatus: FunctionReference<"query", "public", {}, any>;
    searchInviteCandidates: FunctionReference<
      "query",
      "public",
      { limit?: number; text: string },
      any
    >;
    sendInvite: FunctionReference<
      "mutation",
      "public",
      { entryId: Id<"contactSyncEntries"> },
      any
    >;
    syncSnapshot: FunctionReference<
      "action",
      "public",
      {
        entries: Array<{
          displayName?: string;
          phone: string;
          sourceRecordId?: string;
        }>;
      },
      any
    >;
  };
  embeddings: {
    getHomeRecommendationRails: FunctionReference<
      "action",
      "public",
      { limitPerRail?: number },
      any
    >;
    getListsFromSimilarTasteUsers: FunctionReference<
      "action",
      "public",
      { limit?: number },
      any
    >;
    getPersonalizedRecommendations: FunctionReference<
      "action",
      "public",
      { limit?: number; theme?: string },
      any
    >;
    getProfileTasteExperience: FunctionReference<
      "action",
      "public",
      { userId: Id<"users"> },
      any
    >;
    getRelevantReviewsForShow: FunctionReference<
      "action",
      "public",
      { limit?: number; showId: Id<"shows"> },
      any
    >;
    getShowRecommendationRails: FunctionReference<
      "action",
      "public",
      { limitPerRail?: number; showId: Id<"shows"> },
      any
    >;
    getShowTasteSocialProof: FunctionReference<
      "action",
      "public",
      { showId: Id<"shows"> },
      any
    >;
    getSimilarShows: FunctionReference<
      "action",
      "public",
      { limit?: number; showId: Id<"shows"> },
      any
    >;
    getSimilarTasteUsers: FunctionReference<
      "action",
      "public",
      { limit?: number; userId?: Id<"users"> },
      any
    >;
    getSmartLists: FunctionReference<
      "action",
      "public",
      { limitPerList?: number },
      any
    >;
    getViewerTastePreferences: FunctionReference<"query", "public", {}, any>;
    saveViewerTastePreferences: FunctionReference<
      "action",
      "public",
      { favoriteShowIds: Array<Id<"shows">>; favoriteThemes: Array<string> },
      any
    >;
    searchShows: FunctionReference<
      "action",
      "public",
      { limit?: number; text: string },
      any
    >;
  };
  episodeProgress: {
    getProgressForShow: FunctionReference<
      "query",
      "public",
      { showId: Id<"shows"> },
      any
    >;
    getStats: FunctionReference<"query", "public", {}, any>;
    getUpNext: FunctionReference<"query", "public", {}, any>;
    markSeasonWatched: FunctionReference<
      "mutation",
      "public",
      {
        createLog?: boolean;
        episodes: Array<{ episodeNumber: number; title?: string }>;
        seasonNumber: number;
        showId: Id<"shows">;
      },
      any
    >;
    toggleEpisode: FunctionReference<
      "mutation",
      "public",
      {
        createLog?: boolean;
        episodeNumber: number;
        episodeTitle?: string;
        seasonNumber: number;
        showId: Id<"shows">;
      },
      any
    >;
    unmarkSeasonWatched: FunctionReference<
      "mutation",
      "public",
      { seasonNumber: number; showId: Id<"shows"> },
      any
    >;
  };
  feed: {
    forUser: FunctionReference<"query", "public", { limit?: number }, any>;
    listForUser: FunctionReference<
      "query",
      "public",
      {
        paginationOpts: {
          cursor: string | null;
          endCursor?: string | null;
          id?: number;
          maximumBytesRead?: number;
          maximumRowsRead?: number;
          numItems: number;
        };
      },
      any
    >;
  };
  follows: {
    follow: FunctionReference<
      "mutation",
      "public",
      { userIdToFollow: Id<"users"> },
      any
    >;
    isFollowing: FunctionReference<
      "query",
      "public",
      { userId: Id<"users"> },
      any
    >;
    listFollowers: FunctionReference<
      "query",
      "public",
      { limit?: number; userId: Id<"users"> },
      any
    >;
    listFollowersDetailed: FunctionReference<
      "query",
      "public",
      {
        paginationOpts: {
          cursor: string | null;
          endCursor?: string | null;
          id?: number;
          maximumBytesRead?: number;
          maximumRowsRead?: number;
          numItems: number;
        };
        userId: Id<"users">;
      },
      any
    >;
    listFollowing: FunctionReference<
      "query",
      "public",
      { limit?: number; userId: Id<"users"> },
      any
    >;
    listFollowingDetailed: FunctionReference<
      "query",
      "public",
      {
        paginationOpts: {
          cursor: string | null;
          endCursor?: string | null;
          id?: number;
          maximumBytesRead?: number;
          maximumRowsRead?: number;
          numItems: number;
        };
        userId: Id<"users">;
      },
      any
    >;
    unfollow: FunctionReference<
      "mutation",
      "public",
      { userIdToUnfollow: Id<"users"> },
      any
    >;
  };
  likes: {
    getForUserTarget: FunctionReference<
      "query",
      "public",
      { targetId: string; targetType: "review" | "log" | "list" },
      any
    >;
    listForTarget: FunctionReference<
      "query",
      "public",
      {
        limit?: number;
        targetId: string;
        targetType: "review" | "log" | "list";
      },
      any
    >;
    toggle: FunctionReference<
      "mutation",
      "public",
      { targetId: string; targetType: "review" | "log" | "list" },
      any
    >;
  };
  listItems: {
    add: FunctionReference<
      "mutation",
      "public",
      { listId: Id<"lists">; showId: Id<"shows"> },
      any
    >;
    getShowMembership: FunctionReference<
      "query",
      "public",
      { showId: Id<"shows"> },
      any
    >;
    list: FunctionReference<"query", "public", { listId: Id<"lists"> }, any>;
    listDetailed: FunctionReference<
      "query",
      "public",
      { listId: Id<"lists"> },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      { listItemId: Id<"listItems"> },
      any
    >;
    reorder: FunctionReference<
      "mutation",
      "public",
      { listId: Id<"lists">; orderedItemIds: Array<Id<"listItems">> },
      any
    >;
    toggle: FunctionReference<
      "mutation",
      "public",
      { listId: Id<"lists">; showId: Id<"shows"> },
      any
    >;
  };
  lists: {
    create: FunctionReference<
      "mutation",
      "public",
      { description?: string; isPublic: boolean; title: string },
      any
    >;
    deleteList: FunctionReference<
      "mutation",
      "public",
      { listId: Id<"lists"> },
      any
    >;
    get: FunctionReference<"query", "public", { listId: Id<"lists"> }, any>;
    listForUser: FunctionReference<
      "query",
      "public",
      {
        paginationOpts: {
          cursor: string | null;
          endCursor?: string | null;
          id?: number;
          maximumBytesRead?: number;
          maximumRowsRead?: number;
          numItems: number;
        };
        userId: Id<"users">;
      },
      any
    >;
    listPublicForUser: FunctionReference<
      "query",
      "public",
      {
        paginationOpts: {
          cursor: string | null;
          endCursor?: string | null;
          id?: number;
          maximumBytesRead?: number;
          maximumRowsRead?: number;
          numItems: number;
        };
        userId: Id<"users">;
      },
      any
    >;
    update: FunctionReference<
      "mutation",
      "public",
      {
        coverStorageId?: Id<"_storage">;
        description?: string;
        isPublic?: boolean;
        listId: Id<"lists">;
        title?: string;
      },
      any
    >;
  };
  maintenance: {
    cleanupRateLimits: FunctionReference<"mutation", "public", {}, any>;
  };
  phone: {
    startVerification: FunctionReference<
      "action",
      "public",
      { phone: string },
      any
    >;
  };
  releaseCalendar: {
    getHomePreview: FunctionReference<
      "query",
      "public",
      { today: string },
      any
    >;
    listForMe: FunctionReference<
      "query",
      "public",
      {
        cursor?: string;
        limit?: number;
        selectedProvidersOverride?: Array<string>;
        today: string;
        view: "tonight" | "upcoming" | "premieres" | "returning" | "finales";
      },
      any
    >;
    refreshForMe: FunctionReference<"action", "public", {}, any>;
    setProviderFilter: FunctionReference<
      "mutation",
      "public",
      { selectedProviders: Array<string> },
      any
    >;
  };
  reports: {
    create: FunctionReference<
      "mutation",
      "public",
      {
        reason?: string;
        targetId: string;
        targetType: "review" | "log" | "list";
      },
      any
    >;
    listOpen: FunctionReference<
      "query",
      "public",
      {
        paginationOpts: {
          cursor: string | null;
          endCursor?: string | null;
          id?: number;
          maximumBytesRead?: number;
          maximumRowsRead?: number;
          numItems: number;
        };
      },
      any
    >;
    resolve: FunctionReference<
      "mutation",
      "public",
      { action: "dismiss" | "delete"; reportId: Id<"reports"> },
      any
    >;
  };
  reviews: {
    create: FunctionReference<
      "mutation",
      "public",
      {
        episodeNumber?: number;
        episodeTitle?: string;
        rating: number;
        reviewText?: string;
        seasonNumber?: number;
        showId: Id<"shows">;
        spoiler: boolean;
      },
      any
    >;
    deleteReview: FunctionReference<
      "mutation",
      "public",
      { reviewId: Id<"reviews"> },
      any
    >;
    edit: FunctionReference<
      "mutation",
      "public",
      {
        rating?: number;
        reviewId: Id<"reviews">;
        reviewText?: string;
        spoiler?: boolean;
      },
      any
    >;
    get: FunctionReference<"query", "public", { reviewId: Id<"reviews"> }, any>;
    getDetailed: FunctionReference<
      "query",
      "public",
      { reviewId: Id<"reviews"> },
      any
    >;
    getEpisodeStats: FunctionReference<
      "query",
      "public",
      { episodeNumber: number; seasonNumber: number; showId: Id<"shows"> },
      any
    >;
    getMyEpisodeRating: FunctionReference<
      "query",
      "public",
      { episodeNumber: number; seasonNumber: number; showId: Id<"shows"> },
      any
    >;
    getMyEpisodeRatings: FunctionReference<
      "query",
      "public",
      { showId: Id<"shows"> },
      any
    >;
    listForEpisodeDetailed: FunctionReference<
      "query",
      "public",
      {
        episodeNumber: number;
        limit?: number;
        seasonNumber: number;
        showId: Id<"shows">;
      },
      any
    >;
    listForShow: FunctionReference<
      "query",
      "public",
      { limit?: number; showId: Id<"shows"> },
      any
    >;
    listForShowDetailed: FunctionReference<
      "query",
      "public",
      {
        paginationOpts: {
          cursor: string | null;
          endCursor?: string | null;
          id?: number;
          maximumBytesRead?: number;
          maximumRowsRead?: number;
          numItems: number;
        };
        showId: Id<"shows">;
      },
      any
    >;
    listForUser: FunctionReference<
      "query",
      "public",
      { limit?: number; userId: Id<"users"> },
      any
    >;
    listForUserDetailed: FunctionReference<
      "query",
      "public",
      {
        paginationOpts: {
          cursor: string | null;
          endCursor?: string | null;
          id?: number;
          maximumBytesRead?: number;
          maximumRowsRead?: number;
          numItems: number;
        };
        userId: Id<"users">;
      },
      any
    >;
    rateEpisode: FunctionReference<
      "mutation",
      "public",
      {
        episodeNumber: number;
        episodeTitle?: string;
        rating: number;
        reviewText?: string;
        seasonNumber: number;
        showId: Id<"shows">;
        spoiler?: boolean;
      },
      any
    >;
    removeEpisodeRating: FunctionReference<
      "mutation",
      "public",
      { episodeNumber: number; seasonNumber: number; showId: Id<"shows"> },
      any
    >;
  };
  shows: {
    get: FunctionReference<"query", "public", { showId: Id<"shows"> }, any>;
    getByExternal: FunctionReference<
      "query",
      "public",
      { externalId: string; externalSource: string },
      any
    >;
    getExtendedDetails: FunctionReference<
      "action",
      "public",
      { externalId: string },
      any
    >;
    getSeasonDetails: FunctionReference<
      "action",
      "public",
      { externalId: string; seasonNumber: number },
      any
    >;
    getTmdbList: FunctionReference<
      "action",
      "public",
      {
        category:
          | "popular"
          | "top_rated"
          | "on_the_air"
          | "genre_drama"
          | "genre_comedy"
          | "genre_sci_fi"
          | "netflix"
          | "apple_tv"
          | "max"
          | "disney_plus"
          | "hulu"
          | "prime_video";
        limit?: number;
        page?: number;
      },
      any
    >;
    ingestFromCatalog: FunctionReference<
      "action",
      "public",
      {
        externalId: string;
        externalSource: string;
        originalTitle?: string;
        overview?: string;
        posterUrl?: string;
        title?: string;
        year?: number;
      },
      any
    >;
    search: FunctionReference<
      "query",
      "public",
      { limit?: number; text: string },
      any
    >;
    searchCatalog: FunctionReference<"action", "public", { text: string }, any>;
  };
  storage: {
    generateUploadUrl: FunctionReference<"mutation", "public", {}, any>;
    getUrl: FunctionReference<
      "query",
      "public",
      { storageId: Id<"_storage"> },
      any
    >;
  };
  trending: {
    mostReviewed: FunctionReference<"query", "public", { limit?: number }, any>;
    shows: FunctionReference<
      "query",
      "public",
      { limit?: number; windowHours?: number },
      any
    >;
  };
  users: {
    deleteAccount: FunctionReference<"mutation", "public", {}, any>;
    ensureProfile: FunctionReference<
      "mutation",
      "public",
      { displayName?: string; username?: string },
      any
    >;
    exportData: FunctionReference<"query", "public", {}, any>;
    getFavoriteShows: FunctionReference<"query", "public", {}, any>;
    getShowsById: FunctionReference<
      "query",
      "public",
      { showIds: Array<Id<"shows">> },
      any
    >;
    me: FunctionReference<"query", "public", {}, any>;
    profile: FunctionReference<"query", "public", { userId: Id<"users"> }, any>;
    search: FunctionReference<
      "query",
      "public",
      { limit?: number; text: string },
      any
    >;
    setOnboardingStep: FunctionReference<
      "mutation",
      "public",
      { step: "profile" | "follow" | "shows" | "complete" },
      any
    >;
    suggested: FunctionReference<"query", "public", { limit?: number }, any>;
    updateProfile: FunctionReference<
      "mutation",
      "public",
      {
        avatarStorageId?: Id<"_storage">;
        bio?: string;
        displayName?: string;
        favoriteGenres?: Array<string>;
        favoriteShowIds?: Array<Id<"shows">>;
        profileVisibility?: {
          currentlyWatching: "public" | "following" | "private";
          favorites: "public" | "following" | "private";
          watchlist: "public" | "following" | "private";
        };
        username?: string;
      },
      any
    >;
  };
  watchLogs: {
    add: FunctionReference<
      "mutation",
      "public",
      {
        episodeNumber?: number;
        episodeTitle?: string;
        note?: string;
        seasonNumber?: number;
        showId: Id<"shows">;
        watchedAt: number;
      },
      any
    >;
    deleteLog: FunctionReference<
      "mutation",
      "public",
      { logId: Id<"watchLogs"> },
      any
    >;
    listActivityForUser: FunctionReference<
      "query",
      "public",
      { limit?: number; userId: Id<"users"> },
      any
    >;
    listForShow: FunctionReference<
      "query",
      "public",
      { limit?: number; showId: Id<"shows"> },
      any
    >;
    listForShowDetailed: FunctionReference<
      "query",
      "public",
      {
        paginationOpts: {
          cursor: string | null;
          endCursor?: string | null;
          id?: number;
          maximumBytesRead?: number;
          maximumRowsRead?: number;
          numItems: number;
        };
        showId: Id<"shows">;
      },
      any
    >;
    listForUser: FunctionReference<
      "query",
      "public",
      { limit?: number; userId: Id<"users"> },
      any
    >;
    listForUserDetailed: FunctionReference<
      "query",
      "public",
      {
        paginationOpts: {
          cursor: string | null;
          endCursor?: string | null;
          id?: number;
          maximumBytesRead?: number;
          maximumRowsRead?: number;
          numItems: number;
        };
        userId: Id<"users">;
      },
      any
    >;
    updateLog: FunctionReference<
      "mutation",
      "public",
      { logId: Id<"watchLogs">; note?: string; watchedAt?: number },
      any
    >;
  };
  watchStates: {
    getCounts: FunctionReference<"query", "public", {}, any>;
    getForShow: FunctionReference<
      "query",
      "public",
      { showId: Id<"shows"> },
      any
    >;
    listForUser: FunctionReference<
      "query",
      "public",
      {
        limit?: number;
        status?: "watchlist" | "watching" | "completed" | "dropped";
      },
      any
    >;
    listForUserDetailed: FunctionReference<
      "query",
      "public",
      {
        paginationOpts: {
          cursor: string | null;
          endCursor?: string | null;
          id?: number;
          maximumBytesRead?: number;
          maximumRowsRead?: number;
          numItems: number;
        };
        sortBy?: "date" | "title" | "year";
        status?: "watchlist" | "watching" | "completed" | "dropped";
      },
      any
    >;
    listPublicWatchlistDetailed: FunctionReference<
      "query",
      "public",
      {
        paginationOpts: {
          cursor: string | null;
          endCursor?: string | null;
          id?: number;
          maximumBytesRead?: number;
          maximumRowsRead?: number;
          numItems: number;
        };
        sortBy?: "date" | "title" | "year";
        userId: Id<"users">;
      },
      any
    >;
    removeStatus: FunctionReference<
      "mutation",
      "public",
      { showId: Id<"shows"> },
      any
    >;
    setStatus: FunctionReference<
      "mutation",
      "public",
      {
        showId: Id<"shows">;
        status: "watchlist" | "watching" | "completed" | "dropped";
      },
      any
    >;
  };
};

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: {
  auth: {
    store: FunctionReference<
      "mutation",
      "internal",
      {
        args:
          | {
              generateTokens: boolean;
              sessionId?: Id<"authSessions">;
              type: "signIn";
              userId: Id<"users">;
            }
          | { type: "signOut" }
          | { refreshToken: string; type: "refreshSession" }
          | {
              allowExtraProviders: boolean;
              generateTokens: boolean;
              params: any;
              provider?: string;
              type: "verifyCodeAndSignIn";
              verifier?: string;
            }
          | { type: "verifier" }
          | { signature: string; type: "verifierSignature"; verifier: string }
          | {
              profile: any;
              provider: string;
              providerAccountId: string;
              signature: string;
              type: "userOAuth";
            }
          | {
              accountId?: Id<"authAccounts">;
              allowExtraProviders: boolean;
              code: string;
              email?: string;
              expirationTime: number;
              phone?: string;
              provider: string;
              type: "createVerificationCode";
            }
          | {
              account: { id: string; secret?: string };
              profile: any;
              provider: string;
              shouldLinkViaEmail?: boolean;
              shouldLinkViaPhone?: boolean;
              type: "createAccountFromCredentials";
            }
          | {
              account: { id: string; secret?: string };
              provider: string;
              type: "retrieveAccountWithCredentials";
            }
          | {
              account: { id: string; secret: string };
              provider: string;
              type: "modifyAccount";
            }
          | {
              except?: Array<Id<"authSessions">>;
              type: "invalidateSessions";
              userId: Id<"users">;
            };
      },
      any
    >;
  };
  contacts: {
    findUsersByPhoneHashes: FunctionReference<
      "query",
      "internal",
      { hashes: Array<string> },
      any
    >;
    getEntryByHash: FunctionReference<
      "query",
      "internal",
      { contactHash: string; ownerId: Id<"users"> },
      any
    >;
    markInvited: FunctionReference<
      "mutation",
      "internal",
      { entryId: Id<"contactSyncEntries">; invitedAt: number },
      any
    >;
    replaceSnapshot: FunctionReference<
      "mutation",
      "internal",
      {
        entries: Array<{
          contactHash: string;
          displayName: string;
          matchedUserId?: Id<"users">;
          sourceRecordId?: string;
        }>;
        ownerId: Id<"users">;
        syncedAt: number;
      },
      any
    >;
  };
  embeddings: {
    advanceEmbeddingJob: FunctionReference<
      "mutation",
      "internal",
      {
        embeddedCount: number;
        jobId: Id<"showEmbeddingJobs">;
        nextCursor?: string;
        processedCount: number;
        skippedCount: number;
      },
      any
    >;
    clearUserTasteArtifacts: FunctionReference<
      "mutation",
      "internal",
      { userId: Id<"users"> },
      any
    >;
    clearUserTasteCaches: FunctionReference<
      "mutation",
      "internal",
      { userId: Id<"users"> },
      any
    >;
    completeEmbeddingJob: FunctionReference<
      "mutation",
      "internal",
      {
        embeddedCount: number;
        jobId: Id<"showEmbeddingJobs">;
        processedCount: number;
        skippedCount: number;
      },
      any
    >;
    countEmbeddings: FunctionReference<"query", "internal", {}, any>;
    countTmdbShows: FunctionReference<"query", "internal", {}, any>;
    createEmbeddingJob: FunctionReference<
      "mutation",
      "internal",
      { totalCount?: number },
      any
    >;
    ensureShowEmbedding: FunctionReference<
      "action",
      "internal",
      { showId: Id<"shows"> },
      any
    >;
    ensureUserTasteProfile: FunctionReference<
      "action",
      "internal",
      { userId: Id<"users"> },
      any
    >;
    failEmbeddingJob: FunctionReference<
      "mutation",
      "internal",
      { error: string; jobId: Id<"showEmbeddingJobs"> },
      any
    >;
    getEmbeddingByShowId: FunctionReference<
      "query",
      "internal",
      { showId: Id<"shows"> },
      any
    >;
    getEmbeddingJob: FunctionReference<
      "query",
      "internal",
      { jobId: Id<"showEmbeddingJobs"> },
      any
    >;
    getEmbeddingsByIds: FunctionReference<
      "query",
      "internal",
      { embeddingIds: Array<Id<"showEmbeddings">> },
      any
    >;
    getEmbeddingsByShowIds: FunctionReference<
      "query",
      "internal",
      { showIds: Array<Id<"shows">> },
      any
    >;
    getLatestEmbeddingJob: FunctionReference<"query", "internal", {}, any>;
    getLexicalSearchResults: FunctionReference<
      "query",
      "internal",
      { limit?: number; text: string },
      any
    >;
    getShowsByIds: FunctionReference<
      "query",
      "internal",
      { showIds: Array<Id<"shows">> },
      any
    >;
    getUsersByIds: FunctionReference<
      "query",
      "internal",
      { userIds: Array<Id<"users">> },
      any
    >;
    getUserTasteCache: FunctionReference<
      "query",
      "internal",
      { themeKey: string; userId: Id<"users"> },
      any
    >;
    getUserTastePreferences: FunctionReference<
      "query",
      "internal",
      { userId: Id<"users"> },
      any
    >;
    getUserTasteProfile: FunctionReference<
      "query",
      "internal",
      { userId: Id<"users"> },
      any
    >;
    getUserTasteProfilesByIds: FunctionReference<
      "query",
      "internal",
      { profileIds: Array<Id<"userTasteProfiles">> },
      any
    >;
    getUserTasteSignals: FunctionReference<
      "query",
      "internal",
      { userId: Id<"users"> },
      any
    >;
    listTmdbShowsForEmbedding: FunctionReference<
      "query",
      "internal",
      { batchSize?: number; cursor?: string },
      any
    >;
    markEmbeddingJobRunning: FunctionReference<
      "mutation",
      "internal",
      { jobId: Id<"showEmbeddingJobs"> },
      any
    >;
    previewPersonalizedRecommendationsForUser: FunctionReference<
      "action",
      "internal",
      { limit?: number; theme?: string; userId: Id<"users"> },
      any
    >;
    previewRecommendationsFromShows: FunctionReference<
      "action",
      "internal",
      {
        excludeShowIds?: Array<Id<"shows">>;
        limit?: number;
        showIds: Array<Id<"shows">>;
        theme?: string;
      },
      any
    >;
    runEmbeddingBackfillBatch: FunctionReference<
      "action",
      "internal",
      { jobId: Id<"showEmbeddingJobs"> },
      any
    >;
    setEmbeddingJobBatchSize: FunctionReference<
      "mutation",
      "internal",
      { batchSize: number; jobId: Id<"showEmbeddingJobs"> },
      any
    >;
    startEmbeddingBackfill: FunctionReference<"action", "internal", {}, any>;
    upsertShowEmbeddingsBatch: FunctionReference<
      "mutation",
      "internal",
      {
        rows: Array<{
          externalId: string;
          externalSource: string;
          inputHash: string;
          inputText: string;
          retrievalEmbedding: Array<number>;
          showId: Id<"shows">;
          similarityEmbedding: Array<number>;
        }>;
      },
      any
    >;
    upsertUserTasteCache: FunctionReference<
      "mutation",
      "internal",
      {
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
        userId: Id<"users">;
      },
      any
    >;
    upsertUserTastePreferences: FunctionReference<
      "mutation",
      "internal",
      {
        favoriteShowIds: Array<Id<"shows">>;
        favoriteThemes: Array<string>;
        userId: Id<"users">;
      },
      any
    >;
    upsertUserTasteProfile: FunctionReference<
      "mutation",
      "internal",
      {
        favoriteShowIds: Array<Id<"shows">>;
        favoriteThemes: Array<string>;
        negativeShowIds: Array<Id<"shows">>;
        positiveShowIds: Array<Id<"shows">>;
        signalFingerprint: string;
        similarityEmbedding: Array<number>;
        userId: Id<"users">;
      },
      any
    >;
  };
  follows: {
    getFolloweeIds: FunctionReference<
      "query",
      "internal",
      { userId: Id<"users"> },
      any
    >;
  };
  lists: {
    listPublicByOwnerIds: FunctionReference<
      "query",
      "internal",
      { limit?: number; limitPerOwner?: number; ownerIds: Array<Id<"users">> },
      any
    >;
  };
  maintenance: {
    cleanupTmdbCache: FunctionReference<"mutation", "internal", {}, any>;
    scheduleEmbeddingRefresh: FunctionReference<"action", "internal", {}, any>;
    scheduleEpisodeCacheRefresh: FunctionReference<
      "action",
      "internal",
      { batchSize?: number; minFreshMs?: number; targetShowCount: number },
      any
    >;
    scheduleFullCatalogMaintenance: FunctionReference<
      "action",
      "internal",
      {},
      any
    >;
    scheduleFullEpisodeCacheRefresh: FunctionReference<
      "action",
      "internal",
      {},
      any
    >;
    scheduleFullShowCatalogRefresh: FunctionReference<
      "action",
      "internal",
      {},
      any
    >;
    scheduleHotCatalogMaintenance: FunctionReference<
      "action",
      "internal",
      {},
      any
    >;
    scheduleHotEpisodeCacheRefresh: FunctionReference<
      "action",
      "internal",
      {},
      any
    >;
    scheduleHotShowCatalogRefresh: FunctionReference<
      "action",
      "internal",
      {},
      any
    >;
    scheduleTopTvImport: FunctionReference<
      "action",
      "internal",
      { minFreshMs?: number; pagesPerBatch?: number; targetCount: number },
      any
    >;
  };
  people: {
    buildPreviewsByUserIds: FunctionReference<
      "query",
      "internal",
      { candidateIds: Array<Id<"users">>; viewerId: Id<"users"> },
      any
    >;
  };
  rateLimit: {
    enforce: FunctionReference<
      "mutation",
      "internal",
      { key: string; limit: number; windowMs: number },
      any
    >;
  };
  releaseCalendar: {
    beginShowRefreshInternal: FunctionReference<
      "mutation",
      "internal",
      { now: number; showId: Id<"shows"> },
      any
    >;
    claimShowRefreshInternal: FunctionReference<
      "mutation",
      "internal",
      { now: number; showId: Id<"shows"> },
      any
    >;
    getShowByIdInternal: FunctionReference<
      "query",
      "internal",
      { showId: Id<"shows"> },
      any
    >;
    getShowSyncStateInternal: FunctionReference<
      "query",
      "internal",
      { showId: Id<"shows"> },
      any
    >;
    getStaleTrackedShowIdsInternal: FunctionReference<
      "query",
      "internal",
      { limit?: number; now: number },
      any
    >;
    getTrackedShowIdsForUserInternal: FunctionReference<
      "query",
      "internal",
      { userId: Id<"users"> },
      any
    >;
    refreshTrackedShowsBatch: FunctionReference<
      "action",
      "internal",
      { showIds: Array<Id<"shows">> },
      any
    >;
    replaceReleaseEventsForShowInternal: FunctionReference<
      "mutation",
      "internal",
      {
        events: Array<{
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
        }>;
        showId: Id<"shows">;
      },
      any
    >;
    scheduleStaleTrackedShowRefresh: FunctionReference<
      "action",
      "internal",
      {},
      any
    >;
    upsertShowSyncStateInternal: FunctionReference<
      "mutation",
      "internal",
      {
        expiresAt?: number;
        lastError?: string;
        showId: Id<"shows">;
        status: "idle" | "scheduled" | "running" | "ready" | "failed";
        syncedAt?: number;
        updatedAt: number;
      },
      any
    >;
  };
  reviews: {
    listForShowDetailedByAuthors: FunctionReference<
      "query",
      "internal",
      { authorIds: Array<Id<"users">>; limit?: number; showId: Id<"shows"> },
      any
    >;
  };
  shows: {
    getByExternalInternal: FunctionReference<
      "query",
      "internal",
      { externalId: string; externalSource: string },
      any
    >;
    getDetailsCache: FunctionReference<
      "query",
      "internal",
      { externalId: string; externalSource: string },
      any
    >;
    getExtendedDetailsInternal: FunctionReference<
      "action",
      "internal",
      { externalId: string },
      any
    >;
    getListCache: FunctionReference<
      "query",
      "internal",
      { category: string },
      any
    >;
    getSearchCache: FunctionReference<
      "query",
      "internal",
      { query: string },
      any
    >;
    getSeasonDetailsInternal: FunctionReference<
      "action",
      "internal",
      { externalId: string; seasonNumber: number },
      any
    >;
    upsertDetailsCache: FunctionReference<
      "mutation",
      "internal",
      {
        expiresAt: number;
        externalId: string;
        externalSource: string;
        fetchedAt: number;
        payload: any;
      },
      any
    >;
    upsertFromCatalog: FunctionReference<
      "mutation",
      "internal",
      {
        externalId: string;
        externalSource: string;
        overview?: string;
        posterUrl?: string;
        searchText: string;
        title: string;
        year?: number;
      },
      any
    >;
    upsertListCache: FunctionReference<
      "mutation",
      "internal",
      { category: string; expiresAt: number; fetchedAt: number; results: any },
      any
    >;
    upsertSearchCache: FunctionReference<
      "mutation",
      "internal",
      { expiresAt: number; fetchedAt: number; query: string; results: any },
      any
    >;
  };
  tmdbEpisodes: {
    advanceEpisodeCacheJob: FunctionReference<
      "mutation",
      "internal",
      {
        cachedSeasonCount: number;
        failedShowCount: number;
        jobId: Id<"tmdbEpisodeCacheJobs">;
        nextOffset: number;
        processedShowCount: number;
        skippedSeasonCount: number;
        totalShowCount?: number;
      },
      any
    >;
    completeEpisodeCacheJob: FunctionReference<
      "mutation",
      "internal",
      {
        cachedSeasonCount: number;
        failedShowCount: number;
        jobId: Id<"tmdbEpisodeCacheJobs">;
        nextOffset: number;
        processedShowCount: number;
        skippedSeasonCount: number;
        totalShowCount?: number;
      },
      any
    >;
    createEpisodeCacheJob: FunctionReference<
      "mutation",
      "internal",
      {
        batchSize?: number;
        requestedBy?: Id<"users">;
        targetShowCount?: number;
        totalShowCount?: number;
      },
      any
    >;
    failEpisodeCacheJob: FunctionReference<
      "mutation",
      "internal",
      { error: string; jobId: Id<"tmdbEpisodeCacheJobs"> },
      any
    >;
    getEpisodeCacheJob: FunctionReference<
      "query",
      "internal",
      { jobId: Id<"tmdbEpisodeCacheJobs"> },
      any
    >;
    getLatestEpisodeCacheJob: FunctionReference<"query", "internal", {}, any>;
    listTopTmdbShowsForEpisodeCache: FunctionReference<
      "query",
      "internal",
      { batchSize: number; offset: number },
      any
    >;
    markEpisodeCacheJobRunning: FunctionReference<
      "mutation",
      "internal",
      { jobId: Id<"tmdbEpisodeCacheJobs"> },
      any
    >;
    runEpisodeCacheBatch: FunctionReference<
      "action",
      "internal",
      { jobId: Id<"tmdbEpisodeCacheJobs"> },
      any
    >;
    startEpisodeCacheBackfill: FunctionReference<
      "action",
      "internal",
      {
        batchSize?: number;
        requestedBy?: Id<"users">;
        targetShowCount?: number;
      },
      any
    >;
  };
  tmdbImport: {
    advanceImportJob: FunctionReference<
      "mutation",
      "internal",
      {
        jobId: Id<"tmdbImportJobs">;
        nextPage: number;
        pagesProcessed: number;
        showsProcessed: number;
        totalPages?: number;
      },
      any
    >;
    completeImportJob: FunctionReference<
      "mutation",
      "internal",
      {
        jobId: Id<"tmdbImportJobs">;
        nextPage: number;
        pagesProcessed: number;
        showsProcessed: number;
        totalPages?: number;
      },
      any
    >;
    countTmdbShows: FunctionReference<"query", "internal", {}, any>;
    createTopTvImportJob: FunctionReference<
      "mutation",
      "internal",
      { requestedBy?: Id<"users">; targetCount?: number },
      any
    >;
    failImportJob: FunctionReference<
      "mutation",
      "internal",
      { error: string; jobId: Id<"tmdbImportJobs"> },
      any
    >;
    getImportJob: FunctionReference<
      "query",
      "internal",
      { jobId: Id<"tmdbImportJobs"> },
      any
    >;
    getLatestTopTvImportJob: FunctionReference<"query", "internal", {}, any>;
    markJobRunning: FunctionReference<
      "mutation",
      "internal",
      { jobId: Id<"tmdbImportJobs"> },
      any
    >;
    runTopTvImportBatch: FunctionReference<
      "action",
      "internal",
      { jobId: Id<"tmdbImportJobs">; pagesPerBatch?: number },
      any
    >;
    startTopTvImport: FunctionReference<
      "action",
      "internal",
      { pagesPerBatch?: number; targetCount?: number },
      any
    >;
    upsertTmdbShowsBatch: FunctionReference<
      "mutation",
      "internal",
      {
        shows: Array<{
          backdropUrl?: string;
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
          year?: number;
        }>;
      },
      any
    >;
  };
  users: {
    getById: FunctionReference<
      "query",
      "internal",
      { userId: Id<"users"> },
      any
    >;
    getVisibleFavoriteShowsByUserIds: FunctionReference<
      "query",
      "internal",
      { userIds: Array<Id<"users">>; viewerId: Id<"users"> },
      any
    >;
  };
  watchStates: {
    getStatesForShowByUserIds: FunctionReference<
      "query",
      "internal",
      { showId: Id<"shows">; userIds: Array<Id<"users">> },
      any
    >;
  };
};

export declare const components: {};

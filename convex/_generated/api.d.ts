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
        rating: number;
        reviewText: string;
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
        username?: string;
      },
      any
    >;
  };
  watchLogs: {
    add: FunctionReference<
      "mutation",
      "public",
      { note?: string; showId: Id<"shows">; watchedAt: number },
      any
    >;
    deleteLog: FunctionReference<
      "mutation",
      "public",
      { logId: Id<"watchLogs"> },
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
  maintenance: {
    cleanupTmdbCache: FunctionReference<"mutation", "internal", {}, any>;
  };
  rateLimit: {
    enforce: FunctionReference<
      "mutation",
      "internal",
      { key: string; limit: number; windowMs: number },
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
  users: {
    getById: FunctionReference<
      "query",
      "internal",
      { userId: Id<"users"> },
      any
    >;
  };
};

export declare const components: {};

import type { PlotlistFunctionReference } from "./types";

function ref<Kind extends "query" | "mutation" | "action">(
  kind: Kind,
  name: string,
): PlotlistFunctionReference<Kind> {
  return { __kind: kind, __name: name };
}

export function getFunctionName(fn: unknown) {
  const name = (fn as { __name?: unknown })?.__name;
  if (typeof name !== "string") {
    throw new Error("Invalid Plotlist API function reference");
  }
  return name;
}

export const api = {
  auth: {
    isAuthenticated: ref("query", "auth:isAuthenticated"),
  },
  phone: {
    startVerification: ref("action", "phone:startVerification"),
  },
  users: {
    ensureProfile: ref("mutation", "users:ensureProfile"),
    updateProfile: ref("mutation", "users:updateProfile"),
    setOnboardingStep: ref("mutation", "users:setOnboardingStep"),
    deleteAccount: ref("mutation", "users:deleteAccount"),
    me: ref("query", "users:me"),
    exportData: ref("query", "users:exportData"),
    suggested: ref("query", "users:suggested"),
    profile: ref("query", "users:profile"),
    search: ref("query", "users:search"),
    getShowsById: ref("query", "users:getShowsById"),
  },
  storage: {
    generateUploadUrl: ref("mutation", "storage:generateUploadUrl"),
    getUrl: ref("query", "storage:getUrl"),
  },
  contacts: {
    clearSync: ref("mutation", "contacts:clearSync"),
    sendInvite: ref("mutation", "contacts:sendInvite"),
    syncSnapshot: ref("action", "contacts:syncSnapshot"),
    getStatus: ref("query", "contacts:getStatus"),
    getMatches: ref("query", "contacts:getMatches"),
    getInviteCandidates: ref("query", "contacts:getInviteCandidates"),
    searchInviteCandidates: ref("query", "contacts:searchInviteCandidates"),
  },
  follows: {
    follow: ref("mutation", "follows:follow"),
    unfollow: ref("mutation", "follows:unfollow"),
    isFollowing: ref("query", "follows:isFollowing"),
    listFollowersDetailed: ref("query", "follows:listFollowersDetailed"),
    listFollowingDetailed: ref("query", "follows:listFollowingDetailed"),
  },
  likes: {
    toggle: ref("mutation", "likes:toggle"),
    getForUserTarget: ref("query", "likes:getForUserTarget"),
    listForTarget: ref("query", "likes:listForTarget"),
  },
  comments: {
    add: ref("mutation", "comments:add"),
    deleteComment: ref("mutation", "comments:deleteComment"),
    listForTarget: ref("query", "comments:listForTarget"),
  },
  shows: {
    get: ref("query", "shows:get"),
    search: ref("query", "shows:search"),
    searchCatalog: ref("action", "shows:searchCatalog"),
    getTmdbList: ref("action", "shows:getTmdbList"),
    ingestFromCatalog: ref("action", "shows:ingestFromCatalog"),
    getExtendedDetails: ref("action", "shows:getExtendedDetails"),
    getSeasonDetails: ref("action", "shows:getSeasonDetails"),
  },
  watchStates: {
    setStatus: ref("mutation", "watchStates:setStatus"),
    removeStatus: ref("mutation", "watchStates:removeStatus"),
    getCounts: ref("query", "watchStates:getCounts"),
    getForShow: ref("query", "watchStates:getForShow"),
    listForUser: ref("query", "watchStates:listForUser"),
    listForUserDetailed: ref("query", "watchStates:listForUserDetailed"),
    listPublicWatchlistDetailed: ref("query", "watchStates:listPublicWatchlistDetailed"),
  },
  watchLogs: {
    deleteLog: ref("mutation", "watchLogs:deleteLog"),
    listActivityForUser: ref("query", "watchLogs:listActivityForUser"),
  },
  episodeProgress: {
    getStats: ref("query", "episodeProgress:getStats"),
    getUpNext: ref("query", "episodeProgress:getUpNext"),
    getProgressForShow: ref("query", "episodeProgress:getProgressForShow"),
    toggleEpisode: ref("mutation", "episodeProgress:toggleEpisode"),
    markSeasonWatched: ref("mutation", "episodeProgress:markSeasonWatched"),
    unmarkSeasonWatched: ref("mutation", "episodeProgress:unmarkSeasonWatched"),
  },
  reviews: {
    create: ref("mutation", "reviews:create"),
    rateEpisode: ref("mutation", "reviews:rateEpisode"),
    removeEpisodeRating: ref("mutation", "reviews:removeEpisodeRating"),
    deleteReview: ref("mutation", "reviews:deleteReview"),
    getDetailed: ref("query", "reviews:getDetailed"),
    listForShowDetailed: ref("query", "reviews:listForShowDetailed"),
    listForEpisodeDetailed: ref("query", "reviews:listForEpisodeDetailed"),
    listForUserDetailed: ref("query", "reviews:listForUserDetailed"),
    getMyEpisodeRatings: ref("query", "reviews:getMyEpisodeRatings"),
    getEpisodeStats: ref("query", "reviews:getEpisodeStats"),
  },
  lists: {
    create: ref("mutation", "lists:create"),
    deleteList: ref("mutation", "lists:deleteList"),
    get: ref("query", "lists:get"),
    listForUser: ref("query", "lists:listForUser"),
    listPublicForUser: ref("query", "lists:listPublicForUser"),
  },
  listItems: {
    toggle: ref("mutation", "listItems:toggle"),
    reorder: ref("mutation", "listItems:reorder"),
    listDetailed: ref("query", "listItems:listDetailed"),
    getShowMembership: ref("query", "listItems:getShowMembership"),
  },
  feed: {
    listForUser: ref("query", "feed:listForUser"),
  },
  trending: {
    shows: ref("query", "trending:shows"),
    mostReviewed: ref("query", "trending:mostReviewed"),
  },
  embeddings: {
    getViewerTastePreferences: ref("query", "embeddings:getViewerTastePreferences"),
    saveViewerTastePreferences: ref("action", "embeddings:saveViewerTastePreferences"),
    getPersonalizedRecommendations: ref("action", "embeddings:getPersonalizedRecommendations"),
    getHomeRecommendationRails: ref("action", "embeddings:getHomeRecommendationRails"),
    getSimilarTasteUsers: ref("action", "embeddings:getSimilarTasteUsers"),
    getListsFromSimilarTasteUsers: ref("action", "embeddings:getListsFromSimilarTasteUsers"),
    getSmartLists: ref("action", "embeddings:getSmartLists"),
    getSimilarShows: ref("action", "embeddings:getSimilarShows"),
    getShowTasteSocialProof: ref("action", "embeddings:getShowTasteSocialProof"),
    getProfileTasteExperience: ref("action", "embeddings:getProfileTasteExperience"),
  },
  releaseCalendar: {
    refreshForMe: ref("action", "releaseCalendar:refreshForMe"),
    getHomePreview: ref("query", "releaseCalendar:getHomePreview"),
    listForMe: ref("query", "releaseCalendar:listForMe"),
  },
  reports: {
    create: ref("mutation", "reports:create"),
    resolve: ref("mutation", "reports:resolve"),
    listOpen: ref("query", "reports:listOpen"),
  },
};

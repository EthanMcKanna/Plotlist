/**
 * Optimistic follow state across every cache that displays a person.
 *
 * A follow tap must repaint instantly on the row that was tapped *and* on
 * every other surface holding that person — people search, suggestions,
 * contact matches, follower/following lists, the follow-back pill on a
 * notification, and the profile header with its follower count. The
 * patchers here are pure (same reference back when nothing changed) so the
 * cache walker in lib/optimisticCache.ts can apply them everywhere without
 * hardcoding query args.
 */

import type { QueryClient } from "@tanstack/react-query";

import {
  mapPreservingIdentity,
  patchCachedQueries,
  patchPaginatedRows,
  type CacheWriter,
} from "./optimisticCache";

export type FollowState = {
  isFollowing: boolean;
  /** Private accounts turn a follow into a pending request. */
  hasPendingRequest: boolean;
};

export const FOLLOWING: FollowState = { isFollowing: true, hasPendingRequest: false };
export const REQUESTED: FollowState = { isFollowing: false, hasPendingRequest: true };
export const NOT_FOLLOWING: FollowState = { isFollowing: false, hasPendingRequest: false };

/** Optimistic state for tapping "Follow" on a profile that may be private. */
export function followStateForTap(isPrivate: boolean): FollowState {
  return isPrivate ? REQUESTED : FOLLOWING;
}

/** Queries whose payloads carry a viewer→person follow flag. */
export const FOLLOW_STATE_CARRIER_QUERIES = [
  "users:search",
  "users:suggested",
  "users:profile",
  "contacts:getMatches",
  "follows:listFollowersDetailed",
  "follows:listFollowingDetailed",
  "follows:listMutualFollowers",
  "followRequests:listIncoming",
  "notifications:list",
] as const;

// Person previews (buildPersonPreviews): { user: {_id}, isFollowing, followsYou, isMutualFollow }
// Notification rows: { actor: {_id, viewerFollows, viewerRequested} }
function patchPersonRow(row: any, userId: string, next: FollowState): any {
  if (!row || typeof row !== "object") return row;

  if (row.user?._id === userId && "isFollowing" in row) {
    if (Boolean(row.isFollowing) === next.isFollowing) return row;
    return {
      ...row,
      isFollowing: next.isFollowing,
      isMutualFollow: next.isFollowing && Boolean(row.followsYou),
    };
  }

  if (row.actor?._id === userId && "viewerFollows" in row.actor) {
    const actor = row.actor;
    if (
      Boolean(actor.viewerFollows) === next.isFollowing &&
      Boolean(actor.viewerRequested) === next.hasPendingRequest
    ) {
      return row;
    }
    return {
      ...row,
      actor: {
        ...actor,
        viewerFollows: next.isFollowing,
        viewerRequested: next.hasPendingRequest,
      },
    };
  }

  return row;
}

/**
 * Patches a `users:profile` payload: relationship flags plus the follower
 * count, which moves only when the follow edge itself appears or goes (a
 * pending request does not count as a follower).
 */
export function patchProfileFollowState(profile: any, userId: string, next: FollowState): any {
  if (!profile || typeof profile !== "object" || !profile.relationship) return profile;
  if (profile.user?._id !== userId) return profile;
  const relationship = profile.relationship;
  const wasFollowing = Boolean(relationship.isFollowing);
  if (
    wasFollowing === next.isFollowing &&
    Boolean(relationship.hasPendingRequest) === next.hasPendingRequest
  ) {
    return profile;
  }
  const followerDelta = wasFollowing === next.isFollowing ? 0 : next.isFollowing ? 1 : -1;
  const counts =
    profile.counts && typeof profile.counts === "object" && followerDelta !== 0
      ? {
          ...profile.counts,
          followers: Math.max(0, Number(profile.counts.followers ?? 0) + followerDelta),
        }
      : profile.counts;
  return {
    ...profile,
    counts,
    relationship: {
      ...relationship,
      isFollowing: next.isFollowing,
      hasPendingRequest: next.hasPendingRequest,
      isMutualFollow: next.isFollowing && Boolean(relationship.followsYou),
    },
  };
}

/** Patches any carrier payload shape (array, paginated page, or profile). */
export function patchFollowStateInData(data: any, userId: string, next: FollowState): any {
  if (Array.isArray(data)) {
    return mapPreservingIdentity(data, (row) => patchPersonRow(row, userId, next));
  }
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data.page) || Array.isArray(data.results)) {
    return patchPaginatedRows(data, (rows) =>
      mapPreservingIdentity(rows, (row) => patchPersonRow(row, userId, next)),
    );
  }
  if (data.relationship) {
    return patchProfileFollowState(data, userId, next);
  }
  return patchPersonRow(data, userId, next);
}

/** Applies a follow state for one person to every cached carrier query. */
export function applyFollowStateToCaches(
  store: CacheWriter,
  client: QueryClient,
  userId: string,
  next: FollowState,
): number {
  return patchCachedQueries(store, client, FOLLOW_STATE_CARRIER_QUERIES, (data) =>
    patchFollowStateInData(data, userId, next),
  );
}

/**
 * Accept/decline: the request leaves the incoming list on every cached page
 * and the badge count drops by one, whatever args the count was fetched with.
 */
export function removeIncomingFollowRequestFromCaches(
  store: CacheWriter,
  client: QueryClient,
  requesterId: string,
): number {
  let touched = patchCachedQueries(store, client, ["followRequests:listIncoming"], (data) =>
    patchPaginatedRows(data, (rows) => {
      const next = rows.filter((row) => row?.user?._id !== requesterId);
      return next.length === rows.length ? rows : next;
    }),
  );
  touched += patchCachedQueries(store, client, ["followRequests:getIncomingCount"], (count) =>
    typeof count === "number" ? Math.max(0, count - 1) : count,
  );
  return touched;
}

/**
 * Optimistic like state across every cache that displays the target.
 *
 * Review payloads (`buildReviewDetails`) carry `likeCount`/`likedByViewer`
 * and are rendered on the review screen, the show's review rail, the episode
 * sheet and profile pages at once. A tap on the heart patches all of them in
 * place, plus the like list/flag queries the standalone LikeButton reads, so
 * no surface has to refetch — and none re-sorts under the finger.
 */

import type { QueryClient } from "@tanstack/react-query";

import {
  mapPreservingIdentity,
  patchCachedQueries,
  patchPaginatedRows,
  type CacheWriter,
} from "./optimisticCache";

export type LikeTarget = { targetType: string; targetId: string };

/** Queries whose rows embed a review with its like count. */
export const LIKE_COUNT_CARRIER_QUERIES = [
  "reviews:getDetailed",
  "reviews:listForShowDetailed",
  "reviews:listForEpisodeDetailed",
  "reviews:listForUserDetailed",
] as const;

export function optimisticLikeId(target: LikeTarget) {
  return `optimistic:${target.targetType}:${target.targetId}`;
}

function matchesTarget(args: Record<string, any> | undefined, target: LikeTarget) {
  return (
    Boolean(args) &&
    args!.targetType === target.targetType &&
    args!.targetId === target.targetId
  );
}

// Review details row: { review: {_id}, likeCount, likedByViewer }
function patchReviewDetailsRow(row: any, target: LikeTarget, liked: boolean): any {
  if (target.targetType !== "review") return row;
  if (!row || typeof row !== "object" || row.review?._id !== target.targetId) return row;
  if (Boolean(row.likedByViewer) === liked) return row;
  return {
    ...row,
    likedByViewer: liked,
    likeCount: Math.max(0, Number(row.likeCount ?? 0) + (liked ? 1 : -1)),
  };
}

/** Patches any carrier payload shape (array, paginated page, single row). */
export function patchLikeCarrierData(data: any, target: LikeTarget, liked: boolean): any {
  if (Array.isArray(data)) {
    return mapPreservingIdentity(data, (row) => patchReviewDetailsRow(row, target, liked));
  }
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data.page) || Array.isArray(data.results)) {
    return patchPaginatedRows(data, (rows) =>
      mapPreservingIdentity(rows, (row) => patchReviewDetailsRow(row, target, liked)),
    );
  }
  return patchReviewDetailsRow(data, target, liked);
}

/**
 * Patches the viewer's like row list for the target: prepend an optimistic
 * row on like, drop the viewer's row (server or optimistic) on unlike.
 */
export function patchLikeList(
  list: any,
  target: LikeTarget,
  liked: boolean,
  viewerId: string | null,
): any {
  if (!Array.isArray(list)) return list;
  const optimisticId = optimisticLikeId(target);
  const isViewerLike = (like: any) =>
    like?._id === optimisticId || (viewerId !== null && like?.userId === viewerId);
  if (liked) {
    if (list.some(isViewerLike)) return list;
    return [
      {
        _id: optimisticId,
        userId: viewerId ?? "me",
        targetType: target.targetType,
        targetId: target.targetId,
        createdAt: Date.now(),
      },
      ...list,
    ];
  }
  const next = list.filter((like) => !isViewerLike(like));
  return next.length === list.length ? list : next;
}

/**
 * Applies one like toggle to every cache that shows it: the viewer flag and
 * like list for the target (any `limit`), and every review payload carrying
 * the count.
 */
export function applyLikeToggleToCaches(
  store: CacheWriter,
  client: QueryClient,
  target: LikeTarget,
  liked: boolean,
  viewerId: string | null,
): number {
  let touched = patchCachedQueries(store, client, ["likes:getForUserTarget"], (data, args) =>
    matchesTarget(args, target) && Boolean(data) !== liked ? liked : data,
  );
  touched += patchCachedQueries(store, client, ["likes:listForTarget"], (data, args) =>
    matchesTarget(args, target) ? patchLikeList(data, target, liked, viewerId) : data,
  );
  touched += patchCachedQueries(store, client, LIKE_COUNT_CARRIER_QUERIES, (data) =>
    patchLikeCarrierData(data, target, liked),
  );
  return touched;
}

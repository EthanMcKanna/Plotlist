import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { contactSyncEntries, follows, users, watchStates } from "../../db/schema";
import { db } from "./db";
import { chunkForSqlParams } from "./sql-dialect";

const DEFAULT_PROFILE_VISIBILITY = {
  favorites: "public",
  currentlyWatching: "public",
  watchlist: "public",
} as const;

export function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toClientUser(user: typeof users.$inferSelect) {
  return {
    ...user,
    _id: user.id,
    _creationTime: user.createdAt,
    avatarStorageId: user.avatarUrl ?? null,
    profileVisibility: user.profileVisibility ?? DEFAULT_PROFILE_VISIBILITY,
  };
}

export type PersonPreview = {
  user: ReturnType<typeof toClientUser>;
  avatarUrl: string | null;
  isSelf: boolean;
  isFollowing: boolean;
  followsYou: boolean;
  isMutualFollow: boolean;
  mutualCount: number;
  inContacts: boolean;
  sharedShowCount: number;
};

// Every query below is scoped to the candidate page (chunked under D1's
// 100-bound-parameter cap) instead of loading the viewer's entire follow
// graph, contact book, and watch history into memory. Cost scales with the
// page size, not with how many people the viewer follows.
export async function buildPersonPreviews(
  viewerId: string,
  candidates: Array<typeof users.$inferSelect>,
  options?: { includeViewer?: boolean },
): Promise<PersonPreview[]> {
  const includeViewer = options?.includeViewer ?? false;
  const uniqueCandidates = candidates.filter(
    (candidate, index, items) =>
      items.findIndex((item) => item.id === candidate.id) === index &&
      (includeViewer || candidate.id !== viewerId),
  );
  if (uniqueCandidates.length === 0) {
    return [];
  }

  const candidateIds = uniqueCandidates
    .map((candidate) => candidate.id)
    .filter((id) => id !== viewerId);

  const followingIds = new Set<string>();
  const followerIds = new Set<string>();
  const contactMatchIds = new Set<string>();
  const mutualCountByUser = new Map<string, number>();
  const sharedShowCountByUser = new Map<string, number>();

  const viewerFollows = alias(follows, "viewer_follows");
  const viewerWatch = alias(watchStates, "viewer_watch_states");

  for (const chunk of chunkForSqlParams(candidateIds, 1, 80)) {
    const [
      followingRows,
      followerRows,
      contactRows,
      mutualRows,
      sharedShowRows,
    ] = await Promise.all([
      db
        .select({ followeeId: follows.followeeId })
        .from(follows)
        .where(and(eq(follows.followerId, viewerId), inArray(follows.followeeId, chunk))),
      db
        .select({ followerId: follows.followerId })
        .from(follows)
        .where(and(eq(follows.followeeId, viewerId), inArray(follows.followerId, chunk))),
      db
        .select({ matchedUserId: contactSyncEntries.matchedUserId })
        .from(contactSyncEntries)
        .where(
          and(
            eq(contactSyncEntries.ownerId, viewerId),
            isNotNull(contactSyncEntries.matchedUserId),
            inArray(contactSyncEntries.matchedUserId, chunk),
          ),
        ),
      // Mutuals: people the viewer follows who also follow the candidate.
      db
        .select({
          followeeId: follows.followeeId,
          value: sql<number>`count(*)`,
        })
        .from(follows)
        .innerJoin(
          viewerFollows,
          and(
            eq(viewerFollows.followeeId, follows.followerId),
            eq(viewerFollows.followerId, viewerId),
          ),
        )
        .where(inArray(follows.followeeId, chunk))
        .groupBy(follows.followeeId),
      // Shows both the viewer and the candidate have in their libraries.
      db
        .select({
          userId: watchStates.userId,
          value: sql<number>`count(distinct ${watchStates.showId})`,
        })
        .from(watchStates)
        .innerJoin(
          viewerWatch,
          and(
            eq(viewerWatch.showId, watchStates.showId),
            eq(viewerWatch.userId, viewerId),
          ),
        )
        .where(inArray(watchStates.userId, chunk))
        .groupBy(watchStates.userId),
    ]);

    for (const row of followingRows) followingIds.add(row.followeeId);
    for (const row of followerRows) followerIds.add(row.followerId);
    for (const row of contactRows) {
      if (row.matchedUserId) contactMatchIds.add(row.matchedUserId);
    }
    for (const row of mutualRows) {
      mutualCountByUser.set(row.followeeId, Number(row.value ?? 0));
    }
    for (const row of sharedShowRows) {
      sharedShowCountByUser.set(row.userId, Number(row.value ?? 0));
    }
  }

  return uniqueCandidates.map((candidate) => {
    const isSelf = candidate.id === viewerId;
    const isFollowing = !isSelf && followingIds.has(candidate.id);
    const followsYou = !isSelf && followerIds.has(candidate.id);

    return {
      user: toClientUser(candidate),
      avatarUrl: candidate.avatarUrl ?? candidate.image ?? null,
      isSelf,
      isFollowing,
      followsYou,
      isMutualFollow: isFollowing && followsYou,
      mutualCount: isSelf ? 0 : mutualCountByUser.get(candidate.id) ?? 0,
      inContacts: !isSelf && contactMatchIds.has(candidate.id),
      sharedShowCount: isSelf ? 0 : sharedShowCountByUser.get(candidate.id) ?? 0,
    };
  });
}

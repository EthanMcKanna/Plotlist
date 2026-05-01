import { desc, eq, inArray } from "drizzle-orm";

import { contactSyncEntries, follows, users } from "../../db/schema";
import { db } from "./db";

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

export async function buildPersonPreviews(
  viewerId: string,
  candidates: Array<typeof users.$inferSelect>,
) {
  const uniqueCandidates = candidates.filter(
    (candidate, index, items) =>
      items.findIndex((item) => item.id === candidate.id) === index && candidate.id !== viewerId,
  );
  if (uniqueCandidates.length === 0) {
    return [];
  }

  const candidateIds = uniqueCandidates.map((candidate) => candidate.id);
  const [viewerFollowees, viewerFollowers, viewerContactEntries, candidateFollowerRows] =
    await Promise.all([
      db
        .select()
        .from(follows)
        .where(eq(follows.followerId, viewerId))
        .orderBy(desc(follows.createdAt)),
      db
        .select()
        .from(follows)
        .where(eq(follows.followeeId, viewerId))
        .orderBy(desc(follows.createdAt)),
      db
        .select()
        .from(contactSyncEntries)
        .where(eq(contactSyncEntries.ownerId, viewerId))
        .orderBy(desc(contactSyncEntries.updatedAt)),
      db.select().from(follows).where(inArray(follows.followeeId, candidateIds)),
    ]);

  const followeeIds = new Set(viewerFollowees.map((item) => item.followeeId));
  const followerIds = new Set(viewerFollowers.map((item) => item.followerId));
  const contactMatchIds = new Set(
    viewerContactEntries.flatMap((entry) => (entry.matchedUserId ? [entry.matchedUserId] : [])),
  );
  const candidateFollowerIdsByUser = new Map<string, Set<string>>();

  for (const row of candidateFollowerRows) {
    const set = candidateFollowerIdsByUser.get(row.followeeId) ?? new Set<string>();
    set.add(row.followerId);
    candidateFollowerIdsByUser.set(row.followeeId, set);
  }

  return uniqueCandidates.map((candidate) => {
    const candidateFollowerIds = candidateFollowerIdsByUser.get(candidate.id) ?? new Set<string>();
    let mutualCount = 0;
    for (const followeeId of followeeIds) {
      if (candidateFollowerIds.has(followeeId)) {
        mutualCount += 1;
      }
    }

    const isFollowing = followeeIds.has(candidate.id);
    const followsYou = followerIds.has(candidate.id);

    return {
      user: toClientUser(candidate),
      avatarUrl: candidate.avatarUrl ?? candidate.image ?? null,
      isFollowing,
      followsYou,
      isMutualFollow: isFollowing && followsYou,
      mutualCount,
      inContacts: contactMatchIds.has(candidate.id),
    };
  });
}

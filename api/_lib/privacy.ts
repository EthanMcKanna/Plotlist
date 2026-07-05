import { and, eq, inArray, or } from "drizzle-orm";

import { blocks, follows, users } from "../../db/schema";
import { canViewPrivateProfileContent } from "../../lib/profilePrivacy";
import { db } from "./db";
import { chunkForSqlParams } from "./sql-dialect";

export type BlockStatus = {
  // The viewer blocked the other user.
  blockedByViewer: boolean;
  // The other user blocked the viewer.
  hasBlockedViewer: boolean;
};

export const NO_BLOCK: BlockStatus = { blockedByViewer: false, hasBlockedViewer: false };

export function isBlockedEitherWay(status: BlockStatus | null | undefined) {
  return Boolean(status && (status.blockedByViewer || status.hasBlockedViewer));
}

export async function getBlockStatus(
  viewerId: string | null | undefined,
  otherId: string,
): Promise<BlockStatus> {
  if (!viewerId || viewerId === otherId) {
    return NO_BLOCK;
  }
  const rows = await db
    .select({ blockerId: blocks.blockerId, blockedId: blocks.blockedId })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blockerId, viewerId), eq(blocks.blockedId, otherId)),
        and(eq(blocks.blockerId, otherId), eq(blocks.blockedId, viewerId)),
      ),
    )
    .limit(2);
  return {
    blockedByViewer: rows.some((row) => row.blockerId === viewerId),
    hasBlockedViewer: rows.some((row) => row.blockerId === otherId),
  };
}

// Ids among the candidates with a block in either direction relative to the
// viewer. Chunked to stay under D1's bound-parameter cap.
export async function getBlockedEitherWayIdSet(
  viewerId: string | null | undefined,
  candidateIds: string[],
): Promise<Set<string>> {
  const blocked = new Set<string>();
  if (!viewerId) {
    return blocked;
  }
  const uniqueIds = Array.from(new Set(candidateIds)).filter((id) => id !== viewerId);
  for (const chunk of chunkForSqlParams(uniqueIds, 2, 80)) {
    const rows = await db
      .select({ blockerId: blocks.blockerId, blockedId: blocks.blockedId })
      .from(blocks)
      .where(
        or(
          and(eq(blocks.blockerId, viewerId), inArray(blocks.blockedId, chunk)),
          and(eq(blocks.blockedId, viewerId), inArray(blocks.blockerId, chunk)),
        ),
      );
    for (const row of rows) {
      blocked.add(row.blockerId === viewerId ? row.blockedId : row.blockerId);
    }
  }
  return blocked;
}

export type ProfileAudience = {
  isSelf: boolean;
  viewerFollowsProfile: boolean;
  block: BlockStatus;
  // Whether the viewer may see the profile's content surfaces (reviews,
  // lists, watchlist, followers). False when blocked either way or when the
  // account is private and the viewer isn't an approved follower.
  canViewContent: boolean;
};

// One shared gate for every "list things belonging to user X" endpoint.
export async function getProfileAudience(
  viewerId: string | null | undefined,
  profileUser: Pick<typeof users.$inferSelect, "id" | "isPrivate">,
): Promise<ProfileAudience> {
  const isSelf = Boolean(viewerId && viewerId === profileUser.id);
  if (isSelf) {
    return { isSelf: true, viewerFollowsProfile: false, block: NO_BLOCK, canViewContent: true };
  }

  const [block, followRows] = await Promise.all([
    getBlockStatus(viewerId, profileUser.id),
    viewerId
      ? db
          .select({ id: follows.id })
          .from(follows)
          .where(and(eq(follows.followerId, viewerId), eq(follows.followeeId, profileUser.id)))
          .limit(1)
      : Promise.resolve([] as Array<{ id: string }>),
  ]);
  const viewerFollowsProfile = followRows.length > 0;

  const canViewContent =
    !isBlockedEitherWay(block) &&
    canViewPrivateProfileContent(profileUser.isPrivate, {
      isOwnProfile: false,
      viewerFollowsProfile,
    });

  return { isSelf, viewerFollowsProfile, block, canViewContent };
}

export async function getUserById(userId: string) {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return rows[0] ?? null;
}

import type { IncomingMessage } from "node:http";

import { and, eq, or } from "drizzle-orm";

import { blocks, follows, users } from "../../db/schema";
import { canViewPrivateProfileContent } from "../../lib/profilePrivacy";
import { db } from "./db";

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

// Every user with a block in either direction relative to the viewer (never
// the viewer themselves). Block lists are tiny — typically none, a handful at
// most — so one indexed read of the whole set (blocks_pair_idx for the
// blocker side, blocks_blocked_idx for the other) beats probing candidate
// chunks, and it doesn't depend on the candidates, so callers can start it
// alongside their main query and filter in JS.
async function readViewerBlockedIdSet(viewerId: string): Promise<Set<string>> {
  const rows = await db
    .select({ blockerId: blocks.blockerId, blockedId: blocks.blockedId })
    .from(blocks)
    .where(or(eq(blocks.blockerId, viewerId), eq(blocks.blockedId, viewerId)));
  const blocked = new Set<string>();
  for (const row of rows) {
    blocked.add(row.blockerId === viewerId ? row.blockedId : row.blockerId);
  }
  blocked.delete(viewerId);
  return blocked;
}

const viewerBlockedIdSetByRequest = new WeakMap<
  IncomingMessage,
  Map<string, Promise<Set<string>>>
>();

// readViewerBlockedIdSet memoized per request (and viewer), so a handler can
// kick it off early and every later filter in the same request reuses it.
export function getViewerBlockedIdSet(
  viewerId: string | null | undefined,
  req?: IncomingMessage,
): Promise<Set<string>> {
  if (!viewerId) {
    return Promise.resolve(new Set<string>());
  }
  if (!req) {
    return readViewerBlockedIdSet(viewerId);
  }
  let byViewer = viewerBlockedIdSetByRequest.get(req);
  if (!byViewer) {
    byViewer = new Map();
    viewerBlockedIdSetByRequest.set(req, byViewer);
  }
  const cached = byViewer.get(viewerId);
  if (cached) {
    return cached;
  }
  const pending = readViewerBlockedIdSet(viewerId);
  byViewer.set(viewerId, pending);
  // A rejected read shouldn't stay memoized for the rest of the request.
  pending.catch(() => {
    if (byViewer?.get(viewerId) === pending) {
      byViewer.delete(viewerId);
    }
  });
  return pending;
}

// Ids among the candidates with a block in either direction relative to the
// viewer. One round trip regardless of candidate count (see above); pass the
// request to share the viewer's block set with other filters in it.
export async function getBlockedEitherWayIdSet(
  viewerId: string | null | undefined,
  candidateIds: string[],
  req?: IncomingMessage,
): Promise<Set<string>> {
  const blocked = new Set<string>();
  if (!viewerId) {
    return blocked;
  }
  const uniqueIds = Array.from(new Set(candidateIds)).filter((id) => id !== viewerId);
  if (uniqueIds.length === 0) {
    return blocked;
  }
  const viewerBlocked = await getViewerBlockedIdSet(viewerId, req);
  for (const id of uniqueIds) {
    if (viewerBlocked.has(id)) {
      blocked.add(id);
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

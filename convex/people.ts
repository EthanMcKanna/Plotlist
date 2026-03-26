import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

type ViewerContext = {
  viewerId: Id<"users">;
  followeeIds: Set<Id<"users">>;
  followerIds: Set<Id<"users">>;
  contactMatchIds: Set<Id<"users">>;
};

export type PersonPreview = {
  user: {
    _id: Id<"users">;
    username?: string;
    displayName?: string;
    name?: string;
  };
  avatarUrl: string | null;
  isFollowing: boolean;
  followsYou: boolean;
  isMutualFollow: boolean;
  mutualCount: number;
  inContacts: boolean;
};

async function loadViewerContext(ctx: any, viewerId: Id<"users">): Promise<ViewerContext> {
  const [followees, followers, contactEntries] = await Promise.all([
    ctx.db
      .query("follows")
      .withIndex("by_follower_createdAt", (q: any) => q.eq("followerId", viewerId))
      .collect(),
    ctx.db
      .query("follows")
      .withIndex("by_followee_createdAt", (q: any) => q.eq("followeeId", viewerId))
      .collect(),
    ctx.db
      .query("contactSyncEntries")
      .withIndex("by_owner_updatedAt", (q: any) => q.eq("ownerId", viewerId))
      .collect(),
  ]);

  return {
    viewerId,
    followeeIds: new Set(followees.map((item: any) => item.followeeId)),
    followerIds: new Set(followers.map((item: any) => item.followerId)),
    contactMatchIds: new Set(
      contactEntries.flatMap((entry: any) =>
        entry.matchedUserId ? [entry.matchedUserId] : [],
      ),
    ),
  };
}

async function buildPersonPreview(
  ctx: any,
  context: ViewerContext,
  candidate: Doc<"users">,
): Promise<PersonPreview> {
  const [avatarUrl, candidateFollowers] = await Promise.all([
    candidate.avatarStorageId
      ? ctx.storage.getUrl(candidate.avatarStorageId)
      : Promise.resolve(candidate.image ?? null),
    ctx.db
      .query("follows")
      .withIndex("by_followee_createdAt", (q: any) => q.eq("followeeId", candidate._id))
      .collect(),
  ]);

  const candidateFollowerIds = new Set(
    candidateFollowers.map((item: any) => item.followerId as Id<"users">),
  );
  let mutualCount = 0;
  for (const followeeId of context.followeeIds) {
    if (candidateFollowerIds.has(followeeId)) {
      mutualCount += 1;
    }
  }

  const isFollowing = context.followeeIds.has(candidate._id);
  const followsYou = context.followerIds.has(candidate._id);

  return {
    user: {
      _id: candidate._id,
      username: candidate.username,
      displayName: candidate.displayName,
      name: candidate.name,
    },
    avatarUrl: avatarUrl ?? null,
    isFollowing,
    followsYou,
    isMutualFollow: isFollowing && followsYou,
    mutualCount,
    inContacts: context.contactMatchIds.has(candidate._id),
  };
}

export async function buildPersonPreviews(
  ctx: any,
  viewerId: Id<"users">,
  candidates: Doc<"users">[],
  options?: { excludeViewer?: boolean },
) {
  const excludeViewer = options?.excludeViewer ?? true;
  const uniqueCandidates = candidates.filter(
    (candidate, index, items) =>
      items.findIndex((item) => item._id === candidate._id) === index &&
      (!excludeViewer || candidate._id !== viewerId),
  );
  const context = await loadViewerContext(ctx, viewerId);
  return await Promise.all(
    uniqueCandidates.map((candidate) => buildPersonPreview(ctx, context, candidate)),
  );
}

export const buildPreviewsByUserIds = internalQuery({
  args: {
    viewerId: v.id("users"),
    candidateIds: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const candidates = await Promise.all(
      args.candidateIds.map((candidateId) => ctx.db.get(candidateId)),
    );

    return await buildPersonPreviews(
      ctx,
      args.viewerId,
      candidates.filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate)),
    );
  },
});

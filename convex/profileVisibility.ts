import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";

export const ProfileSectionVisibility = v.union(
  v.literal("public"),
  v.literal("following"),
  v.literal("private"),
);

export type ProfileSectionVisibilityValue =
  | "public"
  | "following"
  | "private";

export type ProfileVisibilitySettings = {
  favorites: ProfileSectionVisibilityValue;
  currentlyWatching: ProfileSectionVisibilityValue;
  watchlist: ProfileSectionVisibilityValue;
};

export const DEFAULT_PROFILE_VISIBILITY: ProfileVisibilitySettings = {
  favorites: "public",
  currentlyWatching: "public",
  watchlist: "public",
};

export const ProfileVisibility = v.object({
  favorites: ProfileSectionVisibility,
  currentlyWatching: ProfileSectionVisibility,
  watchlist: ProfileSectionVisibility,
});

export function getProfileVisibilitySettings(
  user: { profileVisibility?: Partial<ProfileVisibilitySettings> } | null | undefined,
): ProfileVisibilitySettings {
  return {
    ...DEFAULT_PROFILE_VISIBILITY,
    ...(user?.profileVisibility ?? {}),
  };
}

export async function getOwnerFollowsViewer(
  ctx: QueryCtx,
  ownerId: Id<"users">,
  viewerId: Id<"users"> | null,
) {
  if (!viewerId || ownerId === viewerId) {
    return false;
  }

  const follow = await ctx.db
    .query("follows")
    .withIndex("by_pair", (q) => q.eq("followerId", ownerId).eq("followeeId", viewerId))
    .unique();

  return Boolean(follow);
}

export function canViewerSeeSection(args: {
  ownerId: Id<"users">;
  viewerId: Id<"users"> | null;
  visibility: ProfileSectionVisibilityValue;
  ownerFollowsViewer: boolean;
}) {
  const { ownerId, viewerId, visibility, ownerFollowsViewer } = args;

  if (viewerId === ownerId) {
    return true;
  }
  if (visibility === "public") {
    return true;
  }
  if (!viewerId || visibility === "private") {
    return false;
  }

  return ownerFollowsViewer;
}

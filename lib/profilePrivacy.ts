// Pure profile-privacy logic shared by the worker (enforcement) and the app
// (settings UI). No database or platform imports so it stays unit testable.

export const PROFILE_SECTION_KEYS = ["favorites", "currentlyWatching", "watchlist"] as const;
export type ProfileSectionKey = (typeof PROFILE_SECTION_KEYS)[number];

export const PROFILE_VISIBILITY_VALUES = ["public", "followers", "private"] as const;
export type ProfileVisibilityValue = (typeof PROFILE_VISIBILITY_VALUES)[number];

export type ProfileVisibilitySettings = Record<ProfileSectionKey, ProfileVisibilityValue>;

export const DEFAULT_PROFILE_VISIBILITY: ProfileVisibilitySettings = {
  favorites: "public",
  currentlyWatching: "public",
  watchlist: "public",
};

// Legacy accounts stored "following" (visible to people the owner follows)
// from before follower approval existed. It maps to the follower-gated tier
// so the three settings stay coherent with private accounts.
export function normalizeProfileVisibilityValue(value: unknown): ProfileVisibilityValue {
  if (value === "followers" || value === "private") {
    return value;
  }
  if (value === "following") {
    return "followers";
  }
  return "public";
}

export function resolveProfileVisibility(
  stored: Record<string, unknown> | null | undefined,
): ProfileVisibilitySettings {
  const resolved = {} as ProfileVisibilitySettings;
  for (const key of PROFILE_SECTION_KEYS) {
    resolved[key] = normalizeProfileVisibilityValue(stored?.[key]);
  }
  return resolved;
}

export type ProfileViewContext = {
  isOwnProfile: boolean;
  // Whether the viewer follows the profile owner. On private accounts this
  // means the owner approved them.
  viewerFollowsProfile: boolean;
};

export function canViewProfileSection(setting: unknown, context: ProfileViewContext): boolean {
  if (context.isOwnProfile) {
    return true;
  }
  const value = normalizeProfileVisibilityValue(setting);
  if (value === "public") {
    return true;
  }
  return value === "followers" && context.viewerFollowsProfile;
}

// Private accounts gate every profile surface (reviews, lists, watch data,
// followers) behind an approved follow, on top of per-section settings.
export function canViewPrivateProfileContent(
  profileIsPrivate: boolean | null | undefined,
  context: ProfileViewContext,
): boolean {
  if (!profileIsPrivate) {
    return true;
  }
  return context.isOwnProfile || context.viewerFollowsProfile;
}

export type FollowButtonState = "follow" | "requested" | "following";

export function getFollowButtonState(input: {
  isFollowing: boolean;
  hasPendingRequest: boolean;
}): FollowButtonState {
  if (input.isFollowing) {
    return "following";
  }
  return input.hasPendingRequest ? "requested" : "follow";
}

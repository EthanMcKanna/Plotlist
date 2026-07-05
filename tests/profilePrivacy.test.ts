import { describe, expect, it } from "@jest/globals";

import {
  canViewPrivateProfileContent,
  canViewProfileSection,
  DEFAULT_PROFILE_VISIBILITY,
  getFollowButtonState,
  normalizeProfileVisibilityValue,
  resolveProfileVisibility,
} from "../lib/profilePrivacy";

describe("normalizeProfileVisibilityValue", () => {
  it("keeps the current values", () => {
    expect(normalizeProfileVisibilityValue("public")).toBe("public");
    expect(normalizeProfileVisibilityValue("followers")).toBe("followers");
    expect(normalizeProfileVisibilityValue("private")).toBe("private");
  });

  it("maps the legacy 'following' value to the follower-gated tier", () => {
    expect(normalizeProfileVisibilityValue("following")).toBe("followers");
  });

  it("falls back to public for unknown or missing values", () => {
    expect(normalizeProfileVisibilityValue(undefined)).toBe("public");
    expect(normalizeProfileVisibilityValue(null)).toBe("public");
    expect(normalizeProfileVisibilityValue("friends-of-friends")).toBe("public");
    expect(normalizeProfileVisibilityValue(42)).toBe("public");
  });
});

describe("resolveProfileVisibility", () => {
  it("defaults every section to public", () => {
    expect(resolveProfileVisibility(null)).toEqual(DEFAULT_PROFILE_VISIBILITY);
    expect(resolveProfileVisibility({})).toEqual(DEFAULT_PROFILE_VISIBILITY);
  });

  it("normalizes stored values and drops unknown keys", () => {
    expect(
      resolveProfileVisibility({
        favorites: "following",
        watchlist: "private",
        somethingElse: "private",
      }),
    ).toEqual({
      favorites: "followers",
      currentlyWatching: "public",
      watchlist: "private",
    });
  });
});

describe("canViewProfileSection", () => {
  const stranger = { isOwnProfile: false, viewerFollowsProfile: false };
  const follower = { isOwnProfile: false, viewerFollowsProfile: true };
  const owner = { isOwnProfile: true, viewerFollowsProfile: false };

  it("always allows the owner", () => {
    expect(canViewProfileSection("private", owner)).toBe(true);
  });

  it("allows everyone for public sections", () => {
    expect(canViewProfileSection("public", stranger)).toBe(true);
  });

  it("gates followers-only sections on the viewer following the profile", () => {
    expect(canViewProfileSection("followers", follower)).toBe(true);
    expect(canViewProfileSection("followers", stranger)).toBe(false);
  });

  it("treats legacy 'following' as followers-gated", () => {
    expect(canViewProfileSection("following", follower)).toBe(true);
    expect(canViewProfileSection("following", stranger)).toBe(false);
  });

  it("hides only-me sections from everyone else", () => {
    expect(canViewProfileSection("private", follower)).toBe(false);
    expect(canViewProfileSection("private", stranger)).toBe(false);
  });
});

describe("canViewPrivateProfileContent", () => {
  it("is open when the account is not private", () => {
    expect(
      canViewPrivateProfileContent(false, { isOwnProfile: false, viewerFollowsProfile: false }),
    ).toBe(true);
    expect(
      canViewPrivateProfileContent(null, { isOwnProfile: false, viewerFollowsProfile: false }),
    ).toBe(true);
  });

  it("requires an approved follow on private accounts", () => {
    expect(
      canViewPrivateProfileContent(true, { isOwnProfile: false, viewerFollowsProfile: true }),
    ).toBe(true);
    expect(
      canViewPrivateProfileContent(true, { isOwnProfile: false, viewerFollowsProfile: false }),
    ).toBe(false);
  });

  it("always allows the owner", () => {
    expect(
      canViewPrivateProfileContent(true, { isOwnProfile: true, viewerFollowsProfile: false }),
    ).toBe(true);
  });
});

describe("getFollowButtonState", () => {
  it("prefers following over requested", () => {
    expect(getFollowButtonState({ isFollowing: true, hasPendingRequest: false })).toBe(
      "following",
    );
    expect(getFollowButtonState({ isFollowing: true, hasPendingRequest: true })).toBe(
      "following",
    );
  });

  it("shows requested while a request is pending", () => {
    expect(getFollowButtonState({ isFollowing: false, hasPendingRequest: true })).toBe(
      "requested",
    );
  });

  it("defaults to follow", () => {
    expect(getFollowButtonState({ isFollowing: false, hasPendingRequest: false })).toBe(
      "follow",
    );
  });
});

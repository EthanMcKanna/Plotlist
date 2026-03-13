import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserOrThrow, normalizeSearchText } from "./utils";
import { getAuthUserId } from "@convex-dev/auth/server";
import { buildPersonPreviews } from "./people";
import { hashPhoneNumber, normalizePhoneNumber } from "./phone";
import { toPublicUser } from "./publicUser";
import {
  canViewerSeeSection,
  DEFAULT_PROFILE_VISIBILITY,
  getOwnerFollowsViewer,
  getProfileVisibilitySettings,
  ProfileVisibility,
} from "./profileVisibility";

const DEFAULT_COUNTS = {
  countsFollowers: 0,
  countsFollowing: 0,
  countsReviews: 0,
  countsLogs: 0,
  countsLists: 0,
  countsWatchlist: 0,
  countsWatching: 0,
  countsCompleted: 0,
  countsDropped: 0,
  countsTotalShows: 0,
};

type OnboardingStepType = "profile" | "follow" | "shows" | "complete";

const OnboardingStep = v.union(
  v.literal("profile"),
  v.literal("follow"),
  v.literal("shows"),
  v.literal("complete"),
);

function ensureCounts(user: any) {
  const updates: Partial<typeof DEFAULT_COUNTS> = {};
  for (const key of Object.keys(DEFAULT_COUNTS) as Array<keyof typeof DEFAULT_COUNTS>) {
    if (typeof user[key] !== "number") {
      updates[key] = 0;
    }
  }
  return updates;
}

type UserSearchInput = {
  username?: string | null;
  displayName?: string | null;
  name?: string | null;
};

function buildUserSearchText({ username, displayName, name }: UserSearchInput) {
  return normalizeSearchText(
    `${displayName ?? ""} ${username ?? ""} ${name ?? ""}`,
  );
}

async function maybeHashPhone(phone?: string) {
  if (!phone) {
    return undefined;
  }
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) {
    return undefined;
  }
  return await hashPhoneNumber(normalizedPhone);
}

export const ensureProfile = mutation({
  args: {
    username: v.optional(v.string()),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = await getAuthUserId(ctx);
    if (!identity || !userId) {
      throw new Error("Not authenticated");
    }

    const existing = await ctx.db.get(userId);
    const providedUsername = args.username
      ? args.username.toLowerCase().replace(/[^a-z0-9_]+/g, "")
      : undefined;

    if (providedUsername) {
      const usernameOwner = await ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("username", providedUsername))
        .unique();
      if (usernameOwner && usernameOwner._id !== userId) {
        throw new Error("Username already taken");
      }
    }

    const now = Date.now();
    if (existing) {
      const normalizedPhone = existing.phone
        ? normalizePhoneNumber(existing.phone) ?? existing.phone
        : undefined;
      const nextDisplayName =
        args.displayName ?? existing.displayName ?? existing.name;
      const nextUsername =
        existing.username ??
        providedUsername ??
        existing.name?.toLowerCase().replace(/[^a-z0-9_]+/g, "");
      const searchText = buildUserSearchText({
        displayName: nextDisplayName,
        username: nextUsername,
        name: existing.name,
      });
      const countUpdates = ensureCounts(existing);
      const phoneHash = await maybeHashPhone(normalizedPhone);
      await ctx.db.patch(existing._id, {
        lastSeenAt: now,
        createdAt: existing.createdAt ?? now,
        phone: normalizedPhone,
        displayName: nextDisplayName,
        username: nextUsername,
        onboardingStep: existing.onboardingStep ?? "profile",
        profileVisibility: existing.profileVisibility ?? DEFAULT_PROFILE_VISIBILITY,
        searchText,
        phoneHash,
        ...countUpdates,
      });
      return existing._id;
    }

    const identityLike = identity as { name?: string; phoneNumber?: string };
    const fallback = (args.username ?? identityLike.name ?? "user").toString();
    const username = fallback
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "")
      .slice(0, 16);
    const displayName = args.displayName ?? identityLike.name ?? username;
    const phone = identityLike.phoneNumber
      ? normalizePhoneNumber(identityLike.phoneNumber) ?? identityLike.phoneNumber
      : undefined;
    const phoneHash = await maybeHashPhone(phone);
    const searchText = buildUserSearchText({
      displayName,
      username,
      name: identityLike.name ?? username,
    });

    const inserted = await ctx.db.insert("users", {
      name: identityLike.name ?? username,
      email: identity.email ?? undefined,
      image: identity.pictureUrl ?? undefined,
      phone,
      phoneHash,
      username: username || `user${Math.floor(Math.random() * 10000)}`,
      displayName,
      searchText,
      createdAt: now,
      lastSeenAt: now,
      onboardingStep: "profile",
      profileVisibility: DEFAULT_PROFILE_VISIBILITY,
      ...DEFAULT_COUNTS,
    });

    return inserted;
  },
});

export const profile = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    const viewerId = await getAuthUserId(ctx);
    const profileVisibility = getProfileVisibilitySettings(user);
    const ownerFollowsViewer = await getOwnerFollowsViewer(ctx, user._id, viewerId);
    const sectionVisibility = {
      favorites: canViewerSeeSection({
        ownerId: user._id,
        viewerId,
        visibility: profileVisibility.favorites,
        ownerFollowsViewer,
      }),
      currentlyWatching: canViewerSeeSection({
        ownerId: user._id,
        viewerId,
        visibility: profileVisibility.currentlyWatching,
        ownerFollowsViewer,
      }),
      watchlist: canViewerSeeSection({
        ownerId: user._id,
        viewerId,
        visibility: profileVisibility.watchlist,
        ownerFollowsViewer,
      }),
    };

    const showReviews = await ctx.db
      .query("reviews")
      .withIndex("by_author_createdAt", (q) => q.eq("authorId", user._id))
      .filter((q) => q.eq(q.field("seasonNumber"), undefined))
      .order("desc")
      .take(100);

    const avatarUrl = user.avatarStorageId
      ? await ctx.storage.getUrl(user.avatarStorageId)
      : null;

    const favoriteShowDocs = user.favoriteShowIds?.length
      ? await Promise.all(user.favoriteShowIds.slice(0, 4).map((id) => ctx.db.get(id)))
      : [];

    const watchStates = await ctx.db
      .query("watchStates")
      .withIndex("by_user_updatedAt", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(200);

    const watchingStates = watchStates
      .filter((s) => s.status === "watching")
      .slice(0, 10);
    const watchingShows = await Promise.all(
      watchingStates.map((s) => ctx.db.get(s.showId)),
    );
    const watchlistStates = watchStates
      .filter((s) => s.status === "watchlist")
      .slice(0, 12);
    const watchlistShows = await Promise.all(
      watchlistStates.map((s) => ctx.db.get(s.showId)),
    );

    const avgRating =
      showReviews.length > 0
        ? Number(
            (
              showReviews.reduce((sum, r) => sum + r.rating, 0) /
              showReviews.length
            ).toFixed(1),
          )
        : null;

    const topRated = [...showReviews]
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 5);
    const topRatedShows = await Promise.all(
      topRated.map((review) => ctx.db.get(review.showId)),
    );

    return {
      user: toPublicUser(user),
      avatarUrl,
      counts: {
        followers: user.countsFollowers ?? 0,
        following: user.countsFollowing ?? 0,
        reviews: user.countsReviews ?? 0,
        shows: user.countsTotalShows ?? 0,
        completed: user.countsCompleted ?? 0,
        watching: sectionVisibility.currentlyWatching
          ? (user.countsWatching ?? 0)
          : null,
        watchlist: sectionVisibility.watchlist ? (user.countsWatchlist ?? 0) : null,
        dropped: user.countsDropped ?? 0,
      },
      favoriteShows: sectionVisibility.favorites
        ? favoriteShowDocs
            .filter((s): s is NonNullable<typeof s> => s !== null)
            .map((show) => ({
              _id: show._id,
              title: show.title,
              posterUrl: show.posterUrl,
              year: show.year,
            }))
        : [],
      favoriteGenres: sectionVisibility.favorites ? (user.favoriteGenres ?? []) : [],
      currentlyWatching: sectionVisibility.currentlyWatching
        ? watchingShows
            .filter((s): s is NonNullable<typeof s> => s !== null)
            .map((show) => ({
              _id: show._id,
              title: show.title,
              posterUrl: show.posterUrl,
              year: show.year,
            }))
        : [],
      watchlistPreview: sectionVisibility.watchlist
        ? watchlistShows
            .filter((s): s is NonNullable<typeof s> => s !== null)
            .map((show) => ({
              _id: show._id,
              title: show.title,
              posterUrl: show.posterUrl,
              year: show.year,
            }))
        : [],
      topRated: topRated
        .map((review, i) => {
          const show = topRatedShows[i];
          if (!show) return null;
          return {
            reviewId: review._id,
            rating: review.rating,
            showId: show._id,
            title: show.title,
            posterUrl: show.posterUrl,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
      averageRating: avgRating,
      memberSince: user.createdAt ?? null,
      recent: {
        reviews: showReviews.slice(0, 5),
      },
      permissions: sectionVisibility,
      relationship:
        viewerId && viewerId !== user._id
          ? (await buildPersonPreviews(ctx, viewerId, [user]))[0] ?? null
          : null,
    };
  },
});

export const updateProfile = mutation({
  args: {
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    username: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
    favoriteShowIds: v.optional(v.array(v.id("shows"))),
    favoriteGenres: v.optional(v.array(v.string())),
    profileVisibility: v.optional(ProfileVisibility),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const username = args.username
      ? args.username.toLowerCase().replace(/[^a-z0-9_]+/g, "")
      : undefined;

    if (username) {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("username", username))
        .unique();
      if (existing && existing._id !== user._id) {
        throw new Error("Username already taken");
      }
    }

    const nextDisplayName = args.displayName ?? user.displayName;
    const nextUsername = username ?? user.username;
    const searchText = buildUserSearchText({
      displayName: nextDisplayName,
      username: nextUsername,
      name: user.name,
    });
    const countUpdates = ensureCounts(user);
    const phoneHash = await maybeHashPhone(user.phone);

    const patch: Record<string, unknown> = {
      displayName: nextDisplayName,
      bio: args.bio ?? user.bio,
      username: nextUsername,
      avatarStorageId: args.avatarStorageId ?? user.avatarStorageId,
      profileVisibility: args.profileVisibility ?? getProfileVisibilitySettings(user),
      searchText,
      phoneHash,
      lastSeenAt: Date.now(),
      ...countUpdates,
    };

    if (args.favoriteShowIds !== undefined) {
      patch.favoriteShowIds = args.favoriteShowIds.slice(0, 4);
    }
    if (args.favoriteGenres !== undefined) {
      patch.favoriteGenres = args.favoriteGenres.slice(0, 5);
    }

    await ctx.db.patch(user._id, patch);
  },
});

export const setOnboardingStep = mutation({
  args: { step: OnboardingStep },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const updates: { onboardingStep: OnboardingStepType; onboardingCompletedAt?: number } = {
      onboardingStep: args.step,
    };

    if (args.step === "complete") {
      updates.onboardingCompletedAt = Date.now();
    }

    await ctx.db.patch(user._id, updates);
  },
});

export const exportData = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrThrow(ctx);
    const limit = 1000;
    const clamp = <T>(items: T[]) => items.slice(0, limit);

    const [
      follows,
      reviews,
      logs,
      lists,
      likes,
      comments,
      contacts,
    ] = await Promise.all([
      ctx.db
        .query("follows")
        .withIndex("by_follower_createdAt", (q) => q.eq("followerId", user._id))
        .order("desc")
        .take(limit + 1),
      ctx.db
        .query("reviews")
        .withIndex("by_author_createdAt", (q) => q.eq("authorId", user._id))
        .order("desc")
        .take(limit + 1),
      ctx.db
        .query("watchLogs")
        .withIndex("by_user_watchedAt", (q) => q.eq("userId", user._id))
        .order("desc")
        .take(limit + 1),
      ctx.db
        .query("lists")
        .withIndex("by_owner_updatedAt", (q) => q.eq("ownerId", user._id))
        .order("desc")
        .take(limit + 1),
      ctx.db
        .query("likes")
        .withIndex("by_user_createdAt", (q) => q.eq("userId", user._id))
        .order("desc")
        .take(limit + 1),
      ctx.db
        .query("comments")
        .withIndex("by_author_createdAt", (q) => q.eq("authorId", user._id))
        .order("desc")
        .take(limit + 1),
      ctx.db
        .query("contactSyncEntries")
        .withIndex("by_owner_updatedAt", (q) => q.eq("ownerId", user._id))
        .order("desc")
        .take(limit + 1),
    ]);

    const exportLists = clamp(lists);
    const myListIds = new Set(exportLists.map((list) => list._id));
    const listItemsByList = await Promise.all(
      Array.from(myListIds).map(async (listId) => {
        const items = await ctx.db
          .query("listItems")
          .withIndex("by_list_position", (q) => q.eq("listId", listId))
          .order("asc")
          .take(limit + 1);
        return { listId, items };
      }),
    );
    const myListItems = listItemsByList.flatMap((entry) => clamp(entry.items));

    return {
      user,
      follows: clamp(follows),
      reviews: clamp(reviews),
      logs: clamp(logs),
      lists: exportLists,
      listItems: myListItems,
      likes: clamp(likes),
      comments: clamp(comments),
      contacts: clamp(contacts),
      exportLimit: limit,
      truncated: {
        follows: follows.length > limit,
        reviews: reviews.length > limit,
        logs: logs.length > limit,
        lists: lists.length > limit,
        likes: likes.length > limit,
        comments: comments.length > limit,
        contacts: contacts.length > limit,
        listItems: listItemsByList
          .filter((entry) => entry.items.length > limit)
          .map((entry) => entry.listId),
      },
    };
  },
});

export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrThrow(ctx);

    const lists = await ctx.db
      .query("lists")
      .withIndex("by_owner_updatedAt", (q) => q.eq("ownerId", user._id))
      .collect();

    const listIds = lists.map((list) => list._id);
    const listItems = await Promise.all(
      listIds.map((listId) =>
        ctx.db
          .query("listItems")
          .withIndex("by_list_position", (q) => q.eq("listId", listId))
          .collect(),
      ),
    );

    if (user.avatarStorageId) {
      await ctx.storage.delete(user.avatarStorageId);
    }
    await Promise.all(
      lists
        .filter((list) => list.coverStorageId)
        .map((list) => ctx.storage.delete(list.coverStorageId!)),
    );

    await Promise.all([
      ctx.db
        .query("watchStates")
        .withIndex("by_user_updatedAt", (q) => q.eq("userId", user._id))
        .collect()
        .then((items) => Promise.all(items.map((item) => ctx.db.delete(item._id)))),
      ctx.db
        .query("watchLogs")
        .withIndex("by_user_watchedAt", (q) => q.eq("userId", user._id))
        .collect()
        .then((items) => Promise.all(items.map((item) => ctx.db.delete(item._id)))),
      ctx.db
        .query("reviews")
        .withIndex("by_author_createdAt", (q) => q.eq("authorId", user._id))
        .collect()
        .then((items) => Promise.all(items.map((item) => ctx.db.delete(item._id)))),
      ctx.db
        .query("likes")
        .withIndex("by_user_createdAt", (q) => q.eq("userId", user._id))
        .collect()
        .then((items) => Promise.all(items.map((item) => ctx.db.delete(item._id)))),
      ctx.db
        .query("comments")
        .withIndex("by_author_createdAt", (q) => q.eq("authorId", user._id))
        .collect()
        .then((items) => Promise.all(items.map((item) => ctx.db.delete(item._id)))),
      ctx.db
        .query("follows")
        .withIndex("by_follower_createdAt", (q) => q.eq("followerId", user._id))
        .collect()
        .then((items) => Promise.all(items.map((item) => ctx.db.delete(item._id)))),
      ctx.db
        .query("follows")
        .withIndex("by_followee_createdAt", (q) => q.eq("followeeId", user._id))
        .collect()
        .then((items) => Promise.all(items.map((item) => ctx.db.delete(item._id)))),
      Promise.all(
        listItems.flat().map((item) => ctx.db.delete(item._id)),
      ),
      Promise.all(lists.map((list) => ctx.db.delete(list._id))),
      ctx.db
        .query("reports")
        .withIndex("by_reporter_createdAt", (q) => q.eq("reporterId", user._id))
        .collect()
        .then((items) => Promise.all(items.map((item) => ctx.db.delete(item._id)))),
      ctx.db
        .query("feedItems")
        .withIndex("by_owner_timestamp", (q) => q.eq("ownerId", user._id))
        .collect()
        .then((items) => Promise.all(items.map((item) => ctx.db.delete(item._id)))),
      ctx.db
        .query("feedItems")
        .filter((q) => q.eq(q.field("actorId"), user._id))
        .collect()
        .then((items) => Promise.all(items.map((item) => ctx.db.delete(item._id)))),
      ctx.db
        .query("contactSyncEntries")
        .withIndex("by_owner_updatedAt", (q) => q.eq("ownerId", user._id))
        .collect()
        .then((items) => Promise.all(items.map((item) => ctx.db.delete(item._id)))),
      ctx.db
        .query("contactSyncEntries")
        .withIndex("by_matchedUserId", (q) => q.eq("matchedUserId", user._id))
        .collect()
        .then((items) =>
          Promise.all(
            items.map((item) =>
              ctx.db.patch(item._id, {
                matchedUserId: undefined,
                updatedAt: Date.now(),
              }),
            ),
          ),
        ),
    ]);

    await ctx.db.delete(user._id);
    return { success: true };
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db.get(userId);
  },
});

export const getFavoriteShows = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrThrow(ctx);
    const showIds = user.favoriteShowIds ?? [];
    if (showIds.length === 0) return [];

    const shows = await Promise.all(showIds.map((id) => ctx.db.get(id)));
    return shows
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .map((show) => ({
        _id: show._id,
        title: show.title,
        posterUrl: show.posterUrl,
        year: show.year,
      }));
  },
});

export const getShowsById = query({
  args: { showIds: v.array(v.id("shows")) },
  handler: async (ctx, args) => {
    await getCurrentUserOrThrow(ctx);
    if (args.showIds.length === 0) return [];

    const shows = await Promise.all(args.showIds.map((id) => ctx.db.get(id)));
    return shows
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .map((show) => ({
        _id: show._id,
        title: show.title,
        posterUrl: show.posterUrl,
        year: show.year,
      }));
  },
});

export const getById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

export const getVisibleFavoriteShowsByUserIds = internalQuery({
  args: {
    viewerId: v.id("users"),
    userIds: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const uniqueUserIds = Array.from(new Set(args.userIds));

    const rows = await Promise.all(
      uniqueUserIds.map(async (userId) => {
        const user = await ctx.db.get(userId);
        if (!user) {
          return null;
        }

        const ownerFollowsViewer = await getOwnerFollowsViewer(ctx, user._id, args.viewerId);
        const canViewFavorites = canViewerSeeSection({
          ownerId: user._id,
          viewerId: args.viewerId,
          visibility: getProfileVisibilitySettings(user).favorites,
          ownerFollowsViewer,
        });

        if (!canViewFavorites) {
          return {
            userId: user._id,
            favoriteShows: [],
          };
        }

        const favoriteShowIds = user.favoriteShowIds ?? [];
        const favoriteShowDocs = await Promise.all(
          favoriteShowIds.map((showId) => ctx.db.get(showId)),
        );

        return {
          userId: user._id,
          favoriteShows: favoriteShowDocs
            .filter((show): show is NonNullable<typeof show> => Boolean(show))
            .map((show) => ({
              _id: show._id,
              title: show.title,
              posterUrl: show.posterUrl,
              year: show.year,
            })),
        };
      }),
    );

    return rows.filter((row): row is NonNullable<typeof row> => Boolean(row));
  },
});

export const search = query({
  args: { text: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const limit = Math.min(args.limit ?? 12, 30);
    const normalized = normalizeSearchText(args.text);
    if (normalized.length < 2) return [];

    const results = await ctx.db
      .query("users")
      .withSearchIndex("search_users", (q) => q.search("searchText", normalized))
      .take(limit * 2);

    const filtered = results
      .filter((candidate) => candidate._id !== user._id)
      .slice(0, limit * 2);

    const previews = await buildPersonPreviews(ctx, user._id, filtered);
    return previews
      .sort((left, right) => {
        if (Number(right.inContacts) !== Number(left.inContacts)) {
          return Number(right.inContacts) - Number(left.inContacts);
        }
        if (right.mutualCount !== left.mutualCount) {
          return right.mutualCount - left.mutualCount;
        }
        return Number(right.followsYou) - Number(left.followsYou);
      })
      .slice(0, limit);
  },
});

export const suggested = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const limit = Math.min(args.limit ?? 6, 20);

    const followees = await ctx.db
      .query("follows")
      .withIndex("by_follower_createdAt", (q) => q.eq("followerId", user._id))
      .collect();
    const followeeIds = new Set(followees.map((follow) => follow.followeeId));
    followeeIds.add(user._id);

    const candidates = await ctx.db
      .query("users")
      .withIndex("by_lastSeenAt")
      .order("desc")
      .take(limit * 10);

    const suggestions = [];
    for (const candidate of candidates) {
      if (followeeIds.has(candidate._id)) continue;
      if (!candidate.username) continue;
      suggestions.push(candidate);
    }

    const contactMatches = await ctx.db
      .query("contactSyncEntries")
      .withIndex("by_owner_updatedAt", (q) => q.eq("ownerId", user._id))
      .collect();
    const contactMatchIds = new Set(
      contactMatches.flatMap((entry) => (entry.matchedUserId ? [entry.matchedUserId] : [])),
    );
    const contactUsers = await Promise.all(
      Array.from(contactMatchIds).map((id) => ctx.db.get(id)),
    );
    const validContactUsers = contactUsers.filter(
      (c): c is NonNullable<typeof c> => c !== null && Boolean(c.username),
    );
    const previews = await buildPersonPreviews(ctx, user._id, [
      ...validContactUsers,
      ...suggestions,
    ]);

    return previews
      .filter((candidate) => !candidate.isFollowing)
      .sort((left, right) => {
        if (Number(right.inContacts) !== Number(left.inContacts)) {
          return Number(right.inContacts) - Number(left.inContacts);
        }
        if (right.mutualCount !== left.mutualCount) {
          return right.mutualCount - left.mutualCount;
        }
        if (Number(right.followsYou) !== Number(left.followsYou)) {
          return Number(right.followsYou) - Number(left.followsYou);
        }
        return 0;
      })
      .slice(0, limit);
  },
});

import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";

const MOST_REVIEWED_SCAN_LIMIT = 600;
const POPULAR_FRIENDS_FOLLOWEE_LIMIT = 30;
const POPULAR_FRIENDS_STATE_LIMIT_PER_FOLLOWEE = 20;
const POPULAR_FRIENDS_MY_STATE_LIMIT = 200;

export const shows = query({
  args: { windowHours: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const windowMs = (args.windowHours ?? 72) * 60 * 60 * 1000;
    const since = Date.now() - windowMs;
    const limit = Math.min(args.limit ?? 10, 20);

    const recentReviews = await ctx.db
      .query("reviews")
      .withIndex("by_createdAt", (q) => q.gt("createdAt", since))
      .order("desc")
      .take(500);

    const counts = new Map<Id<"shows">, number>();

    for (const review of recentReviews) {
      counts.set(review.showId, (counts.get(review.showId) ?? 0) + 2);
    }

    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    const shows = await Promise.all(sorted.map(([showId]) => ctx.db.get(showId)));

    return sorted.map(([, score], index) => ({
      rank: index + 1,
      score,
      show: shows[index] ?? null,
    }));
  },
});

export const mostReviewed = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 10, 20);

    const allReviews = await ctx.db
      .query("reviews")
      .withIndex("by_createdAt")
      .order("desc")
      .take(MOST_REVIEWED_SCAN_LIMIT);

    const counts = new Map<Id<"shows">, { count: number; totalRating: number }>();

    for (const review of allReviews) {
      const existing = counts.get(review.showId) ?? { count: 0, totalRating: 0 };
      existing.count += 1;
      existing.totalRating += review.rating;
      counts.set(review.showId, existing);
    }

    const sorted = Array.from(counts.entries())
      .filter(([, stats]) => stats.count >= 1)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit);

    const shows = await Promise.all(sorted.map(([showId]) => ctx.db.get(showId)));

    return sorted.map(([, stats], index) => ({
      rank: index + 1,
      reviewCount: stats.count,
      avgRating: Math.round((stats.totalRating / stats.count) * 10) / 10,
      show: shows[index] ?? null,
    }));
  },
});

export const popularWithFriends = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const limit = Math.min(args.limit ?? 10, 20);

    // Get all users the current user follows
    const followRows = await ctx.db
      .query("follows")
      .withIndex("by_follower_createdAt", (q) => q.eq("followerId", userId))
      .collect();

    if (followRows.length === 0) return [];

    const followeeIds = new Set(
      followRows
        .slice(0, POPULAR_FRIENDS_FOLLOWEE_LIMIT)
        .map((f) => f.followeeId),
    );

    // Gather watch states from all followees (watching, completed, watchlist)
    const allStates: Array<{ showId: Id<"shows">; userId: Id<"users"> }> = [];
    for (const followeeId of followeeIds) {
      const states = await ctx.db
        .query("watchStates")
        .withIndex("by_user_updatedAt", (q) => q.eq("userId", followeeId))
        .order("desc")
        .take(POPULAR_FRIENDS_STATE_LIMIT_PER_FOLLOWEE);
      for (const state of states) {
        if (state.status !== "dropped") {
          allStates.push({ showId: state.showId, userId: state.userId });
        }
      }
    }

    if (allStates.length === 0) return [];

    // Count how many friends have each show, and track which friends
    const showCounts = new Map<
      Id<"shows">,
      { count: number; friendIds: Set<Id<"users">> }
    >();
    for (const { showId, userId: friendId } of allStates) {
      const existing = showCounts.get(showId) ?? {
        count: 0,
        friendIds: new Set(),
      };
      existing.count += 1;
      existing.friendIds.add(friendId);
      showCounts.set(showId, existing);
    }

    // Exclude shows the current user already has a watch state for
    const myStates = await ctx.db
      .query("watchStates")
      .withIndex("by_user_updatedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(POPULAR_FRIENDS_MY_STATE_LIMIT);
    const myShowIds = new Set(myStates.map((s) => s.showId));

    const sorted = Array.from(showCounts.entries())
      .filter(([showId]) => !myShowIds.has(showId))
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit);

    if (sorted.length === 0) return [];

    // Hydrate shows and friend info
    const showDocs = await Promise.all(
      sorted.map(([showId]) => ctx.db.get(showId)),
    );
    const allFriendIds = new Set(
      sorted.flatMap(([, { friendIds }]) => [...friendIds]),
    );
    const friendDocs = new Map<Id<"users">, { displayName?: string; username?: string; avatarStorageId?: Id<"_storage"> }>();
    for (const friendId of allFriendIds) {
      const doc = await ctx.db.get(friendId);
      if (doc) {
        friendDocs.set(friendId, {
          displayName: doc.displayName,
          username: doc.username,
          avatarStorageId: doc.avatarStorageId,
        });
      }
    }

    // Build avatar URLs
    const avatarUrls = new Map<Id<"users">, string | null>();
    for (const [fid, doc] of friendDocs) {
      if (doc.avatarStorageId) {
        const url = await ctx.storage.getUrl(doc.avatarStorageId);
        avatarUrls.set(fid, url);
      } else {
        avatarUrls.set(fid, null);
      }
    }

    return sorted.map(([, { count, friendIds }], index) => ({
      rank: index + 1,
      friendCount: count,
      show: showDocs[index] ?? null,
      friends: [...friendIds].slice(0, 3).map((fid) => ({
        _id: fid,
        displayName: friendDocs.get(fid)?.displayName,
        username: friendDocs.get(fid)?.username,
        avatarUrl: avatarUrls.get(fid) ?? null,
      })),
    }));
  },
});

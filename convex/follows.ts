import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserOrThrow } from "./utils";
import { rateLimit } from "./rateLimit";
import { paginationOptsValidator } from "convex/server";
import { buildPersonPreviews } from "./people";

export const follow = mutation({
  args: { userIdToFollow: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await rateLimit(ctx, `follow:${user._id}`, 30, 60_000);
    if (user._id === args.userIdToFollow) return;

    const existing = await ctx.db
      .query("follows")
      .withIndex("by_pair", (q) =>
        q.eq("followerId", user._id).eq("followeeId", args.userIdToFollow),
      )
      .unique();

    if (existing) return existing._id;

    const followId = await ctx.db.insert("follows", {
      followerId: user._id,
      followeeId: args.userIdToFollow,
      createdAt: Date.now(),
    });

    const followee = await ctx.db.get(args.userIdToFollow);
    if (followee) {
      await Promise.all([
        ctx.db.patch(user._id, {
          countsFollowing: (user.countsFollowing ?? 0) + 1,
        }),
        ctx.db.patch(followee._id, {
          countsFollowers: (followee.countsFollowers ?? 0) + 1,
        }),
      ]);
    }

    return followId;
  },
});

export const unfollow = mutation({
  args: { userIdToUnfollow: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const existing = await ctx.db
      .query("follows")
      .withIndex("by_pair", (q) =>
        q.eq("followerId", user._id).eq("followeeId", args.userIdToUnfollow),
      )
      .unique();
    if (!existing) return;
    await ctx.db.delete(existing._id);

    const followee = await ctx.db.get(args.userIdToUnfollow);
    if (followee) {
      await Promise.all([
        ctx.db.patch(user._id, {
          countsFollowing: Math.max(0, (user.countsFollowing ?? 0) - 1),
        }),
        ctx.db.patch(followee._id, {
          countsFollowers: Math.max(0, (followee.countsFollowers ?? 0) - 1),
        }),
      ]);
    }
  },
});

export const listFollowers = query({
  args: { userId: v.id("users"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 100);
    return await ctx.db
      .query("follows")
      .withIndex("by_followee_createdAt", (q) => q.eq("followeeId", args.userId))
      .order("desc")
      .take(limit);
  },
});

export const listFollowing = query({
  args: { userId: v.id("users"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 100);
    return await ctx.db
      .query("follows")
      .withIndex("by_follower_createdAt", (q) => q.eq("followerId", args.userId))
      .order("desc")
      .take(limit);
  },
});

export const isFollowing = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    if (user._id === args.userId) return false;
    const existing = await ctx.db
      .query("follows")
      .withIndex("by_pair", (q) =>
        q.eq("followerId", user._id).eq("followeeId", args.userId),
      )
      .unique();
    return !!existing;
  },
});

export const listFollowersDetailed = query({
  args: { userId: v.id("users"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const viewer = await getCurrentUserOrThrow(ctx);

    const page = await ctx.db
      .query("follows")
      .withIndex("by_followee_createdAt", (q) => q.eq("followeeId", args.userId))
      .order("desc")
      .paginate(args.paginationOpts);

    const users = await Promise.all(page.page.map((follow) => ctx.db.get(follow.followerId)));
    const previews = await buildPersonPreviews(
      ctx,
      viewer._id,
      users.flatMap((user) => (user ? [user] : [])),
    );

    return { ...page, page: previews };
  },
});

export const listFollowingDetailed = query({
  args: { userId: v.id("users"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const viewer = await getCurrentUserOrThrow(ctx);

    const page = await ctx.db
      .query("follows")
      .withIndex("by_follower_createdAt", (q) => q.eq("followerId", args.userId))
      .order("desc")
      .paginate(args.paginationOpts);

    const users = await Promise.all(page.page.map((follow) => ctx.db.get(follow.followeeId)));
    const previews = await buildPersonPreviews(
      ctx,
      viewer._id,
      users.flatMap((user) => (user ? [user] : [])),
    );

    return { ...page, page: previews };
  },
});

export const getFolloweeIds = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const follows = await ctx.db
      .query("follows")
      .withIndex("by_follower_createdAt", (q) => q.eq("followerId", args.userId))
      .collect();

    return follows.map((follow) => follow.followeeId);
  },
});

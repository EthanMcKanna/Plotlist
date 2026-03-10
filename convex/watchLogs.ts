import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserOrThrow } from "./utils";
import { rateLimit } from "./rateLimit";
import type { Id } from "./_generated/dataModel";
import { paginationOptsValidator } from "convex/server";
import { toPublicUser } from "./publicUser";

export const add = mutation({
  args: {
    showId: v.id("shows"),
    watchedAt: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await rateLimit(ctx, `log:${user._id}`, 20, 60_000);
    const now = Date.now();
    const logId = await ctx.db.insert("watchLogs", {
      userId: user._id,
      showId: args.showId,
      watchedAt: args.watchedAt,
      note: args.note?.slice(0, 500),
    });

    const followers = await ctx.db
      .query("follows")
      .withIndex("by_followee_createdAt", (q) => q.eq("followeeId", user._id))
      .collect();
    const followerIds = followers.slice(0, 500).map((f) => f.followerId);
    const feedOwners = [user._id, ...followerIds];
    await Promise.all(
      feedOwners.map((ownerId) =>
        ctx.db.insert("feedItems", {
          ownerId,
          actorId: user._id,
          type: "log",
          targetId: logId,
          showId: args.showId,
          timestamp: args.watchedAt,
          createdAt: now,
        }),
      ),
    );

    await ctx.db.patch(user._id, {
      countsLogs: (user.countsLogs ?? 0) + 1,
    });

    return logId;
  },
});

export const deleteLog = mutation({
  args: { logId: v.id("watchLogs") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const log = await ctx.db.get(args.logId);
    if (!log) return;
    if (log.userId !== user._id) {
      throw new Error("Not allowed");
    }
    await ctx.db.delete(args.logId);
    const feedItems = await ctx.db
      .query("feedItems")
      .withIndex("by_target", (q) => q.eq("type", "log").eq("targetId", args.logId))
      .collect();
    await Promise.all(feedItems.map((item) => ctx.db.delete(item._id)));
    await ctx.db.patch(user._id, {
      countsLogs: Math.max(0, (user.countsLogs ?? 0) - 1),
    });
  },
});

export const updateLog = mutation({
  args: {
    logId: v.id("watchLogs"),
    watchedAt: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const log = await ctx.db.get(args.logId);
    if (!log) {
      throw new Error("Log not found");
    }
    if (log.userId !== user._id) {
      throw new Error("Not allowed");
    }
    const updates: { watchedAt?: number; note?: string } = {};
    if (args.watchedAt !== undefined) {
      updates.watchedAt = args.watchedAt;
    }
    if (args.note !== undefined) {
      updates.note = args.note.slice(0, 500);
    }
    await ctx.db.patch(args.logId, updates);
  },
});

async function listLogs(
  ctx: QueryCtx,
  args: { userId: Id<"users">; limit?: number },
) {
  const limit = Math.min(args.limit ?? 50, 100);
  return await ctx.db
    .query("watchLogs")
    .withIndex("by_user_watchedAt", (q) => q.eq("userId", args.userId))
    .order("desc")
    .take(limit);
}

export const listForUser = query({
  args: { userId: v.id("users"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await listLogs(ctx, args);
  },
});

export const listForUserDetailed = query({
  args: { userId: v.id("users"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("watchLogs")
      .withIndex("by_user_watchedAt", (q) => q.eq("userId", args.userId))
      .order("desc")
      .paginate(args.paginationOpts);
    const shows = await Promise.all(page.page.map((log) => ctx.db.get(log.showId)));
    return {
      ...page,
      page: page.page.map((log, index) => ({
        log,
        show: shows[index] ?? null,
      })),
    };
  },
});

export const listForShow = query({
  args: { showId: v.id("shows"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 100);
    return await ctx.db
      .query("watchLogs")
      .withIndex("by_show_watchedAt", (q) => q.eq("showId", args.showId))
      .order("desc")
      .take(limit);
  },
});

export const listForShowDetailed = query({
  args: { showId: v.id("shows"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("watchLogs")
      .withIndex("by_show_watchedAt", (q) => q.eq("showId", args.showId))
      .order("desc")
      .paginate(args.paginationOpts);
    const users = await Promise.all(page.page.map((log) => ctx.db.get(log.userId)));
    return {
      ...page,
      page: page.page.map((log, index) => ({
        log,
        user: toPublicUser(users[index] ?? null),
      })),
    };
  },
});

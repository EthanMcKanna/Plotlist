import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserOrThrow } from "./utils";
import { rateLimit } from "./rateLimit";

const TargetType = v.union(
  v.literal("review"),
  v.literal("log"),
  v.literal("list"),
);

export const toggle = mutation({
  args: { targetType: TargetType, targetId: v.string() },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await rateLimit(ctx, `like:${user._id}`, 60, 60_000);
    const existing = await ctx.db
      .query("likes")
      .withIndex("by_user_target", (q) =>
        q.eq("userId", user._id).eq("targetType", args.targetType).eq("targetId", args.targetId),
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { liked: false };
    }

    await ctx.db.insert("likes", {
      userId: user._id,
      targetType: args.targetType,
      targetId: args.targetId,
      createdAt: Date.now(),
    });

    return { liked: true };
  },
});

export const listForTarget = query({
  args: { targetType: TargetType, targetId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 100);
    return await ctx.db
      .query("likes")
      .withIndex("by_target_createdAt", (q) =>
        q.eq("targetType", args.targetType).eq("targetId", args.targetId),
      )
      .order("desc")
      .take(limit);
  },
});

export const getForUserTarget = query({
  args: { targetType: TargetType, targetId: v.string() },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    return await ctx.db
      .query("likes")
      .withIndex("by_user_target", (q) =>
        q.eq("userId", user._id).eq("targetType", args.targetType).eq("targetId", args.targetId),
      )
      .unique();
  },
});

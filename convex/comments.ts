import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserOrThrow } from "./utils";
import { rateLimit } from "./rateLimit";
import { paginationOptsValidator } from "convex/server";

const TargetType = v.union(
  v.literal("review"),
  v.literal("log"),
  v.literal("list"),
);

export const add = mutation({
  args: { targetType: TargetType, targetId: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await rateLimit(ctx, `comment:${user._id}`, 10, 60_000);

    return await ctx.db.insert("comments", {
      authorId: user._id,
      targetType: args.targetType,
      targetId: args.targetId,
      text: args.text.slice(0, 1000),
      createdAt: Date.now(),
    });
  },
});

export const deleteComment = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const comment = await ctx.db.get(args.commentId);
    if (!comment) return;
    if (comment.authorId !== user._id) {
      throw new Error("Not allowed");
    }
    await ctx.db.delete(args.commentId);
  },
});

export const listForTarget = query({
  args: { targetType: TargetType, targetId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("comments")
      .withIndex("by_target_createdAt", (q) =>
        q.eq("targetType", args.targetType).eq("targetId", args.targetId),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return page;
  },
});

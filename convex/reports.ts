import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserOrThrow, requireAdmin } from "./utils";
import { rateLimit } from "./rateLimit";
import type { Id } from "./_generated/dataModel";
import { paginationOptsValidator } from "convex/server";

const TargetType = v.union(
  v.literal("review"),
  v.literal("log"),
  v.literal("list"),
);

export const create = mutation({
  args: {
    targetType: TargetType,
    targetId: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await rateLimit(ctx, `report:${user._id}`, 5, 60_000);
    return await ctx.db.insert("reports", {
      reporterId: user._id,
      targetType: args.targetType,
      targetId: args.targetId,
      reason: args.reason?.slice(0, 1000),
      createdAt: Date.now(),
      status: "open",
    });
  },
});

export const listOpen = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const page = await ctx.db
      .query("reports")
      .filter((q) => q.eq(q.field("status"), "open"))
      .order("desc")
      .paginate(args.paginationOpts);
    return page;
  },
});

export const resolve = mutation({
  args: {
    reportId: v.id("reports"),
    action: v.union(v.literal("dismiss"), v.literal("delete")),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const report = await ctx.db.get(args.reportId);
    if (!report) return;

    if (args.action === "delete") {
      if (report.targetType === "review") {
        const review = await ctx.db.get(report.targetId as Id<"reviews">);
        if (review) {
          await ctx.db.delete(review._id);
          const author = await ctx.db.get(review.authorId);
          if (author) {
            await ctx.db.patch(author._id, {
              countsReviews: Math.max(0, (author.countsReviews ?? 0) - 1),
            });
          }
        }
      } else if (report.targetType === "log") {
        const log = await ctx.db.get(report.targetId as Id<"watchLogs">);
        if (log) {
          await ctx.db.delete(log._id);
          const author = await ctx.db.get(log.userId);
          if (author) {
            await ctx.db.patch(author._id, {
              countsLogs: Math.max(0, (author.countsLogs ?? 0) - 1),
            });
          }
        }
      } else if (report.targetType === "list") {
        const list = await ctx.db.get(report.targetId as Id<"lists">);
        if (list) {
          const items = await ctx.db
            .query("listItems")
            .withIndex("by_list_position", (q) => q.eq("listId", list._id))
            .collect();
          await Promise.all(items.map((item) => ctx.db.delete(item._id)));
          await ctx.db.delete(list._id);
          const owner = await ctx.db.get(list.ownerId);
          if (owner) {
            await ctx.db.patch(owner._id, {
              countsLists: Math.max(0, (owner.countsLists ?? 0) - 1),
            });
          }
        }
      }

      const likes = await ctx.db
        .query("likes")
        .withIndex("by_target_createdAt", (q) =>
          q.eq("targetType", report.targetType).eq("targetId", report.targetId),
        )
        .collect();
      await Promise.all(likes.map((like) => ctx.db.delete(like._id)));

      const comments = await ctx.db
        .query("comments")
        .withIndex("by_target_createdAt", (q) =>
          q.eq("targetType", report.targetType).eq("targetId", report.targetId),
        )
        .collect();
      await Promise.all(comments.map((comment) => ctx.db.delete(comment._id)));

      const targetType = report.targetType;
      if (targetType === "review" || targetType === "log") {
        const feedItems = await ctx.db
          .query("feedItems")
          .withIndex("by_target", (q) =>
            q.eq("type", targetType).eq("targetId", report.targetId),
          )
          .collect();
        await Promise.all(feedItems.map((item) => ctx.db.delete(item._id)));
      }
    }

    await ctx.db.patch(report._id, {
      status: "resolved",
      resolvedAt: Date.now(),
      resolvedBy: admin._id,
      action: args.action,
    });
  },
});

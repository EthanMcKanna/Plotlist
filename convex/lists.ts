import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserOrThrow } from "./utils";
import { rateLimit } from "./rateLimit";
import { paginationOptsValidator } from "convex/server";

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    isPublic: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await rateLimit(ctx, `list:${user._id}`, 20, 60 * 60 * 1000);
    const now = Date.now();
    const listId = await ctx.db.insert("lists", {
      ownerId: user._id,
      title: args.title.slice(0, 120),
      description: args.description?.slice(0, 2000),
      isPublic: args.isPublic,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(user._id, {
      countsLists: (user.countsLists ?? 0) + 1,
    });
    return listId;
  },
});

export const update = mutation({
  args: {
    listId: v.id("lists"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
    coverStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await rateLimit(ctx, `list-update:${user._id}`, 20, 60 * 60 * 1000);
    const list = await ctx.db.get(args.listId);
    if (!list) return;
    if (list.ownerId !== user._id) {
      throw new Error("Not allowed");
    }

    await ctx.db.patch(args.listId, {
      title: args.title?.slice(0, 120) ?? list.title,
      description: args.description?.slice(0, 2000) ?? list.description,
      isPublic: args.isPublic ?? list.isPublic,
      coverStorageId: args.coverStorageId ?? list.coverStorageId,
      updatedAt: Date.now(),
    });
  },
});

export const deleteList = mutation({
  args: { listId: v.id("lists") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const list = await ctx.db.get(args.listId);
    if (!list) return;
    if (list.ownerId !== user._id) {
      throw new Error("Not allowed");
    }
    const items = await ctx.db
      .query("listItems")
      .withIndex("by_list_position", (q) => q.eq("listId", args.listId))
      .collect();
    await Promise.all(items.map((item) => ctx.db.delete(item._id)));
    await ctx.db.delete(args.listId);
    await ctx.db.patch(user._id, {
      countsLists: Math.max(0, (user.countsLists ?? 0) - 1),
    });
  },
});

export const get = query({
  args: { listId: v.id("lists") },
  handler: async (ctx, args) => {
    const list = await ctx.db.get(args.listId);
    if (!list) return null;

    if (!list.isPublic) {
      const user = await getCurrentUserOrThrow(ctx);
      if (list.ownerId !== user._id) {
        throw new Error("Not allowed");
      }
    }

    return list;
  },
});

export const listForUser = query({
  args: { userId: v.id("users"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const viewer = await getCurrentUserOrThrow(ctx);
    if (viewer._id !== args.userId) {
      throw new Error("Not allowed");
    }
    const page = await ctx.db
      .query("lists")
      .withIndex("by_owner_updatedAt", (q) => q.eq("ownerId", args.userId))
      .order("desc")
      .paginate(args.paginationOpts);
    return page;
  },
});

export const listPublicForUser = query({
  args: { userId: v.id("users"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("lists")
      .withIndex("by_owner_updatedAt", (q) => q.eq("ownerId", args.userId))
      .filter((q) => q.eq(q.field("isPublic"), true))
      .order("desc")
      .paginate(args.paginationOpts);
    return page;
  },
});

export const listPublicByOwnerIds = internalQuery({
  args: {
    ownerIds: v.array(v.id("users")),
    limit: v.optional(v.number()),
    limitPerOwner: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const uniqueOwnerIds = Array.from(new Set(args.ownerIds));
    const limit = Math.min(args.limit ?? 12, 20);
    const limitPerOwner = Math.min(args.limitPerOwner ?? 2, 4);

    const perOwnerLists = await Promise.all(
      uniqueOwnerIds.map((ownerId) =>
        ctx.db
          .query("lists")
          .withIndex("by_owner_updatedAt", (q) => q.eq("ownerId", ownerId))
          .filter((q) => q.eq(q.field("isPublic"), true))
          .order("desc")
          .take(limitPerOwner),
      ),
    );

    return perOwnerLists
      .flat()
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, limit);
  },
});

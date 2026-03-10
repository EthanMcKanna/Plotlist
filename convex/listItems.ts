import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserOrThrow } from "./utils";
import { rateLimit } from "./rateLimit";

export const add = mutation({
  args: { listId: v.id("lists"), showId: v.id("shows") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await rateLimit(ctx, `list-item:${user._id}`, 60, 60_000);
    const list = await ctx.db.get(args.listId);
    if (!list) return;
    if (list.ownerId !== user._id) {
      throw new Error("Not allowed");
    }

    const existingItem = await ctx.db
      .query("listItems")
      .withIndex("by_list_show", (q) =>
        q.eq("listId", args.listId).eq("showId", args.showId),
      )
      .unique();
    if (existingItem) {
      throw new Error("Show already in list");
    }

    const existing = await ctx.db
      .query("listItems")
      .withIndex("by_list_position", (q) => q.eq("listId", args.listId))
      .order("desc")
      .take(1);

    const nextPosition = existing[0] ? existing[0].position + 1 : 1;

    return await ctx.db.insert("listItems", {
      listId: args.listId,
      showId: args.showId,
      position: nextPosition,
      addedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { listItemId: v.id("listItems") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const item = await ctx.db.get(args.listItemId);
    if (!item) return;
    const list = await ctx.db.get(item.listId);
    if (!list || list.ownerId !== user._id) {
      throw new Error("Not allowed");
    }
    await ctx.db.delete(args.listItemId);
  },
});

export const toggle = mutation({
  args: { listId: v.id("lists"), showId: v.id("shows") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await rateLimit(ctx, `list-item:${user._id}`, 60, 60_000);
    const list = await ctx.db.get(args.listId);
    if (!list || list.ownerId !== user._id) {
      throw new Error("Not allowed");
    }

    const existing = await ctx.db
      .query("listItems")
      .withIndex("by_list_show", (q) =>
        q.eq("listId", args.listId).eq("showId", args.showId),
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { added: false };
    }

    const lastItem = await ctx.db
      .query("listItems")
      .withIndex("by_list_position", (q) => q.eq("listId", args.listId))
      .order("desc")
      .take(1);

    const nextPosition = lastItem[0] ? lastItem[0].position + 1 : 1;
    await ctx.db.insert("listItems", {
      listId: args.listId,
      showId: args.showId,
      position: nextPosition,
      addedAt: Date.now(),
    });
    return { added: true };
  },
});

export const getShowMembership = query({
  args: { showId: v.id("shows") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const lists = await ctx.db
      .query("lists")
      .withIndex("by_owner_updatedAt", (q) => q.eq("ownerId", user._id))
      .collect();

    const memberOf: string[] = [];
    await Promise.all(
      lists.map(async (list) => {
        const item = await ctx.db
          .query("listItems")
          .withIndex("by_list_show", (q) =>
            q.eq("listId", list._id).eq("showId", args.showId),
          )
          .unique();
        if (item) memberOf.push(list._id);
      }),
    );
    return memberOf;
  },
});

export const reorder = mutation({
  args: { listId: v.id("lists"), orderedItemIds: v.array(v.id("listItems")) },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await rateLimit(ctx, `list-reorder:${user._id}`, 60, 60_000);
    const list = await ctx.db.get(args.listId);
    if (!list || list.ownerId !== user._id) {
      throw new Error("Not allowed");
    }

    await Promise.all(
      args.orderedItemIds.map((id, index) =>
        ctx.db.patch(id, { position: index + 1 }),
      ),
    );
  },
});

export const list = query({
  args: { listId: v.id("lists") },
  handler: async (ctx, args) => {
    const list = await ctx.db.get(args.listId);
    if (!list) return [];
    if (!list.isPublic) {
      const user = await getCurrentUserOrThrow(ctx);
      if (list.ownerId !== user._id) {
        throw new Error("Not allowed");
      }
    }
    return await ctx.db
      .query("listItems")
      .withIndex("by_list_position", (q) => q.eq("listId", args.listId))
      .order("asc")
      .collect();
  },
});

export const listDetailed = query({
  args: { listId: v.id("lists") },
  handler: async (ctx, args) => {
    const list = await ctx.db.get(args.listId);
    if (!list) return [];
    if (!list.isPublic) {
      const user = await getCurrentUserOrThrow(ctx);
      if (list.ownerId !== user._id) {
        throw new Error("Not allowed");
      }
    }
    const items = await ctx.db
      .query("listItems")
      .withIndex("by_list_position", (q) => q.eq("listId", args.listId))
      .order("asc")
      .collect();
    const shows = await Promise.all(items.map((item) => ctx.db.get(item.showId)));
    return items.map((item, index) => ({
      item,
      show: shows[index] ?? null,
    }));
  },
});

import { query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserOrThrow } from "./utils";
import { paginationOptsValidator } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { toPublicUser } from "./publicUser";

async function hydrateFeed(ctx: any, items: any[]) {
  const actorIds = new Set<Id<"users">>();
  const showIds = new Set<Id<"shows">>();

  for (const item of items) {
    actorIds.add(item.actorId);
    showIds.add(item.showId);
  }

  const [actors, shows] = await Promise.all([
    Promise.all(Array.from(actorIds).map((id) => ctx.db.get(id))),
    Promise.all(Array.from(showIds).map((id) => ctx.db.get(id))),
  ]);

  const actorMap = new Map(actors.filter(Boolean).map((u) => [u!._id, u!]));
  const showMap = new Map(shows.filter(Boolean).map((s) => [s!._id, s!]));

  const avatarMap = new Map<Id<"users">, string | null>();
  await Promise.all(
    actors
      .filter(Boolean)
      .map(async (user) => {
        const url = user?.avatarStorageId
          ? await ctx.storage.getUrl(user.avatarStorageId)
          : user?.image ?? null;
        if (user) {
          avatarMap.set(user._id, url ?? null);
        }
      }),
  );

  const hydrated = await Promise.all(
    items
      .filter((item) => item.type === "review")
      .map(async (item) => {
        const actor = actorMap.get(item.actorId) ?? null;
        const show = showMap.get(item.showId) ?? null;
        const review = await ctx.db.get(item.targetId as Id<"reviews">);
        if (!review) return null;
        return {
          type: "review" as const,
          timestamp: item.timestamp,
          review,
          user: toPublicUser(actor),
          avatarUrl: actor ? avatarMap.get(actor._id) ?? null : null,
          show,
        };
      })
  );

  return hydrated.filter(Boolean);
}

export const listForUser = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const page = await ctx.db
      .query("feedItems")
      .withIndex("by_owner_timestamp", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .paginate(args.paginationOpts);

    const hydrated = await hydrateFeed(ctx, page.page);
    return { ...page, page: hydrated };
  },
});

export const forUser = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const limit = Math.min(args.limit ?? 40, 80);
    const items = await ctx.db
      .query("feedItems")
      .withIndex("by_owner_timestamp", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .take(limit);
    return await hydrateFeed(ctx, items);
  },
});

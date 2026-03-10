import { internalMutation, mutation } from "./_generated/server";
import { requireAdmin } from "./utils";

export const cleanupRateLimits = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const expired = await ctx.db
      .query("rateLimits")
      .filter((q) => q.lte(q.field("resetAt"), now))
      .collect();
    await Promise.all(expired.map((item) => ctx.db.delete(item._id)));
    return { removed: expired.length };
  },
});

export const cleanupTmdbCache = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const [detailExpired, searchExpired, listExpired] = await Promise.all([
      ctx.db
        .query("tmdbDetailsCache")
        .filter((q) => q.lte(q.field("expiresAt"), now))
        .collect(),
      ctx.db
        .query("tmdbSearchCache")
        .filter((q) => q.lte(q.field("expiresAt"), now))
        .collect(),
      ctx.db
        .query("tmdbListCache")
        .filter((q) => q.lte(q.field("expiresAt"), now))
        .collect(),
    ]);
    await Promise.all([
      ...detailExpired.map((item) => ctx.db.delete(item._id)),
      ...searchExpired.map((item) => ctx.db.delete(item._id)),
      ...listExpired.map((item) => ctx.db.delete(item._id)),
    ]);
    return {
      removed:
        detailExpired.length + searchExpired.length + listExpired.length,
    };
  },
});

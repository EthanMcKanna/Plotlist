import { internalMutation, MutationCtx } from "./_generated/server";
import { v } from "convex/values";

export async function rateLimit(
  ctx: MutationCtx,
  key: string,
  limit: number,
  windowMs: number,
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();

  if (!existing || existing.resetAt <= now) {
    if (existing) {
      await ctx.db.patch(existing._id, {
        count: 1,
        resetAt: now + windowMs,
      });
    } else {
      await ctx.db.insert("rateLimits", {
        key,
        count: 1,
        resetAt: now + windowMs,
      });
    }
    return;
  }

  if (existing.count >= limit) {
    throw new Error("Rate limit exceeded");
  }

  await ctx.db.patch(existing._id, {
    count: existing.count + 1,
  });
}

export const enforce = internalMutation({
  args: { key: v.string(), limit: v.number(), windowMs: v.number() },
  handler: async (ctx, args) => {
    await rateLimit(ctx, args.key, args.limit, args.windowMs);
  },
});

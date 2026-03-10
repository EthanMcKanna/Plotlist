import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

export const shows = query({
  args: { windowHours: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const windowMs = (args.windowHours ?? 72) * 60 * 60 * 1000;
    const since = Date.now() - windowMs;
    const limit = Math.min(args.limit ?? 10, 20);

    const recentReviews = await ctx.db
      .query("reviews")
      .withIndex("by_createdAt", (q) => q.gt("createdAt", since))
      .order("desc")
      .take(500);

    const counts = new Map<Id<"shows">, number>();

    for (const review of recentReviews) {
      counts.set(review.showId, (counts.get(review.showId) ?? 0) + 2);
    }

    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    const shows = await Promise.all(sorted.map(([showId]) => ctx.db.get(showId)));

    return sorted.map(([showId, score], index) => ({
      rank: index + 1,
      score,
      show: shows[index] ?? null,
    }));
  },
});

export const mostReviewed = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 10, 20);

    const allReviews = await ctx.db
      .query("reviews")
      .withIndex("by_createdAt")
      .order("desc")
      .take(2000);

    const counts = new Map<Id<"shows">, { count: number; totalRating: number }>();

    for (const review of allReviews) {
      const existing = counts.get(review.showId) ?? { count: 0, totalRating: 0 };
      existing.count += 1;
      existing.totalRating += review.rating;
      counts.set(review.showId, existing);
    }

    const sorted = Array.from(counts.entries())
      .filter(([, stats]) => stats.count >= 1)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit);

    const shows = await Promise.all(sorted.map(([showId]) => ctx.db.get(showId)));

    return sorted.map(([, stats], index) => ({
      rank: index + 1,
      reviewCount: stats.count,
      avgRating: Math.round((stats.totalRating / stats.count) * 10) / 10,
      show: shows[index] ?? null,
    }));
  },
});

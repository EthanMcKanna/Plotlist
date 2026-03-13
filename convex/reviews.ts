import { internalQuery, mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getCurrentUserOrThrow } from "./utils";
import { rateLimit } from "./rateLimit";
import { paginationOptsValidator } from "convex/server";
import { toPublicUser } from "./publicUser";

export const create = mutation({
  args: {
    showId: v.id("shows"),
    rating: v.number(),
    reviewText: v.optional(v.string()),
    spoiler: v.boolean(),
    seasonNumber: v.optional(v.number()),
    episodeNumber: v.optional(v.number()),
    episodeTitle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await rateLimit(ctx, `review:${user._id}`, 10, 60 * 60 * 1000);
    const now = Date.now();
    if (args.rating < 0.5 || args.rating > 5) {
      throw new Error("Rating must be between 0.5 and 5");
    }

    const isEpisodeReview =
      args.seasonNumber !== undefined && args.episodeNumber !== undefined;

    if (isEpisodeReview) {
      // One review per user per episode
      const existing = await ctx.db
        .query("reviews")
        .withIndex("by_author_show", (q) =>
          q.eq("authorId", user._id).eq("showId", args.showId),
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("seasonNumber"), args.seasonNumber),
            q.eq(q.field("episodeNumber"), args.episodeNumber),
          ),
        )
        .unique();
      if (existing) {
        throw new Error("Review already exists for this episode");
      }
    } else {
      // One review per user per show (show-level only)
      const existing = await ctx.db
        .query("reviews")
        .withIndex("by_author_show", (q) =>
          q.eq("authorId", user._id).eq("showId", args.showId),
        )
        .filter((q) => q.eq(q.field("seasonNumber"), undefined))
        .unique();
      if (existing) {
        throw new Error("Review already exists for this show");
      }
    }

    const reviewId = await ctx.db.insert("reviews", {
      authorId: user._id,
      showId: args.showId,
      rating: args.rating,
      reviewText: args.reviewText?.slice(0, 5000),
      spoiler: args.spoiler,
      ...(isEpisodeReview
        ? {
            seasonNumber: args.seasonNumber,
            episodeNumber: args.episodeNumber,
            episodeTitle: args.episodeTitle,
          }
        : {}),
      createdAt: now,
    });

    // Only create feed items for show-level reviews (not episode ratings)
    if (!isEpisodeReview) {
      const followers = await ctx.db
        .query("follows")
        .withIndex("by_followee_createdAt", (q) =>
          q.eq("followeeId", user._id),
        )
        .collect();
      const followerIds = followers.slice(0, 500).map((f) => f.followerId);

      const feedOwners = [user._id, ...followerIds];
      await Promise.all(
        feedOwners.map((ownerId) =>
          ctx.db.insert("feedItems", {
            ownerId,
            actorId: user._id,
            type: "review",
            targetId: reviewId,
            showId: args.showId,
            timestamp: now,
            createdAt: now,
          }),
        ),
      );
    }

    await ctx.db.patch(user._id, {
      countsReviews: (user.countsReviews ?? 0) + 1,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.embeddings.clearUserTasteArtifacts,
      { userId: user._id },
    );

    return reviewId;
  },
});

export const rateEpisode = mutation({
  args: {
    showId: v.id("shows"),
    seasonNumber: v.number(),
    episodeNumber: v.number(),
    episodeTitle: v.optional(v.string()),
    rating: v.number(),
    reviewText: v.optional(v.string()),
    spoiler: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await rateLimit(ctx, `review:${user._id}`, 30, 60 * 1000);
    if (args.rating < 0.5 || args.rating > 5) {
      throw new Error("Rating must be between 0.5 and 5");
    }

    const existing = await ctx.db
      .query("reviews")
      .withIndex("by_author_show", (q) =>
        q.eq("authorId", user._id).eq("showId", args.showId),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("seasonNumber"), args.seasonNumber),
          q.eq(q.field("episodeNumber"), args.episodeNumber),
        ),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        rating: args.rating,
        ...(args.reviewText !== undefined
          ? { reviewText: args.reviewText.slice(0, 5000) }
          : {}),
        ...(args.spoiler !== undefined ? { spoiler: args.spoiler } : {}),
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    const now = Date.now();
    const reviewId = await ctx.db.insert("reviews", {
      authorId: user._id,
      showId: args.showId,
      rating: args.rating,
      reviewText: args.reviewText?.slice(0, 5000),
      spoiler: args.spoiler ?? false,
      seasonNumber: args.seasonNumber,
      episodeNumber: args.episodeNumber,
      episodeTitle: args.episodeTitle,
      createdAt: now,
    });
    await ctx.db.patch(user._id, {
      countsReviews: (user.countsReviews ?? 0) + 1,
    });
    return reviewId;
  },
});

export const edit = mutation({
  args: {
    reviewId: v.id("reviews"),
    rating: v.optional(v.number()),
    reviewText: v.optional(v.string()),
    spoiler: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await rateLimit(ctx, `review-edit:${user._id}`, 10, 60 * 60 * 1000);
    const review = await ctx.db.get(args.reviewId);
    if (!review) return;
    if (review.authorId !== user._id) {
      throw new Error("Not allowed");
    }

    if (args.rating !== undefined && (args.rating < 0.5 || args.rating > 5)) {
      throw new Error("Rating must be between 0.5 and 5");
    }

    await ctx.db.patch(args.reviewId, {
      rating: args.rating ?? review.rating,
      reviewText: args.reviewText?.slice(0, 5000) ?? review.reviewText,
      spoiler: args.spoiler ?? review.spoiler,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.embeddings.clearUserTasteArtifacts, {
      userId: user._id,
    });
  },
});

export const deleteReview = mutation({
  args: { reviewId: v.id("reviews") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const review = await ctx.db.get(args.reviewId);
    if (!review) return;
    if (review.authorId !== user._id) {
      throw new Error("Not allowed");
    }
    await ctx.db.delete(args.reviewId);
    const feedItems = await ctx.db
      .query("feedItems")
      .withIndex("by_target", (q) =>
        q.eq("type", "review").eq("targetId", args.reviewId),
      )
      .collect();
    await Promise.all(feedItems.map((item) => ctx.db.delete(item._id)));
    await ctx.db.patch(user._id, {
      countsReviews: Math.max(0, (user.countsReviews ?? 0) - 1),
    });
    await ctx.scheduler.runAfter(0, internal.embeddings.clearUserTasteArtifacts, {
      userId: user._id,
    });
  },
});

export const get = query({
  args: { reviewId: v.id("reviews") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.reviewId);
  },
});

export const getDetailed = query({
  args: { reviewId: v.id("reviews") },
  handler: async (ctx, args) => {
    const review = await ctx.db.get(args.reviewId);
    if (!review) return null;
    const [author, show] = await Promise.all([
      ctx.db.get(review.authorId),
      ctx.db.get(review.showId),
    ]);
    return { review, author: toPublicUser(author), show };
  },
});

export const listForShow = query({
  args: { showId: v.id("shows"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 100);
    return await ctx.db
      .query("reviews")
      .withIndex("by_show_createdAt", (q) => q.eq("showId", args.showId))
      .order("desc")
      .take(limit);
  },
});

export const listForUser = query({
  args: { userId: v.id("users"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 100);
    return await ctx.db
      .query("reviews")
      .withIndex("by_author_createdAt", (q) => q.eq("authorId", args.userId))
      .order("desc")
      .take(limit);
  },
});

async function getAuthorAvatarUrls(
  ctx: QueryCtx,
  authors: Array<any | null>,
) {
  return await Promise.all(
    authors.map(async (author) => {
      if (!author) {
        return null;
      }
      if (author.avatarStorageId) {
        return await ctx.storage.getUrl(author.avatarStorageId);
      }
      return author.image ?? null;
    }),
  );
}

export const listForShowDetailed = query({
  args: { showId: v.id("shows"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("reviews")
      .withIndex("by_show_createdAt", (q) => q.eq("showId", args.showId))
      .filter((q) => q.eq(q.field("seasonNumber"), undefined))
      .order("desc")
      .paginate(args.paginationOpts);
    const authors = await Promise.all(
      page.page.map((review) => ctx.db.get(review.authorId)),
    );
    const avatarUrls = await getAuthorAvatarUrls(ctx, authors);
    return {
      ...page,
      page: page.page.map((review, index) => ({
        review,
        author: toPublicUser(authors[index] ?? null),
        authorAvatarUrl: avatarUrls[index] ?? null,
      })),
    };
  },
});

export const listForUserDetailed = query({
  args: { userId: v.id("users"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("reviews")
      .withIndex("by_author_createdAt", (q) => q.eq("authorId", args.userId))
      .filter((q) => q.eq(q.field("seasonNumber"), undefined))
      .order("desc")
      .paginate(args.paginationOpts);
    const shows = await Promise.all(
      page.page.map((review) => ctx.db.get(review.showId)),
    );
    return {
      ...page,
      page: page.page.map((review, index) => ({
        review,
        show: shows[index] ?? null,
      })),
    };
  },
});

export const getMyEpisodeRatings = query({
  args: { showId: v.id("shows") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_author_show", (q) =>
        q.eq("authorId", user._id).eq("showId", args.showId),
      )
      .filter((q) => q.neq(q.field("seasonNumber"), undefined))
      .collect();
    return reviews;
  },
});

export const getMyEpisodeRating = query({
  args: {
    showId: v.id("shows"),
    seasonNumber: v.number(),
    episodeNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    return await ctx.db
      .query("reviews")
      .withIndex("by_author_show", (q) =>
        q.eq("authorId", user._id).eq("showId", args.showId),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("seasonNumber"), args.seasonNumber),
          q.eq(q.field("episodeNumber"), args.episodeNumber),
        ),
      )
      .unique();
  },
});

export const getEpisodeStats = query({
  args: {
    showId: v.id("shows"),
    seasonNumber: v.number(),
    episodeNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_show_episode", (q) =>
        q
          .eq("showId", args.showId)
          .eq("seasonNumber", args.seasonNumber)
          .eq("episodeNumber", args.episodeNumber),
      )
      .collect();
    if (reviews.length === 0) return null;
    const avg =
      reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    return { averageRating: avg, reviewCount: reviews.length };
  },
});

export const removeEpisodeRating = mutation({
  args: {
    showId: v.id("shows"),
    seasonNumber: v.number(),
    episodeNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const existing = await ctx.db
      .query("reviews")
      .withIndex("by_author_show", (q) =>
        q.eq("authorId", user._id).eq("showId", args.showId),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("seasonNumber"), args.seasonNumber),
          q.eq(q.field("episodeNumber"), args.episodeNumber),
        ),
      )
      .unique();
    if (!existing) return;
    await ctx.db.delete(existing._id);
    await ctx.db.patch(user._id, {
      countsReviews: Math.max(0, (user.countsReviews ?? 0) - 1),
    });
  },
});

export const listForEpisodeDetailed = query({
  args: {
    showId: v.id("shows"),
    seasonNumber: v.number(),
    episodeNumber: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 20, 50);
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_show_episode", (q) =>
        q
          .eq("showId", args.showId)
          .eq("seasonNumber", args.seasonNumber)
          .eq("episodeNumber", args.episodeNumber),
      )
      .order("desc")
      .take(limit);
    // Only include reviews that have text
    const withText = reviews.filter((r) => r.reviewText);
    const authors = await Promise.all(
      withText.map((review) => ctx.db.get(review.authorId)),
    );
    const avatarUrls = await getAuthorAvatarUrls(ctx, authors);
    return withText.map((review, index) => ({
      review,
      author: toPublicUser(authors[index] ?? null),
      authorAvatarUrl: avatarUrls[index] ?? null,
    }));
  },
});

export const listForShowDetailedByAuthors = internalQuery({
  args: {
    showId: v.id("shows"),
    authorIds: v.array(v.id("users")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 12, 20);
    const authorIds = new Set(args.authorIds);
    const reviews = (await ctx.db
      .query("reviews")
      .withIndex("by_show_createdAt", (q) => q.eq("showId", args.showId))
      .filter((q) => q.eq(q.field("seasonNumber"), undefined))
      .order("desc")
      .take(100))
      .filter((review) => authorIds.has(review.authorId))
      .slice(0, limit);

    const authors = await Promise.all(
      reviews.map((review) => ctx.db.get(review.authorId)),
    );
    const avatarUrls = await getAuthorAvatarUrls(ctx, authors);

    return reviews.map((review, index) => ({
      review,
      author: toPublicUser(authors[index] ?? null),
      authorAvatarUrl: avatarUrls[index] ?? null,
    }));
  },
});

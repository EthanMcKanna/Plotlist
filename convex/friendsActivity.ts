import { query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserOrThrow } from "./utils";
import { toPublicUser } from "./publicUser";

async function getAvatarUrl(ctx: QueryCtx, user: any): Promise<string | null> {
  if (!user) return null;
  if (user.avatarStorageId) {
    return await ctx.storage.getUrl(user.avatarStorageId);
  }
  return user.image ?? null;
}

export const getForShow = query({
  args: { showId: v.id("shows") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    // Get followee IDs (friends the user follows)
    const follows = await ctx.db
      .query("follows")
      .withIndex("by_follower_createdAt", (q) =>
        q.eq("followerId", user._id),
      )
      .take(200);

    const followeeIds = follows.map((f) => f.followeeId);
    if (followeeIds.length === 0) {
      return { friends: [], averageRating: null, ratingCount: 0 };
    }

    // For each followee, check watch state and review in parallel
    const friendsData = await Promise.all(
      followeeIds.map(async (followeeId) => {
        const watchState = await ctx.db
          .query("watchStates")
          .withIndex("by_user_show", (q) =>
            q.eq("userId", followeeId).eq("showId", args.showId),
          )
          .unique();

        if (
          !watchState ||
          watchState.status === "watchlist"
        ) {
          return null;
        }

        // Get show-level review (seasonNumber undefined)
        const review = await ctx.db
          .query("reviews")
          .withIndex("by_author_show", (q) =>
            q.eq("authorId", followeeId).eq("showId", args.showId),
          )
          .filter((q) => q.eq(q.field("seasonNumber"), undefined))
          .first();

        const friendUser = await ctx.db.get(followeeId);
        if (!friendUser) return null;

        const avatarUrl = await getAvatarUrl(ctx, friendUser);

        return {
          user: toPublicUser(friendUser),
          avatarUrl,
          watchStatus: watchState.status as
            | "watching"
            | "completed"
            | "dropped",
          rating: review?.rating ?? null,
          updatedAt: watchState.updatedAt,
        };
      }),
    );

    // Filter nulls and sort: rated friends first, then by recency
    const friends = friendsData
      .filter(
        (f): f is NonNullable<typeof f> => f !== null && f.user !== null,
      )
      .sort((a, b) => {
        if (a.rating !== null && b.rating === null) return -1;
        if (a.rating === null && b.rating !== null) return 1;
        return b.updatedAt - a.updatedAt;
      })
      .map(({ updatedAt: _, ...rest }) => rest);

    // Calculate average rating from friends who rated
    const ratings = friends
      .map((f) => f.rating)
      .filter((r): r is number => r !== null);

    const averageRating =
      ratings.length > 0
        ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
        : null;

    return {
      friends,
      averageRating,
      ratingCount: ratings.length,
    };
  },
});

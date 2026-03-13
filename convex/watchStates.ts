import { internalQuery, mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getCurrentUserOrThrow } from "./utils";
import { paginationOptsValidator } from "convex/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  canViewerSeeSection,
  getOwnerFollowsViewer,
  getProfileVisibilitySettings,
} from "./profileVisibility";

const Status = v.union(
  v.literal("watchlist"),
  v.literal("watching"),
  v.literal("completed"),
  v.literal("dropped"),
);

const SortBy = v.union(
  v.literal("date"),
  v.literal("title"),
  v.literal("year"),
);

function parsePaginationCursor(cursor: string | null) {
  if (cursor === null) {
    return 0;
  }

  const offset = Number(cursor);
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("Invalid pagination cursor");
  }

  return offset;
}

function sortDetailedResults(
  results: Array<{
    state: any;
    show: { title?: string | null; year?: number | null } | null;
  }>,
  sortBy: "date" | "title" | "year",
) {
  if (sortBy === "title") {
    results.sort((a, b) => {
      const titleA =
        typeof a.show?.title === "string" ? a.show.title.toLowerCase() : "";
      const titleB =
        typeof b.show?.title === "string" ? b.show.title.toLowerCase() : "";
      return (
        titleA.localeCompare(titleB) ||
        b.state.updatedAt - a.state.updatedAt
      );
    });
    return;
  }

  if (sortBy === "year") {
    results.sort((a, b) => {
      const yearA = a.show?.year ?? 0;
      const yearB = b.show?.year ?? 0;
      return (
        yearB - yearA ||
        b.state.updatedAt - a.state.updatedAt
      );
    });
  }
}

function paginateSortedResults<T>(
  values: T[],
  paginationOpts: {
    cursor: string | null;
    endCursor?: string | null;
    numItems: number;
  },
) {
  const start = parsePaginationCursor(paginationOpts.cursor);
  const requestedEnd =
    paginationOpts.endCursor === undefined || paginationOpts.endCursor === null
      ? values.length
      : parsePaginationCursor(paginationOpts.endCursor);
  const end = Math.min(values.length, requestedEnd, start + paginationOpts.numItems);
  const page = values.slice(start, end);
  const continueOffset = start + page.length;

  return {
    page,
    isDone: continueOffset >= values.length || continueOffset >= requestedEnd,
    continueCursor: String(continueOffset),
    splitCursor: null,
    pageStatus: null,
  };
}

async function listStates(
  ctx: QueryCtx,
  args: { status?: "watchlist" | "watching" | "completed" | "dropped"; limit?: number },
) {
  const user = await getCurrentUserOrThrow(ctx);
  const limit = Math.min(args.limit ?? 50, 100);

  let cursor = ctx.db
    .query("watchStates")
    .withIndex("by_user_updatedAt", (q) => q.eq("userId", user._id));

  if (args.status) {
    cursor = cursor.filter((q) => q.eq(q.field("status"), args.status));
  }

  return await cursor.order("desc").take(limit);
}

export const setStatus = mutation({
  args: { showId: v.id("shows"), status: Status },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const now = Date.now();
    const existing = await ctx.db
      .query("watchStates")
      .withIndex("by_user_show", (q) =>
        q.eq("userId", user._id).eq("showId", args.showId),
      )
      .unique();

    if (existing) {
      if (existing.status !== args.status) {
        const updates: Record<string, number> = {};
        const fromKey = `counts${existing.status[0].toUpperCase()}${existing.status.slice(1)}`;
        const toKey = `counts${args.status[0].toUpperCase()}${args.status.slice(1)}`;
        updates[fromKey] = Math.max(0, ((user as any)[fromKey] ?? 0) - 1);
        updates[toKey] = ((user as any)[toKey] ?? 0) + 1;
        await ctx.db.patch(user._id, updates as any);
      }
      await ctx.db.patch(existing._id, {
        status: args.status,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.embeddings.clearUserTasteArtifacts, {
        userId: user._id,
      });
      return existing._id;
    }

    const insertedId = await ctx.db.insert("watchStates", {
      userId: user._id,
      showId: args.showId,
      status: args.status,
      updatedAt: now,
    });

    const statusKey = `counts${args.status[0].toUpperCase()}${args.status.slice(1)}`;
    await ctx.db.patch(user._id, {
      countsTotalShows: (user.countsTotalShows ?? 0) + 1,
      [statusKey]: ((user as any)[statusKey] ?? 0) + 1,
    });
    await ctx.scheduler.runAfter(0, internal.embeddings.clearUserTasteArtifacts, {
      userId: user._id,
    });

    return insertedId;
  },
});

export const removeStatus = mutation({
  args: { showId: v.id("shows") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const existing = await ctx.db
      .query("watchStates")
      .withIndex("by_user_show", (q) =>
        q.eq("userId", user._id).eq("showId", args.showId),
      )
      .unique();

    if (!existing) return;

    const statusKey = `counts${existing.status[0].toUpperCase()}${existing.status.slice(1)}`;
    await ctx.db.patch(user._id, {
      countsTotalShows: Math.max(0, (user.countsTotalShows ?? 0) - 1),
      [statusKey]: Math.max(0, ((user as any)[statusKey] ?? 0) - 1),
    });

    await ctx.db.delete(existing._id);
    await ctx.scheduler.runAfter(0, internal.embeddings.clearUserTasteArtifacts, {
      userId: user._id,
    });
  },
});

export const listForUser = query({
  args: {
    status: v.optional(Status),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await listStates(ctx, args);
  },
});

export const listForUserDetailed = query({
  args: {
    status: v.optional(Status),
    paginationOpts: paginationOptsValidator,
    sortBy: v.optional(SortBy),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    let cursor = ctx.db
      .query("watchStates")
      .withIndex("by_user_updatedAt", (q) => q.eq("userId", user._id));

    if (args.status) {
      cursor = cursor.filter((q) => q.eq(q.field("status"), args.status));
    }

    const page = await cursor.order("desc").paginate(args.paginationOpts);
    const shows = await Promise.all(page.page.map((state) => ctx.db.get(state.showId)));
    const results = page.page.map((state, index) => ({
      state,
      show: shows[index] ?? null,
    }));

    // Apply sorting based on sortBy parameter
    const sortBy = args.sortBy ?? "date";
    if (sortBy === "title") {
      results.sort((a, b) => {
        const titleA =
          typeof a.show?.title === "string" ? a.show.title.toLowerCase() : "";
        const titleB =
          typeof b.show?.title === "string" ? b.show.title.toLowerCase() : "";
        return titleA.localeCompare(titleB);
      });
    } else if (sortBy === "year") {
      results.sort((a, b) => {
        const yearA = a.show?.year ?? 0;
        const yearB = b.show?.year ?? 0;
        return yearB - yearA; // Newest first
      });
    }
    // For "date", the default order (by updatedAt desc) is already applied

    return {
      ...page,
      page: results,
    };
  },
});

export const listPublicWatchlistDetailed = query({
  args: {
    userId: v.id("users"),
    paginationOpts: paginationOptsValidator,
    sortBy: v.optional(SortBy),
  },
  handler: async (ctx, args) => {
    const owner = await ctx.db.get(args.userId);
    if (!owner) {
      throw new Error("User not found");
    }

    const viewerId = await getAuthUserId(ctx);
    const profileVisibility = getProfileVisibilitySettings(owner);
    const ownerFollowsViewer = await getOwnerFollowsViewer(ctx, owner._id, viewerId);
    const canViewWatchlist = canViewerSeeSection({
      ownerId: owner._id,
      viewerId,
      visibility: profileVisibility.watchlist,
      ownerFollowsViewer,
    });

    if (!canViewWatchlist) {
      throw new Error("Not allowed");
    }

    const sortBy = args.sortBy ?? "date";
    if (sortBy === "date") {
      const page = await ctx.db
        .query("watchStates")
        .withIndex("by_user_updatedAt", (q) => q.eq("userId", args.userId))
        .filter((q) => q.eq(q.field("status"), "watchlist"))
        .order("desc")
        .paginate(args.paginationOpts);

      const shows = await Promise.all(page.page.map((state) => ctx.db.get(state.showId)));
      return {
        ...page,
        page: page.page.map((state, index) => ({
          state,
          show: shows[index] ?? null,
        })),
      };
    }

    const states = await ctx.db
      .query("watchStates")
      .withIndex("by_user_updatedAt", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("status"), "watchlist"))
      .order("desc")
      .collect();
    const shows = await Promise.all(states.map((state) => ctx.db.get(state.showId)));
    const results = states.map((state, index) => ({
      state,
      show: shows[index] ?? null,
    }));

    sortDetailedResults(results, sortBy);
    return paginateSortedResults(results, args.paginationOpts);
  },
});

export const getForShow = query({
  args: { showId: v.id("shows") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    return await ctx.db
      .query("watchStates")
      .withIndex("by_user_show", (q) =>
        q.eq("userId", user._id).eq("showId", args.showId),
      )
      .unique();
  },
});

export const getCounts = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrThrow(ctx);
    return {
      watchlist: user.countsWatchlist ?? 0,
      watching: user.countsWatching ?? 0,
      completed: user.countsCompleted ?? 0,
      dropped: user.countsDropped ?? 0,
      total: user.countsTotalShows ?? 0,
    };
  },
});

export const getStatesForShowByUserIds = internalQuery({
  args: {
    showId: v.id("shows"),
    userIds: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const uniqueUserIds = Array.from(new Set(args.userIds));
    const states = await Promise.all(
      uniqueUserIds.map(async (userId) => {
        const state = await ctx.db
          .query("watchStates")
          .withIndex("by_user_show", (q) =>
            q.eq("userId", userId).eq("showId", args.showId),
          )
          .unique();

        return state ? { userId, state } : null;
      }),
    );

    return states.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  },
});

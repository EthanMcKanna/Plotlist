import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  RELEASE_CALENDAR_PROVIDER_OPTIONS,
  buildReleaseCalendarData,
  getDateOnlyTimestamp,
  getReleaseEventFlags,
  getStartOfLocalDayTimestamp,
  isReleaseSyncStateStale,
  isTrackedReleaseStatus,
  normalizeSelectedProviders,
  type ReleaseCalendarProvider,
  type ReleaseEventRecord,
} from "../lib/releaseCalendar";
import { getCurrentUserOrThrow } from "./utils";

const RELEASE_SYNC_TTL_MS = 12 * 60 * 60 * 1000;
const RELEASE_WINDOW_MS = 180 * 24 * 60 * 60 * 1000;
const RELEASE_SYNC_BATCH_SIZE = 6;

type ShowDoc = Doc<"shows">;

function uniqShowIds(showIds: Id<"shows">[]) {
  return Array.from(new Set(showIds));
}

function getTrackedProviderSet(selectedProviders?: string[] | null) {
  return normalizeSelectedProviders(selectedProviders);
}

async function getTrackedShowIdsForUser(ctx: QueryCtx, userId: Id<"users">) {
  const watchStates = await ctx.db
    .query("watchStates")
    .withIndex("by_user_updatedAt", (q) => q.eq("userId", userId))
    .order("desc")
    .collect();

  return uniqShowIds(
    watchStates.filter((state) => isTrackedReleaseStatus(state.status)).map((state) => state.showId),
  );
}

async function getSyncStateForShow(ctx: QueryCtx, showId: Id<"shows">) {
  return await ctx.db
    .query("showReleaseSyncState")
    .withIndex("by_showId", (q) => q.eq("showId", showId))
    .unique();
}

async function getDetailsCacheForShow(ctx: QueryCtx, show: ShowDoc) {
  if (show.externalSource !== "tmdb") {
    return null;
  }

  return await ctx.db
    .query("tmdbDetailsCache")
    .withIndex("by_external", (q) =>
      q.eq("externalSource", show.externalSource).eq("externalId", show.externalId),
    )
    .unique();
}

async function loadTrackedReleaseShows(
  ctx: QueryCtx,
  userId: Id<"users">,
  now: number,
) {
  const trackedShowIds = await getTrackedShowIdsForUser(ctx, userId);
  const results = await Promise.all(
    trackedShowIds.map(async (showId) => {
      const show = await ctx.db.get(showId);
      if (!show || show.externalSource !== "tmdb") {
        return null;
      }

      const [syncState, detailsCache, events] = await Promise.all([
        getSyncStateForShow(ctx, showId),
        getDetailsCacheForShow(ctx, show),
        ctx.db
          .query("releaseEvents")
          .withIndex("by_show_airDateTs", (q) => q.eq("showId", showId))
          .collect(),
      ]);

      const providerPayload = Array.isArray((detailsCache?.payload as any)?.watchProviders)
        ? ((detailsCache?.payload as any).watchProviders as Array<{
            name?: string;
            logoUrl?: string | null;
          }>)
        : [];
      const providers: ReleaseCalendarProvider[] = providerPayload
        .filter((provider) => typeof provider?.name === "string")
        .map((provider) => ({
          name: provider.name as string,
          logoUrl: provider.logoUrl ?? null,
        }));

      return {
        _id: show._id,
        title: show.title,
        posterUrl: show.posterUrl ?? null,
        providers,
        events: events.map<ReleaseEventRecord>((event) => ({
          showId: String(event.showId),
          airDate: event.airDate,
          airDateTs: event.airDateTs,
          seasonNumber: event.seasonNumber,
          episodeNumber: event.episodeNumber,
          episodeTitle: event.episodeTitle ?? null,
          isPremiere: event.isPremiere,
          isReturningSeason: event.isReturningSeason,
          isSeasonFinale: event.isSeasonFinale,
          isSeriesFinale: event.isSeriesFinale,
        })),
        isStale: isReleaseSyncStateStale(syncState, now),
      };
    }),
  );

  return results.filter((result): result is NonNullable<typeof result> => result !== null);
}

async function upsertSyncState(
  ctx: ActionCtx,
  args: {
    showId: Id<"shows">;
    status: "idle" | "scheduled" | "running" | "ready" | "failed";
    syncedAt?: number;
    expiresAt?: number;
    lastError?: string;
  },
) {
  const now = Date.now();
  const patch = {
    showId: args.showId,
    syncedAt: args.syncedAt,
    expiresAt: args.expiresAt,
    status: args.status,
    lastError: args.lastError,
    updatedAt: now,
  };

  return await ctx.runMutation(internal.releaseCalendar.upsertShowSyncStateInternal, patch);
}

async function replaceReleaseEvents(
  ctx: ActionCtx,
  showId: Id<"shows">,
  events: Array<Omit<Doc<"releaseEvents">, "_id" | "_creationTime">>,
) {
  await ctx.runMutation(internal.releaseCalendar.replaceReleaseEventsForShowInternal, {
    showId,
    events,
  });
}

async function buildFutureReleaseEvents(
  ctx: ActionCtx,
  show: ShowDoc,
) {
  if (show.externalSource !== "tmdb") {
    return [] as Array<Omit<Doc<"releaseEvents">, "_id" | "_creationTime">>;
  }

  const details = (await ctx.runAction(internal.shows.getExtendedDetailsInternal, {
    externalId: show.externalId,
  })) as {
    seasons?: Array<{ season_number?: number; air_date?: string | null }>;
    status?: string | null;
  };

  const seasons = Array.isArray(details.seasons)
    ? details.seasons
        .filter((season) => (season?.season_number ?? 0) > 0)
        .sort((left, right) => (left.season_number ?? 0) - (right.season_number ?? 0))
    : [];

  const maxSeasonNumber =
    seasons.length > 0 ? seasons[seasons.length - 1].season_number ?? 0 : 0;
  const todayStart = getStartOfLocalDayTimestamp();
  const maxAirDate = todayStart + RELEASE_WINDOW_MS;
  const events: Array<Omit<Doc<"releaseEvents">, "_id" | "_creationTime">> = [];

  for (const season of seasons) {
    const seasonNumber = season.season_number ?? 0;
    if (seasonNumber <= 0) {
      continue;
    }

    const seasonDetails = (await ctx.runAction(internal.shows.getSeasonDetailsInternal, {
      externalId: show.externalId,
      seasonNumber,
    })) as {
      episodes?: Array<{
        airDate?: string | null;
        episodeNumber?: number;
        name?: string | null;
      }>;
    };

    const episodes = Array.isArray(seasonDetails.episodes)
      ? seasonDetails.episodes
          .filter((episode) => typeof episode?.episodeNumber === "number")
          .sort((left, right) => (left.episodeNumber ?? 0) - (right.episodeNumber ?? 0))
      : [];
    const lastEpisodeNumber =
      episodes.length > 0 ? episodes[episodes.length - 1].episodeNumber ?? 0 : 0;

    for (const episode of episodes) {
      if (!episode.airDate || typeof episode.episodeNumber !== "number") {
        continue;
      }

      const airDateTs = getDateOnlyTimestamp(episode.airDate);
      if (!Number.isFinite(airDateTs) || airDateTs < todayStart || airDateTs > maxAirDate) {
        continue;
      }

      events.push({
        showId: show._id,
        airDate: episode.airDate,
        airDateTs,
        seasonNumber,
        episodeNumber: episode.episodeNumber,
        episodeTitle: episode.name ?? undefined,
        ...getReleaseEventFlags({
          seasonNumber,
          episodeNumber: episode.episodeNumber,
          lastEpisodeNumber,
          maxSeasonNumber,
          showStatus: details.status,
        }),
      });
    }
  }

  return events.sort((left, right) => left.airDateTs - right.airDateTs);
}

async function refreshSingleShowReleaseData(ctx: ActionCtx, showId: Id<"shows">) {
  const show = await ctx.runQuery(internal.releaseCalendar.getShowByIdInternal, { showId });
  if (!show || show.externalSource !== "tmdb") {
    return { skipped: true };
  }

  try {
    const events = await buildFutureReleaseEvents(ctx, show);
    await replaceReleaseEvents(ctx, showId, events);
    const syncedAt = Date.now();
    await upsertSyncState(ctx, {
      showId,
      status: "ready",
      syncedAt,
      expiresAt: syncedAt + RELEASE_SYNC_TTL_MS,
      lastError: undefined,
    });
    return {
      skipped: false,
      eventCount: events.length,
    };
  } catch (error) {
    await upsertSyncState(ctx, {
      showId,
      status: "failed",
      lastError: String(error),
    });
    throw error;
  }
}

export const getShowSyncStateInternal = internalQuery({
  args: { showId: v.id("shows") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("showReleaseSyncState")
      .withIndex("by_showId", (q) => q.eq("showId", args.showId))
      .unique();
  },
});

export const getShowByIdInternal = internalQuery({
  args: { showId: v.id("shows") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.showId);
  },
});

export const getTrackedShowIdsForUserInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await getTrackedShowIdsForUser(ctx, args.userId);
  },
});

export const getStaleTrackedShowIdsInternal = internalQuery({
  args: {
    now: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const watchStates = await ctx.db.query("watchStates").collect();
    const candidateShowIds = uniqShowIds(
      watchStates.filter((state) => isTrackedReleaseStatus(state.status)).map((state) => state.showId),
    );
    const limit = Math.max(1, Math.min(args.limit ?? 30, 100));
    const staleShowIds: Id<"shows">[] = [];

    for (const showId of candidateShowIds) {
      const syncState = await getSyncStateForShow(ctx, showId);
      if (isReleaseSyncStateStale(syncState, args.now)) {
        staleShowIds.push(showId);
      }
      if (staleShowIds.length >= limit) {
        break;
      }
    }

    return staleShowIds;
  },
});

export const claimShowRefreshInternal = internalMutation({
  args: {
    showId: v.id("shows"),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("showReleaseSyncState")
      .withIndex("by_showId", (q) => q.eq("showId", args.showId))
      .unique();

    if (existing) {
      if (existing.status === "scheduled" || existing.status === "running") {
        return false;
      }
      if (typeof existing.expiresAt === "number" && existing.expiresAt > args.now) {
        return false;
      }

      await ctx.db.patch(existing._id, {
        status: "scheduled",
        updatedAt: args.now,
      });
      return true;
    }

    await ctx.db.insert("showReleaseSyncState", {
      showId: args.showId,
      status: "scheduled",
      updatedAt: args.now,
    });
    return true;
  },
});

export const beginShowRefreshInternal = internalMutation({
  args: {
    showId: v.id("shows"),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("showReleaseSyncState")
      .withIndex("by_showId", (q) => q.eq("showId", args.showId))
      .unique();

    if (existing) {
      if (existing.status === "running") {
        return false;
      }
      if (existing.status === "ready" && typeof existing.expiresAt === "number" && existing.expiresAt > args.now) {
        return false;
      }

      await ctx.db.patch(existing._id, {
        status: "running",
        updatedAt: args.now,
      });
      return true;
    }

    await ctx.db.insert("showReleaseSyncState", {
      showId: args.showId,
      status: "running",
      updatedAt: args.now,
    });
    return true;
  },
});

export const upsertShowSyncStateInternal = internalMutation({
  args: {
    showId: v.id("shows"),
    syncedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    status: v.union(
      v.literal("idle"),
      v.literal("scheduled"),
      v.literal("running"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    lastError: v.optional(v.string()),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("showReleaseSyncState")
      .withIndex("by_showId", (q) => q.eq("showId", args.showId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }

    return await ctx.db.insert("showReleaseSyncState", args);
  },
});

export const replaceReleaseEventsForShowInternal = internalMutation({
  args: {
    showId: v.id("shows"),
    events: v.array(
      v.object({
        showId: v.id("shows"),
        airDate: v.string(),
        airDateTs: v.number(),
        seasonNumber: v.number(),
        episodeNumber: v.number(),
        episodeTitle: v.optional(v.string()),
        isPremiere: v.boolean(),
        isReturningSeason: v.boolean(),
        isSeasonFinale: v.boolean(),
        isSeriesFinale: v.boolean(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("releaseEvents")
      .withIndex("by_show_airDateTs", (q) => q.eq("showId", args.showId))
      .collect();

    await Promise.all(existing.map((event) => ctx.db.delete(event._id)));

    for (const event of args.events) {
      await ctx.db.insert("releaseEvents", event);
    }
  },
});

export const refreshTrackedShowsBatch = internalAction({
  args: { showIds: v.array(v.id("shows")) },
  handler: async (ctx, args) => {
    const uniqueShowIds = uniqShowIds(args.showIds);
    const batch = uniqueShowIds.slice(0, RELEASE_SYNC_BATCH_SIZE);
    const remaining = uniqueShowIds.slice(RELEASE_SYNC_BATCH_SIZE);

    let processed = 0;
    for (const showId of batch) {
      try {
        const shouldRefresh = await ctx.runMutation(
          internal.releaseCalendar.beginShowRefreshInternal,
          { showId, now: Date.now() },
        );
        if (!shouldRefresh) {
          continue;
        }
        await refreshSingleShowReleaseData(ctx, showId);
      } catch (error) {
        console.warn("[releaseCalendar] Failed to refresh show", showId, error);
      }
      processed += 1;
    }

    if (remaining.length > 0) {
      await ctx.scheduler.runAfter(0, internal.releaseCalendar.refreshTrackedShowsBatch, {
        showIds: remaining,
      });
    }

    return {
      processed,
      remaining: remaining.length,
    };
  },
});

export const scheduleStaleTrackedShowRefresh = internalAction({
  args: {},
  handler: async (ctx) => {
    const staleShowIds = await ctx.runQuery(internal.releaseCalendar.getStaleTrackedShowIdsInternal, {
      now: Date.now(),
      limit: 30,
    });

    if (staleShowIds.length === 0) {
      return { scheduledCount: 0 };
    }

    const claimedShowIds: Id<"shows">[] = [];
    for (const showId of staleShowIds) {
      const claimed = await ctx.runMutation(internal.releaseCalendar.claimShowRefreshInternal, {
        showId,
        now: Date.now(),
      });
      if (claimed) {
        claimedShowIds.push(showId);
      }
    }
    if (claimedShowIds.length === 0) {
      return { scheduledCount: 0 };
    }
    await ctx.scheduler.runAfter(0, internal.releaseCalendar.refreshTrackedShowsBatch, {
      showIds: claimedShowIds,
    });

    return { scheduledCount: claimedShowIds.length };
  },
});

export const refreshForMe = action({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const trackedShowIds = await ctx.runQuery(internal.releaseCalendar.getTrackedShowIdsForUserInternal, {
      userId,
    });
    if (trackedShowIds.length === 0) {
      return { scheduledCount: 0 };
    }

    const claimedShowIds: Id<"shows">[] = [];
    for (const showId of trackedShowIds) {
      const claimed = await ctx.runMutation(internal.releaseCalendar.claimShowRefreshInternal, {
        showId,
        now: Date.now(),
      });
      if (claimed) {
        claimedShowIds.push(showId);
      }
    }
    if (claimedShowIds.length === 0) {
      return { scheduledCount: 0 };
    }
    await ctx.scheduler.runAfter(0, internal.releaseCalendar.refreshTrackedShowsBatch, {
      showIds: claimedShowIds,
    });

    return { scheduledCount: claimedShowIds.length };
  },
});

export const setProviderFilter = mutation({
  args: {
    selectedProviders: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const selectedProviders = getTrackedProviderSet(args.selectedProviders);
    await ctx.db.patch(user._id, {
      releaseCalendarPreferences: {
        selectedProviders,
      },
    });
    return {
      selectedProviders,
    };
  },
});

export const getHomePreview = query({
  args: {
    today: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const shows = await loadTrackedReleaseShows(ctx, user._id, Date.now());
    const selectedProviders = getTrackedProviderSet(
      user.releaseCalendarPreferences?.selectedProviders,
    );
    const tonight = buildReleaseCalendarData({
      shows,
      today: args.today,
      view: "tonight",
      selectedProviders,
      limit: 3,
    });
    const upcoming = buildReleaseCalendarData({
      shows,
      today: args.today,
      view: "upcoming",
      selectedProviders,
      limit: 4,
    });

    return {
      providerOptions: RELEASE_CALENDAR_PROVIDER_OPTIONS,
      selectedProviders,
      tonightGroups: tonight.groups,
      upcomingGroups: upcoming.groups,
      staleShowIds: uniqShowIds([
        ...tonight.staleShowIds,
        ...upcoming.staleShowIds,
      ] as Array<Id<"shows">>).map((showId) => String(showId)),
      totalTonight: tonight.totalItems,
      totalUpcoming: upcoming.totalItems,
    };
  },
});

export const listForMe = query({
  args: {
    view: v.union(
      v.literal("tonight"),
      v.literal("upcoming"),
      v.literal("premieres"),
      v.literal("returning"),
      v.literal("finales"),
    ),
    today: v.string(),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
    selectedProvidersOverride: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const shows = await loadTrackedReleaseShows(ctx, user._id, Date.now());
    const selectedProviders = getTrackedProviderSet(
      args.selectedProvidersOverride ?? user.releaseCalendarPreferences?.selectedProviders,
    );
    const result = buildReleaseCalendarData({
      shows,
      today: args.today,
      view: args.view,
      selectedProviders,
      limit: args.limit,
      cursor: args.cursor,
    });

    return {
      providerOptions: RELEASE_CALENDAR_PROVIDER_OPTIONS,
      selectedProviders,
      groups: result.groups,
      totalItems: result.totalItems,
      staleShowIds: result.staleShowIds,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

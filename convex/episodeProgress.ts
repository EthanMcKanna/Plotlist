import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getCurrentUserOrThrow } from "./utils";
import { rateLimit } from "./rateLimit";

type WatchStatus = "watchlist" | "watching" | "completed" | "dropped";

const STATUS_COUNT_KEYS: Record<WatchStatus, string> = {
  watchlist: "countsWatchlist",
  watching: "countsWatching",
  completed: "countsCompleted",
  dropped: "countsDropped",
};

function isAiredOnOrBefore(airDate: unknown, now: number) {
  if (typeof airDate !== "string" || airDate.length === 0) {
    return false;
  }

  const timestamp = new Date(airDate).getTime();
  return Number.isFinite(timestamp) && timestamp <= now;
}

async function transitionWatchState(
  ctx: MutationCtx,
  user: Awaited<ReturnType<typeof getCurrentUserOrThrow>>,
  showId: Id<"shows">,
  nextStatus: WatchStatus,
  now: number,
) {
  const existing = await ctx.db
    .query("watchStates")
    .withIndex("by_user_show", (q) =>
      q.eq("userId", user._id).eq("showId", showId),
    )
    .unique();

  if (!existing || existing.status === nextStatus) {
    return;
  }

  const fromKey = STATUS_COUNT_KEYS[existing.status];
  const toKey = STATUS_COUNT_KEYS[nextStatus];

  await ctx.db.patch(user._id, {
    [fromKey]: Math.max(0, ((user as any)[fromKey] ?? 0) - 1),
    [toKey]: ((user as any)[toKey] ?? 0) + 1,
  } as any);

  await ctx.db.patch(existing._id, {
    status: nextStatus,
    updatedAt: now,
  });

  await ctx.scheduler.runAfter(0, internal.embeddings.clearUserTasteArtifacts, {
    userId: user._id,
  });
}

async function syncCompletedStatusForShow(
  ctx: MutationCtx,
  user: Awaited<ReturnType<typeof getCurrentUserOrThrow>>,
  showId: Id<"shows">,
  watchedCount: number,
  now: number,
) {
  const existingState = await ctx.db
    .query("watchStates")
    .withIndex("by_user_show", (q) =>
      q.eq("userId", user._id).eq("showId", showId),
    )
    .unique();
  if (!existingState) {
    return;
  }

  const show = await ctx.db.get(showId);
  if (!show || show.externalSource !== "tmdb") {
    return;
  }

  const detailsCache = await ctx.db
    .query("tmdbDetailsCache")
    .withIndex("by_external", (q) =>
      q.eq("externalSource", show.externalSource).eq("externalId", show.externalId),
    )
    .unique();

  const payload = detailsCache?.payload as
    | {
        status?: string;
        numberOfEpisodes?: number;
        seasons?: Array<{
          season_number?: number;
          episode_count?: number;
          air_date?: string | null;
        }>;
      }
    | undefined;
  let availableEpisodes = 0;
  let resolvedAvailableEpisodes = payload?.status === "Ended";

  const seasons = Array.isArray(payload?.seasons)
    ? [...payload.seasons]
        .filter((season) => (season?.season_number ?? 0) > 0)
        .sort((a, b) => (a.season_number ?? 0) - (b.season_number ?? 0))
    : [];
  const latestSeasonNumber =
    seasons.length > 0 ? seasons[seasons.length - 1].season_number ?? 0 : 0;

  for (const season of seasons) {
    const seasonNumber = season.season_number ?? 0;
    if (seasonNumber <= 0) {
      continue;
    }

    const seasonCache = await ctx.db
      .query("tmdbDetailsCache")
      .withIndex("by_external", (q) =>
        q
          .eq("externalSource", "tmdb-season")
          .eq("externalId", `${show.externalId}:season:${seasonNumber}`),
      )
      .unique();
    const cachedEpisodes = Array.isArray((seasonCache?.payload as any)?.episodes)
      ? (seasonCache?.payload as any).episodes.filter(
          (episode: any) => typeof episode?.episodeNumber === "number",
        )
      : [];

    if (cachedEpisodes.length > 0) {
      resolvedAvailableEpisodes = true;
      availableEpisodes += cachedEpisodes.filter((episode: any) =>
        payload?.status === "Ended" || isAiredOnOrBefore(episode.airDate, now),
      ).length;
      continue;
    }

    if (
      typeof season?.episode_count === "number" &&
      season.episode_count > 0 &&
      seasonNumber < latestSeasonNumber &&
      isAiredOnOrBefore(season.air_date, now)
    ) {
      availableEpisodes += season.episode_count;
      resolvedAvailableEpisodes = true;
    }
  }

  if (!resolvedAvailableEpisodes || availableEpisodes <= 0) {
    return;
  }

  if (
    existingState.status !== "completed" &&
    watchedCount >= availableEpisodes
  ) {
    await transitionWatchState(ctx, user, showId, "completed", now);
    return;
  }

  if (
    existingState.status === "completed" &&
    watchedCount > 0 &&
    watchedCount < availableEpisodes
  ) {
    await transitionWatchState(ctx, user, showId, "watching", now);
  }
}

export const toggleEpisode = mutation({
  args: {
    showId: v.id("shows"),
    seasonNumber: v.number(),
    episodeNumber: v.number(),
    episodeTitle: v.optional(v.string()),
    createLog: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await rateLimit(ctx, `ep:${user._id}`, 60, 60_000);

    const existing = await ctx.db
      .query("episodeProgress")
      .withIndex("by_user_show_season_episode", (q) =>
        q
          .eq("userId", user._id)
          .eq("showId", args.showId)
          .eq("seasonNumber", args.seasonNumber)
          .eq("episodeNumber", args.episodeNumber),
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      const remainingEpisodes = await ctx.db
        .query("episodeProgress")
        .withIndex("by_user_show", (q) =>
          q.eq("userId", user._id).eq("showId", args.showId),
        )
        .collect();
      await syncCompletedStatusForShow(
        ctx,
        user,
        args.showId,
        remainingEpisodes.length,
        Date.now(),
      );
      return { watched: false };
    }

    const now = Date.now();
    await ctx.db.insert("episodeProgress", {
      userId: user._id,
      showId: args.showId,
      seasonNumber: args.seasonNumber,
      episodeNumber: args.episodeNumber,
      watchedAt: now,
    });

    if (args.createLog !== false) {
      const logId = await ctx.db.insert("watchLogs", {
        userId: user._id,
        showId: args.showId,
        watchedAt: now,
        seasonNumber: args.seasonNumber,
        episodeNumber: args.episodeNumber,
        episodeTitle: args.episodeTitle?.slice(0, 200),
      });

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
            type: "log",
            targetId: logId,
            showId: args.showId,
            timestamp: now,
            createdAt: now,
          }),
        ),
      );

      await ctx.db.patch(user._id, {
        countsLogs: (user.countsLogs ?? 0) + 1,
      });
    }

    const watchedEpisodes = await ctx.db
      .query("episodeProgress")
      .withIndex("by_user_show", (q) =>
        q.eq("userId", user._id).eq("showId", args.showId),
      )
      .collect();
    await syncCompletedStatusForShow(
      ctx,
      user,
      args.showId,
      watchedEpisodes.length,
      now,
    );

    return { watched: true };
  },
});

export const markSeasonWatched = mutation({
  args: {
    showId: v.id("shows"),
    seasonNumber: v.number(),
    createLog: v.optional(v.boolean()),
    episodes: v.array(
      v.object({
        episodeNumber: v.number(),
        title: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await rateLimit(ctx, `ep-season:${user._id}`, 10, 60_000);
    const now = Date.now();

    const existingEps = await ctx.db
      .query("episodeProgress")
      .withIndex("by_user_show", (q) =>
        q.eq("userId", user._id).eq("showId", args.showId),
      )
      .collect();

    const watchedSet = new Set(
      existingEps
        .filter((e) => e.seasonNumber === args.seasonNumber)
        .map((e) => e.episodeNumber),
    );

    const newEpisodes = args.episodes.filter(
      (ep) => !watchedSet.has(ep.episodeNumber),
    );

    for (const ep of newEpisodes) {
      await ctx.db.insert("episodeProgress", {
        userId: user._id,
        showId: args.showId,
        seasonNumber: args.seasonNumber,
        episodeNumber: ep.episodeNumber,
        watchedAt: now,
      });
    }

    if (newEpisodes.length > 0 && args.createLog !== false) {
      const logId = await ctx.db.insert("watchLogs", {
        userId: user._id,
        showId: args.showId,
        watchedAt: now,
        note: `Watched ${args.episodes.length} episodes of Season ${args.seasonNumber}`,
        seasonNumber: args.seasonNumber,
      });

      const followers = await ctx.db
        .query("follows")
        .withIndex("by_followee_createdAt", (q) =>
          q.eq("followeeId", user._id),
        )
        .collect();
      const followerIds = followers.slice(0, 500).map((f) => f.followerId);
      await Promise.all(
        [user._id, ...followerIds].map((ownerId) =>
          ctx.db.insert("feedItems", {
            ownerId,
            actorId: user._id,
            type: "log",
            targetId: logId,
            showId: args.showId,
            timestamp: now,
            createdAt: now,
          }),
        ),
      );

      await ctx.db.patch(user._id, {
        countsLogs: (user.countsLogs ?? 0) + 1,
      });
    }

    const watchedEpisodes = await ctx.db
      .query("episodeProgress")
      .withIndex("by_user_show", (q) =>
        q.eq("userId", user._id).eq("showId", args.showId),
      )
      .collect();
    await syncCompletedStatusForShow(
      ctx,
      user,
      args.showId,
      watchedEpisodes.length,
      now,
    );

    return { markedCount: newEpisodes.length };
  },
});

export const unmarkSeasonWatched = mutation({
  args: {
    showId: v.id("shows"),
    seasonNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const episodes = await ctx.db
      .query("episodeProgress")
      .withIndex("by_user_show", (q) =>
        q.eq("userId", user._id).eq("showId", args.showId),
      )
      .collect();

    const seasonEps = episodes.filter(
      (e) => e.seasonNumber === args.seasonNumber,
    );
    for (const ep of seasonEps) {
      await ctx.db.delete(ep._id);
    }

    const remainingEpisodes = episodes.length - seasonEps.length;
    await syncCompletedStatusForShow(
      ctx,
      user,
      args.showId,
      remainingEpisodes,
      Date.now(),
    );

    return { removedCount: seasonEps.length };
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrThrow(ctx);

    const allEpisodes = await ctx.db
      .query("episodeProgress")
      .withIndex("by_user_watchedAt", (q) => q.eq("userId", user._id))
      .collect();

    const totalEpisodes = allEpisodes.length;
    const showEpCounts = new Map<string, number>();
    for (const ep of allEpisodes) {
      showEpCounts.set(
        ep.showId,
        (showEpCounts.get(ep.showId) ?? 0) + 1,
      );
    }
    const showsWithProgress = showEpCounts.size;

    let totalMinutes = 0;
    for (const [showId, epCount] of showEpCounts) {
      const show = await ctx.db.get(showId as Id<"shows">);
      if (!show) {
        totalMinutes += epCount * 42;
        continue;
      }
      const cache = await ctx.db
        .query("tmdbDetailsCache")
        .withIndex("by_external", (q) =>
          q.eq("externalSource", show.externalSource).eq("externalId", show.externalId),
        )
        .unique();

      const runtime = (cache?.payload as any)?.episodeRunTime;
      totalMinutes += epCount * (typeof runtime === "number" && runtime > 0 ? runtime : 42);
    }

    return {
      totalEpisodes,
      showsWithProgress,
      totalMinutes,
    };
  },
});

export const getProgressForShow = query({
  args: { showId: v.id("shows") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    return await ctx.db
      .query("episodeProgress")
      .withIndex("by_user_show", (q) =>
        q.eq("userId", user._id).eq("showId", args.showId),
      )
      .collect();
  },
});

export const getUpNext = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrThrow(ctx);
    const now = Date.now();

    const watchingStates = await ctx.db
      .query("watchStates")
      .withIndex("by_user_updatedAt", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    const candidateStates = watchingStates.filter(
      (s) => s.status === "watching" || s.status === "completed",
    );
    if (candidateStates.length === 0) return [];

    const results = await Promise.all(
      candidateStates.slice(0, 20).map(async (state) => {
        const show = await ctx.db.get(state.showId);
        if (!show) return null;

        const detailsCache =
          show.externalSource === "tmdb"
            ? await ctx.db
                .query("tmdbDetailsCache")
                .withIndex("by_external", (q) =>
                  q.eq("externalSource", show.externalSource).eq("externalId", show.externalId),
                )
                .unique()
            : null;

        const episodes = await ctx.db
          .query("episodeProgress")
          .withIndex("by_user_show", (q) =>
            q.eq("userId", user._id).eq("showId", state.showId),
          )
          .collect();
        const watchedKeys = new Set(
          episodes.map((ep) => `S${ep.seasonNumber}E${ep.episodeNumber}`),
        );

        let lastSeason = 0;
        let lastEpisode = 0;
        let lastWatchedAt = 0;

        for (const ep of episodes) {
          if (
            ep.seasonNumber > lastSeason ||
            (ep.seasonNumber === lastSeason &&
              ep.episodeNumber > lastEpisode)
          ) {
            lastSeason = ep.seasonNumber;
            lastEpisode = ep.episodeNumber;
            lastWatchedAt = ep.watchedAt;
          }
        }

        let nextSeasonNumber = 1;
        let nextEpisodeNumber = 1;
        let nextAirDate: number | null = null;
        let isUpcoming = false;

        const detailsStatus = (detailsCache?.payload as any)?.status;
        const seasons = Array.isArray((detailsCache?.payload as any)?.seasons)
          ? [...(detailsCache?.payload as any).seasons]
              .filter((season: any) => (season?.season_number ?? 0) > 0)
              .sort((a: any, b: any) => a.season_number - b.season_number)
          : [];
        const latestSeasonNumber =
          seasons.length > 0 ? seasons[seasons.length - 1].season_number : 0;
        const knownEpisodesBySeason = new Map<number, number[]>();

        if (episodes.length > 0 && seasons.length > 0) {
          let nextUnwatched: { seasonNumber: number; episodeNumber: number } | null = null;
          let nextUpcoming:
            | { seasonNumber: number; episodeNumber: number; airDate: number }
            | null = null;

          for (const season of seasons) {
            const seasonNumber = season.season_number;
            const seasonCache = await ctx.db
              .query("tmdbDetailsCache")
              .withIndex("by_external", (q) =>
                q
                  .eq("externalSource", "tmdb-season")
                  .eq("externalId", `${show.externalId}:season:${seasonNumber}`),
              )
              .unique();
            const cachedEpisodes = Array.isArray((seasonCache?.payload as any)?.episodes)
              ? (seasonCache?.payload as any).episodes
                  .filter((episode: any) => typeof episode?.episodeNumber === "number")
                  .sort((a: any, b: any) => a.episodeNumber - b.episodeNumber)
              : [];
            const airedEpisodes = cachedEpisodes.filter(
              (episode: any) =>
                isAiredOnOrBefore(episode.airDate, now) || detailsStatus === "Ended",
            );

            for (const episode of cachedEpisodes) {
              const episodeKey = `S${seasonNumber}E${episode.episodeNumber}`;
              if (watchedKeys.has(episodeKey)) {
                continue;
              }

              const airDate = new Date(episode.airDate ?? "").getTime();
              if (!Number.isFinite(airDate) || airDate <= now) {
                continue;
              }

              if (!nextUpcoming || airDate < nextUpcoming.airDate) {
                nextUpcoming = {
                  seasonNumber,
                  episodeNumber: episode.episodeNumber,
                  airDate,
                };
              }
            }

            const episodeNumbers =
              airedEpisodes.length > 0
                ? airedEpisodes.map((episode: any) => episode.episodeNumber)
                : typeof season?.episode_count === "number" &&
                    season.episode_count > 0 &&
                    (detailsStatus === "Ended" ||
                      (seasonNumber < latestSeasonNumber &&
                        isAiredOnOrBefore(season.air_date, now)))
                  ? Array.from(
                      { length: season.episode_count },
                      (_, index) => index + 1,
                    )
                  : [];
            knownEpisodesBySeason.set(seasonNumber, episodeNumbers);

            for (const episodeNumber of episodeNumbers) {
              if (!watchedKeys.has(`S${seasonNumber}E${episodeNumber}`)) {
                nextUnwatched = {
                  seasonNumber,
                  episodeNumber,
                };
                break;
              }
            }

            if (nextUnwatched) {
              break;
            }
          }

          if (!nextUnwatched) {
            if (nextUpcoming) {
              nextSeasonNumber = nextUpcoming.seasonNumber;
              nextEpisodeNumber = nextUpcoming.episodeNumber;
              nextAirDate = nextUpcoming.airDate;
              isUpcoming = true;
            } else {
            const lastSeasonKnownEpisodes =
              knownEpisodesBySeason.get(lastSeason) ?? [];
            const lastKnownEpisode =
              lastSeasonKnownEpisodes.length > 0
                ? lastSeasonKnownEpisodes[lastSeasonKnownEpisodes.length - 1]
                : null;
            const hasKnownEpisodesAfterLastSeason = seasons.some(
              (season: any) =>
                season.season_number > lastSeason &&
                (knownEpisodesBySeason.get(season.season_number)?.length ?? 0) > 0,
            );

            if (
              detailsStatus === "Ended" ||
              (lastKnownEpisode !== null &&
                lastEpisode >= lastKnownEpisode &&
                !hasKnownEpisodesAfterLastSeason)
            ) {
              return null;
            }
            nextSeasonNumber = lastSeason || 1;
            nextEpisodeNumber = lastEpisode > 0 ? lastEpisode + 1 : 1;
            }
          } else {
            nextSeasonNumber = nextUnwatched.seasonNumber;
            nextEpisodeNumber = nextUnwatched.episodeNumber;
          }
        }

        // Look up the episode still image and name for the next episode
        let nextEpisodeStillUrl: string | null = null;
        let nextEpisodeName: string | null = null;
        if (show.externalSource === "tmdb" && nextSeasonNumber > 0) {
          const nextSeasonCache = await ctx.db
            .query("tmdbDetailsCache")
            .withIndex("by_external", (q) =>
              q
                .eq("externalSource", "tmdb-season")
                .eq("externalId", `${show.externalId}:season:${nextSeasonNumber}`),
            )
            .unique();
          const nextCachedEpisodes = Array.isArray((nextSeasonCache?.payload as any)?.episodes)
            ? (nextSeasonCache?.payload as any).episodes
            : [];
          const nextEp = nextCachedEpisodes.find(
            (ep: any) => ep.episodeNumber === nextEpisodeNumber,
          );
          if (nextEp?.stillPath) {
            nextEpisodeStillUrl = nextEp.stillPath;
          }
          if (nextEp?.name) {
            nextEpisodeName = nextEp.name;
          }
        }

        return {
          showId: state.showId,
          show: {
            _id: show._id,
            title: show.title,
            posterUrl: show.posterUrl,
            backdropUrl: show.backdropUrl ?? null,
            externalId: show.externalId,
            externalSource: show.externalSource,
          },
          totalWatched: episodes.length,
          lastWatchedSeason: lastSeason,
          lastWatchedEpisode: lastEpisode,
          nextSeasonNumber,
          nextEpisodeNumber,
          nextAirDate,
          nextEpisodeStillUrl,
          nextEpisodeName,
          isUpcoming,
          lastWatchedAt,
          stateUpdatedAt: state.updatedAt,
        };
      }),
    );

    return results
      .filter(Boolean)
      .sort((a, b) => {
        const aTime = a!.lastWatchedAt || a!.stateUpdatedAt;
        const bTime = b!.lastWatchedAt || b!.stateUpdatedAt;
        return bTime - aTime;
      });
  },
});

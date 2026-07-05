import type { IncomingMessage } from "node:http";

import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { chunkForSqlParams, ilike } from "./sql-dialect";
import { z } from "zod";

import {
  blocks,
  comments,
  contactSyncEntries,
  episodeProgress,
  feedItems,
  followRequests,
  follows,
  likes,
  lists,
  listItems,
  notifications,
  phoneVerificationRequests,
  pushPlatformValues,
  pushTokens,
  releaseEvents,
  reports,
  reviews,
  shows,
  tmdbDetailsCache,
  tmdbListCache,
  tmdbSearchCache,
  userTastePreferences,
  users,
  watchLogs,
  watchStates,
} from "../../db/schema";
import { db } from "./db";
import { ApiError } from "./errors";
import { createId } from "./ids";
import { normalizePhoneNumber, hashPhoneNumber, matchesAppReviewBypass } from "./phone";
import { requireAuthUser, getOptionalAuthUser } from "./request-auth";
import { getStaleReleaseShowIds, refreshTrackedReleaseCalendarForUser } from "./release-refresh";
import { clientRateLimitKey, enforceRateLimit, rateLimitKey } from "./rate-limit";
import { buildPersonPreviews, normalizeSearchText, toClientUser } from "./social";
import { sendPhoneVerificationCode } from "./twilio";
import { createUploadToken, getRequestOrigin } from "./uploads";
import { getHomeShowKey, rankHomeShows } from "../../lib/homeRanking";
import { normalizeStreamingProviderKeys } from "../../lib/streamingProviders";
import {
  isHomeCatalogCacheFresh,
  isHomeCatalogCacheUsableAfterError,
} from "../../lib/homeCatalogCache";
import {
  getHomeEditorialSeedItems,
  getHomeEditorialProviderSeedItems,
  type HomeEditorialSeedGroup,
  type HomeEditorialProviderKey,
} from "../../lib/homeEditorialSeeds";
import {
  buildReleaseCalendarData,
  extractTmdbReleaseProviders,
  getDateOnlyStartTimestamp,
  getLocalDateString,
  getReleaseCalendarShowIds,
  getStartOfLocalDayTimestamp,
  isDateOnlyString,
  RELEASE_CALENDAR_MAX_ITEMS,
  RELEASE_CALENDAR_PROVIDER_OPTIONS,
  type ReleaseCalendarShowSource,
} from "../../lib/releaseCalendar";
import { getReleaseAwareUpNextEpisode } from "../../lib/upNextReleaseMerge";
import {
  fetchAndCacheSeason,
  findCachedSeasonEpisode,
  readSeasonCacheEntries,
  seasonCacheKey,
  slimSeasonPayload,
  upsertSeasonCacheEntry,
} from "./season-cache";
import { getImdbRatings } from "./imdb-ratings";
import {
  notifyComment,
  notifyFollow,
  notifyFollowAccepted,
  notifyFollowRequest,
  notifyLike,
  resolveTargetOwner,
} from "./notifications";
import {
  getBlockedEitherWayIdSet,
  getBlockStatus,
  getProfileAudience,
  isBlockedEitherWay,
} from "./privacy";
import {
  canViewProfileSection,
  canViewPrivateProfileContent,
  PROFILE_VISIBILITY_VALUES,
  resolveProfileVisibility,
} from "../../lib/profilePrivacy";
import {
  mergeNotificationPreferences,
  resolveNotificationPreferences,
} from "../../lib/notificationContent";
import { getWatchInsightsForUser } from "./watch-insights";
import {
  getEpisodeProgressState,
  isEpisodeVerified,
  normalizeEpisodeSeasonSummaries,
} from "../../lib/episodeProgressState";

type RpcHandler = (input: {
  args: any;
  req: IncomingMessage;
}) => Promise<unknown>;

const ensureProfileArgs = z.object({
  username: z.string().optional(),
  displayName: z.string().optional(),
});

// "following" is accepted from older clients and normalized to "followers".
const profileVisibilityValueArg = z.enum(["public", "followers", "private", "following"]);

const profileVisibilityArgs = z.object({
  favorites: profileVisibilityValueArg.optional(),
  currentlyWatching: profileVisibilityValueArg.optional(),
  watchlist: profileVisibilityValueArg.optional(),
});

const updateProfileArgs = z.object({
  username: z.string().optional(),
  displayName: z.string().optional(),
  bio: z.string().nullable().optional(),
  favoriteShowIds: z.array(z.string()).optional(),
  favoriteGenres: z.array(z.string()).optional(),
  avatarStorageId: z.string().optional(),
  profileVisibility: profileVisibilityArgs.optional(),
  releaseCalendarPreferences: z
    .object({
      selectedProviders: z.array(z.string()),
    })
    .optional(),
  streamingProviders: z.array(z.string().max(40)).max(20).optional(),
});

const setOnboardingStepArgs = z.object({
  step: z.enum(["profile", "follow", "shows", "complete"]),
});

const followArgs = z.object({
  userIdToFollow: z.string().min(1),
});

const unfollowArgs = z.object({
  userIdToUnfollow: z.string().min(1),
});

const optionalLimitArgs = z.object({
  limit: z.number().int().positive().optional(),
});

const getStorageUrlArgs = z.object({
  storageId: z.string().min(1),
});

const CONTACT_INVITE_RESEND_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function isContactInviteReady(
  entry: { matchedUserId?: string | null; invitedAt?: number | null },
  now = Date.now(),
) {
  return (
    !entry.matchedUserId &&
    (!entry.invitedAt || entry.invitedAt <= now - CONTACT_INVITE_RESEND_COOLDOWN_MS)
  );
}

function sortInviteCandidates<T extends { invitedAt?: number | null; displayName: string; updatedAt: number }>(
  rows: T[],
  now = Date.now(),
) {
  return [...rows].sort((left, right) => {
    const readyDelta =
      Number(isContactInviteReady(right, now)) - Number(isContactInviteReady(left, now));
    if (readyDelta !== 0) {
      return readyDelta;
    }
    const inviteDelta = (left.invitedAt ?? 0) - (right.invitedAt ?? 0);
    if (inviteDelta !== 0) {
      return inviteDelta;
    }
    return left.displayName.localeCompare(right.displayName);
  });
}

const syncContactsArgs = z.object({
  entries: z.array(
    z.object({
      sourceRecordId: z.string().optional(),
      displayName: z.string().optional(),
      phone: z.string(),
    }),
  ),
});

const targetArgs = z.object({
  targetType: z.enum(["review", "log", "list"]),
  targetId: z.string().min(1),
});

const paginationArgs = z
  .object({
    paginationOpts: z
      .object({
        cursor: z.string().nullable().optional(),
        numItems: z.number().int().positive().optional(),
      })
      .optional(),
  })
  .passthrough();

type AnyRow = { id: string; [key: string]: unknown };

function toDoc<T extends AnyRow>(row: T | null | undefined) {
  return row ? ({ ...row, _id: row.id, _creationTime: row.createdAt } as any) : null;
}

function pageRows<T>(rows: T[], args: any) {
  const parsed = paginationArgs.parse(args ?? {});
  const start = Number(parsed.paginationOpts?.cursor ?? 0) || 0;
  const numItems = parsed.paginationOpts?.numItems ?? 20;
  const page = rows.slice(start, start + numItems);
  const next = start + page.length;
  return {
    page,
    results: page,
    continueCursor: String(next),
    isDone: next >= rows.length,
  };
}

function showToDoc(show: typeof shows.$inferSelect | null | undefined) {
  return toDoc(show);
}

type SeasonSummary = {
  seasonNumber: number;
  episodeCount: number;
  airDate?: string | null;
};

function readSeasonSummaries(payload: unknown): SeasonSummary[] {
  const raw = (payload as { seasons?: unknown })?.seasons;
  if (!Array.isArray(raw)) return [];
  return normalizeEpisodeSeasonSummaries(
    raw
      .map((season): SeasonSummary | null => {
        const seasonNumber =
          (season?.seasonNumber as number | undefined) ??
          (season?.season_number as number | undefined);
        const episodeCount =
          (season?.episodeCount as number | undefined) ??
          (season?.episode_count as number | undefined) ??
          0;
        const airDate =
          (season?.airDate as string | null | undefined) ??
          (season?.air_date as string | null | undefined) ??
          null;
        if (typeof seasonNumber !== "number" || seasonNumber < 1) {
          return null;
        }
        return { seasonNumber, episodeCount: Math.max(0, episodeCount), airDate };
      })
      .filter((season): season is SeasonSummary => Boolean(season)),
  );
}

type UpNextEnrichableEntry = {
  externalSource: string | null;
  externalId: string | null;
  isCaughtUp: boolean;
  isUpcoming: boolean;
  nextSeasonNumber: number;
  nextEpisodeNumber: number;
  nextEpisodeName: string | null;
  nextEpisodeStillUrl: string | null;
  nextEpisodeOverview: string | null;
  nextEpisodeRuntime: number | null;
  nextAirDate: number | null;
  nextReleaseDate: number | null;
  nextEpisodeReleasedToday: boolean;
  sortTimestamp: number;
};

const MAX_INLINE_SEASON_FETCHES = 3;

// Fill next-episode metadata (name, still, overview, runtime, air date) from
// the season cache. At most a few stale seasons are refreshed from TMDB per
// request; everything else serves stale-if-available and heals on later calls,
// keeping the handler inside the Workers subrequest budget.
async function enrichUpNextEntriesWithSeasonMetadata(
  entries: UpNextEnrichableEntry[],
  { now, today }: { now: number; today: string },
) {
  const targets = entries.filter(
    (entry) =>
      entry.externalSource === "tmdb" &&
      typeof entry.externalId === "string" &&
      !entry.isCaughtUp &&
      entry.nextSeasonNumber >= 1 &&
      entry.nextEpisodeNumber >= 1,
  );
  if (targets.length === 0) {
    return;
  }

  const cached = await readSeasonCacheEntries(
    targets.map((entry) => ({
      externalId: entry.externalId as string,
      seasonNumber: entry.nextSeasonNumber,
    })),
  );

  const staleByKey = new Map<string, UpNextEnrichableEntry>();
  for (const entry of targets) {
    const key = seasonCacheKey(entry.externalId as string, entry.nextSeasonNumber);
    const cacheEntry = cached.get(key);
    if ((!cacheEntry || cacheEntry.expiresAt <= now) && !staleByKey.has(key)) {
      staleByKey.set(key, entry);
    }
  }
  const fetchTargets = Array.from(staleByKey.entries())
    .sort(([, left], [, right]) => right.sortTimestamp - left.sortTimestamp)
    .slice(0, MAX_INLINE_SEASON_FETCHES);
  const fetchedPayloads = await Promise.all(
    fetchTargets.map(([, entry]) =>
      fetchAndCacheSeason(entry.externalId as string, entry.nextSeasonNumber, now),
    ),
  );
  fetchTargets.forEach(([key], index) => {
    const payload = fetchedPayloads[index];
    if (payload) {
      cached.set(key, { payload, fetchedAt: now, expiresAt: now });
    }
  });

  for (const entry of targets) {
    const key = seasonCacheKey(entry.externalId as string, entry.nextSeasonNumber);
    const episode = findCachedSeasonEpisode(cached.get(key)?.payload, entry.nextEpisodeNumber);
    if (!episode) {
      continue;
    }
    entry.nextEpisodeName = episode.name ?? entry.nextEpisodeName;
    entry.nextEpisodeStillUrl = episode.stillUrl ?? entry.nextEpisodeStillUrl;
    entry.nextEpisodeOverview = episode.overview;
    entry.nextEpisodeRuntime = episode.runtime;

    // Air-date refinement only applies when release events had nothing to
    // say — they are the fresher source when present.
    if (
      !entry.nextReleaseDate &&
      !entry.nextEpisodeReleasedToday &&
      episode.airDate &&
      isDateOnlyString(episode.airDate)
    ) {
      if (episode.airDate > today) {
        entry.nextAirDate = entry.nextAirDate ?? getDateOnlyStartTimestamp(episode.airDate);
        entry.isUpcoming = true;
      } else if (episode.airDate === today) {
        entry.nextEpisodeReleasedToday = true;
      }
    }
  }
}

function isShowEnded(payload: unknown): boolean {
  const status = (payload as { status?: unknown })?.status;
  return typeof status === "string" && /^(ended|canceled|cancelled)$/i.test(status.trim());
}

// After any episode-progress change, recompute the show's watch status:
// finishing every known episode of an ended show completes it, and anything
// else (including unmarking episodes on a completed show) puts it back in
// "watching". This keeps the watching ↔ completed transition automatic in
// both directions instead of blindly forcing "watching".
async function syncWatchStateAfterEpisodeChange(
  userId: string,
  showId: string,
  updatedAt: number,
) {
  let status: "watching" | "completed" = "watching";
  try {
    const showRows = await db.select().from(shows).where(eq(shows.id, showId)).limit(1);
    const show = showRows[0];
    if (show && show.externalSource === "tmdb") {
      const [progressRows, detailRows] = await Promise.all([
        db
          .select()
          .from(episodeProgress)
          .where(and(eq(episodeProgress.userId, userId), eq(episodeProgress.showId, showId))),
        db
          .select()
          .from(tmdbDetailsCache)
          .where(
            and(
              eq(tmdbDetailsCache.externalSource, show.externalSource),
              eq(tmdbDetailsCache.externalId, show.externalId),
            ),
          )
          .limit(1),
      ]);
      const payload = detailRows[0]?.payload;
      const progressState = getEpisodeProgressState({
        watchedEpisodes: progressRows,
        seasons: readSeasonSummaries(payload),
      });
      if (progressState.isCaughtUp && isShowEnded(payload)) {
        status = "completed";
      }
    }
  } catch {
    // Status refinement is best-effort; the progress write already succeeded.
  }

  await db
    .insert(watchStates)
    .values({
      id: createId("state"),
      userId,
      showId,
      status,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [watchStates.userId, watchStates.showId],
      set: {
        status,
        updatedAt,
      },
    });
}

async function readShowSeasonSummaries(showId: string) {
  const showRows = await db.select().from(shows).where(eq(shows.id, showId)).limit(1);
  const show = showRows[0];
  if (!show || show.externalSource !== "tmdb") return null;
  const detailRows = await db
    .select()
    .from(tmdbDetailsCache)
    .where(
      and(
        eq(tmdbDetailsCache.externalSource, "tmdb"),
        eq(tmdbDetailsCache.externalId, show.externalId),
      ),
    )
    .limit(1);
  const seasons = readSeasonSummaries(detailRows[0]?.payload);
  return seasons.length > 0 ? seasons : null;
}

// A mark may only land on an episode we can prove exists: either the season
// metadata contains it, or a release event names it (covers fresh episodes
// that TMDB's cached counts lag on). Shows without metadata stay
// unrestricted. Without this, repeated marks used to walk progress into
// announced-but-empty seasons (e.g. a Severance S3 with zero episodes).
async function assertEpisodeExistsForMark(
  showId: string,
  seasonNumber: number,
  episodeNumber: number,
) {
  const seasons = await readShowSeasonSummaries(showId);
  if (!seasons) return;
  if (isEpisodeVerified({ seasonNumber, episodeNumber }, seasons)) return;
  const eventRows = await db
    .select()
    .from(releaseEvents)
    .where(
      and(
        eq(releaseEvents.showId, showId),
        eq(releaseEvents.seasonNumber, seasonNumber),
        eq(releaseEvents.episodeNumber, episodeNumber),
      ),
    )
    .limit(1);
  if (eventRows[0]) return;
  throw new ApiError(
    400,
    "episode_not_available",
    `Season ${seasonNumber} episode ${episodeNumber} isn't in this show's episode list yet`,
  );
}

async function insertEpisodeProgressOnce(args: {
  userId: string;
  showId: string;
  seasonNumber: number;
  episodeNumber: number;
  watchedAt: number;
}) {
  const rows = await db
    .insert(episodeProgress)
    .values({
      id: createId("episode"),
      userId: args.userId,
      showId: args.showId,
      seasonNumber: args.seasonNumber,
      episodeNumber: args.episodeNumber,
      watchedAt: args.watchedAt,
    })
    .onConflictDoNothing({
      target: [
        episodeProgress.userId,
        episodeProgress.showId,
        episodeProgress.seasonNumber,
        episodeProgress.episodeNumber,
      ],
    })
    .returning({ id: episodeProgress.id });

  return rows.length > 0;
}

function getProfileVisibility(user: typeof users.$inferSelect) {
  return resolveProfileVisibility(user.profileVisibility);
}

function toShowPreview(show: typeof shows.$inferSelect) {
  return {
    _id: show.id,
    title: show.title,
    posterUrl: show.posterUrl,
    year: show.year,
  };
}

async function getWatchStateShowPreviews(userId: string, status: "watching" | "watchlist") {
  const stateRows = await db
    .select()
    .from(watchStates)
    .where(and(eq(watchStates.userId, userId), eq(watchStates.status, status)))
    .orderBy(desc(watchStates.updatedAt))
    .limit(12);

  if (stateRows.length === 0) {
    return [];
  }

  const showRows = await db
    .select()
    .from(shows)
    .where(inArray(shows.id, stateRows.map((row) => row.showId)));
  const showById = new Map(showRows.map((show) => [show.id, show] as const));

  return stateRows
    .map((row) => showById.get(row.showId))
    .filter((show): show is typeof shows.$inferSelect => Boolean(show))
    .map(toShowPreview);
}

async function getUserLibraryCounts(userId: string) {
  const [watchStateRows, reviewCountRows, listCountRows] = await Promise.all([
    db
      .select({ status: watchStates.status, value: count() })
      .from(watchStates)
      .where(eq(watchStates.userId, userId))
      .groupBy(watchStates.status),
    db
      .select({ value: count() })
      .from(reviews)
      .where(eq(reviews.authorId, userId)),
    db
      .select({ value: count() })
      .from(lists)
      .where(eq(lists.ownerId, userId)),
  ]);

  const watchCounts = new Map(
    watchStateRows.map((row) => [row.status, Number(row.value ?? 0)] as const),
  );

  return {
    reviews: Number(reviewCountRows[0]?.value ?? 0),
    lists: Number(listCountRows[0]?.value ?? 0),
    watchlist: watchCounts.get("watchlist") ?? 0,
    watching: watchCounts.get("watching") ?? 0,
    completed: watchCounts.get("completed") ?? 0,
    dropped: watchCounts.get("dropped") ?? 0,
    total: watchStateRows.reduce((sum, row) => sum + Number(row.value ?? 0), 0),
  };
}

async function buildUserProfile(
  profileUser: typeof users.$inferSelect,
  viewer: typeof users.$inferSelect | null,
) {
  const viewerId = viewer?.id ?? null;
  const isOwnProfile = viewerId === profileUser.id;

  const block = await getBlockStatus(viewerId, profileUser.id);
  // Someone who blocked the viewer simply doesn't exist for them.
  if (block.hasBlockedViewer) {
    return null;
  }

  // Relationship facts come from point lookups and one aggregated join —
  // never from loading either side's full follow graph.
  const viewerFollowsAlias = alias(follows, "viewer_follows");
  const [isFollowingRows, followsViewerRows, pendingRequestRows, mutualRows, contactRows] =
    viewerId && !isOwnProfile
      ? await Promise.all([
          db
            .select({ id: follows.id })
            .from(follows)
            .where(and(eq(follows.followerId, viewerId), eq(follows.followeeId, profileUser.id)))
            .limit(1),
          db
            .select({ id: follows.id })
            .from(follows)
            .where(and(eq(follows.followerId, profileUser.id), eq(follows.followeeId, viewerId)))
            .limit(1),
          db
            .select({ id: followRequests.id })
            .from(followRequests)
            .where(
              and(
                eq(followRequests.requesterId, viewerId),
                eq(followRequests.targetId, profileUser.id),
              ),
            )
            .limit(1),
          db
            .select({ value: sql<number>`count(*)` })
            .from(follows)
            .innerJoin(
              viewerFollowsAlias,
              and(
                eq(viewerFollowsAlias.followeeId, follows.followerId),
                eq(viewerFollowsAlias.followerId, viewerId),
              ),
            )
            .where(eq(follows.followeeId, profileUser.id)),
          db
            .select({ id: contactSyncEntries.id })
            .from(contactSyncEntries)
            .where(
              and(
                eq(contactSyncEntries.ownerId, viewerId),
                eq(contactSyncEntries.matchedUserId, profileUser.id),
              ),
            )
            .limit(1),
        ])
      : [[], [], [], [], []];

  const isFollowing = isFollowingRows.length > 0;
  const profileFollowsViewer = followsViewerRows.length > 0;
  const hasPendingRequest = pendingRequestRows.length > 0;
  const mutualCount = Number(mutualRows[0]?.value ?? 0);
  const inContacts = contactRows.length > 0;

  const relationship = viewerId
    ? {
        inContacts,
        isFollowing,
        followsYou: profileFollowsViewer,
        isMutualFollow: isFollowing && profileFollowsViewer,
        mutualCount,
        hasPendingRequest,
        blockedByViewer: block.blockedByViewer,
      }
    : null;

  const viewContext = { isOwnProfile, viewerFollowsProfile: isFollowing };
  // Private accounts hide every content surface from non-followers; a block
  // by the viewer hides everything too and the client renders an unblock
  // state instead.
  const contentLocked =
    block.blockedByViewer ||
    !canViewPrivateProfileContent(profileUser.isPrivate, viewContext);

  const visibility = getProfileVisibility(profileUser);
  const permissions = contentLocked
    ? { favorites: false, currentlyWatching: false, watchlist: false }
    : {
        favorites: canViewProfileSection(visibility.favorites, viewContext),
        currentlyWatching: canViewProfileSection(visibility.currentlyWatching, viewContext),
        watchlist: canViewProfileSection(visibility.watchlist, viewContext),
      };

  if (contentLocked) {
    return {
      user: toClientUser(profileUser),
      avatarUrl: profileUser.avatarUrl ?? profileUser.image ?? null,
      memberSince: profileUser.createdAt,
      counts: {
        followers: profileUser.countsFollowers ?? 0,
        following: profileUser.countsFollowing ?? 0,
        reviews: null,
        lists: null,
        shows: null,
        completed: null,
        watching: null,
        watchlist: null,
      },
      averageRating: null,
      permissions,
      contentLocked: true,
      relationship,
      favoriteShows: [],
      favoriteGenres: [],
      currentlyWatching: [],
      watchlistPreview: [],
      topRated: [],
    };
  }

  const ratingAggRows = await db
    .select({
      average: sql<number | null>`avg(${reviews.rating})`,
      total: sql<number>`count(*)`,
    })
    .from(reviews)
    .where(eq(reviews.authorId, profileUser.id));
  const averageRating =
    Number(ratingAggRows[0]?.total ?? 0) > 0 && ratingAggRows[0]?.average != null
      ? Number(Number(ratingAggRows[0].average).toFixed(1))
      : null;

  const favoriteShowIds = permissions.favorites ? profileUser.favoriteShowIds ?? [] : [];
  const favoriteShowRows =
    favoriteShowIds.length > 0
      ? await db.select().from(shows).where(inArray(shows.id, favoriteShowIds))
      : [];
  const favoriteShowById = new Map(favoriteShowRows.map((show) => [show.id, show] as const));
  const favoriteShows = favoriteShowIds
    .map((showId) => favoriteShowById.get(showId))
    .filter((show): show is typeof shows.$inferSelect => Boolean(show))
    .map(toShowPreview);

  const topRatedRows = await db
    .select()
    .from(reviews)
    .where(eq(reviews.authorId, profileUser.id))
    .orderBy(desc(reviews.rating), desc(reviews.createdAt))
    .limit(12);
  const topRatedShowRows =
    topRatedRows.length > 0
      ? await db.select().from(shows).where(inArray(shows.id, topRatedRows.map((row) => row.showId)))
      : [];
  const topRatedShowById = new Map(topRatedShowRows.map((show) => [show.id, show] as const));

  const [currentlyWatching, watchlistPreview, libraryCounts] = await Promise.all([
    permissions.currentlyWatching ? getWatchStateShowPreviews(profileUser.id, "watching") : [],
    permissions.watchlist ? getWatchStateShowPreviews(profileUser.id, "watchlist") : [],
    getUserLibraryCounts(profileUser.id),
  ]);

  return {
    user: toClientUser(profileUser),
    avatarUrl: profileUser.avatarUrl ?? profileUser.image ?? null,
    memberSince: profileUser.createdAt,
    counts: {
      followers: profileUser.countsFollowers ?? 0,
      following: profileUser.countsFollowing ?? 0,
      reviews: libraryCounts.reviews,
      lists: libraryCounts.lists,
      shows: libraryCounts.total,
      completed: libraryCounts.completed,
      watching: permissions.currentlyWatching ? libraryCounts.watching : null,
      watchlist: permissions.watchlist ? libraryCounts.watchlist : null,
    },
    averageRating,
    permissions,
    contentLocked: false,
    relationship,
    favoriteShows,
    favoriteGenres: permissions.favorites ? profileUser.favoriteGenres ?? [] : [],
    currentlyWatching,
    watchlistPreview,
    topRated: topRatedRows
      .map((review) => {
        const show = topRatedShowById.get(review.showId);
        if (!show) {
          return null;
        }
        return {
          reviewId: review.id,
          rating: review.rating,
          showId: show.id,
          title: show.title,
          posterUrl: show.posterUrl,
        };
      })
      .filter(Boolean),
  };
}

function buildReleaseCalendarFromRows(
  rows: Array<typeof releaseEvents.$inferSelect>,
  showRows: Array<typeof shows.$inferSelect>,
  args: {
    detailRows?: Array<typeof tmdbDetailsCache.$inferSelect>;
    limit?: number;
    cursor?: string | null;
    today: string;
    view?: string;
    selectedProviders?: string[] | null;
    staleShowIds?: string[];
  },
) {
  const showMap = new Map(showRows.map((show) => [show.id, showToDoc(show)] as const));
  const detailsByExternalId = new Map(
    (args.detailRows ?? []).map((row) => [row.externalId, row.payload] as const),
  );
  const eventsByShowId = new Map<string, Array<typeof releaseEvents.$inferSelect>>();
  for (const row of rows) {
    const events = eventsByShowId.get(row.showId) ?? [];
    events.push(row);
    eventsByShowId.set(row.showId, events);
  }

  const staleShowIds = new Set(args.staleShowIds ?? []);
  const sources = showRows
    .map<ReleaseCalendarShowSource | null>((show) => {
      const doc = showMap.get(show.id);
      if (!doc) {
        return null;
      }

      return {
        _id: show.id,
        title: doc.title,
        posterUrl: doc.posterUrl ?? null,
        backdropUrl: doc.backdropUrl ?? null,
        providers:
          show.externalSource === "tmdb"
            ? extractTmdbReleaseProviders(detailsByExternalId.get(show.externalId))
            : [],
        events: (eventsByShowId.get(show.id) ?? []).map((row) => ({
          showId: row.showId,
          airDate: row.airDate,
          airDateTs: row.airDateTs,
          seasonNumber: row.seasonNumber,
          episodeNumber: row.episodeNumber,
          episodeTitle: row.episodeTitle,
          isPremiere: row.isPremiere,
          isReturningSeason: row.isReturningSeason,
          isSeasonFinale: row.isSeasonFinale,
          isSeriesFinale: row.isSeriesFinale,
        })),
        isStale: staleShowIds.has(show.id),
      };
    })
    .filter((source): source is ReleaseCalendarShowSource => Boolean(source));

  return buildReleaseCalendarData({
    shows: sources,
    today: args.today,
    view: args.view ?? "upcoming",
    selectedProviders: args.selectedProviders,
    limit: args.limit,
    cursor: args.cursor,
  });
}

function mergeUniqueShowIds(...groups: Array<string[] | null | undefined>) {
  return Array.from(
    new Set(
      groups
        .flatMap((group) => group ?? [])
        .map((showId) => showId.trim())
        .filter((showId) => showId.length > 0),
    ),
  );
}

async function getTmdbDetailRowsForShows(showRows: Array<typeof shows.$inferSelect>) {
  const tmdbExternalIds = showRows
    .filter((show) => show.externalSource === "tmdb")
    .map((show) => show.externalId);
  return tmdbExternalIds.length > 0
    ? await db
        .select()
        .from(tmdbDetailsCache)
        .where(
          and(
            eq(tmdbDetailsCache.externalSource, "tmdb"),
            inArray(tmdbDetailsCache.externalId, tmdbExternalIds),
          ),
        )
    : [];
}

function listToDoc(list: typeof lists.$inferSelect | null | undefined) {
  return toDoc(list);
}

function catalogFromTmdb(result: any) {
  return {
    externalSource: "tmdb",
    externalId: String(result.id),
    title: result.name ?? result.original_name ?? "Untitled",
    year:
      typeof result.first_air_date === "string" && result.first_air_date.length >= 4
        ? Number(result.first_air_date.slice(0, 4))
        : undefined,
    posterUrl: result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : undefined,
    backdropUrl: result.backdrop_path
      ? `https://image.tmdb.org/t/p/w1280${result.backdrop_path}`
      : undefined,
    overview: result.overview ?? undefined,
    genreIds: Array.isArray(result.genre_ids) ? result.genre_ids : undefined,
    originalLanguage: result.original_language ?? undefined,
    originCountries: Array.isArray(result.origin_country) ? result.origin_country : undefined,
    tmdbPopularity: typeof result.popularity === "number" ? result.popularity : undefined,
    tmdbVoteAverage: typeof result.vote_average === "number" ? result.vote_average : undefined,
    tmdbVoteCount: typeof result.vote_count === "number" ? result.vote_count : undefined,
  };
}

function tmdbImageUrl(path: unknown, size = "original") {
  if (typeof path !== "string" || path.length === 0) {
    return null;
  }
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

function normalizeTmdbSeasonSummary(season: any) {
  return {
    ...season,
    airDate: season.airDate ?? season.air_date ?? null,
    episodeCount: season.episodeCount ?? season.episode_count ?? 0,
    posterPath: season.posterPath ?? tmdbImageUrl(season.poster_path, "w342"),
    seasonNumber: season.seasonNumber ?? season.season_number,
  };
}

function normalizeTmdbEpisode(episode: any) {
  return {
    ...episode,
    airDate: episode.airDate ?? episode.air_date ?? null,
    episodeNumber: episode.episodeNumber ?? episode.episode_number,
    seasonNumber: episode.seasonNumber ?? episode.season_number,
    stillPath: episode.stillPath ?? tmdbImageUrl(episode.still_path, "w780"),
    voteAverage: episode.voteAverage ?? episode.vote_average ?? 0,
    voteCount: episode.voteCount ?? episode.vote_count ?? 0,
  };
}

function normalizeTmdbShowDetails(payload: any) {
  if (!payload) {
    return payload;
  }
  const seasons = Array.isArray(payload.seasons)
    ? payload.seasons.map(normalizeTmdbSeasonSummary)
    : [];
  const regularSeasons = seasons.filter((season: any) => season.seasonNumber > 0);

  return {
    ...payload,
    backdropPath: tmdbImageUrl(payload.backdrop_path, "w1280") ?? payload.backdropPath,
    episodeRunTime:
      payload.episodeRunTime ??
      (Array.isArray(payload.episode_run_time) ? payload.episode_run_time[0] : undefined),
    numberOfEpisodes:
      payload.numberOfEpisodes ??
      payload.number_of_episodes ??
      regularSeasons.reduce(
        (total: number, season: any) => total + (season.episodeCount ?? season.episode_count ?? 0),
        0,
      ),
    numberOfSeasons:
      payload.numberOfSeasons ??
      payload.number_of_seasons ??
      regularSeasons.length,
    posterPath: payload.posterPath ?? tmdbImageUrl(payload.poster_path, "w500"),
    seasons,
  };
}

function normalizeTmdbSeasonDetails(payload: any) {
  if (!payload) {
    return payload;
  }

  return {
    ...payload,
    airDate: payload.airDate ?? payload.air_date ?? null,
    posterPath: payload.posterPath ?? tmdbImageUrl(payload.poster_path, "w342"),
    seasonNumber: payload.seasonNumber ?? payload.season_number,
    episodes: Array.isArray(payload.episodes)
      ? payload.episodes.map(normalizeTmdbEpisode)
      : [],
  };
}

async function showDocWithCachedArtwork(show: typeof shows.$inferSelect | null | undefined) {
  const doc = showToDoc(show);
  if (!doc || show?.externalSource !== "tmdb") {
    return doc;
  }

  const cached = await db
    .select()
    .from(tmdbDetailsCache)
    .where(
      and(
        eq(tmdbDetailsCache.externalSource, show.externalSource),
        eq(tmdbDetailsCache.externalId, show.externalId),
      ),
    )
    .limit(1);
  const details = normalizeTmdbShowDetails(cached[0]?.payload);
  const hasUsableStoredBackdrop =
    typeof doc?.backdropUrl === "string" && !doc.backdropUrl.includes("/original/");
  const cachedBackdropUrl = details?.backdropPath ?? null;
  const storedBackdropUrl =
    typeof doc.backdropUrl === "string" && doc.backdropUrl.includes("/original/")
      ? null
      : doc.backdropUrl;
  return {
    ...doc,
    backdropUrl: hasUsableStoredBackdrop ? doc.backdropUrl : storedBackdropUrl ?? cachedBackdropUrl,
    posterUrl: doc.posterUrl ?? details?.posterPath ?? null,
    extendedDetails: details ?? null,
  };
}

async function tmdb(path: string, params: Record<string, string | number | undefined> = {}) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new ApiError(500, "tmdb_unconfigured", "TMDB_API_KEY is not configured");
  }
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", "en-US");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new ApiError(response.status, "tmdb_error", `TMDB request failed with ${response.status}`);
  }
  return await response.json();
}

function readImdbIdFromDetailsPayload(payload: unknown): string | null {
  const raw = payload as { external_ids?: { imdb_id?: unknown } } | null;
  const imdbId = raw?.external_ids?.imdb_id;
  return typeof imdbId === "string" && imdbId.startsWith("tt") ? imdbId : null;
}

// Resolve a show's IMDb id, persisting it on the shows row. An empty string
// records "TMDB has no mapping" so unrated shows don't refetch every call;
// transient TMDB failures leave the column null so a later call retries.
async function ensureShowImdbId(show: typeof shows.$inferSelect): Promise<string | null> {
  if (typeof show.imdbId === "string") {
    return show.imdbId.startsWith("tt") ? show.imdbId : null;
  }
  if (show.externalSource !== "tmdb") {
    return null;
  }
  const cached = await db
    .select()
    .from(tmdbDetailsCache)
    .where(
      and(
        eq(tmdbDetailsCache.externalSource, show.externalSource),
        eq(tmdbDetailsCache.externalId, show.externalId),
      ),
    )
    .limit(1);
  let imdbId = readImdbIdFromDetailsPayload(cached[0]?.payload);
  if (!imdbId) {
    try {
      const payload = (await tmdb(`/tv/${show.externalId}/external_ids`)) as {
        imdb_id?: unknown;
      };
      imdbId =
        typeof payload?.imdb_id === "string" && payload.imdb_id.startsWith("tt")
          ? payload.imdb_id
          : null;
    } catch {
      return null;
    }
  }
  await db
    .update(shows)
    .set({ imdbId: imdbId ?? "", updatedAt: Date.now() })
    .where(eq(shows.id, show.id));
  return imdbId;
}

const providerIds: Record<string, number | string> = {
  netflix: 8,
  apple_tv: 350,
  max: 1899,
  disney_plus: 337,
  hulu: 15,
  peacock: "386|387",
  prime_video: 9,
  paramount_plus: "2303|2616",
  mgm_plus: "34|583|636",
};

const genreCategoryIds: Record<string, number> = {
  genre_animation: 16,
  genre_comedy: 35,
  genre_crime: 80,
  genre_drama: 18,
  genre_sci_fi: 10765,
};

const noisyTvGenreIds = "10763,10764,10767";
const editorialSeedGroupsByTmdbCategory: Record<string, HomeEditorialSeedGroup | undefined> = {
  fresh_premieres: "newOrBack",
  breakout_premieres: "newOrBack",
  critics_choice: "quality",
  quick_picks: "quick",
};

async function searchCatalog(text: string, limit: number) {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  const cacheKey = normalized.toLowerCase();
  const cached = await db.select().from(tmdbSearchCache).where(eq(tmdbSearchCache.query, cacheKey)).limit(1);
  if (cached[0] && cached[0].expiresAt > Date.now()) {
    return (cached[0].results as any[]).slice(0, limit);
  }

  const payload = await tmdb("/search/tv", { query: normalized, page: 1 });
  const results = (payload.results ?? []).map(catalogFromTmdb).slice(0, limit);
  const now = Date.now();
  const expiresAt = now + 24 * 60 * 60 * 1000;
  if (cached[0]) {
    await db.update(tmdbSearchCache).set({ results, fetchedAt: now, expiresAt }).where(eq(tmdbSearchCache.id, cached[0].id));
  } else {
    await db.insert(tmdbSearchCache).values({ id: createId("tmdbsearch"), query: cacheKey, results, fetchedAt: now, expiresAt });
  }
  return results;
}

type HomeCatalogStaleFallbackHandler = (args: {
  category: string;
  limit: number;
  page: number;
}) => void;

async function getTmdbList(
  category: string,
  limit: number,
  page: number,
  onStaleFallback?: HomeCatalogStaleFallbackHandler,
) {
  const cacheKey = `v6:${category}:${page}:${limit}`;
  const cached = await db.select().from(tmdbListCache).where(eq(tmdbListCache.category, cacheKey)).limit(1);
  if (cached[0] && isHomeCatalogCacheFresh(cached[0].expiresAt)) {
    return cached[0].results as any[];
  }

  let payload: any;
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const twoWeeksDate = new Date(today);
  twoWeeksDate.setDate(today.getDate() - 14);
  const twoWeeksIso = twoWeeksDate.toISOString().slice(0, 10);
  const recentDate = new Date(today);
  recentDate.setDate(today.getDate() - 90);
  const recentIso = recentDate.toISOString().slice(0, 10);
  const oneYearDate = new Date(today);
  oneYearDate.setDate(today.getDate() - 365);
  const oneYearIso = oneYearDate.toISOString().slice(0, 10);
  const fiveYearStartIso = `${today.getUTCFullYear() - 5}-01-01`;
  const recentYearStartIso = `${today.getUTCFullYear() - 2}-01-01`;

  try {
    if (category === "trending_day") {
      payload = await tmdb("/trending/tv/day", { page });
    } else if (category === "trending_week") {
      payload = await tmdb("/trending/tv/week", { page });
    } else if (category === "rising_now") {
      payload = await tmdb("/discover/tv", {
        page,
        "air_date.gte": twoWeeksIso,
        "air_date.lte": todayIso,
        "vote_count.gte": 25,
        "vote_average.gte": 7,
        sort_by: "popularity.desc",
        timezone: "America/Los_Angeles",
        without_genres: noisyTvGenreIds,
      });
    } else if (category === "airing_today") {
      payload = await tmdb("/tv/airing_today", { page });
    } else if (category === "on_the_air") {
      payload = await tmdb("/tv/on_the_air", { page });
    } else if (category === "fresh_premieres" || category === "breakout_premieres") {
      payload = await tmdb("/discover/tv", {
        page,
        "first_air_date.gte": recentIso,
        "first_air_date.lte": todayIso,
        "vote_count.gte": category === "breakout_premieres" ? 25 : 15,
        "vote_average.gte": category === "breakout_premieres" ? 7 : undefined,
        sort_by: "popularity.desc",
        without_genres: noisyTvGenreIds,
      });
    } else if (category === "top_rated" || category === "critics_choice") {
      payload = await tmdb("/discover/tv", {
        page,
        "first_air_date.gte": category === "critics_choice" ? recentYearStartIso : undefined,
        "vote_count.gte": category === "critics_choice" ? 100 : 350,
        "vote_average.gte": category === "critics_choice" ? 7.6 : 7.5,
        sort_by: category === "critics_choice" ? "popularity.desc" : "vote_average.desc",
        without_genres: noisyTvGenreIds,
      });
    } else if (category === "quick_picks") {
      payload = await tmdb("/discover/tv", {
        page,
        "first_air_date.gte": fiveYearStartIso,
        "vote_count.gte": 50,
        "vote_average.gte": 7.1,
        sort_by: "popularity.desc",
        "with_runtime.lte": 42,
        without_genres: noisyTvGenreIds,
      });
    } else if (category === "hidden_gems") {
      payload = await tmdb("/discover/tv", {
        page,
        "vote_count.gte": 40,
        "vote_count.lte": 800,
        "vote_average.gte": 7.4,
        sort_by: "vote_average.desc",
        without_genres: noisyTvGenreIds,
      });
    } else if (genreCategoryIds[category]) {
      payload = await tmdb("/discover/tv", {
        page,
        with_genres: genreCategoryIds[category],
        "vote_count.gte": 40,
        sort_by: "popularity.desc",
        without_genres: noisyTvGenreIds,
      });
    } else if (providerIds[category]) {
      payload = await tmdb("/discover/tv", {
        page,
        watch_region: "US",
        with_watch_providers: providerIds[category],
        with_watch_monetization_types: "flatrate",
        "air_date.gte": oneYearIso,
        "vote_count.gte": 20,
        sort_by: "popularity.desc",
        without_genres: noisyTvGenreIds,
      });
    } else {
      payload = await tmdb("/trending/tv/week", { page });
    }
  } catch (error) {
    if (cached[0] && isHomeCatalogCacheUsableAfterError(cached[0].expiresAt)) {
      console.warn("[home-catalog] Serving stale TMDB list cache after refresh failure.", {
        category,
        limit,
        page,
        error: error instanceof Error ? error.message : String(error),
      });
      onStaleFallback?.({ category, limit, page });
      return cached[0].results as any[];
    }
    throw error;
  }
  const editorialSeedGroup = editorialSeedGroupsByTmdbCategory[category];
  const editorialSeeds = editorialSeedGroup
    ? getHomeEditorialSeedItems(editorialSeedGroup)
    : [];
  const providerEditorialSeeds = providerIds[category]
    ? getHomeEditorialProviderSeedItems(category as HomeEditorialProviderKey)
    : [];
  const results = rankHomeShows(
    [
      ...editorialSeeds,
      ...providerEditorialSeeds,
      ...(payload.results ?? []).map(catalogFromTmdb),
    ]
      .filter((item) => item.title && item.posterUrl)
      .slice(0, Math.max(limit * 2, limit)),
    {
      diversityStrength: category === "hidden_gems" ? 0.24 : 0.16,
      preferFresh:
        category === "quick_picks" ||
        category === "rising_now" ||
        category === "breakout_premieres" ||
        Boolean(providerIds[category]),
    },
  ).slice(0, limit);
  try {
    await upsertShowsFromCatalogBatch(results);
  } catch (error) {
    console.warn("[home-catalog] Failed to upsert catalog shows.", {
      category,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const now = Date.now();
  const expiresAt = now + 6 * 60 * 60 * 1000;
  if (cached[0]) {
    await db.update(tmdbListCache).set({ results, fetchedAt: now, expiresAt }).where(eq(tmdbListCache.id, cached[0].id));
  } else {
    await db.insert(tmdbListCache).values({ id: createId("tmdblist"), category: cacheKey, results, fetchedAt: now, expiresAt });
  }
  return results;
}

const homeCatalogProviderCategories = [
  "netflix",
  "apple_tv",
  "max",
  "disney_plus",
  "hulu",
  "peacock",
  "prime_video",
  "paramount_plus",
  "mgm_plus",
] as const;
const homeCatalogProviderListLimit = 18;

type HomeCatalogListResult = {
  category: string;
  failed: boolean;
  stale: boolean;
  items: Awaited<ReturnType<typeof getTmdbList>>;
};

async function loadHomeCatalogList(
  category: string,
  limit: number,
): Promise<HomeCatalogListResult> {
  let stale = false;
  try {
    const items = await getTmdbList(category, limit, 1, () => {
      stale = true;
    });
    return {
      category,
      failed: false,
      stale,
      items,
    };
  } catch (error) {
    console.warn("[home-catalog] Failed to load homepage catalog list.", {
      category,
      limit,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      category,
      failed: true,
      stale: false,
      items: [],
    };
  }
}

async function getHomeCatalog() {
  const providerPromises = homeCatalogProviderCategories.map((category) =>
    loadHomeCatalogList(category, homeCatalogProviderListLimit),
  );
  const [
    risingNowResult,
    breakoutPremieresResult,
    criticsChoiceResult,
    quickPicksResult,
    airingTodayResult,
    trendingDayResult,
    trendingWeekResult,
    ...providerResults
  ] = await Promise.all([
    loadHomeCatalogList("rising_now", 16),
    loadHomeCatalogList("breakout_premieres", 16),
    loadHomeCatalogList("critics_choice", 16),
    loadHomeCatalogList("quick_picks", 16),
    loadHomeCatalogList("airing_today", 10),
    loadHomeCatalogList("trending_day", 20),
    loadHomeCatalogList("trending_week", 10),
    ...providerPromises,
  ]);
  const results = [
    risingNowResult,
    breakoutPremieresResult,
    criticsChoiceResult,
    quickPicksResult,
    airingTodayResult,
    trendingDayResult,
    trendingWeekResult,
    ...providerResults,
  ];
  const failedCategories = results
    .filter((result) => result.failed)
    .map((result) => result.category);
  const staleCategories = results
    .filter((result) => result.stale)
    .map((result) => result.category);

  return {
    risingNow: risingNowResult.items,
    breakoutPremieres: breakoutPremieresResult.items,
    criticsChoice: criticsChoiceResult.items,
    quickPicks: quickPicksResult.items,
    airingToday: airingTodayResult.items,
    trendingDay: trendingDayResult.items,
    trendingWeek: trendingWeekResult.items,
    providers: Object.fromEntries(
      homeCatalogProviderCategories.map((category, index) => [
        category,
        providerResults[index]?.items ?? [],
      ]),
    ),
    ...(failedCategories.length > 0 || staleCategories.length > 0
      ? { diagnostics: { failedCategories, staleCategories } }
      : {}),
  };
}

const homeCatalogCategoryPlan: Array<{ category: string; limit: number }> = [
  { category: "rising_now", limit: 16 },
  { category: "breakout_premieres", limit: 16 },
  { category: "critics_choice", limit: 16 },
  { category: "quick_picks", limit: 16 },
  { category: "airing_today", limit: 10 },
  { category: "trending_day", limit: 20 },
  { category: "trending_week", limit: 10 },
  ...homeCatalogProviderCategories.map((category) => ({
    category,
    limit: homeCatalogProviderListLimit,
  })),
];

// Refresh the stalest home catalog categories, a few per invocation, so the
// scheduled Worker stays inside per-invocation subrequest budgets while the
// full 16-category surface converges to fresh within an hour.
export async function refreshStaleHomeCatalogCategories(maxCategories = 4) {
  const keyFor = (item: { category: string; limit: number }) =>
    `v6:${item.category}:1:${item.limit}`;
  const cacheKeys = homeCatalogCategoryPlan.map(keyFor);
  const rows = await db
    .select({ category: tmdbListCache.category, expiresAt: tmdbListCache.expiresAt })
    .from(tmdbListCache)
    .where(inArray(tmdbListCache.category, cacheKeys));
  const expiresByKey = new Map(rows.map((row) => [row.category, row.expiresAt] as const));

  const now = Date.now();
  const staleEntries = homeCatalogCategoryPlan
    .map((item) => ({ ...item, expiresAt: expiresByKey.get(keyFor(item)) ?? 0 }))
    .filter((item) => !isHomeCatalogCacheFresh(item.expiresAt, now))
    .sort((left, right) => left.expiresAt - right.expiresAt)
    .slice(0, maxCategories);

  const results: HomeCatalogListResult[] = [];
  for (const entry of staleEntries) {
    results.push(await loadHomeCatalogList(entry.category, entry.limit));
  }

  return {
    checkedCategories: homeCatalogCategoryPlan.length,
    staleCategories: staleEntries.map((entry) => entry.category),
    refreshedCategories: results
      .filter((result) => !result.failed && !result.stale)
      .map((result) => result.category),
    failedCategories: results.filter((result) => result.failed).map((result) => result.category),
  };
}

async function getShowsWithCachedArtworkById(showIds: string[]) {
  if (!showIds.length) {
    return new Map<string, any>();
  }
  const rows = await db.select().from(shows).where(inArray(shows.id, showIds));
  const docs = await Promise.all(
    rows.map(async (show) => [show.id, await showDocWithCachedArtwork(show)] as const),
  );
  return new Map(docs);
}

function isCurrentHomeCandidate(show: { year?: number | null; updatedAt?: number | null } | null | undefined) {
  if (!show) return false;
  const currentYear = new Date().getUTCFullYear();
  if (typeof show.year === "number") {
    return show.year >= currentYear - 7;
  }
  if (typeof show.updatedAt === "number") {
    return Date.now() - show.updatedAt <= 180 * 24 * 60 * 60 * 1000;
  }
  return false;
}

async function buildHomeTasteProfile(userId: string | null | undefined) {
  if (!userId) {
    return { genreWeights: {}, seenKeys: new Set<string>(), seedKeys: new Set<string>() };
  }

  const since = Date.now() - 180 * 24 * 60 * 60 * 1000;
  const [states, logs, reviewRows, prefs] = await Promise.all([
    db.select().from(watchStates).where(eq(watchStates.userId, userId)),
    db.select().from(watchLogs).where(and(eq(watchLogs.userId, userId), gte(watchLogs.watchedAt, since))),
    db.select().from(reviews).where(eq(reviews.authorId, userId)),
    db.select().from(userTastePreferences).where(eq(userTastePreferences.userId, userId)).limit(1),
  ]);

  const signalIds = Array.from(
    new Set([
      ...states.map((row) => row.showId),
      ...logs.map((row) => row.showId),
      ...reviewRows.map((row) => row.showId),
      ...(prefs[0]?.favoriteShowIds ?? []),
    ]),
  );
  const signalShows = signalIds.length
    ? await db.select().from(shows).where(inArray(shows.id, signalIds))
    : [];
  const showById = new Map(signalShows.map((show) => [show.id, show]));
  const genreWeights: Record<string, number> = {};
  const seenKeys = new Set<string>();
  const seedKeys = new Set<string>();

  const addGenres = (showId: string, weight: number, markSeed = false) => {
    const show = showById.get(showId);
    if (!show) return;
    const key = getHomeShowKey(showToDoc(show));
    if (key) seenKeys.add(key);
    if (markSeed && key) seedKeys.add(key);
    (show.genreIds ?? []).forEach((genreId) => {
      const genreKey = String(genreId);
      genreWeights[genreKey] = (genreWeights[genreKey] ?? 0) + weight;
    });
  };

  states.forEach((row) => {
    addGenres(row.showId, row.status === "completed" ? 0.9 : 0.55, row.status === "watchlist");
  });
  logs.forEach((row) => addGenres(row.showId, 0.7));
  reviewRows.forEach((row) => addGenres(row.showId, Math.max(0.25, row.rating / 5)));
  (prefs[0]?.favoriteShowIds ?? []).forEach((showId) => addGenres(showId, 1.4, true));

  const maxWeight = Math.max(1, ...Object.values(genreWeights));
  Object.keys(genreWeights).forEach((genreId) => {
    genreWeights[genreId] = Number((genreWeights[genreId] / maxWeight).toFixed(4));
  });

  return { genreWeights, seenKeys, seedKeys };
}

function buildShowUpsertPayload(item: any, existing: typeof shows.$inferSelect | undefined, now: number) {
  return {
    externalSource: item.externalSource ?? "tmdb",
    externalId: String(item.externalId),
    title: item.title ?? "Untitled",
    originalTitle: item.originalTitle ?? item.title ?? null,
    year: item.year ?? null,
    overview: item.overview ?? null,
    posterUrl: item.posterUrl ?? existing?.posterUrl ?? null,
    backdropUrl: item.backdropUrl ?? existing?.backdropUrl ?? null,
    genreIds: item.genreIds ?? existing?.genreIds ?? null,
    originalLanguage: item.originalLanguage ?? existing?.originalLanguage ?? null,
    originCountries: item.originCountries ?? existing?.originCountries ?? null,
    tmdbPopularity: item.tmdbPopularity ?? existing?.tmdbPopularity ?? null,
    tmdbVoteAverage: item.tmdbVoteAverage ?? existing?.tmdbVoteAverage ?? null,
    tmdbVoteCount: item.tmdbVoteCount ?? existing?.tmdbVoteCount ?? null,
    searchText: normalizeSearchText(`${item.title ?? ""} ${item.overview ?? ""}`),
    updatedAt: now,
  };
}

// Batched variant of upsertShowFromCatalog: one existence check plus chunked
// multi-row upserts instead of ~3 queries per show. Keeps catalog refreshes
// inside D1/Workers subrequest budgets.
async function upsertShowsFromCatalogBatch(items: any[]) {
  const candidates = items.filter((item) => item?.externalId !== undefined && item?.externalId !== null);
  if (candidates.length === 0) {
    return;
  }

  const sources = Array.from(new Set(candidates.map((item) => item.externalSource ?? "tmdb")));
  const existingRows = (
    await Promise.all(
      sources.flatMap((source) => {
        const ids = Array.from(
          new Set(
            candidates
              .filter((item) => (item.externalSource ?? "tmdb") === source)
              .map((item) => String(item.externalId)),
          ),
        );
        return chunkForSqlParams(ids, 1).map((chunk) =>
          db
            .select()
            .from(shows)
            .where(and(eq(shows.externalSource, source), inArray(shows.externalId, chunk))),
        );
      }),
    )
  ).flat();
  const existingByKey = new Map<string, typeof shows.$inferSelect>(
    existingRows.map((row) => [`${row.externalSource}|${row.externalId}`, row]),
  );

  const now = Date.now();
  const seen = new Set<string>();
  const rows: Array<typeof shows.$inferInsert> = [];
  for (const item of candidates) {
    const source = item.externalSource ?? "tmdb";
    const key = `${source}|${String(item.externalId)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const existing = existingByKey.get(key);
    rows.push({
      id: existing?.id ?? createId("show"),
      ...buildShowUpsertPayload(item, existing, now),
      createdAt: existing?.createdAt ?? now,
    });
  }

  for (const chunk of chunkForSqlParams(rows, 18)) {
    await db
      .insert(shows)
      .values(chunk)
      .onConflictDoUpdate({
        target: [shows.externalSource, shows.externalId],
        set: {
          title: sql`excluded.title`,
          originalTitle: sql`excluded.original_title`,
          year: sql`excluded.year`,
          overview: sql`excluded.overview`,
          posterUrl: sql`excluded.poster_url`,
          backdropUrl: sql`excluded.backdrop_url`,
          genreIds: sql`excluded.genre_ids`,
          originalLanguage: sql`excluded.original_language`,
          originCountries: sql`excluded.origin_countries`,
          tmdbPopularity: sql`excluded.tmdb_popularity`,
          tmdbVoteAverage: sql`excluded.tmdb_vote_average`,
          tmdbVoteCount: sql`excluded.tmdb_vote_count`,
          searchText: sql`excluded.search_text`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }
}

async function upsertShowFromCatalog(item: any) {
  const externalSource = item.externalSource ?? "tmdb";
  const externalId = String(item.externalId);
  const existing = await db
    .select()
    .from(shows)
    .where(and(eq(shows.externalSource, externalSource), eq(shows.externalId, externalId)))
    .limit(1);
  const now = Date.now();
  const payload = buildShowUpsertPayload(item, existing[0], now);
  if (existing[0]) {
    await db.update(shows).set(payload).where(eq(shows.id, existing[0].id));
    const rows = await db.select().from(shows).where(eq(shows.id, existing[0].id)).limit(1);
    return showToDoc(rows[0]);
  }
  const id = createId("show");
  await db.insert(shows).values({ id, ...payload, createdAt: now });
  const rows = await db.select().from(shows).where(eq(shows.id, id)).limit(1);
  return showToDoc(rows[0]);
}

async function ensureUniqueUsername(username: string, currentUserId: string) {
  const rows = await db.select().from(users).where(eq(users.username, username)).limit(1);
  const existing = rows[0];
  if (existing && existing.id !== currentUserId) {
    throw new ApiError(409, "username_taken", "Username already taken");
  }
}

async function buildExportData(userId: string) {
  const [userRows, followRows, reviewRows, logRows, listRows, likeRows, commentRows, contactRows] =
    await Promise.all([
      db.select().from(users).where(eq(users.id, userId)).limit(1),
      db.select().from(follows).where(eq(follows.followerId, userId)),
      db.select().from(reviews).where(eq(reviews.authorId, userId)),
      db.select().from(watchLogs).where(eq(watchLogs.userId, userId)),
      db.select().from(lists).where(eq(lists.ownerId, userId)),
      db.select().from(likes).where(eq(likes.userId, userId)),
      db.select().from(comments).where(eq(comments.authorId, userId)),
      db.select().from(contactSyncEntries).where(eq(contactSyncEntries.ownerId, userId)),
    ]);

  const listIds = listRows.map((item) => item.id);
  const listItemRows =
    listIds.length > 0
      ? await db.select().from(listItems).where(inArray(listItems.listId, listIds))
      : [];

  return {
    user: userRows[0] ? toClientUser(userRows[0]) : null,
    follows: followRows,
    reviews: reviewRows,
    logs: logRows,
    lists: listRows,
    listItems: listItemRows,
    likes: likeRows,
    comments: commentRows,
    contacts: contactRows,
    exportLimit: 1000,
    truncated: {
      follows: false,
      reviews: false,
      logs: false,
      lists: false,
      likes: false,
      comments: false,
      contacts: false,
      listItems: [],
    },
  };
}

async function getContactStatus(userId: string) {
  const entries = await db
    .select()
    .from(contactSyncEntries)
    .where(eq(contactSyncEntries.ownerId, userId))
    .orderBy(desc(contactSyncEntries.updatedAt));

  return {
    hasSynced: entries.length > 0,
    totalCount: entries.length,
    matchedCount: entries.filter((entry) => entry.matchedUserId).length,
    inviteCount: entries.filter((entry) => isContactInviteReady(entry)).length,
    invitedCount: entries.filter((entry) => entry.invitedAt).length,
    lastSyncedAt:
      entries.length > 0
        ? entries.reduce((latest, entry) => Math.max(latest, entry.updatedAt), 0)
        : null,
  };
}

async function setContactSnapshot(
  userId: string,
  entries: Array<{
    sourceRecordId?: string;
    displayName: string;
    contactHash: string;
    matchedUserId?: string;
  }>,
) {
  const previousEntries = await db
    .select()
    .from(contactSyncEntries)
    .where(eq(contactSyncEntries.ownerId, userId));
  const previousByHash = new Map(
    previousEntries.map((entry) => [entry.contactHash, entry]),
  );

  await db.delete(contactSyncEntries).where(eq(contactSyncEntries.ownerId, userId));
  if (entries.length === 0) {
    return { inviteReadyCount: 0, invitedCount: 0 };
  }

  const now = Date.now();
  const rows = entries.map((entry) => {
    const previous = previousByHash.get(entry.contactHash);
    return {
      id: createId("contact"),
      ownerId: userId,
      sourceRecordId: entry.sourceRecordId ?? null,
      displayName: entry.displayName,
      contactHash: entry.contactHash,
      matchedUserId: entry.matchedUserId ?? null,
      invitedAt: previous?.invitedAt ?? null,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
  });
  for (const chunk of chunkForSqlParams(rows, 9)) {
    await db.insert(contactSyncEntries).values(chunk);
  }

  return {
    inviteReadyCount: rows.filter((entry) => isContactInviteReady(entry, now)).length,
    invitedCount: rows.filter((entry) => entry.invitedAt).length,
  };
}

async function getSuggestedUsers(userId: string, limit: number) {
  const followRows = await db.select().from(follows).where(eq(follows.followerId, userId));
  const excludedIds = new Set(followRows.map((follow) => follow.followeeId));
  excludedIds.add(userId);

  const candidates = await db
    .select()
    .from(users)
    .orderBy(desc(users.lastSeenAt), desc(users.createdAt))
    .limit(limit * 10);
  const suggestionUsers = candidates.filter(
    (candidate) => !excludedIds.has(candidate.id) && Boolean(candidate.username),
  );

  const contactEntries = await db
    .select({ matchedUserId: contactSyncEntries.matchedUserId })
    .from(contactSyncEntries)
    .where(
      and(
        eq(contactSyncEntries.ownerId, userId),
        isNotNull(contactSyncEntries.matchedUserId),
      ),
    )
    .orderBy(desc(contactSyncEntries.updatedAt))
    .limit(60);
  const contactUserIds = Array.from(
    new Set(contactEntries.flatMap((entry) => (entry.matchedUserId ? [entry.matchedUserId] : []))),
  );
  const contactUsers = contactUserIds.length > 0 ? await getUsersByIdsChunked(contactUserIds) : [];

  const previews = await buildPersonPreviews(userId, [
    ...contactUsers.filter((candidate) => Boolean(candidate.username)),
    ...suggestionUsers,
  ]);

  return previews
    .filter((candidate) => !candidate.isFollowing)
    .sort((left, right) => {
      const score = (candidate: any) => {
        const profileCompleteness =
          Number(Boolean(candidate.user?.displayName ?? candidate.user?.name)) +
          Number(Boolean(candidate.user?.avatarUrl ?? candidate.avatarUrl)) +
          Number(Boolean(candidate.user?.bio));
        const lastSeenAt = Number(candidate.user?.lastSeenAt ?? candidate.user?._creationTime ?? 0);
        const freshness = Math.max(0, 1 - (Date.now() - lastSeenAt) / (30 * 24 * 60 * 60 * 1000));
        return (
          Number(Boolean(candidate.inContacts)) * 1000 +
          (candidate.mutualCount ?? 0) * 140 +
          Number(Boolean(candidate.followsYou)) * 90 +
          (candidate.sharedShowCount ?? 0) * 55 +
          profileCompleteness * 12 +
          freshness
        );
      };
      const delta = score(right) - score(left);
      if (delta !== 0) {
        return delta;
      }
      return (right.user?.lastSeenAt ?? 0) - (left.user?.lastSeenAt ?? 0);
    })
    .slice(0, limit);
}

function normalizedTasteLabel(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function countOverlap(left: Set<string>, right: Set<string>) {
  let total = 0;
  for (const value of left) {
    if (right.has(value)) {
      total += 1;
    }
  }
  return total;
}

async function getSimilarTasteUserPreviews(userId: string, limit: number) {
  const [viewerRows, viewerWatchRows, followRows] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(watchStates).where(eq(watchStates.userId, userId)),
    db.select().from(follows).where(eq(follows.followerId, userId)),
  ]);
  const viewer = viewerRows[0];
  if (!viewer) {
    return [];
  }

  const viewerShowIds = new Set([
    ...(viewer.favoriteShowIds ?? []),
    ...viewerWatchRows.map((row) => row.showId),
  ]);
  const viewerGenreLabels = new Set(
    (viewer.favoriteGenres ?? []).map(normalizedTasteLabel).filter(Boolean),
  );
  if (viewerShowIds.size === 0 && viewerGenreLabels.size < 2) {
    return [];
  }

  const excludedIds = new Set(followRows.map((follow) => follow.followeeId));
  excludedIds.add(userId);

  const candidateRows = (
    await db
      .select()
      .from(users)
      .orderBy(desc(users.lastSeenAt), desc(users.createdAt))
      .limit(Math.max(limit * 20, 120))
  ).filter((candidate) => !excludedIds.has(candidate.id) && Boolean(candidate.username));

  if (candidateRows.length === 0) {
    return [];
  }

  const candidateIds = candidateRows.map((candidate) => candidate.id);
  const candidateWatchRows: Array<typeof watchStates.$inferSelect> = [];
  for (const chunk of chunkForSqlParams(candidateIds, 1, 80)) {
    candidateWatchRows.push(
      ...(await db.select().from(watchStates).where(inArray(watchStates.userId, chunk))),
    );
  }
  const watchedShowIdsByUser = new Map<string, Set<string>>();
  for (const row of candidateWatchRows) {
    const showIds = watchedShowIdsByUser.get(row.userId) ?? new Set<string>();
    showIds.add(row.showId);
    watchedShowIdsByUser.set(row.userId, showIds);
  }

  const now = Date.now();
  const scored = candidateRows
    .map((candidate) => {
      const candidateShowIds = new Set([
        ...(candidate.favoriteShowIds ?? []),
        ...(watchedShowIdsByUser.get(candidate.id) ?? []),
      ]);
      const candidateGenreLabels = new Set(
        (candidate.favoriteGenres ?? []).map(normalizedTasteLabel).filter(Boolean),
      );
      const sharedShowCount = countOverlap(viewerShowIds, candidateShowIds);
      const sharedGenreCount = countOverlap(viewerGenreLabels, candidateGenreLabels);
      const profileCompleteness =
        Number(Boolean(candidate.displayName ?? candidate.name)) +
        Number(Boolean(candidate.avatarUrl ?? candidate.image)) +
        Number(Boolean(candidate.bio));
      const libraryDepth =
        (candidate.countsTotalShows ?? 0) +
        (candidate.countsReviews ?? 0) * 2 +
        (candidate.countsLists ?? 0) * 2;
      const lastSeenAt = Number(candidate.lastSeenAt ?? candidate.createdAt ?? 0);
      const freshness = Math.max(0, 1 - (now - lastSeenAt) / (60 * 24 * 60 * 60 * 1000));
      return {
        candidate,
        sharedShowCount,
        sharedGenreCount,
        score:
          sharedShowCount * 160 +
          sharedGenreCount * 42 +
          Math.min(libraryDepth, 60) +
          profileCompleteness * 8 +
          freshness,
      };
    })
    .filter((item) => item.sharedShowCount > 0 || item.sharedGenreCount >= 2)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.sharedShowCount - left.sharedShowCount ||
        right.sharedGenreCount - left.sharedGenreCount,
    )
    .slice(0, Math.max(limit * 2, limit));

  if (scored.length === 0) {
    return [];
  }

  const scoreByUserId = new Map(scored.map((item) => [item.candidate.id, item] as const));
  const previews = await buildPersonPreviews(
    userId,
    scored.map((item) => item.candidate),
  );

  return previews
    .map((preview) => {
      const score = scoreByUserId.get(preview.user._id);
      return {
        ...preview,
        sharedShowCount: Math.max(preview.sharedShowCount ?? 0, score?.sharedShowCount ?? 0),
        sharedGenreCount: score?.sharedGenreCount ?? 0,
      };
    })
    .filter(
      (candidate) =>
        !candidate.isFollowing &&
        ((candidate.sharedShowCount ?? 0) > 0 || (candidate.sharedGenreCount ?? 0) >= 2),
    )
    .slice(0, limit);
}

async function getContactMatches(userId: string, limit: number) {
  const entries = await db
    .select({ matchedUserId: contactSyncEntries.matchedUserId })
    .from(contactSyncEntries)
    .where(
      and(
        eq(contactSyncEntries.ownerId, userId),
        isNotNull(contactSyncEntries.matchedUserId),
      ),
    )
    .orderBy(desc(contactSyncEntries.updatedAt))
    .limit(limit * 2);
  const userIds = Array.from(
    new Set(entries.flatMap((entry) => (entry.matchedUserId ? [entry.matchedUserId] : []))),
  ).slice(0, limit);
  if (userIds.length === 0) {
    return [];
  }

  const candidates = await getUsersByIdsChunked(userIds);
  return await buildPersonPreviews(userId, candidates);
}

async function deleteAccount(userId: string) {
  const ownedLists = await db.select().from(lists).where(eq(lists.ownerId, userId));
  const ownedListIds = ownedLists.map((item) => item.id);

  if (ownedListIds.length > 0) {
    for (const chunk of chunkForSqlParams(ownedListIds, 1, 80)) {
      await db.delete(listItems).where(inArray(listItems.listId, chunk));
      await db.delete(lists).where(inArray(lists.id, chunk));
    }
  }

  // Before removing follow edges, repair the denormalized counters on the
  // other side of each edge so surviving accounts don't keep phantom
  // followers/following.
  const [followingRows, followerRows] = await Promise.all([
    db
      .select({ followeeId: follows.followeeId })
      .from(follows)
      .where(eq(follows.followerId, userId)),
    db
      .select({ followerId: follows.followerId })
      .from(follows)
      .where(eq(follows.followeeId, userId)),
  ]);
  for (const chunk of chunkForSqlParams(
    Array.from(new Set(followingRows.map((row) => row.followeeId))),
    1,
    80,
  )) {
    await db
      .update(users)
      .set({ countsFollowers: sql`max(0, ${users.countsFollowers} - 1)` })
      .where(inArray(users.id, chunk));
  }
  for (const chunk of chunkForSqlParams(
    Array.from(new Set(followerRows.map((row) => row.followerId))),
    1,
    80,
  )) {
    await db
      .update(users)
      .set({ countsFollowing: sql`max(0, ${users.countsFollowing} - 1)` })
      .where(inArray(users.id, chunk));
  }

  await Promise.all([
    db.delete(episodeProgress).where(eq(episodeProgress.userId, userId)),
    db.delete(watchStates).where(eq(watchStates.userId, userId)),
    db.delete(watchLogs).where(eq(watchLogs.userId, userId)),
    db.delete(reviews).where(eq(reviews.authorId, userId)),
    db.delete(likes).where(eq(likes.userId, userId)),
    db.delete(comments).where(eq(comments.authorId, userId)),
    db.delete(follows).where(eq(follows.followerId, userId)),
    db.delete(follows).where(eq(follows.followeeId, userId)),
    db.delete(followRequests).where(eq(followRequests.requesterId, userId)),
    db.delete(followRequests).where(eq(followRequests.targetId, userId)),
    db.delete(blocks).where(eq(blocks.blockerId, userId)),
    db.delete(blocks).where(eq(blocks.blockedId, userId)),
    db.delete(reports).where(eq(reports.reporterId, userId)),
    db.delete(contactSyncEntries).where(eq(contactSyncEntries.ownerId, userId)),
    db.delete(feedItems).where(eq(feedItems.ownerId, userId)),
    db.delete(feedItems).where(eq(feedItems.actorId, userId)),
    db.delete(pushTokens).where(eq(pushTokens.userId, userId)),
    db.delete(notifications).where(eq(notifications.userId, userId)),
    db.delete(notifications).where(eq(notifications.actorId, userId)),
  ]);
  await db.delete(users).where(eq(users.id, userId));

  return { success: true };
}

async function getShowsByIds(showIds: string[]) {
  if (showIds.length === 0) {
    return [];
  }
  const rows = await db.select().from(shows).where(inArray(shows.id, showIds));
  const byId = new Map(rows.map((row) => [row.id, showToDoc(row)]));
  return showIds.map((id) => byId.get(id)).filter(Boolean);
}

async function detailedWatchStates(userId: string, args: any, publicOnly = false) {
  const status = typeof args?.status === "string" ? args.status : undefined;
  const rows = await db
    .select()
    .from(watchStates)
    .where(
      status
        ? and(eq(watchStates.userId, userId), eq(watchStates.status, status as any))
        : eq(watchStates.userId, userId),
    )
    .orderBy(desc(watchStates.updatedAt));
  const showRows =
    rows.length > 0
      ? await db.select().from(shows).where(inArray(shows.id, rows.map((row) => row.showId)))
      : [];
  const byShow = new Map(showRows.map((show) => [show.id, showToDoc(show)] as const));
  return pageRows(
    rows
      .filter((row) => !publicOnly || row.status === "watchlist")
      .map((row) => ({ state: toDoc(row), show: byShow.get(row.showId) ?? null })),
    args,
  );
}

async function buildReviewDetails(reviewRows: Array<typeof reviews.$inferSelect>, viewerId?: string) {
  const authorIds = Array.from(new Set(reviewRows.map((review) => review.authorId)));
  const showIds = Array.from(new Set(reviewRows.map((review) => review.showId)));
  const [authorRows, showRows] = await Promise.all([
    authorIds.length ? db.select().from(users).where(inArray(users.id, authorIds)) : [],
    showIds.length ? db.select().from(shows).where(inArray(shows.id, showIds)) : [],
  ]);
  const authors = new Map(authorRows.map((user) => [user.id, toClientUser(user)] as const));
  const showMap = new Map(showRows.map((show) => [show.id, showToDoc(show)] as const));
  const likeRows =
    reviewRows.length > 0
      ? await db
          .select()
          .from(likes)
          .where(
            and(
              eq(likes.targetType, "review"),
              inArray(likes.targetId, reviewRows.map((review) => review.id)),
            ),
          )
      : [];
  const likeCount = new Map<string, number>();
  const likedByViewer = new Set<string>();
  for (const like of likeRows) {
    likeCount.set(like.targetId, (likeCount.get(like.targetId) ?? 0) + 1);
    if (viewerId && like.userId === viewerId) {
      likedByViewer.add(like.targetId);
    }
  }

  return reviewRows.map((review) => ({
    review: toDoc(review),
    author: authors.get(review.authorId) ?? null,
    show: showMap.get(review.showId) ?? null,
    likeCount: likeCount.get(review.id) ?? 0,
    likedByViewer: likedByViewer.has(review.id),
  }));
}

async function buildFeed(userId: string, args: any) {
  const allFeedRows = await db
    .select()
    .from(feedItems)
    .where(eq(feedItems.ownerId, userId))
    .orderBy(desc(feedItems.timestamp));
  // Rows fanned out before a block was created stay in the table but never
  // render for either side.
  const feedRows = await filterRowsByBlockedAuthors(userId, allFeedRows, (row) => row.actorId);
  const actorIds = Array.from(new Set(feedRows.map((row) => row.actorId)));
  const showIds = Array.from(new Set(feedRows.map((row) => row.showId)));
  const reviewIds = feedRows.filter((row) => row.type === "review").map((row) => row.targetId);
  const logIds = feedRows.filter((row) => row.type === "log").map((row) => row.targetId);
  const [actorRows, showRows, reviewRows, logRows] = await Promise.all([
    actorIds.length ? db.select().from(users).where(inArray(users.id, actorIds)) : [],
    showIds.length ? db.select().from(shows).where(inArray(shows.id, showIds)) : [],
    reviewIds.length ? db.select().from(reviews).where(inArray(reviews.id, reviewIds)) : [],
    logIds.length ? db.select().from(watchLogs).where(inArray(watchLogs.id, logIds)) : [],
  ]);
  const actors = new Map(actorRows.map((user) => [user.id, toClientUser(user)] as const));
  const showMap = new Map(showRows.map((show) => [show.id, showToDoc(show)] as const));
  const reviewMap = new Map(reviewRows.map((review) => [review.id, toDoc(review)] as const));
  const logMap = new Map(logRows.map((log) => [log.id, toDoc(log)] as const));
  return pageRows(
    feedRows.map((item) => ({
      ...toDoc(item),
      actor: actors.get(item.actorId) ?? null,
      show: showMap.get(item.showId) ?? null,
      review: item.type === "review" ? reviewMap.get(item.targetId) ?? null : null,
      log: item.type === "log" ? logMap.get(item.targetId) ?? null : null,
    })),
    args,
  );
}

async function buildWatchLogActivity(userId: string, args: any) {
  const parsed = z
    .object({
      userId: z.string(),
      limit: z.number().int().positive().optional(),
    })
    .parse(args ?? {});
  const limit = Math.min(parsed.limit ?? 60, 160);

  const [logRows, reviewRows] = await Promise.all([
    db.select().from(watchLogs).where(eq(watchLogs.userId, userId)).orderBy(desc(watchLogs.watchedAt)),
    db.select().from(reviews).where(eq(reviews.authorId, userId)).orderBy(desc(reviews.createdAt)),
  ]);
  const showIds = Array.from(
    new Set([...logRows.map((row) => row.showId), ...reviewRows.map((row) => row.showId)]),
  );
  const showRows =
    showIds.length > 0 ? await db.select().from(shows).where(inArray(shows.id, showIds)) : [];
  const showMap = new Map(showRows.map((show) => [show.id, showToDoc(show)] as const));

  const items = [
    ...logRows.map((log) => ({
      id: log.id,
      type: "log" as const,
      timestamp: log.watchedAt,
      show: showMap.get(log.showId) ?? null,
      log: toDoc(log),
    })),
    ...reviewRows.map((review) => ({
      id: review.id,
      type: "review" as const,
      timestamp: review.createdAt,
      show: showMap.get(review.showId) ?? null,
      review: toDoc(review),
    })),
  ].sort((left, right) => right.timestamp - left.timestamp);

  return {
    items: items.slice(0, limit),
    hasMore: items.length > limit,
  };
}

function parsePaginationWindow(args: any) {
  const parsed = paginationArgs.parse(args ?? {});
  const offset = Math.max(0, Number(parsed.paginationOpts?.cursor ?? 0) || 0);
  const numItems = Math.min(Math.max(1, parsed.paginationOpts?.numItems ?? 20), 100);
  return { offset, numItems };
}

async function getUsersByIdsChunked(userIds: string[]) {
  const uniqueIds = Array.from(new Set(userIds));
  const rows: Array<typeof users.$inferSelect> = [];
  for (const chunk of chunkForSqlParams(uniqueIds, 1, 80)) {
    rows.push(...(await db.select().from(users).where(inArray(users.id, chunk))));
  }
  return rows;
}

// Shared gate for "list things belonging to user X" endpoints: resolves the
// profile user and returns null when the viewer may not see their content
// (blocked either way, or private account without an approved follow).
async function getVisibleProfileAudience(viewerId: string | null, userId: string) {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const profileUser = rows[0];
  if (!profileUser) {
    return null;
  }
  const audience = await getProfileAudience(viewerId, profileUser);
  return audience.canViewContent ? { profileUser, audience } : null;
}

const EMPTY_PAGE = {
  page: [],
  results: [],
  continueCursor: "0",
  isDone: true,
};

// Drops rows authored by users with a block in either direction relative to
// the viewer. Signed-out viewers see everything.
async function filterRowsByBlockedAuthors<T>(
  viewerId: string | null,
  rows: T[],
  getAuthorId: (row: T) => string,
): Promise<T[]> {
  if (!viewerId || rows.length === 0) {
    return rows;
  }
  const blockedIds = await getBlockedEitherWayIdSet(viewerId, rows.map(getAuthorId));
  if (blockedIds.size === 0) {
    return rows;
  }
  return rows.filter((row) => !blockedIds.has(getAuthorId(row)));
}

// Interacting with someone's content is refused once a block exists in
// either direction. Reads the same as a deleted target so blocks stay quiet.
async function assertTargetOwnerNotBlocked(
  viewerId: string,
  targetType: string,
  targetId: string,
) {
  const target = await resolveTargetOwner(targetType, targetId);
  if (!target || target.ownerId === viewerId) {
    return;
  }
  const block = await getBlockStatus(viewerId, target.ownerId);
  if (isBlockedEitherWay(block)) {
    throw new ApiError(404, "target_not_found", "That content is no longer available");
  }
}

// Clears the "wants to follow you" inbox row once its request is withdrawn,
// declined, accepted, or severed by a block.
async function removeFollowRequestNotification(targetUserId: string, requesterId: string) {
  await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.userId, targetUserId),
        eq(notifications.dedupeKey, `follow_request:${requesterId}`),
      ),
    );
}

// Converts a pending follow request into a follow edge. Deleting the request
// row first (with returning) makes concurrent accepts idempotent: only the
// call that removed the row creates the edge and touches counters.
async function acceptFollowRequestEdge(
  target: typeof users.$inferSelect,
  requesterId: string,
) {
  const deletedRequest = await db
    .delete(followRequests)
    .where(
      and(eq(followRequests.requesterId, requesterId), eq(followRequests.targetId, target.id)),
    )
    .returning({ id: followRequests.id });
  await removeFollowRequestNotification(target.id, requesterId);
  if (deletedRequest.length === 0) {
    return false;
  }

  const inserted = await db
    .insert(follows)
    .values({
      id: createId("follow"),
      followerId: requesterId,
      followeeId: target.id,
      createdAt: Date.now(),
    })
    .onConflictDoNothing({ target: [follows.followerId, follows.followeeId] })
    .returning({ id: follows.id });
  if (inserted.length === 0) {
    return false;
  }

  await Promise.all([
    db
      .update(users)
      .set({ countsFollowing: sql`${users.countsFollowing} + 1` })
      .where(eq(users.id, requesterId)),
    db
      .update(users)
      .set({ countsFollowers: sql`${users.countsFollowers} + 1` })
      .where(eq(users.id, target.id)),
  ]);
  await notifyFollowAccepted(target, requesterId);
  return true;
}

// Removes a follow edge in one direction, keeping the denormalized counters
// honest. Used when a block severs the relationship.
async function severFollowEdge(followerId: string, followeeId: string) {
  const deleted = await db
    .delete(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)))
    .returning({ id: follows.id });
  if (deleted.length === 0) {
    return;
  }
  await Promise.all([
    db
      .update(users)
      .set({ countsFollowing: sql`max(0, ${users.countsFollowing} - 1)` })
      .where(eq(users.id, followerId)),
    db
      .update(users)
      .set({ countsFollowers: sql`max(0, ${users.countsFollowers} - 1)` })
      .where(eq(users.id, followeeId)),
  ]);
}

// Follower/following pages are cut in SQL (LIMIT/OFFSET via the numeric
// cursor the client already sends) so large accounts never pull their whole
// edge list into worker memory. Relationship flags are computed for the
// authenticated viewer; self rows stay in the list flagged isSelf.
async function listFollowsPage(input: {
  args: any;
  column: "followerId" | "followeeId";
  userId: string;
  viewerId: string;
}) {
  const { offset, numItems } = parsePaginationWindow(input.args);
  const matchColumn = input.column === "followeeId" ? follows.followeeId : follows.followerId;
  const otherColumn = input.column === "followeeId" ? follows.followerId : follows.followeeId;

  const rows = await db
    .select({ otherId: otherColumn, createdAt: follows.createdAt })
    .from(follows)
    .where(eq(matchColumn, input.userId))
    .orderBy(desc(follows.createdAt))
    .limit(numItems + 1)
    .offset(offset);

  const pageEdges = rows.slice(0, numItems);
  const userRows = pageEdges.length > 0 ? await getUsersByIdsChunked(pageEdges.map((row) => row.otherId)) : [];
  const userById = new Map(userRows.map((row) => [row.id, row] as const));
  const orderedUsers = pageEdges
    .map((edge) => userById.get(edge.otherId))
    .filter((row): row is typeof users.$inferSelect => Boolean(row));

  const previews = await buildPersonPreviews(input.viewerId, orderedUsers, {
    includeViewer: true,
  });

  return {
    page: previews,
    results: previews,
    continueCursor: String(offset + pageEdges.length),
    isDone: rows.length <= numItems,
  };
}

const FEED_FANOUT_MAX_FOLLOWERS = 400;

async function addFeedForFollowers(actorId: string, type: "review" | "log", targetId: string, showId: string, timestamp: number) {
  // Fan-out is capped to the most recent followers so a popular account
  // can't blow the request past D1 write limits; everyone still sees the
  // activity on the actor's profile.
  const followerRows = await db
    .select({ followerId: follows.followerId })
    .from(follows)
    .where(eq(follows.followeeId, actorId))
    .orderBy(desc(follows.createdAt))
    .limit(FEED_FANOUT_MAX_FOLLOWERS);
  const ownerIds = Array.from(new Set([actorId, ...followerRows.map((row) => row.followerId)]));
  if (ownerIds.length === 0) {
    return;
  }
  const feedRows = ownerIds.map((ownerId) => ({
    id: createId("feed"),
    ownerId,
    actorId,
    type,
    targetId,
    showId,
    timestamp,
    createdAt: Date.now(),
  }));
  for (const chunk of chunkForSqlParams(feedRows, 8)) {
    await db.insert(feedItems).values(chunk);
  }
}

export const queryHandlers: Record<string, RpcHandler> = {
  "auth:isAuthenticated": async ({ req }) => {
    const user = await getOptionalAuthUser(req);
    return user !== null;
  },
  "users:me": async ({ req }) => {
    const user = await getOptionalAuthUser(req);
    if (!user) return null;
    const libraryCounts = await getUserLibraryCounts(user.id);
    return {
      ...toClientUser(user),
      countsReviews: libraryCounts.reviews,
      countsLists: libraryCounts.lists,
      countsWatchlist: libraryCounts.watchlist,
      countsWatching: libraryCounts.watching,
      countsCompleted: libraryCounts.completed,
      countsDropped: libraryCounts.dropped,
      countsTotalShows: libraryCounts.total,
    };
  },
  "users:exportData": async ({ req }) => {
    const user = await requireAuthUser(req);
    return await buildExportData(user.id);
  },
  "users:suggested": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = optionalLimitArgs.parse(args ?? {});
    return await getSuggestedUsers(user.id, Math.min(parsed.limit ?? 6, 20));
  },
  "users:profile": async ({ args, req }) => {
    const userId = z.object({ userId: z.string() }).parse(args ?? {}).userId;
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const viewer = await getOptionalAuthUser(req);
    return rows[0] ? await buildUserProfile(rows[0], viewer) : null;
  },
  "users:search": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ text: z.string(), limit: z.number().optional() }).parse(args ?? {});
    const text = `%${parsed.text.trim()}%`;
    if (parsed.text.trim().length < 2) {
      return [];
    }
    const rows = await db
      .select()
      .from(users)
      .where(or(ilike(users.username, text), ilike(users.displayName, text), ilike(users.name, text)))
      .limit(Math.min(parsed.limit ?? 20, 50));
    return await buildPersonPreviews(user.id, rows);
  },
  "users:getShowsById": async ({ args }) => {
    const parsed = z.object({ showIds: z.array(z.string()) }).parse(args ?? {});
    return await getShowsByIds(parsed.showIds);
  },
  "contacts:getStatus": async ({ req }) => {
    const user = await requireAuthUser(req);
    return await getContactStatus(user.id);
  },
  "contacts:getMatches": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = optionalLimitArgs.parse(args ?? {});
    return await getContactMatches(user.id, Math.min(parsed.limit ?? 12, 30));
  },
  "contacts:getInviteCandidates": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = optionalLimitArgs.parse(args ?? {});
    const rows = await db
      .select()
      .from(contactSyncEntries)
      .where(eq(contactSyncEntries.ownerId, user.id))
      .orderBy(desc(contactSyncEntries.updatedAt));
    return sortInviteCandidates(rows.filter((row) => !row.matchedUserId))
      .slice(0, Math.min(parsed.limit ?? 20, 50))
      .map(toDoc);
  },
  "contacts:searchInviteCandidates": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ text: z.string(), limit: z.number().optional() }).parse(args ?? {});
    const rows = await db
      .select()
      .from(contactSyncEntries)
      .where(and(eq(contactSyncEntries.ownerId, user.id), ilike(contactSyncEntries.displayName, `%${parsed.text}%`)))
      .orderBy(desc(contactSyncEntries.updatedAt))
      .limit(Math.min(parsed.limit ?? 20, 50));
    return sortInviteCandidates(rows.filter((row) => !row.matchedUserId)).map(toDoc);
  },
  "follows:isFollowing": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ userId: z.string() }).parse(args ?? {});
    const rows = await db
      .select()
      .from(follows)
      .where(and(eq(follows.followerId, user.id), eq(follows.followeeId, parsed.userId)))
      .limit(1);
    return rows.length > 0;
  },
  "follows:getRelationship": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ userId: z.string() }).parse(args ?? {});
    const [followingRows, requestRows, block] = await Promise.all([
      db
        .select({ id: follows.id })
        .from(follows)
        .where(and(eq(follows.followerId, user.id), eq(follows.followeeId, parsed.userId)))
        .limit(1),
      db
        .select({ id: followRequests.id })
        .from(followRequests)
        .where(
          and(eq(followRequests.requesterId, user.id), eq(followRequests.targetId, parsed.userId)),
        )
        .limit(1),
      getBlockStatus(user.id, parsed.userId),
    ]);
    return {
      isFollowing: followingRows.length > 0,
      hasPendingRequest: requestRows.length > 0,
      blockedByViewer: block.blockedByViewer,
    };
  },
  "followRequests:listIncoming": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const { offset, numItems } = parsePaginationWindow(args);
    const rows = await db
      .select()
      .from(followRequests)
      .where(eq(followRequests.targetId, user.id))
      .orderBy(desc(followRequests.createdAt))
      .limit(numItems + 1)
      .offset(offset);
    const pageEdges = rows.slice(0, numItems);
    const requesterRows =
      pageEdges.length > 0
        ? await getUsersByIdsChunked(pageEdges.map((row) => row.requesterId))
        : [];
    const requesterById = new Map(requesterRows.map((row) => [row.id, row] as const));
    const orderedRequesters = pageEdges
      .map((edge) => requesterById.get(edge.requesterId))
      .filter((row): row is typeof users.$inferSelect => Boolean(row));
    const previews = await buildPersonPreviews(user.id, orderedRequesters);
    const previewByUserId = new Map(previews.map((preview) => [preview.user._id, preview]));
    const page = pageEdges.flatMap((edge) => {
      const preview = previewByUserId.get(edge.requesterId);
      return preview ? [{ ...preview, requestedAt: edge.createdAt }] : [];
    });
    return {
      page,
      results: page,
      continueCursor: String(offset + pageEdges.length),
      isDone: rows.length <= numItems,
    };
  },
  "followRequests:getIncomingCount": async ({ req }) => {
    const user = await getOptionalAuthUser(req);
    if (!user) return 0;
    const rows = await db
      .select({ value: count() })
      .from(followRequests)
      .where(eq(followRequests.targetId, user.id));
    return Number(rows[0]?.value ?? 0);
  },
  "blocks:list": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const { offset, numItems } = parsePaginationWindow(args);
    const rows = await db
      .select()
      .from(blocks)
      .where(eq(blocks.blockerId, user.id))
      .orderBy(desc(blocks.createdAt))
      .limit(numItems + 1)
      .offset(offset);
    const pageEdges = rows.slice(0, numItems);
    const blockedRows =
      pageEdges.length > 0
        ? await getUsersByIdsChunked(pageEdges.map((row) => row.blockedId))
        : [];
    const blockedById = new Map(blockedRows.map((row) => [row.id, row] as const));
    const page = pageEdges.flatMap((edge) => {
      const blocked = blockedById.get(edge.blockedId);
      if (!blocked) {
        return [];
      }
      return [
        {
          user: toClientUser(blocked),
          avatarUrl: blocked.avatarUrl ?? blocked.image ?? null,
          blockedAt: edge.createdAt,
        },
      ];
    });
    return {
      page,
      results: page,
      continueCursor: String(offset + pageEdges.length),
      isDone: rows.length <= numItems,
    };
  },
  "follows:listFollowersDetailed": async ({ args, req }) => {
    const parsed = z.object({ userId: z.string() }).passthrough().parse(args ?? {});
    const viewer = await getOptionalAuthUser(req);
    if (!(await getVisibleProfileAudience(viewer?.id ?? null, parsed.userId))) {
      return EMPTY_PAGE;
    }
    return await listFollowsPage({
      args,
      column: "followeeId",
      userId: parsed.userId,
      viewerId: viewer?.id ?? parsed.userId,
    });
  },
  "follows:listFollowingDetailed": async ({ args, req }) => {
    const parsed = z.object({ userId: z.string() }).passthrough().parse(args ?? {});
    const viewer = await getOptionalAuthUser(req);
    if (!(await getVisibleProfileAudience(viewer?.id ?? null, parsed.userId))) {
      return EMPTY_PAGE;
    }
    return await listFollowsPage({
      args,
      column: "followerId",
      userId: parsed.userId,
      viewerId: viewer?.id ?? parsed.userId,
    });
  },
  "likes:getForUserTarget": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = targetArgs.parse(args ?? {});
    const rows = await db
      .select()
      .from(likes)
      .where(and(eq(likes.userId, user.id), eq(likes.targetType, parsed.targetType), eq(likes.targetId, parsed.targetId)))
      .limit(1);
    return Boolean(rows[0]);
  },
  "likes:listForTarget": async ({ args }) => {
    const parsed = targetArgs.extend({ limit: z.number().optional() }).parse(args ?? {});
    const rows = await db
      .select()
      .from(likes)
      .where(and(eq(likes.targetType, parsed.targetType), eq(likes.targetId, parsed.targetId)))
      .orderBy(desc(likes.createdAt))
      .limit(Math.min(parsed.limit ?? 100, 200));
    return rows.map(toDoc);
  },
  "comments:listForTarget": async ({ args, req }) => {
    const viewer = await getOptionalAuthUser(req);
    const parsed = targetArgs.passthrough().parse(args ?? {});
    const allRows = await db
      .select()
      .from(comments)
      .where(and(eq(comments.targetType, parsed.targetType), eq(comments.targetId, parsed.targetId)))
      .orderBy(asc(comments.createdAt));
    const rows = await filterRowsByBlockedAuthors(viewer?.id ?? null, allRows, (row) => row.authorId);
    const authorRows = rows.length
      ? await db.select().from(users).where(inArray(users.id, rows.map((row) => row.authorId)))
      : [];
    const authors = new Map(authorRows.map((user) => [user.id, toClientUser(user)]));
    return pageRows(rows.map((row) => ({ comment: toDoc(row), author: authors.get(row.authorId) ?? null })), args);
  },
  "shows:get": async ({ args }) => {
    const showId = z.object({ showId: z.string() }).parse(args ?? {}).showId;
    const rows = await db.select().from(shows).where(eq(shows.id, showId)).limit(1);
    return await showDocWithCachedArtwork(rows[0]);
  },
  "shows:search": async ({ args }) => {
    const parsed = z.object({ text: z.string(), limit: z.number().optional() }).parse(args ?? {});
    if (parsed.text.trim().length < 2) {
      return [];
    }
    const rows = await db
      .select()
      .from(shows)
      .where(or(ilike(shows.title, `%${parsed.text}%`), ilike(shows.searchText, `%${parsed.text}%`)))
      .limit(Math.min(parsed.limit ?? 20, 50));
    return rows.map(showToDoc);
  },
  "watchStates:getCounts": async ({ req }) => {
    const user = await requireAuthUser(req);
    const libraryCounts = await getUserLibraryCounts(user.id);
    return {
      watchlist: libraryCounts.watchlist,
      watching: libraryCounts.watching,
      completed: libraryCounts.completed,
      dropped: libraryCounts.dropped,
      total: libraryCounts.total,
    };
  },
  "watchStates:getForShow": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const showId = z.object({ showId: z.string() }).parse(args ?? {}).showId;
    const rows = await db
      .select()
      .from(watchStates)
      .where(and(eq(watchStates.userId, user.id), eq(watchStates.showId, showId)))
      .limit(1);
    return toDoc(rows[0]);
  },
  "watchStates:listForUser": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ status: z.string().optional() }).parse(args ?? {});
    const rows = await db
      .select()
      .from(watchStates)
      .where(parsed.status ? and(eq(watchStates.userId, user.id), eq(watchStates.status, parsed.status as any)) : eq(watchStates.userId, user.id))
      .orderBy(desc(watchStates.updatedAt));
    return rows.map(toDoc);
  },
  "watchStates:listForUserDetailed": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    return await detailedWatchStates(user.id, args);
  },
  "watchStates:listPublicWatchlistDetailed": async ({ args, req }) => {
    const parsed = z.object({ userId: z.string() }).passthrough().parse(args ?? {});
    const viewer = await getOptionalAuthUser(req);
    const visible = await getVisibleProfileAudience(viewer?.id ?? null, parsed.userId);
    if (
      !visible ||
      !canViewProfileSection(getProfileVisibility(visible.profileUser).watchlist, {
        isOwnProfile: visible.audience.isSelf,
        viewerFollowsProfile: visible.audience.viewerFollowsProfile,
      })
    ) {
      return EMPTY_PAGE;
    }
    return await detailedWatchStates(parsed.userId, { ...args, status: "watchlist" }, true);
  },
  "watchLogs:listActivityForUser": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ userId: z.string() }).passthrough().parse(args ?? {});
    if (parsed.userId !== user.id) {
      throw new ApiError(403, "forbidden", "You can only view your own log activity");
    }
    return await buildWatchLogActivity(user.id, args);
  },
  "watchStats:getInsights": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z
      .object({ utcOffsetMinutes: z.number().int().min(-840).max(840).optional() })
      .parse(args ?? {});
    return await getWatchInsightsForUser(user.id, parsed.utcOffsetMinutes ?? 0);
  },
  "episodeProgress:getProgressForShow": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const showId = z.object({ showId: z.string() }).parse(args ?? {}).showId;
    const rows = await db
      .select()
      .from(episodeProgress)
      .where(and(eq(episodeProgress.userId, user.id), eq(episodeProgress.showId, showId)));
    return rows.map(toDoc);
  },
  "episodeProgress:getUpNext": async ({ req }) => {
    const user = await requireAuthUser(req);
    const [watchingRows, completedRows] = await Promise.all([
      db
        .select()
        .from(watchStates)
        .where(and(eq(watchStates.userId, user.id), eq(watchStates.status, "watching")))
        .orderBy(desc(watchStates.updatedAt))
        .limit(50),
      // Completed shows come back to the rail when a new episode airs; they
      // are filtered below to only those with a release after the user's
      // progress frontier.
      db
        .select()
        .from(watchStates)
        .where(and(eq(watchStates.userId, user.id), eq(watchStates.status, "completed")))
        .orderBy(desc(watchStates.updatedAt))
        .limit(25),
    ]);
    const completedShowIds = new Set(completedRows.map((row) => row.showId));
    const rows = [...watchingRows, ...completedRows];
    if (rows.length === 0) {
      return [];
    }

    const showIds = rows.map((row) => row.showId);
    const now = Date.now();
    const today = getLocalDateString(new Date(now));
    const todayStartTs = getStartOfLocalDayTimestamp(new Date(now));
    const [showRows, progressRows, releaseRows] = await Promise.all([
      db.select().from(shows).where(inArray(shows.id, showIds)),
      db
        .select()
        .from(episodeProgress)
        .where(
          and(
            eq(episodeProgress.userId, user.id),
            inArray(episodeProgress.showId, showIds),
          ),
        ),
      db
        .select()
        .from(releaseEvents)
        .where(
          and(
            inArray(releaseEvents.showId, showIds),
            gte(releaseEvents.airDateTs, todayStartTs),
          ),
        )
        .orderBy(asc(releaseEvents.airDateTs)),
    ]);
    const showById = new Map(showRows.map((show) => [show.id, show] as const));
    const releaseRowsByShowId = new Map<
      string,
      Array<typeof releaseEvents.$inferSelect>
    >();
    for (const event of releaseRows) {
      const existing = releaseRowsByShowId.get(event.showId) ?? [];
      existing.push(event);
      releaseRowsByShowId.set(event.showId, existing);
    }

    const tmdbExternalIds = showRows
      .filter((show) => show.externalSource === "tmdb")
      .map((show) => show.externalId);
    const detailRows =
      tmdbExternalIds.length > 0
        ? await db
            .select()
            .from(tmdbDetailsCache)
            .where(
              and(
                eq(tmdbDetailsCache.externalSource, "tmdb"),
                inArray(tmdbDetailsCache.externalId, tmdbExternalIds),
              ),
            )
        : [];
    const detailsByExternalId = new Map(
      detailRows.map((row) => [row.externalId, row.payload] as const),
    );

    type ProgressByShow = Map<
      string,
      {
        episodes: Array<{
          seasonNumber: number;
          episodeNumber: number;
          watchedAt: number;
        }>;
        latestWatchedAt: number | null;
      }
    >;
    const progressByShow: ProgressByShow = new Map();
    for (const entry of progressRows) {
      const current =
        progressByShow.get(entry.showId) ??
        ({
          episodes: [],
          latestWatchedAt: null,
        } as {
          episodes: Array<{
            seasonNumber: number;
            episodeNumber: number;
            watchedAt: number;
          }>;
          latestWatchedAt: number | null;
        });
      current.episodes.push({
        seasonNumber: entry.seasonNumber,
        episodeNumber: entry.episodeNumber,
        watchedAt: entry.watchedAt,
      });
      current.latestWatchedAt = Math.max(current.latestWatchedAt ?? 0, entry.watchedAt);
      progressByShow.set(entry.showId, current);
    }

    const rankedEntries = rows
      .map((row) => {
        const show = showById.get(row.showId);
        if (!show) return null;
        const detailPayload =
          show.externalSource === "tmdb"
            ? detailsByExternalId.get(show.externalId)
            : undefined;
        const seasons = readSeasonSummaries(detailPayload);
        const progress = progressByShow.get(show.id) ?? {
          episodes: [],
          latestWatchedAt: null,
        };
        const progressState = getEpisodeProgressState({
          watchedEpisodes: progress.episodes,
          seasons,
        });
        const nextEpisode =
          progressState.nextEpisode ?? progressState.latestWatched ?? {
            seasonNumber: seasons[0]?.seasonNumber ?? 1,
            episodeNumber: 1,
          };
        const nextSeasonNumber = nextEpisode.seasonNumber;
        const nextEpisodeNumber = nextEpisode.episodeNumber;

        const seasonRecord = seasons.find(
          (season) => season.seasonNumber === nextSeasonNumber,
        );
        const seasonAirMs = seasonRecord?.airDate
          ? Date.parse(seasonRecord.airDate)
          : Number.NaN;
        const isUpcoming =
          progressState.totalWatched === 0 &&
          Number.isFinite(seasonAirMs) &&
          seasonAirMs > now;
        const progressPct =
          progressState.totalEpisodes > 0
            ? Math.min(1, Math.max(0, progressState.totalWatched / progressState.totalEpisodes))
            : 0;
        const fallbackSortTimestamp = Math.max(
          progress.latestWatchedAt ?? 0,
          row.updatedAt,
        );
        const releaseAware = getReleaseAwareUpNextEpisode({
          fallback: {
            nextSeasonNumber,
            nextEpisodeNumber,
            nextEpisodeName: null,
            nextEpisodeStillUrl: null,
            nextAirDate:
              isUpcoming && Number.isFinite(seasonAirMs) ? seasonAirMs : null,
            nextReleaseDate: null,
            nextEpisodeReleasedToday: false,
            isUpcoming,
            isCaughtUp: progressState.isCaughtUp,
            totalEpisodes: progressState.totalEpisodes,
            sortTimestamp: fallbackSortTimestamp,
          },
          latestWatched: progressState.latestWatched
            ? {
                season: progressState.latestWatched.seasonNumber,
                episode: progressState.latestWatched.episodeNumber,
              }
            : null,
          watchedEpisodeCount: progressState.totalWatched,
          releaseEvents: releaseRowsByShowId.get(show.id) ?? [],
          today,
        });
        const releaseProgressPct =
          releaseAware.totalEpisodes > 0
            ? Math.min(1, Math.max(0, progressState.totalWatched / releaseAware.totalEpisodes))
            : progressPct;

        // Completed shows only resurface when a release event confirms a new
        // episode aired today beyond the user's progress frontier.
        if (
          completedShowIds.has(show.id) &&
          !releaseAware.nextEpisodeReleasedToday
        ) {
          return null;
        }

        const isCaughtUp = releaseAware.isCaughtUp ?? progressState.isCaughtUp;
        // When season metadata exists but can't confirm the pointed-at
        // episode exists (announced-but-empty next season, stale counts) and
        // no release event backs it either, present the card as upcoming so
        // the rail never offers to play or mark an episode that isn't real.
        const nextEpisodeVerified = isEpisodeVerified(
          {
            seasonNumber: releaseAware.nextSeasonNumber,
            episodeNumber: releaseAware.nextEpisodeNumber,
          },
          progressState.seasons,
        );
        const presentAsUpcoming =
          Boolean(releaseAware.isUpcoming) ||
          (!isCaughtUp &&
            !releaseAware.nextEpisodeReleasedToday &&
            !releaseAware.nextReleaseDate &&
            progressState.seasons.length > 0 &&
            !nextEpisodeVerified);

        return {
          showId: show.id,
          show: showToDoc(show),
          externalSource: show.externalSource,
          externalId: show.externalId,
          totalWatched: progressState.totalWatched,
          totalEpisodes: releaseAware.totalEpisodes,
          progressPct: releaseProgressPct,
          nextSeasonNumber: releaseAware.nextSeasonNumber,
          nextEpisodeNumber: releaseAware.nextEpisodeNumber,
          nextEpisodeName: releaseAware.nextEpisodeName ?? null,
          nextEpisodeStillUrl: releaseAware.nextEpisodeStillUrl ?? null,
          nextEpisodeOverview: null as string | null,
          nextEpisodeRuntime: null as number | null,
          nextAirDate: releaseAware.nextAirDate ?? null,
          nextReleaseDate: releaseAware.nextReleaseDate ?? null,
          nextEpisodeReleasedToday: releaseAware.nextEpisodeReleasedToday ?? false,
          isUpcoming: presentAsUpcoming,
          isCaughtUp,
          lastWatchedAt: progress.latestWatchedAt,
          seasons: progressState.seasons,
          sortTimestamp: releaseAware.sortTimestamp,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((left, right) => right.sortTimestamp - left.sortTimestamp)
      .slice(0, 10);

    await enrichUpNextEntriesWithSeasonMetadata(rankedEntries, { now, today });

    return rankedEntries.map(
      ({
        sortTimestamp: _sortTimestamp,
        externalSource: _externalSource,
        externalId: _externalId,
        ...entry
      }) => entry,
    );
  },
  "reviews:getDetailed": async ({ args, req }) => {
    const viewer = await getOptionalAuthUser(req);
    const reviewId = z.object({ reviewId: z.string() }).parse(args ?? {}).reviewId;
    const rows = await db.select().from(reviews).where(eq(reviews.id, reviewId)).limit(1);
    return rows[0] ? (await buildReviewDetails(rows, viewer?.id))[0] : null;
  },
  "reviews:listForShowDetailed": async ({ args, req }) => {
    const viewer = await getOptionalAuthUser(req);
    const parsed = z.object({ showId: z.string() }).passthrough().parse(args ?? {});
    const rows = await db.select().from(reviews).where(eq(reviews.showId, parsed.showId)).orderBy(desc(reviews.createdAt));
    const visibleRows = await filterRowsByBlockedAuthors(viewer?.id ?? null, rows, (row) => row.authorId);
    return pageRows(await buildReviewDetails(visibleRows, viewer?.id), args);
  },
  "reviews:listForEpisodeDetailed": async ({ args, req }) => {
    const viewer = await getOptionalAuthUser(req);
    const parsed = z.object({ showId: z.string(), seasonNumber: z.number(), episodeNumber: z.number() }).passthrough().parse(args ?? {});
    const rows = await db
      .select()
      .from(reviews)
      .where(and(eq(reviews.showId, parsed.showId), eq(reviews.seasonNumber, parsed.seasonNumber), eq(reviews.episodeNumber, parsed.episodeNumber)))
      .orderBy(desc(reviews.createdAt));
    const visibleRows = await filterRowsByBlockedAuthors(viewer?.id ?? null, rows, (row) => row.authorId);
    return pageRows(await buildReviewDetails(visibleRows, viewer?.id), args);
  },
  "reviews:listForUserDetailed": async ({ args, req }) => {
    const viewer = await getOptionalAuthUser(req);
    const parsed = z.object({ userId: z.string() }).passthrough().parse(args ?? {});
    if (!(await getVisibleProfileAudience(viewer?.id ?? null, parsed.userId))) {
      return EMPTY_PAGE;
    }
    const rows = await db.select().from(reviews).where(eq(reviews.authorId, parsed.userId)).orderBy(desc(reviews.createdAt));
    return pageRows(await buildReviewDetails(rows, viewer?.id), args);
  },
  "reviews:getMyEpisodeRatings": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const showId = z.object({ showId: z.string() }).parse(args ?? {}).showId;
    const rows = await db
      .select()
      .from(reviews)
      .where(and(eq(reviews.authorId, user.id), eq(reviews.showId, showId)));
    return rows.filter((row) => row.seasonNumber !== null && row.episodeNumber !== null).map(toDoc);
  },
  "reviews:getEpisodeStats": async ({ args }) => {
    const parsed = z.object({ showId: z.string(), seasonNumber: z.number(), episodeNumber: z.number() }).parse(args ?? {});
    const rows = await db
      .select()
      .from(reviews)
      .where(and(eq(reviews.showId, parsed.showId), eq(reviews.seasonNumber, parsed.seasonNumber), eq(reviews.episodeNumber, parsed.episodeNumber)));
    return {
      count: rows.length,
      reviewCount: rows.length,
      averageRating: rows.length
        ? rows.reduce((sum, row) => sum + row.rating, 0) / rows.length
        : null,
    };
  },
  "lists:get": async ({ args }) => {
    const listId = z.object({ listId: z.string() }).parse(args ?? {}).listId;
    const rows = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
    return listToDoc(rows[0]);
  },
  "lists:listForUser": async ({ args }) => {
    const parsed = z.object({ userId: z.string().optional() }).passthrough().parse(args ?? {});
    const userId = parsed.userId;
    if (!userId) return pageRows([], args);
    const rows = await db.select().from(lists).where(eq(lists.ownerId, userId)).orderBy(desc(lists.updatedAt));
    return pageRows(rows.map(listToDoc), args);
  },
  "lists:listPublicForUser": async ({ args, req }) => {
    const parsed = z.object({ userId: z.string() }).passthrough().parse(args ?? {});
    const viewer = await getOptionalAuthUser(req);
    if (!(await getVisibleProfileAudience(viewer?.id ?? null, parsed.userId))) {
      return EMPTY_PAGE;
    }
    const rows = await db.select().from(lists).where(and(eq(lists.ownerId, parsed.userId), eq(lists.isPublic, true))).orderBy(desc(lists.updatedAt));
    return pageRows(rows.map(listToDoc), args);
  },
  "listItems:listDetailed": async ({ args }) => {
    const parsed = z.object({ listId: z.string() }).passthrough().parse(args ?? {});
    const rows = await db.select().from(listItems).where(eq(listItems.listId, parsed.listId)).orderBy(asc(listItems.position));
    const showRows = rows.length ? await db.select().from(shows).where(inArray(shows.id, rows.map((row) => row.showId))) : [];
    const showMap = new Map(showRows.map((show) => [show.id, showToDoc(show)]));
    return rows.map((row) => ({ ...toDoc(row), show: showMap.get(row.showId) ?? null }));
  },
  "listItems:getShowMembership": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const showId = z.object({ showId: z.string() }).parse(args ?? {}).showId;
    const ownLists = await db.select().from(lists).where(eq(lists.ownerId, user.id));
    const ids = ownLists.map((list) => list.id);
    if (!ids.length) return [];
    const rows = await db.select().from(listItems).where(and(inArray(listItems.listId, ids), eq(listItems.showId, showId)));
    return rows.map((row) => row.listId);
  },
  "feed:listForUser": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    return await buildFeed(user.id, args);
  },
  "trending:shows": async ({ args }) => {
    const parsed = z
      .object({
        limit: z.number().optional(),
        windowHours: z.number().optional(),
      })
      .parse(args ?? {});
    const limit = Math.min(parsed.limit ?? 10, 50);
    const since = Date.now() - Math.min(parsed.windowHours ?? 96, 24 * 14) * 60 * 60 * 1000;
    const [recentReviews, recentLogs, recentStates] = await Promise.all([
      db
        .select({ showId: reviews.showId, total: count() })
        .from(reviews)
        .where(gte(reviews.createdAt, since))
        .groupBy(reviews.showId),
      db
        .select({ showId: watchLogs.showId, total: count() })
        .from(watchLogs)
        .where(gte(watchLogs.watchedAt, since))
        .groupBy(watchLogs.showId),
      db
        .select({ showId: watchStates.showId, total: count() })
        .from(watchStates)
        .where(gte(watchStates.updatedAt, since))
        .groupBy(watchStates.showId),
    ]);

    const scores = new Map<
      string,
      { score: number; reviewCount: number; logCount: number; statusCount: number }
    >();
    const addScore = (
      showId: string,
      total: unknown,
      weight: number,
      field: "reviewCount" | "logCount" | "statusCount",
    ) => {
      const countValue = Number(total ?? 0);
      const current = scores.get(showId) ?? {
        score: 0,
        reviewCount: 0,
        logCount: 0,
        statusCount: 0,
      };
      current.score += countValue * weight;
      current[field] += countValue;
      scores.set(showId, current);
    };

    recentReviews.forEach((row) => addScore(row.showId, row.total, 3.5, "reviewCount"));
    recentLogs.forEach((row) => addScore(row.showId, row.total, 2, "logCount"));
    recentStates.forEach((row) => addScore(row.showId, row.total, 1.25, "statusCount"));

    const rankedIds = Array.from(scores.entries())
      .sort(([, left], [, right]) => right.score - left.score)
      .map(([showId]) => showId);
    const showMap = await getShowsWithCachedArtworkById(rankedIds.slice(0, limit * 2));
    const ranked = rankedIds
      .map((showId) => ({ showId, signal: scores.get(showId)! }))
      .filter(({ showId }) => showMap.has(showId))
      .slice(0, limit);

    if (ranked.length < limit) {
      const fallbackRows = await db
        .select()
        .from(shows)
        .orderBy(desc(shows.tmdbPopularity), desc(shows.tmdbVoteCount), desc(shows.updatedAt))
        .limit(limit * 6);
      const existing = new Set(ranked.map((item) => item.showId));
      const fallbackRanked = rankHomeShows(
        fallbackRows
          .filter((show) => !existing.has(show.id))
          .map(showToDoc)
          .filter(Boolean),
        { diversityStrength: 0.18 },
      ).slice(0, limit - ranked.length);
      const fallbackRowsById = new Map(fallbackRows.map((show) => [show.id, show]));
      const fallbackDocs = await Promise.all(
        fallbackRanked.map(async (show) => ({
          showId: show._id,
          signal: {
            score: show.homeScore,
            reviewCount: 0,
            logCount: 0,
            statusCount: 0,
          },
          show: await showDocWithCachedArtwork(fallbackRowsById.get(show._id)),
        })),
      );
      return [
        ...ranked.map(({ showId, signal }, index) => ({
          rank: index + 1,
          score: signal.score,
          reviewCount: signal.reviewCount,
          logCount: signal.logCount,
          statusCount: signal.statusCount,
          show: showMap.get(showId),
        })),
        ...fallbackDocs.map((item, index) => ({
          rank: ranked.length + index + 1,
          score: item.signal.score,
          reviewCount: item.signal.reviewCount,
          logCount: item.signal.logCount,
          statusCount: item.signal.statusCount,
          show: item.show,
        })),
      ];
    }

    return ranked.map(({ showId, signal }, index) => ({
      rank: index + 1,
      score: signal.score,
      reviewCount: signal.reviewCount,
      logCount: signal.logCount,
      statusCount: signal.statusCount,
      show: showMap.get(showId),
    }));
  },
  "trending:mostReviewed": async ({ args }) => {
    const parsed = optionalLimitArgs.parse(args ?? {});
    const counts = await db.select({ showId: reviews.showId, total: count() }).from(reviews).groupBy(reviews.showId).orderBy(desc(count())).limit(Math.min(parsed.limit ?? 10, 50));
    const showMap = await getShowsWithCachedArtworkById(counts.map((row) => row.showId));
    return counts
      .map((row, index) => ({
        rank: index + 1,
        reviewCount: Number(row.total ?? 0),
        show: showMap.get(row.showId) ?? null,
      }))
      .filter((item) => item.show);
  },
  "embeddings:getViewerTastePreferences": async ({ req }) => {
    const user = await requireAuthUser(req);
    const rows = await db.select().from(userTastePreferences).where(eq(userTastePreferences.userId, user.id)).limit(1);
    return rows[0] ? toDoc(rows[0]) : { favoriteShowIds: [], favoriteThemes: [] };
  },
  "releaseCalendar:getHomePreview": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ today: z.string().optional() }).parse(args ?? {});
    const [states, tasteRows] = await Promise.all([
      db.select().from(watchStates).where(eq(watchStates.userId, user.id)),
      db
        .select()
        .from(userTastePreferences)
        .where(eq(userTastePreferences.userId, user.id))
        .limit(1),
    ]);
    const showIds = getReleaseCalendarShowIds({
      states,
      favoriteShowIds: mergeUniqueShowIds(
        user.favoriteShowIds,
        tasteRows[0]?.favoriteShowIds,
      ),
    }).slice(0, RELEASE_CALENDAR_MAX_ITEMS);
    if (!showIds.length) {
      return {
        tonightGroups: [],
        upcomingGroups: [],
        totalTonight: 0,
        totalUpcoming: 0,
        staleShowIds: [],
        selectedProviders: [],
        providerOptions: RELEASE_CALENDAR_PROVIDER_OPTIONS,
      };
    }
    const today = parsed.today && isDateOnlyString(parsed.today)
      ? parsed.today
      : getLocalDateString();
    const todayStartTs = getDateOnlyStartTimestamp(today);
    const [rows, showRows, staleShowIds] = await Promise.all([
      db.select().from(releaseEvents).where(and(inArray(releaseEvents.showId, showIds), gte(releaseEvents.airDateTs, todayStartTs))).orderBy(asc(releaseEvents.airDateTs)).limit(RELEASE_CALENDAR_MAX_ITEMS),
      db.select().from(shows).where(inArray(shows.id, showIds)),
      getStaleReleaseShowIds(showIds),
    ]);
    const detailRows = await getTmdbDetailRowsForShows(showRows);
    const tonightData = buildReleaseCalendarFromRows(rows, showRows, {
      detailRows,
      today,
      view: "tonight",
      limit: 8,
      staleShowIds,
    });
    const upcomingData = buildReleaseCalendarFromRows(rows, showRows, {
      detailRows,
      today,
      view: "upcoming",
      limit: 16,
      staleShowIds,
    });
    return {
      tonightGroups: tonightData.groups,
      upcomingGroups: upcomingData.groups,
      totalTonight: tonightData.totalItems,
      totalUpcoming: upcomingData.totalItems,
      staleShowIds,
      selectedProviders: [],
      providerOptions: RELEASE_CALENDAR_PROVIDER_OPTIONS,
    };
  },
  "releaseCalendar:listForMe": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z
      .object({
        today: z.string().optional(),
        view: z.string().optional(),
        limit: z.number().int().positive().optional(),
        cursor: z.string().nullable().optional(),
        selectedProviders: z.array(z.string()).optional(),
      })
      .parse(args ?? {});
    const [states, tasteRows] = await Promise.all([
      db.select().from(watchStates).where(eq(watchStates.userId, user.id)),
      db
        .select()
        .from(userTastePreferences)
        .where(eq(userTastePreferences.userId, user.id))
        .limit(1),
    ]);
    const showIds = getReleaseCalendarShowIds({
      states,
      favoriteShowIds: mergeUniqueShowIds(
        user.favoriteShowIds,
        tasteRows[0]?.favoriteShowIds,
      ),
    }).slice(0, RELEASE_CALENDAR_MAX_ITEMS);
    const empty = {
      groups: [],
      providerOptions: RELEASE_CALENDAR_PROVIDER_OPTIONS,
      selectedProviders: [],
      totalItems: 0,
      staleShowIds: [],
      continueCursor: "0",
      isDone: true,
    };
    if (!showIds.length) return empty;
    const today = parsed.today && isDateOnlyString(parsed.today)
      ? parsed.today
      : getLocalDateString();
    const todayStartTs = getDateOnlyStartTimestamp(today);
    const [rows, showRows, staleShowIds] = await Promise.all([
      db.select().from(releaseEvents).where(and(inArray(releaseEvents.showId, showIds), gte(releaseEvents.airDateTs, todayStartTs))).orderBy(asc(releaseEvents.airDateTs)).limit(RELEASE_CALENDAR_MAX_ITEMS * 4),
      db.select().from(shows).where(inArray(shows.id, showIds)),
      getStaleReleaseShowIds(showIds),
    ]);
    const detailRows = await getTmdbDetailRowsForShows(showRows);
    const data = buildReleaseCalendarFromRows(rows, showRows, {
      detailRows,
      today,
      view: parsed.view ?? "upcoming",
      limit: parsed.limit ?? RELEASE_CALENDAR_MAX_ITEMS,
      cursor: parsed.cursor,
      selectedProviders: parsed.selectedProviders,
      staleShowIds,
    });
    return {
      ...empty,
      ...data,
    };
  },
  "reports:listOpen": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    if (!user.isAdmin) throw new ApiError(403, "forbidden", "Admin access required");
    const rows = await db.select().from(reports).where(eq(reports.status, "open")).orderBy(desc(reports.createdAt));
    return pageRows(rows.map(toDoc), args);
  },
  "storage:getUrl": async ({ args }) => {
    const parsed = getStorageUrlArgs.parse(args ?? {});
    return parsed.storageId.startsWith("http://") || parsed.storageId.startsWith("https://")
      ? parsed.storageId
      : null;
  },
  "notifications:list": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = paginationArgs.parse(args ?? {});
    const start = Number(parsed.paginationOpts?.cursor ?? 0) || 0;
    const numItems = Math.min(parsed.paginationOpts?.numItems ?? 20, 50);
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(numItems)
      .offset(start);

    const actorIds = Array.from(
      new Set(rows.map((row) => row.actorId).filter((id): id is string => Boolean(id))),
    );
    const showIds = Array.from(
      new Set(rows.map((row) => row.showId).filter((id): id is string => Boolean(id))),
    );
    const [actorRows, showRows] = await Promise.all([
      actorIds.length > 0 ? db.select().from(users).where(inArray(users.id, actorIds)) : [],
      showIds.length > 0 ? db.select().from(shows).where(inArray(shows.id, showIds)) : [],
    ]);
    const actorById = new Map(actorRows.map((actor) => [actor.id, actor] as const));
    const showById = new Map(showRows.map((show) => [show.id, show] as const));

    const page = rows.map((row) => {
      const actor = row.actorId ? actorById.get(row.actorId) : null;
      const show = row.showId ? showById.get(row.showId) : null;
      return {
        ...toDoc(row),
        actor: actor
          ? {
              _id: actor.id,
              username: actor.username,
              displayName: actor.displayName,
              avatarUrl: actor.avatarUrl ?? actor.image ?? null,
            }
          : null,
        show: show ? toShowPreview(show) : null,
      };
    });
    const next = start + rows.length;
    return {
      page,
      results: page,
      continueCursor: String(next),
      isDone: rows.length < numItems,
    };
  },
  "notifications:getUnreadCount": async ({ req }) => {
    const user = await getOptionalAuthUser(req);
    if (!user) return 0;
    const rows = await db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
    return Number(rows[0]?.value ?? 0);
  },
  "notifications:getPreferences": async ({ req }) => {
    const user = await requireAuthUser(req);
    return resolveNotificationPreferences(user.notificationPreferences);
  },
};

export const mutationHandlers: Record<string, RpcHandler> = {
  "users:ensureProfile": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = ensureProfileArgs.parse(args ?? {});
    const providedUsername = parsed.username
      ? parsed.username.toLowerCase().replace(/[^a-z0-9_]+/g, "")
      : user.username;
    const nextDisplayName = parsed.displayName ?? user.displayName ?? user.name ?? user.username;

    if (providedUsername) {
      await ensureUniqueUsername(providedUsername, user.id);
    }

    await db
      .update(users)
      .set({
        username: providedUsername ?? user.username,
        displayName: nextDisplayName,
        searchText: normalizeSearchText(
          `${nextDisplayName ?? ""} ${providedUsername ?? ""} ${user.name ?? ""}`,
        ),
        lastSeenAt: Date.now(),
      })
      .where(eq(users.id, user.id));

    const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    return rows[0] ? toClientUser(rows[0]) : null;
  },
  "users:updateProfile": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = updateProfileArgs.parse(args ?? {});
    const username = parsed.username
      ? parsed.username.toLowerCase().replace(/[^a-z0-9_]+/g, "")
      : user.username;

    if (username) {
      await ensureUniqueUsername(username, user.id);
    }

    await db
      .update(users)
      .set({
        username,
        displayName: parsed.displayName ?? user.displayName,
        bio: parsed.bio === undefined ? user.bio : parsed.bio,
        favoriteShowIds: parsed.favoriteShowIds ?? user.favoriteShowIds,
        favoriteGenres: parsed.favoriteGenres ?? user.favoriteGenres,
        avatarUrl: parsed.avatarStorageId ?? user.avatarUrl,
        profileVisibility: parsed.profileVisibility
          ? resolveProfileVisibility({
              ...(user.profileVisibility ?? {}),
              ...parsed.profileVisibility,
            })
          : user.profileVisibility,
        releaseCalendarPreferences:
          parsed.releaseCalendarPreferences ?? user.releaseCalendarPreferences,
        streamingProviders:
          parsed.streamingProviders !== undefined
            ? normalizeStreamingProviderKeys(parsed.streamingProviders)
            : user.streamingProviders,
        searchText: normalizeSearchText(
          `${parsed.displayName ?? user.displayName ?? ""} ${username ?? ""} ${user.name ?? ""}`,
        ),
        lastSeenAt: Date.now(),
      })
      .where(eq(users.id, user.id));

    const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    return rows[0] ? toClientUser(rows[0]) : null;
  },
  "users:setOnboardingStep": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = setOnboardingStepArgs.parse(args ?? {});
    await db
      .update(users)
      .set({
        onboardingStep: parsed.step,
        onboardingCompletedAt: parsed.step === "complete" ? Date.now() : user.onboardingCompletedAt,
      })
      .where(eq(users.id, user.id));
    return { success: true, userId: user.id, step: parsed.step };
  },
  "users:deleteAccount": async ({ req }) => {
    const user = await requireAuthUser(req);
    return await deleteAccount(user.id);
  },
  "storage:generateUploadUrl": async ({ req }) => {
    const user = await requireAuthUser(req);
    const origin = getRequestOrigin(req);
    const token = createUploadToken(user.id);
    return `${origin}/api/uploads/blob?token=${encodeURIComponent(token)}`;
  },
  "contacts:clearSync": async ({ req }) => {
    const user = await requireAuthUser(req);
    await db.delete(contactSyncEntries).where(eq(contactSyncEntries.ownerId, user.id));
    return { success: true };
  },
  "contacts:sendInvite": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const entryId = z.object({ entryId: z.string() }).parse(args ?? {}).entryId;
    await enforceRateLimit(rateLimitKey("contacts-invite", user.id), 30, 60 * 60 * 1000);

    const rows = await db
      .select()
      .from(contactSyncEntries)
      .where(and(eq(contactSyncEntries.id, entryId), eq(contactSyncEntries.ownerId, user.id)))
      .limit(1);
    const entry = rows[0];
    if (!entry) {
      throw new ApiError(404, "contact_not_found", "Contact invite was not found");
    }
    if (entry.matchedUserId) {
      throw new ApiError(409, "contact_already_joined", "This contact is already on Plotlist");
    }

    const now = Date.now();
    if (entry.invitedAt && entry.invitedAt > now - CONTACT_INVITE_RESEND_COOLDOWN_MS) {
      return { success: true, invitedAt: entry.invitedAt, alreadyInvited: true };
    }

    await db
      .update(contactSyncEntries)
      .set({ invitedAt: now, updatedAt: now })
      .where(eq(contactSyncEntries.id, entryId));
    return { success: true, invitedAt: now, alreadyInvited: false };
  },
  "follows:follow": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = followArgs.parse(args ?? {});
    if (parsed.userIdToFollow === user.id) {
      return null;
    }

    await enforceRateLimit(`follow:${user.id}`, 30, 60_000);

    const followeeRows = await db
      .select({ id: users.id, isPrivate: users.isPrivate })
      .from(users)
      .where(eq(users.id, parsed.userIdToFollow))
      .limit(1);
    if (!followeeRows[0]) {
      throw new ApiError(404, "user_not_found", "That account no longer exists");
    }

    const block = await getBlockStatus(user.id, parsed.userIdToFollow);
    if (isBlockedEitherWay(block)) {
      // A blocked-by-them viewer gets the same message as a deleted account
      // so blocks stay undetectable.
      throw new ApiError(
        block.blockedByViewer ? 403 : 404,
        block.blockedByViewer ? "user_blocked" : "user_not_found",
        block.blockedByViewer
          ? "Unblock this account to follow them"
          : "That account no longer exists",
      );
    }

    // Private accounts collect requests instead of followers; the follow row
    // is only created when the owner approves.
    if (followeeRows[0].isPrivate) {
      const alreadyFollowing = await db
        .select({ id: follows.id })
        .from(follows)
        .where(and(eq(follows.followerId, user.id), eq(follows.followeeId, parsed.userIdToFollow)))
        .limit(1);
      if (alreadyFollowing[0]) {
        return { status: "following", followId: alreadyFollowing[0].id };
      }

      const requested = await db
        .insert(followRequests)
        .values({
          id: createId("followreq"),
          requesterId: user.id,
          targetId: parsed.userIdToFollow,
          createdAt: Date.now(),
        })
        .onConflictDoNothing({ target: [followRequests.requesterId, followRequests.targetId] })
        .returning({ id: followRequests.id });
      if (requested.length > 0) {
        await notifyFollowRequest(user, parsed.userIdToFollow);
      }
      return { status: "requested" };
    }

    // Concurrent taps race here; the unique (follower, followee) index plus
    // onConflictDoNothing means exactly one request inserts, and only that
    // request touches the denormalized counters.
    const inserted = await db
      .insert(follows)
      .values({
        id: createId("follow"),
        followerId: user.id,
        followeeId: parsed.userIdToFollow,
        createdAt: Date.now(),
      })
      .onConflictDoNothing({ target: [follows.followerId, follows.followeeId] })
      .returning({ id: follows.id });

    if (inserted.length === 0) {
      const existing = await db
        .select({ id: follows.id })
        .from(follows)
        .where(
          and(eq(follows.followerId, user.id), eq(follows.followeeId, parsed.userIdToFollow)),
        )
        .limit(1);
      return existing[0] ? { status: "following", followId: existing[0].id } : null;
    }

    await Promise.all([
      db
        .update(users)
        .set({ countsFollowing: sql`${users.countsFollowing} + 1` })
        .where(eq(users.id, user.id)),
      db
        .update(users)
        .set({ countsFollowers: sql`${users.countsFollowers} + 1` })
        .where(eq(users.id, parsed.userIdToFollow)),
    ]);

    await notifyFollow(user, parsed.userIdToFollow);

    return { status: "following", followId: inserted[0].id };
  },
  "follows:unfollow": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = unfollowArgs.parse(args ?? {});

    await enforceRateLimit(`unfollow:${user.id}`, 60, 60_000);

    // Unfollow also withdraws a pending request so the client's "Requested"
    // button can cancel through the same mutation.
    await db
      .delete(followRequests)
      .where(
        and(
          eq(followRequests.requesterId, user.id),
          eq(followRequests.targetId, parsed.userIdToUnfollow),
        ),
      );
    await removeFollowRequestNotification(parsed.userIdToUnfollow, user.id);

    // Delete-by-pair with returning keeps this atomic: whichever concurrent
    // request removes the row is the only one that decrements the counters.
    const deleted = await db
      .delete(follows)
      .where(
        and(eq(follows.followerId, user.id), eq(follows.followeeId, parsed.userIdToUnfollow)),
      )
      .returning({ id: follows.id });
    if (deleted.length === 0) {
      return null;
    }

    await Promise.all([
      db
        .update(users)
        .set({ countsFollowing: sql`max(0, ${users.countsFollowing} - 1)` })
        .where(eq(users.id, user.id)),
      db
        .update(users)
        .set({ countsFollowers: sql`max(0, ${users.countsFollowers} - 1)` })
        .where(eq(users.id, parsed.userIdToUnfollow)),
    ]);

    return { success: true };
  },
  "followRequests:accept": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ requesterId: z.string().min(1) }).parse(args ?? {});
    const accepted = await acceptFollowRequestEdge(user, parsed.requesterId);
    return { success: true, accepted };
  },
  "followRequests:decline": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ requesterId: z.string().min(1) }).parse(args ?? {});
    await db
      .delete(followRequests)
      .where(
        and(
          eq(followRequests.requesterId, parsed.requesterId),
          eq(followRequests.targetId, user.id),
        ),
      );
    await removeFollowRequestNotification(user.id, parsed.requesterId);
    return { success: true };
  },
  "blocks:block": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ userId: z.string().min(1) }).parse(args ?? {});
    if (parsed.userId === user.id) {
      throw new ApiError(400, "cannot_block_self", "You can't block yourself");
    }

    await enforceRateLimit(`block:${user.id}`, 30, 60_000);

    const targetRows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, parsed.userId))
      .limit(1);
    if (!targetRows[0]) {
      throw new ApiError(404, "user_not_found", "That account no longer exists");
    }

    await db
      .insert(blocks)
      .values({
        id: createId("block"),
        blockerId: user.id,
        blockedId: parsed.userId,
        createdAt: Date.now(),
      })
      .onConflictDoNothing({ target: [blocks.blockerId, blocks.blockedId] });

    // Blocking severs the relationship in both directions: follows, pending
    // requests, their inbox rows, and any feed items fanned out either way.
    await Promise.all([
      severFollowEdge(user.id, parsed.userId),
      severFollowEdge(parsed.userId, user.id),
    ]);
    await db
      .delete(followRequests)
      .where(
        or(
          and(eq(followRequests.requesterId, user.id), eq(followRequests.targetId, parsed.userId)),
          and(eq(followRequests.requesterId, parsed.userId), eq(followRequests.targetId, user.id)),
        ),
      );
    await Promise.all([
      removeFollowRequestNotification(user.id, parsed.userId),
      removeFollowRequestNotification(parsed.userId, user.id),
    ]);
    await Promise.all([
      db
        .delete(feedItems)
        .where(and(eq(feedItems.ownerId, user.id), eq(feedItems.actorId, parsed.userId))),
      db
        .delete(feedItems)
        .where(and(eq(feedItems.ownerId, parsed.userId), eq(feedItems.actorId, user.id))),
    ]);

    return { success: true };
  },
  "blocks:unblock": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ userId: z.string().min(1) }).parse(args ?? {});
    await db
      .delete(blocks)
      .where(and(eq(blocks.blockerId, user.id), eq(blocks.blockedId, parsed.userId)));
    return { success: true };
  },
  "users:updatePrivacy": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const visibilityValue = z.enum([...PROFILE_VISIBILITY_VALUES, "following"]);
    const parsed = z
      .object({
        isPrivate: z.boolean().optional(),
        profileVisibility: z
          .object({
            favorites: visibilityValue.optional(),
            currentlyWatching: visibilityValue.optional(),
            watchlist: visibilityValue.optional(),
          })
          .optional(),
      })
      .parse(args ?? {});

    const nextVisibility = parsed.profileVisibility
      ? resolveProfileVisibility({
          ...(user.profileVisibility ?? {}),
          ...parsed.profileVisibility,
        })
      : user.profileVisibility;

    await db
      .update(users)
      .set({
        isPrivate: parsed.isPrivate ?? user.isPrivate,
        profileVisibility: nextVisibility,
        lastSeenAt: Date.now(),
      })
      .where(eq(users.id, user.id));

    // Switching to public approves everyone who was waiting, matching what
    // users expect from other social apps.
    if (parsed.isPrivate === false && user.isPrivate) {
      const pending = await db
        .select({ requesterId: followRequests.requesterId })
        .from(followRequests)
        .where(eq(followRequests.targetId, user.id));
      for (const request of pending) {
        await acceptFollowRequestEdge(user, request.requesterId);
      }
    }

    const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    return rows[0] ? toClientUser(rows[0]) : null;
  },
  "likes:toggle": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = targetArgs.parse(args ?? {});
    const existing = await db
      .select()
      .from(likes)
      .where(and(eq(likes.userId, user.id), eq(likes.targetType, parsed.targetType), eq(likes.targetId, parsed.targetId)))
      .limit(1);
    if (existing[0]) {
      await db.delete(likes).where(eq(likes.id, existing[0].id));
      return false;
    }
    await assertTargetOwnerNotBlocked(user.id, parsed.targetType, parsed.targetId);
    const id = createId("like");
    await db.insert(likes).values({ id, userId: user.id, targetType: parsed.targetType, targetId: parsed.targetId, createdAt: Date.now() });
    await notifyLike(user, parsed.targetType, parsed.targetId);
    return true;
  },
  "comments:add": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = targetArgs.extend({ text: z.string().min(1) }).parse(args ?? {});
    await assertTargetOwnerNotBlocked(user.id, parsed.targetType, parsed.targetId);
    const id = createId("comment");
    await db.insert(comments).values({ id, authorId: user.id, targetType: parsed.targetType, targetId: parsed.targetId, text: parsed.text, createdAt: Date.now() });
    await notifyComment(user, parsed.targetType, parsed.targetId, id, parsed.text);
    const rows = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
    return rows[0] ? { comment: toDoc(rows[0]), author: toClientUser(user) } : null;
  },
  "comments:deleteComment": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const commentId = z.object({ commentId: z.string() }).parse(args ?? {}).commentId;
    const rows = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);
    if (rows[0] && (rows[0].authorId === user.id || user.isAdmin)) {
      await db.delete(comments).where(eq(comments.id, commentId));
    }
    return { success: true };
  },
  "watchStates:setStatus": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ showId: z.string(), status: z.enum(["watchlist", "watching", "completed", "dropped"]) }).parse(args ?? {});
    const existing = await db.select().from(watchStates).where(and(eq(watchStates.userId, user.id), eq(watchStates.showId, parsed.showId))).limit(1);
    const now = Date.now();
    if (existing[0]) {
      await db.update(watchStates).set({ status: parsed.status, updatedAt: now }).where(eq(watchStates.id, existing[0].id));
      return existing[0].id;
    }
    const id = createId("state");
    await db.insert(watchStates).values({ id, userId: user.id, showId: parsed.showId, status: parsed.status, updatedAt: now });
    return id;
  },
  "watchStates:removeStatus": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const showId = z.object({ showId: z.string() }).parse(args ?? {}).showId;
    await db.delete(watchStates).where(and(eq(watchStates.userId, user.id), eq(watchStates.showId, showId)));
    return { success: true };
  },
  "watchLogs:deleteLog": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const logId = z.object({ logId: z.string() }).parse(args ?? {}).logId;
    await db.delete(watchLogs).where(and(eq(watchLogs.id, logId), eq(watchLogs.userId, user.id)));
    await db.delete(feedItems).where(and(eq(feedItems.type, "log"), eq(feedItems.targetId, logId)));
    return { success: true };
  },
  "reviews:create": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({
      showId: z.string(),
      rating: z.number(),
      reviewText: z.string().optional(),
      spoiler: z.boolean().optional(),
      seasonNumber: z.number().optional(),
      episodeNumber: z.number().optional(),
      episodeTitle: z.string().optional(),
    }).parse(args ?? {});
    const id = createId("review");
    const now = Date.now();
    await db.insert(reviews).values({
      id,
      authorId: user.id,
      showId: parsed.showId,
      rating: parsed.rating,
      reviewText: parsed.reviewText ?? null,
      spoiler: parsed.spoiler ?? false,
      seasonNumber: parsed.seasonNumber ?? null,
      episodeNumber: parsed.episodeNumber ?? null,
      episodeTitle: parsed.episodeTitle ?? null,
      createdAt: now,
      updatedAt: now,
    });
    await addFeedForFollowers(user.id, "review", id, parsed.showId, now);
    return id;
  },
  "reviews:rateEpisode": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ showId: z.string(), seasonNumber: z.number(), episodeNumber: z.number(), episodeTitle: z.string().optional(), rating: z.number() }).parse(args ?? {});
    const existing = await db.select().from(reviews).where(and(eq(reviews.authorId, user.id), eq(reviews.showId, parsed.showId), eq(reviews.seasonNumber, parsed.seasonNumber), eq(reviews.episodeNumber, parsed.episodeNumber))).limit(1);
    const now = Date.now();
    if (existing[0]) {
      await db.update(reviews).set({ rating: parsed.rating, episodeTitle: parsed.episodeTitle ?? existing[0].episodeTitle, updatedAt: now }).where(eq(reviews.id, existing[0].id));
      return existing[0].id;
    }
    const id = createId("review");
    await db.insert(reviews).values({ id, authorId: user.id, showId: parsed.showId, rating: parsed.rating, reviewText: null, spoiler: false, seasonNumber: parsed.seasonNumber, episodeNumber: parsed.episodeNumber, episodeTitle: parsed.episodeTitle ?? null, createdAt: now, updatedAt: now });
    return id;
  },
  "reviews:removeEpisodeRating": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ showId: z.string(), seasonNumber: z.number(), episodeNumber: z.number() }).parse(args ?? {});
    await db.delete(reviews).where(and(eq(reviews.authorId, user.id), eq(reviews.showId, parsed.showId), eq(reviews.seasonNumber, parsed.seasonNumber), eq(reviews.episodeNumber, parsed.episodeNumber)));
    return { success: true };
  },
  "reviews:deleteReview": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const reviewId = z.object({ reviewId: z.string() }).parse(args ?? {}).reviewId;
    await db.delete(reviews).where(and(eq(reviews.id, reviewId), eq(reviews.authorId, user.id)));
    await db.delete(feedItems).where(and(eq(feedItems.type, "review"), eq(feedItems.targetId, reviewId)));
    return { success: true };
  },
  "lists:create": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ title: z.string().min(1), description: z.string().optional(), isPublic: z.boolean().optional() }).parse(args ?? {});
    const id = createId("list");
    const now = Date.now();
    await db.insert(lists).values({ id, ownerId: user.id, title: parsed.title, description: parsed.description ?? null, isPublic: parsed.isPublic ?? true, coverUrl: null, createdAt: now, updatedAt: now });
    return id;
  },
  "lists:deleteList": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const listId = z.object({ listId: z.string() }).parse(args ?? {}).listId;
    await db.delete(listItems).where(eq(listItems.listId, listId));
    await db.delete(lists).where(and(eq(lists.id, listId), eq(lists.ownerId, user.id)));
    return { success: true };
  },
  "listItems:toggle": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ listId: z.string(), showId: z.string() }).parse(args ?? {});
    const listRows = await db.select().from(lists).where(and(eq(lists.id, parsed.listId), eq(lists.ownerId, user.id))).limit(1);
    if (!listRows[0]) throw new ApiError(404, "list_not_found", "List not found");
    const existing = await db.select().from(listItems).where(and(eq(listItems.listId, parsed.listId), eq(listItems.showId, parsed.showId))).limit(1);
    if (existing[0]) {
      await db.delete(listItems).where(eq(listItems.id, existing[0].id));
      return false;
    }
    const rows = await db.select().from(listItems).where(eq(listItems.listId, parsed.listId));
    const id = createId("listitem");
    await db.insert(listItems).values({ id, listId: parsed.listId, showId: parsed.showId, position: rows.length + 1, addedAt: Date.now() });
    return true;
  },
  "listItems:reorder": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ listId: z.string(), orderedIds: z.array(z.string()).optional(), itemIds: z.array(z.string()).optional() }).parse(args ?? {});
    const listRows = await db.select().from(lists).where(and(eq(lists.id, parsed.listId), eq(lists.ownerId, user.id))).limit(1);
    if (!listRows[0]) throw new ApiError(404, "list_not_found", "List not found");
    const ids = parsed.orderedIds ?? parsed.itemIds ?? [];
    await Promise.all(ids.map((id, index) => db.update(listItems).set({ position: index + 1 }).where(eq(listItems.id, id))));
    return { success: true };
  },
  "episodeProgress:toggleEpisode": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ showId: z.string(), seasonNumber: z.number(), episodeNumber: z.number(), episodeTitle: z.string().optional(), createLog: z.boolean().optional() }).parse(args ?? {});
    const now = Date.now();
    const existing = await db.select().from(episodeProgress).where(and(eq(episodeProgress.userId, user.id), eq(episodeProgress.showId, parsed.showId), eq(episodeProgress.seasonNumber, parsed.seasonNumber), eq(episodeProgress.episodeNumber, parsed.episodeNumber))).limit(1);
    if (existing[0]) {
      await db.delete(episodeProgress).where(eq(episodeProgress.id, existing[0].id));
      await syncWatchStateAfterEpisodeChange(user.id, parsed.showId, now);
      return false;
    }
    await assertEpisodeExistsForMark(parsed.showId, parsed.seasonNumber, parsed.episodeNumber);
    const created = await insertEpisodeProgressOnce({
      userId: user.id,
      showId: parsed.showId,
      seasonNumber: parsed.seasonNumber,
      episodeNumber: parsed.episodeNumber,
      watchedAt: now,
    });
    if (parsed.createLog && created) {
      const logId = createId("log");
      await db.insert(watchLogs).values({ id: logId, userId: user.id, showId: parsed.showId, watchedAt: now, note: null, seasonNumber: parsed.seasonNumber, episodeNumber: parsed.episodeNumber, episodeTitle: parsed.episodeTitle ?? null });
      await addFeedForFollowers(user.id, "log", logId, parsed.showId, now);
    }
    await syncWatchStateAfterEpisodeChange(user.id, parsed.showId, now);
    return true;
  },
  "episodeProgress:markEpisodeWatched": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ showId: z.string(), seasonNumber: z.number(), episodeNumber: z.number(), episodeTitle: z.string().optional(), createLog: z.boolean().optional() }).parse(args ?? {});
    const now = Date.now();
    await assertEpisodeExistsForMark(parsed.showId, parsed.seasonNumber, parsed.episodeNumber);
    const created = await insertEpisodeProgressOnce({
      userId: user.id,
      showId: parsed.showId,
      seasonNumber: parsed.seasonNumber,
      episodeNumber: parsed.episodeNumber,
      watchedAt: now,
    });
    if (parsed.createLog && created) {
      const logId = createId("log");
      await db.insert(watchLogs).values({ id: logId, userId: user.id, showId: parsed.showId, watchedAt: now, note: null, seasonNumber: parsed.seasonNumber, episodeNumber: parsed.episodeNumber, episodeTitle: parsed.episodeTitle ?? null });
      await addFeedForFollowers(user.id, "log", logId, parsed.showId, now);
    }
    await syncWatchStateAfterEpisodeChange(user.id, parsed.showId, now);
    return true;
  },
  "episodeProgress:markSeasonWatched": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ showId: z.string(), seasonNumber: z.number(), episodes: z.array(z.object({ episodeNumber: z.number(), title: z.string().optional() })), createLog: z.boolean().optional() }).parse(args ?? {});
    const now = Date.now();
    // Bulk marks silently skip episodes the metadata can't confirm rather
    // than failing the whole season.
    const seasonSummaries = await readShowSeasonSummaries(parsed.showId);
    const markableEpisodes = seasonSummaries
      ? parsed.episodes.filter((episode) =>
          isEpisodeVerified(
            { seasonNumber: parsed.seasonNumber, episodeNumber: episode.episodeNumber },
            seasonSummaries,
          ),
        )
      : parsed.episodes;
    for (const episode of markableEpisodes) {
      await insertEpisodeProgressOnce({
        userId: user.id,
        showId: parsed.showId,
        seasonNumber: parsed.seasonNumber,
        episodeNumber: episode.episodeNumber,
        watchedAt: now,
      });
    }
    await syncWatchStateAfterEpisodeChange(user.id, parsed.showId, now);
    return { success: true };
  },
  "episodeProgress:unmarkSeasonWatched": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ showId: z.string(), seasonNumber: z.number() }).parse(args ?? {});
    const now = Date.now();
    await db.delete(episodeProgress).where(and(eq(episodeProgress.userId, user.id), eq(episodeProgress.showId, parsed.showId), eq(episodeProgress.seasonNumber, parsed.seasonNumber)));
    await syncWatchStateAfterEpisodeChange(user.id, parsed.showId, now);
    return { success: true };
  },
  "reports:create": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z
      .object({
        targetType: z.enum(["review", "log", "list", "user"]),
        targetId: z.string().min(1),
        reason: z.string().optional(),
      })
      .parse(args ?? {});
    const id = createId("report");
    await db.insert(reports).values({ id, reporterId: user.id, targetType: parsed.targetType, targetId: parsed.targetId, reason: parsed.reason ?? null, createdAt: Date.now(), status: "open", resolvedAt: null, resolvedBy: null, action: null });
    return id;
  },
  "reports:resolve": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    if (!user.isAdmin) throw new ApiError(403, "forbidden", "Admin access required");
    const parsed = z.object({ reportId: z.string(), action: z.enum(["dismiss", "delete"]) }).parse(args ?? {});
    await db.update(reports).set({ status: "resolved", resolvedAt: Date.now(), resolvedBy: user.id, action: parsed.action }).where(eq(reports.id, parsed.reportId));
    return { success: true };
  },
  "notifications:registerPushToken": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z
      .object({
        token: z.string().min(1).max(200),
        platform: z.enum(pushPlatformValues),
        timezone: z.string().max(64).optional(),
      })
      .parse(args ?? {});
    if (!/^Expo(nent)?PushToken\[.+\]$/.test(parsed.token)) {
      throw new ApiError(400, "invalid_push_token", "Not a valid Expo push token");
    }
    const now = Date.now();
    // A device that signs into another account moves its token row over so
    // pushes never reach the previous user.
    await db
      .insert(pushTokens)
      .values({
        id: createId("pushtoken"),
        userId: user.id,
        token: parsed.token,
        platform: parsed.platform,
        timezone: parsed.timezone ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [pushTokens.token],
        set: {
          userId: user.id,
          platform: parsed.platform,
          timezone: parsed.timezone ?? null,
          updatedAt: now,
        },
      });
    return { success: true };
  },
  "notifications:unregisterPushToken": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ token: z.string().min(1).max(200) }).parse(args ?? {});
    await db
      .delete(pushTokens)
      .where(and(eq(pushTokens.token, parsed.token), eq(pushTokens.userId, user.id)));
    return { success: true };
  },
  "notifications:markRead": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ notificationId: z.string().min(1) }).parse(args ?? {});
    await db
      .update(notifications)
      .set({ readAt: Date.now() })
      .where(
        and(
          eq(notifications.id, parsed.notificationId),
          eq(notifications.userId, user.id),
          isNull(notifications.readAt),
        ),
      );
    return { success: true };
  },
  "notifications:markAllRead": async ({ req }) => {
    const user = await requireAuthUser(req);
    await db
      .update(notifications)
      .set({ readAt: Date.now() })
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
    return { success: true };
  },
  "notifications:updatePreferences": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    // Unknown keys are ignored by the merge, so a loose record is safe here.
    const parsed = z
      .object({
        preferences: z.record(z.string(), z.boolean()),
      })
      .parse(args ?? {});
    const merged = mergeNotificationPreferences(user.notificationPreferences, parsed.preferences);
    await db.update(users).set({ notificationPreferences: merged }).where(eq(users.id, user.id));
    return resolveNotificationPreferences(merged);
  },
};

export const actionHandlers: Record<string, RpcHandler> = {
  "phone:startVerification": async ({ args, req }) => {
    const parsed = z.object({ phone: z.string() }).parse(args ?? {});
    const normalizedPhone = normalizePhoneNumber(parsed.phone);
    if (!normalizedPhone) {
      throw new ApiError(400, "invalid_phone", "Enter a valid phone number");
    }
    if (matchesAppReviewBypass(normalizedPhone)) {
      return { ok: true, phone: normalizedPhone };
    }
    await enforceRateLimit(rateLimitKey("phone-verification", normalizedPhone), 5, 10 * 60 * 1000);
    await enforceRateLimit(clientRateLimitKey(req, "phone-verification-ip"), 20, 10 * 60 * 1000);
    await sendPhoneVerificationCode(normalizedPhone);
    const now = Date.now();
    await db.insert(phoneVerificationRequests).values({
      id: createId("verifyreq"),
      phoneHash: hashPhoneNumber(normalizedPhone),
      requestedAt: now,
      expiresAt: now + 10 * 60 * 1000,
      completedAt: null,
    });
    return { ok: true, phone: normalizedPhone };
  },
  "contacts:syncSnapshot": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = syncContactsArgs.parse(args ?? {});

    await enforceRateLimit(rateLimitKey("contacts-sync", user.id), 6, 10 * 60 * 1000);

    const deduped = new Map<
      string,
      { sourceRecordId?: string; displayName: string; contactHash: string }
    >();
    for (const entry of parsed.entries.slice(0, 2000)) {
      const normalizedPhone = normalizePhoneNumber(entry.phone);
      if (!normalizedPhone) {
        continue;
      }

      const contactHash = hashPhoneNumber(normalizedPhone);
      if (!deduped.has(contactHash)) {
        deduped.set(contactHash, {
          sourceRecordId: entry.sourceRecordId,
          displayName: entry.displayName?.trim() || "Unknown contact",
          contactHash,
        });
      }
    }

    const uniqueEntries = Array.from(deduped.values());
    const hashes = uniqueEntries.map((entry) => entry.contactHash);
    const matchedUsers =
      hashes.length > 0
        ? (
            await Promise.all(
              chunkForSqlParams(hashes, 1).map((chunk) =>
                db.select().from(users).where(inArray(users.phoneHash, chunk)),
              ),
            )
          ).flat()
        : [];
    const matchByHash = new Map(
      matchedUsers
        .filter((candidate) => Boolean(candidate.phoneHash))
        .map((candidate) => [candidate.phoneHash as string, candidate.id]),
    );

    const nextEntries = uniqueEntries.map((entry) => ({
      ...entry,
      matchedUserId:
        matchByHash.get(entry.contactHash) === user.id
          ? undefined
          : matchByHash.get(entry.contactHash),
    }));
    const snapshot = await setContactSnapshot(user.id, nextEntries);

    return {
      totalCount: nextEntries.length,
      matchedCount: nextEntries.filter((entry) => entry.matchedUserId).length,
      inviteCount: snapshot.inviteReadyCount,
      invitedCount: snapshot.invitedCount,
      syncedAt: Date.now(),
    };
  },
  "shows:searchCatalog": async ({ args }) => {
    const parsed = z.object({ text: z.string(), limit: z.number().optional() }).parse(args ?? {});
    return await searchCatalog(parsed.text, Math.min(parsed.limit ?? 20, 50));
  },
  "shows:getTmdbList": async ({ args }) => {
    const parsed = z.object({ category: z.string(), limit: z.number().optional(), page: z.number().optional() }).parse(args ?? {});
    return await getTmdbList(parsed.category, Math.min(parsed.limit ?? 20, 50), parsed.page ?? 1);
  },
  "shows:getHomeCatalog": async () => {
    return await getHomeCatalog();
  },
  "shows:ingestFromCatalog": async ({ args }) => {
    const show = await upsertShowFromCatalog(args ?? {});
    return show.id;
  },
  "shows:getExtendedDetails": async ({ args }) => {
    const showId = z.object({ showId: z.string() }).parse(args ?? {}).showId;
    const showRows = await db.select().from(shows).where(eq(shows.id, showId)).limit(1);
    const show = showRows[0];
    if (!show) return null;
    const cached = await db.select().from(tmdbDetailsCache).where(and(eq(tmdbDetailsCache.externalSource, show.externalSource), eq(tmdbDetailsCache.externalId, show.externalId))).limit(1);
    if (cached[0] && cached[0].expiresAt > Date.now()) {
      return normalizeTmdbShowDetails(cached[0].payload);
    }
    if (show.externalSource !== "tmdb") {
      return null;
    }
    const payload = normalizeTmdbShowDetails(
      await tmdb(`/tv/${show.externalId}`, { append_to_response: "credits,videos,watch/providers,similar,recommendations,external_ids" }),
    );
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000;
    const fetchedImdbId = readImdbIdFromDetailsPayload(payload);
    if (show.imdbId == null && fetchedImdbId) {
      await db
        .update(shows)
        .set({ imdbId: fetchedImdbId, updatedAt: now })
        .where(eq(shows.id, show.id));
    }
    const storedBackdropUrl =
      typeof show.backdropUrl === "string" && show.backdropUrl.includes("/original/")
        ? null
        : show.backdropUrl;
    if ((!storedBackdropUrl && payload?.backdropPath) || (!show.posterUrl && payload?.posterPath)) {
      await db
        .update(shows)
        .set({
          backdropUrl: storedBackdropUrl ?? payload.backdropPath ?? null,
          posterUrl: show.posterUrl ?? payload.posterPath ?? null,
          updatedAt: now,
        })
        .where(eq(shows.id, show.id));
    }
    if (cached[0]) {
      await db.update(tmdbDetailsCache).set({ payload, fetchedAt: now, expiresAt }).where(eq(tmdbDetailsCache.id, cached[0].id));
    } else {
      await db.insert(tmdbDetailsCache).values({ id: createId("tmdbdetails"), externalSource: show.externalSource, externalId: show.externalId, payload, fetchedAt: now, expiresAt });
    }
    return payload;
  },
  "shows:getSeasonDetails": async ({ args }) => {
    const parsed = z.object({ showId: z.string(), seasonNumber: z.number() }).parse(args ?? {});
    const showRows = await db.select().from(shows).where(eq(shows.id, parsed.showId)).limit(1);
    const show = showRows[0];
    if (!show || show.externalSource !== "tmdb") return null;
    const payload = normalizeTmdbSeasonDetails(
      await tmdb(`/tv/${show.externalId}/season/${parsed.seasonNumber}`),
    );
    // Write-through: keep the up-next season cache warm from the episode
    // guide so the continue rail has metadata without its own TMDB call.
    const slim = slimSeasonPayload(payload);
    if (slim) {
      await upsertSeasonCacheEntry(show.externalId, slim).catch(() => {});
    }
    return payload;
  },
  "shows:getImdbRatings": async ({ args }) => {
    const parsed = z
      .object({ showId: z.string(), seasonNumbers: z.array(z.number()).optional() })
      .parse(args ?? {});
    // Without an OMDb key the feature is off; skip the external-ids lookup too.
    if (!process.env.OMDB_API_KEY) return null;
    const showRows = await db.select().from(shows).where(eq(shows.id, parsed.showId)).limit(1);
    const show = showRows[0];
    if (!show) return null;
    const imdbId = await ensureShowImdbId(show);
    if (!imdbId) return null;
    return await getImdbRatings(imdbId, parsed.seasonNumbers ?? []);
  },
  "embeddings:saveViewerTastePreferences": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ favoriteShowIds: z.array(z.string()), favoriteThemes: z.array(z.string()) }).parse(args ?? {});
    const existing = await db.select().from(userTastePreferences).where(eq(userTastePreferences.userId, user.id)).limit(1);
    const now = Date.now();
    if (existing[0]) {
      await db.update(userTastePreferences).set({ favoriteShowIds: parsed.favoriteShowIds, favoriteThemes: parsed.favoriteThemes, updatedAt: now }).where(eq(userTastePreferences.id, existing[0].id));
      return existing[0].id;
    }
    const id = createId("tastepref");
    await db.insert(userTastePreferences).values({ id, userId: user.id, favoriteShowIds: parsed.favoriteShowIds, favoriteThemes: parsed.favoriteThemes, createdAt: now, updatedAt: now });
    return id;
  },
  "embeddings:getPersonalizedRecommendations": async ({ args, req }) => {
    const parsed = optionalLimitArgs.parse(args ?? {});
    const limit = Math.min(parsed.limit ?? 10, 50);
    const user = await getOptionalAuthUser(req);
    const profile = await buildHomeTasteProfile(user?.id);
    const candidateLimit = Math.max(limit * 8, 80);
    const [popularRows, freshRows, risingNow, breakoutPremieres, criticsChoice] = await Promise.all([
      db
        .select()
        .from(shows)
        .orderBy(desc(shows.tmdbPopularity), desc(shows.tmdbVoteCount), desc(shows.updatedAt))
        .limit(candidateLimit),
      db
        .select()
        .from(shows)
        .orderBy(desc(shows.updatedAt), desc(shows.tmdbVoteAverage), desc(shows.tmdbVoteCount))
        .limit(Math.min(candidateLimit, 120)),
      getTmdbList("rising_now", 24, 1).catch(() => []),
      getTmdbList("breakout_premieres", 24, 1).catch(() => []),
      getTmdbList("critics_choice", 24, 1).catch(() => []),
    ]);
    const ranked = rankHomeShows(
      [
        ...risingNow,
        ...breakoutPremieres,
        ...criticsChoice,
        ...freshRows.map(showToDoc).filter(Boolean),
        ...popularRows.map(showToDoc).filter(Boolean),
      ].filter(isCurrentHomeCandidate),
      {
        genreWeights: profile.genreWeights,
        seenKeys: profile.seenKeys,
        seedKeys: profile.seedKeys,
        diversityStrength: 0.23,
        preferFresh: true,
      },
    ).slice(0, limit);
    return ranked.map((show, index) => ({
      _id: show._id,
      show,
      rank: index + 1,
      score: show.homeScore,
      homeReasons: show.homeReasons,
    }));
  },
  "embeddings:getHomeRecommendationRails": async ({ args, req }) => {
    const parsed = z.object({ limitPerRail: z.number().optional() }).parse(args ?? {});
    const limit = Math.min(parsed.limitPerRail ?? 10, 20);
    const user = await getOptionalAuthUser(req);
    const profile = await buildHomeTasteProfile(user?.id);
    const [rows, risingNow, breakoutPremieres, criticsChoice] = await Promise.all([
      db
        .select()
        .from(shows)
        .orderBy(desc(shows.tmdbPopularity), desc(shows.tmdbVoteCount), desc(shows.updatedAt))
        .limit(Math.max(limit * 6, 80)),
      getTmdbList("rising_now", 20, 1).catch(() => []),
      getTmdbList("breakout_premieres", 20, 1).catch(() => []),
      getTmdbList("critics_choice", 20, 1).catch(() => []),
    ]);
    const ranked = rankHomeShows([
      ...risingNow,
      ...breakoutPremieres,
      ...criticsChoice,
      ...rows.map(showToDoc).filter(Boolean),
    ].filter(isCurrentHomeCandidate), {
      genreWeights: profile.genreWeights,
      seenKeys: profile.seenKeys,
      seedKeys: profile.seedKeys,
      diversityStrength: 0.22,
      preferFresh: true,
    }).slice(0, limit);
    return [
      {
        key: "for_you",
        title: "Picked for you",
        items: ranked.map((show, index) => ({
          _id: show._id,
          show,
          rank: index + 1,
          score: show.homeScore,
          homeReasons: show.homeReasons,
        })),
      },
    ];
  },
  "embeddings:getSimilarTasteUsers": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = optionalLimitArgs.parse(args ?? {});
    return await getSimilarTasteUserPreviews(user.id, Math.min(parsed.limit ?? 10, 30));
  },
  "embeddings:getListsFromSimilarTasteUsers": async ({ args }) => {
    const parsed = optionalLimitArgs.parse(args ?? {});
    const rows = await db.select().from(lists).where(eq(lists.isPublic, true)).orderBy(desc(lists.updatedAt)).limit(Math.min(parsed.limit ?? 10, 30));
    const ownerIds = Array.from(new Set(rows.map((list) => list.ownerId)));
    const ownerRows = ownerIds.length
      ? await db.select().from(users).where(inArray(users.id, ownerIds))
      : [];
    const ownersById = new Map(ownerRows.map((owner) => [owner.id, toClientUser(owner)]));

    return rows.map((list) => {
      const owner = ownersById.get(list.ownerId) ?? null;
      return {
        ...listToDoc(list),
        owner,
        ownerName: owner?.displayName ?? owner?.name ?? owner?.username ?? null,
      };
    });
  },
  "embeddings:getSmartLists": async ({ args }) => {
    const parsed = z.object({ limitPerList: z.number().optional() }).parse(args ?? {});
    const limit = Math.min(parsed.limitPerList ?? 10, 20);
    const rows = await db
      .select()
      .from(shows)
      .orderBy(desc(shows.tmdbPopularity), desc(shows.tmdbVoteCount), desc(shows.updatedAt))
      .limit(Math.max(limit * 6, 80));
    return [
      {
        key: "quality_trending",
        title: "Relevant right now",
        items: rankHomeShows(rows.map(showToDoc).filter(Boolean), {
          diversityStrength: 0.2,
        }).slice(0, limit),
      },
    ];
  },
  "embeddings:getSimilarShows": async ({ args }) => {
    const parsed = z.object({ showId: z.string(), limit: z.number().optional() }).parse(args ?? {});
    const limit = Math.min(parsed.limit ?? 10, 20);
    const sourceRows = await db.select().from(shows).where(eq(shows.id, parsed.showId)).limit(1);
    const source = sourceRows[0];
    if (!source || source.externalSource !== "tmdb") {
      return [];
    }

    const cachedRows = await db
      .select()
      .from(tmdbDetailsCache)
      .where(
        and(
          eq(tmdbDetailsCache.externalSource, "tmdb"),
          eq(tmdbDetailsCache.externalId, source.externalId),
        ),
      )
      .limit(1);
    const cachedPayload = cachedRows[0]?.payload as any;
    const sourceGenres: Array<{ id: number; name: string }> = Array.isArray(cachedPayload?.genres)
      ? cachedPayload.genres
      : [];

    let candidates: any[] = Array.isArray(cachedPayload?.recommendations?.results)
      ? cachedPayload.recommendations.results
      : [];
    if (candidates.length === 0) {
      try {
        const fetched = await tmdb(`/tv/${source.externalId}/recommendations`);
        candidates = Array.isArray(fetched?.results) ? fetched.results : [];
      } catch {
        candidates = [];
      }
    }
    if (candidates.length === 0 && Array.isArray(cachedPayload?.similar?.results)) {
      candidates = cachedPayload.similar.results;
    }

    const seenExternalIds = new Set<string>([source.externalId]);
    const picks: any[] = [];
    for (const candidate of candidates) {
      const externalId = candidate?.id != null ? String(candidate.id) : "";
      if (!externalId || seenExternalIds.has(externalId) || !candidate?.poster_path) {
        continue;
      }
      seenExternalIds.add(externalId);
      picks.push(candidate);
      if (picks.length >= limit) {
        break;
      }
    }
    if (picks.length === 0) {
      return [];
    }

    const localRows = await db
      .select()
      .from(shows)
      .where(
        and(
          eq(shows.externalSource, "tmdb"),
          inArray(shows.externalId, picks.map((candidate) => String(candidate.id))),
        ),
      );
    const localByExternalId = new Map(localRows.map((row) => [row.externalId, row]));

    // Ingest recommendations that aren't local yet so every card navigates
    // directly to a show id instead of paying an ingest round-trip on tap.
    const missing = picks.filter((candidate) => !localByExternalId.has(String(candidate.id)));
    if (missing.length > 0) {
      try {
        await upsertShowsFromCatalogBatch(missing.map(catalogFromTmdb));
        const ingestedRows = await db
          .select()
          .from(shows)
          .where(
            and(
              eq(shows.externalSource, "tmdb"),
              inArray(shows.externalId, missing.map((candidate) => String(candidate.id))),
            ),
          );
        for (const row of ingestedRows) {
          localByExternalId.set(row.externalId, row);
        }
      } catch (error) {
        console.warn("[similar-shows] Failed to ingest recommended shows.", {
          showId: source.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return picks.map((candidate) => {
      const local = localByExternalId.get(String(candidate.id));
      const genreIds: number[] = Array.isArray(candidate.genre_ids) ? candidate.genre_ids : [];
      const sharedGenres = sourceGenres
        .filter((genre) => genreIds.includes(genre.id))
        .map((genre) => genre.name)
        .slice(0, 2);
      return {
        _id: local?.id ?? `tmdb:${candidate.id}`,
        showId: local?.id,
        externalId: String(candidate.id),
        title: candidate.name ?? candidate.original_name ?? "Untitled",
        posterUrl: local?.posterUrl ?? tmdbImageUrl(candidate.poster_path, "w500"),
        voteAverage:
          typeof candidate.vote_average === "number" && candidate.vote_average > 0
            ? candidate.vote_average
            : undefined,
        overview: candidate.overview ?? null,
        sharedGenres,
        show: showToDoc(local) ?? undefined,
      };
    });
  },
  "embeddings:getShowTasteSocialProof": async () => {
    return { matchingFriends: [], favoriteMatches: [], themeMatches: [] };
  },
  "embeddings:getProfileTasteExperience": async () => {
    return { topGenres: [], favoriteShows: [], tasteSummary: null };
  },
  "releaseCalendar:refreshForMe": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z
      .object({
        today: z.string().optional(),
        limit: z.number().int().positive().optional(),
      })
      .parse(args ?? {});
    return await refreshTrackedReleaseCalendarForUser(
      user.id,
      Math.min(parsed.limit ?? 25, RELEASE_CALENDAR_MAX_ITEMS),
      parsed.today,
    );
  },
};

export async function runRpcHandler(
  kind: "query" | "mutation" | "action",
  name: string,
  input: {
    args: unknown;
    req: IncomingMessage;
  },
) {
  const handlers =
    kind === "query"
      ? queryHandlers
      : kind === "mutation"
        ? mutationHandlers
        : actionHandlers;

  const handler = handlers[name];
  if (!handler) {
    throw new ApiError(501, "not_implemented", `${name} is not implemented in the SQL backend yet`);
  }

  return await handler({
    args: input.args,
    req: input.req,
  });
}

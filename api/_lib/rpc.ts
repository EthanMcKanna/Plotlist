import type { IncomingMessage } from "node:http";

import { and, asc, count, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { chunkForSqlParams, ilike, ilikeContains } from "./sql-dialect";
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
  listFollows,
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
  watchStatusValues,
} from "../../db/schema";
import { db } from "./db";
import { ApiError } from "./errors";
import { createId } from "./ids";
import { moderateText } from "./moderation";
import { ensurePhoneIdentity } from "./auth";
import { normalizePhoneNumber, hashPhoneNumber, matchesAppReviewBypass } from "./phone";
import { requireAuthUser, getOptionalAuthUser } from "./request-auth";
import { getStaleReleaseShowIds, refreshTrackedReleaseCalendarForUser } from "./release-refresh";
import { clientRateLimitKey, enforceRateLimit, rateLimitKey } from "./rate-limit";
import { buildPersonPreviews, normalizeSearchText, toClientUser } from "./social";
import {
  clearContactSync,
  getContactMatchedUserIds,
  getContactMatches,
  getContactStatus,
  getInviteCandidates,
  linkJoinedUserToContacts,
  markContactInvited,
  searchInviteCandidates,
  syncContactSnapshot,
} from "./contacts";
import { getUsersByIdsChunked } from "./user-lookup";
import { rankPeopleSearchResults } from "../../lib/peopleSearch";
import { sendPhoneVerificationCode, verifyPhoneVerificationCode } from "./twilio";
import { createUploadToken, getRequestOrigin } from "./uploads";
import {
  getFacetBrowse,
  getFacetPreviews,
  getFacetShows,
  getHomeRecommendationRailsV2,
  getPersonalizedRecommendationsV2,
  getProfileTasteExperienceV2,
  getShowFacets,
  getSimilarShowsV2,
  getSmartListsV2,
  vibeSearchShows,
} from "./recs-handlers";
import { computeTasteMatchPercent } from "./recs";
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
  getUserLocalDayContext,
  isDateOnlyString,
  RELEASE_CALENDAR_MAX_ITEMS,
  RELEASE_CALENDAR_PROVIDER_OPTIONS,
  type ReleaseCalendarShowSource,
} from "../../lib/releaseCalendar";
import { getReleaseAwareUpNextEpisode } from "../../lib/upNextReleaseMerge";
import {
  isContinueWatchingFutureRelease,
  rankContinueWatchingItems,
} from "../../lib/continueWatchingOrder";
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
  notifyListFollow,
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
import {
  computeShowProgressFacts,
  isWatchTierStatus,
  listReleasedEpisodes,
  readLastAiredEpisode,
  reconcileWatchStatus,
  resolveStatusAfterEpisodeChange,
  resolveWatchTier,
  type LegacyWatchStatus,
  type ShowProgressFacts,
  type WatchStatus,
} from "../../lib/watchStatusTransitions";

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

// Likes reach one level deeper than comments: individual comments are
// likeable, but comments can't be commented on via targetType (replies use
// parentId instead).
const likeTargetArgs = z.object({
  targetType: z.enum(["review", "log", "list", "comment"]),
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
  /** When the next episode aired (or airs), even if already in the past. */
  nextEpisodeAirDateTs?: number | null;
  sortTimestamp: number;
};

// Stale seasons refreshed inline per request. Generous now that the account
// is on Workers Paid (1000 subrequests/invocation); the fetches run in
// parallel so latency stays at one TMDB round-trip.
const MAX_INLINE_SEASON_FETCHES = 24;

// Fill next-episode metadata (name, still, overview, runtime, air date) from
// the season cache. Stale seasons are refreshed from TMDB in parallel;
// anything beyond the inline budget serves stale-if-available and heals on
// later calls.
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
    if (episode.airDate && isDateOnlyString(episode.airDate)) {
      // Recorded even for past dates: the Continue surface uses this to tell
      // a just-dropped episode from an old backlog.
      entry.nextEpisodeAirDateTs = getDateOnlyStartTimestamp(episode.airDate);
    }

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

// Where the user actually stands on a show, derived from their progress rows
// plus the cached TMDB details. Shows without usable metadata report
// releasedCount 0 so the state machine knows not to judge.
async function loadShowProgressFacts(
  userId: string,
  showId: string,
): Promise<ShowProgressFacts> {
  const fallback: ShowProgressFacts = {
    hasWatchedAny: false,
    hasReleasedAfterFrontier: false,
    isEnded: false,
    gapEpisodes: [],
    releasedCount: 0,
  };
  const showRows = await db.select().from(shows).where(eq(shows.id, showId)).limit(1);
  const show = showRows[0];
  if (!show || show.externalSource !== "tmdb") {
    return fallback;
  }
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
  return computeShowProgressFacts({
    watchedEpisodes: progressRows,
    seasons: readSeasonSummaries(payload),
    isEnded: isShowEnded(payload),
    lastAiredEpisode: readLastAiredEpisode(payload),
  });
}

async function upsertWatchStatus(
  userId: string,
  showId: string,
  status: WatchStatus,
  updatedAt: number,
) {
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

// After any episode-progress change, recompute the show's watch status via
// the shared state machine in lib/watchStatusTransitions: marking episodes
// resumes watchlist/paused/dropped/untracked shows into the watch tier, and
// the tier itself (watching / caught_up / finished) always re-resolves from
// the release frontier; unmarking re-resolves the tier but never resurrects
// watchlist/paused/dropped and never creates a status where none existed.
async function syncWatchStateAfterEpisodeChange(
  userId: string,
  showId: string,
  updatedAt: number,
  direction: "marked" | "unmarked",
) {
  const existingRows = await db
    .select()
    .from(watchStates)
    .where(and(eq(watchStates.userId, userId), eq(watchStates.showId, showId)))
    .limit(1);
  const currentStatus = (existingRows[0]?.status ?? null) as LegacyWatchStatus | null;

  let facts: ShowProgressFacts = {
    hasWatchedAny: direction === "marked",
    hasReleasedAfterFrontier: true,
    isEnded: false,
    gapEpisodes: [],
    releasedCount: 0,
  };
  try {
    facts = await loadShowProgressFacts(userId, showId);
    if (direction === "marked" && !facts.hasWatchedAny) {
      // The progress write can outrun replication of the read above; a mark
      // always implies at least one watched episode.
      facts = { ...facts, hasWatchedAny: true };
    }
  } catch {
    // Status refinement is best-effort; the progress write already succeeded.
  }

  const status = resolveStatusAfterEpisodeChange({
    direction,
    currentStatus,
    facts,
  });
  if (!status || status === currentStatus) {
    return;
  }

  await upsertWatchStatus(userId, showId, status, updatedAt);
}

// Marking a show finished (or catching up "to here") is a statement about a
// whole stretch of the show, so the server backfills every released-but-
// unwatched episode into progress and the diary in the same request. This
// used to live in the client, where it needed one season-details round trip
// per season and silently died on any failure — the reason completed shows
// kept showing up with no watched episodes, empty diaries, and missing watch
// stats. `upTo` caps the backfill at an episode (inclusive) for the
// "mark watched up to here" flow; omitted, it covers every released episode.
async function backfillReleasedEpisodes(
  userId: string,
  showId: string,
  now: number,
  upTo?: { seasonNumber: number; episodeNumber: number },
) {
  const showRows = await db.select().from(shows).where(eq(shows.id, showId)).limit(1);
  const show = showRows[0];
  if (!show || show.externalSource !== "tmdb") {
    return { marked: 0 };
  }
  const payload = await readShowDetailsPayloadForStatusChange(show);
  const seasons = readSeasonSummaries(payload);
  if (seasons.length === 0) {
    return { marked: 0 };
  }
  const released = listReleasedEpisodes({
    seasons,
    isEnded: isShowEnded(payload),
    lastAiredEpisode: readLastAiredEpisode(payload),
  }).filter(
    (episode) =>
      !upTo ||
      episode.seasonNumber < upTo.seasonNumber ||
      (episode.seasonNumber === upTo.seasonNumber &&
        episode.episodeNumber <= upTo.episodeNumber),
  );
  if (released.length === 0) {
    return { marked: 0 };
  }

  const existing = await db
    .select({
      seasonNumber: episodeProgress.seasonNumber,
      episodeNumber: episodeProgress.episodeNumber,
    })
    .from(episodeProgress)
    .where(and(eq(episodeProgress.userId, userId), eq(episodeProgress.showId, showId)));
  const watchedKeys = new Set(
    existing.map((row) => `${row.seasonNumber}:${row.episodeNumber}`),
  );
  const missing = released.filter(
    (episode) => !watchedKeys.has(`${episode.seasonNumber}:${episode.episodeNumber}`),
  );
  if (missing.length === 0) {
    return { marked: 0 };
  }

  // Episode titles come from whatever season cache is already warm; a cold
  // season just means null titles on the diary rows.
  const seasonNumbers = Array.from(new Set(missing.map((episode) => episode.seasonNumber)));
  const cachedSeasons = await readSeasonCacheEntries(
    seasonNumbers.map((seasonNumber) => ({ externalId: show.externalId, seasonNumber })),
  );
  const titleFor = (episode: { seasonNumber: number; episodeNumber: number }) =>
    findCachedSeasonEpisode(
      cachedSeasons.get(seasonCacheKey(show.externalId, episode.seasonNumber))?.payload,
      episode.episodeNumber,
    )?.name ?? null;

  for (const chunk of chunkForSqlParams(missing, 6, 80)) {
    await db
      .insert(episodeProgress)
      .values(
        chunk.map((episode) => ({
          id: createId("episode"),
          userId,
          showId,
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          watchedAt: now,
        })),
      )
      .onConflictDoNothing({
        target: [
          episodeProgress.userId,
          episodeProgress.showId,
          episodeProgress.seasonNumber,
          episodeProgress.episodeNumber,
        ],
      });
  }
  // Diary contract: the backfill logs each newly watched episode (so the log
  // page and stats register the completion) but never fans out to follower
  // feeds — one tap must not post hundreds of feed items.
  for (const chunk of chunkForSqlParams(missing, 8, 80)) {
    await db.insert(watchLogs).values(
      chunk.map((episode) => ({
        id: createId("log"),
        userId,
        showId,
        watchedAt: now,
        note: null,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        episodeTitle: titleFor(episode),
        createdAt: now,
      })),
    );
  }
  return { marked: missing.length };
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

// Diary contract: every deliberate "watched" action produces a watch log,
// and undoing the mark removes the log it created. Only note-less logs are
// auto-managed — once a user writes a note the log is their content and
// survives progress changes. Bulk (season) marks log without fanning out to
// follower feeds, so a 22-episode backfill doesn't post 22 feed items.
async function createEpisodeWatchLog(args: {
  userId: string;
  showId: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle?: string | null;
  watchedAt: number;
  fanOutToFeeds: boolean;
}) {
  const logId = createId("log");
  await db.insert(watchLogs).values({
    id: logId,
    userId: args.userId,
    showId: args.showId,
    watchedAt: args.watchedAt,
    note: null,
    seasonNumber: args.seasonNumber,
    episodeNumber: args.episodeNumber,
    episodeTitle: args.episodeTitle ?? null,
    createdAt: args.watchedAt,
  });
  if (args.fanOutToFeeds) {
    await addFeedForFollowers(args.userId, "log", logId, args.showId, args.watchedAt);
  }
  return logId;
}

// Only plain auto-created logs are subject to the diary contract's
// auto-delete. Anything the user invested in — a note, a per-viewing rating
// or reaction, a rewatch entry, a backdated/approximate date — is their
// history and must survive progress changes (unmark, re-mark, season
// unmark). This is what lets one episode keep three logged viewings.
function isAutoManagedWatchLogCondition() {
  return [
    isNull(watchLogs.note),
    isNull(watchLogs.rating),
    isNull(watchLogs.reaction),
    eq(watchLogs.isRewatch, false),
    eq(watchLogs.datePrecision, "exact"),
  ];
}

async function deletePlainEpisodeWatchLogs(args: {
  userId: string;
  showId: string;
  seasonNumber: number;
  episodeNumber?: number;
}) {
  const conditions = [
    eq(watchLogs.userId, args.userId),
    eq(watchLogs.showId, args.showId),
    eq(watchLogs.seasonNumber, args.seasonNumber),
    ...isAutoManagedWatchLogCondition(),
  ];
  if (typeof args.episodeNumber === "number") {
    conditions.push(eq(watchLogs.episodeNumber, args.episodeNumber));
  }
  const rows = await db
    .select({ id: watchLogs.id })
    .from(watchLogs)
    .where(and(...conditions));
  if (rows.length === 0) return;
  for (const chunk of chunkForSqlParams(rows.map((row) => row.id), 1, 80)) {
    await db.delete(watchLogs).where(inArray(watchLogs.id, chunk));
    await db
      .delete(feedItems)
      .where(and(eq(feedItems.type, "log"), inArray(feedItems.targetId, chunk)));
  }
}

const WATCH_LOG_DATE_PRECISIONS = ["exact", "day", "month", "year", "unknown"] as const;
type WatchLogDatePrecision = (typeof WATCH_LOG_DATE_PRECISIONS)[number];

const WATCHED_ON_SHAPES: Record<string, WatchLogDatePrecision> = {
  day: "day",
  month: "month",
  year: "year",
};

// Resolve a client-supplied viewing date into the stored triple:
//   watchedAt (ms sort key) + watchedOn (calendar text) + datePrecision.
// - exact: full timestamp, defaults to now, clamped out of the future
// - day/month/year: watchedOn like "2019-07-04" / "2019-07" / "2019";
//   watchedAt becomes UTC noon at the start of that period so ordering is
//   stable and no timezone can shift the displayed calendar date
// - unknown: the user can't place the viewing; watchedAt is just "now" so
//   the entry sorts where it was logged
function resolveWatchLogDate(
  input: { watchedAt?: number; watchedOn?: string | null; datePrecision?: WatchLogDatePrecision },
  now: number,
): { watchedAt: number; watchedOn: string | null; datePrecision: WatchLogDatePrecision } {
  const watchedOn = input.watchedOn?.trim() || null;

  let precision = input.datePrecision;
  if (!precision) {
    if (!watchedOn) {
      precision = "exact";
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(watchedOn)) {
      precision = "day";
    } else if (/^\d{4}-\d{2}$/.test(watchedOn)) {
      precision = "month";
    } else if (/^\d{4}$/.test(watchedOn)) {
      precision = "year";
    } else {
      throw new ApiError(400, "invalid_watched_on", "Use YYYY-MM-DD, YYYY-MM, or YYYY");
    }
  }

  if (precision === "exact" || precision === "unknown") {
    if (watchedOn) {
      throw new ApiError(400, "invalid_watched_on", `watchedOn doesn't apply to ${precision} dates`);
    }
    const watchedAt =
      precision === "exact" && typeof input.watchedAt === "number"
        ? Math.min(input.watchedAt, now)
        : now;
    return { watchedAt, watchedOn: null, datePrecision: precision };
  }

  if (!watchedOn) {
    throw new ApiError(400, "invalid_watched_on", `A ${precision} date needs watchedOn`);
  }
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(watchedOn);
  if (!match) {
    throw new ApiError(400, "invalid_watched_on", "Use YYYY-MM-DD, YYYY-MM, or YYYY");
  }
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : null;
  const day = match[3] ? Number(match[3]) : null;
  const shape = day != null ? "day" : month != null ? "month" : "year";
  if (WATCHED_ON_SHAPES[shape] !== precision) {
    throw new ApiError(400, "invalid_watched_on", `watchedOn "${watchedOn}" doesn't match ${precision} precision`);
  }
  if (year < 1900 || month === 0 || (month != null && month > 12)) {
    throw new ApiError(400, "invalid_watched_on", "That date is out of range");
  }
  const watchedAt = Date.UTC(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
  if (day != null) {
    // Reject impossible days (e.g. Feb 30) — Date.UTC would roll them over.
    const check = new Date(watchedAt);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month! - 1 || check.getUTCDate() !== day) {
      throw new ApiError(400, "invalid_watched_on", "That day doesn't exist");
    }
  }
  if (watchedAt > now) {
    throw new ApiError(400, "invalid_watched_on", "A viewing can't be in the future");
  }
  return { watchedAt, watchedOn, datePrecision: precision };
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
  // "Currently watching" spans the active tier: shows mid-backlog and shows
  // the user is caught up on both count as being watched.
  const statuses: string[] =
    status === "watching" ? ["watching", "caught_up"] : [status];
  const stateRows = await db
    .select()
    .from(watchStates)
    .where(
      and(
        eq(watchStates.userId, userId),
        inArray(watchStates.status, statuses as Array<typeof watchStates.$inferSelect.status>),
      ),
    )
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

  const watchCounts = new Map<string, number>(
    watchStateRows.map((row) => [row.status as string, Number(row.value ?? 0)] as const),
  );

  const caughtUp = watchCounts.get("caught_up") ?? 0;
  // Unmigrated legacy rows count toward finished until a read reconciles them.
  const finished = (watchCounts.get("finished") ?? 0) + (watchCounts.get("completed") ?? 0);
  return {
    reviews: Number(reviewCountRows[0]?.value ?? 0),
    lists: Number(listCountRows[0]?.value ?? 0),
    watchlist: watchCounts.get("watchlist") ?? 0,
    watching: watchCounts.get("watching") ?? 0,
    caughtUp,
    finished,
    paused: watchCounts.get("paused") ?? 0,
    // Old clients read "completed"; the closest equivalent is everything the
    // user has watched through (caught up or finished).
    completed: caughtUp + finished,
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
  const [
    isFollowingRows,
    followsViewerRows,
    pendingRequestRows,
    mutualRows,
    contactRows,
    mutualPreviewEdges,
  ] =
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
          db
            .select({ userId: follows.followerId })
            .from(follows)
            .innerJoin(
              viewerFollowsAlias,
              and(
                eq(viewerFollowsAlias.followeeId, follows.followerId),
                eq(viewerFollowsAlias.followerId, viewerId),
              ),
            )
            .where(eq(follows.followeeId, profileUser.id))
            .orderBy(desc(follows.createdAt))
            .limit(3),
        ])
      : [[], [], [], [], [], []];

  const isFollowing = isFollowingRows.length > 0;
  const profileFollowsViewer = followsViewerRows.length > 0;
  const hasPendingRequest = pendingRequestRows.length > 0;
  const mutualCount = Number(mutualRows[0]?.value ?? 0);
  const inContacts = contactRows.length > 0;

  // Mutuals are people the viewer follows, and blocking removes the follow
  // edge in both directions, so the preview needs no extra block filtering.
  const mutualPreviewUsers =
    mutualPreviewEdges.length > 0
      ? await getUsersByIdsChunked(mutualPreviewEdges.map((row) => row.userId))
      : [];
  const mutualUserById = new Map(mutualPreviewUsers.map((row) => [row.id, row] as const));
  const mutualPreview = mutualPreviewEdges
    .map((edge) => mutualUserById.get(edge.userId))
    .filter((row): row is typeof users.$inferSelect => Boolean(row))
    .map((row) => ({
      _id: row.id,
      displayName: row.displayName ?? row.name ?? null,
      username: row.username ?? null,
      avatarUrl: row.avatarUrl ?? row.image ?? null,
    }));

  const relationship = viewerId
    ? {
        inContacts,
        isFollowing,
        followsYou: profileFollowsViewer,
        isMutualFollow: isFollowing && profileFollowsViewer,
        mutualCount,
        mutualPreview,
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
      caughtUp: libraryCounts.caughtUp,
      finished: libraryCounts.finished,
      paused: libraryCounts.paused,
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

// Loads a list and applies the shared visibility rules: owners always see
// their lists; everyone else needs the list public AND the owner's profile
// visible to them (not blocked, private accounts require an approved follow).
async function getViewableList(listId: string, viewerId: string | null) {
  const rows = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
  const list = rows[0];
  if (!list) {
    return null;
  }
  if (viewerId && list.ownerId === viewerId) {
    return list;
  }
  if (!list.isPublic) {
    return null;
  }
  if (!(await getVisibleProfileAudience(viewerId, list.ownerId))) {
    return null;
  }
  return list;
}

// Attaches owner, follower/show counts, and the viewer's follow state to a
// page of lists with three batched queries instead of per-row lookups.
async function enrichListDocs(
  listRows: Array<typeof lists.$inferSelect>,
  viewerId: string | null,
) {
  if (listRows.length === 0) {
    return [];
  }
  const listIds = listRows.map((list) => list.id);
  const ownerIds = Array.from(new Set(listRows.map((list) => list.ownerId)));

  const [itemCounts, followerCounts, viewerFollowRows, ownerRows, previewRows] = await Promise.all([
    db
      .select({ listId: listItems.listId, total: count() })
      .from(listItems)
      .where(inArray(listItems.listId, listIds))
      .groupBy(listItems.listId),
    db
      .select({ listId: listFollows.listId, total: count() })
      .from(listFollows)
      .where(inArray(listFollows.listId, listIds))
      .groupBy(listFollows.listId),
    viewerId
      ? db
          .select({ listId: listFollows.listId })
          .from(listFollows)
          .where(and(eq(listFollows.userId, viewerId), inArray(listFollows.listId, listIds)))
      : Promise.resolve([] as Array<{ listId: string }>),
    db.select().from(users).where(inArray(users.id, ownerIds)),
    // Poster art for list preview cards: first few items per list in list
    // order (trimmed to 3 per list below).
    db
      .select({
        listId: listItems.listId,
        position: listItems.position,
        posterUrl: shows.posterUrl,
      })
      .from(listItems)
      .innerJoin(shows, eq(shows.id, listItems.showId))
      .where(inArray(listItems.listId, listIds))
      .orderBy(listItems.listId, listItems.position),
  ]);

  const itemCountByList = new Map(itemCounts.map((row) => [row.listId, Number(row.total)]));
  const followerCountByList = new Map(
    followerCounts.map((row) => [row.listId, Number(row.total)]),
  );
  const viewerFollowSet = new Set(viewerFollowRows.map((row) => row.listId));
  const ownersById = new Map(ownerRows.map((owner) => [owner.id, toClientUser(owner)]));
  const previewPostersByList = new Map<string, string[]>();
  for (const row of previewRows) {
    if (!row.posterUrl) continue;
    const posters = previewPostersByList.get(row.listId) ?? [];
    if (posters.length >= 3) continue;
    posters.push(row.posterUrl);
    previewPostersByList.set(row.listId, posters);
  }

  return listRows.map((list) => {
    const owner = ownersById.get(list.ownerId) ?? null;
    return {
      ...listToDoc(list),
      owner,
      ownerName: owner?.displayName ?? owner?.name ?? owner?.username ?? null,
      itemCount: itemCountByList.get(list.id) ?? 0,
      followerCount: followerCountByList.get(list.id) ?? 0,
      viewerIsFollowing: viewerFollowSet.has(list.id),
      isOwner: viewerId != null && list.ownerId === viewerId,
      previewPosters: previewPostersByList.get(list.id) ?? [],
    };
  });
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

const SHOW_CAST_LIMIT = 20;
const SHOW_CREW_LIMIT = 12;
// Header-worthy crew: the roles readers actually recognize on a show page.
const NOTABLE_CREW_JOBS = new Set([
  "Creator",
  "Director",
  "Writer",
  "Executive Producer",
  "Showrunner",
  "Composer",
  "Original Music Composer",
]);

// Top-billed cast for the show page rail, with click-through person ids and
// ready-to-render headshot URLs. Idempotent: cached payloads that were
// normalized before storage pass through unchanged.
export function normalizeTmdbCast(payload: any) {
  const raw = Array.isArray(payload?.cast)
    ? payload.cast
    : Array.isArray(payload?.credits?.cast)
      ? payload.credits.cast
      : [];
  return raw
    .filter((member: any) => member && member.id != null && member.name)
    .slice(0, SHOW_CAST_LIMIT)
    .map((member: any) => ({
      id: member.id,
      name: member.name,
      character: member.character ?? "",
      profilePath: member.profilePath ?? tmdbImageUrl(member.profile_path, "w185"),
    }));
}

// Notable crew deduped by person, with their jobs merged ("Director, Writer").
export function normalizeTmdbCrew(payload: any) {
  const raw = Array.isArray(payload?.crew)
    ? payload.crew
    : Array.isArray(payload?.credits?.crew)
      ? payload.credits.crew
      : [];
  const byPerson = new Map<number, any>();
  for (const member of raw) {
    if (!member || member.id == null || !member.name) continue;
    const alreadyNormalized = typeof member.job === "string" && member.profilePath !== undefined;
    if (!alreadyNormalized && !NOTABLE_CREW_JOBS.has(member.job)) continue;
    const existing = byPerson.get(member.id);
    if (existing) {
      if (member.job && !existing.job.includes(member.job)) {
        existing.job = `${existing.job}, ${member.job}`;
      }
      continue;
    }
    byPerson.set(member.id, {
      id: member.id,
      name: member.name,
      job: member.job ?? "",
      profilePath: member.profilePath ?? tmdbImageUrl(member.profile_path, "w185"),
    });
  }
  return Array.from(byPerson.values()).slice(0, SHOW_CREW_LIMIT);
}

export function normalizeTmdbShowDetails(payload: any) {
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
    cast: normalizeTmdbCast(payload),
    crew: normalizeTmdbCrew(payload),
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

// Fetch full TMDB details for a show and refresh the details cache (plus the
// imdb-id/artwork side channels that ride along with a fresh payload).
async function fetchAndCacheShowDetails(
  show: typeof shows.$inferSelect,
  cachedRow?: typeof tmdbDetailsCache.$inferSelect,
) {
  const payload = normalizeTmdbShowDetails(
    await tmdb(`/tv/${show.externalId}`, { append_to_response: "credits,videos,watch/providers,similar,recommendations,external_ids" }),
  );
  const now = Date.now();
  // Active shows churn (new episodes, next-episode pointers) so they expire
  // fast; ended shows barely change and can ride the cache for a week.
  const isActiveShow =
    payload?.in_production === true ||
    payload?.next_episode_to_air != null ||
    payload?.status === "Returning Series" ||
    payload?.status === "In Production";
  const expiresAt = now + (isActiveShow ? 12 : 7 * 24) * 60 * 60 * 1000;
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
  if (cachedRow) {
    await db.update(tmdbDetailsCache).set({ payload, fetchedAt: now, expiresAt }).where(eq(tmdbDetailsCache.id, cachedRow.id));
  } else {
    await db.insert(tmdbDetailsCache).values({ id: createId("tmdbdetails"), externalSource: show.externalSource, externalId: show.externalId, payload, fetchedAt: now, expiresAt });
  }
  return payload;
}

// TMDB person payloads ride the same details-cache table under their own
// source key so they never collide with show rows.
const PERSON_CACHE_SOURCE = "tmdb-person";
const PERSON_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function fetchPersonPayload(personId: number) {
  const externalId = String(personId);
  const cached = await db
    .select()
    .from(tmdbDetailsCache)
    .where(
      and(
        eq(tmdbDetailsCache.externalSource, PERSON_CACHE_SOURCE),
        eq(tmdbDetailsCache.externalId, externalId),
      ),
    )
    .limit(1);
  if (cached[0] && cached[0].expiresAt > Date.now()) {
    return cached[0].payload;
  }
  let payload: unknown;
  try {
    payload = await tmdb(`/person/${personId}`, { append_to_response: "tv_credits" });
  } catch (error) {
    // A stale filmography beats an error screen.
    if (cached[0]) return cached[0].payload;
    throw error;
  }
  const now = Date.now();
  const expiresAt = now + PERSON_CACHE_TTL_MS;
  if (cached[0]) {
    await db
      .update(tmdbDetailsCache)
      .set({ payload, fetchedAt: now, expiresAt })
      .where(eq(tmdbDetailsCache.id, cached[0].id));
  } else {
    await db.insert(tmdbDetailsCache).values({
      id: createId("tmdbdetails"),
      externalSource: PERSON_CACHE_SOURCE,
      externalId,
      payload,
      fetchedAt: now,
      expiresAt,
    });
  }
  return payload;
}

type PersonCreditAccumulator = {
  externalId: string;
  title: string;
  posterPath: string | null;
  firstAirDate: string | null;
  voteAverage: number | null;
  popularity: number;
  episodeCount: number;
  roles: string[];
};

// Collapse TMDB tv credits (one row per role) into one entry per show, then
// resolve each against the local catalog so the client can navigate directly.
export function mergeTvCredits(rawCredits: unknown): PersonCreditAccumulator[] {
  const credits = Array.isArray(rawCredits) ? rawCredits : [];
  const byShow = new Map<string, PersonCreditAccumulator>();
  for (const credit of credits) {
    if (!credit || credit.id == null) continue;
    const externalId = String(credit.id);
    const role =
      typeof credit.character === "string" && credit.character.length > 0
        ? credit.character
        : typeof credit.job === "string" && credit.job.length > 0
          ? credit.job
          : null;
    const existing = byShow.get(externalId);
    if (existing) {
      existing.episodeCount += credit.episode_count ?? 0;
      if (role && !existing.roles.includes(role)) {
        existing.roles.push(role);
      }
      continue;
    }
    byShow.set(externalId, {
      externalId,
      title: credit.name ?? credit.original_name ?? "Untitled",
      posterPath: tmdbImageUrl(credit.poster_path, "w342"),
      firstAirDate: credit.first_air_date ?? null,
      voteAverage: typeof credit.vote_average === "number" ? credit.vote_average : null,
      popularity: typeof credit.popularity === "number" ? credit.popularity : 0,
      episodeCount: credit.episode_count ?? 0,
      roles: role ? [role] : [],
    });
  }
  // Long-running roles first; popularity breaks ties among guest spots.
  return Array.from(byShow.values()).sort(
    (a, b) => b.episodeCount - a.episodeCount || b.popularity - a.popularity,
  );
}

async function resolvePersonCredits(merged: PersonCreditAccumulator[]) {
  const externalIds = merged.map((credit) => credit.externalId);
  const localRows: (typeof shows.$inferSelect)[] = [];
  for (const chunk of chunkForSqlParams(externalIds, 1)) {
    if (chunk.length === 0) continue;
    localRows.push(
      ...(await db
        .select()
        .from(shows)
        .where(and(eq(shows.externalSource, "tmdb"), inArray(shows.externalId, chunk)))),
    );
  }
  const localByExternalId = new Map(localRows.map((row) => [row.externalId, row]));
  return merged.map((credit) => {
    const local = localByExternalId.get(credit.externalId);
    return {
      showId: local?.id ?? null,
      externalId: credit.externalId,
      title: local?.title ?? credit.title,
      posterUrl: local?.posterUrl ?? credit.posterPath,
      year:
        local?.year ??
        (typeof credit.firstAirDate === "string" && credit.firstAirDate.length >= 4
          ? Number(credit.firstAirDate.slice(0, 4))
          : null),
      voteAverage: local?.tmdbVoteAverage ?? credit.voteAverage,
      episodeCount: credit.episodeCount,
      roles: credit.roles,
    };
  });
}

// Details payload for status changes: fresh cache wins, then a live fetch,
// then a stale cache row — a slightly old released-through pointer beats
// refusing to backfill at all.
async function readShowDetailsPayloadForStatusChange(show: typeof shows.$inferSelect) {
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
  if (cached[0] && cached[0].expiresAt > Date.now()) {
    return cached[0].payload;
  }
  try {
    return await fetchAndCacheShowDetails(show, cached[0]);
  } catch {
    return cached[0]?.payload ?? null;
  }
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

function catalogItemFromShowRow(show: typeof shows.$inferSelect) {
  return {
    externalSource: show.externalSource,
    externalId: show.externalId,
    title: show.title,
    year: show.year ?? undefined,
    posterUrl: show.posterUrl ?? undefined,
    backdropUrl: show.backdropUrl ?? undefined,
    overview: show.overview ?? undefined,
    genreIds: show.genreIds ?? undefined,
    originalLanguage: show.originalLanguage ?? undefined,
    originCountries: show.originCountries ?? undefined,
    tmdbPopularity: show.tmdbPopularity ?? undefined,
    tmdbVoteAverage: show.tmdbVoteAverage ?? undefined,
    tmdbVoteCount: show.tmdbVoteCount ?? undefined,
  };
}

function buildFtsMatchQuery(text: string): string | null {
  const tokens = normalizeSearchText(text).split(/\s+/).filter(Boolean).slice(0, 8);
  if (tokens.length === 0) {
    return null;
  }
  // Quote every token so user input can't hit FTS5 query syntax; the final
  // token prefix-matches so results appear while the user is still typing.
  return tokens
    .map((token, index) => (index === tokens.length - 1 ? `"${token}"*` : `"${token}"`))
    .join(" ");
}

// Full-text search over the bulk-ingested catalog: bm25 relevance blended
// with TMDB popularity so "the office" surfaces the show everyone means.
async function searchShowsLocal(text: string, limit: number) {
  const match = buildFtsMatchQuery(text);
  if (!match) {
    return [];
  }
  const ranked = (await db.all(sql`
    SELECT s.rowid AS row_id
    FROM shows_fts f
    JOIN shows s ON s.rowid = f.rowid
    WHERE shows_fts MATCH ${match}
    ORDER BY bm25(shows_fts, 8.0, 4.0, 2.0) - 1.6 * ln(1.0 + coalesce(s.tmdb_popularity, 0.0)) ASC
    LIMIT ${limit}
  `)) as Array<{ row_id: number }>;
  if (ranked.length === 0) {
    return [];
  }
  const rowIds = ranked.map((row) => row.row_id);
  const rows = await db
    .select({ rowId: sql<number>`"shows".rowid`, show: shows })
    .from(shows)
    .where(sql`"shows".rowid IN (${sql.join(rowIds.map((id) => sql`${id}`), sql`, `)})`);
  const byRowId = new Map(rows.map((row) => [row.rowId, row.show]));
  return rowIds
    .map((rowId) => byRowId.get(rowId))
    .filter((row): row is typeof shows.$inferSelect => row !== undefined);
}

async function searchCatalog(text: string, limit: number) {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  // Local-first: the bulk ingest keeps (nearly) the whole TMDB TV catalog in
  // D1, so live TMDB search is only a fallback for thin local results.
  const localRows = await searchShowsLocal(normalized, limit).catch(() => []);
  const local = localRows.map(catalogItemFromShowRow);
  if (local.length >= Math.min(limit, 8)) {
    return local;
  }
  try {
    const remote = await searchCatalogRemote(normalized, limit);
    const seen = new Set(local.map((item) => item.externalId));
    return [...local, ...remote.filter((item: any) => !seen.has(String(item.externalId)))].slice(
      0,
      limit,
    );
  } catch {
    return local;
  }
}

async function searchCatalogRemote(text: string, limit: number) {
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

// Refresh the stalest home catalog categories, stalest first, up to
// maxCategories per invocation.
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
    // Unmigrated rows can still hold legacy "completed", hence the loose type.
    const watchedThrough = ["completed", "finished", "caught_up"].includes(
      row.status as string,
    );
    addGenres(row.showId, watchedThrough ? 0.9 : 0.55, row.status === "watchlist");
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

// ─── User data export ───
// The export is a self-service snapshot of everything the user has put into
// Plotlist, organized by what people actually want out of it (their library,
// diary, reviews, lists, social graph) rather than by internal table. Row ids
// and foreign keys are resolved to titles and usernames, timestamps become
// ISO 8601 strings, and shows carry TMDB/IMDb ids so the file is portable to
// other services.

function exportDate(ms: number | null | undefined) {
  return typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function exportEpisodeCode(seasonNumber: number, episodeNumber: number) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `S${pad(seasonNumber)}E${pad(episodeNumber)}`;
}

async function getShowRowsByIdsChunked(showIds: Iterable<string>) {
  const uniqueIds = Array.from(new Set(showIds));
  const rows: Array<typeof shows.$inferSelect> = [];
  for (const chunk of chunkForSqlParams(uniqueIds, 1, 80)) {
    rows.push(...(await db.select().from(shows).where(inArray(shows.id, chunk))));
  }
  return rows;
}

async function buildExportData(userId: string) {
  const [
    userRows,
    stateRows,
    logRows,
    progressRows,
    reviewRows,
    listRows,
    listFollowRows,
    likeRows,
    commentRows,
    followingRows,
    followerRows,
    followRequestRows,
    blockRows,
    contactRows,
    tasteRows,
  ] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(watchStates).where(eq(watchStates.userId, userId)),
    db
      .select()
      .from(watchLogs)
      .where(eq(watchLogs.userId, userId))
      .orderBy(desc(watchLogs.watchedAt)),
    db.select().from(episodeProgress).where(eq(episodeProgress.userId, userId)),
    db
      .select()
      .from(reviews)
      .where(eq(reviews.authorId, userId))
      .orderBy(desc(reviews.createdAt)),
    db.select().from(lists).where(eq(lists.ownerId, userId)).orderBy(desc(lists.updatedAt)),
    db.select().from(listFollows).where(eq(listFollows.userId, userId)),
    db.select().from(likes).where(eq(likes.userId, userId)).orderBy(desc(likes.createdAt)),
    db
      .select()
      .from(comments)
      .where(eq(comments.authorId, userId))
      .orderBy(desc(comments.createdAt)),
    db.select().from(follows).where(eq(follows.followerId, userId)),
    db.select().from(follows).where(eq(follows.followeeId, userId)),
    db.select().from(followRequests).where(eq(followRequests.requesterId, userId)),
    db.select().from(blocks).where(eq(blocks.blockerId, userId)),
    db.select().from(contactSyncEntries).where(eq(contactSyncEntries.ownerId, userId)),
    db
      .select()
      .from(userTastePreferences)
      .where(eq(userTastePreferences.userId, userId))
      .limit(1),
  ]);

  const user = userRows[0] ?? null;
  const taste = tasteRows[0] ?? null;

  const ownedListItemRows: Array<typeof listItems.$inferSelect> = [];
  for (const chunk of chunkForSqlParams(listRows.map((row) => row.id), 1, 80)) {
    ownedListItemRows.push(
      ...(await db.select().from(listItems).where(inArray(listItems.listId, chunk))),
    );
  }

  const followedListRows: Array<typeof lists.$inferSelect> = [];
  for (const chunk of chunkForSqlParams(listFollowRows.map((row) => row.listId), 1, 80)) {
    followedListRows.push(...(await db.select().from(lists).where(inArray(lists.id, chunk))));
  }

  // Likes and comments point at reviews, logs, lists, and comments — often
  // other people's — so resolve those targets into something readable
  // ("a review of X by @y") instead of exporting opaque ids.
  const likedOrCommentedRows = [...likeRows, ...commentRows];
  const targetIdsOfType = (targetType: string) =>
    likedOrCommentedRows
      .filter((row) => row.targetType === targetType)
      .map((row) => row.targetId);

  const targetReviewRows: Array<typeof reviews.$inferSelect> = [];
  for (const chunk of chunkForSqlParams(targetIdsOfType("review"), 1, 80)) {
    targetReviewRows.push(...(await db.select().from(reviews).where(inArray(reviews.id, chunk))));
  }
  const targetLogRows: Array<typeof watchLogs.$inferSelect> = [];
  for (const chunk of chunkForSqlParams(targetIdsOfType("log"), 1, 80)) {
    targetLogRows.push(...(await db.select().from(watchLogs).where(inArray(watchLogs.id, chunk))));
  }
  const targetListRows: Array<typeof lists.$inferSelect> = [];
  for (const chunk of chunkForSqlParams(targetIdsOfType("list"), 1, 80)) {
    targetListRows.push(...(await db.select().from(lists).where(inArray(lists.id, chunk))));
  }
  const targetCommentRows: Array<typeof comments.$inferSelect> = [];
  for (const chunk of chunkForSqlParams(targetIdsOfType("comment"), 1, 80)) {
    targetCommentRows.push(
      ...(await db.select().from(comments).where(inArray(comments.id, chunk))),
    );
  }

  const favoriteShowIds = user?.favoriteShowIds ?? taste?.favoriteShowIds ?? [];

  const showRows = await getShowRowsByIdsChunked([
    ...stateRows.map((row) => row.showId),
    ...logRows.map((row) => row.showId),
    ...progressRows.map((row) => row.showId),
    ...reviewRows.map((row) => row.showId),
    ...ownedListItemRows.map((row) => row.showId),
    ...targetReviewRows.map((row) => row.showId),
    ...targetLogRows.map((row) => row.showId),
    ...favoriteShowIds,
  ]);
  const showById = new Map(showRows.map((row) => [row.id, row]));
  const showRef = (showId: string) => {
    const show = showById.get(showId);
    if (!show) return null;
    return {
      title: show.title,
      year: show.year ?? null,
      tmdbId: show.externalSource === "tmdb" ? show.externalId : null,
      imdbId: show.imdbId || null,
    };
  };

  const referencedUsers = await getUsersByIdsChunked([
    ...followingRows.map((row) => row.followeeId),
    ...followerRows.map((row) => row.followerId),
    ...followRequestRows.map((row) => row.targetId),
    ...blockRows.map((row) => row.blockedId),
    ...followedListRows.map((row) => row.ownerId),
    ...targetReviewRows.map((row) => row.authorId),
    ...targetLogRows.map((row) => row.userId),
    ...targetListRows.map((row) => row.ownerId),
    ...targetCommentRows.map((row) => row.authorId),
    ...contactRows.flatMap((row) => (row.matchedUserId ? [row.matchedUserId] : [])),
  ]);
  const userById = new Map(referencedUsers.map((row) => [row.id, row]));
  const userRef = (referencedUserId: string | null | undefined) => {
    const referenced = referencedUserId ? userById.get(referencedUserId) : null;
    if (!referenced) return null;
    return {
      username: referenced.username ?? null,
      displayName: referenced.displayName ?? referenced.name ?? null,
    };
  };

  const targetReviewById = new Map(targetReviewRows.map((row) => [row.id, row]));
  const targetLogById = new Map(targetLogRows.map((row) => [row.id, row]));
  const targetListById = new Map(targetListRows.map((row) => [row.id, row]));
  const targetCommentById = new Map(targetCommentRows.map((row) => [row.id, row]));
  const describeTarget = (targetType: string, targetId: string) => {
    if (targetType === "review") {
      const review = targetReviewById.get(targetId);
      return review
        ? { type: "review", show: showRef(review.showId), by: userRef(review.authorId) }
        : { type: "review", deleted: true };
    }
    if (targetType === "log") {
      const log = targetLogById.get(targetId);
      return log
        ? { type: "watch log", show: showRef(log.showId), by: userRef(log.userId) }
        : { type: "watch log", deleted: true };
    }
    if (targetType === "list") {
      const list = targetListById.get(targetId);
      return list
        ? { type: "list", title: list.title, by: userRef(list.ownerId) }
        : { type: "list", deleted: true };
    }
    const comment = targetCommentById.get(targetId);
    return comment
      ? { type: "comment", by: userRef(comment.authorId) }
      : { type: "comment", deleted: true };
  };

  // Keyed off the schema enum so the export tracks status renames; rows
  // holding a not-yet-migrated legacy status still land in their own bucket.
  const library: Record<string, unknown[]> = Object.fromEntries(
    watchStatusValues.map((status) => [status, []]),
  );
  for (const row of [...stateRows].sort((left, right) => right.updatedAt - left.updatedAt)) {
    (library[row.status] ??= []).push({
      ...showRef(row.showId),
      statusChangedAt: exportDate(row.updatedAt),
    });
  }

  const progressByShow = new Map<string, Array<typeof episodeProgress.$inferSelect>>();
  for (const row of progressRows) {
    const rows = progressByShow.get(row.showId) ?? [];
    rows.push(row);
    progressByShow.set(row.showId, rows);
  }
  const episodesWatched = Array.from(progressByShow.entries(), ([showId, rows]) => ({
    show: showRef(showId),
    episodeCount: rows.length,
    episodes: rows
      .sort(
        (left, right) =>
          left.seasonNumber - right.seasonNumber || left.episodeNumber - right.episodeNumber,
      )
      .map((row) => ({
        episode: exportEpisodeCode(row.seasonNumber, row.episodeNumber),
        watchedAt: exportDate(row.watchedAt),
      })),
  })).sort((left, right) => right.episodeCount - left.episodeCount);

  const itemsByList = new Map<string, Array<typeof listItems.$inferSelect>>();
  for (const row of ownedListItemRows) {
    const rows = itemsByList.get(row.listId) ?? [];
    rows.push(row);
    itemsByList.set(row.listId, rows);
  }

  return {
    export: {
      app: "Plotlist",
      format: "plotlist-export/2",
      generatedAt: new Date().toISOString(),
      notes:
        "All dates are ISO 8601 (UTC). Shows include TMDB and IMDb ids where known so they can be matched on other services.",
    },
    profile: user
      ? {
          username: user.username ?? null,
          displayName: user.displayName ?? user.name ?? null,
          bio: user.bio ?? null,
          email: user.email ?? null,
          avatarUrl: user.avatarUrl ?? null,
          joinedAt: exportDate(user.createdAt),
          privateAccount: Boolean(user.isPrivate),
          profileVisibility: user.profileVisibility ?? null,
          notificationPreferences: user.notificationPreferences ?? null,
        }
      : null,
    preferences: {
      favoriteShows: favoriteShowIds.map(showRef).filter(Boolean),
      favoriteGenres: user?.favoriteGenres ?? [],
      favoriteThemes: taste?.favoriteThemes ?? [],
      streamingServices: user?.streamingProviders ?? [],
      releaseCalendarProviders: user?.releaseCalendarPreferences?.selectedProviders ?? [],
    },
    summary: {
      showsTracked: stateRows.length,
      episodesWatched: progressRows.length,
      diaryEntries: logRows.length,
      reviews: reviewRows.length,
      lists: listRows.length,
      following: followingRows.length,
      followers: followerRows.length,
    },
    library,
    episodesWatched,
    diary: logRows.map((row) => ({
      watchedAt: exportDate(row.watchedAt),
      // Calendar period ("2024-03-15" / "2024-03" / "2024") for backdated
      // entries whose precision is coarser than an exact timestamp.
      watchedOn: row.watchedOn ?? null,
      datePrecision: row.datePrecision ?? "exact",
      show: showRef(row.showId),
      episode:
        row.seasonNumber != null && row.episodeNumber != null
          ? exportEpisodeCode(row.seasonNumber, row.episodeNumber)
          : null,
      episodeTitle: row.episodeTitle ?? null,
      note: row.note ?? null,
      rating: row.rating ?? null,
      reaction: row.reaction ?? null,
      rewatch: Boolean(row.isRewatch),
    })),
    reviews: reviewRows.map((row) => ({
      show: showRef(row.showId),
      rating: row.rating,
      review: row.reviewText ?? null,
      containsSpoilers: row.spoiler,
      episode:
        row.seasonNumber != null && row.episodeNumber != null
          ? exportEpisodeCode(row.seasonNumber, row.episodeNumber)
          : null,
      episodeTitle: row.episodeTitle ?? null,
      writtenAt: exportDate(row.createdAt),
      editedAt: exportDate(row.updatedAt),
    })),
    lists: listRows.map((list) => ({
      title: list.title,
      description: list.description ?? null,
      visibility: list.isPublic ? "public" : "private",
      createdAt: exportDate(list.createdAt),
      updatedAt: exportDate(list.updatedAt),
      items: (itemsByList.get(list.id) ?? [])
        .sort((left, right) => left.position - right.position)
        .map((item) => ({
          position: item.position,
          ...showRef(item.showId),
          addedAt: exportDate(item.addedAt),
        })),
    })),
    likes: likeRows.map((row) => ({
      likedAt: exportDate(row.createdAt),
      target: describeTarget(row.targetType, row.targetId),
    })),
    comments: commentRows.map((row) => ({
      postedAt: exportDate(row.createdAt),
      comment: row.text,
      on: describeTarget(row.targetType, row.targetId),
    })),
    social: {
      following: [...followingRows]
        .sort((left, right) => right.createdAt - left.createdAt)
        .map((row) => ({ ...userRef(row.followeeId), since: exportDate(row.createdAt) })),
      followers: [...followerRows]
        .sort((left, right) => right.createdAt - left.createdAt)
        .map((row) => ({ ...userRef(row.followerId), since: exportDate(row.createdAt) })),
      pendingFollowRequests: followRequestRows.map((row) => ({
        ...userRef(row.targetId),
        requestedAt: exportDate(row.createdAt),
      })),
      blockedUsers: blockRows.map((row) => ({
        ...userRef(row.blockedId),
        blockedAt: exportDate(row.createdAt),
      })),
      followedLists: listFollowRows.map((row) => {
        const list = followedListRows.find((candidate) => candidate.id === row.listId);
        return {
          title: list?.title ?? null,
          owner: userRef(list?.ownerId),
          followedAt: exportDate(row.createdAt),
        };
      }),
    },
    // Only what the user synced themselves — contact names and invite state.
    // The hashes used internally for matching are omitted.
    contacts: contactRows.map((row) => ({
      name: row.displayName,
      onPlotlist: userRef(row.matchedUserId),
      invitedAt: exportDate(row.invitedAt),
    })),
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

  const contactUserIds = await getContactMatchedUserIds(userId, 60);
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

// Old clients filter on "completed"; that now spans the whole watched-through
// tier plus any unmigrated legacy rows. A "finished" filter picks those
// legacy rows up too, since they read as finished everywhere else.
function watchStatusFilterValues(status: string) {
  if (status === "completed") return ["completed", "finished", "caught_up"];
  if (status === "finished") return ["finished", "completed"];
  return [status];
}

async function detailedWatchStates(userId: string, args: any, publicOnly = false) {
  const status = typeof args?.status === "string" ? args.status : undefined;
  const rows = await db
    .select()
    .from(watchStates)
    .where(
      status
        ? and(
            eq(watchStates.userId, userId),
            inArray(watchStates.status, watchStatusFilterValues(status) as any),
          )
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

// Aggregate rating summary: count/average plus a 5-bucket distribution
// (index 0 = 1 star … index 4 = 5 stars; half-star ratings round to the
// nearest whole bucket).
function buildRatingStats(ratings: number[]) {
  const histogram = [0, 0, 0, 0, 0];
  for (const rating of ratings) {
    const bucket = Math.min(5, Math.max(1, Math.round(rating)));
    histogram[bucket - 1] += 1;
  }
  return {
    count: ratings.length,
    reviewCount: ratings.length,
    averageRating: ratings.length
      ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
      : null,
    histogram,
  };
}

async function buildReviewDetails(reviewRows: Array<typeof reviews.$inferSelect>, viewerId?: string) {
  const authorIds = Array.from(new Set(reviewRows.map((review) => review.authorId)));
  const showIds = Array.from(new Set(reviewRows.map((review) => review.showId)));
  const [authorRows, showRows] = await Promise.all([
    authorIds.length ? db.select().from(users).where(inArray(users.id, authorIds)) : [],
    showIds.length ? db.select().from(shows).where(inArray(shows.id, showIds)) : [],
  ]);
  const authors = new Map(authorRows.map((user) => [user.id, toClientUser(user)] as const));
  const authorAvatars = new Map(
    authorRows.map((user) => [user.id, user.avatarUrl ?? user.image ?? null] as const),
  );
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
    authorAvatarUrl: authorAvatars.get(review.authorId) ?? null,
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
  // render for either side. Follow items name a second user (the person who
  // got followed), so those also hide when that user is blocked either way.
  const actorVisibleRows = await filterRowsByBlockedAuthors(userId, allFeedRows, (row) => row.actorId);
  const feedRows = await filterRowsByBlockedAuthors(
    userId,
    actorVisibleRows,
    (row) => (row.type === "follow" ? row.targetId : row.actorId),
  );
  const actorIds = Array.from(new Set(feedRows.map((row) => row.actorId)));
  const showIds = Array.from(
    new Set(feedRows.map((row) => row.showId).filter((id): id is string => Boolean(id))),
  );
  const reviewIds = feedRows.filter((row) => row.type === "review").map((row) => row.targetId);
  const logIds = feedRows.filter((row) => row.type === "log").map((row) => row.targetId);
  const followedUserIds = feedRows.filter((row) => row.type === "follow").map((row) => row.targetId);
  const listIds = feedRows.filter((row) => row.type === "list").map((row) => row.targetId);
  const [actorRows, showRows, reviewRows, logRows, followedUserRows, listRows] = await Promise.all([
    actorIds.length ? db.select().from(users).where(inArray(users.id, actorIds)) : [],
    showIds.length ? db.select().from(shows).where(inArray(shows.id, showIds)) : [],
    reviewIds.length ? db.select().from(reviews).where(inArray(reviews.id, reviewIds)) : [],
    logIds.length ? db.select().from(watchLogs).where(inArray(watchLogs.id, logIds)) : [],
    followedUserIds.length ? db.select().from(users).where(inArray(users.id, followedUserIds)) : [],
    listIds.length ? db.select().from(lists).where(inArray(lists.id, listIds)) : [],
  ]);
  const actors = new Map(actorRows.map((user) => [user.id, toClientUser(user)] as const));
  const showMap = new Map(showRows.map((show) => [show.id, showToDoc(show)] as const));
  const reviewMap = new Map(reviewRows.map((review) => [review.id, toDoc(review)] as const));
  const logMap = new Map(logRows.map((log) => [log.id, toDoc(log)] as const));
  const followedUserMap = new Map(followedUserRows.map((user) => [user.id, toClientUser(user)] as const));
  // Lists made private after fan-out stop rendering; the client drops rows
  // whose list resolved to null.
  const listMap = new Map(
    listRows.filter((list) => list.isPublic).map((list) => [list.id, toDoc(list)] as const),
  );
  return pageRows(
    feedRows.map((item) => ({
      ...toDoc(item),
      actor: actors.get(item.actorId) ?? null,
      show: item.showId ? showMap.get(item.showId) ?? null : null,
      review: item.type === "review" ? reviewMap.get(item.targetId) ?? null : null,
      log: item.type === "log" ? logMap.get(item.targetId) ?? null : null,
      followedUser: item.type === "follow" ? followedUserMap.get(item.targetId) ?? null : null,
      list: item.type === "list" ? listMap.get(item.targetId) ?? null : null,
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

// Worst-case bound so a mega account can't stall its own write request
// indefinitely; followers beyond it still see the activity on the actor's
// profile. Sized for Workers Paid subrequest limits with room to spare.
const FEED_FANOUT_MAX_FOLLOWERS = 5000;
// D1 statements grouped per batch() call — one network round-trip per group.
const FEED_FANOUT_STATEMENTS_PER_BATCH = 40;

async function addFeedForFollowers(
  actorId: string,
  type: "review" | "log" | "follow" | "list",
  targetId: string,
  showId: string | null,
  timestamp: number,
) {
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
  const statements = chunkForSqlParams(feedRows, 8).map((chunk) =>
    db.insert(feedItems).values(chunk),
  );
  for (let i = 0; i < statements.length; i += FEED_FANOUT_STATEMENTS_PER_BATCH) {
    const group = statements.slice(i, i + FEED_FANOUT_STATEMENTS_PER_BATCH);
    await db.batch(group as [(typeof statements)[number], ...(typeof statements)[number][]]);
  }
}

// Admin "delete" resolution removes the reported content itself (the admin UI
// promises exactly that), mirroring the owner-initiated delete paths plus the
// dangling comments/likes those paths leave behind.
async function deleteReportedContent(targetType: string, targetId: string) {
  if (targetType === "review") {
    await db.delete(reviews).where(eq(reviews.id, targetId));
    await db.delete(comments).where(and(eq(comments.targetType, "review"), eq(comments.targetId, targetId)));
    await db.delete(likes).where(and(eq(likes.targetType, "review"), eq(likes.targetId, targetId)));
    await db.delete(feedItems).where(and(eq(feedItems.type, "review"), eq(feedItems.targetId, targetId)));
    return;
  }
  if (targetType === "log") {
    await db.delete(watchLogs).where(eq(watchLogs.id, targetId));
    await db.delete(comments).where(and(eq(comments.targetType, "log"), eq(comments.targetId, targetId)));
    await db.delete(likes).where(and(eq(likes.targetType, "log"), eq(likes.targetId, targetId)));
    await db.delete(feedItems).where(and(eq(feedItems.type, "log"), eq(feedItems.targetId, targetId)));
    return;
  }
  if (targetType === "list") {
    await db.delete(listItems).where(eq(listItems.listId, targetId));
    await db.delete(listFollows).where(eq(listFollows.listId, targetId));
    await db.delete(comments).where(and(eq(comments.targetType, "list"), eq(comments.targetId, targetId)));
    await db.delete(likes).where(and(eq(likes.targetType, "list"), eq(likes.targetId, targetId)));
    await db.delete(feedItems).where(and(eq(feedItems.type, "list"), eq(feedItems.targetId, targetId)));
    await db.delete(lists).where(eq(lists.id, targetId));
    return;
  }
  if (targetType === "comment") {
    await db.delete(comments).where(eq(comments.id, targetId));
  }
  // "user" reports resolve without deletion; account removal stays a
  // deliberate, separate action.
}

// One continue-surface candidate: the same card payload getUpNext has always
// returned, plus the reconciled watch status and gap facts the sectioned
// Continue page groups by.
type ContinueCandidate = {
  showId: string;
  show: ReturnType<typeof showToDoc>;
  externalSource: string | null;
  externalId: string | null;
  status: WatchStatus;
  totalWatched: number;
  totalEpisodes: number;
  progressPct: number;
  nextSeasonNumber: number;
  nextEpisodeNumber: number;
  nextEpisodeName: string | null;
  nextEpisodeStillUrl: string | null;
  nextEpisodeOverview: string | null;
  nextEpisodeRuntime: number | null;
  nextAirDate: number | null;
  nextReleaseDate: number | null;
  nextEpisodeReleasedToday: boolean;
  nextEpisodeAirDateTs: number | null;
  isUpcoming: boolean;
  isCaughtUp: boolean;
  lastWatchedAt: number | null;
  seasons: SeasonSummary[];
  sortTimestamp: number;
  stateUpdatedAt: number;
  gapCount: number;
  firstGapSeasonNumber: number | null;
  firstGapEpisodeNumber: number | null;
};

// Load and reconcile every show that can appear on a continue surface. This
// is where stored statuses lazily catch up with reality: a caught-up show
// whose next episode released flips back to watching, a caught-up show that
// got canceled flips to finished, a finished show with a revival flips back
// to caught_up/watching, and unmigrated legacy "completed" rows resolve —
// each divergence is written back (best-effort, original updatedAt kept so
// metadata flips don't fake user activity).
async function loadContinueCandidates(
  userId: string,
  utcOffsetMinutes: number | null,
  { includePausedDropped }: { includePausedDropped: boolean },
) {
  const statusGroups: Array<{ statuses: string[]; limit: number }> = [
    { statuses: ["watching"], limit: 50 },
    { statuses: ["caught_up"], limit: 30 },
    { statuses: ["finished", "completed"], limit: 30 },
    ...(includePausedDropped
      ? [
          { statuses: ["paused"], limit: 25 },
          { statuses: ["dropped"], limit: 25 },
        ]
      : []),
  ];
  const groupRows = await Promise.all(
    statusGroups.map((group) =>
      db
        .select()
        .from(watchStates)
        .where(
          and(
            eq(watchStates.userId, userId),
            inArray(
              watchStates.status,
              group.statuses as Array<typeof watchStates.$inferSelect.status>,
            ),
          ),
        )
        .orderBy(desc(watchStates.updatedAt))
        .limit(group.limit),
    ),
  );
  const rows = groupRows.flat();
  const now = Date.now();
  // Release days resolve in the user's timezone; the worker clock runs UTC,
  // which would surface tomorrow's episodes as "tonight" for US evenings.
  const { today, todayStartTs } = getUserLocalDayContext(now, utcOffsetMinutes);
  if (rows.length === 0) {
    return { candidates: [] as ContinueCandidate[], now, today };
  }

  const showIds = rows.map((row) => row.showId);
  const [showRows, progressRows, releaseRows] = await Promise.all([
    db.select().from(shows).where(inArray(shows.id, showIds)),
    db
      .select()
      .from(episodeProgress)
      .where(
        and(
          eq(episodeProgress.userId, userId),
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

  const progressByShow = new Map<
    string,
    {
      episodes: Array<{
        seasonNumber: number;
        episodeNumber: number;
        watchedAt: number;
      }>;
      latestWatchedAt: number | null;
    }
  >();
  for (const entry of progressRows) {
    const current =
      progressByShow.get(entry.showId) ??
      ({ episodes: [], latestWatchedAt: null } as {
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

  const statusWriteBacks: Array<{ id: string; status: WatchStatus; updatedAt: number }> = [];
  const candidates: ContinueCandidate[] = [];
  for (const row of rows) {
    const show = showById.get(row.showId);
    if (!show) continue;
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

    const seasonRecord = seasons.find(
      (season) => season.seasonNumber === nextEpisode.seasonNumber,
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
        nextSeasonNumber: nextEpisode.seasonNumber,
        nextEpisodeNumber: nextEpisode.episodeNumber,
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

    // Reconcile the stored status against reality. Release events prove a
    // fresh episode exists even when cached season counts lag behind it.
    const facts = computeShowProgressFacts({
      watchedEpisodes: progress.episodes,
      seasons,
      isEnded: isShowEnded(detailPayload),
      lastAiredEpisode: readLastAiredEpisode(detailPayload),
    });
    const releasedNewEvidence =
      releaseAware.nextEpisodeReleasedToday === true ||
      (typeof releaseAware.nextReleaseDate === "number" &&
        releaseAware.nextReleaseDate <= now);
    const effectiveFacts: ShowProgressFacts = releasedNewEvidence
      ? {
          ...facts,
          hasReleasedAfterFrontier: true,
          releasedCount: Math.max(1, facts.releasedCount),
        }
      : facts;
    const storedStatus = row.status as LegacyWatchStatus;
    const status =
      reconcileWatchStatus({ currentStatus: storedStatus, facts: effectiveFacts }) ??
      "watching";
    if (status !== storedStatus) {
      statusWriteBacks.push({ id: row.id, status, updatedAt: row.updatedAt });
    }

    const isCaughtUp = releaseAware.isCaughtUp ?? progressState.isCaughtUp;
    // When season metadata exists but can't confirm the pointed-at episode
    // exists (announced-but-empty next season, stale counts) and no release
    // event backs it either, present the card as upcoming so the surface
    // never offers to play or mark an episode that isn't real.
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

    const firstGap = effectiveFacts.gapEpisodes[0] ?? null;
    candidates.push({
      showId: show.id,
      show: showToDoc(show),
      externalSource: show.externalSource,
      externalId: show.externalId,
      status,
      totalWatched: progressState.totalWatched,
      totalEpisodes: releaseAware.totalEpisodes,
      progressPct: releaseProgressPct,
      nextSeasonNumber: releaseAware.nextSeasonNumber,
      nextEpisodeNumber: releaseAware.nextEpisodeNumber,
      nextEpisodeName: releaseAware.nextEpisodeName ?? null,
      nextEpisodeStillUrl: releaseAware.nextEpisodeStillUrl ?? null,
      nextEpisodeOverview: null,
      nextEpisodeRuntime: null,
      nextAirDate: releaseAware.nextAirDate ?? null,
      nextReleaseDate: releaseAware.nextReleaseDate ?? null,
      nextEpisodeReleasedToday: releaseAware.nextEpisodeReleasedToday ?? false,
      nextEpisodeAirDateTs: null,
      isUpcoming: presentAsUpcoming,
      isCaughtUp,
      lastWatchedAt: progress.latestWatchedAt,
      seasons: progressState.seasons,
      sortTimestamp: releaseAware.sortTimestamp,
      stateUpdatedAt: row.updatedAt,
      gapCount: effectiveFacts.gapEpisodes.length,
      firstGapSeasonNumber: firstGap?.seasonNumber ?? null,
      firstGapEpisodeNumber: firstGap?.episodeNumber ?? null,
    });
  }

  if (statusWriteBacks.length > 0) {
    // Bounded and best-effort: the read already computed the truth, the
    // write-back just persists it for the next surface that trusts the row.
    await Promise.all(
      statusWriteBacks.slice(0, 25).map((write) =>
        db
          .update(watchStates)
          .set({ status: write.status, updatedAt: write.updatedAt })
          .where(eq(watchStates.id, write.id))
          .catch(() => {}),
      ),
    );
  }

  return { candidates, now, today };
}

function stripContinueCandidate({
  sortTimestamp: _sortTimestamp,
  externalSource: _externalSource,
  externalId: _externalId,
  stateUpdatedAt: _stateUpdatedAt,
  ...entry
}: ContinueCandidate) {
  return entry;
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
      // Self-only boolean so onboarding can skip the phone step; the hash
      // itself still never leaves the server.
      hasVerifiedPhone: Boolean(user.phoneHash),
      countsReviews: libraryCounts.reviews,
      countsLists: libraryCounts.lists,
      countsWatchlist: libraryCounts.watchlist,
      countsWatching: libraryCounts.watching,
      countsCaughtUp: libraryCounts.caughtUp,
      countsFinished: libraryCounts.finished,
      countsPaused: libraryCounts.paused,
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
    const text = parsed.text.trim();
    if (text.length < 2) {
      return [];
    }
    const limit = Math.min(parsed.limit ?? 20, 50);
    // Over-fetch so ranking has real candidates to reorder — with exactly
    // `limit` rows in arbitrary DB order, prefix matches buried past the
    // limit would never surface.
    const rows = await db
      .select()
      .from(users)
      .where(
        or(
          ilikeContains(users.username, text),
          ilikeContains(users.displayName, text),
          ilikeContains(users.name, text),
        ),
      )
      .limit(Math.min(limit * 3, 90));
    const previews = await buildPersonPreviews(user.id, rows);
    return rankPeopleSearchResults(previews, text).slice(0, limit);
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
    return await getInviteCandidates(user.id, Math.min(parsed.limit ?? 20, 50));
  },
  "contacts:searchInviteCandidates": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ text: z.string(), limit: z.number().optional() }).parse(args ?? {});
    return await searchInviteCandidates(user.id, parsed.text, Math.min(parsed.limit ?? 20, 50));
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
  "follows:listMutualFollowers": async ({ args, req }) => {
    const parsed = z.object({ userId: z.string() }).passthrough().parse(args ?? {});
    const viewer = await getOptionalAuthUser(req);
    // Mutuals only exist relative to a signed-in viewer looking at someone
    // else's profile.
    if (!viewer || viewer.id === parsed.userId) {
      return EMPTY_PAGE;
    }
    // Unlike followers/following, this list only reveals the viewer's own
    // follow graph, so it stays visible on private profiles — matching the
    // mutualPreview the profile header already shows. Someone who blocked
    // the viewer doesn't exist for them.
    const targetRows = await db.select({ id: users.id }).from(users).where(eq(users.id, parsed.userId)).limit(1);
    if (!targetRows[0]) {
      return EMPTY_PAGE;
    }
    const block = await getBlockStatus(viewer.id, parsed.userId);
    if (block.hasBlockedViewer) {
      return EMPTY_PAGE;
    }
    const { offset, numItems } = parsePaginationWindow(args);
    const viewerFollows = alias(follows, "viewer_follows");
    const rows = await db
      .select({ otherId: follows.followerId, createdAt: follows.createdAt })
      .from(follows)
      .innerJoin(
        viewerFollows,
        and(
          eq(viewerFollows.followeeId, follows.followerId),
          eq(viewerFollows.followerId, viewer.id),
        ),
      )
      .where(eq(follows.followeeId, parsed.userId))
      .orderBy(desc(follows.createdAt))
      .limit(numItems + 1)
      .offset(offset);
    const pageEdges = rows.slice(0, numItems);
    const userRows =
      pageEdges.length > 0 ? await getUsersByIdsChunked(pageEdges.map((row) => row.otherId)) : [];
    const userById = new Map(userRows.map((row) => [row.id, row] as const));
    const orderedUsers = pageEdges
      .map((edge) => userById.get(edge.otherId))
      .filter((row): row is typeof users.$inferSelect => Boolean(row));
    const previews = await buildPersonPreviews(viewer.id, orderedUsers);
    return {
      page: previews,
      results: previews,
      continueCursor: String(offset + pageEdges.length),
      isDone: rows.length <= numItems,
    };
  },
  "likes:getForUserTarget": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = likeTargetArgs.parse(args ?? {});
    const rows = await db
      .select()
      .from(likes)
      .where(and(eq(likes.userId, user.id), eq(likes.targetType, parsed.targetType), eq(likes.targetId, parsed.targetId)))
      .limit(1);
    return Boolean(rows[0]);
  },
  "likes:listForTarget": async ({ args }) => {
    const parsed = likeTargetArgs.extend({ limit: z.number().optional() }).parse(args ?? {});
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

    const likeCounts = new Map<string, number>();
    const viewerLikedIds = new Set<string>();
    for (const chunk of chunkForSqlParams(rows.map((row) => row.id), 1)) {
      const countRows = await db
        .select({ targetId: likes.targetId, value: count() })
        .from(likes)
        .where(and(eq(likes.targetType, "comment"), inArray(likes.targetId, chunk)))
        .groupBy(likes.targetId);
      for (const row of countRows) {
        likeCounts.set(row.targetId, row.value);
      }
      if (viewer) {
        const likedRows = await db
          .select({ targetId: likes.targetId })
          .from(likes)
          .where(
            and(
              eq(likes.userId, viewer.id),
              eq(likes.targetType, "comment"),
              inArray(likes.targetId, chunk),
            ),
          );
        for (const row of likedRows) {
          viewerLikedIds.add(row.targetId);
        }
      }
    }

    type ThreadEntry = { comment: any; author: unknown; replies: ThreadEntry[] };
    const entryById = new Map<string, ThreadEntry>(
      rows.map((row) => [
        row.id,
        {
          comment: {
            ...toDoc(row),
            likeCount: likeCounts.get(row.id) ?? 0,
            viewerLiked: viewerLikedIds.has(row.id),
          },
          author: authors.get(row.authorId) ?? null,
          replies: [],
        },
      ]),
    );
    // Reddit-style "top": most-liked first at every level, ties in posting
    // order. Replies whose parent is hidden (blocked author) drop with it.
    const topLevel: ThreadEntry[] = [];
    for (const row of rows) {
      const entry = entryById.get(row.id)!;
      if (row.parentId) {
        entryById.get(row.parentId)?.replies.push(entry);
      } else {
        topLevel.push(entry);
      }
    }
    const byLikesThenOldest = (a: ThreadEntry, b: ThreadEntry) =>
      b.comment.likeCount - a.comment.likeCount || a.comment.createdAt - b.comment.createdAt;
    const sortThread = (entries: ThreadEntry[]) => {
      entries.sort(byLikesThenOldest);
      for (const entry of entries) {
        sortThread(entry.replies);
      }
    };
    sortThread(topLevel);
    // Pagination is by top-level comment; each entry carries its full subtree.
    return pageRows(topLevel, args);
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
    const limit = Math.min(parsed.limit ?? 20, 50);
    const ftsRows = await searchShowsLocal(parsed.text, limit).catch(() => []);
    if (ftsRows.length > 0) {
      return ftsRows.map(showToDoc);
    }
    // FTS prefix-matches word starts only; the substring scan still catches
    // mid-word fragments and covers environments without the FTS table.
    const rows = await db
      .select()
      .from(shows)
      .where(or(ilike(shows.title, `%${parsed.text}%`), ilike(shows.searchText, `%${parsed.text}%`)))
      .limit(limit);
    return rows.map(showToDoc);
  },
  "watchStates:getCounts": async ({ req }) => {
    const user = await requireAuthUser(req);
    const libraryCounts = await getUserLibraryCounts(user.id);
    return {
      watchlist: libraryCounts.watchlist,
      watching: libraryCounts.watching,
      caughtUp: libraryCounts.caughtUp,
      finished: libraryCounts.finished,
      paused: libraryCounts.paused,
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
      .where(parsed.status ? and(eq(watchStates.userId, user.id), inArray(watchStates.status, watchStatusFilterValues(parsed.status) as any)) : eq(watchStates.userId, user.id))
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
  // Every logged viewing of one show for the signed-in user, newest first.
  // The show screen derives watch-count badges and per-episode viewing
  // history from this; capped generously since even heavy rewatchers stay
  // in the hundreds per show.
  "watchLogs:listForShow": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ showId: z.string() }).parse(args ?? {});
    const rows = await db
      .select()
      .from(watchLogs)
      .where(and(eq(watchLogs.userId, user.id), eq(watchLogs.showId, parsed.showId)))
      .orderBy(desc(watchLogs.watchedAt))
      .limit(1000);
    return rows.map(toDoc);
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
  "episodeProgress:getUpNext": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsedArgs = z
      .object({ utcOffsetMinutes: z.number().int().min(-840).max(840).optional() })
      .parse(args ?? {});
    const { candidates, now, today } = await loadContinueCandidates(
      user.id,
      parsedArgs.utcOffsetMinutes ?? null,
      { includePausedDropped: false },
    );

    // Finished shows are done-done: they only re-enter the rail once
    // reconciliation sees something new released (which flips them back to
    // watching above). Caught-up entries ride along so the client can keep
    // its tier-3 handling.
    const entries = candidates.filter((candidate) => candidate.status !== "finished");

    // Rank before slicing so shows with a watchable episode always claim the
    // top-10 ahead of upcoming and caught-up entries.
    const rankedEntries = rankContinueWatchingItems(entries, now).slice(0, 10);

    await enrichUpNextEntriesWithSeasonMetadata(rankedEntries, { now, today });

    // Enrichment can flip an entry to upcoming once season air dates load, so
    // the final order is settled after it runs.
    return rankContinueWatchingItems(rankedEntries, now).map(stripContinueCandidate);
  },
  "episodeProgress:getContinue": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsedArgs = z
      .object({ utcOffsetMinutes: z.number().int().min(-840).max(840).optional() })
      .parse(args ?? {});
    const { candidates, now, today } = await loadContinueCandidates(
      user.id,
      parsedArgs.utcOffsetMinutes ?? null,
      { includePausedDropped: true },
    );

    const active = candidates.filter((candidate) => isWatchTierStatus(candidate.status));
    // Ready cards get next-episode metadata (and, crucially, air dates — the
    // "new episode" vs "old backlog" split keys off them).
    const readyForEnrichment = rankContinueWatchingItems(
      active.filter(
        (candidate) => candidate.status === "watching" && !candidate.isCaughtUp,
      ),
      now,
    );
    await enrichUpNextEntriesWithSeasonMetadata(readyForEnrichment, { now, today });

    const isUpcomingNow = (candidate: ContinueCandidate) =>
      candidate.isUpcoming ||
      (typeof candidate.nextAirDate === "number" && candidate.nextAirDate > now) ||
      isContinueWatchingFutureRelease(candidate, now);
    // "New episode": the next unwatched episode dropped within the window —
    // the user was (near) caught up when it aired. An old backlog keeps an
    // old air date and stays in resume.
    const NEW_EPISODE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
    const isNewEpisode = (candidate: ContinueCandidate) => {
      if (candidate.nextEpisodeReleasedToday) return true;
      const airTs =
        candidate.nextEpisodeAirDateTs ??
        (typeof candidate.nextReleaseDate === "number" &&
        candidate.nextReleaseDate <= now
          ? candidate.nextReleaseDate
          : null);
      return airTs !== null && airTs <= now && now - airTs <= NEW_EPISODE_WINDOW_MS;
    };

    const ready = active.filter(
      (candidate) =>
        candidate.status === "watching" &&
        !candidate.isCaughtUp &&
        !isUpcomingNow(candidate),
    );
    const newEpisodes = rankContinueWatchingItems(ready.filter(isNewEpisode), now).slice(0, 20);
    const resume = rankContinueWatchingItems(
      ready.filter((candidate) => !isNewEpisode(candidate)),
      now,
    ).slice(0, 30);

    // Returning: caught-up shows waiting on new episodes, plus not-yet-started
    // shows whose premiere is scheduled. Dated entries lead, soonest first.
    const returningPool = active.filter(
      (candidate) =>
        !ready.includes(candidate) &&
        (candidate.status === "caught_up" ||
          (candidate.status === "watching" && isUpcomingNow(candidate))),
    );
    const returningDated = returningPool
      .filter((candidate) => typeof candidate.nextAirDate === "number")
      .sort((left, right) => (left.nextAirDate ?? 0) - (right.nextAirDate ?? 0));
    const returningUndated = returningPool
      .filter((candidate) => typeof candidate.nextAirDate !== "number")
      .sort(
        (left, right) =>
          (right.lastWatchedAt ?? right.stateUpdatedAt) -
          (left.lastWatchedAt ?? left.stateUpdatedAt),
      );
    const returning = [...returningDated, ...returningUndated].slice(0, 30);

    // Gaps: episodes skipped behind the frontier, on any active-tier show.
    // Paused and dropped shows don't nag.
    const gaps = active
      .filter((candidate) => candidate.gapCount > 0)
      .sort(
        (left, right) =>
          (right.lastWatchedAt ?? right.stateUpdatedAt) -
          (left.lastWatchedAt ?? left.stateUpdatedAt),
      )
      .slice(0, 20);

    const byStateRecency = (status: WatchStatus) =>
      candidates
        .filter((candidate) => candidate.status === status)
        .sort((left, right) => right.stateUpdatedAt - left.stateUpdatedAt)
        .slice(0, 25);

    return {
      resume: resume.map(stripContinueCandidate),
      newEpisodes: newEpisodes.map(stripContinueCandidate),
      returning: returning.map(stripContinueCandidate),
      gaps: gaps.map(stripContinueCandidate),
      paused: byStateRecency("paused").map(stripContinueCandidate),
      dropped: byStateRecency("dropped").map(stripContinueCandidate),
      generatedAt: now,
    };
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
    // Show-level reviews only: per-episode ratings live in the episode sheet
    // (listForEpisodeDetailed) and would flood this rail as star-only rows.
    const rows = await db
      .select()
      .from(reviews)
      .where(and(eq(reviews.showId, parsed.showId), isNull(reviews.seasonNumber)))
      .orderBy(desc(reviews.createdAt));
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
    // People the viewer follows surface first; each group keeps newest-first
    // order from the query above (sort is stable).
    let orderedRows = visibleRows;
    if (viewer && visibleRows.length > 1) {
      const authorIds = Array.from(new Set(visibleRows.map((row) => row.authorId)));
      const followedAuthors = new Set<string>();
      for (const chunk of chunkForSqlParams(authorIds, 1, 80)) {
        const followRows = await db
          .select()
          .from(follows)
          .where(and(eq(follows.followerId, viewer.id), inArray(follows.followeeId, chunk)));
        for (const row of followRows) {
          followedAuthors.add(row.followeeId);
        }
      }
      orderedRows = [...visibleRows].sort(
        (left, right) =>
          Number(followedAuthors.has(right.authorId)) - Number(followedAuthors.has(left.authorId)),
      );
    }
    return pageRows(await buildReviewDetails(orderedRows, viewer?.id), args);
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
    return buildRatingStats(rows.map((row) => row.rating));
  },
  "reviews:getShowStats": async ({ args }) => {
    const parsed = z.object({ showId: z.string() }).parse(args ?? {});
    // Show-level reviews only, matching listForShowDetailed — episode ratings
    // have their own per-episode stats.
    const rows = await db
      .select()
      .from(reviews)
      .where(and(eq(reviews.showId, parsed.showId), isNull(reviews.seasonNumber)));
    return buildRatingStats(rows.map((row) => row.rating));
  },
  "shows:getEpisodeFriendWatchers": async ({ args, req }) => {
    const viewer = await getOptionalAuthUser(req);
    if (!viewer) {
      return { watchers: [], totalCount: 0 };
    }
    const parsed = z
      .object({ showId: z.string(), seasonNumber: z.number(), episodeNumber: z.number() })
      .parse(args ?? {});
    // Follows are already a privacy-safe audience: private accounts approve
    // followers, and blocks sever the edge in both directions.
    const followRows = await db
      .select()
      .from(follows)
      .where(eq(follows.followerId, viewer.id));
    const followeeIds = followRows.map((row) => row.followeeId);
    if (followeeIds.length === 0) {
      return { watchers: [], totalCount: 0 };
    }
    const progressRows: Array<typeof episodeProgress.$inferSelect> = [];
    for (const chunk of chunkForSqlParams(followeeIds, 1, 80)) {
      const rows = await db
        .select()
        .from(episodeProgress)
        .where(
          and(
            eq(episodeProgress.showId, parsed.showId),
            eq(episodeProgress.seasonNumber, parsed.seasonNumber),
            eq(episodeProgress.episodeNumber, parsed.episodeNumber),
            inArray(episodeProgress.userId, chunk),
          ),
        );
      progressRows.push(...rows);
    }
    if (progressRows.length === 0) {
      return { watchers: [], totalCount: 0 };
    }
    progressRows.sort((left, right) => right.watchedAt - left.watchedAt);
    const visible = progressRows.slice(0, 12);
    const watcherIds = visible.map((row) => row.userId);
    const [watcherUsers, ratingRows] = await Promise.all([
      getUsersByIdsChunked(watcherIds),
      db
        .select()
        .from(reviews)
        .where(
          and(
            eq(reviews.showId, parsed.showId),
            eq(reviews.seasonNumber, parsed.seasonNumber),
            eq(reviews.episodeNumber, parsed.episodeNumber),
            inArray(reviews.authorId, watcherIds),
          ),
        ),
    ]);
    const userMap = new Map(watcherUsers.map((user) => [user.id, user] as const));
    const ratingMap = new Map(ratingRows.map((row) => [row.authorId, row.rating] as const));
    return {
      watchers: visible.flatMap((row) => {
        const user = userMap.get(row.userId);
        if (!user) return [];
        return [
          {
            user: toClientUser(user),
            avatarUrl: user.avatarUrl ?? user.image ?? null,
            watchedAt: row.watchedAt,
            rating: ratingMap.get(row.userId) ?? null,
          },
        ];
      }),
      totalCount: progressRows.length,
    };
  },
  "lists:get": async ({ args, req }) => {
    const listId = z.object({ listId: z.string() }).parse(args ?? {}).listId;
    const viewer = await getOptionalAuthUser(req);
    const list = await getViewableList(listId, viewer?.id ?? null);
    if (!list) {
      return null;
    }
    const [enriched] = await enrichListDocs([list], viewer?.id ?? null);
    return enriched ?? null;
  },
  "lists:listForUser": async ({ args, req }) => {
    const parsed = z.object({ userId: z.string().optional() }).passthrough().parse(args ?? {});
    const userId = parsed.userId;
    if (!userId) return pageRows([], args);
    const viewer = await getOptionalAuthUser(req);
    const viewerId = viewer?.id ?? null;
    // Private lists never leave the owner's account.
    if (viewerId !== userId) {
      if (!(await getVisibleProfileAudience(viewerId, userId))) {
        return EMPTY_PAGE;
      }
      const rows = await db
        .select()
        .from(lists)
        .where(and(eq(lists.ownerId, userId), eq(lists.isPublic, true)))
        .orderBy(desc(lists.updatedAt));
      return pageRows(await enrichListDocs(rows, viewerId), args);
    }
    const rows = await db.select().from(lists).where(eq(lists.ownerId, userId)).orderBy(desc(lists.updatedAt));
    return pageRows(await enrichListDocs(rows, viewerId), args);
  },
  "lists:listPublicForUser": async ({ args, req }) => {
    const parsed = z.object({ userId: z.string() }).passthrough().parse(args ?? {});
    const viewer = await getOptionalAuthUser(req);
    if (!(await getVisibleProfileAudience(viewer?.id ?? null, parsed.userId))) {
      return EMPTY_PAGE;
    }
    const rows = await db.select().from(lists).where(and(eq(lists.ownerId, parsed.userId), eq(lists.isPublic, true))).orderBy(desc(lists.updatedAt));
    return pageRows(await enrichListDocs(rows, viewer?.id ?? null), args);
  },
  "lists:listFollowedByUser": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const followRows = await db
      .select()
      .from(listFollows)
      .where(eq(listFollows.userId, user.id))
      .orderBy(desc(listFollows.createdAt));
    if (followRows.length === 0) {
      return pageRows([], args);
    }
    const listRows = await db
      .select()
      .from(lists)
      .where(inArray(lists.id, followRows.map((row) => row.listId)));
    const listsById = new Map(listRows.map((list) => [list.id, list]));
    // Follows survive a list going private or a block appearing; hide those
    // rows here instead of surfacing content the viewer may no longer see.
    const blockedOwnerIds = await getBlockedEitherWayIdSet(
      user.id,
      listRows.map((list) => list.ownerId),
    );
    const visible = followRows
      .map((row) => listsById.get(row.listId))
      .filter((list): list is typeof lists.$inferSelect => Boolean(list))
      .filter((list) => list.isPublic && !blockedOwnerIds.has(list.ownerId));
    return pageRows(await enrichListDocs(visible, user.id), args);
  },
  "listItems:listDetailed": async ({ args, req }) => {
    const parsed = z.object({ listId: z.string() }).passthrough().parse(args ?? {});
    const viewer = await getOptionalAuthUser(req);
    // Same gate as lists:get so private list contents stay private.
    if (!(await getViewableList(parsed.listId, viewer?.id ?? null))) {
      return [];
    }
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
  "embeddings:getShowFacets": async ({ args }) => {
    const parsed = z.object({ showId: z.string() }).parse(args ?? {});
    return await getShowFacets(parsed.showId);
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
    await moderateText("profile", [parsed.displayName, parsed.username]);
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
    await moderateText("profile", [parsed.displayName, parsed.bio, parsed.username]);
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
    return await clearContactSync(user.id);
  },
  "contacts:sendInvite": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const entryId = z.object({ entryId: z.string() }).parse(args ?? {}).entryId;
    await enforceRateLimit(rateLimitKey("contacts-invite", user.id), 30, 60 * 60 * 1000);
    return await markContactInvited(user.id, entryId);
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
    // Followers hear about new connections in their feed. Private-account
    // follows go through the request path and deliberately never fan out.
    await addFeedForFollowers(user.id, "follow", parsed.userIdToFollow, null, Date.now());

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
      db
        .delete(feedItems)
        .where(
          and(
            eq(feedItems.type, "follow"),
            eq(feedItems.actorId, user.id),
            eq(feedItems.targetId, parsed.userIdToUnfollow),
          ),
        ),
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
    const parsed = likeTargetArgs.parse(args ?? {});
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
    const parsed = targetArgs
      .extend({ text: z.string().min(1), parentId: z.string().optional() })
      .parse(args ?? {});
    if (parsed.targetType === "list") {
      // Owners can switch comments off per list; enforce it server-side so a
      // stale client can't post through a disabled thread.
      const listRows = await db.select().from(lists).where(eq(lists.id, parsed.targetId)).limit(1);
      if (!listRows[0]) {
        throw new ApiError(404, "list_not_found", "List not found");
      }
      if (!listRows[0].commentsEnabled) {
        throw new ApiError(403, "comments_disabled", "Comments are turned off for this list.");
      }
    }
    let parentAuthorId: string | null = null;
    if (parsed.parentId) {
      const parentRows = await db
        .select()
        .from(comments)
        .where(eq(comments.id, parsed.parentId))
        .limit(1);
      const parent = parentRows[0];
      // A reply must land in the thread it claims to be part of; a stale or
      // forged parentId otherwise attaches it to an unrelated conversation.
      if (!parent || parent.targetType !== parsed.targetType || parent.targetId !== parsed.targetId) {
        throw new ApiError(404, "comment_not_found", "That comment is no longer available");
      }
      const block = await getBlockStatus(user.id, parent.authorId);
      if (isBlockedEitherWay(block)) {
        throw new ApiError(404, "comment_not_found", "That comment is no longer available");
      }
      parentAuthorId = parent.authorId;
    }
    await moderateText("comment", [parsed.text]);
    await assertTargetOwnerNotBlocked(user.id, parsed.targetType, parsed.targetId);
    const id = createId("comment");
    await db.insert(comments).values({ id, authorId: user.id, targetType: parsed.targetType, targetId: parsed.targetId, parentId: parsed.parentId ?? null, text: parsed.text, createdAt: Date.now() });
    await notifyComment(user, parsed.targetType, parsed.targetId, id, parsed.text, parentAuthorId);
    const rows = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
    return rows[0]
      ? { comment: { ...toDoc(rows[0]), likeCount: 0, viewerLiked: false }, author: toClientUser(user), replies: [] }
      : null;
  },
  "comments:deleteComment": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const commentId = z.object({ commentId: z.string() }).parse(args ?? {}).commentId;
    const rows = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);
    if (rows[0] && (rows[0].authorId === user.id || user.isAdmin)) {
      // Removing a comment takes its whole reply subtree with it (the ALTER
      // that added parent_id couldn't carry ON DELETE CASCADE, so walk it
      // here) and clears the likes that pointed at any removed comment.
      const doomedIds = [rows[0].id];
      let frontier = [rows[0].id];
      while (frontier.length > 0) {
        const childIds: string[] = [];
        for (const chunk of chunkForSqlParams(frontier, 1)) {
          const childRows = await db
            .select({ id: comments.id })
            .from(comments)
            .where(inArray(comments.parentId, chunk));
          childIds.push(...childRows.map((row) => row.id));
        }
        doomedIds.push(...childIds);
        frontier = childIds;
      }
      for (const chunk of chunkForSqlParams(doomedIds, 1)) {
        await db.delete(comments).where(inArray(comments.id, chunk));
        await db
          .delete(likes)
          .where(and(eq(likes.targetType, "comment"), inArray(likes.targetId, chunk)));
      }
    }
    return { success: true };
  },
  "watchStates:setStatus": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z
      .object({
        showId: z.string(),
        // "completed" still arrives from old clients; it means "I watched it
        // all" and resolves to finished/caught_up below, same as "finished".
        status: z.enum([
          "watchlist",
          "watching",
          "caught_up",
          "finished",
          "paused",
          "dropped",
          "completed",
        ]),
      })
      .parse(args ?? {});
    const now = Date.now();
    const isWatchedAll =
      parsed.status === "completed" ||
      parsed.status === "finished" ||
      parsed.status === "caught_up";

    let status: WatchStatus = isWatchedAll
      ? "finished"
      : (parsed.status as WatchStatus);
    if (isWatchedAll) {
      // "Watched it all" writes every released episode into progress first,
      // then lands on the tier the show's air status supports: finished for
      // ended shows, caught_up for returning ones. A backfill hiccup falls
      // back to the user's literal choice — a retap retries it (idempotent).
      try {
        await backfillReleasedEpisodes(user.id, parsed.showId, now);
        const facts = await loadShowProgressFacts(user.id, parsed.showId);
        status = resolveWatchTier(facts);
        if (status === "watching" && facts.releasedCount === 0) {
          // Metadata too thin to judge: honor the user's statement instead
          // of downgrading it to watching.
          status = parsed.status === "caught_up" ? "caught_up" : "finished";
        }
      } catch (error) {
        console.error("Watched-status episode backfill failed:", error);
        status = parsed.status === "caught_up" ? "caught_up" : "finished";
      }
    }

    const existing = await db.select().from(watchStates).where(and(eq(watchStates.userId, user.id), eq(watchStates.showId, parsed.showId))).limit(1);
    let stateId: string;
    if (existing[0]) {
      await db.update(watchStates).set({ status, updatedAt: now }).where(eq(watchStates.id, existing[0].id));
      stateId = existing[0].id;
    } else {
      stateId = createId("state");
      await db.insert(watchStates).values({ id: stateId, userId: user.id, showId: parsed.showId, status, updatedAt: now });
    }
    return stateId;
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
  // The deliberate "log a viewing" action, at any scope: episode (season +
  // episode set), whole season (season only), or whole show (neither).
  // Append-only — logging an episode a third time is a third row — with an
  // independent date (exact, backdated day/month/year, or unknown) and
  // optional per-viewing rating/reaction/note.
  "watchLogs:logWatch": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z
      .object({
        showId: z.string(),
        seasonNumber: z.number().int().min(0).optional(),
        episodeNumber: z.number().int().min(0).optional(),
        episodeTitle: z.string().optional(),
        watchedAt: z.number().optional(),
        watchedOn: z.string().optional(),
        datePrecision: z.enum(WATCH_LOG_DATE_PRECISIONS).optional(),
        note: z.string().max(2000).optional(),
        rating: z.number().min(0.5).max(5).optional(),
        reaction: z.string().min(1).max(16).optional(),
        isRewatch: z.boolean().optional(),
        // Whether the log should also mark unwatched episodes as watched
        // (default yes — logging a viewing implies you've seen it).
        markWatched: z.boolean().optional(),
        // Season scope only: the episodes to mark watched alongside the log.
        markEpisodes: z
          .array(z.object({ episodeNumber: z.number().int().min(0), title: z.string().optional() }))
          .max(500)
          .optional(),
      })
      .parse(args ?? {});
    if (parsed.episodeNumber != null && parsed.seasonNumber == null) {
      throw new ApiError(400, "invalid_scope", "An episode log needs its season number");
    }
    const note = parsed.note?.trim() || null;
    await moderateText("log", [note ?? undefined]);
    const now = Date.now();
    const resolved = resolveWatchLogDate(parsed, now);
    const isEpisodeScope = parsed.seasonNumber != null && parsed.episodeNumber != null;

    // For episode scope the progress table decides rewatch-ness (already
    // watched = rewatch) unless the client overrides it.
    let alreadyWatched = false;
    if (isEpisodeScope) {
      const existing = await db
        .select({ id: episodeProgress.id })
        .from(episodeProgress)
        .where(
          and(
            eq(episodeProgress.userId, user.id),
            eq(episodeProgress.showId, parsed.showId),
            eq(episodeProgress.seasonNumber, parsed.seasonNumber!),
            eq(episodeProgress.episodeNumber, parsed.episodeNumber!),
          ),
        )
        .limit(1);
      alreadyWatched = Boolean(existing[0]);
    }
    const isRewatch = parsed.isRewatch ?? alreadyWatched;

    // Logging implies watched: fill progress idempotently (never duplicate,
    // never create the plain auto-log — this log IS the diary entry).
    if (parsed.markWatched !== false) {
      if (isEpisodeScope && !alreadyWatched) {
        await assertEpisodeExistsForMark(parsed.showId, parsed.seasonNumber!, parsed.episodeNumber!);
        const created = await insertEpisodeProgressOnce({
          userId: user.id,
          showId: parsed.showId,
          seasonNumber: parsed.seasonNumber!,
          episodeNumber: parsed.episodeNumber!,
          watchedAt: resolved.watchedAt,
        });
        if (created) {
          await syncWatchStateAfterEpisodeChange(user.id, parsed.showId, now, "marked");
        }
      } else if (!isEpisodeScope && parsed.seasonNumber != null && parsed.markEpisodes?.length) {
        const seasonSummaries = await readShowSeasonSummaries(parsed.showId);
        const markable = seasonSummaries
          ? parsed.markEpisodes.filter((episode) =>
              isEpisodeVerified(
                { seasonNumber: parsed.seasonNumber!, episodeNumber: episode.episodeNumber },
                seasonSummaries,
              ),
            )
          : parsed.markEpisodes;
        let createdAny = false;
        for (const episode of markable) {
          const created = await insertEpisodeProgressOnce({
            userId: user.id,
            showId: parsed.showId,
            seasonNumber: parsed.seasonNumber!,
            episodeNumber: episode.episodeNumber,
            watchedAt: resolved.watchedAt,
          });
          createdAny = createdAny || created;
        }
        if (createdAny) {
          await syncWatchStateAfterEpisodeChange(user.id, parsed.showId, now, "marked");
        }
      }
    }

    const logId = createId("log");
    await db.insert(watchLogs).values({
      id: logId,
      userId: user.id,
      showId: parsed.showId,
      watchedAt: resolved.watchedAt,
      note,
      seasonNumber: parsed.seasonNumber ?? null,
      episodeNumber: parsed.episodeNumber ?? null,
      episodeTitle: parsed.episodeTitle ?? null,
      datePrecision: resolved.datePrecision,
      watchedOn: resolved.watchedOn,
      createdAt: now,
      rating: parsed.rating ?? null,
      reaction: parsed.reaction?.trim() || null,
      isRewatch,
    });
    // One feed item per logged viewing, stamped "now" so a backdated entry
    // surfaces to followers when it was logged, not buried years deep.
    await addFeedForFollowers(user.id, "log", logId, parsed.showId, now);
    return logId;
  },
  // Every field of a logged viewing is editable independently — including
  // its date — without touching any other viewing of the same episode.
  "watchLogs:updateLog": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z
      .object({
        logId: z.string(),
        watchedAt: z.number().optional(),
        watchedOn: z.string().nullable().optional(),
        datePrecision: z.enum(WATCH_LOG_DATE_PRECISIONS).optional(),
        note: z.string().max(2000).nullable().optional(),
        rating: z.number().min(0.5).max(5).nullable().optional(),
        reaction: z.string().max(16).nullable().optional(),
        isRewatch: z.boolean().optional(),
      })
      .parse(args ?? {});
    const rows = await db
      .select()
      .from(watchLogs)
      .where(and(eq(watchLogs.id, parsed.logId), eq(watchLogs.userId, user.id)))
      .limit(1);
    const log = rows[0];
    if (!log) {
      throw new ApiError(404, "log_not_found", "That diary entry no longer exists");
    }
    const note = parsed.note === undefined ? undefined : parsed.note?.trim() || null;
    if (note) {
      await moderateText("log", [note]);
    }

    // Any date field present re-resolves the full date triple, so precision,
    // calendar period, and sort key can never drift apart.
    const hasDateChange =
      parsed.datePrecision !== undefined ||
      parsed.watchedOn !== undefined ||
      parsed.watchedAt !== undefined;
    const resolved = hasDateChange
      ? resolveWatchLogDate(
          {
            watchedAt: parsed.watchedAt,
            watchedOn: parsed.watchedOn ?? undefined,
            datePrecision: parsed.datePrecision,
          },
          Date.now(),
        )
      : null;

    await db
      .update(watchLogs)
      .set({
        ...(resolved
          ? {
              watchedAt: resolved.watchedAt,
              watchedOn: resolved.watchedOn,
              datePrecision: resolved.datePrecision,
            }
          : {}),
        ...(note !== undefined ? { note } : {}),
        ...(parsed.rating !== undefined ? { rating: parsed.rating } : {}),
        ...(parsed.reaction !== undefined ? { reaction: parsed.reaction?.trim() || null } : {}),
        ...(parsed.isRewatch !== undefined ? { isRewatch: parsed.isRewatch } : {}),
      })
      .where(eq(watchLogs.id, log.id));
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
    await moderateText("review", [parsed.reviewText]);
    const now = Date.now();
    // One review per user per target: repeat submissions replace the existing
    // show review (or episode review for the same S/E) instead of stacking.
    const existing = await db
      .select()
      .from(reviews)
      .where(
        and(
          eq(reviews.authorId, user.id),
          eq(reviews.showId, parsed.showId),
          parsed.seasonNumber != null
            ? eq(reviews.seasonNumber, parsed.seasonNumber)
            : isNull(reviews.seasonNumber),
          parsed.episodeNumber != null
            ? eq(reviews.episodeNumber, parsed.episodeNumber)
            : isNull(reviews.episodeNumber),
        ),
      )
      .limit(1);
    if (existing[0]) {
      await db.update(reviews).set({
        rating: parsed.rating,
        reviewText: parsed.reviewText ?? null,
        spoiler: parsed.spoiler ?? false,
        episodeTitle: parsed.episodeTitle ?? existing[0].episodeTitle,
        updatedAt: now,
      }).where(eq(reviews.id, existing[0].id));
      // Followers already saw the original review; edits don't re-fan.
      return existing[0].id;
    }
    const id = createId("review");
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
    const parsed = z.object({
      showId: z.string(),
      seasonNumber: z.number(),
      episodeNumber: z.number(),
      episodeTitle: z.string().optional(),
      rating: z.number(),
      // Omitted -> keep the existing note; empty string or null -> clear it.
      reviewText: z.string().nullable().optional(),
    }).parse(args ?? {});
    // No-op unless the user actually wrote a note, so plain star taps stay fast.
    await moderateText("review", [parsed.reviewText]);
    const existing = await db.select().from(reviews).where(and(eq(reviews.authorId, user.id), eq(reviews.showId, parsed.showId), eq(reviews.seasonNumber, parsed.seasonNumber), eq(reviews.episodeNumber, parsed.episodeNumber))).limit(1);
    const now = Date.now();
    const normalizedText =
      parsed.reviewText === undefined ? undefined : parsed.reviewText?.trim() || null;
    if (existing[0]) {
      await db.update(reviews).set({
        rating: parsed.rating,
        episodeTitle: parsed.episodeTitle ?? existing[0].episodeTitle,
        ...(normalizedText !== undefined ? { reviewText: normalizedText } : {}),
        updatedAt: now,
      }).where(eq(reviews.id, existing[0].id));
      return existing[0].id;
    }
    const id = createId("review");
    await db.insert(reviews).values({ id, authorId: user.id, showId: parsed.showId, rating: parsed.rating, reviewText: normalizedText ?? null, spoiler: false, seasonNumber: parsed.seasonNumber, episodeNumber: parsed.episodeNumber, episodeTitle: parsed.episodeTitle ?? null, createdAt: now, updatedAt: now });
    // First rating of an episode reaches followers like any other review;
    // later rating tweaks on the same episode don't re-fan.
    await addFeedForFollowers(user.id, "review", id, parsed.showId, now);
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
    const parsed = z
      .object({
        title: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        isPublic: z.boolean().optional(),
        commentsEnabled: z.boolean().optional(),
        // Seeds the list with a first show so "new list" flows from a show
        // page land fully formed in one round trip.
        showId: z.string().optional(),
      })
      .parse(args ?? {});
    const title = parsed.title.trim();
    if (!title) {
      throw new ApiError(400, "invalid_title", "Give your list a name.");
    }
    await moderateText("list", [title, parsed.description]);
    const id = createId("list");
    const now = Date.now();
    await db.insert(lists).values({
      id,
      ownerId: user.id,
      title,
      description: parsed.description?.trim() || null,
      isPublic: parsed.isPublic ?? true,
      commentsEnabled: parsed.commentsEnabled ?? true,
      coverUrl: null,
      createdAt: now,
      updatedAt: now,
    });
    if (parsed.showId) {
      const showRows = await db.select().from(shows).where(eq(shows.id, parsed.showId)).limit(1);
      if (showRows[0]) {
        await db.insert(listItems).values({
          id: createId("listitem"),
          listId: id,
          showId: parsed.showId,
          position: 1,
          addedAt: now,
        });
      }
    }
    if (parsed.isPublic ?? true) {
      await addFeedForFollowers(user.id, "list", id, null, now);
    }
    return id;
  },
  "lists:update": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z
      .object({
        listId: z.string(),
        title: z.string().min(1).max(100).optional(),
        description: z.string().max(500).nullable().optional(),
        isPublic: z.boolean().optional(),
        commentsEnabled: z.boolean().optional(),
      })
      .parse(args ?? {});
    const listRows = await db
      .select()
      .from(lists)
      .where(and(eq(lists.id, parsed.listId), eq(lists.ownerId, user.id)))
      .limit(1);
    if (!listRows[0]) throw new ApiError(404, "list_not_found", "List not found");
    await moderateText("list", [parsed.title, parsed.description]);
    const updates: Partial<typeof lists.$inferInsert> = { updatedAt: Date.now() };
    if (parsed.title !== undefined) {
      const title = parsed.title.trim();
      if (!title) {
        throw new ApiError(400, "invalid_title", "Give your list a name.");
      }
      updates.title = title;
    }
    if (parsed.description !== undefined) {
      updates.description = parsed.description?.trim() || null;
    }
    if (parsed.isPublic !== undefined) {
      updates.isPublic = parsed.isPublic;
    }
    if (parsed.commentsEnabled !== undefined) {
      updates.commentsEnabled = parsed.commentsEnabled;
    }
    await db.update(lists).set(updates).where(eq(lists.id, parsed.listId));
    return { success: true };
  },
  "lists:deleteList": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const listId = z.object({ listId: z.string() }).parse(args ?? {}).listId;
    const listRows = await db
      .select()
      .from(lists)
      .where(and(eq(lists.id, listId), eq(lists.ownerId, user.id)))
      .limit(1);
    if (!listRows[0]) {
      // Already gone (double-tap or another device) — deleting is idempotent.
      return { success: true };
    }
    await db.delete(listItems).where(eq(listItems.listId, listId));
    await db.delete(listFollows).where(eq(listFollows.listId, listId));
    await db.delete(comments).where(and(eq(comments.targetType, "list"), eq(comments.targetId, listId)));
    await db.delete(likes).where(and(eq(likes.targetType, "list"), eq(likes.targetId, listId)));
    await db.delete(feedItems).where(and(eq(feedItems.type, "list"), eq(feedItems.targetId, listId)));
    await db.delete(lists).where(and(eq(lists.id, listId), eq(lists.ownerId, user.id)));
    return { success: true };
  },
  "lists:follow": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const listId = z.object({ listId: z.string() }).parse(args ?? {}).listId;
    const list = await getViewableList(listId, user.id);
    if (!list) throw new ApiError(404, "list_not_found", "List not found");
    if (list.ownerId === user.id) {
      throw new ApiError(400, "own_list", "You already own this list.");
    }
    const existing = await db
      .select()
      .from(listFollows)
      .where(and(eq(listFollows.listId, listId), eq(listFollows.userId, user.id)))
      .limit(1);
    if (!existing[0]) {
      await db.insert(listFollows).values({
        id: createId("listfollow"),
        listId,
        userId: user.id,
        createdAt: Date.now(),
      });
      await notifyListFollow(user, list.ownerId, listId, list.title);
    }
    return { following: true };
  },
  "lists:unfollow": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const listId = z.object({ listId: z.string() }).parse(args ?? {}).listId;
    await db
      .delete(listFollows)
      .where(and(eq(listFollows.listId, listId), eq(listFollows.userId, user.id)));
    return { following: false };
  },
  "listItems:toggle": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ listId: z.string(), showId: z.string() }).parse(args ?? {});
    const listRows = await db.select().from(lists).where(and(eq(lists.id, parsed.listId), eq(lists.ownerId, user.id))).limit(1);
    if (!listRows[0]) throw new ApiError(404, "list_not_found", "List not found");
    const now = Date.now();
    const existing = await db.select().from(listItems).where(and(eq(listItems.listId, parsed.listId), eq(listItems.showId, parsed.showId))).limit(1);
    if (existing[0]) {
      await db.delete(listItems).where(eq(listItems.id, existing[0].id));
      await db.update(lists).set({ updatedAt: now }).where(eq(lists.id, parsed.listId));
      return false;
    }
    // MAX(position) instead of COUNT: removals leave gaps, and count-based
    // positions collide with survivors (unique list+show index aside, two
    // rows sharing a position breaks ordering).
    const maxRows = await db
      .select({ maxPosition: sql<number>`coalesce(max(${listItems.position}), 0)` })
      .from(listItems)
      .where(eq(listItems.listId, parsed.listId));
    const id = createId("listitem");
    await db.insert(listItems).values({
      id,
      listId: parsed.listId,
      showId: parsed.showId,
      position: Number(maxRows[0]?.maxPosition ?? 0) + 1,
      addedAt: now,
    });
    await db.update(lists).set({ updatedAt: now }).where(eq(lists.id, parsed.listId));
    return true;
  },
  "listItems:reorder": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ listId: z.string(), orderedIds: z.array(z.string()).optional(), itemIds: z.array(z.string()).optional() }).parse(args ?? {});
    const listRows = await db.select().from(lists).where(and(eq(lists.id, parsed.listId), eq(lists.ownerId, user.id))).limit(1);
    if (!listRows[0]) throw new ApiError(404, "list_not_found", "List not found");
    const ids = parsed.orderedIds ?? parsed.itemIds ?? [];
    // Scoped to the list so stray ids can't renumber another list's rows.
    await Promise.all(
      ids.map((id, index) =>
        db
          .update(listItems)
          .set({ position: index + 1 })
          .where(and(eq(listItems.id, id), eq(listItems.listId, parsed.listId))),
      ),
    );
    await db.update(lists).set({ updatedAt: Date.now() }).where(eq(lists.id, parsed.listId));
    return { success: true };
  },
  "episodeProgress:toggleEpisode": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ showId: z.string(), seasonNumber: z.number(), episodeNumber: z.number(), episodeTitle: z.string().optional(), createLog: z.boolean().optional() }).parse(args ?? {});
    const now = Date.now();
    const existing = await db.select().from(episodeProgress).where(and(eq(episodeProgress.userId, user.id), eq(episodeProgress.showId, parsed.showId), eq(episodeProgress.seasonNumber, parsed.seasonNumber), eq(episodeProgress.episodeNumber, parsed.episodeNumber))).limit(1);
    if (existing[0]) {
      await db.delete(episodeProgress).where(eq(episodeProgress.id, existing[0].id));
      await deletePlainEpisodeWatchLogs({
        userId: user.id,
        showId: parsed.showId,
        seasonNumber: parsed.seasonNumber,
        episodeNumber: parsed.episodeNumber,
      });
      await syncWatchStateAfterEpisodeChange(user.id, parsed.showId, now, "unmarked");
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
    // Single-episode marks are deliberate watch moments: they log by default
    // (createLog omitted or true); older clients that never sent the flag get
    // diary entries too, which is the product intent.
    if ((parsed.createLog ?? true) && created) {
      await createEpisodeWatchLog({
        userId: user.id,
        showId: parsed.showId,
        seasonNumber: parsed.seasonNumber,
        episodeNumber: parsed.episodeNumber,
        episodeTitle: parsed.episodeTitle,
        watchedAt: now,
        fanOutToFeeds: true,
      });
    }
    await syncWatchStateAfterEpisodeChange(user.id, parsed.showId, now, "marked");
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
    if ((parsed.createLog ?? true) && created) {
      await createEpisodeWatchLog({
        userId: user.id,
        showId: parsed.showId,
        seasonNumber: parsed.seasonNumber,
        episodeNumber: parsed.episodeNumber,
        episodeTitle: parsed.episodeTitle,
        watchedAt: now,
        fanOutToFeeds: true,
      });
    }
    await syncWatchStateAfterEpisodeChange(user.id, parsed.showId, now, "marked");
    return true;
  },
  "episodeProgress:markWatchedUpTo": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z
      .object({
        showId: z.string(),
        seasonNumber: z.number().int().min(1),
        episodeNumber: z.number().int().min(1),
        episodeTitle: z.string().optional(),
      })
      .parse(args ?? {});
    const now = Date.now();
    await assertEpisodeExistsForMark(parsed.showId, parsed.seasonNumber, parsed.episodeNumber);
    // Everything released up to and including the target: logged like other
    // bulk catch-ups (diary yes, feed fan-out no).
    const backfill = await backfillReleasedEpisodes(user.id, parsed.showId, now, {
      seasonNumber: parsed.seasonNumber,
      episodeNumber: parsed.episodeNumber,
    });
    // A just-aired target can sit past a stale released frontier (the release
    // event proved it exists above) — make sure the tapped episode itself
    // always lands.
    const createdTarget = await insertEpisodeProgressOnce({
      userId: user.id,
      showId: parsed.showId,
      seasonNumber: parsed.seasonNumber,
      episodeNumber: parsed.episodeNumber,
      watchedAt: now,
    });
    if (createdTarget) {
      await createEpisodeWatchLog({
        userId: user.id,
        showId: parsed.showId,
        seasonNumber: parsed.seasonNumber,
        episodeNumber: parsed.episodeNumber,
        episodeTitle: parsed.episodeTitle,
        watchedAt: now,
        fanOutToFeeds: false,
      });
    }
    await syncWatchStateAfterEpisodeChange(user.id, parsed.showId, now, "marked");
    return { marked: backfill.marked + (createdTarget ? 1 : 0) };
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
      const created = await insertEpisodeProgressOnce({
        userId: user.id,
        showId: parsed.showId,
        seasonNumber: parsed.seasonNumber,
        episodeNumber: episode.episodeNumber,
        watchedAt: now,
      });
      // Bulk marks default to createLog=false so status-change backfills and
      // older clients stay out of the diary; the explicit season button opts
      // in. Never fan out to feeds here — one tap must not post an item per
      // episode to every follower.
      if (parsed.createLog === true && created) {
        await createEpisodeWatchLog({
          userId: user.id,
          showId: parsed.showId,
          seasonNumber: parsed.seasonNumber,
          episodeNumber: episode.episodeNumber,
          episodeTitle: episode.title,
          watchedAt: now,
          fanOutToFeeds: false,
        });
      }
    }
    await syncWatchStateAfterEpisodeChange(user.id, parsed.showId, now, "marked");
    return { success: true };
  },
  "episodeProgress:unmarkSeasonWatched": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ showId: z.string(), seasonNumber: z.number() }).parse(args ?? {});
    const now = Date.now();
    await db.delete(episodeProgress).where(and(eq(episodeProgress.userId, user.id), eq(episodeProgress.showId, parsed.showId), eq(episodeProgress.seasonNumber, parsed.seasonNumber)));
    await deletePlainEpisodeWatchLogs({
      userId: user.id,
      showId: parsed.showId,
      seasonNumber: parsed.seasonNumber,
    });
    await syncWatchStateAfterEpisodeChange(user.id, parsed.showId, now, "unmarked");
    return { success: true };
  },
  "reports:create": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z
      .object({
        targetType: z.enum(["review", "log", "list", "user", "comment"]),
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
    const reportRows = await db.select().from(reports).where(eq(reports.id, parsed.reportId)).limit(1);
    if (!reportRows[0]) {
      throw new ApiError(404, "report_not_found", "Report not found");
    }
    if (parsed.action === "delete") {
      await deleteReportedContent(reportRows[0].targetType, reportRows[0].targetId);
    }
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
  // One-time phone verification for an already-signed-in user (the optional
  // "find your friends" onboarding step) — attaches the hash used for
  // contact matching without making phone a login method.
  "phone:attachVerified": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ phone: z.string(), code: z.string().min(1) }).parse(args ?? {});
    const normalizedPhone = normalizePhoneNumber(parsed.phone);
    if (!normalizedPhone) {
      throw new ApiError(400, "invalid_phone", "Enter a valid phone number");
    }

    const usingAppReviewBypass = matchesAppReviewBypass(normalizedPhone, parsed.code.trim());
    if (!usingAppReviewBypass) {
      await enforceRateLimit(rateLimitKey("phone-verify", normalizedPhone), 10, 10 * 60 * 1000);
      await enforceRateLimit(clientRateLimitKey(req, "phone-verify-ip"), 30, 10 * 60 * 1000);
    }

    const verified =
      usingAppReviewBypass ||
      (await verifyPhoneVerificationCode(normalizedPhone, parsed.code));
    if (!verified) {
      throw new ApiError(
        401,
        "invalid_verification_code",
        "That code was invalid or expired. Request a new code and try again.",
      );
    }

    const now = Date.now();
    const phoneHash = hashPhoneNumber(normalizedPhone);
    await db
      .update(phoneVerificationRequests)
      .set({ completedAt: now })
      .where(
        and(
          eq(phoneVerificationRequests.phoneHash, phoneHash),
          isNull(phoneVerificationRequests.completedAt),
          gte(phoneVerificationRequests.expiresAt, now),
        ),
      );

    const conflictRows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phoneHash, phoneHash))
      .limit(1);
    if (conflictRows[0] && conflictRows[0].id !== user.id) {
      throw new ApiError(
        409,
        "phone_in_use",
        "That number already belongs to another Plotlist account. Sign in with your phone number instead to keep that account's history.",
      );
    }

    await db
      .update(users)
      .set({ phoneHash, phoneVerificationTime: now })
      .where(eq(users.id, user.id));
    await ensurePhoneIdentity(user.id, phoneHash);

    // Friends who synced their contacts before this user attached a number
    // learn about them now, not whenever they happen to resync.
    try {
      await linkJoinedUserToContacts({ ...user, phoneHash });
    } catch (error) {
      console.warn("[contacts] linking attached phone to contact books failed", error);
    }

    return { ok: true };
  },
  "contacts:syncSnapshot": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = syncContactsArgs.parse(args ?? {});
    await enforceRateLimit(rateLimitKey("contacts-sync", user.id), 6, 10 * 60 * 1000);
    return await syncContactSnapshot(user.id, parsed.entries);
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
    return await fetchAndCacheShowDetails(show, cached[0]);
  },
  "people:getDetails": async ({ args }) => {
    const parsed = z.object({ personId: z.number().int().positive() }).parse(args ?? {});
    const payload = (await fetchPersonPayload(parsed.personId)) as any;
    if (!payload?.id) return null;
    const [castCredits, crewCredits] = await Promise.all([
      resolvePersonCredits(mergeTvCredits(payload.tv_credits?.cast)),
      resolvePersonCredits(mergeTvCredits(payload.tv_credits?.crew)),
    ]);
    return {
      id: payload.id,
      name: payload.name ?? "",
      profilePath: tmdbImageUrl(payload.profile_path, "w342"),
      biography: typeof payload.biography === "string" ? payload.biography : "",
      birthday: payload.birthday ?? null,
      deathday: payload.deathday ?? null,
      placeOfBirth: payload.place_of_birth ?? null,
      knownForDepartment: payload.known_for_department ?? null,
      castCredits,
      crewCredits,
    };
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
    // Vector path first (recs v2); falls back to the trending heuristics for
    // anonymous users, signal-less accounts, or missing vector infra.
    try {
      const vectorItems = await getPersonalizedRecommendationsV2(user?.id, limit);
      if (vectorItems && vectorItems.length >= Math.min(limit, 6)) {
        return vectorItems;
      }
    } catch (error) {
      console.warn("[recs] personalized vector path failed; using fallback", error);
    }
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
    try {
      const vectorRails = await getHomeRecommendationRailsV2(user?.id, limit);
      if (vectorRails && vectorRails.length > 0) {
        return vectorRails;
      }
    } catch (error) {
      console.warn("[recs] rails vector path failed; using fallback", error);
    }
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
    const previews = await getSimilarTasteUserPreviews(user.id, Math.min(parsed.limit ?? 10, 30));
    // Attach a calibrated taste-match percent per person (recs v2). Capped so
    // a long list can't trigger a pile of profile builds in one request;
    // failures leave the heuristic previews intact.
    try {
      await Promise.all(
        previews.slice(0, 8).map(async (preview: any) => {
          const targetId = preview?.user?._id ?? preview?.user?.id;
          if (!targetId || targetId === user.id) return;
          const percent = await computeTasteMatchPercent(user.id, targetId);
          if (percent !== null) preview.tasteMatchPercent = percent;
        }),
      );
    } catch (error) {
      console.warn("[recs] similar-taste percent enrichment failed", error);
    }
    return previews;
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
    try {
      const facetLists = await getSmartListsV2(limit);
      if (facetLists && facetLists.length > 0) {
        return facetLists;
      }
    } catch (error) {
      console.warn("[recs] smart-lists vector path failed; using fallback", error);
    }
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

    // Vector path first (recs v2): ANN neighbors blended with TMDB co-watch.
    // Falls through to the TMDB-recommendations path for un-embedded shows.
    try {
      const vectorSimilar = await getSimilarShowsV2(source, limit);
      if (vectorSimilar && vectorSimilar.length >= Math.min(limit, 6)) {
        return vectorSimilar;
      }
    } catch (error) {
      console.warn("[recs] similar-shows vector path failed; using fallback", error);
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
  "embeddings:getProfileTasteExperience": async ({ args, req }) => {
    const parsed = z.object({ userId: z.string().optional() }).parse(args ?? {});
    const viewer = await getOptionalAuthUser(req);
    const targetUserId = parsed.userId ?? viewer?.id;
    if (!targetUserId) {
      return { topGenres: [], favoriteShows: [], tasteSummary: null, tasteMatch: null };
    }
    try {
      const experience = await getProfileTasteExperienceV2(viewer?.id, targetUserId);
      if (experience) {
        return experience;
      }
    } catch (error) {
      console.warn("[recs] taste experience vector path failed; using stub", error);
    }
    return { topGenres: [], favoriteShows: [], tasteSummary: null, tasteMatch: null };
  },
  // Recs v2 surfaces: free-text semantic search and facet/category browsing.
  "embeddings:searchByVibe": async ({ args }) => {
    const parsed = z
      .object({ query: z.string().min(2).max(300), limit: z.number().optional() })
      .parse(args ?? {});
    const limit = Math.min(parsed.limit ?? 20, 40);
    const results = await vibeSearchShows(parsed.query, limit);
    return results ?? [];
  },
  "embeddings:getFacetBrowse": async () => {
    return await getFacetBrowse();
  },
  "embeddings:getFacetPreviews": async ({ args }) => {
    const parsed = z
      .object({ facetKeys: z.array(z.string()).min(1).max(40) })
      .parse(args ?? {});
    return await getFacetPreviews(parsed.facetKeys);
  },
  "embeddings:getFacetShows": async ({ args }) => {
    const parsed = z
      .object({ facetKey: z.string(), limit: z.number().optional() })
      .parse(args ?? {});
    return await getFacetShows(parsed.facetKey, Math.min(parsed.limit ?? 30, 60));
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

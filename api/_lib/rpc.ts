import type { IncomingMessage } from "node:http";

import { and, asc, count, desc, eq, gte, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod";

import {
  comments,
  contactSyncEntries,
  episodeProgress,
  feedItems,
  follows,
  likes,
  lists,
  listItems,
  phoneVerificationRequests,
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
import { normalizePhoneNumber, hashPhoneNumber } from "./phone";
import { requireAuthUser, getOptionalAuthUser } from "./request-auth";
import { enforceRateLimit } from "./rate-limit";
import { buildPersonPreviews, normalizeSearchText, toClientUser } from "./social";
import { sendPhoneVerificationCode } from "./twilio";
import { createUploadToken, getRequestOrigin } from "./uploads";

type RpcHandler = (input: {
  args: any;
  req: IncomingMessage;
}) => Promise<unknown>;

const ensureProfileArgs = z.object({
  username: z.string().optional(),
  displayName: z.string().optional(),
});

const updateProfileArgs = z.object({
  username: z.string().optional(),
  displayName: z.string().optional(),
  bio: z.string().nullable().optional(),
  favoriteShowIds: z.array(z.string()).optional(),
  favoriteGenres: z.array(z.string()).optional(),
  avatarStorageId: z.string().optional(),
  profileVisibility: z.record(z.string(), z.any()).optional(),
  releaseCalendarPreferences: z
    .object({
      selectedProviders: z.array(z.string()),
    })
    .optional(),
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

function matchesReleaseView(row: typeof releaseEvents.$inferSelect, view: string, today: string) {
  if (row.airDate < today) {
    return false;
  }

  switch (view) {
    case "tonight":
      return row.airDate === today;
    case "premieres":
      return row.isPremiere;
    case "finales":
      return row.isSeasonFinale;
    case "upcoming":
    default:
      return true;
  }
}

function buildReleaseGroups(
  rows: Array<typeof releaseEvents.$inferSelect>,
  showRows: Array<typeof shows.$inferSelect>,
  args: {
    limit?: number;
    today: string;
    view?: string;
  },
) {
  const showMap = new Map(showRows.map((show) => [show.id, showToDoc(show)] as const));
  const items = rows
    .filter((row) => matchesReleaseView(row, args.view ?? "upcoming", args.today))
    .map((row) => ({
      ...toDoc(row),
      show: showMap.get(row.showId) ?? null,
      providers: [],
    }))
    .filter((item) => item.show)
    .sort((left, right) => {
      return (
        left.airDateTs - right.airDateTs ||
        left.show.title.localeCompare(right.show.title) ||
        left.seasonNumber - right.seasonNumber ||
        left.episodeNumber - right.episodeNumber
      );
    })
    .slice(0, Math.max(1, Math.min(args.limit ?? 25, 100)));

  const groups: Array<{ airDate: string; airDateTs: number; items: any[] }> = [];
  for (const item of items) {
    const previous = groups[groups.length - 1];
    if (previous?.airDate === item.airDate) {
      previous.items.push(item);
    } else {
      groups.push({ airDate: item.airDate, airDateTs: item.airDateTs, items: [item] });
    }
  }

  return groups;
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

const providerIds: Record<string, number> = {
  netflix: 8,
  apple_tv: 350,
  max: 1899,
  disney_plus: 337,
  hulu: 15,
  prime_video: 9,
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

async function getTmdbList(category: string, limit: number, page: number) {
  const cacheKey = `${category}:${page}:${limit}`;
  const cached = await db.select().from(tmdbListCache).where(eq(tmdbListCache.category, cacheKey)).limit(1);
  if (cached[0] && cached[0].expiresAt > Date.now()) {
    return cached[0].results as any[];
  }

  let payload: any;
  if (category === "on_the_air") {
    payload = await tmdb("/tv/on_the_air", { page });
  } else if (providerIds[category]) {
    payload = await tmdb("/discover/tv", {
      page,
      watch_region: "US",
      with_watch_providers: providerIds[category],
      sort_by: "popularity.desc",
    });
  } else {
    payload = await tmdb("/tv/popular", { page });
  }
  const results = (payload.results ?? []).map(catalogFromTmdb).slice(0, limit);
  const now = Date.now();
  const expiresAt = now + 6 * 60 * 60 * 1000;
  if (cached[0]) {
    await db.update(tmdbListCache).set({ results, fetchedAt: now, expiresAt }).where(eq(tmdbListCache.id, cached[0].id));
  } else {
    await db.insert(tmdbListCache).values({ id: createId("tmdblist"), category: cacheKey, results, fetchedAt: now, expiresAt });
  }
  return results;
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
  const payload = {
    externalSource,
    externalId,
    title: item.title ?? "Untitled",
    originalTitle: item.originalTitle ?? item.title ?? null,
    year: item.year ?? null,
    overview: item.overview ?? null,
    posterUrl: item.posterUrl ?? null,
    backdropUrl: item.backdropUrl ?? null,
    genreIds: item.genreIds ?? null,
    originalLanguage: item.originalLanguage ?? null,
    originCountries: item.originCountries ?? null,
    tmdbPopularity: item.tmdbPopularity ?? null,
    tmdbVoteAverage: item.tmdbVoteAverage ?? null,
    tmdbVoteCount: item.tmdbVoteCount ?? null,
    searchText: normalizeSearchText(`${item.title ?? ""} ${item.overview ?? ""}`),
    updatedAt: now,
  };
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
    inviteCount: entries.filter((entry) => !entry.matchedUserId).length,
    invitedCount: entries.filter((entry) => entry.invitedAt).length,
    lastSyncedAt:
      entries.length > 0
        ? entries.reduce((latest, entry) => Math.max(latest, entry.createdAt), 0)
        : null,
  };
}

async function getEpisodeStats(userId: string) {
  const allEpisodes = await db
    .select()
    .from(episodeProgress)
    .where(eq(episodeProgress.userId, userId))
    .orderBy(desc(episodeProgress.watchedAt));

  const totalEpisodes = allEpisodes.length;
  const showEpCounts = new Map<string, number>();
  for (const entry of allEpisodes) {
    showEpCounts.set(entry.showId, (showEpCounts.get(entry.showId) ?? 0) + 1);
  }

  const showIds = Array.from(showEpCounts.keys());
  const showRows =
    showIds.length > 0 ? await db.select().from(shows).where(inArray(shows.id, showIds)) : [];
  const showById = new Map(showRows.map((show) => [show.id, show]));
  const tmdbExternalIds = showRows
    .filter((show) => show.externalSource === "tmdb")
    .map((show) => show.externalId);
  const caches =
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

  const runtimeByExternalId = new Map<string, number>();
  for (const cache of caches) {
    const runtime = (cache.payload as { episodeRunTime?: unknown } | null)?.episodeRunTime;
    if (typeof runtime === "number" && runtime > 0) {
      runtimeByExternalId.set(cache.externalId, runtime);
    }
  }

  let totalMinutes = 0;
  for (const [showId, epCount] of showEpCounts) {
    const show = showById.get(showId);
    const runtime =
      show?.externalSource === "tmdb" ? runtimeByExternalId.get(show.externalId) : undefined;
    totalMinutes += epCount * (runtime ?? 42);
  }

  return {
    totalEpisodes,
    showsWithProgress: showEpCounts.size,
    totalMinutes,
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
  await db.delete(contactSyncEntries).where(eq(contactSyncEntries.ownerId, userId));
  if (entries.length === 0) {
    return;
  }

  const now = Date.now();
  await db.insert(contactSyncEntries).values(
    entries.map((entry) => ({
      id: createId("contact"),
      ownerId: userId,
      sourceRecordId: entry.sourceRecordId ?? null,
      displayName: entry.displayName,
      contactHash: entry.contactHash,
      matchedUserId: entry.matchedUserId ?? null,
      invitedAt: null,
      createdAt: now,
      updatedAt: now,
    })),
  );
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
    .select()
    .from(contactSyncEntries)
    .where(eq(contactSyncEntries.ownerId, userId))
    .orderBy(desc(contactSyncEntries.updatedAt));
  const contactUserIds = Array.from(
    new Set(contactEntries.flatMap((entry) => (entry.matchedUserId ? [entry.matchedUserId] : []))),
  );
  const contactUsers =
    contactUserIds.length > 0
      ? await db.select().from(users).where(inArray(users.id, contactUserIds))
      : [];

  const previews = await buildPersonPreviews(userId, [
    ...contactUsers.filter((candidate) => Boolean(candidate.username)),
    ...suggestionUsers,
  ]);

  return previews
    .filter((candidate) => !candidate.isFollowing)
    .sort((left, right) => {
      if (Number(right.inContacts) !== Number(left.inContacts)) {
        return Number(right.inContacts) - Number(left.inContacts);
      }
      if (right.mutualCount !== left.mutualCount) {
        return right.mutualCount - left.mutualCount;
      }
      if (Number(right.followsYou) !== Number(left.followsYou)) {
        return Number(right.followsYou) - Number(left.followsYou);
      }
      return 0;
    })
    .slice(0, limit);
}

async function getContactMatches(userId: string, limit: number) {
  const entries = await db
    .select()
    .from(contactSyncEntries)
    .where(eq(contactSyncEntries.ownerId, userId))
    .orderBy(desc(contactSyncEntries.updatedAt));
  const userIds = Array.from(
    new Set(entries.flatMap((entry) => (entry.matchedUserId ? [entry.matchedUserId] : []))),
  ).slice(0, limit);
  if (userIds.length === 0) {
    return [];
  }

  const candidates = await db.select().from(users).where(inArray(users.id, userIds));
  return await buildPersonPreviews(userId, candidates);
}

async function deleteAccount(userId: string) {
  const ownedLists = await db.select().from(lists).where(eq(lists.ownerId, userId));
  const ownedListIds = ownedLists.map((item) => item.id);

  if (ownedListIds.length > 0) {
    await db.delete(listItems).where(inArray(listItems.listId, ownedListIds));
    await db.delete(lists).where(inArray(lists.id, ownedListIds));
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
    db.delete(reports).where(eq(reports.reporterId, userId)),
    db.delete(contactSyncEntries).where(eq(contactSyncEntries.ownerId, userId)),
    db.delete(users).where(eq(users.id, userId)),
  ]);

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
      .map((row) => ({ ...toDoc(row), show: byShow.get(row.showId) ?? null })),
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
  const feedRows = await db
    .select()
    .from(feedItems)
    .where(eq(feedItems.ownerId, userId))
    .orderBy(desc(feedItems.timestamp));
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

async function addFeedForFollowers(actorId: string, type: "review" | "log", targetId: string, showId: string, timestamp: number) {
  const followerRows = await db.select().from(follows).where(eq(follows.followeeId, actorId));
  const ownerIds = Array.from(new Set([actorId, ...followerRows.map((row) => row.followerId)]));
  if (ownerIds.length === 0) {
    return;
  }
  await db.insert(feedItems).values(
    ownerIds.map((ownerId) => ({
      id: createId("feed"),
      ownerId,
      actorId,
      type,
      targetId,
      showId,
      timestamp,
      createdAt: Date.now(),
    })),
  );
}

export const queryHandlers: Record<string, RpcHandler> = {
  "auth:isAuthenticated": async ({ req }) => {
    const user = await getOptionalAuthUser(req);
    return user !== null;
  },
  "users:me": async ({ req }) => {
    const user = await getOptionalAuthUser(req);
    return user ? toClientUser(user) : null;
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
  "users:profile": async ({ args }) => {
    const userId = z.object({ userId: z.string() }).parse(args ?? {}).userId;
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return rows[0] ? toClientUser(rows[0]) : null;
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
    return rows
      .filter((row) => !row.matchedUserId)
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
    return rows.filter((row) => !row.matchedUserId).map(toDoc);
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
  "follows:listFollowersDetailed": async ({ args }) => {
    const parsed = z.object({ userId: z.string() }).passthrough().parse(args ?? {});
    const rows = await db.select().from(follows).where(eq(follows.followeeId, parsed.userId)).orderBy(desc(follows.createdAt));
    const userRows = rows.length ? await db.select().from(users).where(inArray(users.id, rows.map((row) => row.followerId))) : [];
    return pageRows(await buildPersonPreviews(parsed.userId, userRows), args);
  },
  "follows:listFollowingDetailed": async ({ args }) => {
    const parsed = z.object({ userId: z.string() }).passthrough().parse(args ?? {});
    const rows = await db.select().from(follows).where(eq(follows.followerId, parsed.userId)).orderBy(desc(follows.createdAt));
    const userRows = rows.length ? await db.select().from(users).where(inArray(users.id, rows.map((row) => row.followeeId))) : [];
    return pageRows(await buildPersonPreviews(parsed.userId, userRows), args);
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
  "comments:listForTarget": async ({ args }) => {
    const parsed = targetArgs.passthrough().parse(args ?? {});
    const rows = await db
      .select()
      .from(comments)
      .where(and(eq(comments.targetType, parsed.targetType), eq(comments.targetId, parsed.targetId)))
      .orderBy(asc(comments.createdAt));
    const authorRows = rows.length
      ? await db.select().from(users).where(inArray(users.id, rows.map((row) => row.authorId)))
      : [];
    const authors = new Map(authorRows.map((user) => [user.id, toClientUser(user)]));
    return pageRows(rows.map((row) => ({ comment: toDoc(row), author: authors.get(row.authorId) ?? null })), args);
  },
  "shows:get": async ({ args }) => {
    const showId = z.object({ showId: z.string() }).parse(args ?? {}).showId;
    const rows = await db.select().from(shows).where(eq(shows.id, showId)).limit(1);
    return showToDoc(rows[0]);
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
    return {
      watchlist: user.countsWatchlist ?? 0,
      watching: user.countsWatching ?? 0,
      completed: user.countsCompleted ?? 0,
      dropped: user.countsDropped ?? 0,
      total: user.countsTotalShows ?? 0,
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
  "watchStates:listPublicWatchlistDetailed": async ({ args }) => {
    const parsed = z.object({ userId: z.string() }).passthrough().parse(args ?? {});
    return await detailedWatchStates(parsed.userId, { ...args, status: "watchlist" }, true);
  },
  "episodeProgress:getStats": async ({ req }) => {
    const user = await requireAuthUser(req);
    return await getEpisodeStats(user.id);
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
    const rows = await db
      .select()
      .from(watchStates)
      .where(and(eq(watchStates.userId, user.id), eq(watchStates.status, "watching")))
      .orderBy(desc(watchStates.updatedAt))
      .limit(10);
    const showRows = rows.length ? await db.select().from(shows).where(inArray(shows.id, rows.map((row) => row.showId))) : [];
    return showRows.map((show) => ({ show: showToDoc(show), showId: show.id }));
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
    return pageRows(await buildReviewDetails(rows, viewer?.id), args);
  },
  "reviews:listForEpisodeDetailed": async ({ args, req }) => {
    const viewer = await getOptionalAuthUser(req);
    const parsed = z.object({ showId: z.string(), seasonNumber: z.number(), episodeNumber: z.number() }).passthrough().parse(args ?? {});
    const rows = await db
      .select()
      .from(reviews)
      .where(and(eq(reviews.showId, parsed.showId), eq(reviews.seasonNumber, parsed.seasonNumber), eq(reviews.episodeNumber, parsed.episodeNumber)))
      .orderBy(desc(reviews.createdAt));
    return pageRows(await buildReviewDetails(rows, viewer?.id), args);
  },
  "reviews:listForUserDetailed": async ({ args, req }) => {
    const viewer = await getOptionalAuthUser(req);
    const parsed = z.object({ userId: z.string() }).passthrough().parse(args ?? {});
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
    return { count: rows.length, averageRating: rows.length ? rows.reduce((sum, row) => sum + row.rating, 0) / rows.length : null };
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
  "lists:listPublicForUser": async ({ args }) => {
    const parsed = z.object({ userId: z.string() }).passthrough().parse(args ?? {});
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
    return rows.map(toDoc);
  },
  "feed:listForUser": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    return await buildFeed(user.id, args);
  },
  "trending:shows": async ({ args }) => {
    const parsed = optionalLimitArgs.parse(args ?? {});
    const rows = await db.select().from(shows).orderBy(desc(shows.tmdbPopularity), desc(shows.updatedAt)).limit(Math.min(parsed.limit ?? 10, 50));
    return rows.map(showToDoc);
  },
  "trending:mostReviewed": async ({ args }) => {
    const parsed = optionalLimitArgs.parse(args ?? {});
    const counts = await db.select({ showId: reviews.showId, total: count() }).from(reviews).groupBy(reviews.showId).orderBy(desc(count())).limit(Math.min(parsed.limit ?? 10, 50));
    const showRows = counts.length ? await db.select().from(shows).where(inArray(shows.id, counts.map((row) => row.showId))) : [];
    const showMap = new Map(showRows.map((show) => [show.id, showToDoc(show)]));
    return counts.map((row) => showMap.get(row.showId)).filter(Boolean);
  },
  "embeddings:getViewerTastePreferences": async ({ req }) => {
    const user = await requireAuthUser(req);
    const rows = await db.select().from(userTastePreferences).where(eq(userTastePreferences.userId, user.id)).limit(1);
    return rows[0] ? toDoc(rows[0]) : { favoriteShowIds: [], favoriteThemes: [] };
  },
  "releaseCalendar:getHomePreview": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ today: z.string().optional() }).parse(args ?? {});
    const states = await db.select().from(watchStates).where(eq(watchStates.userId, user.id));
    const showIds = states.map((state) => state.showId);
    if (!showIds.length) {
      return {
        tonightGroups: [],
        upcomingGroups: [],
        totalTonight: 0,
        totalUpcoming: 0,
        staleShowIds: [],
        selectedProviders: [],
      };
    }
    const rows = await db.select().from(releaseEvents).where(and(inArray(releaseEvents.showId, showIds), gte(releaseEvents.airDateTs, Date.now()))).orderBy(asc(releaseEvents.airDateTs)).limit(10);
    const showRows = rows.length ? await db.select().from(shows).where(inArray(shows.id, rows.map((row) => row.showId))) : [];
    const today = parsed.today ?? new Date().toISOString().slice(0, 10);
    const tonightGroups = buildReleaseGroups(rows, showRows, { today, view: "tonight", limit: 6 });
    const upcomingGroups = buildReleaseGroups(rows, showRows, { today, view: "upcoming", limit: 6 });
    return {
      tonightGroups,
      upcomingGroups,
      totalTonight: tonightGroups.reduce((sum, group) => sum + group.items.length, 0),
      totalUpcoming: upcomingGroups.reduce((sum, group) => sum + group.items.length, 0),
      staleShowIds: [],
      selectedProviders: [],
    };
  },
  "releaseCalendar:listForMe": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z
      .object({
        today: z.string().optional(),
        view: z.string().optional(),
        limit: z.number().int().positive().optional(),
      })
      .parse(args ?? {});
    const states = await db.select().from(watchStates).where(eq(watchStates.userId, user.id));
    const showIds = states.map((state) => state.showId);
    const empty = {
      groups: [],
      selectedProviders: [],
      totalItems: 0,
      staleShowIds: [],
      continueCursor: "0",
      isDone: true,
    };
    if (!showIds.length) return empty;
    const rows = await db.select().from(releaseEvents).where(and(inArray(releaseEvents.showId, showIds), gte(releaseEvents.airDateTs, Date.now()))).orderBy(asc(releaseEvents.airDateTs));
    const showRows = rows.length ? await db.select().from(shows).where(inArray(shows.id, rows.map((row) => row.showId))) : [];
    const today = parsed.today ?? new Date().toISOString().slice(0, 10);
    const groups = buildReleaseGroups(rows, showRows, {
      today,
      view: parsed.view ?? "upcoming",
      limit: parsed.limit ?? 100,
    });
    return {
      ...empty,
      groups,
      totalItems: groups.reduce((sum, group) => sum + group.items.length, 0),
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
};

export const mutationHandlers: Record<string, RpcHandler> = {
  "users:ensureProfile": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = ensureProfileArgs.parse(args ?? {});
    const normalizedPhone = user.phone ? normalizePhoneNumber(user.phone) : null;
    const phoneHash = normalizedPhone ? hashPhoneNumber(normalizedPhone) : null;
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
        phone: normalizedPhone ?? user.phone,
        phoneHash,
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
        profileVisibility: parsed.profileVisibility ?? user.profileVisibility,
        releaseCalendarPreferences:
          parsed.releaseCalendarPreferences ?? user.releaseCalendarPreferences,
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
    return { success: true };
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
    await db
      .update(contactSyncEntries)
      .set({ invitedAt: Date.now(), updatedAt: Date.now() })
      .where(and(eq(contactSyncEntries.id, entryId), eq(contactSyncEntries.ownerId, user.id)));
    return { success: true };
  },
  "follows:follow": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = followArgs.parse(args ?? {});
    if (parsed.userIdToFollow === user.id) {
      return null;
    }

    await enforceRateLimit(`follow:${user.id}`, 30, 60_000);

    const existing = await db
      .select()
      .from(follows)
      .where(and(eq(follows.followerId, user.id), eq(follows.followeeId, parsed.userIdToFollow)))
      .limit(1);
    if (existing[0]) {
      return existing[0].id;
    }

    const followId = createId("follow");
    await db.insert(follows).values({
      id: followId,
      followerId: user.id,
      followeeId: parsed.userIdToFollow,
      createdAt: Date.now(),
    });
    await db
      .update(users)
      .set({
        countsFollowing: (user.countsFollowing ?? 0) + 1,
      })
      .where(eq(users.id, user.id));

    const followeeRows = await db
      .select()
      .from(users)
      .where(eq(users.id, parsed.userIdToFollow))
      .limit(1);
    const followee = followeeRows[0];
    if (followee) {
      await db
        .update(users)
        .set({
          countsFollowers: (followee.countsFollowers ?? 0) + 1,
        })
        .where(eq(users.id, followee.id));
    }

    return followId;
  },
  "follows:unfollow": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = unfollowArgs.parse(args ?? {});

    const existing = await db
      .select()
      .from(follows)
      .where(and(eq(follows.followerId, user.id), eq(follows.followeeId, parsed.userIdToUnfollow)))
      .limit(1);
    if (!existing[0]) {
      return null;
    }

    await db.delete(follows).where(eq(follows.id, existing[0].id));
    await db
      .update(users)
      .set({
        countsFollowing: Math.max(0, (user.countsFollowing ?? 0) - 1),
      })
      .where(eq(users.id, user.id));

    const followeeRows = await db
      .select()
      .from(users)
      .where(eq(users.id, parsed.userIdToUnfollow))
      .limit(1);
    const followee = followeeRows[0];
    if (followee) {
      await db
        .update(users)
        .set({
          countsFollowers: Math.max(0, (followee.countsFollowers ?? 0) - 1),
        })
        .where(eq(users.id, followee.id));
    }

    return { success: true };
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
    const id = createId("like");
    await db.insert(likes).values({ id, userId: user.id, targetType: parsed.targetType, targetId: parsed.targetId, createdAt: Date.now() });
    return true;
  },
  "comments:add": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = targetArgs.extend({ text: z.string().min(1) }).parse(args ?? {});
    const id = createId("comment");
    await db.insert(comments).values({ id, authorId: user.id, targetType: parsed.targetType, targetId: parsed.targetId, text: parsed.text, createdAt: Date.now() });
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
    const existing = await db.select().from(episodeProgress).where(and(eq(episodeProgress.userId, user.id), eq(episodeProgress.showId, parsed.showId), eq(episodeProgress.seasonNumber, parsed.seasonNumber), eq(episodeProgress.episodeNumber, parsed.episodeNumber))).limit(1);
    if (existing[0]) {
      await db.delete(episodeProgress).where(eq(episodeProgress.id, existing[0].id));
      return false;
    }
    const id = createId("episode");
    const now = Date.now();
    await db.insert(episodeProgress).values({ id, userId: user.id, showId: parsed.showId, seasonNumber: parsed.seasonNumber, episodeNumber: parsed.episodeNumber, watchedAt: now });
    if (parsed.createLog) {
      const logId = createId("log");
      await db.insert(watchLogs).values({ id: logId, userId: user.id, showId: parsed.showId, watchedAt: now, note: null, seasonNumber: parsed.seasonNumber, episodeNumber: parsed.episodeNumber, episodeTitle: parsed.episodeTitle ?? null });
      await addFeedForFollowers(user.id, "log", logId, parsed.showId, now);
    }
    return true;
  },
  "episodeProgress:markSeasonWatched": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ showId: z.string(), seasonNumber: z.number(), episodes: z.array(z.object({ episodeNumber: z.number(), title: z.string().optional() })), createLog: z.boolean().optional() }).parse(args ?? {});
    const now = Date.now();
    for (const episode of parsed.episodes) {
      const existing = await db.select().from(episodeProgress).where(and(eq(episodeProgress.userId, user.id), eq(episodeProgress.showId, parsed.showId), eq(episodeProgress.seasonNumber, parsed.seasonNumber), eq(episodeProgress.episodeNumber, episode.episodeNumber))).limit(1);
      if (!existing[0]) {
        await db.insert(episodeProgress).values({ id: createId("episode"), userId: user.id, showId: parsed.showId, seasonNumber: parsed.seasonNumber, episodeNumber: episode.episodeNumber, watchedAt: now });
      }
    }
    return { success: true };
  },
  "episodeProgress:unmarkSeasonWatched": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = z.object({ showId: z.string(), seasonNumber: z.number() }).parse(args ?? {});
    await db.delete(episodeProgress).where(and(eq(episodeProgress.userId, user.id), eq(episodeProgress.showId, parsed.showId), eq(episodeProgress.seasonNumber, parsed.seasonNumber)));
    return { success: true };
  },
  "reports:create": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = targetArgs.extend({ reason: z.string().optional() }).parse(args ?? {});
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
};

export const actionHandlers: Record<string, RpcHandler> = {
  "phone:startVerification": async ({ args }) => {
    const parsed = z.object({ phone: z.string() }).parse(args ?? {});
    const normalizedPhone = normalizePhoneNumber(parsed.phone);
    if (!normalizedPhone) {
      throw new ApiError(400, "invalid_phone", "Enter a valid phone number");
    }
    await enforceRateLimit(`phone-verification:${normalizedPhone}`, 5, 10 * 60 * 1000);
    await sendPhoneVerificationCode(normalizedPhone);
    const now = Date.now();
    await db.insert(phoneVerificationRequests).values({
      id: createId("verifyreq"),
      phone: normalizedPhone,
      requestedAt: now,
      expiresAt: now + 10 * 60 * 1000,
      completedAt: null,
    });
    return { ok: true, phone: normalizedPhone };
  },
  "contacts:syncSnapshot": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = syncContactsArgs.parse(args ?? {});

    await enforceRateLimit(`contacts-sync:${user.id}`, 6, 10 * 60 * 1000);

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
      hashes.length > 0 ? await db.select().from(users).where(inArray(users.phoneHash, hashes)) : [];
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
    await setContactSnapshot(user.id, nextEntries);

    return {
      totalCount: nextEntries.length,
      matchedCount: nextEntries.filter((entry) => entry.matchedUserId).length,
      inviteCount: nextEntries.filter((entry) => !entry.matchedUserId).length,
      invitedCount: 0,
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
      return cached[0].payload;
    }
    if (show.externalSource !== "tmdb") {
      return null;
    }
    const payload = await tmdb(`/tv/${show.externalId}`, { append_to_response: "credits,videos,watch/providers,similar" });
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000;
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
    return await tmdb(`/tv/${show.externalId}/season/${parsed.seasonNumber}`);
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
  "embeddings:getPersonalizedRecommendations": async ({ args }) => {
    const parsed = optionalLimitArgs.parse(args ?? {});
    const rows = await db.select().from(shows).orderBy(desc(shows.tmdbPopularity), desc(shows.updatedAt)).limit(Math.min(parsed.limit ?? 10, 50));
    return rows.map((show, index) => ({ _id: show.id, show: showToDoc(show), rank: index + 1, score: 1 / (index + 1) }));
  },
  "embeddings:getHomeRecommendationRails": async ({ args }) => {
    const parsed = z.object({ limitPerRail: z.number().optional() }).parse(args ?? {});
    const limit = Math.min(parsed.limitPerRail ?? 10, 20);
    const rows = await db.select().from(shows).orderBy(desc(shows.tmdbPopularity), desc(shows.updatedAt)).limit(limit);
    return [{ key: "popular", title: "Popular right now", items: rows.map((show, index) => ({ _id: show.id, show: showToDoc(show), rank: index + 1 })) }];
  },
  "embeddings:getSimilarTasteUsers": async ({ args, req }) => {
    const user = await requireAuthUser(req);
    const parsed = optionalLimitArgs.parse(args ?? {});
    return await getSuggestedUsers(user.id, Math.min(parsed.limit ?? 10, 30));
  },
  "embeddings:getListsFromSimilarTasteUsers": async ({ args }) => {
    const parsed = optionalLimitArgs.parse(args ?? {});
    const rows = await db.select().from(lists).where(eq(lists.isPublic, true)).orderBy(desc(lists.updatedAt)).limit(Math.min(parsed.limit ?? 10, 30));
    return rows.map((list) => ({ list: listToDoc(list) }));
  },
  "embeddings:getSmartLists": async ({ args }) => {
    const parsed = z.object({ limitPerList: z.number().optional() }).parse(args ?? {});
    const rows = await db.select().from(shows).orderBy(desc(shows.tmdbPopularity), desc(shows.updatedAt)).limit(Math.min(parsed.limitPerList ?? 10, 20));
    return [{ key: "popular", title: "Popular TV", items: rows.map(showToDoc) }];
  },
  "embeddings:getSimilarShows": async ({ args }) => {
    const parsed = z.object({ showId: z.string(), limit: z.number().optional() }).parse(args ?? {});
    const sourceRows = await db.select().from(shows).where(eq(shows.id, parsed.showId)).limit(1);
    const source = sourceRows[0];
    const rows = await db.select().from(shows).orderBy(desc(shows.tmdbPopularity), desc(shows.updatedAt)).limit(Math.min((parsed.limit ?? 10) + 1, 30));
    return rows.filter((show) => show.id !== source?.id).slice(0, parsed.limit ?? 10).map((show, index) => ({ _id: show.id, show: showToDoc(show), score: 1 / (index + 1) }));
  },
  "embeddings:getShowTasteSocialProof": async () => {
    return { matchingFriends: [], favoriteMatches: [], themeMatches: [] };
  },
  "embeddings:getProfileTasteExperience": async () => {
    return { topGenres: [], favoriteShows: [], tasteSummary: null };
  },
  "releaseCalendar:refreshForMe": async ({ req }) => {
    await requireAuthUser(req);
    return { refreshed: 0, scheduled: 0 };
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

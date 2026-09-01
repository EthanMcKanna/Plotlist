import { and, eq, inArray } from "drizzle-orm";

import { imdbRatingsCache } from "../../db/schema";
import { deferBackgroundWork } from "./background";
import { db } from "./db";
import { createId } from "./ids";

// Season slot that holds the show-level rating row in imdb_ratings_cache.
export const SHOW_RATING_SEASON = -1;

const SHOW_RATING_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const SEASON_RATING_TTL_MS = 24 * 60 * 60 * 1000;
// Seasons whose newest episode aired long ago accumulate votes slowly.
const SETTLED_SEASON_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SETTLED_SEASON_AGE_MS = 30 * 24 * 60 * 60 * 1000;
// OMDb misses (unrated titles, transient errors) retry sooner than hits.
const EMPTY_RESULT_TTL_MS = 6 * 60 * 60 * 1000;
// Bound on inline OMDb calls per request: show rating plus up to ten seasons
// warm fully on a cold request now that the account is on Workers Paid.
// Inline calls run concurrently, so this is also the per-request burst cap.
const MAX_INLINE_FETCHES = 11;
// Expired slots refresh off the response path, bounded the same way so a
// request never fans out to more than ~2x this many OMDb calls in total.
const MAX_BACKGROUND_REFRESHES = 11;

export type ImdbShowRatingPayload = {
  rating: number | null;
  votes: number | null;
};

export type ImdbEpisodeRating = {
  episodeNumber: number;
  rating: number;
};

export type ImdbSeasonRatingsPayload = {
  episodes: ImdbEpisodeRating[];
  latestReleased: string | null;
};

export type ImdbSeasonRatings = {
  averageRating: number | null;
  episodes: ImdbEpisodeRating[];
};

export type ImdbRatingsResult = {
  imdbId: string;
  show: ImdbShowRatingPayload | null;
  seasons: Record<number, ImdbSeasonRatings>;
};

function readOmdbNumber(value: unknown): number | null {
  if (typeof value !== "string" || value === "N/A") {
    return null;
  }
  const parsed = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseOmdbShowPayload(payload: unknown): ImdbShowRatingPayload {
  const raw = payload as { imdbRating?: unknown; imdbVotes?: unknown } | null;
  return {
    rating: readOmdbNumber(raw?.imdbRating),
    votes: readOmdbNumber(raw?.imdbVotes),
  };
}

export function parseOmdbSeasonPayload(payload: unknown): ImdbSeasonRatingsPayload {
  const raw = payload as { Episodes?: unknown } | null;
  const episodes = Array.isArray(raw?.Episodes) ? raw.Episodes : [];
  let latestReleased: string | null = null;
  const parsed = episodes.flatMap((episode: any): ImdbEpisodeRating[] => {
    const episodeNumber = readOmdbNumber(episode?.Episode);
    const rating = readOmdbNumber(episode?.imdbRating);
    const released = typeof episode?.Released === "string" ? episode.Released : null;
    if (released && released !== "N/A" && (!latestReleased || released > latestReleased)) {
      latestReleased = released;
    }
    if (episodeNumber === null || episodeNumber < 1 || rating === null) {
      return [];
    }
    return [{ episodeNumber, rating }];
  });
  return {
    episodes: parsed.sort((left, right) => left.episodeNumber - right.episodeNumber),
    latestReleased,
  };
}

export function averageEpisodeRating(episodes: ImdbEpisodeRating[]): number | null {
  if (episodes.length === 0) {
    return null;
  }
  const total = episodes.reduce((sum, episode) => sum + episode.rating, 0);
  return Math.round((total / episodes.length) * 10) / 10;
}

function seasonTtl(payload: ImdbSeasonRatingsPayload, now: number) {
  if (payload.episodes.length === 0) {
    return EMPTY_RESULT_TTL_MS;
  }
  const latestMs = payload.latestReleased ? Date.parse(payload.latestReleased) : Number.NaN;
  const settled = Number.isFinite(latestMs) && now - latestMs > SETTLED_SEASON_AGE_MS;
  return settled ? SETTLED_SEASON_TTL_MS : SEASON_RATING_TTL_MS;
}

async function fetchOmdb(params: Record<string, string>) {
  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey) {
    return null;
  }
  const url = new URL("https://www.omdbapi.com/");
  url.searchParams.set("apikey", apiKey);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OMDb request failed with ${response.status}`);
  }
  return await response.json();
}

export type CacheRow = {
  seasonNumber: number;
  payload: unknown;
  expiresAt: number;
};

// Ratings are best-effort everywhere: OMDb being down, unconfigured, or
// missing a title must never break the queries that embed them, so this
// serves stale entries on fetch failure and null when nothing is known.
export async function getImdbRatings(
  imdbId: string,
  seasonNumbers: number[],
  now = Date.now(),
): Promise<ImdbRatingsResult | null> {
  if (!process.env.OMDB_API_KEY || !imdbId.startsWith("tt")) {
    return null;
  }
  const wantedSeasons = Array.from(
    new Set(seasonNumbers.filter((season) => Number.isInteger(season) && season >= 1)),
  ).slice(0, 10);

  const rows: CacheRow[] = await db
    .select({
      seasonNumber: imdbRatingsCache.seasonNumber,
      payload: imdbRatingsCache.payload,
      expiresAt: imdbRatingsCache.expiresAt,
    })
    .from(imdbRatingsCache)
    .where(
      and(
        eq(imdbRatingsCache.imdbId, imdbId),
        inArray(imdbRatingsCache.seasonNumber, [SHOW_RATING_SEASON, ...wantedSeasons]),
      ),
    );
  const cachedByNumber = new Map(rows.map((row) => [row.seasonNumber, row]));

  // Stale-while-revalidate: anything cached is served as-is right now (an
  // expired rating is still a rating), and refreshes ride the background
  // scope. Only slots with no row at all block the response, and those
  // fetch together instead of one after another.
  const plan = planImdbRatingSlots([SHOW_RATING_SEASON, ...wantedSeasons], cachedByNumber, now);
  const inlineFetched = await Promise.all(
    plan.inline.map((seasonNumber) => fetchRatingSlot(imdbId, seasonNumber, now)),
  );
  const inlineByNumber = new Map<number, FetchedRatingSlot>();
  for (const fetched of inlineFetched) {
    if (fetched) inlineByNumber.set(fetched.seasonNumber, fetched);
  }
  if (inlineByNumber.size > 0) {
    deferBackgroundWork(
      persistRatingSlots(imdbId, Array.from(inlineByNumber.values()), now),
      `imdb ratings cache write ${imdbId}`,
    );
  }
  if (plan.refresh.length > 0) {
    deferBackgroundWork(
      refreshRatingSlots(imdbId, plan.refresh, now),
      `imdb ratings refresh ${imdbId}`,
    );
  }

  const payloadFor = (seasonNumber: number): unknown => {
    const cached = cachedByNumber.get(seasonNumber);
    if (cached) return cached.payload;
    return inlineByNumber.get(seasonNumber)?.payload ?? null;
  };

  const show = payloadFor(SHOW_RATING_SEASON) as ImdbShowRatingPayload | null;
  const seasons: Record<number, ImdbSeasonRatings> = {};
  for (const seasonNumber of wantedSeasons) {
    const payload = payloadFor(seasonNumber) as ImdbSeasonRatingsPayload | null;
    if (payload && Array.isArray(payload.episodes) && payload.episodes.length > 0) {
      seasons[seasonNumber] = {
        averageRating: averageEpisodeRating(payload.episodes),
        episodes: payload.episodes,
      };
    }
  }

  return { imdbId, show: show && show.rating !== null ? show : null, seasons };
}

export type ImdbRatingSlotPlan = {
  /** Cached and unexpired: served as-is. */
  fresh: number[];
  /** Cached but expired: served as-is (every stale slot). */
  stale: number[];
  /** The subset of `stale` that gets refetched in the background. */
  refresh: number[];
  /** No cache row: fetched inline before responding. */
  inline: number[];
  /** No cache row and past the inline bound: served as unknown. */
  skipped: number[];
};

// Pure slot triage for getImdbRatings, exported for tests. Slot order is the
// caller's priority order (show rating first, then seasons), so the bounds
// always favor the earlier slots.
export function planImdbRatingSlots(
  slotNumbers: number[],
  cachedByNumber: Map<number, CacheRow>,
  now: number,
  limits: { maxInline?: number; maxBackground?: number } = {},
): ImdbRatingSlotPlan {
  const maxInline = limits.maxInline ?? MAX_INLINE_FETCHES;
  const maxBackground = limits.maxBackground ?? MAX_BACKGROUND_REFRESHES;
  const plan: ImdbRatingSlotPlan = { fresh: [], stale: [], refresh: [], inline: [], skipped: [] };
  for (const seasonNumber of slotNumbers) {
    const cached = cachedByNumber.get(seasonNumber);
    if (cached && cached.expiresAt > now) {
      plan.fresh.push(seasonNumber);
    } else if (cached) {
      plan.stale.push(seasonNumber);
      if (plan.refresh.length < maxBackground) plan.refresh.push(seasonNumber);
    } else if (plan.inline.length < maxInline) {
      plan.inline.push(seasonNumber);
    } else {
      plan.skipped.push(seasonNumber);
    }
  }
  return plan;
}

type FetchedRatingSlot = {
  seasonNumber: number;
  payload: ImdbShowRatingPayload | ImdbSeasonRatingsPayload;
  expiresAt: number;
};

// One OMDb call for a slot; null on any failure so a flaky slot degrades to
// "unknown" (or the stale row) instead of failing the whole ratings read.
async function fetchRatingSlot(
  imdbId: string,
  seasonNumber: number,
  now: number,
): Promise<FetchedRatingSlot | null> {
  try {
    if (seasonNumber === SHOW_RATING_SEASON) {
      const payload = parseOmdbShowPayload(await fetchOmdb({ i: imdbId }));
      return {
        seasonNumber,
        payload,
        expiresAt: now + (payload.rating === null ? EMPTY_RESULT_TTL_MS : SHOW_RATING_TTL_MS),
      };
    }
    const payload = parseOmdbSeasonPayload(
      await fetchOmdb({ i: imdbId, Season: String(seasonNumber) }),
    );
    return { seasonNumber, payload, expiresAt: now + seasonTtl(payload, now) };
  } catch {
    return null;
  }
}

// All fetched slots land in one D1 batch (one round trip, atomic).
async function persistRatingSlots(imdbId: string, fetched: FetchedRatingSlot[], now: number) {
  if (fetched.length === 0) return;
  const statements = fetched.map((slot) =>
    db
      .insert(imdbRatingsCache)
      .values({
        id: createId("imdbratings"),
        imdbId,
        seasonNumber: slot.seasonNumber,
        payload: slot.payload,
        fetchedAt: now,
        expiresAt: slot.expiresAt,
      })
      .onConflictDoUpdate({
        target: [imdbRatingsCache.imdbId, imdbRatingsCache.seasonNumber],
        set: { payload: slot.payload, fetchedAt: now, expiresAt: slot.expiresAt },
      }),
  );
  await db.batch(statements as [(typeof statements)[number], ...(typeof statements)[number][]]);
}

async function refreshRatingSlots(imdbId: string, seasonNumbers: number[], now: number) {
  const fetched = await Promise.all(
    seasonNumbers.map((seasonNumber) => fetchRatingSlot(imdbId, seasonNumber, now)),
  );
  await persistRatingSlots(
    imdbId,
    fetched.filter((slot): slot is FetchedRatingSlot => slot !== null),
    now,
  );
}

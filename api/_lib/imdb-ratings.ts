import { and, eq, inArray } from "drizzle-orm";

import { imdbRatingsCache } from "../../db/schema";
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
// OMDb calls come out of the same 50-subrequest budget as TMDB; a cold
// multi-season request warms at most this many rows and fills in later.
const MAX_INLINE_FETCHES = 4;

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

type CacheRow = {
  seasonNumber: number;
  payload: unknown;
  expiresAt: number;
};

async function upsertRatingsCacheEntry(
  imdbId: string,
  seasonNumber: number,
  payload: ImdbShowRatingPayload | ImdbSeasonRatingsPayload,
  expiresAt: number,
  now: number,
) {
  await db
    .insert(imdbRatingsCache)
    .values({
      id: createId("imdbratings"),
      imdbId,
      seasonNumber,
      payload,
      fetchedAt: now,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [imdbRatingsCache.imdbId, imdbRatingsCache.seasonNumber],
      set: { payload, fetchedAt: now, expiresAt },
    });
}

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

  let inlineFetches = 0;
  const resolveSlot = async <Payload>(
    seasonNumber: number,
    fetchFresh: () => Promise<Payload | null>,
    ttlFor: (payload: Payload) => number,
  ): Promise<Payload | null> => {
    const cached = cachedByNumber.get(seasonNumber);
    if (cached && cached.expiresAt > now) {
      return cached.payload as Payload;
    }
    if (inlineFetches >= MAX_INLINE_FETCHES) {
      return (cached?.payload as Payload) ?? null;
    }
    inlineFetches += 1;
    try {
      const fresh = await fetchFresh();
      if (fresh === null) {
        return (cached?.payload as Payload) ?? null;
      }
      await upsertRatingsCacheEntry(
        imdbId,
        seasonNumber,
        fresh as ImdbShowRatingPayload | ImdbSeasonRatingsPayload,
        now + ttlFor(fresh),
        now,
      );
      return fresh;
    } catch {
      return (cached?.payload as Payload) ?? null;
    }
  };

  const show = await resolveSlot<ImdbShowRatingPayload>(
    SHOW_RATING_SEASON,
    async () => parseOmdbShowPayload(await fetchOmdb({ i: imdbId })),
    (payload) => (payload.rating === null ? EMPTY_RESULT_TTL_MS : SHOW_RATING_TTL_MS),
  );

  const seasons: Record<number, ImdbSeasonRatings> = {};
  for (const seasonNumber of wantedSeasons) {
    const payload = await resolveSlot<ImdbSeasonRatingsPayload>(
      seasonNumber,
      async () =>
        parseOmdbSeasonPayload(await fetchOmdb({ i: imdbId, Season: String(seasonNumber) })),
      (fresh) => seasonTtl(fresh, now),
    );
    if (payload && payload.episodes.length > 0) {
      seasons[seasonNumber] = {
        averageRating: averageEpisodeRating(payload.episodes),
        episodes: payload.episodes,
      };
    }
  }

  return { imdbId, show: show && show.rating !== null ? show : null, seasons };
}

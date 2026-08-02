import { and, eq, sql } from "drizzle-orm";

import { tmdbSeasonCache } from "../../db/schema";
import { db } from "./db";
import { ApiError } from "./errors";
import { createId } from "./ids";
import { chunkForSqlParams } from "./sql-dialect";

const SEASON_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// Seasons whose last episode aired long ago effectively never change; give
// them a week so the cache stops burning TMDB calls on finished seasons.
const SETTLED_SEASON_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SETTLED_SEASON_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type CachedSeasonPerson = {
  id: number | null;
  name: string;
  character?: string | null;
  job?: string | null;
  profilePath?: string | null;
};

export type CachedSeasonEpisode = {
  seasonNumber: number;
  episodeNumber: number;
  name: string | null;
  overview: string | null;
  airDate: string | null;
  stillUrl: string | null;
  runtime: number | null;
  voteAverage: number | null;
  voteCount: number | null;
  // v2 fields: enough people data for the episode sheet, tightly capped so
  // rows stay small. Absent on v1 rows.
  guestStars?: CachedSeasonPerson[];
  crew?: CachedSeasonPerson[];
};

export type CachedSeasonPayload = {
  seasonNumber: number;
  airDate: string | null;
  episodes: CachedSeasonEpisode[];
  // v2 rows carry everything shows:getSeasonDetails needs to serve the
  // episode guide + sheet without a TMDB fetch; v1 rows only ever fed
  // up-next enrichment and fall through to a live fetch (which upgrades
  // them in place).
  version?: number;
  posterPath?: string | null;
};

export const SEASON_CACHE_PAYLOAD_VERSION = 2;
const SEASON_PEOPLE_EPISODE_LIMIT = 30;
const GUEST_STARS_PER_EPISODE = 6;
const CREW_PER_EPISODE = 4;
const CACHED_CREW_JOBS = new Set(["Director", "Writer"]);

function tmdbImageUrl(path: unknown, size: string) {
  if (typeof path !== "string" || path.length === 0) {
    return null;
  }
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function slimSeasonPeople(
  raw: unknown,
  limit: number,
  jobFilter?: Set<string>,
): CachedSeasonPerson[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const people = raw
    .filter(
      (person: any) =>
        person &&
        typeof person.name === "string" &&
        person.name.length > 0 &&
        (!jobFilter || jobFilter.has(person.job)),
    )
    .slice(0, limit)
    .map((person: any): CachedSeasonPerson => ({
      id: readNumber(person.id),
      name: person.name,
      ...(person.character !== undefined ? { character: readText(person.character) } : {}),
      ...(person.job !== undefined ? { job: readText(person.job) } : {}),
      profilePath:
        readText(person.profilePath) ??
        tmdbImageUrl(person.profile_path, "w185"),
    }));
  return people;
}

// Reduce a TMDB /tv/{id}/season/{n} response (raw or already-normalized) to
// only what up-next and the episode guide need, keeping D1 rows small.
export function slimSeasonPayload(payload: unknown): CachedSeasonPayload | null {
  const raw = payload as {
    season_number?: unknown;
    seasonNumber?: unknown;
    air_date?: unknown;
    airDate?: unknown;
    poster_path?: unknown;
    posterPath?: unknown;
    episodes?: unknown;
  } | null;
  const seasonNumber = readNumber(raw?.seasonNumber ?? raw?.season_number);
  if (seasonNumber === null || !Array.isArray(raw?.episodes)) {
    return null;
  }

  // People data is only worth caching for normal-length seasons; a 100+
  // episode soap season would balloon the row for detail nobody scrolls.
  const includePeople = raw.episodes.length <= SEASON_PEOPLE_EPISODE_LIMIT;

  const episodes = raw.episodes.flatMap((episode: any): CachedSeasonEpisode[] => {
    const episodeNumber = readNumber(episode?.episodeNumber ?? episode?.episode_number);
    if (episodeNumber === null || episodeNumber < 1) {
      return [];
    }
    return [
      {
        seasonNumber,
        episodeNumber,
        name: readText(episode?.name),
        overview: readText(episode?.overview),
        airDate: readText(episode?.airDate ?? episode?.air_date),
        stillUrl:
          readText(episode?.stillUrl) ??
          tmdbImageUrl(episode?.stillPath ?? episode?.still_path, "w780"),
        runtime: readNumber(episode?.runtime),
        voteAverage: readNumber(episode?.voteAverage ?? episode?.vote_average),
        voteCount: readNumber(episode?.voteCount ?? episode?.vote_count),
        ...(includePeople
          ? {
              guestStars:
                slimSeasonPeople(
                  episode?.guestStars ?? episode?.guest_stars,
                  GUEST_STARS_PER_EPISODE,
                ) ?? [],
              crew:
                slimSeasonPeople(episode?.crew, CREW_PER_EPISODE, CACHED_CREW_JOBS) ?? [],
            }
          : {}),
      },
    ];
  });

  return {
    seasonNumber,
    airDate: readText(raw?.airDate ?? raw?.air_date),
    episodes: episodes.sort((left, right) => left.episodeNumber - right.episodeNumber),
    version: SEASON_CACHE_PAYLOAD_VERSION,
    posterPath:
      readText(raw?.posterPath) ?? tmdbImageUrl(raw?.poster_path, "w342"),
  };
}

export function findCachedSeasonEpisode(
  payload: CachedSeasonPayload | null | undefined,
  episodeNumber: number,
) {
  return payload?.episodes.find((episode) => episode.episodeNumber === episodeNumber) ?? null;
}

function seasonCacheTtl(payload: CachedSeasonPayload, now: number) {
  const lastAirMs = payload.episodes.reduce((latest, episode) => {
    const parsed = episode.airDate ? Date.parse(episode.airDate) : Number.NaN;
    return Number.isFinite(parsed) ? Math.max(latest, parsed) : latest;
  }, 0);
  const settled =
    payload.episodes.length > 0 && lastAirMs > 0 && now - lastAirMs > SETTLED_SEASON_AGE_MS;
  return settled ? SETTLED_SEASON_TTL_MS : SEASON_CACHE_TTL_MS;
}

export type SeasonCacheEntry = {
  payload: CachedSeasonPayload;
  fetchedAt: number;
  expiresAt: number;
};

export function seasonCacheKey(externalId: string, seasonNumber: number) {
  return `${externalId}:${seasonNumber}`;
}

export async function readSeasonCacheEntries(
  requests: Array<{ externalId: string; seasonNumber: number }>,
): Promise<Map<string, SeasonCacheEntry>> {
  const results = new Map<string, SeasonCacheEntry>();
  if (requests.length === 0) {
    return results;
  }

  // Row-value IN matches exact (show, season) pairs — the old ids×numbers
  // cross-product could fetch up to chunk² rows to use chunk. Batches stay
  // under D1's 100-bound-parameter cap, run in parallel.
  const uniqueRequests = Array.from(
    new Map(
      requests.map((request) => [seasonCacheKey(request.externalId, request.seasonNumber), request]),
    ).values(),
  );
  const rows = (
    await Promise.all(
      chunkForSqlParams(uniqueRequests, 2, 80).map((requestChunk) =>
        db
          .select()
          .from(tmdbSeasonCache)
          .where(
            and(
              eq(tmdbSeasonCache.externalSource, "tmdb"),
              sql`(${tmdbSeasonCache.externalId}, ${tmdbSeasonCache.seasonNumber}) IN (VALUES ${sql.join(
                requestChunk.map(
                  (request) => sql`(${request.externalId}, ${request.seasonNumber})`,
                ),
                sql`, `,
              )})`,
            ),
          ),
      ),
    )
  ).flat();

  for (const row of rows) {
    const key = seasonCacheKey(row.externalId, row.seasonNumber);
    const payload = row.payload as CachedSeasonPayload | null;
    if (!payload || !Array.isArray(payload.episodes)) {
      continue;
    }
    results.set(key, {
      payload,
      fetchedAt: row.fetchedAt,
      expiresAt: row.expiresAt,
    });
  }

  return results;
}

export async function upsertSeasonCacheEntry(
  externalId: string,
  payload: CachedSeasonPayload,
  now = Date.now(),
) {
  const expiresAt = now + seasonCacheTtl(payload, now);
  await db
    .insert(tmdbSeasonCache)
    .values({
      id: createId("tmdbseason"),
      externalSource: "tmdb",
      externalId,
      seasonNumber: payload.seasonNumber,
      payload,
      fetchedAt: now,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [
        tmdbSeasonCache.externalSource,
        tmdbSeasonCache.externalId,
        tmdbSeasonCache.seasonNumber,
      ],
      set: {
        payload,
        fetchedAt: now,
        expiresAt,
      },
    });
}

async function fetchTmdbSeason(externalId: string, seasonNumber: number) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new ApiError(500, "tmdb_unconfigured", "TMDB_API_KEY is not configured");
  }
  const url = new URL(`https://api.themoviedb.org/3/tv/${externalId}/season/${seasonNumber}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", "en-US");
  const response = await fetch(url);
  if (!response.ok) {
    throw new ApiError(response.status, "tmdb_error", `TMDB request failed with ${response.status}`);
  }
  return await response.json();
}

// Fetch a season from TMDB and cache the slimmed payload. Returns null (never
// throws) so enrichment paths can treat metadata as best-effort.
export async function fetchAndCacheSeason(
  externalId: string,
  seasonNumber: number,
  now = Date.now(),
): Promise<CachedSeasonPayload | null> {
  try {
    const payload = slimSeasonPayload(await fetchTmdbSeason(externalId, seasonNumber));
    if (!payload) {
      return null;
    }
    await upsertSeasonCacheEntry(externalId, payload, now);
    return payload;
  } catch {
    return null;
  }
}

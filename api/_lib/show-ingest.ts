import { and, asc, desc, eq, lte, ne, sql } from "drizzle-orm";

import {
  ingestSyncMeta,
  showIngestState,
  shows,
  tmdbDetailsCache,
  watchStates,
} from "../../db/schema";
import { db } from "./db";
import { createId } from "./ids";
import { normalizeTmdbShowDetails } from "./rpc";
import { normalizeSearchText } from "./social";
import { chunkForSqlParams } from "./sql-dialect";

// Bulk catalog ingest: show_ingest_state holds one row per TMDB TV id (seeded
// from the daily id export, topped up by /tv/changes). The minute cron drains
// due rows — pending ids by popularity during backfill, then stale ingested
// rows by due time — so search and detail screens serve from D1 instead of
// live TMDB calls.

const CHANGES_WATERMARK_KEY = "tmdb_changes_synced_at";
const CHANGES_SYNC_INTERVAL_MS = 60 * 60 * 1000;
const CHANGES_MAX_PAGES = 40;

const FETCH_CONCURRENCY = 20;
const STATEMENTS_PER_BATCH = 40;

// Shows at or above this popularity (or attached to any user) also get their
// full extended-details payload warmed so the detail screen never waits on
// TMDB. Warming everything would blow past D1's 10GB budget (~226k shows at
// ~40KB of credits/videos/recommendations each).
export const DETAIL_WARM_MIN_POPULARITY = 5;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const REFRESH_TIER_MS = {
  userAttached: 6 * HOUR_MS,
  active: 12 * HOUR_MS,
  popular: 3 * DAY_MS,
  ended: 14 * DAY_MS,
  dormant: 30 * DAY_MS,
} as const;

const DETAILS_CACHE_MAX_TTL_MS = 7 * DAY_MS;
const FAILURE_BASE_RETRY_MS = 6 * HOUR_MS;
const FAILURE_MAX_RETRY_MS = 7 * DAY_MS;
const GONE_RETRY_MS = 90 * DAY_MS;
const RECENTLY_AIRED_WINDOW_MS = 45 * DAY_MS;

const ACTIVE_STATUSES = new Set(["Returning Series", "In Production", "Planned", "Pilot"]);

type TmdbShowDetails = {
  id?: number;
  name?: string;
  original_name?: string;
  overview?: string;
  status?: string;
  in_production?: boolean;
  first_air_date?: string;
  last_air_date?: string;
  next_episode_to_air?: unknown;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genres?: Array<{ id?: number }>;
  original_language?: string;
  origin_country?: string[];
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
  external_ids?: { imdb_id?: unknown };
};

export function computeNextRefreshDelayMs(args: {
  details: Pick<
    TmdbShowDetails,
    "status" | "in_production" | "last_air_date" | "next_episode_to_air" | "popularity"
  >;
  isUserAttached: boolean;
  now: number;
}): number {
  const { details, isUserAttached, now } = args;
  const lastAirMs = details.last_air_date ? Date.parse(details.last_air_date) : Number.NaN;
  const active =
    details.in_production === true ||
    (details.status !== undefined && ACTIVE_STATUSES.has(details.status)) ||
    (details.next_episode_to_air !== null && details.next_episode_to_air !== undefined) ||
    (Number.isFinite(lastAirMs) && now - lastAirMs <= RECENTLY_AIRED_WINDOW_MS);

  const popularity = typeof details.popularity === "number" ? details.popularity : 0;
  let delay: number;
  if (active) {
    delay = REFRESH_TIER_MS.active;
  } else if (popularity >= 20) {
    delay = REFRESH_TIER_MS.popular;
  } else if (popularity >= 1) {
    delay = REFRESH_TIER_MS.ended;
  } else {
    delay = REFRESH_TIER_MS.dormant;
  }
  if (isUserAttached) {
    delay = Math.min(delay, REFRESH_TIER_MS.userAttached);
  }
  return delay;
}

function tmdbImageUrl(path: string | null | undefined, size: string) {
  return typeof path === "string" && path.length > 0
    ? `https://image.tmdb.org/t/p/${size}${path}`
    : null;
}

function readImdbId(details: TmdbShowDetails): string | null {
  const raw = details.external_ids?.imdb_id;
  return typeof raw === "string" && raw.startsWith("tt") ? raw : null;
}

export function mapDetailsToShowRow(details: TmdbShowDetails, now: number) {
  const title = details.name ?? details.original_name ?? "Untitled";
  const overview = details.overview ?? null;
  const imdbId = readImdbId(details);
  return {
    id: createId("show"),
    externalSource: "tmdb",
    externalId: String(details.id),
    title,
    originalTitle: details.original_name ?? title,
    year:
      typeof details.first_air_date === "string" && details.first_air_date.length >= 4
        ? Number(details.first_air_date.slice(0, 4))
        : null,
    overview,
    posterUrl: tmdbImageUrl(details.poster_path, "w500"),
    backdropUrl: tmdbImageUrl(details.backdrop_path, "w1280"),
    genreIds: Array.isArray(details.genres)
      ? details.genres.map((genre) => genre.id).filter((id): id is number => typeof id === "number")
      : null,
    originalLanguage: details.original_language ?? null,
    originCountries: Array.isArray(details.origin_country) ? details.origin_country : null,
    tmdbPopularity: typeof details.popularity === "number" ? details.popularity : null,
    tmdbVoteAverage: typeof details.vote_average === "number" ? details.vote_average : null,
    tmdbVoteCount: typeof details.vote_count === "number" ? details.vote_count : null,
    // "" records "TMDB has no mapping" so lookups don't refetch every request.
    imdbId: imdbId ?? "",
    searchText: normalizeSearchText(`${title} ${overview ?? ""}`),
    createdAt: now,
    updatedAt: now,
  };
}

class TmdbGoneError extends Error {}

async function tmdbFetch(path: string, params: Record<string, string> = {}) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error("TMDB_API_KEY is not configured");
  }
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", "en-US");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url);
  if (response.status === 404) {
    throw new TmdbGoneError(`TMDB 404 for ${path}`);
  }
  if (!response.ok) {
    throw new Error(`TMDB request failed with ${response.status}`);
  }
  return await response.json();
}

async function runBatches(statements: Array<{ run?: unknown }>) {
  for (let i = 0; i < statements.length; i += STATEMENTS_PER_BATCH) {
    const group = statements.slice(i, i + STATEMENTS_PER_BATCH);
    await db.batch(group as [(typeof statements)[number], ...(typeof statements)[number][]] as any);
  }
}

async function readUserAttachedTmdbIds(): Promise<Set<number>> {
  const rows = await db
    .selectDistinct({ externalId: shows.externalId })
    .from(shows)
    .innerJoin(watchStates, eq(watchStates.showId, shows.id))
    .where(eq(shows.externalSource, "tmdb"));
  return new Set(rows.map((row) => Number(row.externalId)).filter(Number.isFinite));
}

type IngestTickSummary = {
  selected: number;
  ingested: number;
  warmed: number;
  failed: number;
  gone: number;
  changesSynced: number | null;
};

export async function runShowIngestTick(maxShows = 200): Promise<IngestTickSummary> {
  const now = Date.now();
  const changesSynced = await syncTmdbChangesIfDue(now).catch((error) => {
    console.error("[ingest] changes sync failed", error);
    return null;
  });

  const pendingRows = await db
    .select()
    .from(showIngestState)
    .where(and(eq(showIngestState.status, "pending"), lte(showIngestState.nextRefreshAt, now)))
    .orderBy(desc(showIngestState.popularity))
    .limit(maxShows);
  const remaining = maxShows - pendingRows.length;
  const dueRows =
    remaining > 0
      ? await db
          .select()
          .from(showIngestState)
          .where(and(ne(showIngestState.status, "pending"), lte(showIngestState.nextRefreshAt, now)))
          .orderBy(asc(showIngestState.nextRefreshAt))
          .limit(remaining)
      : [];
  const batch = [...pendingRows, ...dueRows];
  if (batch.length === 0) {
    return { selected: 0, ingested: 0, warmed: 0, failed: 0, gone: 0, changesSynced };
  }

  const userAttached = await readUserAttachedTmdbIds();

  type FetchResult =
    | { state: (typeof batch)[number]; details: TmdbShowDetails; warm: boolean }
    | { state: (typeof batch)[number]; error: Error };
  const results: FetchResult[] = [];
  for (let i = 0; i < batch.length; i += FETCH_CONCURRENCY) {
    const chunk = batch.slice(i, i + FETCH_CONCURRENCY);
    const settled = await Promise.all(
      chunk.map(async (state): Promise<FetchResult> => {
        const warm =
          (state.popularity ?? 0) >= DETAIL_WARM_MIN_POPULARITY || userAttached.has(state.tmdbId);
        try {
          const details = (await tmdbFetch(`/tv/${state.tmdbId}`, {
            append_to_response: warm
              ? "credits,videos,watch/providers,similar,recommendations,external_ids"
              : "external_ids",
          })) as TmdbShowDetails;
          return { state, details, warm };
        } catch (error) {
          return { state, error: error as Error };
        }
      }),
    );
    results.push(...settled);
  }

  const showRows: Array<ReturnType<typeof mapDetailsToShowRow>> = [];
  const detailCacheRows: Array<{
    id: string;
    externalSource: string;
    externalId: string;
    payload: unknown;
    fetchedAt: number;
    expiresAt: number;
  }> = [];
  const stateStatements: Array<unknown> = [];
  let ingested = 0;
  let warmed = 0;
  let failed = 0;
  let gone = 0;

  for (const result of results) {
    if ("error" in result) {
      const isGone = result.error instanceof TmdbGoneError;
      if (isGone) {
        gone += 1;
      } else {
        failed += 1;
      }
      const failCount = result.state.failCount + 1;
      const retryDelay = isGone
        ? GONE_RETRY_MS
        : Math.min(FAILURE_MAX_RETRY_MS, FAILURE_BASE_RETRY_MS * 2 ** Math.min(failCount, 5));
      stateStatements.push(
        db
          .update(showIngestState)
          .set({
            status: "failed",
            failCount,
            lastError: result.error.message.slice(0, 500),
            nextRefreshAt: now + retryDelay,
            updatedAt: now,
          })
          .where(eq(showIngestState.id, result.state.id)),
      );
      continue;
    }

    const { state, details, warm } = result;
    const delay = computeNextRefreshDelayMs({
      details,
      isUserAttached: userAttached.has(state.tmdbId),
      now,
    });
    showRows.push(mapDetailsToShowRow(details, now));
    if (warm) {
      warmed += 1;
      detailCacheRows.push({
        id: createId("tmdbdetails"),
        externalSource: "tmdb",
        externalId: String(state.tmdbId),
        payload: normalizeTmdbShowDetails(details),
        fetchedAt: now,
        expiresAt: now + Math.min(delay, DETAILS_CACHE_MAX_TTL_MS),
      });
    }
    ingested += 1;
    stateStatements.push(
      db
        .update(showIngestState)
        .set({
          status: "ingested",
          popularity: typeof details.popularity === "number" ? details.popularity : state.popularity,
          failCount: 0,
          lastError: null,
          lastIngestedAt: now,
          nextRefreshAt: now + delay,
          updatedAt: now,
        })
        .where(eq(showIngestState.id, state.id)),
    );
  }

  const statements: Array<unknown> = [];
  for (const chunk of chunkForSqlParams(showRows, 18)) {
    statements.push(
      db
        .insert(shows)
        .values(chunk)
        .onConflictDoUpdate({
          target: [shows.externalSource, shows.externalId],
          set: {
            title: sql`excluded.title`,
            originalTitle: sql`excluded.original_title`,
            year: sql`excluded.year`,
            overview: sql`excluded.overview`,
            posterUrl: sql`coalesce(excluded.poster_url, "shows"."poster_url")`,
            backdropUrl: sql`coalesce(excluded.backdrop_url, "shows"."backdrop_url")`,
            genreIds: sql`excluded.genre_ids`,
            originalLanguage: sql`excluded.original_language`,
            originCountries: sql`excluded.origin_countries`,
            tmdbPopularity: sql`excluded.tmdb_popularity`,
            tmdbVoteAverage: sql`excluded.tmdb_vote_average`,
            tmdbVoteCount: sql`excluded.tmdb_vote_count`,
            // Never downgrade a resolved "tt…" id to the "" no-mapping marker.
            imdbId: sql`CASE WHEN excluded.imdb_id LIKE 'tt%' THEN excluded.imdb_id ELSE coalesce("shows"."imdb_id", excluded.imdb_id) END`,
            searchText: sql`excluded.search_text`,
            updatedAt: sql`excluded.updated_at`,
          },
        }),
    );
  }
  for (const chunk of chunkForSqlParams(detailCacheRows, 6)) {
    statements.push(
      db
        .insert(tmdbDetailsCache)
        .values(chunk)
        .onConflictDoUpdate({
          target: [tmdbDetailsCache.externalSource, tmdbDetailsCache.externalId],
          set: {
            payload: sql`excluded.payload`,
            fetchedAt: sql`excluded.fetched_at`,
            expiresAt: sql`excluded.expires_at`,
          },
        }),
    );
  }
  statements.push(...stateStatements);
  await runBatches(statements as Array<{ run?: unknown }>);

  return { selected: batch.length, ingested, warmed, failed, gone, changesSynced };
}

// Pull the TMDB TV changes feed at most hourly and mark every changed id due
// now; ids we have never seen are inserted as pending so newly created shows
// flow in without waiting for the next export seed.
async function syncTmdbChangesIfDue(now: number): Promise<number | null> {
  const watermarkRows = await db
    .select()
    .from(ingestSyncMeta)
    .where(eq(ingestSyncMeta.key, CHANGES_WATERMARK_KEY))
    .limit(1);
  const watermark = watermarkRows[0]?.value ? Number(watermarkRows[0].value) : null;
  if (watermark !== null && now - watermark < CHANGES_SYNC_INTERVAL_MS) {
    return null;
  }

  // TMDB takes whole dates; back up one day past the watermark so a sync
  // never misses changes recorded around the boundary.
  const since = watermark !== null ? watermark - DAY_MS : now - DAY_MS;
  const startDate = new Date(since).toISOString().slice(0, 10);

  const changedIds = new Set<number>();
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && page <= CHANGES_MAX_PAGES) {
    const payload = (await tmdbFetch("/tv/changes", {
      start_date: startDate,
      page: String(page),
    })) as { results?: Array<{ id?: number }>; total_pages?: number };
    for (const entry of payload.results ?? []) {
      if (typeof entry.id === "number") {
        changedIds.add(entry.id);
      }
    }
    totalPages = payload.total_pages ?? 1;
    page += 1;
  }

  if (changedIds.size > 0) {
    const rows = Array.from(changedIds, (tmdbId) => ({
      id: createId("ingest"),
      tmdbId,
      popularity: null,
      status: "pending" as const,
      nextRefreshAt: now,
      failCount: 0,
      updatedAt: now,
    }));
    const statements = chunkForSqlParams(rows, 9).map((chunk) =>
      db
        .insert(showIngestState)
        .values(chunk)
        .onConflictDoUpdate({
          target: showIngestState.tmdbId,
          set: {
            nextRefreshAt: sql`excluded.next_refresh_at`,
            updatedAt: sql`excluded.updated_at`,
          },
        }),
    );
    await runBatches(statements as Array<{ run?: unknown }>);
  }

  await db
    .insert(ingestSyncMeta)
    .values({ key: CHANGES_WATERMARK_KEY, value: String(now), updatedAt: now })
    .onConflictDoUpdate({
      target: ingestSyncMeta.key,
      set: { value: String(now), updatedAt: now },
    });
  return changedIds.size;
}

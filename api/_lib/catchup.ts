// "Where was I?" catch-up briefs: resolve the viewer's stop point, gather
// episode data up to exactly that episode, and have Gemini write a
// spoiler-safe "previously on". Pure windowing/prompt logic lives in
// lib/catchup.ts; this module owns data access, the global brief cache,
// quota, and session tokens (same scheme as Ask Plotlist).

import { and, eq } from "drizzle-orm";

import { catchupBriefs, episodeProgress, shows, users } from "../../db/schema";
import {
  buildCatchupPrompt,
  CATCHUP_BRIEF_VERSION,
  CATCHUP_DETAIL_EPISODE_COUNT,
  compareEpisodeOrder,
  episodesUpTo,
  sanitizeCatchupBrief,
  type CatchupBrief,
  type CatchupEpisodeInput,
  type CatchupStopPoint,
} from "../../lib/catchup";
import { hmacSha256, safeEqual } from "./crypto";
import { db } from "./db";
import { getServerEnv } from "./env";
import { ApiError } from "./errors";
import { generateJson } from "./gemini";
import { createId } from "./ids";
import { userHasPro } from "./pro";
import { consumeQuota, enforceRateLimit, peekQuota, rateLimitKey } from "./rate-limit";
import {
  fetchAndCacheSeason,
  readSeasonCacheEntries,
  seasonCacheKey,
  type CachedSeasonPayload,
} from "./season-cache";
import { loadWikiEpisodeSummaries } from "./wiki-episodes";

type UserRow = typeof users.$inferSelect;

export type CatchupInput = {
  showId: string;
  seasonNumber?: number;
  episodeNumber?: number;
  sessionId?: string;
};

export type CatchupEpisodeRef = {
  seasonNumber: number;
  episodeNumber: number;
  name: string | null;
};

export type CatchupResult = {
  sessionId: string;
  remaining: number | null;
  showId: string;
  stop: CatchupEpisodeRef;
  nextEpisode: CatchupEpisodeRef | null;
  brief: CatchupBrief;
};

// ── Sessions + quota ────────────────────────────────────────────────────────
// A session covers re-reads of the same show's brief for 15 minutes, so a
// remounted sheet never double-charges a free user. Same stateless HMAC
// token scheme as Ask Plotlist, scoped to the show.

const CATCHUP_SESSION_TTL_MS = 15 * 60 * 1000;
export const CATCHUP_FREE_BRIEFS_PER_MONTH = 2;
const CATCHUP_QUOTA_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;

// The most seasons we'll fetch from TMDB inline on a cache miss. Seasons
// closest to the stop point win — they carry the recap's detail windows.
const MAX_INLINE_SEASON_FETCHES = 8;

// Briefs are globally cached per (show, episode, version), so generations
// are rare and shared across the whole userbase — worth the full flash tier
// over the lite default for noticeably better synthesis.
const CATCHUP_GENERATION_MODEL = "gemini-3.5-flash";

type CatchupSessionTokenPayload = {
  userId: string;
  showId: string;
  purpose: "catchup-session";
  exp: number;
};

function signPayload(encodedPayload: string) {
  return hmacSha256(encodedPayload, getServerEnv().JWT_SECRET);
}

export function createCatchupSessionToken(
  userId: string,
  showId: string,
  now = Date.now(),
) {
  const payload: CatchupSessionTokenPayload = {
    userId,
    showId,
    purpose: "catchup-session",
    exp: now + CATCHUP_SESSION_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function verifyCatchupSessionToken(
  token: string | undefined,
  userId: string,
  showId: string,
  now = Date.now(),
): boolean {
  if (!token) return false;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return false;
  if (!safeEqual(signature, signPayload(encodedPayload))) return false;
  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as CatchupSessionTokenPayload;
    return (
      payload.purpose === "catchup-session" &&
      payload.userId === userId &&
      payload.showId === showId &&
      typeof payload.exp === "number" &&
      payload.exp > now
    );
  } catch {
    return false;
  }
}

export function catchupQuotaKey(userId: string) {
  return rateLimitKey("catchup", userId);
}

// ── Episode data ────────────────────────────────────────────────────────────

async function resolveStopPoint(
  userId: string,
  showId: string,
  input: CatchupInput,
): Promise<CatchupStopPoint> {
  if (input.seasonNumber != null && input.episodeNumber != null) {
    return { seasonNumber: input.seasonNumber, episodeNumber: input.episodeNumber };
  }
  const rows = await db
    .select({
      seasonNumber: episodeProgress.seasonNumber,
      episodeNumber: episodeProgress.episodeNumber,
    })
    .from(episodeProgress)
    .where(and(eq(episodeProgress.userId, userId), eq(episodeProgress.showId, showId)));
  let latest: CatchupStopPoint | null = null;
  for (const row of rows) {
    if (row.seasonNumber <= 0) continue;
    if (!latest || compareEpisodeOrder(row, latest) > 0) {
      latest = { seasonNumber: row.seasonNumber, episodeNumber: row.episodeNumber };
    }
  }
  if (!latest) {
    throw new ApiError(
      400,
      "catchup_no_progress",
      "Mark where you're up to first — then we can catch you up",
    );
  }
  return latest;
}

// Season payloads for seasons 1..stop (+ the next season, best-effort, for
// the "pick up with…" pointer). Stale cache entries are fine — past episodes
// don't change — so only missing seasons are fetched, capped and prioritized
// nearest the stop point.
//
// With `refsOnly` (the brief is already cached) only the stop season is
// worth fetching — the episode refs need it, the digest doesn't run.
async function loadSeasonPayloads(
  externalId: string,
  stop: CatchupStopPoint,
  options: { refsOnly?: boolean } = {},
): Promise<Map<number, CachedSeasonPayload>> {
  const wanted: number[] = [];
  for (let season = 1; season <= stop.seasonNumber + 1; season += 1) {
    wanted.push(season);
  }
  const entries = await readSeasonCacheEntries(
    wanted.map((seasonNumber) => ({ externalId, seasonNumber })),
  );
  const bySeason = new Map<number, CachedSeasonPayload>();
  for (const seasonNumber of wanted) {
    const entry = entries.get(seasonCacheKey(externalId, seasonNumber));
    if (entry) bySeason.set(seasonNumber, entry.payload);
  }

  const missing = wanted
    .filter(
      (seasonNumber) =>
        !bySeason.has(seasonNumber) &&
        seasonNumber <= stop.seasonNumber &&
        (!options.refsOnly || seasonNumber === stop.seasonNumber),
    )
    .sort((left, right) => right - left)
    .slice(0, MAX_INLINE_SEASON_FETCHES);
  // Independent TMDB season reads — bounded by MAX_INLINE_SEASON_FETCHES
  // above, so the whole miss set goes out as one wave.
  const fetched = await Promise.all(
    missing.map((seasonNumber) => fetchAndCacheSeason(externalId, seasonNumber)),
  );
  missing.forEach((seasonNumber, index) => {
    const payload = fetched[index];
    if (payload) bySeason.set(seasonNumber, payload);
  });
  return bySeason;
}

function collectEpisodes(bySeason: Map<number, CachedSeasonPayload>) {
  const episodes: CatchupEpisodeInput[] = [];
  for (const payload of bySeason.values()) {
    for (const episode of payload.episodes) {
      episodes.push({
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        name: episode.name,
        overview: episode.overview,
        airDate: episode.airDate,
      });
    }
  }
  return episodes;
}

function findEpisodeRefs(
  bySeason: Map<number, CachedSeasonPayload>,
  stop: CatchupStopPoint,
): { stop: CatchupEpisodeRef; nextEpisode: CatchupEpisodeRef | null } {
  const stopSeason = bySeason.get(stop.seasonNumber);
  const stopEpisode = stopSeason?.episodes.find(
    (episode) => episode.episodeNumber === stop.episodeNumber,
  );
  let next: CatchupEpisodeRef | null = null;
  const laterInSeason = stopSeason?.episodes.find(
    (episode) => episode.episodeNumber > stop.episodeNumber,
  );
  if (laterInSeason) {
    next = {
      seasonNumber: laterInSeason.seasonNumber,
      episodeNumber: laterInSeason.episodeNumber,
      name: laterInSeason.name,
    };
  } else {
    const nextSeason = bySeason.get(stop.seasonNumber + 1);
    const firstOfNext = nextSeason?.episodes[0];
    if (firstOfNext) {
      next = {
        seasonNumber: firstOfNext.seasonNumber,
        episodeNumber: firstOfNext.episodeNumber,
        name: firstOfNext.name,
      };
    }
  }
  return {
    stop: { ...stop, name: stopEpisode?.name ?? null },
    nextEpisode: next,
  };
}

// ── Pipeline ────────────────────────────────────────────────────────────────

export async function getCatchupBrief(
  user: UserRow,
  input: CatchupInput,
): Promise<CatchupResult> {
  const startedAt = Date.now();
  const isPro = userHasPro(user);
  await enforceRateLimit(rateLimitKey("catchup-burst", user.id), 10, 60_000);

  const showRows = await db
    .select()
    .from(shows)
    .where(eq(shows.id, input.showId))
    .limit(1);
  const show = showRows[0];
  if (!show) {
    throw new ApiError(404, "show_not_found", "Show not found");
  }
  if (show.externalSource !== "tmdb") {
    throw new ApiError(
      503,
      "catchup_unavailable",
      "Episode details aren't available for this show yet",
    );
  }

  const stopPoint = await resolveStopPoint(user.id, show.id, input);

  // Quota mirrors Ask Plotlist: a valid unexpired session token (re-reading
  // the same show's brief) never consumes a free brief.
  const hasValidSession = verifyCatchupSessionToken(input.sessionId, user.id, show.id);
  let remaining: number | null = null;
  if (!isPro) {
    if (hasValidSession) {
      const peeked = await peekQuota(
        catchupQuotaKey(user.id),
        CATCHUP_FREE_BRIEFS_PER_MONTH,
      );
      remaining = peeked.remaining;
    } else {
      const quota = await consumeQuota(
        catchupQuotaKey(user.id),
        CATCHUP_FREE_BRIEFS_PER_MONTH,
        CATCHUP_QUOTA_WINDOW_MS,
      );
      if (!quota.allowed) {
        throw new ApiError(
          403,
          "catchup_quota_exceeded",
          "You've used this month's free catch-ups",
        );
      }
      remaining = quota.remaining;
    }
  }
  const sessionId = hasValidSession
    ? input.sessionId!
    : createCatchupSessionToken(user.id, show.id);

  // Briefs are user-independent for a given stop point, so the whole
  // userbase shares one generation per (show, episode, prompt version).
  // The cache check comes first: a hit only needs the stop season for the
  // episode refs, not every season back to the pilot.
  const cachedRows = await db
    .select()
    .from(catchupBriefs)
    .where(
      and(
        eq(catchupBriefs.showId, show.id),
        eq(catchupBriefs.seasonNumber, stopPoint.seasonNumber),
        eq(catchupBriefs.episodeNumber, stopPoint.episodeNumber),
        eq(catchupBriefs.version, CATCHUP_BRIEF_VERSION),
      ),
    )
    .limit(1);
  const bySeason = await loadSeasonPayloads(show.externalId, stopPoint, {
    refsOnly: Boolean(cachedRows[0]),
  });
  const refs = findEpisodeRefs(bySeason, stopPoint);
  if (cachedRows[0]) {
    console.info(
      "[catchup] cache-hit",
      show.id,
      `S${stopPoint.seasonNumber}E${stopPoint.episodeNumber}`,
      `ms=${Date.now() - startedAt}`,
    );
    return {
      sessionId,
      remaining,
      showId: show.id,
      stop: refs.stop,
      nextEpisode: refs.nextEpisode,
      brief: { openThreads: [], ...cachedRows[0].brief },
    };
  }

  const episodes = episodesUpTo(collectEpisodes(bySeason), stopPoint);
  const hasStopSeason = episodes.some(
    (episode) => episode.seasonNumber === stopPoint.seasonNumber,
  );
  if (episodes.length === 0 || !hasStopSeason) {
    throw new ApiError(
      503,
      "catchup_unavailable",
      "Episode details aren't available for this show yet",
    );
  }

  // Ground the digest's detail windows in Wikipedia plot summaries — far
  // richer than TMDB's teaser overviews. Best-effort: on any miss the brief
  // falls back to the TMDB text per episode.
  const detailEpisodes = episodes.slice(-CATCHUP_DETAIL_EPISODE_COUNT);
  const tmdbNames = new Map<number, Map<number, string | null>>();
  for (const [seasonNumber, payload] of bySeason) {
    const names = new Map<number, string | null>();
    for (const episode of payload.episodes) {
      names.set(episode.episodeNumber, episode.name);
    }
    tmdbNames.set(seasonNumber, names);
  }
  const wikiSummaries = await loadWikiEpisodeSummaries({
    externalId: show.externalId,
    title: show.title,
    year: show.year,
    seasons: [...new Set(detailEpisodes.map((episode) => episode.seasonNumber))],
    tmdbNames,
  });
  const groundedEpisodes = episodes.map((episode) => ({
    ...episode,
    wikiSummary:
      wikiSummaries.get(episode.seasonNumber)?.get(episode.episodeNumber) ?? null,
  }));
  const wikiCovered = groundedEpisodes
    .slice(-CATCHUP_DETAIL_EPISODE_COUNT)
    .filter((episode) => episode.wikiSummary).length;

  let brief: CatchupBrief | null = null;
  try {
    const raw = await generateJson<unknown>({
      ...buildCatchupPrompt({
        show: { title: show.title, year: show.year, overview: show.overview },
        episodes: groundedEpisodes,
        stop: stopPoint,
      }),
      model: CATCHUP_GENERATION_MODEL,
    });
    brief = sanitizeCatchupBrief(raw);
  } catch (error) {
    console.warn("[catchup] generation failed", error);
  }
  if (!brief) {
    throw new ApiError(
      502,
      "catchup_generation_failed",
      "Couldn't put your catch-up together — try again in a moment",
    );
  }

  await db
    .insert(catchupBriefs)
    .values({
      id: createId("catchup"),
      showId: show.id,
      seasonNumber: stopPoint.seasonNumber,
      episodeNumber: stopPoint.episodeNumber,
      version: CATCHUP_BRIEF_VERSION,
      brief,
      createdAt: Date.now(),
    })
    .onConflictDoNothing();

  console.info(
    "[catchup] generated",
    show.id,
    `S${stopPoint.seasonNumber}E${stopPoint.episodeNumber}`,
    `episodes=${episodes.length}`,
    `wiki=${wikiCovered}/${detailEpisodes.length}`,
    `ms=${Date.now() - startedAt}`,
    `pro=${isPro}`,
  );
  return {
    sessionId,
    remaining,
    showId: show.id,
    stop: refs.stop,
    nextEpisode: refs.nextEpisode,
    brief,
  };
}

// Read-only status for the "N free catch-ups left" pill.
export async function getCatchupStatus(user: UserRow) {
  if (userHasPro(user)) {
    return { isPro: true, remaining: null };
  }
  const { remaining } = await peekQuota(
    catchupQuotaKey(user.id),
    CATCHUP_FREE_BRIEFS_PER_MONTH,
  );
  return { isPro: false, remaining };
}

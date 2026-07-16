import {
  compareEpisodePositions,
  normalizeEpisodeSeasonSummaries,
  type EpisodePosition,
  type EpisodeSeasonSummary,
} from "./episodeProgressState";

// The watch-status state machine, in one place so client and server agree.
//
// Six statuses in two families:
//   User intent (only the user moves a show in or out):
//     watchlist — saved for later
//     paused    — on hold; excluded from Continue until resumed
//     dropped   — abandoned
//   Watch tier (episode actions and show metadata move these automatically):
//     watching  — a released episode past the user's frontier is unwatched
//     caught_up — every released episode up to the frontier is watched and
//                 the show expects more (returning / in production)
//     finished  — caught up AND the show is ended or canceled
//
// "completed" is the legacy pre-split value. Old rows are migrated
// (drizzle/0011) and old clients may still send it; normalizeWatchStatus and
// the write paths resolve it to caught_up/finished so it never re-enters the
// system.
//
// Explicit choices are authoritative: picking watchlist/watching/paused/
// dropped only writes the status, picking finished (or legacy completed) also
// marks every released episode as watched (server-side) and then resolves to
// caught_up when the show is still returning. Removing the status never
// touches episode history. Episode actions may auto-move the status, but only
// along lines the user would expect:
//   - marking an episode on a watchlisted/paused/dropped/untracked show
//     resumes it into the watch tier
//   - the watch tier always re-resolves from the release frontier: watching
//     while released episodes remain, caught_up at the frontier, finished at
//     the frontier of an ended show
//   - unmarking is bookkeeping, not watching: it re-resolves the watch tier
//     but never resurrects watchlist/paused/dropped and never creates a
//     status where none existed
// Metadata changes reconcile the same way (reconcileWatchStatus): a show
// ending flips caught_up → finished, a revival flips finished → caught_up,
// and a new release flips caught_up → watching. watchlist/paused/dropped are
// never auto-changed by metadata.

export type WatchStatus =
  | "watchlist"
  | "watching"
  | "caught_up"
  | "finished"
  | "paused"
  | "dropped";

/** Statuses that may still arrive from old clients or unmigrated rows. */
export type LegacyWatchStatus = WatchStatus | "completed";

export const WATCH_STATUS_VALUES: readonly WatchStatus[] = [
  "watchlist",
  "watching",
  "caught_up",
  "finished",
  "paused",
  "dropped",
];

/** The auto-managed tier; user-intent statuses are everything else. */
export const WATCH_TIER_STATUSES = ["watching", "caught_up", "finished"] as const;
export type WatchTierStatus = (typeof WATCH_TIER_STATUSES)[number];

export function isWatchTierStatus(
  status: string | null | undefined,
): status is WatchTierStatus {
  return status === "watching" || status === "caught_up" || status === "finished";
}

/**
 * Everything the state machine needs to know about where a user stands on a
 * show, computed once from progress rows + show metadata.
 */
export type ShowProgressFacts = {
  /** The user has at least one watched episode. */
  hasWatchedAny: boolean;
  /** A released episode past the user's frontier is unwatched. */
  hasReleasedAfterFrontier: boolean;
  /** TMDB says ended/canceled. */
  isEnded: boolean;
  /** Released episodes before the frontier the user skipped. */
  gapEpisodes: EpisodePosition[];
  /** Released episodes we know about at all (0 = metadata too thin to judge). */
  releasedCount: number;
};

/**
 * The watch tier the facts support. Frontier-based on purpose: skipped
 * earlier episodes (gaps) don't hold a show out of caught_up/finished — they
 * surface separately so the user can backfill without their status thrashing.
 * With no usable release metadata (releasedCount 0) we can't judge, so the
 * conservative answer is "watching".
 */
export function resolveWatchTier(facts: ShowProgressFacts): WatchTierStatus {
  if (
    facts.hasReleasedAfterFrontier ||
    !facts.hasWatchedAny ||
    facts.releasedCount === 0
  ) {
    return "watching";
  }
  return facts.isEnded ? "finished" : "caught_up";
}

export function computeShowProgressFacts({
  watchedEpisodes,
  seasons,
  isEnded,
  lastAiredEpisode,
}: {
  watchedEpisodes: ReadonlyArray<Partial<EpisodePosition>> | null | undefined;
  seasons: ReadonlyArray<Partial<EpisodeSeasonSummary>> | null | undefined;
  isEnded: boolean;
  lastAiredEpisode: EpisodePosition | null;
}): ShowProgressFacts {
  const released = listReleasedEpisodes({ seasons, isEnded, lastAiredEpisode });
  const watchedKeys = new Set<string>();
  let latestWatched: EpisodePosition | null = null;
  for (const episode of watchedEpisodes ?? []) {
    if (
      typeof episode?.seasonNumber !== "number" ||
      typeof episode.episodeNumber !== "number"
    ) {
      continue;
    }
    const position = {
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
    };
    watchedKeys.add(`${position.seasonNumber}:${position.episodeNumber}`);
    if (!latestWatched || compareEpisodePositions(position, latestWatched) > 0) {
      latestWatched = position;
    }
  }

  let hasReleasedAfterFrontier = false;
  const gapEpisodes: EpisodePosition[] = [];
  for (const episode of released) {
    if (watchedKeys.has(`${episode.seasonNumber}:${episode.episodeNumber}`)) {
      continue;
    }
    if (!latestWatched || compareEpisodePositions(episode, latestWatched) > 0) {
      hasReleasedAfterFrontier = true;
    } else {
      gapEpisodes.push(episode);
    }
  }

  return {
    hasWatchedAny: latestWatched !== null,
    hasReleasedAfterFrontier,
    isEnded,
    gapEpisodes,
    releasedCount: released.length,
  };
}

export function resolveStatusAfterEpisodeChange({
  direction,
  currentStatus,
  facts,
}: {
  direction: "marked" | "unmarked";
  currentStatus: LegacyWatchStatus | null;
  facts: ShowProgressFacts;
}): WatchStatus | null {
  if (direction === "marked") {
    // Marking is watching: any status — including paused and dropped —
    // resumes into the tier the frontier supports.
    return resolveWatchTier(facts);
  }
  // Unmarking is bookkeeping, not watching: it re-resolves the watch tier but
  // never creates a watch state where none existed and never resurrects
  // watchlist/paused/dropped.
  if (!currentStatus) {
    return null;
  }
  if (isWatchTierStatus(currentStatus) || currentStatus === "completed") {
    return resolveWatchTier(facts);
  }
  return currentStatus;
}

/**
 * Correct a stored status against current progress + show metadata. Returns
 * the status the row should hold — reads compare it to what's stored and
 * write back when it differs. User-intent statuses are never auto-changed;
 * the watch tier re-resolves whenever we can actually judge it.
 *
 * When a show has no watched episodes (or no usable release metadata) the
 * stored status stands: there is nothing trustworthy to re-derive from.
 */
export function reconcileWatchStatus({
  currentStatus,
  facts,
}: {
  currentStatus: LegacyWatchStatus | null;
  facts: ShowProgressFacts;
}): WatchStatus | null {
  if (!currentStatus) return null;
  if (currentStatus === "watchlist" || currentStatus === "paused" || currentStatus === "dropped") {
    return currentStatus;
  }
  // Legacy completed with thin metadata: the closest honest reading is
  // finished (that's what "Completed" meant to the user who set it).
  if (facts.releasedCount === 0 || !facts.hasWatchedAny) {
    return currentStatus === "completed" ? "finished" : currentStatus;
  }
  return resolveWatchTier(facts);
}

/**
 * Map any stored/inbound status value (including legacy "completed") onto the
 * current enum for display. Write paths should use reconcileWatchStatus
 * instead so completed resolves against real show state.
 */
export function normalizeWatchStatus(
  status: string | null | undefined,
): WatchStatus | null {
  if (!status) return null;
  if (status === "completed") return "finished";
  return (WATCH_STATUS_VALUES as readonly string[]).includes(status)
    ? (status as WatchStatus)
    : null;
}

// TMDB's last_episode_to_air is the authoritative "released through" pointer
// for airing shows; it survives both raw and normalized detail payloads.
export function readLastAiredEpisode(payload: unknown): EpisodePosition | null {
  const raw = (payload as {
    last_episode_to_air?: unknown;
    lastEpisodeToAir?: unknown;
  } | null);
  const episode = (raw?.last_episode_to_air ?? raw?.lastEpisodeToAir) as {
    season_number?: unknown;
    seasonNumber?: unknown;
    episode_number?: unknown;
    episodeNumber?: unknown;
  } | null;
  const seasonNumber = episode?.seasonNumber ?? episode?.season_number;
  const episodeNumber = episode?.episodeNumber ?? episode?.episode_number;
  if (
    typeof seasonNumber === "number" &&
    Number.isInteger(seasonNumber) &&
    seasonNumber >= 1 &&
    typeof episodeNumber === "number" &&
    Number.isInteger(episodeNumber) &&
    episodeNumber >= 1
  ) {
    return { seasonNumber, episodeNumber };
  }
  return null;
}

// Every episode that has aired, per show metadata. Ended/canceled shows count
// every known episode; airing shows count everything up to and including
// last_episode_to_air. An airing show with no last-aired pointer has released
// nothing. Specials (season 0) and announced-but-empty seasons never count.
export function listReleasedEpisodes({
  seasons,
  isEnded,
  lastAiredEpisode,
}: {
  seasons: ReadonlyArray<Partial<EpisodeSeasonSummary>> | null | undefined;
  isEnded: boolean;
  lastAiredEpisode: EpisodePosition | null;
}): EpisodePosition[] {
  const released: EpisodePosition[] = [];
  for (const season of normalizeEpisodeSeasonSummaries(seasons)) {
    let releasedCount = 0;
    if (isEnded) {
      releasedCount = season.episodeCount;
    } else if (lastAiredEpisode) {
      if (season.seasonNumber < lastAiredEpisode.seasonNumber) {
        releasedCount = season.episodeCount;
      } else if (season.seasonNumber === lastAiredEpisode.seasonNumber) {
        // Never run past the season's known episode count, even if the
        // last-aired pointer disagrees with a stale summary.
        releasedCount = Math.min(season.episodeCount, lastAiredEpisode.episodeNumber);
      }
    }
    for (let episodeNumber = 1; episodeNumber <= releasedCount; episodeNumber += 1) {
      released.push({ seasonNumber: season.seasonNumber, episodeNumber });
    }
  }
  return released;
}

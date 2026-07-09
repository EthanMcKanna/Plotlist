import {
  normalizeEpisodeSeasonSummaries,
  type EpisodePosition,
  type EpisodeSeasonSummary,
} from "./episodeProgressState";

// The watch-status state machine, in one place so client and server agree.
//
// Explicit choices are authoritative: picking watchlist/watching/dropped only
// writes the status, picking completed also marks every released episode as
// watched (server-side), and removing the status never touches episode
// history. Episode actions may auto-move the status, but only along lines the
// user would expect:
//   - marking an episode on a watchlisted/dropped/untracked show → watching
//   - finishing every episode of an ended show → completed
//   - marking episodes never downgrades an explicit "completed"
//   - unmarking on a completed show that is no longer finished → watching
//   - unmarking never resurrects dropped/watchlist into "watching"

export type WatchStatus = "watchlist" | "watching" | "completed" | "dropped";

export function resolveStatusAfterEpisodeChange({
  direction,
  currentStatus,
  completesShow,
}: {
  direction: "marked" | "unmarked";
  currentStatus: WatchStatus | null;
  completesShow: boolean;
}): WatchStatus | null {
  if (direction === "marked") {
    if (completesShow || currentStatus === "completed") {
      return "completed";
    }
    return "watching";
  }
  // Unmarking is bookkeeping, not watching: it only ever demotes "completed",
  // and it never creates a watch state where none existed.
  if (!currentStatus) {
    return null;
  }
  if (currentStatus === "completed") {
    return completesShow ? "completed" : "watching";
  }
  return currentStatus;
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

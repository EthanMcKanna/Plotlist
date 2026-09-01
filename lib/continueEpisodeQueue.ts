import { compareEpisodePositions, type EpisodePosition } from "./episodeProgressState";

/**
 * The next few unwatched episodes after a continue card's pointer, sent by
 * the server alongside the card so a mark-watched tap can paint the *new*
 * next episode (name, still, runtime, air date) instantly instead of showing
 * a numbered placeholder until the rail refetches.
 *
 * Entries are sorted and only ever hold episodes strictly after the card's
 * current pointer. `airDate` is the TMDB date-only string ("YYYY-MM-DD") so
 * the client can compare it against the user's local day; `airDateTs` is the
 * same day as a timestamp for display and ranking.
 */
export type ContinueQueuedEpisode = EpisodePosition & {
  name: string | null;
  stillUrl: string | null;
  overview: string | null;
  runtime: number | null;
  airDate: string | null;
  airDateTs: number | null;
};

export const CONTINUE_EPISODE_QUEUE_DEPTH = 3;

function isValidPosition(value: Partial<EpisodePosition> | null | undefined) {
  return (
    Number.isInteger(value?.seasonNumber) &&
    (value?.seasonNumber as number) >= 1 &&
    Number.isInteger(value?.episodeNumber) &&
    (value?.episodeNumber as number) >= 1
  );
}

export function normalizeContinueEpisodeQueue(
  queue: ReadonlyArray<Partial<ContinueQueuedEpisode>> | null | undefined,
): ContinueQueuedEpisode[] {
  if (!Array.isArray(queue)) return [];
  const seen = new Set<string>();
  const entries: ContinueQueuedEpisode[] = [];
  for (const entry of queue) {
    if (!isValidPosition(entry)) continue;
    const key = `${entry.seasonNumber}:${entry.episodeNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      seasonNumber: entry.seasonNumber as number,
      episodeNumber: entry.episodeNumber as number,
      name: typeof entry.name === "string" && entry.name.trim() ? entry.name : null,
      stillUrl: typeof entry.stillUrl === "string" ? entry.stillUrl : null,
      overview: typeof entry.overview === "string" ? entry.overview : null,
      runtime:
        typeof entry.runtime === "number" && Number.isFinite(entry.runtime) && entry.runtime > 0
          ? entry.runtime
          : null,
      airDate: typeof entry.airDate === "string" ? entry.airDate : null,
      airDateTs:
        typeof entry.airDateTs === "number" && Number.isFinite(entry.airDateTs)
          ? entry.airDateTs
          : null,
    });
  }
  return entries.sort(compareEpisodePositions);
}

/**
 * The first queued episode after `latest` (or the head of the queue when
 * nothing has been watched). Null when the queue has nothing past it — which,
 * for a server-built queue, means no later episode is known to exist yet.
 */
export function findQueuedEpisodeAfter(
  queue: ReadonlyArray<ContinueQueuedEpisode>,
  latest: EpisodePosition | null | undefined,
): ContinueQueuedEpisode | null {
  for (const entry of queue) {
    if (!latest || compareEpisodePositions(entry, latest) > 0) {
      return entry;
    }
  }
  return null;
}

/** Everything in the queue strictly after `position`. */
export function trimQueueAfter(
  queue: ReadonlyArray<ContinueQueuedEpisode>,
  position: EpisodePosition,
): ContinueQueuedEpisode[] {
  return queue.filter((entry) => compareEpisodePositions(entry, position) > 0);
}

/**
 * Air status of a queued episode relative to the user's local day.
 * A listed episode with no air date hasn't aired (TMDB dates episodes once
 * they're scheduled), so it reads as undated-upcoming rather than ready.
 */
export function getQueuedEpisodeAirStatus(
  entry: Pick<ContinueQueuedEpisode, "airDate" | "airDateTs">,
  today: string,
): {
  isUpcoming: boolean;
  releasedToday: boolean;
  nextAirDate: number | null;
  nextReleaseDate: number | null;
} {
  if (!entry.airDate) {
    return { isUpcoming: true, releasedToday: false, nextAirDate: null, nextReleaseDate: null };
  }
  if (entry.airDate > today) {
    return {
      isUpcoming: true,
      releasedToday: false,
      nextAirDate: entry.airDateTs,
      nextReleaseDate: entry.airDateTs,
    };
  }
  return {
    isUpcoming: false,
    releasedToday: entry.airDate === today,
    nextAirDate: null,
    nextReleaseDate: entry.airDateTs,
  };
}

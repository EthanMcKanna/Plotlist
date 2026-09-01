export type UpNextEpisodePosition = {
  season: number;
  episode: number;
};

export type UpNextReleaseEvent = {
  airDate: string;
  airDateTs: number;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle?: string | null;
};

export type UpNextFallbackEpisode = {
  nextSeasonNumber: number;
  nextEpisodeNumber: number;
  nextEpisodeName?: string | null;
  nextEpisodeStillUrl?: string | null;
  nextAirDate?: number | null;
  nextReleaseDate?: number | null;
  nextEpisodeReleasedToday?: boolean;
  isUpcoming?: boolean;
  isCaughtUp?: boolean;
  totalEpisodes: number;
  sortTimestamp: number;
};

export type ReleaseAwareUpNextEpisode = UpNextFallbackEpisode;

function isEpisodeAfter(
  event: UpNextReleaseEvent,
  latest: UpNextEpisodePosition | null | undefined,
) {
  if (!latest) return true;
  return (
    event.seasonNumber > latest.season ||
    (event.seasonNumber === latest.season && event.episodeNumber > latest.episode)
  );
}

function isSameEpisode(
  event: UpNextReleaseEvent,
  fallback: UpNextFallbackEpisode,
) {
  return (
    event.seasonNumber === fallback.nextSeasonNumber &&
    event.episodeNumber === fallback.nextEpisodeNumber
  );
}

function isFallbackCaughtUp(
  fallback: UpNextFallbackEpisode,
  latest: UpNextEpisodePosition | null | undefined,
) {
  return Boolean(
    latest &&
      fallback.nextSeasonNumber === latest.season &&
      fallback.nextEpisodeNumber === latest.episode,
  );
}

function normalizeTitle(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || null;
}

/**
 * Overlay release-calendar events on the season-cache-derived next episode.
 *
 * Events are the fresher source for airing shows: they name episodes whose
 * cached season counts still lag, and they carry the air date that decides
 * whether the card reads "New", "Airs <date>", or plain progress. Events are
 * considered from `releasedSince` (a date-only lower bound; defaults to
 * `today`, i.e. no lookback) so a drop from a few days ago still counts as a
 * release the user hasn't caught yet.
 *
 * An event overrides the fallback only when it *is* the fallback episode, or
 * when the fallback thinks the user is caught up (a new release proves it
 * isn't). A user with unwatched backlog keeps their season-derived pointer;
 * a later event never skips them ahead.
 *
 * `rankReleaseTimestamp` maps a released event to the ranking moment it
 * should count as (the start of its air day in the user's timezone); the
 * raw `airDateTs` is used when omitted.
 */
export function getReleaseAwareUpNextEpisode({
  fallback,
  latestWatched,
  watchedEpisodeCount,
  releaseEvents,
  today,
  releasedSince,
  rankReleaseTimestamp,
}: {
  fallback: UpNextFallbackEpisode;
  latestWatched?: UpNextEpisodePosition | null;
  watchedEpisodeCount: number;
  releaseEvents: UpNextReleaseEvent[];
  today: string;
  releasedSince?: string;
  rankReleaseTimestamp?: (event: UpNextReleaseEvent) => number;
}): ReleaseAwareUpNextEpisode {
  const lowerBound = releasedSince && releasedSince < today ? releasedSince : today;
  const sortedEvents = releaseEvents
    .filter((event) => event.airDate >= lowerBound)
    .filter((event) => isEpisodeAfter(event, latestWatched))
    .sort(
      (left, right) =>
        left.airDateTs - right.airDateTs ||
        left.seasonNumber - right.seasonNumber ||
        left.episodeNumber - right.episodeNumber,
    );
  const matchingFallbackEvent = sortedEvents.find((event) =>
    isSameEpisode(event, fallback),
  );
  // A show nobody has started keeps its first-episode pointer; only an event
  // for that very episode (a premiere) says anything about it.
  const releaseEvent =
    matchingFallbackEvent ??
    (isFallbackCaughtUp(fallback, latestWatched) ? sortedEvents[0] : null);

  if (!releaseEvent) return fallback;

  const isUpcoming = releaseEvent.airDate > today;
  const nextEpisodeName =
    normalizeTitle(releaseEvent.episodeTitle) ?? fallback.nextEpisodeName ?? null;
  const nextAirDate = isUpcoming ? releaseEvent.airDateTs : null;
  const nextEpisodeReleasedToday = releaseEvent.airDate === today;
  const totalEpisodes = isUpcoming
    ? fallback.totalEpisodes
    : Math.max(fallback.totalEpisodes, watchedEpisodeCount + 1);
  const releaseRankTs = rankReleaseTimestamp
    ? rankReleaseTimestamp(releaseEvent)
    : releaseEvent.airDateTs;

  return {
    ...fallback,
    nextSeasonNumber: releaseEvent.seasonNumber,
    nextEpisodeNumber: releaseEvent.episodeNumber,
    nextEpisodeName,
    nextAirDate,
    nextReleaseDate: releaseEvent.airDateTs,
    nextEpisodeReleasedToday,
    isUpcoming,
    isCaughtUp: false,
    totalEpisodes,
    sortTimestamp: isUpcoming
      ? fallback.sortTimestamp
      : Math.max(
          fallback.sortTimestamp,
          Number.isFinite(releaseRankTs) ? releaseRankTs : releaseEvent.airDateTs,
        ),
  };
}

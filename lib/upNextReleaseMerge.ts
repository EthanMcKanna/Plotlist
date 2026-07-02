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

export function getReleaseAwareUpNextEpisode({
  fallback,
  latestWatched,
  watchedEpisodeCount,
  releaseEvents,
  today,
}: {
  fallback: UpNextFallbackEpisode;
  latestWatched?: UpNextEpisodePosition | null;
  watchedEpisodeCount: number;
  releaseEvents: UpNextReleaseEvent[];
  today: string;
}): ReleaseAwareUpNextEpisode {
  const sortedEvents = releaseEvents
    .filter((event) => event.airDate >= today)
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
  const releaseEvent =
    matchingFallbackEvent ??
    (isFallbackCaughtUp(fallback, latestWatched) || !latestWatched
      ? sortedEvents[0]
      : null);

  if (!releaseEvent) return fallback;

  const isUpcoming = releaseEvent.airDate > today;
  const nextEpisodeName =
    normalizeTitle(releaseEvent.episodeTitle) ?? fallback.nextEpisodeName ?? null;
  const nextAirDate = isUpcoming ? releaseEvent.airDateTs : null;
  const nextEpisodeReleasedToday = releaseEvent.airDate === today;
  const totalEpisodes = isUpcoming
    ? fallback.totalEpisodes
    : Math.max(fallback.totalEpisodes, watchedEpisodeCount + 1);

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
      : Math.max(fallback.sortTimestamp, releaseEvent.airDateTs),
  };
}

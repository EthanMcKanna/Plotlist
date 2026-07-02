export type EpisodePosition = {
  seasonNumber: number;
  episodeNumber: number;
};

export type EpisodeSeasonSummary = {
  seasonNumber: number;
  episodeCount: number;
  airDate?: string | null;
};

export type EpisodeProgressEntry = EpisodePosition & {
  watchedAt?: number | null;
};

export type EpisodeProgressState = {
  totalWatched: number;
  totalEpisodes: number;
  latestWatched: EpisodePosition | null;
  nextEpisode: EpisodePosition | null;
  isCaughtUp: boolean;
  seasons: EpisodeSeasonSummary[];
};

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function normalizeEpisodeCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

export function compareEpisodePositions(
  left: EpisodePosition,
  right: EpisodePosition,
) {
  return (
    left.seasonNumber - right.seasonNumber ||
    left.episodeNumber - right.episodeNumber
  );
}

export function normalizeEpisodeSeasonSummaries(
  seasons: ReadonlyArray<Partial<EpisodeSeasonSummary>> | null | undefined,
): EpisodeSeasonSummary[] {
  const bySeason = new Map<number, EpisodeSeasonSummary>();

  for (const season of seasons ?? []) {
    if (!isPositiveInteger(season?.seasonNumber)) {
      continue;
    }

    const episodeCount = normalizeEpisodeCount(season.episodeCount);
    const existing = bySeason.get(season.seasonNumber);
    bySeason.set(season.seasonNumber, {
      seasonNumber: season.seasonNumber,
      episodeCount: Math.max(existing?.episodeCount ?? 0, episodeCount),
      airDate: existing?.airDate ?? season.airDate ?? null,
    });
  }

  return Array.from(bySeason.values()).sort(
    (left, right) => left.seasonNumber - right.seasonNumber,
  );
}

export function getTotalKnownEpisodes(
  seasons: ReadonlyArray<Partial<EpisodeSeasonSummary>> | null | undefined,
) {
  return normalizeEpisodeSeasonSummaries(seasons).reduce(
    (sum, season) => sum + season.episodeCount,
    0,
  );
}

export function getLatestWatchedEpisode(
  episodes: ReadonlyArray<Partial<EpisodeProgressEntry>> | null | undefined,
): EpisodePosition | null {
  let latest: EpisodePosition | null = null;

  for (const episode of episodes ?? []) {
    if (
      !isPositiveInteger(episode?.seasonNumber) ||
      !isPositiveInteger(episode.episodeNumber)
    ) {
      continue;
    }

    const position = {
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
    };
    if (!latest || compareEpisodePositions(position, latest) > 0) {
      latest = position;
    }
  }

  return latest;
}

function getUniqueWatchedEpisodes(
  episodes: ReadonlyArray<Partial<EpisodeProgressEntry>> | null | undefined,
) {
  const seen = new Set<string>();
  const unique: EpisodePosition[] = [];

  for (const episode of episodes ?? []) {
    if (
      !isPositiveInteger(episode?.seasonNumber) ||
      !isPositiveInteger(episode.episodeNumber)
    ) {
      continue;
    }

    const key = `${episode.seasonNumber}:${episode.episodeNumber}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push({
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
    });
  }

  return unique.sort(compareEpisodePositions);
}

function getInitialEpisode(seasons: EpisodeSeasonSummary[]): EpisodePosition {
  const firstSeason =
    seasons.find((season) => season.episodeCount > 0) ?? seasons[0];
  return {
    seasonNumber: firstSeason?.seasonNumber ?? 1,
    episodeNumber: 1,
  };
}

export function getNextEpisodeAfter(
  latest: EpisodePosition | null | undefined,
  seasons: ReadonlyArray<Partial<EpisodeSeasonSummary>> | null | undefined,
): EpisodePosition | null {
  const normalizedSeasons = normalizeEpisodeSeasonSummaries(seasons);

  if (!latest) {
    return getInitialEpisode(normalizedSeasons);
  }

  if (normalizedSeasons.length === 0) {
    return {
      seasonNumber: latest.seasonNumber,
      episodeNumber: latest.episodeNumber + 1,
    };
  }

  const currentSeason = normalizedSeasons.find(
    (season) => season.seasonNumber === latest.seasonNumber,
  );
  if (!currentSeason) {
    return {
      seasonNumber: latest.seasonNumber,
      episodeNumber: latest.episodeNumber + 1,
    };
  }

  if (currentSeason.episodeCount === 0) {
    return {
      seasonNumber: currentSeason.seasonNumber,
      episodeNumber: latest.episodeNumber + 1,
    };
  }

  if (latest.episodeNumber < currentSeason.episodeCount) {
    return {
      seasonNumber: currentSeason.seasonNumber,
      episodeNumber: latest.episodeNumber + 1,
    };
  }

  const nextSeason = normalizedSeasons.find(
    (season) => season.seasonNumber > latest.seasonNumber,
  );
  if (nextSeason) {
    return {
      seasonNumber: nextSeason.seasonNumber,
      episodeNumber: 1,
    };
  }

  return null;
}

export function getEpisodeProgressState({
  watchedEpisodes,
  seasons,
}: {
  watchedEpisodes: ReadonlyArray<Partial<EpisodeProgressEntry>> | null | undefined;
  seasons: ReadonlyArray<Partial<EpisodeSeasonSummary>> | null | undefined;
}): EpisodeProgressState {
  const normalizedSeasons = normalizeEpisodeSeasonSummaries(seasons);
  const uniqueWatchedEpisodes = getUniqueWatchedEpisodes(watchedEpisodes);
  const latestWatched = uniqueWatchedEpisodes.at(-1) ?? null;
  const nextEpisode = getNextEpisodeAfter(latestWatched, normalizedSeasons);
  const totalEpisodes = normalizedSeasons.reduce(
    (sum, season) => sum + season.episodeCount,
    0,
  );

  return {
    totalWatched: uniqueWatchedEpisodes.length,
    totalEpisodes,
    latestWatched,
    nextEpisode,
    isCaughtUp: Boolean(latestWatched && totalEpisodes > 0 && !nextEpisode),
    seasons: normalizedSeasons,
  };
}

import { api } from "./plotlist/api";
import type { LocalStore } from "./plotlist/react";
import { getUpNextQueryArgs } from "./upNextQueryArgs";
import {
  compareEpisodePositions,
  getEpisodeProgressState,
  type EpisodeSeasonSummary,
} from "./episodeProgressState";

type EpisodeRef = {
  showId: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle?: string;
};

type ProgressEntry = EpisodeRef & {
  _id?: string;
  id?: string;
  userId?: string;
  watchedAt?: number;
};

type UpNextItem = {
  showId: string;
  totalWatched?: number;
  totalEpisodes?: number;
  progressPct?: number;
  nextSeasonNumber?: number;
  nextEpisodeNumber?: number;
  nextAirDate?: number | null;
  nextReleaseDate?: number | null;
  nextEpisodeReleasedToday?: boolean;
  nextEpisodeStillUrl?: string | null;
  nextEpisodeName?: string | null;
  nextEpisodeOverview?: string | null;
  nextEpisodeRuntime?: number | null;
  lastWatchedAt?: number | null;
  isUpcoming?: boolean;
  isCaughtUp?: boolean;
  // Set while an optimistic update believes the show just became caught up,
  // so the continue-watching rail keeps the card mounted (showing "Complete")
  // until the server confirms instead of yanking it and maybe flashing it
  // back when more episodes exist.
  optimisticCaughtUp?: boolean;
  seasons?: EpisodeSeasonSummary[];
};

type MarkSeasonArgs = {
  showId: string;
  seasonNumber: number;
  episodes: { episodeNumber: number; title?: string }[];
};

function sameEpisode(left: EpisodeRef, right: EpisodeRef) {
  return (
    left.showId === right.showId &&
    left.seasonNumber === right.seasonNumber &&
    left.episodeNumber === right.episodeNumber
  );
}

function compareEpisode(left: EpisodeRef, right: EpisodeRef) {
  return compareEpisodePositions(left, right);
}

function makeProgressEntry(args: EpisodeRef): ProgressEntry {
  const key = `${args.showId}:${args.seasonNumber}:${args.episodeNumber}`;
  return {
    _id: `optimistic:episode:${key}`,
    id: `optimistic:episode:${key}`,
    showId: args.showId,
    seasonNumber: args.seasonNumber,
    episodeNumber: args.episodeNumber,
    episodeTitle: args.episodeTitle,
    watchedAt: Date.now(),
  };
}

function upsertProgress(current: ProgressEntry[] | undefined, episode: EpisodeRef) {
  const rows = Array.isArray(current) ? current : [];
  if (rows.some((entry) => sameEpisode(entry, episode))) {
    return rows;
  }
  return [...rows, makeProgressEntry(episode)];
}

function removeProgress(current: ProgressEntry[] | undefined, episode: EpisodeRef) {
  const rows = Array.isArray(current) ? current : [];
  return rows.filter((entry) => !sameEpisode(entry, episode));
}

function removeSeasonProgress(current: ProgressEntry[] | undefined, args: {
  showId: string;
  seasonNumber: number;
}) {
  const rows = Array.isArray(current) ? current : [];
  return rows.filter(
    (entry) =>
      entry.showId !== args.showId || entry.seasonNumber !== args.seasonNumber,
  );
}

function updateUpNextItem(
  item: UpNextItem,
  episode: EpisodeRef,
  nextProgress: ProgressEntry[] | undefined,
  mode: "mark" | "unmark",
) {
  const progressState = getEpisodeProgressState({
    watchedEpisodes: nextProgress,
    seasons: item.seasons,
  });
  const totalEpisodes =
    progressState.totalEpisodes > 0
      ? progressState.totalEpisodes
      : item.totalEpisodes ?? 0;
  const progressCount = Array.isArray(nextProgress)
    ? progressState.totalWatched
    : Math.max(0, (item.totalWatched ?? 0) + (mode === "mark" ? 1 : -1));
  const latest = progressState.latestWatched;
  const currentNext = {
    showId: item.showId,
    seasonNumber: item.nextSeasonNumber ?? 1,
    episodeNumber: item.nextEpisodeNumber ?? 1,
  };

  let nextSeasonNumber = item.nextSeasonNumber ?? 1;
  let nextEpisodeNumber = item.nextEpisodeNumber ?? 1;
  const hasSeasonData = progressState.totalEpisodes > 0;
  // Only infer caught-up from the count comparison when the item's total
  // did not come from release-event inflation (the server reports
  // `watchedCount + 1` for ongoing shows with a released next episode, which
  // would wrongly complete the show on every mark).
  const caughtUp = hasSeasonData
    ? progressState.isCaughtUp
    : totalEpisodes > 0 &&
      progressCount >= totalEpisodes &&
      !item.nextReleaseDate &&
      !item.nextEpisodeReleasedToday;

  if (caughtUp && latest) {
    nextSeasonNumber = latest.seasonNumber;
    nextEpisodeNumber = latest.episodeNumber;
  } else if (progressState.nextEpisode) {
    nextSeasonNumber = progressState.nextEpisode.seasonNumber;
    nextEpisodeNumber = progressState.nextEpisode.episodeNumber;
  } else if (mode === "mark") {
    nextSeasonNumber = episode.seasonNumber;
    nextEpisodeNumber = episode.episodeNumber + 1;
  } else if (compareEpisode(episode, currentNext) <= 0) {
    nextSeasonNumber = episode.seasonNumber;
    nextEpisodeNumber = episode.episodeNumber;
  }

  const previousNext = {
    seasonNumber: item.nextSeasonNumber ?? 1,
    episodeNumber: item.nextEpisodeNumber ?? 1,
  };
  const nextChanged =
    caughtUp ||
    compareEpisodePositions(previousNext, {
      seasonNumber: nextSeasonNumber,
      episodeNumber: nextEpisodeNumber,
    }) !== 0;

  return {
    ...item,
    totalWatched: progressCount,
    progressPct:
      totalEpisodes > 0
        ? Math.min(1, Math.max(0, progressCount / totalEpisodes))
        : item.progressPct,
    nextSeasonNumber,
    nextEpisodeNumber,
    nextEpisodeName: nextChanged ? null : item.nextEpisodeName,
    nextEpisodeStillUrl: nextChanged ? null : item.nextEpisodeStillUrl,
    nextEpisodeOverview: nextChanged ? null : item.nextEpisodeOverview,
    nextEpisodeRuntime: nextChanged ? null : item.nextEpisodeRuntime,
    lastWatchedAt: mode === "mark" ? Date.now() : item.lastWatchedAt,
    nextAirDate: nextChanged ? null : item.nextAirDate,
    nextReleaseDate: nextChanged ? null : item.nextReleaseDate,
    nextEpisodeReleasedToday: nextChanged ? false : item.nextEpisodeReleasedToday,
    isUpcoming: nextChanged ? false : item.isUpcoming,
    isCaughtUp: caughtUp,
    optimisticCaughtUp: caughtUp && !item.isCaughtUp ? true : undefined,
    seasons: progressState.seasons.length > 0 ? progressState.seasons : item.seasons,
  };
}

function updateUpNextCaches(
  localStore: LocalStore,
  episode: EpisodeRef,
  nextProgress: ProgressEntry[] | undefined,
  mode: "mark" | "unmark",
) {
  // Legacy no-arg keys plus the timezone-scoped key the rails query with —
  // all shapes must be patched for the optimistic update to be visible.
  for (const args of [undefined, {}, getUpNextQueryArgs()]) {
    const current = localStore.getQuery(api.episodeProgress.getUpNext, args);
    if (!Array.isArray(current)) {
      continue;
    }
    localStore.setQuery(
      api.episodeProgress.getUpNext,
      args,
      current.map((item: UpNextItem) =>
        item?.showId === episode.showId
          ? updateUpNextItem(item, episode, nextProgress, mode)
          : item,
      ),
    );
  }
}

export function optimisticMarkEpisodeWatched(
  localStore: LocalStore,
  args: EpisodeRef,
) {
  const progressArgs = { showId: args.showId };
  const current = localStore.getQuery(
    api.episodeProgress.getProgressForShow,
    progressArgs,
  ) as ProgressEntry[] | undefined;
  const nextProgress = upsertProgress(current, args);
  localStore.setQuery(api.episodeProgress.getProgressForShow, progressArgs, nextProgress);
  updateUpNextCaches(localStore, args, nextProgress, "mark");
}

export function optimisticToggleEpisode(localStore: LocalStore, args: EpisodeRef) {
  const progressArgs = { showId: args.showId };
  const current = localStore.getQuery(
    api.episodeProgress.getProgressForShow,
    progressArgs,
  ) as ProgressEntry[] | undefined;
  const isWatched = Array.isArray(current) && current.some((entry) => sameEpisode(entry, args));
  const nextProgress = isWatched
    ? removeProgress(current, args)
    : upsertProgress(current, args);
  localStore.setQuery(api.episodeProgress.getProgressForShow, progressArgs, nextProgress);
  updateUpNextCaches(localStore, args, nextProgress, isWatched ? "unmark" : "mark");
}

export function optimisticMarkSeasonWatched(
  localStore: LocalStore,
  args: MarkSeasonArgs,
) {
  const progressArgs = { showId: args.showId };
  const current = localStore.getQuery(
    api.episodeProgress.getProgressForShow,
    progressArgs,
  ) as ProgressEntry[] | undefined;
  const nextProgress = args.episodes.reduce(
    (rows, episode) =>
      upsertProgress(rows, {
        showId: args.showId,
        seasonNumber: args.seasonNumber,
        episodeNumber: episode.episodeNumber,
        episodeTitle: episode.title,
      }),
    current,
  );
  localStore.setQuery(api.episodeProgress.getProgressForShow, progressArgs, nextProgress);
  const latestEpisode = getEpisodeProgressState({
    watchedEpisodes: nextProgress,
    seasons: undefined,
  }).latestWatched;
  if (latestEpisode) {
    updateUpNextCaches(
      localStore,
      { showId: args.showId, ...latestEpisode },
      nextProgress,
      "mark",
    );
  }
}

export function optimisticUnmarkSeasonWatched(
  localStore: LocalStore,
  args: { showId: string; seasonNumber: number },
) {
  const progressArgs = { showId: args.showId };
  const current = localStore.getQuery(
    api.episodeProgress.getProgressForShow,
    progressArgs,
  ) as ProgressEntry[] | undefined;
  const nextProgress = removeSeasonProgress(current, args);
  localStore.setQuery(api.episodeProgress.getProgressForShow, progressArgs, nextProgress);
  updateUpNextCaches(
    localStore,
    { showId: args.showId, seasonNumber: args.seasonNumber, episodeNumber: 1 },
    nextProgress,
    "unmark",
  );
}

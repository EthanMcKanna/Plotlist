import { api } from "./plotlist/api";
import type { LocalStore } from "./plotlist/react";
import { getUpNextQueryArgs } from "./upNextQueryArgs";
import {
  compareEpisodePositions,
  getEpisodeProgressState,
  isEpisodeVerified,
  type EpisodePosition,
  type EpisodeSeasonSummary,
} from "./episodeProgressState";
import {
  findQueuedEpisodeAfter,
  getQueuedEpisodeAirStatus,
  normalizeContinueEpisodeQueue,
  trimQueueAfter,
  type ContinueQueuedEpisode,
} from "./continueEpisodeQueue";
import { getLocalDateString } from "./releaseCalendar";

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
  nextEpisodeAirDateTs?: number | null;
  lastWatchedAt?: number | null;
  isUpcoming?: boolean;
  isCaughtUp?: boolean;
  // Set while an optimistic update believes the show just became caught up,
  // so the continue-watching rail keeps the card mounted (showing "Complete")
  // until the server confirms instead of yanking it and maybe flashing it
  // back when more episodes exist.
  optimisticCaughtUp?: boolean;
  seasons?: EpisodeSeasonSummary[];
  // The next few episodes after the pointer, from the server's season cache.
  // Lets a mark paint the new next episode with real metadata immediately.
  nextEpisodes?: ContinueQueuedEpisode[];
};

type ContinueSurface = Record<string, unknown> & {
  resume?: UpNextItem[];
  newEpisodes?: UpNextItem[];
  returning?: UpNextItem[];
  gaps?: UpNextItem[];
  paused?: UpNextItem[];
  dropped?: UpNextItem[];
};

const CONTINUE_SURFACE_BUCKETS = [
  "resume",
  "newEpisodes",
  "returning",
  "gaps",
  "paused",
  "dropped",
] as const;

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

function clampRatio(value: number) {
  return Math.min(1, Math.max(0, value));
}

/**
 * Re-derive one continue card after an episode change.
 *
 * Marking walks the pointer forward. When the server sent a queue of the
 * episodes after the pointer, the new next episode comes from it complete
 * with name, still, runtime and air status — so the card repaints exactly
 * as the server will describe it, with nothing to wait for. A queue with
 * nothing past the frontier means no later episode is known to exist: the
 * show is caught up (or, when the summary points into an announced-but-
 * empty season, "coming soon"), never a fabricated "Episode N".
 *
 * Unmarking (and payloads without a queue) fall back to the season summary:
 * the pointer moves, and metadata for an episode we know nothing about is
 * cleared rather than shown stale until the refetch lands.
 */
function updateUpNextItem(
  item: UpNextItem,
  episode: EpisodeRef,
  nextProgress: ProgressEntry[] | undefined,
  mode: "mark" | "unmark",
  today: string,
  progressKnown: boolean,
) {
  const progressState = getEpisodeProgressState({
    watchedEpisodes: nextProgress,
    seasons: item.seasons,
  });
  const hasQueue = Array.isArray(item.nextEpisodes);
  const queue = normalizeContinueEpisodeQueue(item.nextEpisodes);
  // Without the per-show progress cache the rows above are just the episode
  // being marked, good for the pointer but not the count — the card's own
  // count moves by one instead.
  const progressCount = progressKnown
    ? progressState.totalWatched
    : Math.max(0, (item.totalWatched ?? 0) + (mode === "mark" ? 1 : -1));
  const hasSeasonData = progressState.totalEpisodes > 0;
  const latest: EpisodePosition | null =
    progressState.latestWatched ??
    (mode === "mark"
      ? { seasonNumber: episode.seasonNumber, episodeNumber: episode.episodeNumber }
      : null);
  const seasons = progressState.seasons.length > 0 ? progressState.seasons : item.seasons;

  const queued = mode === "mark" && hasQueue ? findQueuedEpisodeAfter(queue, latest) : null;
  if (queued) {
    const air = getQueuedEpisodeAirStatus(queued, today);
    // The server widens totals when its season cache knows more episodes
    // than the details summary; never let the count read below the pointer.
    const totalEpisodes = Math.max(
      progressState.totalEpisodes,
      item.totalEpisodes ?? 0,
      progressCount + 1,
    );
    return {
      ...item,
      totalWatched: progressCount,
      totalEpisodes: totalEpisodes > 0 ? totalEpisodes : item.totalEpisodes,
      progressPct: totalEpisodes > 0 ? clampRatio(progressCount / totalEpisodes) : item.progressPct,
      nextSeasonNumber: queued.seasonNumber,
      nextEpisodeNumber: queued.episodeNumber,
      nextEpisodeName: queued.name,
      nextEpisodeStillUrl: queued.stillUrl,
      nextEpisodeOverview: queued.overview,
      nextEpisodeRuntime: queued.runtime,
      nextEpisodeAirDateTs: queued.airDateTs,
      lastWatchedAt: Date.now(),
      nextAirDate: air.nextAirDate,
      nextReleaseDate: air.nextReleaseDate,
      nextEpisodeReleasedToday: air.releasedToday,
      isUpcoming: air.isUpcoming,
      isCaughtUp: false,
      optimisticCaughtUp: undefined,
      nextEpisodes: trimQueueAfter(queue, queued),
      seasons,
    };
  }

  const totalEpisodes = Math.max(progressState.totalEpisodes, item.totalEpisodes ?? 0);
  const currentNext = {
    showId: item.showId,
    seasonNumber: item.nextSeasonNumber ?? 1,
    episodeNumber: item.nextEpisodeNumber ?? 1,
  };

  let nextSeasonNumber = item.nextSeasonNumber ?? 1;
  let nextEpisodeNumber = item.nextEpisodeNumber ?? 1;
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
  // The summary points past what it can vouch for (an announced season with
  // no episodes yet): the server presents that as "coming soon", so does the
  // optimistic card.
  const pointerUnverified =
    mode === "mark" &&
    !caughtUp &&
    hasSeasonData &&
    !isEpisodeVerified(
      { seasonNumber: nextSeasonNumber, episodeNumber: nextEpisodeNumber },
      progressState.seasons,
    );

  return {
    ...item,
    totalWatched: progressCount,
    totalEpisodes: totalEpisodes > 0 ? totalEpisodes : item.totalEpisodes,
    progressPct:
      totalEpisodes > 0 ? clampRatio(progressCount / totalEpisodes) : item.progressPct,
    nextSeasonNumber,
    nextEpisodeNumber,
    nextEpisodeName: nextChanged ? null : item.nextEpisodeName,
    nextEpisodeStillUrl: nextChanged ? null : item.nextEpisodeStillUrl,
    nextEpisodeOverview: nextChanged ? null : item.nextEpisodeOverview,
    nextEpisodeRuntime: nextChanged ? null : item.nextEpisodeRuntime,
    nextEpisodeAirDateTs: nextChanged ? null : item.nextEpisodeAirDateTs,
    lastWatchedAt: mode === "mark" ? Date.now() : item.lastWatchedAt,
    nextAirDate: nextChanged ? null : item.nextAirDate,
    nextReleaseDate: nextChanged ? null : item.nextReleaseDate,
    nextEpisodeReleasedToday: nextChanged ? false : item.nextEpisodeReleasedToday,
    isUpcoming: nextChanged ? pointerUnverified : item.isUpcoming,
    isCaughtUp: caughtUp,
    optimisticCaughtUp: caughtUp && !item.isCaughtUp ? true : undefined,
    nextEpisodes: hasQueue
      ? trimQueueAfter(queue, { seasonNumber: nextSeasonNumber, episodeNumber: nextEpisodeNumber })
      : item.nextEpisodes,
    seasons,
  };
}

function updateUpNextCaches(
  localStore: LocalStore,
  episode: EpisodeRef,
  nextProgress: ProgressEntry[] | undefined,
  mode: "mark" | "unmark",
  progressKnown: boolean,
) {
  const today = getLocalDateString(new Date());
  const patch = (item: UpNextItem) =>
    item?.showId === episode.showId
      ? updateUpNextItem(item, episode, nextProgress, mode, today, progressKnown)
      : item;
  // Legacy no-arg keys plus the timezone-scoped key the rails query with —
  // all shapes must be patched for the optimistic update to be visible.
  for (const args of [undefined, {}, getUpNextQueryArgs()]) {
    const current = localStore.getQuery(api.episodeProgress.getUpNext, args);
    if (Array.isArray(current)) {
      localStore.setQuery(api.episodeProgress.getUpNext, args, current.map(patch));
    }

    // The sectioned /continue page reads the same cards bucketed; patch every
    // bucket so a tap there repaints as instantly as on the home rail.
    const surface = localStore.getQuery(api.episodeProgress.getContinue, args) as
      | ContinueSurface
      | undefined;
    if (!surface || typeof surface !== "object" || Array.isArray(surface)) {
      continue;
    }
    let changed = false;
    const nextSurface: ContinueSurface = { ...surface };
    for (const bucket of CONTINUE_SURFACE_BUCKETS) {
      const rows = surface[bucket];
      if (!Array.isArray(rows) || !rows.some((row) => row?.showId === episode.showId)) {
        continue;
      }
      nextSurface[bucket] = rows.map(patch);
      changed = true;
    }
    if (changed) {
      localStore.setQuery(api.episodeProgress.getContinue, args, nextSurface);
    }
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
  updateUpNextCaches(localStore, args, nextProgress, "mark", Array.isArray(current));
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
  updateUpNextCaches(
    localStore,
    args,
    nextProgress,
    isWatched ? "unmark" : "mark",
    Array.isArray(current),
  );
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
      Array.isArray(current),
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
    Array.isArray(current),
  );
}

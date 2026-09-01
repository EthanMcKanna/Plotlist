import { api } from "./plotlist/api";
import type { LocalStore } from "./plotlist/react";
import { getEpisodeProgressState } from "./episodeProgressState";

// One place that knows every cache a watch-status change touches, so the
// show page, the /continue Resume button and any future caller repaint the
// same surfaces: the show's own state, the flat and detailed library lists
// under every filter, both count docs, and the continue-watching cards.

export type OptimisticWatchStatus =
  | "watchlist"
  | "watching"
  | "caught_up"
  | "finished"
  | "paused"
  | "dropped"
  | "completed";

export type WatchStateDoc = {
  _id?: string;
  id?: string;
  userId?: string;
  showId: string;
  status: string;
  updatedAt?: number;
};

type DetailedWatchRow = { state?: WatchStateDoc | null; show?: Record<string, any> | null };

type ContinueCard = Record<string, any> & { showId: string; status?: string };

type ContinueSurface = Record<string, unknown> & {
  resume?: ContinueCard[];
  newEpisodes?: ContinueCard[];
  returning?: ContinueCard[];
  gaps?: ContinueCard[];
  paused?: ContinueCard[];
  dropped?: ContinueCard[];
};

const CONTINUE_BUCKETS = [
  "resume",
  "newEpisodes",
  "returning",
  "gaps",
  "paused",
  "dropped",
] as const;

// Mirrors watchStatusFilterValues in api/_lib/rpc.ts: a status-filtered
// list must agree with what its own refetch is about to return.
export function watchStatusMatchesFilter(
  status: string | null | undefined,
  filter: string | null | undefined,
): boolean {
  if (!status) return false;
  if (!filter) return true;
  if (filter === "completed") {
    return status === "completed" || status === "finished" || status === "caught_up";
  }
  if (filter === "finished") return status === "finished" || status === "completed";
  return status === filter;
}

const COUNT_KEYS: Record<string, { counts: string; me: string }> = {
  watchlist: { counts: "watchlist", me: "countsWatchlist" },
  watching: { counts: "watching", me: "countsWatching" },
  caught_up: { counts: "caughtUp", me: "countsCaughtUp" },
  finished: { counts: "finished", me: "countsFinished" },
  paused: { counts: "paused", me: "countsPaused" },
  dropped: { counts: "dropped", me: "countsDropped" },
  completed: { counts: "completed", me: "countsCompleted" },
};

const DETAILED_LIST_FILTERS: Array<string | undefined> = [
  undefined,
  ...Object.keys(COUNT_KEYS),
];

// Moves one show between per-status tallies. A `null` side means "no state":
// previous null = the show is new to the library, next null = it just left.
export function applyStatusChangeToCounts<T extends Record<string, any>>(
  counts: T,
  previousStatus: string | null | undefined,
  nextStatus: string | null | undefined,
  keyOf: (status: string) => string | undefined,
  totalKey: string,
): T {
  const result: Record<string, any> = { ...counts };
  const bump = (key: string | undefined, delta: number) => {
    if (!key) return;
    const current = typeof result[key] === "number" ? result[key] : 0;
    result[key] = Math.max(0, current + delta);
  };
  if (previousStatus) bump(keyOf(previousStatus), -1);
  if (nextStatus) bump(keyOf(nextStatus), 1);
  if (!previousStatus && nextStatus) bump(totalKey, 1);
  if (!nextStatus) bump(totalKey, -1);
  return result as T;
}

// Flat watch-state rows (watchStates.listForUser), newest first.
export function applyStatusToStateRows(
  rows: WatchStateDoc[],
  state: WatchStateDoc,
  filter: string | null | undefined,
): WatchStateDoc[] {
  const hasRow = rows.some((row) => row?.showId === state.showId);
  const others = rows.filter((row) => row?.showId !== state.showId);
  if (!watchStatusMatchesFilter(state.status, filter)) {
    return hasRow ? others : rows;
  }
  return [state, ...others];
}

// Library grid rows (watchStates.listForUserDetailed): {state, show}. A show
// the cache has never seen needs its doc to render, so it's only inserted
// when one is available.
export function applyStatusToDetailedRows(
  rows: DetailedWatchRow[],
  state: WatchStateDoc,
  show: Record<string, any> | null | undefined,
  filter: string | null | undefined,
): DetailedWatchRow[] {
  const existing = rows.find((row) => row?.state?.showId === state.showId);
  const others = rows.filter((row) => row?.state?.showId !== state.showId);
  if (!watchStatusMatchesFilter(state.status, filter)) {
    return existing ? others : rows;
  }
  const showDoc = existing?.show ?? show ?? null;
  if (!showDoc) return rows;
  const nextState = existing?.state
    ? { ...existing.state, status: state.status, updatedAt: state.updatedAt }
    : state;
  return [{ ...existing, state: nextState, show: showDoc }, ...others];
}

function removeStateRows(rows: WatchStateDoc[], showId: string) {
  return rows.some((row) => row?.showId === showId)
    ? rows.filter((row) => row?.showId !== showId)
    : rows;
}

function removeDetailedRows(rows: DetailedWatchRow[], showId: string) {
  return rows.some((row) => row?.state?.showId === showId)
    ? rows.filter((row) => row?.state?.showId !== showId)
    : rows;
}

// The home rail only carries shows being watched; every other status (or no
// status) takes the card away. A show that just became "watching" gets a
// card when one can be built from what the cache knows about it.
export function applyStatusToUpNextItems(
  items: ContinueCard[],
  showId: string,
  status: string | null,
  buildCard: () => ContinueCard | null,
): ContinueCard[] {
  const existing = items.find((item) => item?.showId === showId);
  if (status !== "watching") {
    return existing ? items.filter((item) => item?.showId !== showId) : items;
  }
  if (existing) {
    return existing.status === status
      ? items
      : items.map((item) => (item === existing ? { ...item, status } : item));
  }
  const card = buildCard();
  return card ? [card, ...items] : items;
}

function continueBucketFor(status: string | null, card: ContinueCard | null) {
  switch (status) {
    case "watching":
      return card?.isCaughtUp || card?.isUpcoming ? "returning" : "resume";
    case "caught_up":
      return "returning";
    case "paused":
      return "paused";
    case "dropped":
      return "dropped";
    default:
      return null;
  }
}

// Gaps only nag on active-tier shows (server: watching/caught_up/finished).
function keepsGapEntry(status: string | null) {
  return status === "watching" || status === "caught_up" || status === "finished";
}

// The sectioned /continue page: pull the card out of whichever bucket held
// it and drop it at the top of the bucket its new status belongs to.
export function applyStatusToContinueSurface(
  surface: ContinueSurface,
  showId: string,
  status: string | null,
  buildCard: () => ContinueCard | null,
): ContinueSurface {
  let existing: ContinueCard | null = null;
  let changed = false;
  const next: ContinueSurface = { ...surface };
  for (const bucket of CONTINUE_BUCKETS) {
    const rows = surface[bucket];
    if (!Array.isArray(rows)) continue;
    const found = rows.find((row) => row?.showId === showId);
    if (!found) continue;
    existing = existing ?? found;
    if (bucket === "gaps" && keepsGapEntry(status)) {
      next[bucket] = rows.map((row) =>
        row === found ? { ...row, status: status ?? row.status } : row,
      );
    } else {
      next[bucket] = rows.filter((row) => row?.showId !== showId);
    }
    changed = true;
  }

  const target = continueBucketFor(status, existing);
  if (target) {
    const card = existing ? { ...existing, status: status ?? existing.status } : buildCard();
    if (card) {
      const rows = Array.isArray(next[target]) ? (next[target] as ContinueCard[]) : [];
      next[target] = [card, ...rows.filter((row) => row?.showId !== showId)];
      changed = true;
    }
  }
  return changed ? next : surface;
}

function readQueries(localStore: LocalStore, query: any): Array<{ data: any; args: any }> {
  const found: Array<{ data: any; args: any }> = [];
  localStore.patchQueriesByName(query, (current, args) => {
    found.push({ data: current, args });
    return undefined;
  });
  return found;
}

// Best guess at the show's status before this change when its own
// getForShow entry isn't cached (e.g. the /continue page), so the tallies
// move the right way.
function findCachedStatus(localStore: LocalStore, showId: string): string | null {
  for (const { data } of readQueries(localStore, api.watchStates.listForUser)) {
    if (!Array.isArray(data)) continue;
    const row = data.find((entry: WatchStateDoc) => entry?.showId === showId);
    if (row?.status) return row.status;
  }
  for (const { data } of readQueries(localStore, api.episodeProgress.getContinue)) {
    if (!data || typeof data !== "object") continue;
    for (const bucket of CONTINUE_BUCKETS) {
      const rows = (data as ContinueSurface)[bucket];
      const card = Array.isArray(rows) ? rows.find((row) => row?.showId === showId) : null;
      if (card?.status) return card.status;
    }
  }
  for (const { data } of readQueries(localStore, api.episodeProgress.getUpNext)) {
    if (Array.isArray(data) && data.some((card) => card?.showId === showId)) {
      return "watching";
    }
  }
  return null;
}

function buildOptimisticContinueCard(
  localStore: LocalStore,
  showId: string,
  status: string,
): ContinueCard | null {
  const show = localStore.getQuery(api.shows.get, { showId });
  if (!show || typeof show !== "object" || typeof show.title !== "string") {
    return null;
  }
  const progress = localStore.getQuery(api.episodeProgress.getProgressForShow, { showId });
  const progressState = getEpisodeProgressState({
    watchedEpisodes: Array.isArray(progress) ? progress : [],
    seasons: undefined,
  });
  const nextEpisode = progressState.nextEpisode ?? { seasonNumber: 1, episodeNumber: 1 };
  return {
    showId,
    show: {
      _id: show._id ?? showId,
      showId,
      externalSource: show.externalSource ?? null,
      externalId: show.externalId ?? null,
      title: show.title,
      posterUrl: show.posterUrl ?? null,
      backdropUrl: show.backdropUrl ?? null,
    },
    status,
    totalWatched: progressState.totalWatched,
    nextSeasonNumber: nextEpisode.seasonNumber,
    nextEpisodeNumber: nextEpisode.episodeNumber,
    nextAirDate: null,
    nextReleaseDate: null,
    nextEpisodeReleasedToday: false,
    nextEpisodeStillUrl: null,
    nextEpisodeName: null,
    nextEpisodeOverview: null,
    nextEpisodeRuntime: null,
    nextEpisodeAirDateTs: null,
    lastWatchedAt: null,
    isUpcoming: false,
    isCaughtUp: false,
    gapCount: 0,
    nextEpisodes: [],
    seasons: [],
    sortTimestamp: Date.now(),
  };
}

function patchContinueCaches(localStore: LocalStore, showId: string, status: string | null) {
  const buildCard = () =>
    status ? buildOptimisticContinueCard(localStore, showId, status) : null;
  localStore.patchQueriesByName(api.episodeProgress.getUpNext, (current) =>
    Array.isArray(current)
      ? applyStatusToUpNextItems(current, showId, status, buildCard)
      : undefined,
  );
  localStore.patchQueriesByName(api.episodeProgress.getContinue, (current) =>
    current && typeof current === "object" && !Array.isArray(current)
      ? applyStatusToContinueSurface(current as ContinueSurface, showId, status, buildCard)
      : undefined,
  );
}

function patchCountCaches(
  localStore: LocalStore,
  previousStatus: string | null,
  nextStatus: string | null,
) {
  localStore.patchQueriesByName(api.watchStates.getCounts, (current) =>
    current && typeof current === "object"
      ? applyStatusChangeToCounts(
          current,
          previousStatus,
          nextStatus,
          (status) => COUNT_KEYS[status]?.counts,
          "total",
        )
      : undefined,
  );
  localStore.patchQueriesByName(api.users.me, (current) =>
    current && typeof current === "object"
      ? applyStatusChangeToCounts(
          current,
          previousStatus,
          nextStatus,
          (status) => COUNT_KEYS[status]?.me,
          "countsTotalShows",
        )
      : undefined,
  );
}

// setPaginatedQuery matches on the args given, so one pass per filter value
// (plus the unfiltered "all" list, matched by status === undefined) reaches
// every library page whatever else — sortBy, page size — its args carry.
function patchDetailedLists(
  localStore: LocalStore,
  update: (rows: DetailedWatchRow[], filter: string | undefined) => DetailedWatchRow[],
) {
  for (const filter of DETAILED_LIST_FILTERS) {
    localStore.setPaginatedQuery(
      api.watchStates.listForUserDetailed,
      { status: filter },
      (current) => {
        if (!current) return current;
        const page = (current.page ?? current.results ?? []) as DetailedWatchRow[];
        const next = update(page, filter);
        if (next === page) return current;
        return { ...current, page: next, results: next };
      },
    );
  }
}

export function optimisticSetWatchStatus(
  localStore: LocalStore,
  args: { showId: string; status: OptimisticWatchStatus },
  options: { userId?: string | null } = {},
) {
  const { showId } = args;
  const previousState = localStore.getQuery(api.watchStates.getForShow, { showId }) as
    | WatchStateDoc
    | null
    | undefined;
  const previousStatus = previousState?.status ?? findCachedStatus(localStore, showId);
  const nextState: WatchStateDoc = {
    _id: previousState?._id ?? `optimistic:watch-state:${showId}`,
    userId: previousState?.userId ?? options.userId ?? "me",
    showId,
    status: args.status,
    updatedAt: Date.now(),
  };
  const show = localStore.getQuery(api.shows.get, { showId }) as Record<string, any> | undefined;

  localStore.setQuery(api.watchStates.getForShow, { showId }, nextState);
  localStore.patchQueriesByName(api.watchStates.listForUser, (current, queryArgs) =>
    Array.isArray(current)
      ? applyStatusToStateRows(current, nextState, queryArgs?.status)
      : undefined,
  );
  patchDetailedLists(localStore, (rows, filter) =>
    applyStatusToDetailedRows(rows, nextState, show, filter),
  );
  patchCountCaches(localStore, previousStatus, args.status);
  patchContinueCaches(localStore, showId, args.status);
}

export function optimisticRemoveWatchStatus(
  localStore: LocalStore,
  args: { showId: string },
) {
  const { showId } = args;
  const previousState = localStore.getQuery(api.watchStates.getForShow, { showId }) as
    | WatchStateDoc
    | null
    | undefined;
  const previousStatus = previousState?.status ?? findCachedStatus(localStore, showId);

  localStore.setQuery(api.watchStates.getForShow, { showId }, null);
  localStore.patchQueriesByName(api.watchStates.listForUser, (current) =>
    Array.isArray(current) ? removeStateRows(current, showId) : undefined,
  );
  patchDetailedLists(localStore, (rows) => removeDetailedRows(rows, showId));
  patchCountCaches(localStore, previousStatus, null);
  patchContinueCaches(localStore, showId, null);
}

import type { DiaryItem, DiaryLogItem } from "./logDiary";
import { parseWatchedOnParts, type WatchLogDatePrecision } from "./watchLogDates";

// Pure cache patches for the log/rewatch sheet and the diary, so a saved
// viewing shows up the instant Save is tapped instead of after the
// watchLogs invalidation round-trip. Rows carry `optimistic:` ids per the
// client convention (non-navigable, non-editable until the server row
// replaces them on refetch).

export const OPTIMISTIC_ID_PREFIX = "optimistic:";

export function isOptimisticId(id: unknown): boolean {
  return typeof id === "string" && id.startsWith(OPTIMISTIC_ID_PREFIX);
}

export type OptimisticWatchLogInput = {
  showId: string;
  userId?: string | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  episodeTitle?: string | null;
  note?: string | null;
  rating?: number | null;
  reaction?: string | null;
  isRewatch?: boolean;
  datePrecision?: WatchLogDatePrecision;
  watchedOn?: string | null;
};

export type OptimisticWatchLog = {
  _id: string;
  _creationTime: number;
  id: string;
  userId: string | null;
  showId: string;
  watchedAt: number;
  note: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeTitle: string | null;
  datePrecision: WatchLogDatePrecision;
  watchedOn: string | null;
  createdAt: number;
  rating: number | null;
  reaction: string | null;
  isRewatch: boolean;
};

// Mirrors the server's date resolution closely enough for the diary: exact
// and unknown anchor to "now", backdated periods anchor to local noon at the
// start of the period (the diary re-derives its local timestamp from
// watchedOn anyway, so only the sort position needs to be right).
export function resolveOptimisticWatchedAt(
  input: Pick<OptimisticWatchLogInput, "datePrecision" | "watchedOn">,
  now: number,
): { watchedAt: number; datePrecision: WatchLogDatePrecision; watchedOn: string | null } {
  const precision = input.datePrecision ?? "exact";
  if (precision === "exact" || precision === "unknown") {
    return { watchedAt: now, datePrecision: precision, watchedOn: null };
  }
  const parts = parseWatchedOnParts(input.watchedOn);
  if (!parts) {
    return { watchedAt: now, datePrecision: "exact", watchedOn: null };
  }
  const watchedAt = new Date(
    parts.year,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    12,
    0,
    0,
    0,
  ).getTime();
  return { watchedAt, datePrecision: precision, watchedOn: input.watchedOn ?? null };
}

export function buildOptimisticWatchLog(
  input: OptimisticWatchLogInput,
  now: number,
): OptimisticWatchLog {
  const resolved = resolveOptimisticWatchedAt(input, now);
  const id = `${OPTIMISTIC_ID_PREFIX}log:${now}`;
  return {
    _id: id,
    _creationTime: now,
    id,
    userId: input.userId ?? null,
    showId: input.showId,
    watchedAt: resolved.watchedAt,
    note: input.note?.trim() || null,
    seasonNumber: input.seasonNumber ?? null,
    episodeNumber: input.episodeNumber ?? null,
    episodeTitle: input.episodeTitle ?? null,
    datePrecision: resolved.datePrecision,
    watchedOn: resolved.watchedOn,
    createdAt: now,
    rating: input.rating ?? null,
    reaction: input.reaction?.trim() || null,
    isRewatch: Boolean(input.isRewatch),
  };
}

export type DiaryActivity = { items: DiaryItem[]; hasMore?: boolean } & Record<string, any>;

function sortNewestFirst(items: DiaryItem[]): DiaryItem[] {
  return [...items].sort((left, right) => right.timestamp - left.timestamp);
}

// Diary payload (watchLogs:listActivityForUser) with a new log slotted in by
// its viewing time, newest first like the server orders it.
export function insertDiaryLog(
  activity: DiaryActivity | undefined,
  log: OptimisticWatchLog,
  show: DiaryLogItem["show"],
): DiaryActivity | undefined {
  if (!activity || !Array.isArray(activity.items)) {
    return activity;
  }
  const item: DiaryLogItem = {
    id: log._id as DiaryLogItem["id"],
    type: "log",
    timestamp: log.watchedAt,
    show,
    log: log as unknown as DiaryLogItem["log"],
  };
  return { ...activity, items: sortNewestFirst([item, ...activity.items]) };
}

export function removeDiaryItem(
  activity: DiaryActivity | undefined,
  itemId: string,
): DiaryActivity | undefined {
  if (!activity || !Array.isArray(activity.items)) {
    return activity;
  }
  return { ...activity, items: activity.items.filter((item) => item.id !== itemId) };
}

export type WatchLogPatch = Partial<
  Pick<
    OptimisticWatchLog,
    "note" | "rating" | "reaction" | "isRewatch" | "watchedAt" | "watchedOn" | "datePrecision"
  >
>;

// Edited fields applied in place; a date change re-sorts the entry.
export function patchDiaryLog(
  activity: DiaryActivity | undefined,
  logId: string,
  patch: WatchLogPatch,
): DiaryActivity | undefined {
  if (!activity || !Array.isArray(activity.items)) {
    return activity;
  }
  let touched = false;
  const items = activity.items.map((item) => {
    if (item.type !== "log" || item.id !== logId) {
      return item;
    }
    touched = true;
    return {
      ...item,
      timestamp: patch.watchedAt ?? item.timestamp,
      log: { ...item.log, ...patch },
    };
  });
  if (!touched) {
    return activity;
  }
  return { ...activity, items: patch.watchedAt != null ? sortNewestFirst(items) : items };
}

type ShowLogRow = { _id?: string; id?: string; watchedAt: number } & Record<string, any>;

// Per-show log list (watchLogs:listForShow), newest viewing first.
export function insertShowLog<Row extends ShowLogRow>(
  rows: Row[] | undefined,
  log: OptimisticWatchLog,
): Row[] | undefined {
  if (!Array.isArray(rows)) {
    return rows;
  }
  return [...rows, log as unknown as Row].sort((left, right) => right.watchedAt - left.watchedAt);
}

export function patchShowLog<Row extends ShowLogRow>(
  rows: Row[] | undefined,
  logId: string,
  patch: WatchLogPatch,
): Row[] | undefined {
  if (!Array.isArray(rows)) {
    return rows;
  }
  let touched = false;
  const next = rows.map((row) => {
    if ((row._id ?? row.id) !== logId) {
      return row;
    }
    touched = true;
    return { ...row, ...patch };
  });
  if (!touched) {
    return rows;
  }
  return patch.watchedAt != null
    ? next.sort((left, right) => right.watchedAt - left.watchedAt)
    : next;
}

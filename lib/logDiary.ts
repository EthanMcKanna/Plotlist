import { format } from "date-fns";

import type { Doc, Id } from "./plotlist/types";

// The log tab is a diary: strictly reverse-chronological, grouped into
// month + day sections, with same-day binge runs collapsed into one row.
// Everything here is pure so the screen stays a thin render layer.

export type DiaryFilter = "all" | "episodes" | "reviews" | "notes";

export type DiaryLogItem = {
  id: Id<"watchLogs">;
  type: "log";
  timestamp: number;
  show: Doc<"shows"> | null;
  log: Doc<"watchLogs">;
};

export type DiaryReviewItem = {
  id: Id<"reviews">;
  type: "review";
  timestamp: number;
  show: Doc<"shows"> | null;
  review: Doc<"reviews">;
};

export type DiaryItem = DiaryLogItem | DiaryReviewItem;

export type DiaryDayLabel = {
  day: string;
  weekday: string;
  isToday: boolean;
};

export type DiaryMonthRow = {
  kind: "month";
  id: string;
  label: string;
  entryCount: number;
};

export type DiaryEntryRow = {
  kind: "entry";
  id: string;
  item: DiaryItem;
  dayLabel: DiaryDayLabel | null;
  isLastOfDay: boolean;
};

export type DiaryBingeRow = {
  kind: "binge";
  id: string;
  title: string;
  timestamp: number;
  show: Doc<"shows"> | null;
  logs: DiaryLogItem[];
  episodeRange: string | null;
  dayLabel: DiaryDayLabel | null;
  isLastOfDay: boolean;
};

export type DiaryRow = DiaryMonthRow | DiaryEntryRow | DiaryBingeRow;

export type DiaryDayActivity = {
  key: string;
  count: number;
  isToday: boolean;
};

export type DiaryPulse = {
  totalItems: number;
  uniqueShows: number;
  weekItems: number;
  weekEpisodes: number;
  weekReviews: number;
  streakDays: number;
  days: DiaryDayActivity[];
};

const DAY_MS = 86_400_000;

export function getDiaryItemTitle(item: DiaryItem) {
  return item.show?.title ?? "Unknown show";
}

export function getDiaryShowKey(item: DiaryItem) {
  return (
    item.show?._id ??
    item.show?.id ??
    (item.type === "log" ? item.log.showId : item.review.showId) ??
    getDiaryItemTitle(item)
  );
}

export function getDiaryItemText(item: DiaryItem) {
  const value = item.type === "log" ? item.log.note : item.review.reviewText;
  return typeof value === "string" ? value.trim() : "";
}

export function getDiaryItemRating(item: DiaryItem) {
  return item.type === "review" && typeof item.review.rating === "number"
    ? item.review.rating
    : null;
}

function episodeCode(seasonNumber?: number | null, episodeNumber?: number | null) {
  if (typeof seasonNumber !== "number" || typeof episodeNumber !== "number") {
    return null;
  }
  return `S${String(seasonNumber).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")}`;
}

export function getDiaryEpisodeLabel(item: DiaryItem) {
  const source = item.type === "log" ? item.log : item.review;
  const code = episodeCode(source.seasonNumber, source.episodeNumber);
  if (!code) return null;
  return source.episodeTitle ? `${code} · ${source.episodeTitle}` : code;
}

export function formatEpisodeRange(logs: DiaryLogItem[]) {
  const coded = logs
    .map((item) => ({
      season: item.log.seasonNumber as number | null | undefined,
      episode: item.log.episodeNumber as number | null | undefined,
    }))
    .filter(
      (entry): entry is { season: number; episode: number } =>
        typeof entry.season === "number" && typeof entry.episode === "number",
    )
    .sort((left, right) => left.season - right.season || left.episode - right.episode);

  if (coded.length === 0) return null;

  const first = coded[0]!;
  const last = coded[coded.length - 1]!;
  const firstCode = episodeCode(first.season, first.episode)!;
  if (coded.length === 1 || (first.season === last.season && first.episode === last.episode)) {
    return firstCode;
  }
  if (first.season === last.season) {
    return `${firstCode}–E${String(last.episode).padStart(2, "0")}`;
  }
  return `${firstCode}–${episodeCode(last.season, last.episode)}`;
}

export function startOfLocalDay(value: number) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function isPlainEpisodeLog(item: DiaryItem): item is DiaryLogItem {
  return item.type === "log" && !getDiaryItemText(item);
}

export function diaryItemMatchesFilter(item: DiaryItem, filter: DiaryFilter) {
  if (filter === "all") return true;
  if (filter === "episodes") return item.type === "log";
  if (filter === "reviews") return item.type === "review";
  return getDiaryItemText(item).length > 0;
}

type FeedUnit =
  | { kind: "entry"; item: DiaryItem; timestamp: number }
  | {
      kind: "binge";
      logs: DiaryLogItem[];
      timestamp: number;
      show: Doc<"shows"> | null;
      title: string;
      episodeRange: string | null;
    };

function makeBinge(run: DiaryLogItem[]): FeedUnit {
  const latest = run[0]!;
  return {
    kind: "binge",
    logs: run,
    timestamp: latest.timestamp,
    show: latest.show,
    title: getDiaryItemTitle(latest),
    episodeRange: formatEpisodeRange(run),
  };
}

function buildFeedUnits(items: DiaryItem[]) {
  const units: FeedUnit[] = [];
  let run: DiaryLogItem[] = [];

  const flushRun = () => {
    if (run.length === 0) return;
    if (run.length === 1) {
      units.push({ kind: "entry", item: run[0]!, timestamp: run[0]!.timestamp });
    } else {
      units.push(makeBinge(run));
    }
    run = [];
  };

  for (const item of items) {
    if (isPlainEpisodeLog(item)) {
      const previous = run[run.length - 1];
      const continuesRun =
        !previous ||
        (getDiaryShowKey(previous) === getDiaryShowKey(item) &&
          startOfLocalDay(previous.timestamp) === startOfLocalDay(item.timestamp));
      if (continuesRun) {
        run.push(item);
        continue;
      }
      flushRun();
      run.push(item);
      continue;
    }

    flushRun();
    units.push({ kind: "entry", item, timestamp: item.timestamp });
  }

  flushRun();
  return units;
}

function unitItemCount(unit: FeedUnit) {
  return unit.kind === "binge" ? unit.logs.length : 1;
}

function monthKeyOf(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function makeDayLabel(timestamp: number, now: number): DiaryDayLabel {
  const date = new Date(timestamp);
  return {
    day: format(date, "d"),
    weekday: format(date, "EEE").toUpperCase(),
    isToday: startOfLocalDay(timestamp) === startOfLocalDay(now),
  };
}

export function buildDiaryFeed({
  items,
  filter,
  now = Date.now(),
}: {
  items: DiaryItem[];
  filter: DiaryFilter;
  now?: number;
}): DiaryRow[] {
  const sorted = [...items]
    .sort((left, right) => right.timestamp - left.timestamp)
    .filter((item) => diaryItemMatchesFilter(item, filter));
  const units = buildFeedUnits(sorted);

  const monthCounts = new Map<string, number>();
  for (const unit of units) {
    const key = monthKeyOf(unit.timestamp);
    monthCounts.set(key, (monthCounts.get(key) ?? 0) + unitItemCount(unit));
  }

  const rows: DiaryRow[] = [];
  let currentMonthKey = "";
  let currentDayKey = 0;

  units.forEach((unit, index) => {
    const monthKey = monthKeyOf(unit.timestamp);
    if (monthKey !== currentMonthKey) {
      currentMonthKey = monthKey;
      currentDayKey = 0;
      rows.push({
        kind: "month",
        id: `month:${monthKey}`,
        label: format(new Date(unit.timestamp), "MMMM yyyy"),
        entryCount: monthCounts.get(monthKey) ?? 0,
      });
    }

    const dayKey = startOfLocalDay(unit.timestamp);
    const dayLabel = dayKey !== currentDayKey ? makeDayLabel(unit.timestamp, now) : null;
    currentDayKey = dayKey;

    const next = units[index + 1];
    const isLastOfDay = !next || startOfLocalDay(next.timestamp) !== dayKey;

    if (unit.kind === "entry") {
      rows.push({
        kind: "entry",
        id: unit.item.id,
        item: unit.item,
        dayLabel,
        isLastOfDay,
      });
    } else {
      rows.push({
        kind: "binge",
        id: `binge:${getDiaryShowKey(unit.logs[0]!)}:${dayKey}:${unit.logs[0]!.id}`,
        title: unit.title,
        timestamp: unit.timestamp,
        show: unit.show,
        logs: unit.logs,
        episodeRange: unit.episodeRange,
        dayLabel,
        isLastOfDay,
      });
    }
  });

  return rows;
}

export function computeDiaryPulse(items: DiaryItem[], now = Date.now()): DiaryPulse {
  const todayStart = startOfLocalDay(now);
  const weekStart = todayStart - DAY_MS * 6;

  const dayCounts = new Map<number, number>();
  for (const item of items) {
    const key = startOfLocalDay(item.timestamp);
    dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
  }

  const days: DiaryDayActivity[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(todayStart);
    date.setDate(date.getDate() - offset);
    const key = date.getTime();
    days.push({
      key: String(key),
      count: dayCounts.get(key) ?? 0,
      isToday: offset === 0,
    });
  }

  let streakDays = 0;
  const cursor = new Date(todayStart);
  // A streak survives until a full day is missed; today only counts once
  // something is logged, so start from yesterday when today is still empty.
  if (!dayCounts.has(cursor.getTime())) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (dayCounts.has(cursor.getTime())) {
    streakDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const weekItems = items.filter((item) => item.timestamp >= weekStart);

  return {
    totalItems: items.length,
    uniqueShows: new Set(items.map(getDiaryShowKey)).size,
    weekItems: weekItems.length,
    weekEpisodes: weekItems.filter((item) => item.type === "log").length,
    weekReviews: weekItems.filter((item) => item.type === "review").length,
    streakDays,
    days,
  };
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count.toLocaleString("en-US")} ${count === 1 ? singular : pluralForm}`;
}

export function getDiaryHeadline(pulse: DiaryPulse) {
  if (pulse.totalItems === 0) {
    return "Everything you watch, remembered in order.";
  }
  if (pulse.weekItems === 0) {
    return `Quiet week so far · ${plural(pulse.totalItems, "entry", "entries")} across ${plural(pulse.uniqueShows, "show")}`;
  }
  const week = `${plural(pulse.weekItems, "entry", "entries")} this week`;
  if (pulse.streakDays >= 2) {
    return `${week} · ${pulse.streakDays}-day streak`;
  }
  return `${week} · ${plural(pulse.uniqueShows, "show")} in your diary`;
}

export function getDiaryEmptyCopy(filter: DiaryFilter) {
  if (filter === "episodes") {
    return {
      title: "No episodes logged",
      description: "Mark episodes watched from any show page and they land here in order.",
    };
  }
  if (filter === "reviews") {
    return {
      title: "No reviews yet",
      description: "Rate or review a show and it becomes part of your diary.",
    };
  }
  if (filter === "notes") {
    return {
      title: "No notes yet",
      description: "Add a note when you log an episode, or write a review — anything with your words shows up here.",
    };
  }
  return {
    title: "Nothing here yet",
    description: "Your watch activity will fill this diary.",
  };
}

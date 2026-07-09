import { format } from "date-fns";

import {
  parseDateOnlyParts,
  type ReleaseCalendarGroup,
} from "./releaseCalendar";

/**
 * Row model for the Releases page. Mirrors the Log diary's structure — a
 * month header per month boundary, then event rows with a date spine down
 * the left edge (day number on the first row of each day only).
 */

export type ReleaseDiaryDayLabel = {
  day: string;
  weekday: string;
  isToday: boolean;
};

export type ReleaseDiaryEventRow = {
  kind: "event";
  id: string;
  item: any;
  airDate: string;
  dayLabel: ReleaseDiaryDayLabel | null;
  isLastOfDay: boolean;
  isToday: boolean;
};

export type ReleaseDiaryMonthRow = {
  kind: "month";
  id: string;
  label: string;
  entryCount: number;
};

export type ReleaseDiaryRow = ReleaseDiaryEventRow | ReleaseDiaryMonthRow;

function toNoonDate(airDate: string) {
  const parts = parseDateOnlyParts(airDate);
  if (!parts) return null;
  // Local noon avoids day drift when formatting in any timezone.
  return new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0);
}

export function getReleaseDiaryDayLabel(
  airDate: string,
  today: string,
): ReleaseDiaryDayLabel | null {
  const date = toNoonDate(airDate);
  if (!date) return null;
  return {
    day: format(date, "d"),
    weekday: format(date, "EEE").toUpperCase(),
    isToday: airDate === today,
  };
}

function getMonthKey(airDate: string) {
  return airDate.slice(0, 7);
}

function getMonthLabel(airDate: string) {
  const date = toNoonDate(airDate);
  return date ? format(date, "MMMM") : airDate;
}

export function buildReleaseDiaryRows(
  groups: Array<Pick<ReleaseCalendarGroup, "airDate"> & { items?: any[] }>,
  today: string,
): ReleaseDiaryRow[] {
  const rows: ReleaseDiaryRow[] = [];
  const monthCounts = new Map<string, number>();
  for (const group of groups) {
    const key = getMonthKey(group.airDate);
    monthCounts.set(key, (monthCounts.get(key) ?? 0) + (group.items?.length ?? 0));
  }

  // The current month reads from the page title's context; a header would
  // just push tonight's releases down. Later months get labelled.
  const firstMonthKey = getMonthKey(today);
  let lastMonthKey: string | null = null;

  for (const group of groups) {
    const items = group.items ?? [];
    if (items.length === 0) continue;
    const monthKey = getMonthKey(group.airDate);
    if (monthKey !== firstMonthKey && monthKey !== lastMonthKey) {
      rows.push({
        kind: "month",
        id: `month-${monthKey}`,
        label: getMonthLabel(group.airDate),
        entryCount: monthCounts.get(monthKey) ?? items.length,
      });
    }
    lastMonthKey = monthKey;

    const dayLabel = getReleaseDiaryDayLabel(group.airDate, today);
    items.forEach((item: any, index: number) => {
      rows.push({
        kind: "event",
        id: `${group.airDate}-${item?.show?._id ?? "show"}-${item?.seasonNumber ?? 0}-${item?.episodeNumber ?? 0}`,
        item,
        airDate: group.airDate,
        dayLabel: index === 0 ? dayLabel : null,
        isLastOfDay: index === items.length - 1,
        isToday: group.airDate === today,
      });
    });
  }

  return rows;
}

export type ReleaseDiaryCounts = {
  tonightCount: number;
  weekCount: number;
  laterCount: number;
  total: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function getReleaseDiaryCounts(
  groups: Array<Pick<ReleaseCalendarGroup, "airDate"> & { items?: any[] }>,
  today: string,
): ReleaseDiaryCounts {
  const todayTs = Date.parse(`${today}T00:00:00Z`);
  const weekEndTs = todayTs + 7 * DAY_MS;
  let tonightCount = 0;
  let weekCount = 0;
  let laterCount = 0;

  for (const group of groups) {
    const count = group.items?.length ?? 0;
    if (count === 0) continue;
    const dayTs = Date.parse(`${group.airDate}T00:00:00Z`);
    if (!Number.isFinite(dayTs) || dayTs < todayTs) continue;
    if (group.airDate === today) {
      tonightCount += count;
    } else if (dayTs <= weekEndTs) {
      weekCount += count;
    } else {
      laterCount += count;
    }
  }

  return {
    tonightCount,
    weekCount,
    laterCount,
    total: tonightCount + weekCount + laterCount,
  };
}

export function getReleaseDiaryHeadline(counts: ReleaseDiaryCounts) {
  if (counts.total === 0) {
    return "New episodes from your shows land here.";
  }
  const parts = [
    counts.tonightCount > 0 ? `${counts.tonightCount} tonight` : null,
    counts.weekCount > 0
      ? `${counts.weekCount}${counts.tonightCount > 0 ? " more" : ""} this week`
      : null,
    counts.laterCount > 0 ? `${counts.laterCount} later` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export type ReleaseDiaryDayActivity = {
  key: string;
  count: number;
  isToday: boolean;
};

/** Forward-looking 7-day pulse for the header (today through +6 days). */
export function getReleaseDiaryWeekActivity(
  groups: Array<Pick<ReleaseCalendarGroup, "airDate"> & { items?: any[] }>,
  today: string,
): ReleaseDiaryDayActivity[] {
  const countsByDate = new Map<string, number>();
  for (const group of groups) {
    countsByDate.set(group.airDate, group.items?.length ?? 0);
  }
  const todayTs = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, index) => {
    const key = Number.isFinite(todayTs)
      ? new Date(todayTs + index * DAY_MS).toISOString().slice(0, 10)
      : `${today}+${index}`;
    return {
      key,
      count: countsByDate.get(key) ?? 0,
      isToday: index === 0,
    };
  });
}

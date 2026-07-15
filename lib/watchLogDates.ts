import { format } from "date-fns";

// Client-side mirror of the server's watch-log date model. A viewing's date
// is the triple (watchedAt, watchedOn, datePrecision):
//   exact   — watchedAt is a real timestamp
//   day     — watchedOn "2024-03-15"; watchedAt is a derived sort key
//   month   — watchedOn "2024-03"
//   year    — watchedOn "2024"
//   unknown — the user couldn't place it; watchedAt is when it was logged
export type WatchLogDatePrecision = "exact" | "day" | "month" | "year" | "unknown";

export type WatchLogDateFields = {
  watchedAt: number;
  watchedOn?: string | null;
  datePrecision?: WatchLogDatePrecision | string | null;
};

export type WatchedOnParts = {
  year: number;
  month: number | null;
  day: number | null;
};

export function getLogDatePrecision(log: WatchLogDateFields): WatchLogDatePrecision {
  const value = log.datePrecision;
  if (value === "day" || value === "month" || value === "year" || value === "unknown") {
    return value;
  }
  return "exact";
}

export function parseWatchedOnParts(
  watchedOn: string | null | undefined,
): WatchedOnParts | null {
  if (!watchedOn) return null;
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(watchedOn.trim());
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: match[2] ? Number(match[2]) : null,
    day: match[3] ? Number(match[3]) : null,
  };
}

export function watchedOnFromParts(parts: WatchedOnParts) {
  const pad = (value: number) => String(value).padStart(2, "0");
  if (parts.month == null) return String(parts.year);
  if (parts.day == null) return `${parts.year}-${pad(parts.month)}`;
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function precisionForParts(parts: WatchedOnParts): WatchLogDatePrecision {
  if (parts.day != null) return "day";
  if (parts.month != null) return "month";
  return "year";
}

// Local-time anchor for diary grouping. Non-exact viewings anchor to local
// noon at the start of their calendar period so the diary's day rail and
// month sections always show the calendar date the user picked, in every
// timezone (the server's watchedAt is UTC noon, which drifts a day at
// extreme offsets).
export function getLogDiaryTimestamp(log: WatchLogDateFields): number {
  const precision = getLogDatePrecision(log);
  if (precision === "exact" || precision === "unknown") {
    return log.watchedAt;
  }
  const parts = parseWatchedOnParts(log.watchedOn);
  if (!parts) return log.watchedAt;
  return new Date(parts.year, (parts.month ?? 1) - 1, parts.day ?? 1, 12, 0, 0, 0).getTime();
}

// Human label for a viewing's date at its own precision:
// exact → "Mar 15, 2024", day → "Mar 15, 2024", month → "March 2024",
// year → "2024", unknown → "Date unknown".
export function formatWatchedDateLabel(log: WatchLogDateFields): string {
  const precision = getLogDatePrecision(log);
  if (precision === "unknown") return "Date unknown";
  if (precision === "exact") return format(new Date(log.watchedAt), "MMM d, yyyy");
  const parts = parseWatchedOnParts(log.watchedOn);
  if (!parts) return format(new Date(log.watchedAt), "MMM d, yyyy");
  const anchor = new Date(parts.year, (parts.month ?? 1) - 1, parts.day ?? 1, 12);
  if (precision === "year") return String(parts.year);
  if (precision === "month") return format(anchor, "MMMM yyyy");
  return format(anchor, "MMM d, yyyy");
}

export function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

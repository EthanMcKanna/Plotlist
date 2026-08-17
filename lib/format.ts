import { format, formatDistanceToNowStrict, isSameMonth, startOfMonth } from "date-fns";

export function formatDate(value: number) {
  return format(new Date(value), "MMM d, yyyy");
}

export function formatTime(value: number) {
  return format(new Date(value), "h:mm a");
}

export function formatMonth(value: number) {
  return format(new Date(value), "MMMM yyyy");
}

export function formatShortDate(value: number) {
  return format(new Date(value), "MMM d");
}

function parseDateOnlyString(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
}

export function formatCalendarDay(value: number | string) {
  const date =
    typeof value === "string"
      ? parseDateOnlyString(value) ?? new Date(value)
      : new Date(value);
  return format(date, "EEEE, MMM d");
}

// Day-granular label for recent activity rows: "Today", "Yesterday", the
// weekday name inside the last week, then "Aug 12".
export function formatRelativeDay(value: number, now: number = Date.now()) {
  const startOfDay = (timestamp: number) => {
    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  };
  const today = startOfDay(now);
  const day = startOfDay(value);
  if (day >= today) return "Today";
  if (day >= today - 86_400_000) return "Yesterday";
  if (day >= today - 6 * 86_400_000) return format(new Date(value), "EEEE");
  return formatShortDate(value);
}

export function formatEpisodeCode(seasonNumber: number, episodeNumber: number) {
  return `S${String(seasonNumber).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")}`;
}

export function formatRelativeTime(value: number) {
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
}

// Instagram-style compact age for dense rows: "now", "5m", "3h", "2d", "3w", "1y".
export function formatCompactRelativeTime(value: number, now: number = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - value) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 365)}y`;
}

export function formatWatchTimeLabel(totalMinutes: number) {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) {
    return { value: `${days}d ${hours % 24}h`, detail: `${hours.toLocaleString()} hours total` };
  }
  if (hours > 0) {
    return {
      value: `${hours}h ${minutes % 60}m`,
      detail: `${minutes.toLocaleString()} minutes total`,
    };
  }
  return { value: `${minutes}m`, detail: "Just getting started" };
}

export function isCurrentMonth(value: number) {
  return isSameMonth(new Date(value), new Date());
}

export function getMonthStart(value: number) {
  return startOfMonth(new Date(value)).getTime();
}

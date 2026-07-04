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

export function formatEpisodeCode(seasonNumber: number, episodeNumber: number) {
  return `S${String(seasonNumber).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")}`;
}

export function formatRelativeTime(value: number) {
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
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

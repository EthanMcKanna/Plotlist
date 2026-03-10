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

export function formatRelativeTime(value: number) {
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
}

export function isCurrentMonth(value: number) {
  return isSameMonth(new Date(value), new Date());
}

export function getMonthStart(value: number) {
  return startOfMonth(new Date(value)).getTime();
}

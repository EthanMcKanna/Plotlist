import type { Doc, Id } from "./plotlist/types";

export type LogFilterValue = "highlights" | "journal" | "reviews" | "all";
export type LogSortValue = "recent" | "oldest" | "title" | "rating";

export type LogActivityItem =
  | {
      id: Id<"watchLogs">;
      type: "log";
      timestamp: number;
      show: Doc<"shows"> | null;
      log: Doc<"watchLogs">;
    }
  | {
      id: Id<"reviews">;
      type: "review";
      timestamp: number;
      show: Doc<"shows"> | null;
      review: Doc<"reviews">;
    };

export type LogItemRow = {
  kind: "item";
  id: string;
  item: LogActivityItem;
};

export type LogClusterRow = {
  kind: "cluster";
  id: string;
  title: string;
  timestamp: number;
  show: Doc<"shows"> | null;
  logs: Extract<LogActivityItem, { type: "log" }>[];
  subtitle: string;
};

export type LogTimelineRow = LogItemRow | LogClusterRow;

export type LogTimelineSection = {
  id: string;
  label: string;
  detail: string;
  rows: LogTimelineRow[];
};

export type LogSummary = {
  totalItems: number;
  totalEntries: number;
  totalReviews: number;
  totalNotes: number;
  weekEntries: number;
  weekReviews: number;
  weekNotes: number;
  uniqueShows: number;
  averageRating: number | null;
  latestMeaningfulItem: LogActivityItem | null;
};

const DAY_MS = 86_400_000;

export function getShowTitle(item: LogActivityItem) {
  return item.show?.title ?? "Unknown show";
}

export function getShowKey(item: LogActivityItem) {
  return (
    item.show?._id ??
    item.show?.id ??
    (item.type === "log" ? item.log.showId : item.review.showId) ??
    getShowTitle(item)
  );
}

export function buildEpisodeLabel(
  seasonNumber?: number | null,
  episodeNumber?: number | null,
  episodeTitle?: string | null,
) {
  if (typeof seasonNumber !== "number" || typeof episodeNumber !== "number") {
    return null;
  }

  const code = `S${String(seasonNumber).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")}`;
  return episodeTitle ? `${code} - ${episodeTitle}` : code;
}

function buildEpisodeCode(
  seasonNumber?: number | null,
  episodeNumber?: number | null,
) {
  if (typeof seasonNumber !== "number" || typeof episodeNumber !== "number") {
    return null;
  }

  return `S${String(seasonNumber).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")}`;
}

export function getItemSubtitle(item: LogActivityItem) {
  if (item.type === "log") {
    return buildEpisodeLabel(
      item.log.seasonNumber,
      item.log.episodeNumber,
      item.log.episodeTitle,
    );
  }

  return buildEpisodeLabel(
    item.review.seasonNumber,
    item.review.episodeNumber,
    item.review.episodeTitle,
  );
}

export function getItemText(item: LogActivityItem) {
  const value = item.type === "log" ? item.log.note : item.review.reviewText;
  return typeof value === "string" ? value.trim() : "";
}

export function hasEpisodeMetadata(item: LogActivityItem) {
  if (item.type === "log") {
    return (
      typeof item.log.seasonNumber === "number" &&
      typeof item.log.episodeNumber === "number"
    );
  }

  return (
    typeof item.review.seasonNumber === "number" &&
    typeof item.review.episodeNumber === "number"
  );
}

export function getItemRating(item: LogActivityItem) {
  return item.type === "review" && typeof item.review.rating === "number"
    ? item.review.rating
    : null;
}

export function getItemSignal(item: LogActivityItem) {
  if (item.type === "review") {
    return getItemText(item) ? "Written review" : "Rating";
  }
  if (getItemText(item)) {
    return "Note";
  }
  return hasEpisodeMetadata(item) ? "Watched episode" : "Watch entry";
}

export function isMeaningfulItem(item: LogActivityItem) {
  if (getItemText(item)) return true;
  const rating = getItemRating(item);
  return rating !== null && rating >= 4;
}

export function compareLogItems(
  left: LogActivityItem,
  right: LogActivityItem,
  sort: LogSortValue,
) {
  if (sort === "oldest") {
    return left.timestamp - right.timestamp;
  }

  if (sort === "title") {
    return (
      getShowTitle(left).localeCompare(getShowTitle(right)) ||
      right.timestamp - left.timestamp
    );
  }

  if (sort === "rating") {
    const leftRating = getItemRating(left) ?? -1;
    const rightRating = getItemRating(right) ?? -1;
    return rightRating - leftRating || right.timestamp - left.timestamp;
  }

  return right.timestamp - left.timestamp;
}

export function getStartOfLocalDay(value: number) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function getDayKey(value: number) {
  return String(getStartOfLocalDay(value));
}

export function getTimelineGroup(
  item: LogActivityItem,
  sort: LogSortValue,
  now = Date.now(),
) {
  if (sort === "title") {
    const initial = getShowTitle(item).trim().charAt(0).toUpperCase();
    const label = /[A-Z0-9]/.test(initial) ? initial : "#";
    return { key: `title:${label}`, label, detail: "Title group" };
  }

  if (sort === "rating") {
    const rating = getItemRating(item);
    if (rating === null) {
      return { key: "rating:entries", label: "Watch entries", detail: "No rating" };
    }
    const rounded = Math.round(rating);
    return {
      key: `rating:${rounded}`,
      label: `${rounded} star${rounded === 1 ? "" : "s"}`,
      detail: "Reviews",
    };
  }

  const start = getStartOfLocalDay(item.timestamp);
  const today = getStartOfLocalDay(now);
  const diff = Math.round((today - start) / DAY_MS);

  if (diff === 0) {
    return { key: `day:${start}`, label: "Today", detail: "Latest" };
  }
  if (diff === 1) {
    return { key: `day:${start}`, label: "Yesterday", detail: "Recent" };
  }

  const label = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    weekday: diff < 7 ? "long" : undefined,
  }).format(new Date(item.timestamp));

  return { key: `day:${start}`, label, detail: diff < 7 ? "This week" : "Earlier" };
}

function isPlainLog(item: LogActivityItem): item is Extract<LogActivityItem, { type: "log" }> {
  return item.type === "log" && !getItemText(item);
}

function canCluster(
  current: LogActivityItem,
  previous: LogActivityItem | undefined,
) {
  return Boolean(
    previous &&
      isPlainLog(current) &&
      isPlainLog(previous) &&
      getShowKey(current) === getShowKey(previous) &&
      getDayKey(current.timestamp) === getDayKey(previous.timestamp),
  );
}

function buildCluster(logs: Extract<LogActivityItem, { type: "log" }>[]): LogClusterRow {
  const sortedLogs = [...logs].sort((left, right) => compareLogItems(left, right, "recent"));
  const latest = sortedLogs[0]!;
  const episodeLabels = sortedLogs
    .map((item) => buildEpisodeCode(item.log.seasonNumber, item.log.episodeNumber))
    .filter((label): label is string => Boolean(label));
  const subtitle =
    episodeLabels.length >= 2
      ? `${episodeLabels[episodeLabels.length - 1]} to ${episodeLabels[0]}`
      : episodeLabels[0] ?? `${sortedLogs.length} watch entries`;

  return {
    kind: "cluster",
    id: `cluster:${getShowKey(latest)}:${getDayKey(latest.timestamp)}:${sortedLogs.length}:${latest.id}`,
    title: getShowTitle(latest),
    timestamp: latest.timestamp,
    show: latest.show,
    logs: sortedLogs,
    subtitle,
  };
}

function buildRowsForSection(items: LogActivityItem[]) {
  const rows: LogTimelineRow[] = [];
  let cluster: Extract<LogActivityItem, { type: "log" }>[] = [];
  let previous: LogActivityItem | undefined;

  const flushCluster = () => {
    if (cluster.length === 0) return;
    if (cluster.length === 1) {
      rows.push({ kind: "item", id: cluster[0]!.id, item: cluster[0]! });
    } else {
      rows.push(buildCluster(cluster));
    }
    cluster = [];
  };

  for (const item of items) {
    if (isPlainLog(item) && (cluster.length === 0 || canCluster(item, previous))) {
      cluster.push(item);
      previous = item;
      continue;
    }

    flushCluster();
    rows.push({ kind: "item", id: item.id, item });
    previous = item;
  }

  flushCluster();
  return rows;
}

function rowMatchesFilter(row: LogTimelineRow, filter: LogFilterValue) {
  if (filter === "all") return true;
  if (filter === "journal") {
    return row.kind === "cluster" || row.item.type === "log";
  }
  if (filter === "reviews") {
    return row.kind === "item" && row.item.type === "review";
  }
  return row.kind === "cluster" ? row.logs.length >= 2 : isMeaningfulItem(row.item);
}

export function organizeLogTimeline({
  items,
  filter,
  sort,
  now = Date.now(),
}: {
  items: LogActivityItem[];
  filter: LogFilterValue;
  sort: LogSortValue;
  now?: number;
}) {
  const sorted = [...items].sort((left, right) => compareLogItems(left, right, sort));
  const sections: LogTimelineSection[] = [];
  const sectionMap = new Map<string, { label: string; detail: string; items: LogActivityItem[] }>();

  for (const item of sorted) {
    const group = getTimelineGroup(item, sort, now);
    const existing = sectionMap.get(group.key);
    if (existing) {
      existing.items.push(item);
    } else {
      sectionMap.set(group.key, { label: group.label, detail: group.detail, items: [item] });
    }
  }

  for (const [id, section] of sectionMap) {
    const rows = buildRowsForSection(section.items).filter((row) =>
      rowMatchesFilter(row, filter),
    );
    if (rows.length > 0) {
      sections.push({
        id,
        label: section.label,
        detail: `${rows.length} ${rows.length === 1 ? "moment" : "moments"}`,
        rows,
      });
    }
  }

  return sections;
}

export function computeLogSummary(items: LogActivityItem[], now = Date.now()): LogSummary {
  const weekStart = now - DAY_MS * 7;
  const reviews = items.filter((item) => item.type === "review");
  const ratings = reviews
    .map((item) => getItemRating(item))
    .filter((rating): rating is number => rating !== null);
  const totalNotes = items.filter((item) => getItemText(item)).length;
  const weekItems = items.filter((item) => item.timestamp >= weekStart);
  const uniqueShows = new Set(items.map(getShowKey)).size;
  const latestMeaningfulItem =
    [...items].sort((left, right) => right.timestamp - left.timestamp).find(isMeaningfulItem) ??
    [...items].sort((left, right) => right.timestamp - left.timestamp)[0] ??
    null;

  return {
    totalItems: items.length,
    totalEntries: items.filter((item) => item.type === "log").length,
    totalReviews: reviews.length,
    totalNotes,
    weekEntries: weekItems.filter((item) => item.type === "log").length,
    weekReviews: weekItems.filter((item) => item.type === "review").length,
    weekNotes: weekItems.filter((item) => getItemText(item)).length,
    uniqueShows,
    averageRating:
      ratings.length > 0
        ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length
        : null,
    latestMeaningfulItem,
  };
}

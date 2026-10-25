import { differenceInCalendarDays } from "date-fns/differenceInCalendarDays";
import { isSameDay } from "date-fns/isSameDay";

// Pure presentation logic for the notifications inbox. Server strings stay
// the source of truth for copy — these helpers only decorate: they bucket
// rows into date sections, split the body around the actor's name so the UI
// can bold it, and map each type to its visual treatment. Unknown future
// types fall through to plain title/body with a generic glyph.

export type NotificationActor = {
  _id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  viewerFollows?: boolean;
  viewerRequested?: boolean;
};

export type NotificationShow = {
  _id: string;
  title: string | null;
  posterUrl: string | null;
  year?: number | null;
};

export type NotificationItem = {
  _id: string;
  type: string;
  title: string;
  body: string;
  createdAt: number;
  readAt: number | null;
  data?: Record<string, unknown> | null;
  actor?: NotificationActor | null;
  show?: NotificationShow | null;
};

// A row's `item` is the newest notification it shows; `group` is every
// notification folded into it (just [item] for ungrouped rows), so read /
// delete act on all of them at once.
export type NotificationListEntry =
  | { kind: "header"; key: string; title: string }
  | { kind: "row"; key: string; item: NotificationItem; group: NotificationItem[] };

export const NOTIFICATION_FILTERS = [
  { key: "all", label: "All" },
  { key: "social", label: "Social" },
  { key: "shows", label: "Shows" },
] as const;
export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number]["key"];

// Types that fold into one "Ana, Ben and 3 others …" row. Bodies for these
// are "<actor> <verb phrase>." so swapping the name prefix stays grammatical;
// comments carry their text and never group.
const GROUPABLE_TYPES = new Set(["like", "follow", "list_follow"]);

function groupKey(item: NotificationItem): string | null {
  if (!GROUPABLE_TYPES.has(item.type) || !item.actor) return null;
  if (item.type === "follow") return "follow";
  const url = item.data?.url;
  return typeof url === "string" ? `${item.type}:${url}` : null;
}

// Fold groupable rows within one section, keeping the position of the newest.
function groupSectionItems(items: NotificationItem[]): NotificationItem[][] {
  const groups: NotificationItem[][] = [];
  const byKey = new Map<string, NotificationItem[]>();
  for (const item of items) {
    const key = groupKey(item);
    const existing = key ? byKey.get(key) : undefined;
    if (existing) {
      existing.push(item);
      continue;
    }
    const group = [item];
    if (key) byKey.set(key, group);
    groups.push(group);
  }
  return groups;
}

const SECTION_ORDER = ["New", "Today", "This week", "This month", "Earlier"] as const;
export type NotificationSectionTitle = (typeof SECTION_ORDER)[number];

function dateBucket(createdAt: number, now: number): NotificationSectionTitle {
  const date = new Date(createdAt);
  const today = new Date(now);
  if (isSameDay(date, today)) return "Today";
  const days = differenceInCalendarDays(today, date);
  if (days < 7) return "This week";
  if (days < 31) return "This month";
  return "Earlier";
}

// Items must already be sorted newest-first (the list RPC guarantees it).
// A contiguous unread prefix becomes the "New" section; everything else
// buckets by age. A read row in between ends the prefix so sections never
// interleave read/unread out of chronological order.
export function notificationSections(
  items: NotificationItem[],
  now: number = Date.now(),
): NotificationListEntry[] {
  const buckets = new Map<NotificationSectionTitle, NotificationItem[]>();
  let inNewPrefix = true;
  for (const item of items) {
    if (inNewPrefix && item.readAt) {
      inNewPrefix = false;
    }
    const bucket = inNewPrefix ? "New" : dateBucket(item.createdAt, now);
    const list = buckets.get(bucket);
    if (list) {
      list.push(item);
    } else {
      buckets.set(bucket, [item]);
    }
  }

  const entries: NotificationListEntry[] = [];
  for (const title of SECTION_ORDER) {
    const sectionItems = buckets.get(title);
    if (!sectionItems || sectionItems.length === 0) continue;
    entries.push({ kind: "header", key: `header:${title}`, title });
    for (const group of groupSectionItems(sectionItems)) {
      entries.push({ kind: "row", key: group[0]._id, item: group[0], group });
    }
  }
  return entries;
}

export type NotificationBodySegment = { text: string; bold?: boolean };

// Bold the actor-name prefix of the server body ("Ana liked your review." →
// **Ana** + " liked your review."). Prefix matching means copy drift can only
// lose the bolding, never break rendering.
export function notificationBodySegments(item: NotificationItem): NotificationBodySegment[] {
  const body = item.body ?? "";
  const actorName = item.actor?.displayName ?? item.actor?.username ?? null;
  if (actorName && body.startsWith(actorName)) {
    const rest = body.slice(actorName.length);
    return rest
      ? [{ text: actorName, bold: true }, { text: rest }]
      : [{ text: actorName, bold: true }];
  }
  return [{ text: body }];
}

function actorName(actor: NotificationActor | null | undefined): string | null {
  return actor?.displayName ?? actor?.username ?? null;
}

// Distinct actors of a group, newest first.
export function groupActors(group: NotificationItem[]): NotificationActor[] {
  const seen = new Set<string>();
  const actors: NotificationActor[] = [];
  for (const item of group) {
    if (item.actor && !seen.has(item.actor._id)) {
      seen.add(item.actor._id);
      actors.push(item.actor);
    }
  }
  return actors;
}

// "Ana and Ben liked your review." / "Ana, Ben and 3 others started
// following you." — the verb phrase is lifted from the newest row's body.
export function groupBodySegments(group: NotificationItem[]): NotificationBodySegment[] {
  const primary = group[0];
  const actors = groupActors(group);
  const primaryName = actorName(primary?.actor);
  if (!primary || actors.length < 2 || !primaryName || !primary.body.startsWith(primaryName)) {
    return primary ? notificationBodySegments(primary) : [];
  }
  const rest = primary.body.slice(primaryName.length);
  const first = primaryName;
  const second = actorName(actors[1]) ?? "someone";
  if (actors.length === 2) {
    return [{ text: first, bold: true }, { text: " and " }, { text: second, bold: true }, { text: rest }];
  }
  const others = actors.length - 2;
  return [
    { text: first, bold: true },
    { text: ", " },
    { text: second, bold: true },
    { text: " and " },
    { text: `${others} ${others === 1 ? "other" : "others"}`, bold: true },
    { text: rest },
  ];
}

export function groupPlainText(group: NotificationItem[]): string {
  return groupBodySegments(group)
    .map((segment) => segment.text)
    .join("");
}

export type NotificationLeadingVisual = "avatar" | "poster" | "tile";
export type NotificationTrailingVisual = "followButton" | "chevron" | "poster" | "tile" | null;

export type NotificationVisuals = {
  glyph: string;
  // Hex color, or "accent" for the active accent ramp (resolved by the row).
  glyphColor: string;
  leading: NotificationLeadingVisual;
  trailing: NotificationTrailingVisual;
};

const TYPE_VISUALS: Record<string, NotificationVisuals> = {
  follow: { glyph: "person-add", glyphColor: "accent", leading: "avatar", trailing: "followButton" },
  follow_request: { glyph: "person-add", glyphColor: "#F59E0B", leading: "avatar", trailing: "chevron" },
  follow_accepted: { glyph: "checkmark", glyphColor: "#22C55E", leading: "avatar", trailing: null },
  contact_joined: { glyph: "people", glyphColor: "accent", leading: "avatar", trailing: "followButton" },
  list_follow: { glyph: "list", glyphColor: "accent", leading: "avatar", trailing: "tile" },
  like: { glyph: "heart", glyphColor: "#F472B6", leading: "avatar", trailing: "poster" },
  comment: { glyph: "chatbubble", glyphColor: "#A78BFA", leading: "avatar", trailing: "poster" },
  episode: { glyph: "tv", glyphColor: "#22C55E", leading: "poster", trailing: null },
  premiere: { glyph: "sparkles", glyphColor: "#FACC15", leading: "poster", trailing: null },
  streaming: { glyph: "play", glyphColor: "accent", leading: "poster", trailing: null },
  vibe_arrival: { glyph: "sparkles", glyphColor: "accent", leading: "poster", trailing: null },
  vibe_digest: { glyph: "sparkles", glyphColor: "accent", leading: "tile", trailing: null },
  monthly_recap: { glyph: "stats-chart", glyphColor: "#F472B6", leading: "tile", trailing: null },
};

const FALLBACK_VISUALS: NotificationVisuals = {
  glyph: "notifications",
  glyphColor: "#9BA1B0",
  leading: "tile",
  trailing: null,
};

export function notificationVisuals(item: NotificationItem): NotificationVisuals {
  const visuals = TYPE_VISUALS[item.type] ?? FALLBACK_VISUALS;
  // Degrade gracefully when the promised entity is missing: an avatar row
  // without an actor and a poster row without a show both become glyph tiles.
  const leading: NotificationLeadingVisual =
    (visuals.leading === "avatar" && !item.actor) ||
    (visuals.leading === "poster" && !item.show?.posterUrl)
      ? "tile"
      : visuals.leading;
  const trailing: NotificationTrailingVisual =
    visuals.trailing === "poster" && !item.show?.posterUrl
      ? "tile"
      : visuals.trailing === "followButton" && !item.actor
        ? null
        : visuals.trailing;
  return { ...visuals, leading, trailing };
}

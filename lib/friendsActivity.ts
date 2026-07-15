import { formatEpisodeCode } from "./format";

export type FriendActivityActor = {
  _id: string;
  displayName?: string | null;
  name?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  image?: string | null;
};

export type FriendActivityShow = {
  _id: string;
  title?: string | null;
  posterUrl?: string | null;
  year?: number | null;
};

type FriendActivityCore = {
  key: string;
  timestamp: number;
  actor: FriendActivityActor;
  avatarUrl: string | null;
};

type FriendActivityBase = FriendActivityCore & {
  show: FriendActivityShow;
};

export type FriendWatchedEntry = FriendActivityBase & {
  kind: "watched";
  verb: "started" | "watched" | "finished" | "rewatched";
  episodeCount: number;
  /** "S2 E4" for a single episode, "3 episodes" for a run, null when unknown. */
  episodeLabel: string | null;
  /** Newest log in the group; anchors the like/comment thread. Null for legacy rows. */
  logId: string | null;
};

export type FriendReviewEntry = FriendActivityBase & {
  kind: "review";
  reviewId: string;
  rating: number;
  reviewText: string | null;
  spoiler: boolean;
  episodeLabel: string | null;
};

export type FriendFollowEntry = FriendActivityCore & {
  kind: "follow";
  followedUser: FriendActivityActor;
  followedAvatarUrl: string | null;
};

export type FriendListEntry = FriendActivityCore & {
  kind: "list";
  listId: string;
  listTitle: string;
  listDescription: string | null;
};

export type FriendActivityEntry =
  | FriendWatchedEntry
  | FriendReviewEntry
  | FriendFollowEntry
  | FriendListEntry;

export type RawFriendFeedItem = {
  type?: unknown;
  timestamp?: unknown;
  actor?: FriendActivityActor | null;
  user?: FriendActivityActor | null;
  avatarUrl?: string | null;
  show?: FriendActivityShow | null;
  review?: {
    _id?: string;
    id?: string;
    rating?: number;
    reviewText?: string | null;
    spoiler?: boolean;
    seasonNumber?: number | null;
    episodeNumber?: number | null;
  } | null;
  log?: {
    _id?: string;
    id?: string;
    seasonNumber?: number | null;
    episodeNumber?: number | null;
    isRewatch?: boolean | null;
  } | null;
  followedUser?: FriendActivityActor | null;
  list?: {
    _id?: string;
    id?: string;
    title?: string | null;
    description?: string | null;
  } | null;
};

function episodeCode(seasonNumber?: number | null, episodeNumber?: number | null) {
  if (typeof seasonNumber !== "number" || typeof episodeNumber !== "number") {
    return null;
  }
  return formatEpisodeCode(seasonNumber, episodeNumber);
}

export function getFriendActivityActorName(actor: FriendActivityActor) {
  return actor.displayName ?? actor.name ?? actor.username ?? "Someone";
}

export function getFriendWatchedPhrase(entry: FriendWatchedEntry) {
  if (entry.verb === "finished") return "finished";
  if (entry.verb === "started") return "started";
  if (entry.verb === "rewatched") return "rewatched";
  return "watched";
}

// Collapses the raw follower feed into one renderable entry per moment:
// every episode a friend marks fans out its own "log" feed row, so without
// grouping the same show shows up once per episode ("X started Y" twice).
// Logs group per actor+show (newest first, counted); reviews stay individual.
export function buildFriendActivity(
  rows: RawFriendFeedItem[],
  options: { viewerId?: string | null; sinceMs?: number; now?: number } = {},
): FriendActivityEntry[] {
  const viewerId = options.viewerId ?? null;
  const cutoff =
    typeof options.sinceMs === "number"
      ? (options.now ?? Date.now()) - options.sinceMs
      : null;

  const entries: FriendActivityEntry[] = [];
  const watchedByGroup = new Map<string, FriendWatchedEntry>();
  const seenReviewIds = new Set<string>();
  const seenStatusKeys = new Set<string>();
  const seenFollowKeys = new Set<string>();
  const seenListIds = new Set<string>();

  for (const row of rows) {
    if (typeof row.timestamp !== "number") continue;
    if (cutoff !== null && row.timestamp < cutoff) continue;

    const actor = row.actor ?? row.user ?? null;
    if (!actor?._id) continue;
    if (viewerId && actor._id === viewerId) continue;

    const avatarUrl = row.avatarUrl ?? actor.avatarUrl ?? actor.image ?? null;

    // Follow and list moments have no show attached.
    if (row.type === "follow") {
      const followed = row.followedUser;
      if (!followed?._id) continue;
      // Never announce the viewer's own new followers here; that's what the
      // follow notification is for.
      if (viewerId && followed._id === viewerId) continue;
      const key = `follow:${actor._id}:${followed._id}`;
      if (seenFollowKeys.has(key)) continue;
      seenFollowKeys.add(key);
      entries.push({
        kind: "follow",
        key,
        timestamp: row.timestamp,
        actor,
        avatarUrl,
        followedUser: followed,
        followedAvatarUrl: followed.avatarUrl ?? followed.image ?? null,
      });
      continue;
    }

    if (row.type === "list") {
      const list = row.list;
      const listId = list?._id ?? list?.id;
      const listTitle = list?.title?.trim();
      if (!list || !listId || !listTitle) continue;
      if (seenListIds.has(listId)) continue;
      seenListIds.add(listId);
      entries.push({
        kind: "list",
        key: `list:${listId}`,
        timestamp: row.timestamp,
        actor,
        avatarUrl,
        listId,
        listTitle,
        listDescription: list.description?.trim() || null,
      });
      continue;
    }

    const show = row.show ?? null;
    if (!show?._id) continue;

    if (row.type === "review") {
      const review = row.review;
      const reviewId = review?._id ?? review?.id;
      if (!review || !reviewId || typeof review.rating !== "number") continue;
      if (seenReviewIds.has(reviewId)) continue;
      seenReviewIds.add(reviewId);
      entries.push({
        kind: "review",
        key: `review:${reviewId}`,
        timestamp: row.timestamp,
        actor,
        avatarUrl,
        show,
        reviewId,
        rating: review.rating,
        reviewText: review.reviewText ?? null,
        spoiler: Boolean(review.spoiler),
        episodeLabel: episodeCode(review.seasonNumber, review.episodeNumber),
      });
      continue;
    }

    if (row.type === "log") {
      const groupKey = `watched:${actor._id}:${show._id}`;
      // Season-only logs read "Season 2"; show-scope logs have no label and
      // fall back to the plain "<name> rewatched <show>" headline.
      const code =
        episodeCode(row.log?.seasonNumber, row.log?.episodeNumber) ??
        (typeof row.log?.seasonNumber === "number" ? `Season ${row.log.seasonNumber}` : null);
      const logId = row.log?._id ?? row.log?.id ?? null;
      const isPremiere =
        row.log?.seasonNumber === 1 && row.log?.episodeNumber === 1;
      const isRewatch = Boolean(row.log?.isRewatch);
      const existing = watchedByGroup.get(groupKey);
      if (existing) {
        existing.episodeCount += 1;
        existing.episodeLabel = `${existing.episodeCount} episodes`;
        if (row.timestamp > existing.timestamp) {
          existing.timestamp = row.timestamp;
          existing.avatarUrl = existing.avatarUrl ?? avatarUrl;
          existing.logId = logId ?? existing.logId;
        }
        if (isPremiere && existing.verb !== "rewatched") {
          existing.verb = "started";
        }
      } else {
        const entry: FriendWatchedEntry = {
          kind: "watched",
          key: groupKey,
          timestamp: row.timestamp,
          actor,
          avatarUrl,
          show,
          verb: isRewatch ? "rewatched" : isPremiere ? "started" : "watched",
          episodeCount: 1,
          episodeLabel: code,
          logId,
        };
        watchedByGroup.set(groupKey, entry);
        entries.push(entry);
      }
      continue;
    }

    // Legacy fan-out rows from before logs carried episode data.
    if (row.type === "started" || row.type === "completed") {
      const groupKey = `watched:${actor._id}:${show._id}`;
      if (watchedByGroup.has(groupKey)) continue;
      const statusKey = `${groupKey}:${row.type}`;
      if (seenStatusKeys.has(statusKey)) continue;
      seenStatusKeys.add(statusKey);
      entries.push({
        kind: "watched",
        key: statusKey,
        timestamp: row.timestamp,
        actor,
        avatarUrl,
        show,
        verb: row.type === "completed" ? "finished" : "started",
        episodeCount: 0,
        episodeLabel: null,
        logId: null,
      });
    }
  }

  return entries.sort((left, right) => right.timestamp - left.timestamp);
}

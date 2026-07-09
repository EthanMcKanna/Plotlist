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

type FriendActivityBase = {
  key: string;
  timestamp: number;
  actor: FriendActivityActor;
  avatarUrl: string | null;
  show: FriendActivityShow;
};

export type FriendWatchedEntry = FriendActivityBase & {
  kind: "watched";
  verb: "started" | "watched" | "finished";
  episodeCount: number;
  /** "S2 E4" for a single episode, "3 episodes" for a run, null when unknown. */
  episodeLabel: string | null;
};

export type FriendReviewEntry = FriendActivityBase & {
  kind: "review";
  reviewId: string;
  rating: number;
  reviewText: string | null;
  spoiler: boolean;
  episodeLabel: string | null;
};

export type FriendActivityEntry = FriendWatchedEntry | FriendReviewEntry;

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
    seasonNumber?: number | null;
    episodeNumber?: number | null;
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

  for (const row of rows) {
    if (typeof row.timestamp !== "number") continue;
    if (cutoff !== null && row.timestamp < cutoff) continue;

    const actor = row.actor ?? row.user ?? null;
    if (!actor?._id) continue;
    if (viewerId && actor._id === viewerId) continue;

    const show = row.show ?? null;
    if (!show?._id) continue;

    const avatarUrl = row.avatarUrl ?? actor.avatarUrl ?? actor.image ?? null;

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
      const code = episodeCode(row.log?.seasonNumber, row.log?.episodeNumber);
      const isPremiere =
        row.log?.seasonNumber === 1 && row.log?.episodeNumber === 1;
      const existing = watchedByGroup.get(groupKey);
      if (existing) {
        existing.episodeCount += 1;
        existing.episodeLabel = `${existing.episodeCount} episodes`;
        if (row.timestamp > existing.timestamp) {
          existing.timestamp = row.timestamp;
          existing.avatarUrl = existing.avatarUrl ?? avatarUrl;
        }
        if (isPremiere) {
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
          verb: isPremiere ? "started" : "watched",
          episodeCount: 1,
          episodeLabel: code,
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
      });
    }
  }

  return entries.sort((left, right) => right.timestamp - left.timestamp);
}

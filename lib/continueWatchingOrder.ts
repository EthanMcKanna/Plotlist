/**
 * Shared ordering for the "Continue" rail. Used by the server (`getUpNext`
 * ranks before slicing its top-10) and the client rail (which re-ranks after
 * optimistic updates), so the two can never disagree about what leads.
 *
 * Tiers, in order:
 *   0 — ready to watch: the next episode is out. Includes cards an optimistic
 *       update just marked caught-up, so they don't jump while unconfirmed.
 *   1 — upcoming with a known air date (soonest first).
 *   2 — upcoming with no date ("Coming soon").
 *   3 — caught up (server payloads only; the client filters these out).
 *
 * Ordering is clock-aware: an entry whose `nextReleaseDate` is still in the
 * future counts as upcoming no matter what its flags claim, so stale caches
 * or timezone-skewed payloads can never float an unaired episode to the top.
 */

export type ContinueWatchingOrderable = {
  isUpcoming?: boolean;
  isCaughtUp?: boolean;
  optimisticCaughtUp?: boolean;
  totalEpisodes?: number;
  totalWatched?: number;
  nextAirDate?: number | null;
  nextReleaseDate?: number | null;
  nextEpisodeReleasedToday?: boolean;
  lastWatchedAt?: number | null;
  /** Server-side ranking hint: max(lastWatchedAt, updatedAt, releaseAirTs). */
  sortTimestamp?: number;
};

export const CONTINUE_WATCHING_TIER_READY = 0;
export const CONTINUE_WATCHING_TIER_UPCOMING_DATED = 1;
export const CONTINUE_WATCHING_TIER_UPCOMING_UNDATED = 2;
export const CONTINUE_WATCHING_TIER_CAUGHT_UP = 3;

function toFiniteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isOrderableComplete(item: ContinueWatchingOrderable) {
  if (item.isCaughtUp !== undefined) {
    return !item.isUpcoming && Boolean(item.isCaughtUp);
  }
  const totalEpisodes = item.totalEpisodes ?? 0;
  return (
    !item.isUpcoming &&
    totalEpisodes > 0 &&
    (item.totalWatched ?? 0) >= totalEpisodes
  );
}

export function isContinueWatchingFutureRelease(
  item: ContinueWatchingOrderable,
  now: number,
) {
  return (
    typeof item.nextReleaseDate === "number" &&
    Number.isFinite(item.nextReleaseDate) &&
    item.nextReleaseDate > now
  );
}

function getUpcomingSortDate(item: ContinueWatchingOrderable, now: number) {
  if (typeof item.nextAirDate === "number" && Number.isFinite(item.nextAirDate)) {
    return item.nextAirDate;
  }
  if (isContinueWatchingFutureRelease(item, now)) {
    return item.nextReleaseDate as number;
  }
  return null;
}

export function getContinueWatchingOrderTier(
  item: ContinueWatchingOrderable,
  now = Date.now(),
) {
  if (isOrderableComplete(item)) {
    return item.optimisticCaughtUp === true
      ? CONTINUE_WATCHING_TIER_READY
      : CONTINUE_WATCHING_TIER_CAUGHT_UP;
  }
  if (item.isUpcoming || isContinueWatchingFutureRelease(item, now)) {
    return getUpcomingSortDate(item, now) !== null
      ? CONTINUE_WATCHING_TIER_UPCOMING_DATED
      : CONTINUE_WATCHING_TIER_UPCOMING_UNDATED;
  }
  return CONTINUE_WATCHING_TIER_READY;
}

/**
 * Recency currency for ready cards: the freshest of "you watched this
 * recently" and "an episode just dropped". Active shows and fresh drops both
 * rise; a stale show with an old backlog sinks. Future release timestamps
 * never count toward readiness.
 */
export function getContinueWatchingRecencyScore(
  item: ContinueWatchingOrderable,
  now = Date.now(),
) {
  const releasedEpisodeTs =
    !item.isUpcoming && !isContinueWatchingFutureRelease(item, now)
      ? toFiniteNumber(item.nextReleaseDate)
      : 0;
  return Math.max(
    toFiniteNumber(item.lastWatchedAt),
    Math.min(toFiniteNumber(item.sortTimestamp), now),
    releasedEpisodeTs,
  );
}

export function compareContinueWatchingOrder(
  left: ContinueWatchingOrderable,
  right: ContinueWatchingOrderable,
  now = Date.now(),
) {
  const tierDelta =
    getContinueWatchingOrderTier(left, now) -
    getContinueWatchingOrderTier(right, now);
  if (tierDelta !== 0) return tierDelta;

  if (
    getContinueWatchingOrderTier(left, now) ===
    CONTINUE_WATCHING_TIER_UPCOMING_DATED
  ) {
    const airDelta =
      toFiniteNumber(getUpcomingSortDate(left, now)) -
      toFiniteNumber(getUpcomingSortDate(right, now));
    if (airDelta !== 0) return airDelta;
  }

  const recencyDelta =
    getContinueWatchingRecencyScore(right, now) -
    getContinueWatchingRecencyScore(left, now);
  if (recencyDelta !== 0) return recencyDelta;

  // Same-moment ties: the episode that aired today edges ahead.
  return (
    Number(Boolean(right.nextEpisodeReleasedToday)) -
    Number(Boolean(left.nextEpisodeReleasedToday))
  );
}

export function rankContinueWatchingItems<T extends ContinueWatchingOrderable>(
  items: T[],
  now = Date.now(),
): T[] {
  return [...items].sort((left, right) =>
    compareContinueWatchingOrder(left, right, now),
  );
}

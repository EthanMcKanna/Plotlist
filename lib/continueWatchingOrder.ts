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

export function getContinueWatchingOrderTier(item: ContinueWatchingOrderable) {
  if (isOrderableComplete(item)) {
    return item.optimisticCaughtUp === true
      ? CONTINUE_WATCHING_TIER_READY
      : CONTINUE_WATCHING_TIER_CAUGHT_UP;
  }
  if (item.isUpcoming) {
    return typeof item.nextAirDate === "number" &&
      Number.isFinite(item.nextAirDate)
      ? CONTINUE_WATCHING_TIER_UPCOMING_DATED
      : CONTINUE_WATCHING_TIER_UPCOMING_UNDATED;
  }
  return CONTINUE_WATCHING_TIER_READY;
}

/**
 * Recency currency for ready cards: the freshest of "you watched this
 * recently" and "an episode just dropped". Active shows and fresh drops both
 * rise; a stale show with an old backlog sinks.
 */
export function getContinueWatchingRecencyScore(
  item: ContinueWatchingOrderable,
) {
  const releasedEpisodeTs = !item.isUpcoming
    ? toFiniteNumber(item.nextReleaseDate)
    : 0;
  return Math.max(
    toFiniteNumber(item.lastWatchedAt),
    toFiniteNumber(item.sortTimestamp),
    releasedEpisodeTs,
  );
}

export function compareContinueWatchingOrder(
  left: ContinueWatchingOrderable,
  right: ContinueWatchingOrderable,
) {
  const tierDelta =
    getContinueWatchingOrderTier(left) - getContinueWatchingOrderTier(right);
  if (tierDelta !== 0) return tierDelta;

  if (
    getContinueWatchingOrderTier(left) === CONTINUE_WATCHING_TIER_UPCOMING_DATED
  ) {
    const airDelta =
      toFiniteNumber(left.nextAirDate) - toFiniteNumber(right.nextAirDate);
    if (airDelta !== 0) return airDelta;
  }

  const recencyDelta =
    getContinueWatchingRecencyScore(right) -
    getContinueWatchingRecencyScore(left);
  if (recencyDelta !== 0) return recencyDelta;

  // Same-moment ties: the episode that aired today edges ahead.
  return (
    Number(Boolean(right.nextEpisodeReleasedToday)) -
    Number(Boolean(left.nextEpisodeReleasedToday))
  );
}

export function rankContinueWatchingItems<T extends ContinueWatchingOrderable>(
  items: T[],
): T[] {
  return [...items].sort(compareContinueWatchingOrder);
}

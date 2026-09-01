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
 * Within the ready tier, cards sort by "activity moment": the freshest of
 * when the user last watched the show, when they last changed its status,
 * and — for a next episode that has already dropped — the start of the day
 * it aired (in the user's timezone). So today's drop leads yesterday's
 * binge, but a show watched tonight leads a drop from this morning.
 *
 * The home rail is about what can be watched now or very soon: upcoming
 * cards only qualify within `CONTINUE_RAIL_UPCOMING_HORIZON_MS`, undated
 * "coming soon" cards never do. `/continue` shows the long tail.
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
  /**
   * Server-side activity moment: max(lastWatchedAt, status updatedAt,
   * local day-start of a released next episode). Carried on the wire so the
   * client ranks exactly like the server; optimistic updates overlay
   * `lastWatchedAt` on top of it.
   */
  sortTimestamp?: number;
};

export const CONTINUE_WATCHING_TIER_READY = 0;
export const CONTINUE_WATCHING_TIER_UPCOMING_DATED = 1;
export const CONTINUE_WATCHING_TIER_UPCOMING_UNDATED = 2;
export const CONTINUE_WATCHING_TIER_CAUGHT_UP = 3;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Upcoming cards join the home rail only when they air within this window. */
export const CONTINUE_RAIL_UPCOMING_HORIZON_MS = 30 * DAY_MS;
/** A released next episode reads as "New" for this long after it drops. */
export const CONTINUE_NEW_RELEASE_WINDOW_MS = 14 * DAY_MS;
/** Home rail card cap; the server slices to this after ranking. */
export const CONTINUE_RAIL_LIMIT = 10;

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

/**
 * Whether the card's next episode dropped recently enough to badge as "New".
 * Future dates never qualify (the clock wins over flags), and an old backlog
 * episode whose release event has aged out of the window reads as plain
 * progress again.
 */
export function isContinueWatchingFreshRelease(
  item: ContinueWatchingOrderable,
  now = Date.now(),
) {
  if (isOrderableComplete(item)) return false;
  if (isContinueWatchingFutureRelease(item, now)) return false;
  if (item.nextEpisodeReleasedToday) return true;
  if (item.isUpcoming) return false;
  const released = item.nextReleaseDate;
  if (typeof released !== "number" || !Number.isFinite(released)) return false;
  // One day of slack: release timestamps are day-granular and the "today"
  // boundary is the user's, not the clock's.
  return now - released <= CONTINUE_NEW_RELEASE_WINDOW_MS + DAY_MS;
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
 * Whether an entry belongs on the home rail at all: ready cards always,
 * dated upcoming cards only inside the horizon, nothing else. Optimistically
 * caught-up cards count as ready so they hold their slot until confirmed.
 */
export function isContinueRailEligible(
  item: ContinueWatchingOrderable,
  now = Date.now(),
) {
  const tier = getContinueWatchingOrderTier(item, now);
  if (tier === CONTINUE_WATCHING_TIER_READY) return true;
  if (tier !== CONTINUE_WATCHING_TIER_UPCOMING_DATED) return false;
  const airsAt = getUpcomingSortDate(item, now);
  return airsAt !== null && airsAt - now <= CONTINUE_RAIL_UPCOMING_HORIZON_MS;
}

/**
 * Recency currency for ready cards. With a server `sortTimestamp` the client
 * trusts it (it already folds in status changes and the local-day release
 * moment) and only overlays fresher local activity. Without one (older
 * payloads, fixtures) it reconstructs the same idea from the card's fields.
 * Future release timestamps never count toward readiness.
 */
export function getContinueWatchingRecencyScore(
  item: ContinueWatchingOrderable,
  now = Date.now(),
) {
  const lastWatchedAt = toFiniteNumber(item.lastWatchedAt);
  if (typeof item.sortTimestamp === "number" && Number.isFinite(item.sortTimestamp)) {
    return Math.max(lastWatchedAt, Math.min(item.sortTimestamp, now));
  }
  const releasedEpisodeTs =
    !item.isUpcoming && !isContinueWatchingFutureRelease(item, now)
      ? toFiniteNumber(item.nextReleaseDate)
      : 0;
  return Math.max(lastWatchedAt, releasedEpisodeTs);
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
  // Same ordering as `compareContinueWatchingOrder`, but with every score
  // computed once per item instead of once per comparison.
  return items
    .map((item, index) => ({
      item,
      index,
      tier: getContinueWatchingOrderTier(item, now),
      upcomingSortDate: toFiniteNumber(getUpcomingSortDate(item, now)),
      recencyScore: getContinueWatchingRecencyScore(item, now),
      releasedToday: Number(Boolean(item.nextEpisodeReleasedToday)),
    }))
    .sort((left, right) => {
      const tierDelta = left.tier - right.tier;
      if (tierDelta !== 0) return tierDelta;

      if (left.tier === CONTINUE_WATCHING_TIER_UPCOMING_DATED) {
        const airDelta = left.upcomingSortDate - right.upcomingSortDate;
        if (airDelta !== 0) return airDelta;
      }

      const recencyDelta = right.recencyScore - left.recencyScore;
      if (recencyDelta !== 0) return recencyDelta;

      const releasedTodayDelta = right.releasedToday - left.releasedToday;
      if (releasedTodayDelta !== 0) return releasedTodayDelta;
      return left.index - right.index;
    })
    .map(({ item }) => item);
}

/**
 * Held ordering for the rail while the user is acting on it. A mark-watched
 * tap must never reorder cards under the user's finger, so the rail
 * snapshots its visible order at the tap and keeps it — including cards
 * that just became caught up or upcoming, which stay put showing their new
 * state — until the surface is next re-ranked (tab focus, pull-to-refresh,
 * app foreground). Cards that arrive meanwhile append after the held ones.
 */
export function applyHeldContinueOrder<T extends { showId: string | number }>(
  heldShowIds: ReadonlyArray<string>,
  rankedActive: ReadonlyArray<T>,
  allItems: ReadonlyArray<T>,
): T[] {
  const byId = new Map<string, T>();
  for (const item of allItems) byId.set(String(item.showId), item);
  const held = new Set<string>();
  const result: T[] = [];
  for (const showId of heldShowIds) {
    const item = byId.get(showId);
    if (!item || held.has(showId)) continue;
    held.add(showId);
    result.push(item);
  }
  for (const item of rankedActive) {
    const showId = String(item.showId);
    if (held.has(showId)) continue;
    held.add(showId);
    result.push(item);
  }
  return result;
}

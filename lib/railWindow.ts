// Progressive reveal for horizontal rails. A rail may hold 30 items, but
// mounting 30 poster cards (and requesting 30 images) on the first frame is
// what made deep rails expensive. Rails mount an initial window and reveal
// the rest in batches as the user scrolls toward the end; items past the
// window are never mounted, so their posters are never requested.

export const RAIL_INITIAL_WINDOW = 12;
export const RAIL_REVEAL_BATCH = 8;
export const RAIL_REVEAL_THRESHOLD_PX = 320;

/** How many items to mount before the user has scrolled. */
export function getInitialRailWindow(
  itemCount: number,
  initialWindow = RAIL_INITIAL_WINDOW,
) {
  return Math.max(0, Math.min(itemCount, initialWindow));
}

/** Next window size after one reveal step (never past the item count). */
export function getNextRailWindow(
  revealed: number,
  itemCount: number,
  batch = RAIL_REVEAL_BATCH,
) {
  if (revealed >= itemCount) return itemCount;
  return Math.min(itemCount, revealed + Math.max(1, batch));
}

export type RailScrollMetrics = {
  offsetX: number;
  layoutWidth: number;
  contentWidth: number;
};

/**
 * Whether the rail is close enough to its end (or does not overflow its
 * viewport at all) that the next batch should mount. A window that fits
 * without scrolling can never fire a scroll event, so "no overflow" counts
 * as reaching the end.
 */
export function shouldRevealMoreRailItems(
  metrics: RailScrollMetrics,
  revealed: number,
  itemCount: number,
  thresholdPx = RAIL_REVEAL_THRESHOLD_PX,
) {
  if (revealed >= itemCount) return false;
  return isRailNearEnd(metrics, thresholdPx);
}

/** Whether the viewport's trailing edge is within `thresholdPx` of the end. */
export function isRailNearEnd(
  metrics: RailScrollMetrics,
  thresholdPx = RAIL_REVEAL_THRESHOLD_PX,
) {
  const { offsetX, layoutWidth, contentWidth } = metrics;
  if (!(layoutWidth > 0) || !(contentWidth > 0)) return false;
  const remaining = contentWidth - (offsetX + layoutWidth);
  return remaining <= thresholdPx;
}

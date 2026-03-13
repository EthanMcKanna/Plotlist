export const INITIAL_VISIBLE_SEASONS = 3;
export const SEASON_BATCH_SIZE = 5;
export const SEASON_DETAILS_RATE_LIMIT_ERROR = "Season details rate limit exceeded";

export type SeasonLoadState = "idle" | "loading" | "loaded" | "error";

export function getInitialVisibleSeasonCount(totalSeasonCount: number) {
  return Math.min(INITIAL_VISIBLE_SEASONS, Math.max(totalSeasonCount, 0));
}

export function getNextVisibleSeasonCount(
  currentVisibleSeasonCount: number,
  totalSeasonCount: number,
) {
  return Math.min(
    Math.max(totalSeasonCount, 0),
    Math.max(currentVisibleSeasonCount, 0) + SEASON_BATCH_SIZE,
  );
}

export function getSeasonToggleLabel(
  currentVisibleSeasonCount: number,
  totalSeasonCount: number,
) {
  const safeTotal = Math.max(totalSeasonCount, 0);
  if (currentVisibleSeasonCount >= safeTotal) {
    return "Show less";
  }

  return `Show ${Math.max(safeTotal - currentVisibleSeasonCount, 0)} more seasons`;
}

export function getSeasonLoadErrorMessage(error: unknown) {
  if (
    error instanceof Error &&
    error.message.includes(SEASON_DETAILS_RATE_LIMIT_ERROR)
  ) {
    return "Too many season requests. Try again in a moment.";
  }

  return "Couldn't load episodes for this season.";
}

// Pull-to-refresh on home used to invalidate the whole ["plotlist-rpc"]
// cache, refetching every query any mounted screen had ever asked for
// (show pages, settings, profile stats...). Only the queries the home
// surface actually renders need to go: the catalog rails have their own
// loaders keyed on `refreshKey` inside useHomeData.
export const HOME_REFRESH_QUERY_NAMES: ReadonlySet<string> = new Set([
  "users:me",
  "feed:listForUser",
  "contacts:getStatus",
  "contacts:getMatches",
  "users:suggested",
  "notifications:getUnreadCount",
  "episodeProgress:getUpNext",
  "releaseCalendar:getHomePreview",
]);

/** Matches both plain and paginated cache keys for the home-surface queries. */
export function isHomeSurfaceQueryKey(key: readonly unknown[]): boolean {
  return (
    key[0] === "plotlist-rpc" &&
    typeof key[2] === "string" &&
    HOME_REFRESH_QUERY_NAMES.has(key[2])
  );
}

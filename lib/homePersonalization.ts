export type HomePersonalizationProfile = {
  favoriteShowIds?: string[] | null;
  countsReviews?: number | null;
  countsLogs?: number | null;
  countsWatchlist?: number | null;
  countsWatching?: number | null;
  countsCompleted?: number | null;
  countsDropped?: number | null;
  countsTotalShows?: number | null;
};

export function hasHomePersonalizationSignals(
  profile: HomePersonalizationProfile | null,
  options: { activeShowCount?: number | null } = {},
) {
  if ((options.activeShowCount ?? 0) > 0) return true;
  if (!profile) return false;
  if ((profile.favoriteShowIds?.length ?? 0) > 0) return true;
  return [
    profile.countsReviews,
    profile.countsLogs,
    profile.countsWatchlist,
    profile.countsWatching,
    profile.countsCompleted,
    profile.countsDropped,
    profile.countsTotalShows,
  ].some((count) => (count ?? 0) > 0);
}

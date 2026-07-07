import type { Id } from "./plotlist/types";

/**
 * The shape of an "up next" / continue-watching item that already carries
 * enough of the next episode in memory to paint the episode sheet before the
 * show page has fetched its season details.
 */
export type EpisodeDeepLinkSource = {
  nextSeasonNumber?: number | null;
  nextEpisodeNumber?: number | null;
  nextEpisodeName?: string | null;
  nextEpisodeStillUrl?: string | null;
  nextEpisodeOverview?: string | null;
  nextEpisodeRuntime?: number | null;
  nextAirDate?: number | null;
};

/**
 * Builds the router params for deep-linking straight into an episode sheet.
 * Beyond `openSeason`/`openEpisode` (which trigger the auto-open effect on the
 * show page) we forward the already-known episode fields so the sheet can open
 * instantly with real content, then upgrade to the full episode once the
 * season details land. Keeps params minimal so the URL stays lean.
 */
export function buildEpisodeDeepLinkParams(
  item: EpisodeDeepLinkSource,
  showId: Id<"shows"> | string,
): { id: string } & Record<string, string> {
  const season = item.nextSeasonNumber ?? 1;
  const episode = item.nextEpisodeNumber ?? 1;
  const params: { id: string } & Record<string, string> = {
    id: String(showId),
    openSeason: String(season),
    openEpisode: String(episode),
  };
  const name = item.nextEpisodeName?.trim();
  if (name) params.epName = name;
  if (item.nextEpisodeStillUrl) params.epStill = item.nextEpisodeStillUrl;
  const overview = item.nextEpisodeOverview?.trim();
  if (overview) params.epOverview = overview;
  if (typeof item.nextEpisodeRuntime === "number" && item.nextEpisodeRuntime > 0) {
    params.epRuntime = String(item.nextEpisodeRuntime);
  }
  if (typeof item.nextAirDate === "number" && Number.isFinite(item.nextAirDate)) {
    params.epAir = String(item.nextAirDate);
  }
  return params;
}

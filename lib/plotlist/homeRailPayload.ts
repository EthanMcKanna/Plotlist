// Wire shape for the home discovery rails (shared by the worker and the
// client's type expectations). The rails render a poster, a title, a year, a
// genre label, and a short signal — so the server projects every home show
// down to exactly the fields the ranking and the cards consume. Overviews,
// language/country metadata, search text, and reasons rode along on every
// item before (~665 B/item vs ~320 B/item), which is what kept the lists
// shallow: deeper lists were a payload problem, not a data problem.

export const HOME_RAIL_SHOW_FIELDS = [
  "_id",
  "showId",
  "externalSource",
  "externalId",
  "title",
  "year",
  "posterUrl",
  "backdropUrl",
  "genreIds",
  "tmdbPopularity",
  "tmdbVoteAverage",
  "tmdbVoteCount",
  "homeSignal",
  "editorialTier",
  "homeScore",
  // Ranking's recency term reads updatedAt; it is a single number.
  "updatedAt",
] as const;

export type HomeRailShow = {
  _id?: string;
  showId?: string;
  externalSource?: string | null;
  externalId?: string | null;
  title: string;
  year?: number | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  genreIds?: number[] | null;
  tmdbPopularity?: number | null;
  tmdbVoteAverage?: number | null;
  tmdbVoteCount?: number | null;
  homeSignal?: string | null;
  editorialTier?: "verified_current" | null;
  homeScore?: number | null;
  updatedAt?: number | null;
};

const HOME_RAIL_SHOW_FIELD_SET = new Set<string>(HOME_RAIL_SHOW_FIELDS);

/**
 * Project a show document (a `shows` row, a TMDB catalog item, or an
 * editorial seed) to the home rail wire shape. Unknown/undefined fields are
 * dropped; null stays null so "no poster" survives the round trip.
 */
export function projectHomeRailShow<T extends { title?: unknown }>(
  show: T | null | undefined,
): HomeRailShow | null {
  if (!show || typeof show !== "object") return null;
  const source = show as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of HOME_RAIL_SHOW_FIELDS) {
    const value = source[field];
    if (value !== undefined) out[field] = value;
  }
  if (typeof out.title !== "string") return null;
  return out as HomeRailShow;
}

/** Project a list of catalog items, dropping anything without a title. */
export function projectHomeRailShows(items: unknown): HomeRailShow[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => projectHomeRailShow(item as { title?: unknown }))
    .filter((item): item is HomeRailShow => item !== null);
}

export type HomeRailRankedItem = {
  _id?: string;
  rank?: number;
  score?: number;
  reviewCount?: number;
  logCount?: number;
  statusCount?: number;
  show: HomeRailShow;
};

/**
 * Project a ranked item (`{ show, rank, score, ... }`) — the shape the
 * trending / personalized / facet rails return. Per-item reasons are
 * dropped: the home cards never render them.
 */
export function projectHomeRailRankedItem(
  item: unknown,
): HomeRailRankedItem | null {
  if (!item || typeof item !== "object") return null;
  const source = item as Record<string, unknown>;
  const show = projectHomeRailShow(source.show as { title?: unknown });
  if (!show) return null;
  const out: HomeRailRankedItem = { show };
  if (typeof source._id === "string") out._id = source._id;
  for (const field of ["rank", "score", "reviewCount", "logCount", "statusCount"] as const) {
    const value = source[field];
    if (typeof value === "number") out[field] = value;
  }
  return out;
}

export function projectHomeRailRankedItems(items: unknown): HomeRailRankedItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .map(projectHomeRailRankedItem)
    .filter((item): item is HomeRailRankedItem => item !== null);
}

/** Whether a value is already narrowed to the rail wire shape. */
export function isHomeRailShowProjection(value: unknown) {
  if (!value || typeof value !== "object") return false;
  return Object.keys(value as Record<string, unknown>).every((key) =>
    HOME_RAIL_SHOW_FIELD_SET.has(key),
  );
}

// TMDB list endpoints page at 20 results. A category deeper than one page
// fetches the following pages in the same refresh so the cached list holds
// enough candidates for the client-side filters to leave a full rail.
export const TMDB_LIST_PAGE_SIZE = 20;

/**
 * Which TMDB pages a list refresh must fetch to serve `limit` items starting
 * at `page`. Always at least the requested page; never more than needed.
 */
export function getTmdbListPageNumbers(page: number, limit: number) {
  const firstPage = Math.max(1, Math.floor(page) || 1);
  const pageCount = Math.max(1, Math.ceil(Math.max(1, limit) / TMDB_LIST_PAGE_SIZE));
  return Array.from({ length: pageCount }, (_, index) => firstPage + index);
}

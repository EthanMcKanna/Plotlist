export type CatalogSearchSurface =
  | "hidden"
  | "discover"
  | "sign-in"
  | "loading"
  | "results"
  | "error"
  | "empty";

export type CatalogSearchViewState = {
  surface: CatalogSearchSurface;
  isBusy: boolean;
  isShowingPreviousResults: boolean;
};

export function getTrimmedSearchQuery(query: string) {
  return query.trim();
}

export type CatalogSortKey = "match" | "popular" | "newest" | "title";

export const CATALOG_SORT_OPTIONS: Array<{ key: CatalogSortKey; label: string }> = [
  { key: "match", label: "Best match" },
  { key: "popular", label: "Popular" },
  { key: "newest", label: "Newest" },
  { key: "title", label: "A–Z" },
];

type SortableCatalogItem = {
  title?: string | null;
  year?: number | null;
  tmdbPopularity?: number | null;
  tmdbVoteCount?: number | null;
};

function readSortNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Sort catalog search results without mutating the source array. "match"
 * preserves the search engine's relevance order; ties everywhere fall back
 * to that same order so sorting is stable.
 */
export function sortCatalogResults<T extends SortableCatalogItem>(
  items: T[],
  sort: CatalogSortKey,
): T[] {
  if (sort === "match") {
    return items;
  }
  const decorated = items.map((item, index) => ({ item, index }));
  decorated.sort((left, right) => {
    if (sort === "popular") {
      return (
        readSortNumber(right.item.tmdbPopularity) - readSortNumber(left.item.tmdbPopularity) ||
        readSortNumber(right.item.tmdbVoteCount) - readSortNumber(left.item.tmdbVoteCount) ||
        left.index - right.index
      );
    }
    if (sort === "newest") {
      return (
        readSortNumber(right.item.year) - readSortNumber(left.item.year) ||
        left.index - right.index
      );
    }
    const leftTitle = (left.item.title ?? "").toLocaleLowerCase();
    const rightTitle = (right.item.title ?? "").toLocaleLowerCase();
    return leftTitle.localeCompare(rightTitle) || left.index - right.index;
  });
  return decorated.map((entry) => entry.item);
}

export function isSearchQueryReady(query: string, minLength: number) {
  return getTrimmedSearchQuery(query).length >= minLength;
}

export function getCatalogSearchViewState({
  mode,
  query,
  debouncedQuery,
  minLength,
  isAuthenticated,
  isSearching,
  resultCount,
  pendingResultCount = resultCount,
  resultsQuery,
  hasError,
}: {
  mode: "shows" | "people";
  query: string;
  debouncedQuery: string;
  minLength: number;
  isAuthenticated: boolean;
  isSearching: boolean;
  resultCount: number;
  /**
   * Live result count when `resultCount` comes from a deferred value. On the
   * frame a search resolves the deferred list still holds the previous
   * (empty) array, so the two counts disagree — that render is busy, not
   * empty.
   */
  pendingResultCount?: number;
  resultsQuery: string;
  hasError: boolean;
}): CatalogSearchViewState {
  const trimmedQuery = getTrimmedSearchQuery(query);
  const trimmedDebouncedQuery = getTrimmedSearchQuery(debouncedQuery);
  const trimmedResultsQuery = getTrimmedSearchQuery(resultsQuery);

  if (mode !== "shows") {
    return {
      surface: "hidden",
      isBusy: false,
      isShowingPreviousResults: false,
    };
  }

  if (trimmedQuery.length < minLength) {
    return {
      surface: "discover",
      isBusy: false,
      isShowingPreviousResults: false,
    };
  }

  if (!isAuthenticated) {
    return {
      surface: "sign-in",
      isBusy: false,
      isShowingPreviousResults: false,
    };
  }

  const isDebouncing = trimmedDebouncedQuery !== trimmedQuery;
  // Results only correspond to the typed query once a search for it has
  // resolved (resultsQuery is set on completion). Until then — including the
  // frame between the debounce firing and the search effect starting — the
  // surface is pending, never "empty". Errors keep resultsQuery stale on
  // purpose, so they bypass this gate.
  const isAwaitingResults = !hasError && trimmedResultsQuery !== trimmedQuery;
  const isDeferringResults = pendingResultCount !== resultCount;
  const isBusy =
    isSearching || isDebouncing || isAwaitingResults || isDeferringResults;
  const hasRenderableResults =
    resultCount > 0 && trimmedResultsQuery.length >= minLength;

  if (hasRenderableResults) {
    return {
      surface: "results",
      isBusy,
      isShowingPreviousResults:
        isBusy || trimmedResultsQuery !== trimmedQuery,
    };
  }

  if (isBusy) {
    return {
      surface: "loading",
      isBusy: true,
      isShowingPreviousResults: false,
    };
  }

  if (hasError) {
    return {
      surface: "error",
      isBusy: false,
      isShowingPreviousResults: false,
    };
  }

  return {
    surface: "empty",
    isBusy: false,
    isShowingPreviousResults: false,
  };
}

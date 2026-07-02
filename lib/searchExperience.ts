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
  const isBusy = isSearching || isDebouncing;
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

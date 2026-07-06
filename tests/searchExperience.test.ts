import { describe, expect, it } from "@jest/globals";

import {
  getCatalogSearchViewState,
  getTrimmedSearchQuery,
  isSearchQueryReady,
  sortCatalogResults,
} from "../lib/searchExperience";

describe("search experience helpers", () => {
  it("keeps short show queries on the discovery surface without threshold copy", () => {
    expect(
      getCatalogSearchViewState({
        mode: "shows",
        query: "se",
        debouncedQuery: "",
        minLength: 3,
        isAuthenticated: true,
        isSearching: false,
        resultCount: 0,
        resultsQuery: "",
        hasError: false,
      }),
    ).toEqual({
      surface: "discover",
      isBusy: false,
      isShowingPreviousResults: false,
    });
  });

  it("shows skeletons only when the first valid query has no settled results", () => {
    expect(
      getCatalogSearchViewState({
        mode: "shows",
        query: "sev",
        debouncedQuery: "se",
        minLength: 3,
        isAuthenticated: true,
        isSearching: false,
        resultCount: 0,
        resultsQuery: "",
        hasError: false,
      }),
    ).toEqual({
      surface: "loading",
      isBusy: true,
      isShowingPreviousResults: false,
    });
  });

  it("keeps previous results mounted while the next query refreshes", () => {
    expect(
      getCatalogSearchViewState({
        mode: "shows",
        query: "severance",
        debouncedQuery: "severa",
        minLength: 3,
        isAuthenticated: true,
        isSearching: true,
        resultCount: 4,
        resultsQuery: "severa",
        hasError: false,
      }),
    ).toEqual({
      surface: "results",
      isBusy: true,
      isShowingPreviousResults: true,
    });
  });

  it("keeps loading between the debounce firing and the search resolving", () => {
    // debouncedQuery has caught up but the search effect hasn't run yet, so
    // isSearching is still false and no results exist for this query. This
    // frame used to flash the empty state.
    expect(
      getCatalogSearchViewState({
        mode: "shows",
        query: "sev",
        debouncedQuery: "sev",
        minLength: 3,
        isAuthenticated: true,
        isSearching: false,
        resultCount: 0,
        resultsQuery: "",
        hasError: false,
      }),
    ).toEqual({
      surface: "loading",
      isBusy: true,
      isShowingPreviousResults: false,
    });
  });

  it("stays loading while deferred results lag behind a resolved search", () => {
    // The search just resolved with items: isSearching flipped false and
    // resultsQuery matches, but the deferred list still holds the previous
    // empty array. This frame used to flash the empty state before results.
    expect(
      getCatalogSearchViewState({
        mode: "shows",
        query: "severance",
        debouncedQuery: "severance",
        minLength: 3,
        isAuthenticated: true,
        isSearching: false,
        resultCount: 0,
        pendingResultCount: 5,
        resultsQuery: "severance",
        hasError: false,
      }),
    ).toEqual({
      surface: "loading",
      isBusy: true,
      isShowingPreviousResults: false,
    });
  });

  it("separates auth and settled empty/error states", () => {
    expect(
      getCatalogSearchViewState({
        mode: "shows",
        query: "pluribus",
        debouncedQuery: "pluribus",
        minLength: 3,
        isAuthenticated: false,
        isSearching: false,
        resultCount: 0,
        resultsQuery: "",
        hasError: false,
      }).surface,
    ).toBe("sign-in");

    expect(
      getCatalogSearchViewState({
        mode: "shows",
        query: "pluribus",
        debouncedQuery: "pluribus",
        minLength: 3,
        isAuthenticated: true,
        isSearching: false,
        resultCount: 0,
        resultsQuery: "pluribus",
        hasError: false,
      }).surface,
    ).toBe("empty");

    expect(
      getCatalogSearchViewState({
        mode: "shows",
        query: "pluribus",
        debouncedQuery: "pluribus",
        minLength: 3,
        isAuthenticated: true,
        isSearching: false,
        resultCount: 0,
        resultsQuery: "pluribus",
        hasError: true,
      }).surface,
    ).toBe("error");
  });

  it("normalizes query readiness around trimmed text", () => {
    expect(getTrimmedSearchQuery("  the bear  ")).toBe("the bear");
    expect(isSearchQueryReady("  se  ", 3)).toBe(false);
    expect(isSearchQueryReady("  sev  ", 3)).toBe(true);
  });
});

describe("sortCatalogResults", () => {
  const results = [
    { title: "Beta", year: 2020, tmdbPopularity: 50, tmdbVoteCount: 100 },
    { title: "alpha", year: 2024, tmdbPopularity: 10, tmdbVoteCount: 900 },
    { title: "Gamma", year: 2022, tmdbPopularity: 80, tmdbVoteCount: 40 },
  ];

  it("keeps relevance order for the default sort and does not mutate input", () => {
    const input = [...results];
    expect(sortCatalogResults(input, "match")).toEqual(results);
    expect(sortCatalogResults(input, "popular")).not.toEqual(results);
    expect(input).toEqual(results);
  });

  it("sorts by popularity, recency, and title", () => {
    expect(sortCatalogResults(results, "popular").map((item) => item.title)).toEqual([
      "Gamma",
      "Beta",
      "alpha",
    ]);
    expect(sortCatalogResults(results, "newest").map((item) => item.title)).toEqual([
      "alpha",
      "Gamma",
      "Beta",
    ]);
    expect(sortCatalogResults(results, "title").map((item) => item.title)).toEqual([
      "alpha",
      "Beta",
      "Gamma",
    ]);
  });

  it("keeps relevance order among items missing sort fields", () => {
    const sparse = [{ title: "One" }, { title: "Two" }, { title: "Three" }];
    expect(sortCatalogResults(sparse, "popular")).toEqual(sparse);
    expect(sortCatalogResults(sparse, "newest")).toEqual(sparse);
  });
});

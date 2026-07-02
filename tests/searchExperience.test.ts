import { describe, expect, it } from "@jest/globals";

import {
  getCatalogSearchViewState,
  getTrimmedSearchQuery,
  isSearchQueryReady,
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

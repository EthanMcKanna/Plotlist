import { describe, expect, it } from "@jest/globals";

import {
  SEARCH_DISCOVER_SECTIONS,
  buildSearchDiscoverSections,
  getDailyDiscoverPage,
  getSearchDiscoverCacheKey,
  getSearchDiscoverFetchPlan,
  getSearchDiscoverSectionsForProviders,
} from "../lib/searchDiscover";

describe("search discovery helpers", () => {
  it("uses a stable daily page rotation for sections that opt in", () => {
    const section = { key: "genre_drama", rotatePages: 5 };
    const day = Date.UTC(2026, 4, 6, 12);

    expect(getDailyDiscoverPage(section, day)).toBe(getDailyDiscoverPage(section, day + 60_000));
    expect(getDailyDiscoverPage(section, day)).toBeGreaterThanOrEqual(1);
    expect(getDailyDiscoverPage(section, day)).toBeLessThanOrEqual(5);
    expect(getDailyDiscoverPage({ key: "trending_day" }, day)).toBe(1);
  });

  it("dedupes shows across rails and filters visually incomplete items", () => {
    const sections = SEARCH_DISCOVER_SECTIONS.slice(0, 2);
    const results = buildSearchDiscoverSections(sections, {
      trending_day: [
        { externalSource: "tmdb", externalId: "1", title: "Shared", posterUrl: "poster.jpg" },
        { externalSource: "tmdb", externalId: "2", title: "No Poster", posterUrl: null },
        { externalSource: "tmdb", externalId: "3", title: "", posterUrl: "poster.jpg" },
      ],
      fresh_premieres: [
        { externalSource: "tmdb", externalId: "1", title: "Shared", posterUrl: "poster.jpg" },
        { externalSource: "tmdb", externalId: "4", title: "Fresh", posterUrl: "fresh.jpg" },
      ],
    });

    expect(results).toHaveLength(2);
    expect(results[0].items.map((item) => item.title)).toEqual(["Shared"]);
    expect(results[1].items.map((item) => item.title)).toEqual(["Fresh"]);
  });

  it("loads current-demand rails before the deeper browse shelf", () => {
    const plan = getSearchDiscoverFetchPlan(SEARCH_DISCOVER_SECTIONS);

    expect(plan.primary.map((section) => section.key)).toEqual([
      "trending_day",
      "fresh_premieres",
      "airing_today",
      "hidden_gems",
      "top_rated",
    ]);
    expect(plan.secondary).toHaveLength(
      SEARCH_DISCOVER_SECTIONS.length - plan.primary.length,
    );
    expect(
      plan.secondary.some((section) =>
        plan.primary.some((primary) => primary.key === section.key),
      ),
    ).toBe(false);
  });

  it("keys the same-day discovery cache by rail rotation pages", () => {
    const first = Date.UTC(2026, 4, 10, 12);
    const sameDay = Date.UTC(2026, 4, 10, 23);
    const nextDay = Date.UTC(2026, 4, 11, 12);

    expect(getSearchDiscoverCacheKey(SEARCH_DISCOVER_SECTIONS, first)).toBe(
      getSearchDiscoverCacheKey(SEARCH_DISCOVER_SECTIONS, sameDay),
    );
    expect(getSearchDiscoverCacheKey(SEARCH_DISCOVER_SECTIONS, first)).not.toBe(
      getSearchDiscoverCacheKey(SEARCH_DISCOVER_SECTIONS, nextDay),
    );
  });

  it("collapses provider rails to the user's streaming services", () => {
    const filtered = getSearchDiscoverSectionsForProviders(SEARCH_DISCOVER_SECTIONS, [
      "hulu",
      "max",
    ]);
    const providerKeys = filtered
      .filter((section) => Boolean(section.logoPath))
      .map((section) => section.key);
    expect(providerKeys).toEqual(["max", "hulu"]);
    // Editorial and genre rails always survive.
    expect(filtered.some((section) => section.key === "trending_day")).toBe(true);
    expect(filtered.some((section) => section.key === "genre_drama")).toBe(true);
  });

  it("keeps every rail when no services are selected or none match", () => {
    expect(getSearchDiscoverSectionsForProviders(SEARCH_DISCOVER_SECTIONS, [])).toEqual(
      SEARCH_DISCOVER_SECTIONS,
    );
    expect(
      getSearchDiscoverSectionsForProviders(SEARCH_DISCOVER_SECTIONS, ["peacock"]),
    ).toEqual(SEARCH_DISCOVER_SECTIONS);
  });
});

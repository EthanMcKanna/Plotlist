import { describe, expect, it } from "@jest/globals";

import {
  getHomepageCatalogDiagnostics,
  getHomepageCatalogItemsByCategory,
  HOMEPAGE_CATALOG_HEALTH_CATEGORIES,
} from "../lib/homepageCatalogHealth";

function item(title: string) {
  return {
    title,
    posterUrl: `https://img.example.com/${title}.jpg`,
    externalSource: "tmdb",
    externalId: title,
  };
}

describe("homepage catalog health payload mapping", () => {
  it("audits every homepage category the live home catalog endpoint returns", () => {
    expect(HOMEPAGE_CATALOG_HEALTH_CATEGORIES.map((entry) => entry.category)).toEqual([
      "trending_day",
      "trending_week",
      "rising_now",
      "breakout_premieres",
      "critics_choice",
      "quick_picks",
      "airing_today",
      "netflix",
      "apple_tv",
      "max",
      "disney_plus",
      "hulu",
      "peacock",
      "prime_video",
      "paramount_plus",
      "mgm_plus",
    ]);
  });

  it("maps batched catalog rails and provider rooms back to category names", () => {
    const byCategory = getHomepageCatalogItemsByCategory({
      trendingDay: [item("Daily One")],
      trendingWeek: [item("Weekly One")],
      risingNow: [item("Rising One")],
      providers: {
        netflix: [item("Netflix One")],
        apple_tv: [item("Apple One")],
      },
    });

    expect(byCategory.get("trending_day")?.map((show) => show.title)).toEqual([
      "Daily One",
    ]);
    expect(byCategory.get("trending_week")?.map((show) => show.title)).toEqual([
      "Weekly One",
    ]);
    expect(byCategory.get("rising_now")?.map((show) => show.title)).toEqual([
      "Rising One",
    ]);
    expect(byCategory.get("netflix")?.map((show) => show.title)).toEqual([
      "Netflix One",
    ]);
    expect(byCategory.get("apple_tv")?.map((show) => show.title)).toEqual([
      "Apple One",
    ]);
    expect(byCategory.get("hulu")).toEqual([]);
    expect(byCategory.get("peacock")).toEqual([]);
    expect(byCategory.get("paramount_plus")).toEqual([]);
    expect(byCategory.get("mgm_plus")).toEqual([]);
  });

  it("normalizes batched catalog diagnostics without trusting malformed entries", () => {
    expect(
      getHomepageCatalogDiagnostics({
        diagnostics: {
          failedCategories: [
            "trending_day",
            " hulu ",
            "trending_day",
            "",
            42,
          ],
          staleCategories: [
            "netflix",
            " netflix ",
            null,
            "prime_video",
          ],
        },
      }),
    ).toEqual({
      failedCategories: ["trending_day", "hulu"],
      staleCategories: ["netflix", "prime_video"],
    });
    expect(getHomepageCatalogDiagnostics({ diagnostics: null })).toEqual({
      failedCategories: [],
      staleCategories: [],
    });
  });
});

import { describe, expect, it } from "@jest/globals";

import {
  getProviderCatalogItemKey,
  getProviderCatalogSignalLabel,
  hasProviderCatalogMore,
  mergeProviderCatalogItems,
  pinProviderCatalogTitle,
  type ProviderCatalogItem,
} from "../lib/providerDiscovery";

function item(title: string, overrides: Partial<ProviderCatalogItem> = {}) {
  return {
    externalSource: "tmdb",
    externalId: title.toLowerCase().replace(/\s+/g, "-"),
    title,
    year: 2026,
    posterUrl: `https://img.example.com/${title}.jpg`,
    ...overrides,
  };
}

describe("provider discovery", () => {
  it("keeps provider destinations useful when live provider pages are empty", () => {
    const shows = mergeProviderCatalogItems({
      providerKey: "apple_tv",
      pages: [[]],
      now: "2026-05-29",
    });

    expect(shows.map((show) => show.title)).toEqual(
      expect.arrayContaining(["Star City", "Widow's Bay"]),
    );
  });

  it("carries niche current-demand provider seeds into provider destinations", () => {
    const shows = mergeProviderCatalogItems({
      providerKey: "mgm_plus",
      pages: [[]],
      now: "2026-05-30",
    });

    expect(shows.map((show) => show.title)).toEqual(["FROM"]);
  });

  it("leads Peacock destinations with its near-term reality tentpole", () => {
    const shows = mergeProviderCatalogItems({
      providerKey: "peacock",
      pages: [[]],
      now: "2026-05-30",
    });

    expect(shows[0]?.title).toBe("Love Island USA");
    expect(getProviderCatalogSignalLabel(shows[0]!)).toBe("Peacock Jun 2");
    expect(shows.map((show) => show.title)).toEqual(["Love Island USA", "M.I.A."]);
  });

  it("leads Netflix destinations with same-week documentary launches when they are fresh", () => {
    const shows = mergeProviderCatalogItems({
      providerKey: "netflix",
      pages: [[]],
      now: "2026-05-30",
    });

    expect(shows[0]?.title).toBe("Rafa");
    expect(getProviderCatalogSignalLabel(shows[0]!)).toBe("Netflix May 29");
    expect(shows.map((show) => show.title)).toEqual(
      expect.arrayContaining([
        "Rafa",
        "Avatar: The Last Airbender",
        "Murder Mindfully",
        "The Boroughs",
      ]),
    );
  });

  it("carries Prime Video's near-term prequel launch into provider destinations", () => {
    const shows = mergeProviderCatalogItems({
      providerKey: "prime_video",
      pages: [[]],
      now: "2026-05-30",
    });

    expect(shows.map((show) => show.title)).toEqual(
      expect.arrayContaining(["The Boys", "Elle", "Spider-Noir"]),
    );
    expect(shows.find((show) => show.title === "Elle")?.homeSignal).toBe("Prime Jul 1");
  });

  it("leads Disney+ destinations with a verified chart-backed premiere", () => {
    const shows = mergeProviderCatalogItems({
      providerKey: "disney_plus",
      pages: [[]],
      now: "2026-05-30",
    });

    expect(shows[0]?.title).toBe("Sofia the First: Royal Magic");
    expect(getProviderCatalogSignalLabel(shows[0]!)).toBe("Disney+ May 25");
    expect(shows.map((show) => show.title)).toEqual(
      expect.arrayContaining([
        "Dragon Striker",
        "Sofia the First: Royal Magic",
        "Best of the World with Antoni Porowski",
        "The Simpsons",
      ]),
    );
  });

  it("promotes same-week Max finales ahead of evergreen Max catalog", () => {
    const shows = mergeProviderCatalogItems({
      providerKey: "max",
      pages: [[]],
      now: "2026-05-30",
    });

    expect(shows[0]?.title).toBe("Hacks");
    expect(getProviderCatalogSignalLabel(shows[0]!)).toBe("Finale May 28");
    expect(shows.map((show) => show.title)).toEqual(
      expect.arrayContaining(["Hacks", "Rick and Morty", "House of the Dragon"]),
    );
  });

  it("carries Hulu finale-week and near-term freshness into provider destinations", () => {
    const shows = mergeProviderCatalogItems({
      providerKey: "hulu",
      pages: [[]],
      now: "2026-05-30",
    });

    expect(shows.slice(0, 2).map((show) => show.title)).toEqual([
      "Deli Boys",
      "Not Suitable for Work",
    ]);
    expect(getProviderCatalogSignalLabel(shows[0]!)).toBe("S2 May 28");
    expect(shows.find((show) => show.title === "The Testaments")?.homeSignal).toBe(
      "Finale May 27",
    );
    expect(shows.find((show) => show.title === "Not Suitable for Work")?.homeSignal).toBe(
      "Hulu Jun 2",
    );
    expect(shows.find((show) => show.title === "The Bear")?.homeSignal).toBe(
      "FX/Hulu Jun 25",
    );
  });

  it("keeps current provider signals display-ready and ignores empty labels", () => {
    expect(
      getProviderCatalogSignalLabel(item("Deli Boys", { homeSignal: " S2 May 28 " })),
    ).toBe("S2 May 28");
    expect(getProviderCatalogSignalLabel(item("Noise", { homeSignal: " " }))).toBeNull();
  });

  it("prioritizes researched provider seeds and dedupes noisy live results", () => {
    const shows = mergeProviderCatalogItems({
      providerKey: "apple_tv",
      pages: [
        [
          item("Star City", { externalId: "duplicate-star" }),
          item("Live Catalog Extra"),
        ],
      ],
      now: "2026-05-29",
    });

    expect(shows[0]?.title).toBe("Star City");
    expect(shows.filter((show) => show.title === "Star City")).toHaveLength(1);
    expect(shows.map((show) => show.title)).toContain("Live Catalog Extra");
  });

  it("pins a featured homepage title to the provider destination", () => {
    const shows = [
      item("Deli Boys"),
      item("The Bear"),
      item("Tracker"),
      item("Abbott Elementary"),
    ];

    expect(pinProviderCatalogTitle(shows, " tracker ").map((show) => show.title)).toEqual([
      "Tracker",
      "Deli Boys",
      "The Bear",
      "Abbott Elementary",
    ]);
    expect(pinProviderCatalogTitle(shows, "Deli Boys")).toBe(shows);
    expect(pinProviderCatalogTitle(shows, "")).toBe(shows);
    expect(pinProviderCatalogTitle(shows, "Missing")).toBe(shows);
  });

  it("falls back to title identity when provider ids are missing", () => {
    expect(getProviderCatalogItemKey({ title: "  Star   City  " })).toBe(
      "title:star city",
    );
  });

  it("treats full provider pages as paginatable", () => {
    expect(hasProviderCatalogMore(Array.from({ length: 20 }, (_, index) => item(`Show ${index}`)))).toBe(
      true,
    );
    expect(hasProviderCatalogMore([item("Only")])).toBe(false);
  });
});

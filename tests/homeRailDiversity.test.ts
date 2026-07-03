import { describe, expect, it } from "@jest/globals";

import {
  appendFreshEditorialTopUpRailItems,
  buildForYouRailCandidates,
  buildFreshRailCandidates,
  buildDistinctOrDemotedRailCandidates,
  buildHeatRailCandidates,
  buildQualityRailCandidates,
  buildDistinctRailCandidates,
  buildProviderSectionsFromCatalog,
  dedupeHomeCandidates,
  getRuntimeHomeEditorialSeedPayload,
  getHomeTitleDiversityKey,
  preferDistinctWhenSubstantial,
} from "../lib/useHomeData";
import {
  getHomeEditorialCurrentDemandSeedItems,
  getHomeEditorialSeedItemsByRationale,
} from "../lib/homeEditorialSeeds";

function item(id: string) {
  return {
    externalSource: "tmdb",
    externalId: id,
    title: `Show ${id}`,
    posterUrl: "poster.jpg",
  };
}

function catalogItem(id: string, overrides = {}) {
  return {
    ...item(id),
    title: `Heat ${id}`,
    year: new Date().getUTCFullYear(),
    backdropUrl: "backdrop.jpg",
    genreIds: [18],
    tmdbPopularity: 100,
    tmdbVoteAverage: 8,
    tmdbVoteCount: 120,
    ...overrides,
  };
}

function railItem(title: string) {
  return {
    key: `rail:${title}`,
    title,
    posterUrl: "poster.jpg",
  };
}

describe("home rail diversity", () => {
  it("dedupes title repeats that arrive from different catalog sources", () => {
    const picked = dedupeHomeCandidates([
      { ...item("internal-euphoria"), title: "Euphoria" },
      { ...item("tmdb-euphoria"), title: "Euphoria" },
      item("fresh-1"),
    ]);

    expect(picked.map((show) => show.externalId)).toEqual([
      "internal-euphoria",
      "fresh-1",
    ]);
  });

  it("keeps fully distinct rails when enough unseen titles are available", () => {
    const picked = preferDistinctWhenSubstantial(
      [item("seen-1"), item("fresh-1"), item("fresh-2"), item("fresh-3"), item("fresh-4")],
      new Set(["tmdb:seen-1"]),
    );

    expect(picked.map((show) => show.externalId)).toEqual([
      "fresh-1",
      "fresh-2",
      "fresh-3",
      "fresh-4",
    ]);
  });

  it("front-loads unseen titles before using cross-rail repeats as top-up", () => {
    const picked = preferDistinctWhenSubstantial(
      [item("seen-1"), item("fresh-1"), item("seen-2"), item("fresh-2")],
      new Set(["tmdb:seen-1", "tmdb:seen-2"]),
    );

    expect(picked.map((show) => show.externalId)).toEqual([
      "fresh-1",
      "fresh-2",
      "seen-1",
      "seen-2",
    ]);
  });

  it("treats matching titles as repeats even when source ids differ", () => {
    const picked = preferDistinctWhenSubstantial(
      [
        { ...item("tmdb-euphoria"), title: "Euphoria" },
        item("fresh-1"),
        { ...item("internal-euphoria"), title: "Euphoria" },
      ],
      new Set([getHomeTitleDiversityKey("Euphoria")!]),
    );

    expect(picked.map((show) => show.externalId)).toEqual([
      "fresh-1",
      "tmdb-euphoria",
      "internal-euphoria",
    ]);
  });

  it("pads weak rails with unseen fallback titles before repeating earlier shelves", () => {
    const picked = buildDistinctRailCandidates(
      [
        { ...item("seen-1"), title: "FROM" },
        { ...item("seen-2"), title: "Severance" },
      ],
      new Set([getHomeTitleDiversityKey("FROM")!, getHomeTitleDiversityKey("Severance")!]),
      [item("fresh-1"), item("fresh-2"), item("fresh-3"), item("fresh-4")],
    );

    expect(picked.map((show) => show.externalId)).toEqual([
      "fresh-1",
      "fresh-2",
      "fresh-3",
      "fresh-4",
    ]);
  });

  it("does not render a rail when it cannot find enough distinct titles", () => {
    const picked = buildDistinctRailCandidates(
      [
        { ...item("seen-1"), title: "FROM" },
        { ...item("seen-2"), title: "Severance" },
      ],
      new Set([getHomeTitleDiversityKey("FROM")!, getHomeTitleDiversityKey("Severance")!]),
      [item("fresh-1")],
    );

    expect(picked).toEqual([]);
  });

  it("can keep a downstream shelf alive by demoting already-previewed titles", () => {
    const picked = buildDistinctOrDemotedRailCandidates(
      [
        { ...item("seen-1"), title: "FROM" },
        { ...item("seen-2"), title: "Severance" },
        item("fresh-1"),
      ],
      new Set([getHomeTitleDiversityKey("FROM")!, getHomeTitleDiversityKey("Severance")!]),
      [item("fresh-2")],
    );

    expect(picked.map((show) => show.title)).toEqual([
      "Show fresh-1",
      "Show fresh-2",
      "FROM",
      "Severance",
    ]);
  });

  it("uses daily trending to keep heat alive without repeating earlier shelves", () => {
    const picked = buildHeatRailCandidates({
      trending: [],
      dailyTrending: [
        catalogItem("daily-1"),
        catalogItem("daily-2"),
        catalogItem("daily-3"),
        catalogItem("daily-4"),
      ],
      rising: [
        catalogItem("seen-1", { title: "FROM" }),
        catalogItem("seen-2", { title: "Severance" }),
      ],
      weeklyTrending: [],
      curatedDemand: [],
      heroSlides: [],
      forYou: [railItem("FROM"), railItem("Severance")],
    });

    expect(picked.map((show) => show.externalId)).toEqual([
      "daily-1",
      "daily-2",
      "daily-3",
      "daily-4",
    ]);
  });

  it("keeps heat hidden when live sources only repeat earlier shelves", () => {
    const picked = buildHeatRailCandidates({
      trending: [catalogItem("seen-1", { title: "FROM" })],
      dailyTrending: [catalogItem("seen-2", { title: "Severance" })],
      rising: [],
      weeklyTrending: [],
      curatedDemand: [],
      heroSlides: [],
      forYou: [railItem("FROM"), railItem("Severance")],
    });

    expect(picked).toEqual([]);
  });

  it("uses curated current-demand fallback when live heat sources are echoed", () => {
    const picked = buildHeatRailCandidates({
      trending: [catalogItem("seen-1", { title: "FROM" })],
      dailyTrending: [catalogItem("seen-2", { title: "Severance" })],
      rising: [],
      weeklyTrending: [],
      curatedDemand: [
        catalogItem("demand-1"),
        catalogItem("demand-2"),
        catalogItem("demand-3"),
        catalogItem("demand-4"),
      ],
      heroSlides: [],
      forYou: [railItem("FROM"), railItem("Severance")],
    });

    expect(picked.map((show) => show.externalId)).toEqual([
      "demand-1",
      "demand-2",
      "demand-3",
      "demand-4",
    ]);
  });

  it("weaves available current editorial returns into a substantial heat rail", () => {
    const picked = buildHeatRailCandidates({
      trending: [
        catalogItem("live-1", { title: "Live One", tmdbPopularity: 90 }),
        catalogItem("live-2", { title: "Live Two", tmdbPopularity: 80 }),
        catalogItem("live-3", { title: "Live Three", tmdbPopularity: 70 }),
        catalogItem("live-4", { title: "Live Four", tmdbPopularity: 60 }),
      ],
      dailyTrending: [],
      rising: [],
      weeklyTrending: [],
      curatedDemand: [
        catalogItem("returning-1", {
          title: "Returning One",
          year: 2022,
          homeSignal: "Returns Jun 21",
          tmdbPopularity: 75,
          tmdbVoteAverage: 8.2,
          tmdbVoteCount: 900,
        }),
        catalogItem("returning-2", {
          title: "Returning Two",
          year: 2013,
          homeSignal: "S9 airing now",
          tmdbPopularity: 95,
          tmdbVoteAverage: 8.5,
          tmdbVoteCount: 1200,
        }),
        catalogItem("old-unsignaled", {
          title: "Old Unsignaled",
          year: 2011,
          tmdbPopularity: 200,
          tmdbVoteAverage: 8.8,
          tmdbVoteCount: 5000,
        }),
      ],
      heroSlides: [],
      forYou: [],
      now: "2026-05-30T12:00:00.000Z",
    });

    const pickedIds = picked.map((show) => show.externalId);
    expect(pickedIds[0]).toBe("returning-2");
    expect(pickedIds.slice(1, 3)).toEqual(["live-1", "live-2"]);
    expect(pickedIds).not.toContain("returning-1");
    expect(pickedIds).not.toContain("old-unsignaled");
  });

  it("keeps future-only release announcements out of the happening-now heat rail", () => {
    const picked = buildHeatRailCandidates({
      trending: [],
      dailyTrending: [],
      rising: [],
      weeklyTrending: [],
      curatedDemand: [
        catalogItem("future-apple", {
          title: "Future Apple Premiere",
          homeSignal: "Apple TV+ Jun 5",
          tmdbPopularity: 200,
          tmdbVoteAverage: 8.6,
          tmdbVoteCount: 600,
        }),
        catalogItem("near-future-hulu", {
          title: "Near Future Hulu Return",
          homeSignal: "Hulu Jun 2",
          tmdbPopularity: 180,
          tmdbVoteAverage: 8.3,
          tmdbVoteCount: 500,
        }),
        catalogItem("today-apple", {
          title: "Today Apple Launch",
          homeSignal: "Apple TV+ May 29",
          tmdbPopularity: 80,
          tmdbVoteAverage: 7.6,
          tmdbVoteCount: 200,
        }),
        catalogItem("yesterday-hulu", {
          title: "Yesterday Hulu Return",
          homeSignal: "S2 May 28",
          tmdbPopularity: 90,
          tmdbVoteAverage: 7.8,
          tmdbVoteCount: 300,
        }),
        catalogItem("live-now", {
          title: "Live Now Return",
          homeSignal: "S3 airing now",
          tmdbPopularity: 120,
          tmdbVoteAverage: 8.1,
          tmdbVoteCount: 700,
        }),
        catalogItem("chart-only", {
          title: "Chart Only Breakout",
          homeSignal: "Netflix Top 10",
          tmdbPopularity: 100,
          tmdbVoteAverage: 7.9,
          tmdbVoteCount: 450,
        }),
      ],
      heroSlides: [],
      forYou: [],
      now: "2026-05-30T12:00:00.000Z",
    });

    expect(picked.map((show) => show.externalId)).toEqual(
      expect.arrayContaining([
        "today-apple",
        "yesterday-hulu",
        "live-now",
        "chart-only",
      ]),
    );
    expect(picked.map((show) => show.externalId)).not.toEqual(
      expect.arrayContaining(["future-apple", "near-future-hulu"]),
    );
  });

  it("orders happening-now editorial demand by live and near-week signals before stale dated filler", () => {
    const picked = buildHeatRailCandidates({
      trending: [],
      dailyTrending: [],
      rising: [],
      weeklyTrending: [],
      curatedDemand: [
        catalogItem("lord", {
          title: "Lord of the Flies",
          year: 2026,
          homeSignal: "Netflix May 4",
          tmdbPopularity: 40,
          tmdbVoteAverage: 7.6,
          tmdbVoteCount: 200,
        }),
        catalogItem("legends", {
          title: "Legends",
          year: 2026,
          homeSignal: "Netflix May 7",
          tmdbPopularity: 70,
          tmdbVoteAverage: 7.9,
          tmdbVoteCount: 300,
        }),
        catalogItem("good-girl", {
          title: "A Good Girl's Guide to Murder",
          year: 2024,
          homeSignal: "S2 May 27",
          tmdbPopularity: 45,
          tmdbVoteAverage: 7.4,
          tmdbVoteCount: 300,
        }),
        catalogItem("four-seasons", {
          title: "The Four Seasons",
          year: 2025,
          homeSignal: "S2 May 28",
          tmdbPopularity: 12,
          tmdbVoteAverage: 6.6,
          tmdbVoteCount: 136,
        }),
        catalogItem("rick", {
          title: "Rick and Morty",
          year: 2013,
          homeSignal: "S9 airing now",
          tmdbPopularity: 160,
          tmdbVoteAverage: 8.7,
          tmdbVoteCount: 10000,
        }),
        catalogItem("nemesis", {
          title: "Nemesis",
          year: 2026,
          homeSignal: "Chart mover",
          tmdbPopularity: 80,
          tmdbVoteAverage: 7.1,
          tmdbVoteCount: 120,
        }),
      ],
      heroSlides: [],
      forYou: [],
      now: "2026-05-29T12:00:00.000Z",
    });

    expect(new Set(picked.map((show) => show.externalId).slice(0, 2))).toEqual(
      new Set(["rick", "four-seasons"]),
    );
    expect(picked.map((show) => show.externalId).slice(2, 4)).toEqual([
      "good-girl",
      "nemesis",
    ]);
    expect(picked.map((show) => show.externalId).indexOf("lord")).toBeGreaterThan(3);
    expect(picked.map((show) => show.externalId).indexOf("legends")).toBeGreaterThan(3);
  });

  it("keeps runtime heat seeded from all active current-demand editorial groups", () => {
    const curatedDemand = getHomeEditorialCurrentDemandSeedItems(
      "2026-05-30T12:00:00.000Z",
    );
    const picked = buildHeatRailCandidates({
      trending: [],
      dailyTrending: [],
      rising: [],
      weeklyTrending: [],
      curatedDemand,
      heroSlides: [
        { key: "tmdb:220102", title: "Spider-Noir", eyebrow: "fresh" },
        { key: "tmdb:243316", title: "The Four Seasons", eyebrow: "fresh" },
        { key: "tmdb:252107", title: "Star City", eyebrow: "fresh" },
      ],
      forYou: [],
      now: "2026-05-30T12:00:00.000Z",
    });

    expect(curatedDemand.map((show) => show.title)).toContain("Hacks");
    expect(picked.map((show) => show.title)).toEqual(
      expect.arrayContaining(["Hacks", "The Boroughs", "Widow's Bay"]),
    );
  });

  it("refreshes runtime editorial seed payloads from active review windows", () => {
    const mayPayload = getRuntimeHomeEditorialSeedPayload(
      "2026-05-30T12:00:00.000Z",
    );
    const mayCurrentDemandTitles = mayPayload.currentDemandSeeds.map(
      (show) => show.title,
    );
    const mayNewOrBackTitles = mayPayload.newOrBackSeeds.map((show) => show.title);

    expect(mayCurrentDemandTitles).toContain("Hacks");
    expect(mayNewOrBackTitles).toEqual(
      expect.arrayContaining(["Hacks", "Dragon Striker"]),
    );

    const afterReviewPayload = getRuntimeHomeEditorialSeedPayload(
      "2026-07-13T00:00:00.000Z",
    );

    expect(afterReviewPayload.currentDemandSeeds.map((show) => show.title)).not.toContain(
      "Hacks",
    );
    expect(afterReviewPayload.newOrBackSeeds).toEqual([]);
    expect(afterReviewPayload.qualitySeeds.length).toBeGreaterThan(0);
    expect(afterReviewPayload.quickSeeds.length).toBeGreaterThan(0);
  });

  it("keeps looking for explicit current heat when earlier current picks are previewed", () => {
    const picked = buildHeatRailCandidates({
      trending: [
        catalogItem("live-1", { title: "Live One", tmdbPopularity: 180 }),
        catalogItem("live-2", { title: "Live Two", tmdbPopularity: 160 }),
        catalogItem("live-3", { title: "Live Three", tmdbPopularity: 140 }),
        catalogItem("live-4", { title: "Live Four", tmdbPopularity: 120 }),
      ],
      dailyTrending: [],
      rising: [],
      weeklyTrending: [],
      curatedDemand: [
        catalogItem("previewed-1", {
          title: "Previewed One",
          year: 2013,
          homeSignal: "S9 airing now",
          tmdbPopularity: 100,
          tmdbVoteAverage: 8.5,
          tmdbVoteCount: 1200,
        }),
        catalogItem("previewed-2", {
          title: "Previewed Two",
          year: 2024,
          homeSignal: "S2 May 27",
          tmdbPopularity: 90,
          tmdbVoteAverage: 7.8,
          tmdbVoteCount: 400,
        }),
        catalogItem("still-current", {
          title: "Still Current",
          year: 2025,
          homeSignal: "S2 May 28",
          tmdbPopularity: 80,
          tmdbVoteAverage: 7.7,
          tmdbVoteCount: 300,
        }),
        catalogItem("also-current", {
          title: "Also Current",
          year: 2026,
          homeSignal: "Netflix May 29",
          tmdbPopularity: 70,
          tmdbVoteAverage: 7.6,
          tmdbVoteCount: 200,
        }),
      ],
      heroSlides: [],
      forYou: [railItem("Previewed One"), railItem("Previewed Two")],
    });

    expect(new Set(picked.map((show) => show.externalId).slice(0, 2))).toEqual(
      new Set(["still-current", "also-current"]),
    );
  });

  it("keeps low-confidence live catalog noise out of top heat positions", () => {
    const picked = buildHeatRailCandidates({
      trending: [
        catalogItem("tiny-sample", {
          title: "Tiny Sample Breakout",
          year: 2026,
          tmdbPopularity: 700,
          tmdbVoteAverage: 10,
          tmdbVoteCount: 9,
        }),
        catalogItem("live-1", {
          title: "Confident Live One",
          tmdbPopularity: 180,
          tmdbVoteAverage: 7.9,
          tmdbVoteCount: 800,
        }),
        catalogItem("live-2", {
          title: "Confident Live Two",
          tmdbPopularity: 160,
          tmdbVoteAverage: 8.1,
          tmdbVoteCount: 900,
        }),
        catalogItem("live-3", {
          title: "Confident Live Three",
          tmdbPopularity: 140,
          tmdbVoteAverage: 7.8,
          tmdbVoteCount: 700,
        }),
        catalogItem("live-4", {
          title: "Confident Live Four",
          tmdbPopularity: 120,
          tmdbVoteAverage: 7.7,
          tmdbVoteCount: 600,
        }),
      ],
      dailyTrending: [],
      rising: [],
      weeklyTrending: [],
      curatedDemand: [],
      heroSlides: [],
      forYou: [],
    });

    const pickedIds = picked.map((show) => show.externalId);
    expect(new Set(pickedIds)).toEqual(
      new Set(["live-1", "live-2", "live-3", "live-4"]),
    );
    expect(pickedIds).not.toContain("tiny-sample");
  });

  it("admits source-verified current returns into provider rooms without relaxing raw catalog noise", () => {
    const rooms = buildProviderSectionsFromCatalog(
      {
        hulu: [
          catalogItem("raw-1", { title: "Reliable Hulu One", tmdbVoteCount: 220 }),
          catalogItem("raw-2", { title: "Reliable Hulu Two", tmdbVoteCount: 220 }),
          catalogItem("raw-3", { title: "Reliable Hulu Three", tmdbVoteCount: 220 }),
          catalogItem("raw-noise", {
            title: "Unproven Raw Hulu",
            tmdbPopularity: 700,
            tmdbVoteAverage: 10,
            tmdbVoteCount: 4,
          }),
        ],
      },
      { now: "2026-05-28" },
    );

    const hulu = rooms.find((room) => room.key === "hulu");
    const titles = hulu?.items.map((show) => show.title) ?? [];

    expect(titles).toContain("Deli Boys");
    expect(titles).not.toContain("Unproven Raw Hulu");
  });

  it("suppresses episode-like TMDB rows that leak into TV provider lists", () => {
    const picked = buildHeatRailCandidates({
      trending: [
        catalogItem("berlin-episode", {
          title: "Berlin and the Lady with an Ermine",
          year: 2026,
          tmdbPopularity: 248.8,
          tmdbVoteAverage: 8.4,
          tmdbVoteCount: 106,
        }),
        catalogItem("live-1", {
          title: "Confident Live One",
          tmdbPopularity: 180,
          tmdbVoteAverage: 7.9,
          tmdbVoteCount: 800,
        }),
        catalogItem("live-2", {
          title: "Confident Live Two",
          tmdbPopularity: 160,
          tmdbVoteAverage: 8.1,
          tmdbVoteCount: 900,
        }),
        catalogItem("live-3", {
          title: "Confident Live Three",
          tmdbPopularity: 140,
          tmdbVoteAverage: 7.8,
          tmdbVoteCount: 700,
        }),
        catalogItem("live-4", {
          title: "Confident Live Four",
          tmdbPopularity: 120,
          tmdbVoteAverage: 7.7,
          tmdbVoteCount: 600,
        }),
      ],
      dailyTrending: [],
      rising: [],
      weeklyTrending: [],
      curatedDemand: [],
      heroSlides: [],
      forYou: [],
    });

    const pickedIds = picked.map((show) => show.externalId);
    expect(new Set(pickedIds)).toEqual(
      new Set(["live-1", "live-2", "live-3", "live-4"]),
    );
    expect(pickedIds).not.toContain("berlin-episode");
  });

  it("keeps the fresh rail current instead of padding it with older quality picks", () => {
    const picked = buildFreshRailCandidates({
      curatedNewOrBack: [
        catalogItem("current-1", { title: "Current One", year: 2026 }),
        catalogItem("current-2", { title: "Current Two", year: 2026 }),
        catalogItem("current-3", { title: "Current Three", year: 2026 }),
        catalogItem("returning-1", {
          title: "Returning One",
          year: 2022,
          homeSignal: "Returns Jun 21",
          tmdbVoteAverage: 8.2,
          tmdbVoteCount: 900,
        }),
      ],
      premieres: [],
      airing: [],
      rising: [
        catalogItem("old-quality", {
          title: "Older Quality",
          year: 2025,
          tmdbPopularity: 500,
          tmdbVoteAverage: 8.8,
          tmdbVoteCount: 3000,
        }),
      ],
      weeklyTrending: [],
      trending: [],
      forYou: [],
      heroSlides: [],
    });

    expect(new Set(picked.map((show) => show.externalId))).toEqual(
      new Set(["current-1", "current-2", "current-3", "returning-1"]),
    );
    expect(picked.map((show) => show.externalId)).not.toContain("old-quality");
  });

  it("keeps chart-only demand in heat instead of leading the fresh rail", () => {
    const picked = buildFreshRailCandidates({
      curatedNewOrBack: [
        catalogItem("chart", {
          title: "Chart Only",
          year: 2026,
          homeSignal: "Chart mover",
          tmdbPopularity: 400,
          tmdbVoteAverage: 8.1,
          tmdbVoteCount: 700,
        }),
        catalogItem("netflix", {
          title: "Netflix Return",
          year: 2026,
          homeSignal: "Netflix May 4",
        }),
        catalogItem("season", {
          title: "Season Return",
          year: 2025,
          homeSignal: "S2 May 28",
        }),
        catalogItem("apple", {
          title: "Apple Launch",
          year: 2026,
          homeSignal: "Apple TV+ May 29",
        }),
        catalogItem("prime", {
          title: "Prime Launch",
          year: 2026,
          homeSignal: "Prime May 27",
        }),
      ],
      premieres: [],
      airing: [],
      rising: [],
      weeklyTrending: [],
      trending: [],
      forYou: [],
      heroSlides: [],
      now: "2026-05-29T19:00:00.000Z",
    });

    expect(picked.map((show) => show.externalId)).toEqual([
      "apple",
      "season",
      "prime",
      "netflix",
    ]);
  });

  it("orders the fresh rail by actual release proximity before older or far-future announcements", () => {
    const picked = buildFreshRailCandidates({
      curatedNewOrBack: [
        catalogItem("older", {
          title: "Older May Launch",
          homeSignal: "Netflix May 4",
          tmdbPopularity: 900,
          tmdbVoteAverage: 9.1,
          tmdbVoteCount: 4000,
        }),
        catalogItem("future", {
          title: "Future Tentpole",
          year: 2022,
          homeSignal: "Returns Jun 21",
          tmdbPopularity: 800,
          tmdbVoteAverage: 8.7,
          tmdbVoteCount: 5000,
        }),
        catalogItem("today", {
          title: "Today Launch",
          homeSignal: "Apple TV+ May 29",
          tmdbPopularity: 18,
          tmdbVoteAverage: 0,
          tmdbVoteCount: 0,
        }),
        catalogItem("yesterday", {
          title: "Yesterday Return",
          homeSignal: "S2 May 28",
          tmdbPopularity: 30,
          tmdbVoteAverage: 6.8,
          tmdbVoteCount: 40,
        }),
        catalogItem("two-days-ago", {
          title: "Two Days Ago",
          homeSignal: "Prime May 27",
          tmdbPopularity: 24,
          tmdbVoteAverage: 6.9,
          tmdbVoteCount: 35,
        }),
      ],
      premieres: [],
      airing: [],
      rising: [],
      weeklyTrending: [],
      trending: [],
      forYou: [],
      heroSlides: [],
      now: "2026-05-29T19:00:00.000Z",
    });

    expect(picked.map((show) => show.externalId)).toEqual([
      "today",
      "yesterday",
      "two-days-ago",
      "future",
      "older",
    ]);
  });

  it("keeps fresh substantial when the strongest release-window titles also appear in the hero", () => {
    const picked = buildFreshRailCandidates({
      curatedNewOrBack: [
        catalogItem("hero-1", {
          title: "Hero One",
          homeSignal: "Netflix May 4",
        }),
        catalogItem("hero-2", {
          title: "Hero Two",
          homeSignal: "Prime May 13",
        }),
        catalogItem("hero-3", {
          title: "Hero Three",
          homeSignal: "Apple TV+ May 29",
        }),
        catalogItem("fresh-1", {
          title: "Fresh One",
          homeSignal: "S2 May 28",
        }),
      ],
      premieres: [],
      airing: [],
      rising: [],
      weeklyTrending: [],
      trending: [],
      forYou: [],
      heroSlides: [
        { key: "tmdb:hero-1", title: "Hero One", eyebrow: "fresh" },
        { key: "tmdb:hero-2", title: "Hero Two", eyebrow: "fresh" },
        { key: "tmdb:hero-3", title: "Hero Three", eyebrow: "fresh" },
      ],
    });

    expect(new Set(picked.map((show) => show.externalId))).toEqual(
      new Set(["hero-1", "hero-2", "hero-3", "fresh-1"]),
    );
  });

  it("builds a deep May 2026 fresh rail from researched editorial seeds", () => {
    const currentDemand = getHomeEditorialSeedItemsByRationale(
      "newOrBack",
      "current_demand",
      "2026-05-28T19:00:00.000Z",
    );
    const premiereCalendar = getHomeEditorialSeedItemsByRationale(
      "newOrBack",
      "premiere_calendar",
      "2026-05-28T19:00:00.000Z",
    );

    const picked = buildFreshRailCandidates({
      curatedNewOrBack: [...currentDemand, ...premiereCalendar],
      premieres: [],
      airing: [],
      rising: [],
      weeklyTrending: [],
      trending: [],
      forYou: [],
      heroSlides: [
        { key: "tmdb:273240", title: "Off Campus", eyebrow: "fresh" },
        { key: "tmdb:299167", title: "Dutton Ranch", eyebrow: "fresh" },
        { key: "tmdb:220102", title: "Spider-Noir", eyebrow: "fresh" },
        { key: "tmdb:94997", title: "House of the Dragon", eyebrow: "fresh" },
      ],
    });

    expect(picked.length).toBeGreaterThanOrEqual(8);
    expect(picked.map((show) => show.title)).toEqual(
      expect.arrayContaining([
        "Rick and Morty",
        "Star City",
        "The Four Seasons",
        "I Will Find You",
        "Deli Boys",
        "The Bear",
      ]),
    );
    expect(picked.map((show) => show.title)).not.toContain("Nemesis");
  });

  it("keeps chart-only editorial demand out of fresh top-up", () => {
    const picked = appendFreshEditorialTopUpRailItems(
      [{ ...railItem("Already Fresh"), signal: "Apple TV+ May 29" }],
      [
        catalogItem("chart", {
          title: "Chart Only",
          homeSignal: "Chart mover",
        }),
        catalogItem("release", {
          title: "Release Window",
          homeSignal: "Netflix May 4",
        }),
        catalogItem("season", {
          title: "Season Return",
          year: 2025,
          homeSignal: "S2 May 28",
        }),
      ],
      "2026-05-29T19:00:00.000Z",
    );

    expect(picked.map((show) => show.title)).toEqual([
      "Already Fresh",
      "Season Return",
      "Release Window",
    ]);
  });

  it("re-sorts editorial fresh top-up so old primary rows do not lead", () => {
    const picked = appendFreshEditorialTopUpRailItems(
      [{ ...railItem("Older Primary"), signal: "Apple TV+ Apr 29" }],
      [
        catalogItem("today", {
          title: "Today Top-up",
          homeSignal: "Netflix May 29",
        }),
        catalogItem("yesterday", {
          title: "Yesterday Top-up",
          homeSignal: "S2 May 28",
        }),
      ],
      "2026-05-29T19:00:00.000Z",
    );

    expect(picked.map((show) => show.title)).toEqual([
      "Today Top-up",
      "Yesterday Top-up",
      "Older Primary",
    ]);
  });

  it("keeps stale prestige catalog hits out when enough recent quality exists", () => {
    const picked = buildQualityRailCandidates({
      critics: [
        catalogItem("euphoria", {
          title: "Euphoria",
          year: 2019,
          tmdbPopularity: 180,
          tmdbVoteAverage: 8.3,
          tmdbVoteCount: 3600,
        }),
        catalogItem("pitt", {
          title: "The Pitt",
          year: 2025,
          tmdbPopularity: 70,
          tmdbVoteAverage: 8.7,
          tmdbVoteCount: 754,
        }),
        catalogItem("andor", {
          title: "Andor",
          year: 2022,
          tmdbPopularity: 38,
          tmdbVoteAverage: 8.3,
          tmdbVoteCount: 2019,
        }),
        catalogItem("slow-horses", {
          title: "Slow Horses",
          year: 2022,
          tmdbPopularity: 32,
          tmdbVoteAverage: 8,
          tmdbVoteCount: 849,
        }),
        catalogItem("bear", {
          title: "The Bear",
          year: 2022,
          tmdbPopularity: 36,
          tmdbVoteAverage: 8.2,
          tmdbVoteCount: 1713,
        }),
      ],
      qualitySeeds: [],
      weeklyTrending: [],
      rising: [],
      premieres: [],
      trending: [],
      forYouRaw: [],
      heroSlides: [],
      seenRails: [],
    });

    const titles = picked.map((show) => show.title);
    expect(titles).toEqual(
      expect.arrayContaining(["The Pitt", "Andor", "Slow Horses", "The Bear"]),
    );
    expect(titles).not.toContain("Euphoria");
  });

  it("keeps a quality shelf visible after curated modules preview the strongest titles", () => {
    const picked = buildQualityRailCandidates({
      critics: [],
      qualitySeeds: [
        catalogItem("seen-1", { title: "Severance", tmdbPopularity: 30 }),
        catalogItem("seen-2", { title: "Andor", tmdbPopularity: 28 }),
        catalogItem("seen-3", { title: "Slow Horses", tmdbPopularity: 26 }),
        catalogItem("unseen", { title: "The Pitt", tmdbPopularity: 90 }),
      ],
      weeklyTrending: [],
      rising: [],
      premieres: [],
      trending: [],
      forYouRaw: [],
      heroSlides: [],
      seenRails: [
        railItem("Severance"),
        railItem("Andor"),
        railItem("Slow Horses"),
      ],
    });

    expect(picked).toHaveLength(4);
    expect(picked[0].title).toBe("The Pitt");
    expect(picked.map((show) => show.title)).toEqual(
      expect.arrayContaining(["Severance", "Andor", "Slow Horses"]),
    );
  });

  it("does not dilute a substantial personal shelf with generic discovery fallback", () => {
    const picked = buildForYouRailCandidates({
      forYou: [
        catalogItem("personal-1"),
        catalogItem("personal-2"),
        catalogItem("personal-3"),
        catalogItem("personal-4"),
      ],
      fallback: [
        catalogItem("generic-1"),
        catalogItem("generic-2"),
        catalogItem("generic-3"),
        catalogItem("generic-4"),
      ],
      heroSlides: [],
    });

    expect(picked.map((show) => show.externalId)).toEqual([
      "personal-1",
      "personal-2",
      "personal-3",
      "personal-4",
    ]);
  });

  it("uses the supplied homepage year for personal rail recency floors", () => {
    const returningShows = [
      catalogItem("returning-1", { year: 2022, homeSignal: "S4 airing now" }),
      catalogItem("returning-2", { year: 2022, homeSignal: "S3 airing now" }),
      catalogItem("returning-3", { year: 2022, homeSignal: "S2 airing now" }),
      catalogItem("returning-4", { year: 2022, homeSignal: "S5 airing now" }),
    ];

    expect(
      buildForYouRailCandidates({
        forYou: returningShows,
        fallback: [],
        heroSlides: [],
        now: "2026-05-30T12:00:00.000Z",
      }).map((show) => show.externalId),
    ).toEqual(["returning-1", "returning-2", "returning-3", "returning-4"]);
    expect(
      buildForYouRailCandidates({
        forYou: returningShows,
        fallback: [],
        heroSlides: [],
        now: "2030-05-30T12:00:00.000Z",
      }),
    ).toEqual([]);
  });

  it("uses discovery fallback only when the personal shelf is too thin", () => {
    const picked = buildForYouRailCandidates({
      forYou: [catalogItem("personal-1"), catalogItem("personal-2")],
      fallback: [
        catalogItem("generic-1"),
        catalogItem("generic-2"),
        catalogItem("generic-3"),
        catalogItem("generic-4"),
      ],
      heroSlides: [],
    });

    expect(picked.map((show) => show.externalId)).toEqual([
      "personal-1",
      "personal-2",
      "generic-1",
      "generic-2",
      "generic-3",
      "generic-4",
    ]);
  });

  it("keeps chart-only demand out of the personal shelf when stronger alternatives exist", () => {
    const picked = buildForYouRailCandidates({
      forYou: [
        catalogItem("personal-1"),
        catalogItem("chart-only", {
          title: "Chart Only",
          homeSignal: "Chart mover",
        }),
      ],
      fallback: [
        catalogItem("fallback-1"),
        catalogItem("fallback-2"),
        catalogItem("fallback-3"),
        catalogItem("fallback-4"),
      ],
      heroSlides: [],
    });

    expect(picked.map((show) => show.externalId)).toEqual([
      "personal-1",
      "fallback-1",
      "fallback-2",
      "fallback-3",
      "fallback-4",
    ]);
  });
});

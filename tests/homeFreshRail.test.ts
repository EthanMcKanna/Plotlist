import { describe, expect, it } from "@jest/globals";

import {
  buildFreshRailRoomTopUpItems,
  buildVisibleFreshRailItems,
} from "../lib/homeFreshRail";
import { getHomeRailIdentitySet } from "../lib/homeRailIdentity";

function item(
  key: string,
  title: string,
  signal: string,
  homeScore = 100,
) {
  return {
    key,
    title,
    signal,
    homeScore,
  };
}

describe("visible home fresh rail", () => {
  it("keeps opening repeats behind distinct current release-window titles", () => {
    const precedingItems = [
      item("hero-star", "Star City", "Apple TV+ May 29"),
      item("brief-four", "The Four Seasons", "S2 May 28"),
      item("brief-deli", "Deli Boys", "S2 May 28"),
      item("continue-boys", "The Boys", "S5 airing now"),
    ];
    const visible = buildVisibleFreshRailItems({
      items: [
        item("fresh-star", "Star City", "Apple TV+ May 29", 500),
        item("fresh-good-girl", "A Good Girl's Guide to Murder", "S2 May 27"),
        item("fresh-boroughs", "The Boroughs", "Netflix May 21"),
        item("fresh-widow", "Widow's Bay", "Apple TV+ Apr 29"),
        item("fresh-four", "The Four Seasons", "S2 May 28", 450),
        item("fresh-boys", "The Boys", "S5 airing now", 600),
      ],
      previewKeys: getHomeRailIdentitySet(precedingItems),
      precedingItems,
      maxTitleAppearances: 1,
      minimumRemaining: 3,
      now: "2026-05-30T12:00:00.000Z",
    });

    expect(visible.map((entry) => entry.title)).toEqual([
      "A Good Girl's Guide to Murder",
      "The Boroughs",
      "Widow's Bay",
    ]);
  });

  it("uses opening repeats as backfill after available distinct releases", () => {
    const precedingItems = [
      item("hero-star", "Star City", "Apple TV+ May 29"),
      item("brief-four", "The Four Seasons", "S2 May 28"),
      item("brief-deli", "Deli Boys", "S2 May 28"),
    ];
    const visible = buildVisibleFreshRailItems({
      items: [
        item("fresh-star", "Star City", "Apple TV+ May 29", 500),
        item("fresh-good-girl", "A Good Girl's Guide to Murder", "S2 May 27"),
        item("fresh-four", "The Four Seasons", "S2 May 28", 450),
        item("fresh-widow", "Widow's Bay", "Apple TV+ Apr 29"),
        item("fresh-deli", "Deli Boys", "S2 May 28", 425),
      ],
      previewKeys: getHomeRailIdentitySet(precedingItems),
      precedingItems,
      maxTitleAppearances: 1,
      minimumRemaining: 3,
      now: "2026-05-30T12:00:00.000Z",
    });

    expect(visible.map((entry) => entry.title)).toEqual([
      "A Good Girl's Guide to Murder",
      "Widow's Bay",
      "Star City",
      "The Four Seasons",
      "Deli Boys",
    ]);
  });

  it("can cap a topped-up fresh rail before falling back to the visible hero", () => {
    const precedingItems = [
      item("hero-spider", "Spider-Noir", "Prime May 27"),
      item("heat-good-girl", "A Good Girl's Guide to Murder", "S2 May 27"),
    ];
    const topUps = buildFreshRailRoomTopUpItems(
      [
        {
          items: [
            item("room-cape", "Cape Fear", "Apple TV+ Jun 5"),
            item("room-chart", "Chart Only", "Chart mover"),
            item("room-boroughs", "The Boroughs", "Netflix May 21"),
          ],
        },
      ],
      2,
    );
    const visible = buildVisibleFreshRailItems({
      items: [
        item("fresh-spider", "Spider-Noir", "Prime May 27", 800),
        item("fresh-not-suitable", "Not Suitable for Work", "Hulu Jun 2"),
        item("fresh-love-island", "Love Island USA", "Peacock Jun 2"),
        ...topUps,
      ],
      previewKeys: getHomeRailIdentitySet(precedingItems),
      precedingItems,
      maxTitleAppearances: 1,
      minimumRemaining: 3,
      limit: 4,
      now: "2026-05-30T12:00:00.000Z",
    });

    expect(topUps.map((entry) => entry.title)).toEqual([
      "Cape Fear",
      "The Boroughs",
    ]);
    expect(visible.map((entry) => entry.title)).toEqual([
      "Not Suitable for Work",
      "Love Island USA",
      "The Boroughs",
      "Cape Fear",
    ]);
    expect(visible.map((entry) => entry.title)).not.toContain("Spider-Noir");
  });
});

describe("fresh rail distinct floor", () => {
  const releaseItems = (prefix: string, titles: string[]) =>
    titles.map((title, index) =>
      item(`${prefix}-${index}`, title, `Netflix Jun ${index + 1}`, 100 - index),
    );

  it("drops previewed titles while the rail still clears the floor", () => {
    const items = releaseItems("fresh", [
      "Severance", "The Pitt", "Andor", "Shogun", "Hacks", "Slow Horses",
      "The Bear", "Adolescence", "Fallout", "Dark Matter", "Silo", "Pachinko",
      "Yellowjackets", "The Boys",
    ]);
    const preceding = releaseItems("heat", ["Severance", "The Bear"]);

    const visible = buildVisibleFreshRailItems({
      items,
      previewKeys: getHomeRailIdentitySet(preceding),
      precedingItems: preceding,
      maxTitleAppearances: 1,
      minimumRemaining: 3,
      distinctFloor: 12,
      limit: 24,
      now: "2026-06-01",
    });

    expect(visible).toHaveLength(12);
    expect(visible.map((next) => next.title)).not.toContain("Severance");
    expect(visible.map((next) => next.title)).not.toContain("The Bear");
  });

  it("keeps previewed titles behind distinct ones once the rail would fall short", () => {
    const items = releaseItems("fresh", [
      "Severance", "The Pitt", "Andor", "Shogun", "Hacks", "Slow Horses",
    ]);
    const preceding = releaseItems("heat", ["Severance", "Andor"]);

    const visible = buildVisibleFreshRailItems({
      items,
      previewKeys: getHomeRailIdentitySet(preceding),
      precedingItems: preceding,
      maxTitleAppearances: 1,
      minimumRemaining: 3,
      distinctFloor: 12,
      limit: 24,
      now: "2026-06-01",
    });

    expect(visible).toHaveLength(6);
    expect(visible.slice(0, 4).map((next) => next.title)).toEqual([
      "The Pitt", "Shogun", "Hacks", "Slow Horses",
    ]);
    expect(visible.slice(4).map((next) => next.title)).toEqual(
      expect.arrayContaining(["Severance", "Andor"]),
    );
  });
});

describe("fresh rail total appearance cap", () => {
  it("never fills a short rail with a title already on two rails", () => {
    const preceding = [
      item("for-you-sev", "Severance", "Netflix Jun 1"),
      item("heat-sev", "Severance", "Netflix Jun 1"),
      item("for-you-bear", "The Bear", "Netflix Jun 2"),
    ];
    const visible = buildVisibleFreshRailItems({
      items: [
        item("fresh-sev", "Severance", "Netflix Jun 1", 100),
        item("fresh-bear", "The Bear", "Netflix Jun 2", 90),
        item("fresh-hacks", "Hacks", "Netflix Jun 3", 80),
        item("fresh-pitt", "The Pitt", "Netflix Jun 4", 70),
      ],
      previewKeys: getHomeRailIdentitySet(preceding),
      precedingItems: preceding,
      maxTitleAppearances: 1,
      minimumRemaining: 2,
      distinctFloor: 12,
      maxTotalAppearances: 2,
      limit: 24,
      now: "2026-06-01",
    });

    expect(visible.map((next) => next.title)).toEqual(["Hacks", "The Pitt", "The Bear"]);
  });
});

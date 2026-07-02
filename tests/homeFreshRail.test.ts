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

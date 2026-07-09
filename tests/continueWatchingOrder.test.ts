import { describe, expect, it } from "@jest/globals";

import {
  CONTINUE_WATCHING_TIER_CAUGHT_UP,
  CONTINUE_WATCHING_TIER_READY,
  CONTINUE_WATCHING_TIER_UPCOMING_DATED,
  CONTINUE_WATCHING_TIER_UPCOMING_UNDATED,
  getContinueWatchingOrderTier,
  getContinueWatchingRecencyScore,
  rankContinueWatchingItems,
} from "../lib/continueWatchingOrder";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-07-08T20:00:00.000Z");

describe("getContinueWatchingOrderTier", () => {
  it("puts watchable episodes in the ready tier", () => {
    expect(
      getContinueWatchingOrderTier({ totalWatched: 3, totalEpisodes: 10 }),
    ).toBe(CONTINUE_WATCHING_TIER_READY);
  });

  it("separates dated and undated upcoming episodes", () => {
    expect(
      getContinueWatchingOrderTier({ isUpcoming: true, nextAirDate: NOW + DAY_MS }),
    ).toBe(CONTINUE_WATCHING_TIER_UPCOMING_DATED);
    expect(
      getContinueWatchingOrderTier({ isUpcoming: true, nextAirDate: null }),
    ).toBe(CONTINUE_WATCHING_TIER_UPCOMING_UNDATED);
  });

  it("sends caught-up entries to the back tier", () => {
    expect(
      getContinueWatchingOrderTier({ isCaughtUp: true }),
    ).toBe(CONTINUE_WATCHING_TIER_CAUGHT_UP);
  });

  it("keeps optimistically caught-up cards in the ready tier so they don't jump", () => {
    expect(
      getContinueWatchingOrderTier({ isCaughtUp: true, optimisticCaughtUp: true }),
    ).toBe(CONTINUE_WATCHING_TIER_READY);
  });
});

describe("rankContinueWatchingItems", () => {
  it("never shows not-yet-aired episodes ahead of watchable ones", () => {
    const ranked = rankContinueWatchingItems([
      {
        id: "upcoming-recent-activity",
        isUpcoming: true,
        nextAirDate: NOW + 2 * DAY_MS,
        lastWatchedAt: NOW - 1000,
      },
      {
        id: "ready-older-activity",
        totalWatched: 4,
        totalEpisodes: 10,
        lastWatchedAt: NOW - 5 * DAY_MS,
      },
    ]);

    expect(ranked.map((item) => (item as { id: string }).id)).toEqual([
      "ready-older-activity",
      "upcoming-recent-activity",
    ]);
  });

  it("orders ready shows by the freshest of activity and new drops", () => {
    const ranked = rankContinueWatchingItems([
      {
        id: "stale-backlog",
        totalWatched: 1,
        totalEpisodes: 8,
        lastWatchedAt: NOW - 40 * DAY_MS,
      },
      {
        id: "aired-today",
        totalWatched: 7,
        totalEpisodes: 8,
        lastWatchedAt: NOW - 20 * DAY_MS,
        nextReleaseDate: NOW - 2 * 60 * 60 * 1000,
        nextEpisodeReleasedToday: true,
      },
      {
        id: "watched-last-night",
        totalWatched: 2,
        totalEpisodes: 9,
        lastWatchedAt: NOW - DAY_MS / 2,
      },
    ]);

    expect(ranked.map((item) => (item as { id: string }).id)).toEqual([
      "aired-today",
      "watched-last-night",
      "stale-backlog",
    ]);
  });

  it("orders upcoming shows soonest-first regardless of watch recency", () => {
    const ranked = rankContinueWatchingItems([
      {
        id: "airs-next-month",
        isUpcoming: true,
        nextAirDate: NOW + 30 * DAY_MS,
        lastWatchedAt: NOW - 1000,
      },
      {
        id: "airs-tomorrow",
        isUpcoming: true,
        nextAirDate: NOW + DAY_MS,
        lastWatchedAt: NOW - 10 * DAY_MS,
      },
      {
        id: "coming-someday",
        isUpcoming: true,
        nextAirDate: null,
        lastWatchedAt: NOW,
      },
    ]);

    expect(ranked.map((item) => (item as { id: string }).id)).toEqual([
      "airs-tomorrow",
      "airs-next-month",
      "coming-someday",
    ]);
  });

  it("keeps caught-up entries behind everything the user can act on", () => {
    const ranked = rankContinueWatchingItems([
      { id: "done", isCaughtUp: true, lastWatchedAt: NOW },
      {
        id: "upcoming",
        isUpcoming: true,
        nextAirDate: NOW + DAY_MS,
        lastWatchedAt: NOW - 9 * DAY_MS,
      },
      {
        id: "ready",
        totalWatched: 3,
        totalEpisodes: 6,
        lastWatchedAt: NOW - 8 * DAY_MS,
      },
    ]);

    expect(ranked.map((item) => (item as { id: string }).id)).toEqual([
      "ready",
      "upcoming",
      "done",
    ]);
  });

  it("respects the server sortTimestamp hint when present", () => {
    expect(
      getContinueWatchingRecencyScore({
        lastWatchedAt: NOW - 10 * DAY_MS,
        sortTimestamp: NOW - DAY_MS,
      }),
    ).toBe(NOW - DAY_MS);
  });

  it("is stable for items without any timestamps", () => {
    const ranked = rankContinueWatchingItems([
      { id: "first", totalWatched: 1, totalEpisodes: 5 },
      { id: "second", totalWatched: 2, totalEpisodes: 5 },
    ]);
    expect(ranked.map((item) => (item as { id: string }).id)).toEqual([
      "first",
      "second",
    ]);
  });
});

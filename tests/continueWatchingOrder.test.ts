import { describe, expect, it } from "@jest/globals";

import {
  applyHeldContinueOrder,
  CONTINUE_NEW_RELEASE_WINDOW_MS,
  CONTINUE_RAIL_UPCOMING_HORIZON_MS,
  CONTINUE_WATCHING_TIER_CAUGHT_UP,
  CONTINUE_WATCHING_TIER_READY,
  CONTINUE_WATCHING_TIER_UPCOMING_DATED,
  CONTINUE_WATCHING_TIER_UPCOMING_UNDATED,
  getContinueWatchingOrderTier,
  getContinueWatchingRecencyScore,
  isContinueRailEligible,
  isContinueWatchingFreshRelease,
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

  it("treats a future release date as upcoming even when flags claim otherwise", () => {
    // A UTC-clocked server (or a stale cache) can mark tomorrow's episode as
    // released; the clock is the source of truth.
    expect(
      getContinueWatchingOrderTier(
        {
          isUpcoming: false,
          nextReleaseDate: NOW + DAY_MS,
          nextEpisodeReleasedToday: true,
          totalWatched: 3,
          totalEpisodes: 10,
        },
        NOW,
      ),
    ).toBe(CONTINUE_WATCHING_TIER_UPCOMING_DATED);
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
    ], NOW);

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
    ], NOW);

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
    ], NOW);

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
    ], NOW);

    expect(ranked.map((item) => (item as { id: string }).id)).toEqual([
      "ready",
      "upcoming",
      "done",
    ]);
  });

  it("respects the server sortTimestamp hint when present", () => {
    expect(
      getContinueWatchingRecencyScore(
        {
          lastWatchedAt: NOW - 10 * DAY_MS,
          sortTimestamp: NOW - DAY_MS,
        },
        NOW,
      ),
    ).toBe(NOW - DAY_MS);
  });

  it("keeps tomorrow's drops out of the top even when flagged as released", () => {
    const ranked = rankContinueWatchingItems(
      [
        {
          id: "flagged-released-but-future",
          isUpcoming: false,
          nextReleaseDate: NOW + DAY_MS,
          nextEpisodeReleasedToday: true,
          totalWatched: 5,
          totalEpisodes: 10,
          lastWatchedAt: NOW - 1000,
          sortTimestamp: NOW + DAY_MS,
        },
        {
          id: "genuinely-ready",
          totalWatched: 2,
          totalEpisodes: 10,
          lastWatchedAt: NOW - 3 * DAY_MS,
        },
      ],
      NOW,
    );

    expect(ranked.map((item) => (item as { id: string }).id)).toEqual([
      "genuinely-ready",
      "flagged-released-but-future",
    ]);
  });

  it("is stable for items without any timestamps", () => {
    const ranked = rankContinueWatchingItems([
      { id: "first", totalWatched: 1, totalEpisodes: 5 },
      { id: "second", totalWatched: 2, totalEpisodes: 5 },
    ], NOW);
    expect(ranked.map((item) => (item as { id: string }).id)).toEqual([
      "first",
      "second",
    ]);
  });
});

describe("continue rail eligibility and held order", () => {
  it("trusts the server ranking moment and only overlays fresher local activity", () => {
    // sortTimestamp already folds in the local-day release moment; an older
    // lastWatchedAt must not drag it back, and a fresher one must win.
    expect(
      getContinueWatchingRecencyScore(
        { sortTimestamp: NOW - DAY_MS, lastWatchedAt: NOW - 5 * DAY_MS },
        NOW,
      ),
    ).toBe(NOW - DAY_MS);
    expect(
      getContinueWatchingRecencyScore(
        { sortTimestamp: NOW - DAY_MS, lastWatchedAt: NOW - 1000 },
        NOW,
      ),
    ).toBe(NOW - 1000);
    // Future hints clamp to now; without a hint the legacy reconstruction applies.
    expect(
      getContinueWatchingRecencyScore({ sortTimestamp: NOW + DAY_MS }, NOW),
    ).toBe(NOW);
    expect(
      getContinueWatchingRecencyScore(
        { lastWatchedAt: NOW - 3 * DAY_MS, nextReleaseDate: NOW - DAY_MS },
        NOW,
      ),
    ).toBe(NOW - DAY_MS);
  });

  it("keeps the home rail to ready cards and upcoming ones inside the horizon", () => {
    expect(isContinueRailEligible({ totalWatched: 2, totalEpisodes: 8 }, NOW)).toBe(true);
    expect(
      isContinueRailEligible({ isUpcoming: true, nextAirDate: NOW + 6 * DAY_MS }, NOW),
    ).toBe(true);
    expect(
      isContinueRailEligible(
        { isUpcoming: true, nextAirDate: NOW + CONTINUE_RAIL_UPCOMING_HORIZON_MS + DAY_MS },
        NOW,
      ),
    ).toBe(false);
    expect(isContinueRailEligible({ isUpcoming: true, nextAirDate: null }, NOW)).toBe(false);
    expect(isContinueRailEligible({ isCaughtUp: true }, NOW)).toBe(false);
    expect(
      isContinueRailEligible({ isCaughtUp: true, optimisticCaughtUp: true }, NOW),
    ).toBe(true);
  });

  it("badges recent drops as fresh and lets old ones age out", () => {
    expect(
      isContinueWatchingFreshRelease({ nextReleaseDate: NOW - 3 * DAY_MS, totalEpisodes: 8 }, NOW),
    ).toBe(true);
    expect(
      isContinueWatchingFreshRelease(
        { nextReleaseDate: NOW - CONTINUE_NEW_RELEASE_WINDOW_MS - 3 * DAY_MS, totalEpisodes: 8 },
        NOW,
      ),
    ).toBe(false);
    expect(
      isContinueWatchingFreshRelease({ nextReleaseDate: NOW + DAY_MS, nextEpisodeReleasedToday: true }, NOW),
    ).toBe(false);
    expect(isContinueWatchingFreshRelease({ nextEpisodeReleasedToday: true }, NOW)).toBe(true);
    expect(
      isContinueWatchingFreshRelease({ isCaughtUp: true, nextEpisodeReleasedToday: true }, NOW),
    ).toBe(false);
  });

  it("holds the acted-on order, keeps settled cards in place, and appends arrivals", () => {
    const alpha = { showId: "alpha", lastWatchedAt: NOW };
    const beta = { showId: "beta", lastWatchedAt: NOW - DAY_MS, isCaughtUp: true };
    const gamma = { showId: "gamma", lastWatchedAt: NOW - 2 * DAY_MS };
    const delta = { showId: "delta", lastWatchedAt: NOW - 3 * DAY_MS };
    // Held: beta led before it was marked caught up, then alpha. Ranked now:
    // alpha, gamma, delta (beta is complete). Beta stays put, gamma and delta
    // append, alpha keeps its held slot.
    expect(
      applyHeldContinueOrder(["beta", "alpha"], [alpha, gamma, delta], [alpha, beta, gamma, delta]).map(
        (item) => item.showId,
      ),
    ).toEqual(["beta", "alpha", "gamma", "delta"]);
    // A held id that left the payload entirely simply drops out.
    expect(
      applyHeldContinueOrder(["zeta", "alpha"], [alpha], [alpha]).map((item) => item.showId),
    ).toEqual(["alpha"]);
  });
});

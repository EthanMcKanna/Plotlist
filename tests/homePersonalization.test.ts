import { describe, expect, it } from "@jest/globals";

import { hasHomePersonalizationSignals } from "../lib/homePersonalization";

describe("home personalization signals", () => {
  it("treats active watching history as a personalization signal", () => {
    expect(
      hasHomePersonalizationSignals(null, { activeShowCount: 2 }),
    ).toBe(true);
  });

  it("does not overclaim personalization for a truly empty profile", () => {
    expect(
      hasHomePersonalizationSignals(
        {
          favoriteShowIds: [],
          countsReviews: 0,
          countsLogs: 0,
          countsWatchlist: 0,
          countsWatching: 0,
          countsCompleted: 0,
          countsDropped: 0,
          countsTotalShows: 0,
        },
        { activeShowCount: 0 },
      ),
    ).toBe(false);
  });

  it("keeps existing profile counters as personalization signals", () => {
    expect(hasHomePersonalizationSignals({ countsWatchlist: 1 })).toBe(true);
    expect(hasHomePersonalizationSignals({ favoriteShowIds: ["show_1"] })).toBe(true);
  });
});

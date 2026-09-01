import { describe, expect, it } from "@jest/globals";

import { applyRatingChangeToStats } from "../lib/ratingStatsOptimistic";

describe("applyRatingChangeToStats", () => {
  it("adds a first rating to empty stats", () => {
    const next = applyRatingChangeToStats(
      { count: 0, reviewCount: 0, averageRating: null, histogram: [0, 0, 0, 0, 0] },
      null,
      4.5,
    );
    expect(next).toEqual({
      count: 1,
      reviewCount: 1,
      averageRating: 4.5,
      histogram: [0, 0, 0, 0, 1],
    });
  });

  it("re-rates in place without changing the count", () => {
    const next = applyRatingChangeToStats(
      { count: 2, reviewCount: 2, averageRating: 3, histogram: [0, 1, 0, 1, 0] },
      2,
      5,
    );
    expect(next.count).toBe(2);
    expect(next.averageRating).toBeCloseTo(4.5);
    expect(next.histogram).toEqual([0, 0, 0, 1, 1]);
  });

  it("removes a rating and clears the average when nothing is left", () => {
    const next = applyRatingChangeToStats(
      { count: 1, reviewCount: 1, averageRating: 4, histogram: [0, 0, 0, 1, 0] },
      4,
      null,
    );
    expect(next).toEqual({
      count: 0,
      reviewCount: 0,
      averageRating: null,
      histogram: [0, 0, 0, 0, 0],
    });
  });

  it("tolerates stats without a histogram", () => {
    const next = applyRatingChangeToStats({ count: 3, averageRating: 4 }, null, 1);
    expect(next.count).toBe(4);
    expect(next.averageRating).toBeCloseTo(3.25);
    expect(next.histogram).toEqual([1, 0, 0, 0, 0]);
  });
});

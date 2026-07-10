import { describe, expect, it } from "@jest/globals";

import {
  accumulateSignals,
  aggregateProfileFacets,
  decayWeight,
  freshnessScore,
  normalizeSemanticScores,
  qualityPrior,
  rankCandidates,
  signalWeightForRating,
  signalWeightForWatchStatus,
  tasteMatchPercent,
} from "../lib/plotlist/recsRanking";

const DAY = 24 * 60 * 60 * 1000;

describe("decayWeight", () => {
  it("halves after the 180-day half-life and floors at 25%", () => {
    const now = Date.now();
    expect(decayWeight(1, now, now)).toBe(1);
    expect(decayWeight(1, now - 180 * DAY, now)).toBeCloseTo(0.5, 5);
    expect(decayWeight(1, now - 2000 * DAY, now)).toBeCloseTo(0.25, 5);
  });
});

describe("signal weights", () => {
  it("orders watch statuses sensibly", () => {
    expect(signalWeightForWatchStatus("watching")).toBeGreaterThan(
      signalWeightForWatchStatus("completed"),
    );
    expect(signalWeightForWatchStatus("dropped")).toBeLessThan(0);
    expect(signalWeightForWatchStatus("watchlist")).toBeGreaterThan(0);
  });

  it("maps the 0-5 rating scale to positive and negative taste", () => {
    expect(signalWeightForRating(5)).toBeGreaterThan(0);
    expect(signalWeightForRating(4)).toBeGreaterThan(signalWeightForRating(3.5));
    expect(signalWeightForRating(2.5)).toBe(0);
    expect(signalWeightForRating(1)).toBeLessThan(0);
  });
});

describe("accumulateSignals", () => {
  it("sums decayed weights per show", () => {
    const now = Date.now();
    const byShow = accumulateSignals(
      [
        { showId: "a", weight: 1, at: now },
        { showId: "a", weight: 1, at: now - 180 * DAY },
        { showId: "b", weight: -0.8, at: now },
      ],
      now,
    );
    expect(byShow.get("a")).toBeCloseTo(1.5, 4);
    expect(byShow.get("b")).toBeCloseTo(-0.8, 4);
  });
});

describe("qualityPrior", () => {
  it("shrinks low-volume ratings toward the neutral prior", () => {
    const niche = qualityPrior(9.2, 40);
    const beloved = qualityPrior(8.6, 200_000);
    expect(beloved).toBeGreaterThan(niche);
    expect(qualityPrior(null, null)).toBeCloseTo(0.35, 5);
    expect(qualityPrior(6.0, 50_000)).toBeLessThan(qualityPrior(8.0, 50_000));
  });
});

describe("freshnessScore", () => {
  it("decays with age", () => {
    expect(freshnessScore(2026, 2026)).toBe(1);
    expect(freshnessScore(2020, 2026)).toBeLessThan(freshnessScore(2024, 2026));
    expect(freshnessScore(null, 2026)).toBe(0.3);
  });
});

describe("rankCandidates", () => {
  const base = {
    voteAverage: 8,
    voteCount: 5000,
    popularity: 100,
    year: 2024,
  };

  it("prefers higher semantic scores, excludes seen shows, respects limit", () => {
    const ranked = rankCandidates(
      [
        { showId: "low", semanticScore: 0.5, ...base },
        { showId: "high", semanticScore: 0.9, ...base },
        { showId: "seen", semanticScore: 0.99, ...base },
        { showId: "mid", semanticScore: 0.7, ...base },
      ],
      { limit: 2, excludeShowIds: new Set(["seen"]), nowYear: 2026 },
    );
    expect(ranked.map((item) => item.showId)).toEqual(["high", "mid"]);
  });

  it("diversifies away from repeated facets", () => {
    const ranked = rankCandidates(
      [
        { showId: "a", semanticScore: 0.8, ...base, facetKeys: ["cozy-crime"], genreIds: [80] },
        { showId: "b", semanticScore: 0.79, ...base, facetKeys: ["cozy-crime"], genreIds: [80] },
        { showId: "c", semanticScore: 0.74, ...base, facetKeys: ["space-opera"], genreIds: [10765] },
      ],
      { limit: 2, diversityStrength: 0.9, nowYear: 2026 },
    );
    expect(ranked[0].showId).toBe("a");
    expect(ranked[1].showId).toBe("c");
  });

  it("boosts co-watch agreement", () => {
    const ranked = rankCandidates(
      [
        { showId: "solo", semanticScore: 0.8, ...base },
        { showId: "agreed", semanticScore: 0.77, ...base, coWatch: true },
      ],
      { limit: 2, nowYear: 2026 },
    );
    expect(ranked[0].showId).toBe("agreed");
  });
});

describe("aggregateProfileFacets", () => {
  it("weights facets by seed affinity and normalizes to the max", () => {
    const facets = aggregateProfileFacets([
      { weight: 2, facets: [{ key: "cozy-crime", score: 0.8 }] },
      { weight: 1, facets: [{ key: "space-opera", score: 0.8 }] },
      { weight: -1, facets: [{ key: "ignored-negative", score: 0.9 }] },
    ]);
    expect(facets[0]).toEqual({ key: "cozy-crime", score: 1 });
    expect(facets[1].key).toBe("space-opera");
    expect(facets.find((facet) => facet.key === "ignored-negative")).toBeUndefined();
  });
});

describe("normalizeSemanticScores", () => {
  it("rescales compressed Vectorize scores to the target range preserving order", () => {
    const normalized = normalizeSemanticScores([
      { semanticScore: 0.53 },
      { semanticScore: 0.47 },
      { semanticScore: 0.5 },
    ]);
    expect(normalized[0].semanticScore).toBeCloseTo(0.95, 5);
    expect(normalized[1].semanticScore).toBeCloseTo(0.35, 5);
    expect(normalized[2].semanticScore).toBeCloseTo(0.65, 5);
  });

  it("handles degenerate sets", () => {
    expect(normalizeSemanticScores([])).toEqual([]);
    expect(normalizeSemanticScores([{ semanticScore: 0.5 }])[0].semanticScore).toBeCloseTo(
      0.65,
      5,
    );
  });
});

describe("tasteMatchPercent", () => {
  it("maps cosine to a friendly 0-100 scale", () => {
    expect(tasteMatchPercent(1)).toBe(100);
    expect(tasteMatchPercent(0)).toBe(0);
    expect(tasteMatchPercent(0.55)).toBeGreaterThan(55);
    expect(tasteMatchPercent(-0.2)).toBe(0);
  });
});

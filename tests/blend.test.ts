import { describe, expect, it } from "@jest/globals";

import {
  blendDisplayName,
  buildBlendExplainPrompt,
  intersectProviderKeys,
  scoreBlendCandidates,
} from "../lib/blend";

describe("scoreBlendCandidates", () => {
  it("ranks balanced picks above one-sided ones", () => {
    const scores = new Map(
      scoreBlendCandidates([
        // Great for both.
        { showId: "both", centroidScore: 0.7, simViewer: 0.985, simPartner: 0.984 },
        // Perfect for the viewer, weak for the partner.
        { showId: "one_sided", centroidScore: 0.72, simViewer: 0.995, simPartner: 0.97 },
        // Weak for both — anchors the normalization floor.
        { showId: "weak", centroidScore: 0.6, simViewer: 0.97, simPartner: 0.969 },
      ]).map((entry) => [entry.showId, entry.semanticScore]),
    );
    expect(scores.get("both")!).toBeGreaterThan(scores.get("one_sided")!);
    expect(scores.get("both")!).toBeGreaterThan(scores.get("weak")!);
  });

  it("falls back to a penalized centroid score when show vectors are missing", () => {
    const scores = new Map(
      scoreBlendCandidates([
        { showId: "scored", centroidScore: 0.7, simViewer: 0.98, simPartner: 0.98 },
        { showId: "deep_high", centroidScore: 0.75, simViewer: null, simPartner: null },
        { showId: "deep_low", centroidScore: 0.55, simViewer: null, simPartner: null },
      ]).map((entry) => [entry.showId, entry.semanticScore]),
    );
    expect(scores.get("deep_high")!).toBeGreaterThan(scores.get("deep_low")!);
    expect(scores.get("deep_low")!).toBeGreaterThanOrEqual(0);
  });

  it("handles a degenerate candidate set without NaN", () => {
    const [only] = scoreBlendCandidates([
      { showId: "solo", centroidScore: 0.7, simViewer: 0.98, simPartner: 0.98 },
    ]);
    expect(Number.isFinite(only.semanticScore)).toBe(true);
  });
});

describe("intersectProviderKeys", () => {
  it("keeps the viewer's order and drops non-shared services", () => {
    expect(
      intersectProviderKeys(["netflix", "max", "hulu"], ["hulu", "netflix"]),
    ).toEqual(["netflix", "hulu"]);
  });

  it("is null-safe on both sides", () => {
    expect(intersectProviderKeys(null, ["netflix"])).toEqual([]);
    expect(intersectProviderKeys(["netflix"], undefined)).toEqual([]);
  });
});

describe("buildBlendExplainPrompt", () => {
  it("grounds the prompt in both people's tastes", () => {
    const prompt = buildBlendExplainPrompt({
      viewerName: "Ethan",
      partnerName: "Sam",
      viewerAnchors: ["Severance"],
      partnerAnchors: ["The Bear"],
      sharedFacetTitles: ["Slow-burn mysteries"],
      candidates: [
        {
          showId: "show_1",
          title: "Dark",
          year: 2017,
          genres: ["Sci-Fi"],
          overview: "Time travel in a small town.",
          onViewerWatchlist: true,
          onPartnerWatchlist: false,
        },
      ],
    });
    expect(prompt.system).toContain("Ethan");
    expect(prompt.system).toContain("Sam");
    expect(prompt.user).toContain("Shows Ethan loves:\n- Severance");
    expect(prompt.user).toContain("Shows Sam loves:\n- The Bear");
    expect(prompt.user).toContain("Slow-burn mysteries");
    expect(prompt.user).toContain("id=show_1");
    expect(prompt.user).toContain("ON ETHAN'S WATCHLIST");
    expect(prompt.user).not.toContain("ON SAM'S WATCHLIST");
  });
});

describe("blendDisplayName", () => {
  it("prefers display name, then name, then username, then a fallback", () => {
    expect(blendDisplayName({ displayName: "Sam", name: "S", username: "sam" })).toBe("Sam");
    expect(blendDisplayName({ displayName: null, name: "S", username: "sam" })).toBe("S");
    expect(blendDisplayName({ displayName: " ", name: null, username: "sam" })).toBe("@sam");
    expect(blendDisplayName({})).toBe("your friend");
  });
});

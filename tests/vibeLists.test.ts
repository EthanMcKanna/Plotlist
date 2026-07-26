import { describe, expect, it } from "@jest/globals";

import {
  VIBE_LIST_MAX_EXCLUDED_IDS,
  VIBE_LIST_MAX_ITEMS,
  appendVibeExclusion,
  computeVibeListAdditions,
  deriveVibeListTitle,
} from "../lib/vibeLists";

describe("deriveVibeListTitle", () => {
  it("capitalizes and trims the query", () => {
    expect(deriveVibeListTitle("cozy sci-fi with found family")).toBe(
      "Cozy sci-fi with found family",
    );
    expect(deriveVibeListTitle("  funny   but smart.  ")).toBe("Funny but smart");
  });

  it("truncates long queries at a word boundary", () => {
    const long =
      "a very long and extremely specific description of the perfect show that keeps going";
    const title = deriveVibeListTitle(long);
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith(" ")).toBe(false);
    // No mid-word cuts.
    expect(long.startsWith(title.charAt(0).toLowerCase() + title.slice(1))).toBe(true);
  });

  it("falls back for degenerate input", () => {
    expect(deriveVibeListTitle("   ")).toBe("My vibe");
  });
});

describe("computeVibeListAdditions", () => {
  it("keeps match order and skips existing and excluded shows", () => {
    expect(
      computeVibeListAdditions({
        rankedShowIds: ["a", "b", "c", "d"],
        existingShowIds: ["b"],
        excludedShowIds: ["c"],
      }),
    ).toEqual(["a", "d"]);
  });

  it("respects the size cap counting existing members", () => {
    expect(
      computeVibeListAdditions({
        rankedShowIds: ["a", "b", "c"],
        existingShowIds: ["x", "y"],
        maxItems: 3,
      }),
    ).toEqual(["a"]);
    expect(
      computeVibeListAdditions({
        rankedShowIds: ["a"],
        existingShowIds: ["x", "y", "z"],
        maxItems: 3,
      }),
    ).toEqual([]);
  });

  it("defaults the cap to VIBE_LIST_MAX_ITEMS", () => {
    const ranked = Array.from({ length: 100 }, (_, index) => `show_${index}`);
    const additions = computeVibeListAdditions({
      rankedShowIds: ranked,
      existingShowIds: [],
    });
    expect(additions).toHaveLength(VIBE_LIST_MAX_ITEMS);
  });
});

describe("appendVibeExclusion", () => {
  it("appends newest last and dedupes", () => {
    expect(appendVibeExclusion(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(appendVibeExclusion(["a", "b"], "a")).toEqual(["b", "a"]);
    expect(appendVibeExclusion(null, "a")).toEqual(["a"]);
  });

  it("caps the exclusion memory, dropping oldest", () => {
    const full = Array.from({ length: VIBE_LIST_MAX_EXCLUDED_IDS }, (_, i) => `s${i}`);
    const next = appendVibeExclusion(full, "newest");
    expect(next).toHaveLength(VIBE_LIST_MAX_EXCLUDED_IDS);
    expect(next.at(-1)).toBe("newest");
    expect(next).not.toContain("s0");
  });
});

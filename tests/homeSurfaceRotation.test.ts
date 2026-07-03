import { describe, expect, it } from "@jest/globals";

import {
  HOME_ROTATION_EPOCH_MS,
  getHomeRotationEpoch,
  hashHomeRotationSeed,
  rotateHomeItemsForSeed,
  rotateHomeRailForEpoch,
  selectHeroSlidesForEpoch,
} from "../lib/homeSurfaceRotation";

const NOW = Date.parse("2026-07-02T18:07:00.000Z");

describe("home rotation epochs", () => {
  it("buckets time into 15 minute epochs", () => {
    expect(HOME_ROTATION_EPOCH_MS).toBe(15 * 60 * 1000);
    expect(getHomeRotationEpoch(NOW)).toBe(Math.floor(NOW / HOME_ROTATION_EPOCH_MS));
    expect(getHomeRotationEpoch(NOW)).toBe(getHomeRotationEpoch(NOW + 60_000));
    expect(getHomeRotationEpoch(NOW)).not.toBe(
      getHomeRotationEpoch(NOW + HOME_ROTATION_EPOCH_MS),
    );
  });

  it("accepts Date and ISO string inputs", () => {
    expect(getHomeRotationEpoch(new Date(NOW))).toBe(getHomeRotationEpoch(NOW));
    expect(getHomeRotationEpoch("2026-07-02T18:07:00.000Z")).toBe(
      getHomeRotationEpoch(NOW),
    );
  });

  it("hashes seed parts deterministically and decorrelates rails", () => {
    expect(hashHomeRotationSeed(42, "heat")).toBe(hashHomeRotationSeed(42, "heat"));
    expect(hashHomeRotationSeed(42, "heat")).not.toBe(hashHomeRotationSeed(42, "fresh"));
    expect(hashHomeRotationSeed(42, "heat")).not.toBe(hashHomeRotationSeed(43, "heat"));
  });
});

describe("seeded rail rotation", () => {
  const items = ["a", "b", "c", "d", "e", "f"];

  it("preserves membership and relative cyclic order", () => {
    const rotated = rotateHomeItemsForSeed(items, 3);
    expect([...rotated].sort()).toEqual([...items].sort());
    expect(rotated).toEqual(["d", "e", "f", "a", "b", "c"]);
  });

  it("anchors chart leaders when keepTop is set", () => {
    const rotated = rotateHomeItemsForSeed(items, 2, 2);
    expect(rotated.slice(0, 2)).toEqual(["a", "b"]);
    expect(rotated).toEqual(["a", "b", "e", "f", "c", "d"]);
  });

  it("returns tiny rails untouched", () => {
    expect(rotateHomeItemsForSeed(["a"], 7)).toEqual(["a"]);
    expect(rotateHomeItemsForSeed(["a", "b"], 7, 1)).toEqual(["a", "b"]);
  });

  it("varies by rail key at a fixed time and stays stable within an epoch", () => {
    const byRail = new Set(
      ["heat", "fresh", "critics", "quick", "for-you"].map((railKey) =>
        rotateHomeRailForEpoch(items, railKey, { now: NOW }).join(","),
      ),
    );
    expect(byRail.size).toBeGreaterThan(1);
    expect(rotateHomeRailForEpoch(items, "heat", { now: NOW })).toEqual(
      rotateHomeRailForEpoch(items, "heat", { now: NOW + 60_000 }),
    );
  });
});

describe("hero epoch selection", () => {
  const pool = ["lead-a", "lead-b", "lead-c", "d", "e", "f", "g", "h"];

  it("returns the pool as-is when it fits the slide count", () => {
    expect(selectHeroSlidesForEpoch(["a", "b"], { now: NOW })).toEqual(["a", "b"]);
  });

  it("keeps the lead within the strongest candidates", () => {
    for (let epoch = 0; epoch < 12; epoch += 1) {
      const slides = selectHeroSlidesForEpoch(pool, { epoch });
      expect(slides).toHaveLength(5);
      expect(["lead-a", "lead-b", "lead-c"]).toContain(slides[0]);
      expect(new Set(slides).size).toBe(5);
    }
  });

  it("changes the line-up across epochs but not within one", () => {
    const lineups = new Set(
      Array.from({ length: 16 }, (_, epoch) =>
        selectHeroSlidesForEpoch(pool, { epoch }).join(","),
      ),
    );
    expect(lineups.size).toBeGreaterThan(3);
    expect(selectHeroSlidesForEpoch(pool, { now: NOW })).toEqual(
      selectHeroSlidesForEpoch(pool, { now: NOW + 60_000 }),
    );
  });
});

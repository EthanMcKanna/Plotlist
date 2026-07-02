import { describe, expect, it } from "@jest/globals";

import { buildHomePreviewData } from "../lib/homePreviewData";
import {
  getHomeRoomHeatTopUpItems,
  getHomeRoomQualityTopUpItems,
  getHomeRoomQuickTopUpItems,
} from "../lib/homeRoomRailTopUps";
import { getHomeRailIdentityKeys } from "../lib/homeRailIdentity";

function expectDistinctTitles(items: Array<{ key: string; title: string }>) {
  const seen = new Set<string>();
  items.forEach((item) => {
    const keys = getHomeRailIdentityKeys(item);
    expect(keys.some((key) => seen.has(key))).toBe(false);
    keys.forEach((key) => seen.add(key));
  });
}

describe("home room rail top-ups", () => {
  it("turns provider rooms into distinct rail fallback pools", () => {
    const data = buildHomePreviewData("2026-05-30T12:00:00.000Z");
    const heatItems = getHomeRoomHeatTopUpItems(data);
    const qualityItems = getHomeRoomQualityTopUpItems(data);
    const quickItems = getHomeRoomQuickTopUpItems(data);

    expect(heatItems.length).toBeGreaterThanOrEqual(3);
    expect(qualityItems.length).toBeGreaterThanOrEqual(3);
    expect(quickItems.length).toBeGreaterThanOrEqual(3);
    expectDistinctTitles(heatItems);
    expectDistinctTitles(qualityItems);
    expectDistinctTitles(quickItems);
    expect(heatItems.every((item) => item.signal?.trim())).toBe(true);
    qualityItems.forEach((item) => {
      expect(data.getCatalogForKey(item.key)?.tmdbVoteAverage ?? 0).toBeGreaterThanOrEqual(7.6);
    });
    quickItems.forEach((item) => {
      const genreIds = data.getCatalogForKey(item.key)?.genreIds ?? [];
      expect(genreIds.some((genreId) => [16, 35, 10751, 10762].includes(genreId))).toBe(true);
    });
  });
});

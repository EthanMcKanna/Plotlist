import { describe, expect, it } from "@jest/globals";

import {
  classifyCachedDetailFreshness,
  mergeEpisodeProgressRows,
} from "../api/_lib/status-change-details";

describe("classifyCachedDetailFreshness", () => {
  const now = 1_700_000_000_000;

  it("reports missing when the show has no cached details row", () => {
    expect(
      classifyCachedDetailFreshness({ detailCacheId: null, detailExpiresAt: null }, now),
    ).toBe("missing");
    // A stray expiry without a row id is still "no row".
    expect(
      classifyCachedDetailFreshness({ detailCacheId: null, detailExpiresAt: now + 1 }, now),
    ).toBe("missing");
  });

  it("reports stale for an expired row so callers use it and refresh in the background", () => {
    expect(
      classifyCachedDetailFreshness({ detailCacheId: "row", detailExpiresAt: now }, now),
    ).toBe("stale");
    expect(
      classifyCachedDetailFreshness({ detailCacheId: "row", detailExpiresAt: now - 1 }, now),
    ).toBe("stale");
  });

  it("reports fresh for a live row, or a row with no expiry recorded", () => {
    expect(
      classifyCachedDetailFreshness({ detailCacheId: "row", detailExpiresAt: now + 1 }, now),
    ).toBe("fresh");
    expect(
      classifyCachedDetailFreshness({ detailCacheId: "row", detailExpiresAt: null }, now),
    ).toBe("fresh");
  });
});

describe("mergeEpisodeProgressRows", () => {
  it("unions existing and backfilled positions without duplicates", () => {
    const merged = mergeEpisodeProgressRows(
      [
        { seasonNumber: 1, episodeNumber: 1 },
        { seasonNumber: 1, episodeNumber: 2 },
      ],
      [
        { seasonNumber: 1, episodeNumber: 2 },
        { seasonNumber: 1, episodeNumber: 3 },
        { seasonNumber: 2, episodeNumber: 1 },
      ],
    );
    expect(merged).toEqual([
      { seasonNumber: 1, episodeNumber: 1 },
      { seasonNumber: 1, episodeNumber: 2 },
      { seasonNumber: 1, episodeNumber: 3 },
      { seasonNumber: 2, episodeNumber: 1 },
    ]);
  });

  it("keeps only the position fields so extra columns never leak into the facts", () => {
    const merged = mergeEpisodeProgressRows(
      [{ seasonNumber: 3, episodeNumber: 4, watchedAt: 5 } as never],
      [],
    );
    expect(merged).toEqual([{ seasonNumber: 3, episodeNumber: 4 }]);
  });

  it("does not treat S1E12 and S11E2 as the same episode", () => {
    const merged = mergeEpisodeProgressRows(
      [{ seasonNumber: 1, episodeNumber: 12 }],
      [{ seasonNumber: 11, episodeNumber: 2 }],
    );
    expect(merged).toHaveLength(2);
  });
});

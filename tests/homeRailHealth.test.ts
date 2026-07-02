import { describe, expect, it } from "@jest/globals";

import {
  auditHomeRailHealth,
  hasRailEchoedGenericSource,
  shouldLoadEditorialSeedRail,
} from "../lib/homeRailHealth";

const item = (id: string, title = id) => ({
  externalSource: "tmdb",
  externalId: id,
  title,
  year: 2026,
  posterUrl: "poster.jpg",
});

describe("home rail health", () => {
  it("flags category payloads that mostly echo a generic source", () => {
    expect(
      hasRailEchoedGenericSource(
        [item("1"), item("2"), item("3"), item("4"), item("5")],
        [item("1"), item("2"), item("3"), item("4"), item("other")],
      ),
    ).toBe(true);
  });

  it("flags generic echoes by title even when provider ids differ", () => {
    expect(
      hasRailEchoedGenericSource(
        [
          item("internal-1", "Adolescence"),
          item("internal-2", "Off Campus"),
          item("internal-3", "Severance"),
          item("internal-4", "FROM"),
        ],
        [
          item("tmdb-1", "Adolescence"),
          item("tmdb-2", "Off Campus"),
          item("tmdb-3", "Severance"),
          item("tmdb-4", "Different Show"),
        ],
      ),
    ).toBe(true);
  });

  it("does not flag distinct healthy category payloads", () => {
    expect(
      hasRailEchoedGenericSource(
        [item("fresh-1"), item("fresh-2"), item("fresh-3"), item("fresh-4")],
        [item("trend-1"), item("trend-2"), item("trend-3"), item("trend-4")],
      ),
    ).toBe(false);
  });

  it("loads editorial seeds for thin or echoed rails", () => {
    expect(
      shouldLoadEditorialSeedRail({
        primaryCount: 2,
        categoryRaw: [item("1"), item("2")],
      }),
    ).toBe(true);
    expect(
      shouldLoadEditorialSeedRail({
        primaryCount: 6,
        categoryRaw: [item("1"), item("2"), item("3"), item("4")],
        genericSources: [[item("1"), item("2"), item("3"), item("4")]],
      }),
    ).toBe(true);
  });

  it("audits homepage rail quality invariants", () => {
    const report = auditHomeRailHealth({
      items: [
        item("1"),
        item("1", "Duplicate"),
        { ...item("2"), posterUrl: null },
        { ...item("3"), year: 2010 },
      ],
      genericSources: [[item("1"), item("2"), item("3"), item("4")]],
      minItems: 4,
      minRecentYear: 2025,
    });

    expect(report.healthy).toBe(false);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        "too_few_items",
        "duplicate_items",
        "missing_artwork",
        "stale_items",
      ]),
    );
  });

  it("counts matching titles from different sources as duplicates", () => {
    const report = auditHomeRailHealth({
      items: [
        item("internal-adolescence", "Adolescence"),
        item("tmdb-adolescence", "Adolescence"),
        item("fresh-1", "Fresh Show"),
        item("fresh-2", "Other Fresh Show"),
      ],
      minItems: 4,
    });

    expect(report).toMatchObject({
      healthy: false,
      duplicateCount: 1,
      uniqueItemCount: 3,
    });
    expect(report.issues).toEqual(
      expect.arrayContaining(["too_few_items", "duplicate_items"]),
    );
  });

  it("passes healthy distinct rails", () => {
    const report = auditHomeRailHealth({
      items: [item("1"), item("2"), item("3"), item("4")],
      genericSources: [[item("trend-1"), item("trend-2"), item("trend-3"), item("trend-4")]],
      minItems: 4,
      minRecentYear: 2025,
    });

    expect(report).toMatchObject({
      healthy: true,
      issues: [],
      uniqueItemCount: 4,
      missingArtworkCount: 0,
      recentItemCount: 4,
    });
  });

  it("counts explicit home signals as recent demand without accepting generic score copy", () => {
    const report = auditHomeRailHealth({
      items: [
        { ...item("returning-1"), year: 2013, homeSignal: "S9 airing now" },
        { ...item("returning-2"), year: 2022, homeSignal: "Returns Jun 21" },
        { ...item("generic-old"), year: 2020, homeSignal: "8.3 TMDB" },
        { ...item("fresh-year"), year: 2026, homeSignal: "8.1 TMDB" },
      ],
      minItems: 4,
      minRecentYear: 2025,
      minRecentItems: 3,
    });

    expect(report.recentItemCount).toBe(3);
    expect(report.issues).not.toContain("stale_items");
  });
});

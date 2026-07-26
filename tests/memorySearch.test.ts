import { describe, expect, it } from "@jest/globals";

import {
  formatWatchedLabel,
  parseMemoryQuery,
  rankMemoryCandidates,
} from "../lib/memorySearch";

// Fixed "now": 2026-07-25 12:00 local at UTC (offset 0 keeps math readable).
const NOW = Date.UTC(2026, 6, 25, 12);
const OPTS = { now: NOW, utcOffsetMinutes: 0 };
const DAY = 24 * 60 * 60 * 1000;

describe("parseMemoryQuery time windows", () => {
  it("resolves 'last winter' to the most recent completed winter", () => {
    const parsed = parseMemoryQuery(
      "that show with the time loop I watched last winter",
      OPTS,
    );
    expect(parsed.window).not.toBeNull();
    // Winter 2025 = Dec 2025 – Feb 2026 (started before July 2026).
    expect(parsed.window!.startMs).toBe(Date.UTC(2025, 11, 1));
    expect(parsed.window!.endMs).toBe(Date.UTC(2026, 2, 1));
    expect(parsed.window!.label).toBe("winter 2025");
  });

  it("points 'last summer' at the previous year while inside summer", () => {
    const parsed = parseMemoryQuery("the heist show from last summer", OPTS);
    expect(parsed.window!.startMs).toBe(Date.UTC(2025, 5, 1));
    expect(parsed.window!.endMs).toBe(Date.UTC(2025, 8, 1));
  });

  it("does not treat a bare season word as a time reference", () => {
    const parsed = parseMemoryQuery("a cozy winter mystery", OPTS);
    expect(parsed.window).toBeNull();
    expect(parsed.semanticQuery).toBe("a cozy winter mystery");
  });

  it("parses explicit years only with a preposition", () => {
    const withPreposition = parseMemoryQuery("the cooking competition we binged in 2023", OPTS);
    expect(withPreposition.window!.startMs).toBe(Date.UTC(2023, 0, 1));
    expect(withPreposition.window!.endMs).toBe(Date.UTC(2024, 0, 1));
    // "1899" is a show title, not a year filter.
    const titleYear = parseMemoryQuery("that eerie ship mystery 1899", OPTS);
    expect(titleYear.window).toBeNull();
    expect(titleYear.semanticQuery).toContain("1899");
  });

  it("parses calendar units relative to now", () => {
    expect(parseMemoryQuery("the drama I finished last month", OPTS).window).toMatchObject({
      startMs: Date.UTC(2026, 5, 1),
      endMs: Date.UTC(2026, 6, 1),
    });
    expect(parseMemoryQuery("the one I saw last year", OPTS).window).toMatchObject({
      startMs: Date.UTC(2025, 0, 1),
      endMs: Date.UTC(2026, 0, 1),
    });
    const recent = parseMemoryQuery("that thriller I started recently", OPTS).window!;
    expect(recent.startMs).toBe(NOW - 60 * DAY);
  });

  it("parses month names to the most recent occurrence", () => {
    const march = parseMemoryQuery("the docuseries I watched in march", OPTS).window!;
    expect(march.startMs).toBe(Date.UTC(2026, 2, 1));
    const december = parseMemoryQuery("the special from last december", OPTS).window!;
    expect(december.startMs).toBe(Date.UTC(2025, 11, 1));
  });

  it("parses holiday phrases to the most recent holiday span", () => {
    const parsed = parseMemoryQuery("that miniseries we watched over the holidays", OPTS);
    expect(parsed.window!.startMs).toBe(Date.UTC(2025, 11, 15));
    expect(parsed.window!.endMs).toBe(Date.UTC(2026, 0, 8));
  });
});

describe("parseMemoryQuery semantic cleanup", () => {
  it("strips first-person watching phrases and the time phrase", () => {
    const parsed = parseMemoryQuery(
      "that show with the time loop I watched last winter",
      OPTS,
    );
    expect(parsed.semanticQuery).toBe("that show with the time loop");
  });

  it("falls back to the raw text when stripping empties the query", () => {
    const parsed = parseMemoryQuery("I watched last winter", OPTS);
    expect(parsed.semanticQuery).toBe("I watched last winter");
  });
});

describe("rankMemoryCandidates", () => {
  const window = { startMs: Date.UTC(2025, 11, 1), endMs: Date.UTC(2026, 2, 1), label: "winter 2025" };

  it("boosts in-window watches over slightly better semantic matches", () => {
    const ranked = rankMemoryCandidates(
      [
        { showId: "outside", semanticScore: 0.72, lastWatchedAt: NOW - DAY, inWindowWatchedAt: null },
        { showId: "inside", semanticScore: 0.7, lastWatchedAt: Date.UTC(2026, 0, 10), inWindowWatchedAt: Date.UTC(2026, 0, 10) },
        { showId: "weak", semanticScore: 0.5, lastWatchedAt: NOW - DAY, inWindowWatchedAt: null },
      ],
      window,
    );
    expect(ranked[0].showId).toBe("inside");
  });

  it("ranks purely by semantic score without a window", () => {
    const ranked = rankMemoryCandidates(
      [
        { showId: "b", semanticScore: 0.6, lastWatchedAt: 1, inWindowWatchedAt: null },
        { showId: "a", semanticScore: 0.7, lastWatchedAt: 1, inWindowWatchedAt: null },
      ],
      null,
    );
    expect(ranked.map((item) => item.showId)).toEqual(["a", "b"]);
  });

  it("applies the result limit", () => {
    const many = Array.from({ length: 30 }, (_, index) => ({
      showId: `s${index}`,
      semanticScore: Math.random(),
      lastWatchedAt: 1,
      inWindowWatchedAt: null,
    }));
    expect(rankMemoryCandidates(many, null, 5)).toHaveLength(5);
  });
});

describe("formatWatchedLabel", () => {
  it("formats month and year, with a special case for the current month", () => {
    expect(formatWatchedLabel(Date.UTC(2026, 0, 10), OPTS)).toBe("Watched Jan 2026");
    expect(formatWatchedLabel(Date.UTC(2026, 6, 2), OPTS)).toBe("Watched this month");
    expect(formatWatchedLabel(null, OPTS)).toBeNull();
  });
});

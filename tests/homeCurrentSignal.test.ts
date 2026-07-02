import { describe, expect, it } from "@jest/globals";

import {
  getHomeSignalReleaseDistanceDays,
  hasChartOnlyHomeSignal,
  hasExplicitCurrentHomeSignal,
  hasCurrentHomeSignal,
  hasReleaseWindowHomeSignal,
  isGenericHomeSignal,
  isHomeReleaseWindowNear,
} from "../lib/homeCurrentSignal";

const CHECKED_AT = Date.UTC(2026, 4, 28);

describe("home current signal", () => {
  it("does not mistake generic score or activity copy for a fresh signal", () => {
    expect(isGenericHomeSignal("8.3 TMDB")).toBe(true);
    expect(isGenericHomeSignal("1.2k reviews")).toBe(true);
    expect(isGenericHomeSignal("Trending")).toBe(true);

    expect(
      hasCurrentHomeSignal(
        { year: 2019, signal: "8.3 TMDB" },
        { now: CHECKED_AT },
      ),
    ).toBe(false);
    expect(
      hasCurrentHomeSignal(
        { year: 2021, signal: "1.2k reviews" },
        { now: CHECKED_AT },
      ),
    ).toBe(false);
  });

  it("accepts title-level demand, provider-date, and recent-year signals", () => {
    expect(
      hasCurrentHomeSignal(
        { year: 2013, signal: "S9 airing now" },
        { now: CHECKED_AT },
      ),
    ).toBe(true);
    expect(
      hasCurrentHomeSignal(
        { year: 2022, signal: "Returns Jun 21" },
        { now: CHECKED_AT },
      ),
    ).toBe(true);
    expect(
      hasCurrentHomeSignal(
        { year: 2026, signal: "8.1 TMDB" },
        { now: CHECKED_AT },
      ),
    ).toBe(true);
  });

  it("distinguishes explicit release context from year-only freshness", () => {
    expect(
      hasExplicitCurrentHomeSignal({
        year: 2013,
        signal: "S9 airing now",
      }, { now: CHECKED_AT }),
    ).toBe(true);
    expect(
      hasExplicitCurrentHomeSignal({
        year: 2026,
        signal: "8.1 TMDB",
      }, { now: CHECKED_AT }),
    ).toBe(false);
    expect(
      hasExplicitCurrentHomeSignal({
        year: 2026,
      }, { now: CHECKED_AT }),
    ).toBe(false);
  });

  it("separates release-window context from broader chart demand", () => {
    expect(
      hasReleaseWindowHomeSignal({
        year: 2026,
        signal: "Netflix May 4",
      }),
    ).toBe(true);
    expect(
      hasReleaseWindowHomeSignal({
        year: 2026,
        signal: "S2 May 28",
      }),
    ).toBe(true);
    expect(
      hasReleaseWindowHomeSignal({
        year: 2026,
        signal: "Chart mover",
      }),
    ).toBe(false);
    expect(
      hasReleaseWindowHomeSignal({
        year: 2026,
        signal: "Netflix",
      }),
    ).toBe(false);
    expect(
      hasReleaseWindowHomeSignal({
        year: 2026,
        signal: "Netflix chart",
      }),
    ).toBe(false);
    expect(
      hasExplicitCurrentHomeSignal({
        year: 2026,
        signal: "Chart mover",
      }, { now: CHECKED_AT }),
    ).toBe(true);
    expect(
      hasExplicitCurrentHomeSignal({
        year: 2026,
        signal: "Netflix",
      }, { now: CHECKED_AT }),
    ).toBe(false);
    expect(
      hasExplicitCurrentHomeSignal({
        year: 2026,
        signal: "Netflix Top 10",
      }, { now: CHECKED_AT }),
    ).toBe(true);
  });

  it("ages dated release signals so old month-day copy cannot stay current forever", () => {
    expect(
      hasExplicitCurrentHomeSignal(
        { year: 2021, signal: "Netflix May 4" },
        { now: Date.UTC(2026, 5, 18) },
      ),
    ).toBe(true);
    expect(
      hasExplicitCurrentHomeSignal(
        { year: 2021, signal: "Netflix May 4" },
        { now: Date.UTC(2026, 8, 1) },
      ),
    ).toBe(false);
    expect(
      hasCurrentHomeSignal(
        { year: 2021, signal: "Netflix May 4" },
        { now: Date.UTC(2026, 8, 1) },
      ),
    ).toBe(false);
    expect(
      hasExplicitCurrentHomeSignal(
        { year: 2021, signal: "Prime Jul 1" },
        { now: Date.UTC(2026, 4, 30) },
      ),
    ).toBe(true);
  });

  it("identifies chart-only signals without treating provider-date copy as chart-only", () => {
    expect(
      hasChartOnlyHomeSignal({
        year: 2026,
        signal: "Chart mover",
      }),
    ).toBe(true);
    expect(
      hasChartOnlyHomeSignal({
        year: 2026,
        signal: "Netflix May 4",
      }),
    ).toBe(false);
    expect(
      hasChartOnlyHomeSignal({
        year: 2026,
        signal: "Netflix chart",
      }),
    ).toBe(true);
    expect(
      hasChartOnlyHomeSignal({
        year: 2026,
        signal: "Netflix Top 10",
      }),
    ).toBe(true);
  });

  it("honors explicit freshness floors from catalog health checks", () => {
    expect(
      hasCurrentHomeSignal(
        { year: 2021, homeSignal: "S9 airing now" },
        { minRecentYear: 2025 },
      ),
    ).toBe(true);
    expect(
      hasCurrentHomeSignal(
        { year: 2021, homeSignal: "8.2 TMDB" },
        { minRecentYear: 2025 },
      ),
    ).toBe(false);
  });

  it("parses dated release signals into freshness windows", () => {
    expect(
      getHomeSignalReleaseDistanceDays(
        { year: 2026, signal: "Apple TV+ May 29" },
        CHECKED_AT,
      ),
    ).toBe(1);
    expect(
      getHomeSignalReleaseDistanceDays(
        { year: 2026, signal: "Netflix May 7" },
        CHECKED_AT,
      ),
    ).toBe(-21);
    expect(
      isHomeReleaseWindowNear(
        { year: 2026, signal: "S2 May 28" },
        { now: CHECKED_AT },
      ),
    ).toBe(true);
    expect(
      isHomeReleaseWindowNear(
        { year: 2026, signal: "Netflix May 7" },
        { now: CHECKED_AT },
      ),
    ).toBe(false);
  });

  it("treats undated release months as the closest calendar window", () => {
    expect(
      getHomeSignalReleaseDistanceDays(
        { year: 2026, signal: "Premieres Jan 2" },
        Date.UTC(2026, 11, 30),
      ),
    ).toBe(3);
    expect(
      getHomeSignalReleaseDistanceDays(
        { year: 2026, signal: "Finale Dec 30" },
        Date.UTC(2027, 0, 2),
      ),
    ).toBe(-3);
  });
});

import { describe, expect, it } from "@jest/globals";

import {
  formatHomeDatedSignalLabel,
  getHomeDisplayMetaLabels,
  getHomeDisplayMetaLine,
} from "../lib/homeDisplayMeta";

describe("home display metadata", () => {
  it("builds compact metadata with quiet content signals", () => {
    expect(
      getHomeDisplayMetaLine({
        genreLabel: "Crime",
        year: 2026,
        signal: "9.2 TMDB",
      }),
    ).toBe("Crime · 2026 · 9.2 TMDB");
  });

  it("dedupes repeated labels and caps the line length", () => {
    expect(
      getHomeDisplayMetaLabels({
        genreLabel: "Drama",
        year: 2026,
        signal: "Drama",
      }),
    ).toEqual(["Drama", "2026"]);

    expect(
      getHomeDisplayMetaLabels(
        { genreLabel: "Drama", year: 2026, signal: "8.7 TMDB" },
        { maxLabels: 2 },
      ),
    ).toEqual(["Drama", "2026"]);
  });

  it("can omit signals for surfaces that need quieter metadata", () => {
    expect(
      getHomeDisplayMetaLine(
        { genreLabel: "Comedy", year: 2021, signal: "7.4 TMDB" },
        { includeSignal: false },
      ),
    ).toBe("Comedy · 2021");
  });

  it("can shorten ratings and airing signals for narrow poster cards", () => {
    expect(
      getHomeDisplayMetaLine(
        { genreLabel: "Drama", year: 2025, signal: "8.7 TMDB" },
        { compactSignal: true },
      ),
    ).toBe("Drama · 8.7");

    expect(
      getHomeDisplayMetaLine(
        { genreLabel: "Animated", year: 2013, signal: "S9 airing now" },
        { compactSignal: true },
      ),
    ).toBe("Animated · S9 now");

    expect(
      getHomeDisplayMetaLine(
        { genreLabel: "Sci-Fi", year: 2021, signal: "MGM+ S4 airing now" },
        { compactSignal: true },
      ),
    ).toBe("Sci-Fi · MGM+ S4 now");
  });

  it("separates provider or release signals from dates in compact metadata", () => {
    expect(formatHomeDatedSignalLabel("Netflix May 4")).toBe("Netflix · May 4");
    expect(formatHomeDatedSignalLabel("Finale May 27")).toBe("Finale · May 27");
    expect(
      getHomeDisplayMetaLine(
        { genreLabel: "Western", year: 2026, signal: "Paramount+ May 15" },
        { compactSignal: true },
      ),
    ).toBe("Western · Paramount+ · May 15");
  });

  it("shortens chart signals for quick-scanning home cards", () => {
    expect(
      getHomeDisplayMetaLine(
        { genreLabel: "Drama", year: 2026, signal: "JustWatch chart #8" },
        { compactSignal: true },
      ),
    ).toBe("Drama · JustWatch #8");
    expect(
      getHomeDisplayMetaLine(
        { genreLabel: "Action", year: 2026, signal: "Chart mover" },
        { compactSignal: true },
      ),
    ).toBe("Action · Rising");
  });

  it("keeps the year in compact metadata when there is no useful signal", () => {
    expect(
      getHomeDisplayMetaLine(
        { genreLabel: "Drama", year: 2026, signal: "Drama" },
        { compactSignal: true },
      ),
    ).toBe("Drama · 2026");

    expect(
      getHomeDisplayMetaLine(
        { genreLabel: "Comedy", year: 2024, signal: null },
        { compactSignal: true },
      ),
    ).toBe("Comedy · 2024");
  });
});

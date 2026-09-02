import { describe, expect, it } from "@jest/globals";

import {
  getTmdbListPageNumbers,
  isHomeRailShowProjection,
  projectHomeRailRankedItems,
  projectHomeRailShow,
  projectHomeRailShows,
} from "../lib/plotlist/homeRailPayload";

const fullShowRow = {
  id: "show_1",
  _id: "show_1",
  _creationTime: 1,
  externalSource: "tmdb",
  externalId: "123",
  title: "The Pitt",
  originalTitle: "The Pitt",
  year: 2025,
  overview: "A very long overview that the rails never render ".repeat(8),
  posterUrl: "https://image.tmdb.org/t/p/w500/pitt.jpg",
  backdropUrl: "https://image.tmdb.org/t/p/w1280/pitt-wide.jpg",
  genreIds: [18],
  originalLanguage: "en",
  originCountries: ["US"],
  tmdbPopularity: 120.5,
  tmdbVoteAverage: 8.6,
  tmdbVoteCount: 900,
  imdbId: "tt1234567",
  searchText: "the pitt pitt",
  createdAt: 10,
  updatedAt: 20,
  homeSignal: "S2 Jan 8",
  editorialTier: "verified_current",
  homeScore: 0.82,
  homeReasons: ["fresh", "quality"],
};

describe("home rail payload projection", () => {
  it("keeps only the fields the rails rank and render", () => {
    const projected = projectHomeRailShow(fullShowRow);

    expect(projected).toEqual({
      _id: "show_1",
      externalSource: "tmdb",
      externalId: "123",
      title: "The Pitt",
      year: 2025,
      posterUrl: "https://image.tmdb.org/t/p/w500/pitt.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/w1280/pitt-wide.jpg",
      genreIds: [18],
      tmdbPopularity: 120.5,
      tmdbVoteAverage: 8.6,
      tmdbVoteCount: 900,
      homeSignal: "S2 Jan 8",
      editorialTier: "verified_current",
      homeScore: 0.82,
      updatedAt: 20,
    });
    expect(isHomeRailShowProjection(projected)).toBe(true);
    expect(isHomeRailShowProjection(fullShowRow)).toBe(false);
  });

  it("shrinks a full show row by more than half", () => {
    const full = JSON.stringify(fullShowRow).length;
    const slim = JSON.stringify(projectHomeRailShow(fullShowRow)).length;
    expect(slim).toBeLessThan(full / 2);
  });

  it("preserves explicit nulls and drops undefined or untitled entries", () => {
    expect(
      projectHomeRailShow({
        title: "No Poster",
        posterUrl: null,
        backdropUrl: undefined,
      }),
    ).toEqual({ title: "No Poster", posterUrl: null });
    expect(projectHomeRailShow(null)).toBeNull();
    expect(projectHomeRailShow({ overview: "x" } as any)).toBeNull();
    expect(projectHomeRailShows([fullShowRow, null, { name: "nope" }])).toHaveLength(1);
    expect(projectHomeRailShows("not a list")).toEqual([]);
  });

  it("projects ranked items and drops per-item reasons", () => {
    const items = projectHomeRailRankedItems([
      {
        _id: "show_1",
        rank: 1,
        score: 12.5,
        reviewCount: 3,
        logCount: 2,
        statusCount: 1,
        homeReasons: ["taste"],
        reason: "Because you liked X",
        show: fullShowRow,
      },
      { rank: 2, show: null },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      _id: "show_1",
      rank: 1,
      score: 12.5,
      reviewCount: 3,
      logCount: 2,
      statusCount: 1,
      show: projectHomeRailShow(fullShowRow),
    });
    expect("homeReasons" in items[0]).toBe(false);
    expect("reason" in items[0]).toBe(false);
  });
});

describe("tmdb list page numbers", () => {
  it("fetches one page for lists that fit a TMDB page", () => {
    expect(getTmdbListPageNumbers(1, 10)).toEqual([1]);
    expect(getTmdbListPageNumbers(1, 20)).toEqual([1]);
    expect(getTmdbListPageNumbers(3, 18)).toEqual([3]);
  });

  it("fetches the following pages for deeper lists", () => {
    expect(getTmdbListPageNumbers(1, 30)).toEqual([1, 2]);
    expect(getTmdbListPageNumbers(1, 40)).toEqual([1, 2]);
    expect(getTmdbListPageNumbers(1, 41)).toEqual([1, 2, 3]);
    expect(getTmdbListPageNumbers(2, 30)).toEqual([2, 3]);
  });

  it("tolerates junk input", () => {
    expect(getTmdbListPageNumbers(0, 0)).toEqual([1]);
    expect(getTmdbListPageNumbers(Number.NaN, -5)).toEqual([1]);
  });
});

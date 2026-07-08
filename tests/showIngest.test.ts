import { describe, expect, it } from "@jest/globals";

import {
  computeNextRefreshDelayMs,
  mapDetailsToShowRow,
  REFRESH_TIER_MS,
} from "../api/_lib/show-ingest";

const NOW = Date.parse("2026-07-05T12:00:00Z");

describe("computeNextRefreshDelayMs", () => {
  it("treats returning series as active", () => {
    expect(
      computeNextRefreshDelayMs({
        details: { status: "Returning Series", popularity: 50 },
        isUserAttached: false,
        now: NOW,
      }),
    ).toBe(REFRESH_TIER_MS.active);
  });

  it("treats shows with a scheduled next episode as active", () => {
    expect(
      computeNextRefreshDelayMs({
        details: { status: "Ended", next_episode_to_air: { air_date: "2026-08-01" }, popularity: 0.5 },
        isUserAttached: false,
        now: NOW,
      }),
    ).toBe(REFRESH_TIER_MS.active);
  });

  it("treats recently aired shows as active", () => {
    expect(
      computeNextRefreshDelayMs({
        details: { status: "Ended", last_air_date: "2026-06-20", popularity: 0.2 },
        isUserAttached: false,
        now: NOW,
      }),
    ).toBe(REFRESH_TIER_MS.active);
  });

  it("gives popular ended shows the popular tier", () => {
    expect(
      computeNextRefreshDelayMs({
        details: { status: "Ended", last_air_date: "2013-09-29", popularity: 120 },
        isUserAttached: false,
        now: NOW,
      }),
    ).toBe(REFRESH_TIER_MS.popular);
  });

  it("gives obscure ended shows the dormant tier", () => {
    expect(
      computeNextRefreshDelayMs({
        details: { status: "Ended", last_air_date: "1994-01-01", popularity: 0.3 },
        isUserAttached: false,
        now: NOW,
      }),
    ).toBe(REFRESH_TIER_MS.dormant);
  });

  it("caps the delay for user-attached shows", () => {
    expect(
      computeNextRefreshDelayMs({
        details: { status: "Ended", last_air_date: "1994-01-01", popularity: 0.3 },
        isUserAttached: true,
        now: NOW,
      }),
    ).toBe(REFRESH_TIER_MS.userAttached);
  });
});

describe("mapDetailsToShowRow", () => {
  const details = {
    id: 1396,
    name: "Breaking Bad",
    original_name: "Breaking Bad",
    overview: "A chemistry teacher breaks bad.",
    first_air_date: "2008-01-20",
    poster_path: "/poster.jpg",
    backdrop_path: "/backdrop.jpg",
    genres: [{ id: 18 }, { id: 80 }],
    original_language: "en",
    origin_country: ["US"],
    popularity: 200.5,
    vote_average: 8.9,
    vote_count: 12000,
    external_ids: { imdb_id: "tt0903747" },
  };

  it("maps a TMDB details payload onto the shows row shape", () => {
    const row = mapDetailsToShowRow(details, NOW);
    expect(row).toMatchObject({
      externalSource: "tmdb",
      externalId: "1396",
      title: "Breaking Bad",
      year: 2008,
      posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
      genreIds: [18, 80],
      originalLanguage: "en",
      originCountries: ["US"],
      tmdbPopularity: 200.5,
      imdbId: "tt0903747",
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(row.searchText).toContain("breaking bad");
    expect(row.id.startsWith("show_")).toBe(true);
  });

  it("records missing IMDb mappings as the empty-string marker", () => {
    const row = mapDetailsToShowRow({ ...details, external_ids: {} }, NOW);
    expect(row.imdbId).toBe("");
  });

  it("falls back to the original name and skips absent artwork", () => {
    const row = mapDetailsToShowRow(
      { id: 7, original_name: "プライド", poster_path: null, backdrop_path: null },
      NOW,
    );
    expect(row.title).toBe("プライド");
    expect(row.posterUrl).toBeNull();
    expect(row.backdropUrl).toBeNull();
    expect(row.year).toBeNull();
  });
});

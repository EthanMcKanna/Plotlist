import { describe, expect, it } from "@jest/globals";

import { getHomeShowKey, rankHomeShows } from "../lib/homeRanking";

describe("home ranking", () => {
  it("prefers relevant high-confidence fresh shows over raw popularity alone", () => {
    const ranked = rankHomeShows(
      [
        {
          externalSource: "tmdb",
          externalId: "popular-old",
          title: "Popular Old",
          posterUrl: "poster.jpg",
          year: 2015,
          genreIds: [35],
          tmdbPopularity: 980,
          tmdbVoteAverage: 6.1,
          tmdbVoteCount: 1200,
        },
        {
          externalSource: "tmdb",
          externalId: "fresh-match",
          title: "Fresh Match",
          posterUrl: "poster.jpg",
          year: 2026,
          genreIds: [18, 9648],
          tmdbPopularity: 260,
          tmdbVoteAverage: 8.4,
          tmdbVoteCount: 900,
        },
      ],
      {
        now: Date.UTC(2026, 4, 7),
        genreWeights: { "18": 1, "9648": 0.7 },
      },
    );

    expect(ranked[0].title).toBe("Fresh Match");
    expect(ranked[0].homeReasons).toContain("taste");
    expect(ranked[0].homeReasons).toContain("fresh");
    expect(ranked[0].homeReasons).not.toContain("matches your taste");
    expect(ranked[0].homeReasons).not.toContain("fresh catalog signal");
  });

  it("dedupes and suppresses already-consumed shows", () => {
    const ranked = rankHomeShows(
      [
        {
          _id: "seen",
          title: "Seen Show",
          posterUrl: "poster.jpg",
          genreIds: [18],
          tmdbPopularity: 100,
        },
        {
          externalSource: "tmdb",
          externalId: "same",
          title: "Shared Show",
          posterUrl: "poster.jpg",
          genreIds: [18],
          tmdbPopularity: 90,
        },
        {
          externalSource: "tmdb",
          externalId: "same",
          title: "Shared Show Duplicate",
          posterUrl: "poster.jpg",
          genreIds: [18],
          tmdbPopularity: 95,
        },
      ],
      { seenKeys: ["seen"] },
    );

    expect(ranked.map((item) => item.title)).toEqual(["Shared Show"]);
  });

  it("uses stable keys across internal and TMDB catalog items", () => {
    expect(getHomeShowKey({ _id: "show_1", externalId: "2" })).toBe("show_1");
    expect(getHomeShowKey({ externalSource: "tmdb", externalId: 42 })).toBe("tmdb:42");
  });

  it("can bias personalized home picks away from stale popularity", () => {
    const ranked = rankHomeShows(
      [
        {
          externalSource: "tmdb",
          externalId: "legacy-procedural",
          title: "Legacy Procedural",
          posterUrl: "poster.jpg",
          year: 2003,
          genreIds: [80, 18],
          tmdbPopularity: 900,
          tmdbVoteAverage: 7.8,
          tmdbVoteCount: 5000,
        },
        {
          externalSource: "tmdb",
          externalId: "current-match",
          title: "Current Match",
          posterUrl: "poster.jpg",
          year: 2026,
          genreIds: [80, 18],
          tmdbPopularity: 220,
          tmdbVoteAverage: 8.2,
          tmdbVoteCount: 300,
        },
      ],
      {
        now: Date.UTC(2026, 4, 27),
        genreWeights: { "80": 1, "18": 0.8 },
        preferFresh: true,
      },
    );

    expect(ranked[0].title).toBe("Current Match");
  });

  it("treats explicit home editorial signals as fresh without changing surface copy", () => {
    const ranked = rankHomeShows(
      [
        {
          externalSource: "tmdb",
          externalId: "returning",
          title: "Returning Event",
          posterUrl: "poster.jpg",
          year: 2022,
          genreIds: [18],
          tmdbPopularity: 120,
          tmdbVoteAverage: 8.1,
          tmdbVoteCount: 900,
          homeSignal: "Returns Jun 21",
        },
        {
          externalSource: "tmdb",
          externalId: "generic",
          title: "Generic Current",
          posterUrl: "poster.jpg",
          year: 2026,
          genreIds: [18],
          tmdbPopularity: 110,
          tmdbVoteAverage: 7.4,
          tmdbVoteCount: 250,
        },
      ],
      { now: Date.UTC(2026, 4, 28), preferFresh: true },
    );

    expect(ranked[0].title).toBe("Returning Event");
    expect(ranked[0].homeReasons).toContain("fresh");
    expect(ranked[0].homeReasons).not.toContain("fresh catalog signal");
  });

  it("ranks explicit release context above plain current-year recency", () => {
    const ranked = rankHomeShows(
      [
        {
          externalSource: "tmdb",
          externalId: "year-only",
          title: "Year Only Hit",
          posterUrl: "poster.jpg",
          year: 2026,
          genreIds: [18],
          tmdbPopularity: 130,
          tmdbVoteAverage: 7.9,
          tmdbVoteCount: 500,
        },
        {
          externalSource: "tmdb",
          externalId: "returning",
          title: "Returning Tonight",
          posterUrl: "poster.jpg",
          year: 2022,
          genreIds: [18],
          tmdbPopularity: 130,
          tmdbVoteAverage: 7.9,
          tmdbVoteCount: 500,
          homeSignal: "S4 airing now",
        },
      ],
      { now: Date.UTC(2026, 4, 28), preferFresh: true },
    );

    expect(ranked[0].title).toBe("Returning Tonight");
    expect(ranked[0].homeReasons).toContain("fresh");
  });

  it("uses the supplied ranking date for year freshness", () => {
    const ranked = rankHomeShows(
      [
        {
          externalSource: "tmdb",
          externalId: "two-years-ago",
          title: "Two Years Ago",
          posterUrl: "poster.jpg",
          year: 2026,
          genreIds: [18],
          tmdbPopularity: 160,
          tmdbVoteAverage: 7.8,
          tmdbVoteCount: 700,
        },
        {
          externalSource: "tmdb",
          externalId: "right-now",
          title: "Right Now",
          posterUrl: "poster.jpg",
          year: 2028,
          genreIds: [18],
          tmdbPopularity: 120,
          tmdbVoteAverage: 7.8,
          tmdbVoteCount: 700,
        },
      ],
      { now: Date.UTC(2028, 4, 28), preferFresh: true },
    );

    expect(ranked.find((item) => item.title === "Right Now")?.homeReasons).toContain("fresh");
    expect(ranked.find((item) => item.title === "Two Years Ago")?.homeReasons).not.toContain(
      "fresh",
    );
  });
});

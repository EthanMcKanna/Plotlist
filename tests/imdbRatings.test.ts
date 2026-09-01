import { describe, expect, it } from "@jest/globals";

import {
  SHOW_RATING_SEASON,
  averageEpisodeRating,
  parseOmdbSeasonPayload,
  parseOmdbShowPayload,
  planImdbRatingSlots,
} from "../api/_lib/imdb-ratings";

describe("OMDb show payload parsing", () => {
  it("reads rating and comma-separated vote counts", () => {
    expect(
      parseOmdbShowPayload({ imdbRating: "9.5", imdbVotes: "2,345,678" }),
    ).toEqual({ rating: 9.5, votes: 2345678 });
  });

  it("treats N/A and missing fields as null", () => {
    expect(parseOmdbShowPayload({ imdbRating: "N/A", imdbVotes: "N/A" })).toEqual({
      rating: null,
      votes: null,
    });
    expect(parseOmdbShowPayload({ Response: "False", Error: "Incorrect IMDb ID." })).toEqual({
      rating: null,
      votes: null,
    });
    expect(parseOmdbShowPayload(null)).toEqual({ rating: null, votes: null });
  });
});

describe("OMDb season payload parsing", () => {
  it("keeps rated episodes sorted and tracks the newest release date", () => {
    const payload = parseOmdbSeasonPayload({
      Title: "Breaking Bad",
      Season: "1",
      Episodes: [
        { Episode: "2", imdbRating: "8.6", Released: "2008-01-27" },
        { Episode: "1", imdbRating: "8.9", Released: "2008-01-20" },
        { Episode: "3", imdbRating: "N/A", Released: "2008-02-10" },
        { Episode: "N/A", imdbRating: "8.0", Released: "N/A" },
      ],
    });
    expect(payload.episodes).toEqual([
      { episodeNumber: 1, rating: 8.9 },
      { episodeNumber: 2, rating: 8.6 },
    ]);
    expect(payload.latestReleased).toBe("2008-02-10");
  });

  it("returns an empty payload for error responses", () => {
    const payload = parseOmdbSeasonPayload({ Response: "False", Error: "Series not found!" });
    expect(payload.episodes).toEqual([]);
    expect(payload.latestReleased).toBeNull();
  });
});

describe("season average", () => {
  it("averages episode ratings to one decimal", () => {
    expect(
      averageEpisodeRating([
        { episodeNumber: 1, rating: 8.9 },
        { episodeNumber: 2, rating: 8.6 },
        { episodeNumber: 3, rating: 9.3 },
      ]),
    ).toBe(8.9);
  });

  it("returns null with no rated episodes", () => {
    expect(averageEpisodeRating([])).toBeNull();
  });
});

describe("planImdbRatingSlots", () => {
  const now = 1_000_000;
  const row = (seasonNumber: number, expiresAt: number) => ({
    seasonNumber,
    payload: { rating: 8, votes: 10 },
    expiresAt,
  });

  it("serves fresh and stale rows from cache and only blocks on missing slots", () => {
    const cached = new Map([
      [SHOW_RATING_SEASON, row(SHOW_RATING_SEASON, now + 1)],
      [1, row(1, now - 1)],
    ]);
    const plan = planImdbRatingSlots([SHOW_RATING_SEASON, 1, 2, 3], cached, now);
    expect(plan.fresh).toEqual([SHOW_RATING_SEASON]);
    expect(plan.stale).toEqual([1]);
    expect(plan.refresh).toEqual([1]);
    expect(plan.inline).toEqual([2, 3]);
    expect(plan.skipped).toEqual([]);
  });

  it("caps inline fetches and background refreshes separately", () => {
    const cached = new Map([
      [1, row(1, now - 1)],
      [2, row(2, now - 1)],
      [3, row(3, now - 1)],
    ]);
    const plan = planImdbRatingSlots([1, 2, 3, 4, 5, 6], cached, now, {
      maxInline: 2,
      maxBackground: 2,
    });
    expect(plan.stale).toEqual([1, 2, 3]);
    expect(plan.refresh).toEqual([1, 2]);
    expect(plan.inline).toEqual([4, 5]);
    expect(plan.skipped).toEqual([6]);
  });

  it("treats a row expiring exactly now as stale", () => {
    const plan = planImdbRatingSlots([1], new Map([[1, row(1, now)]]), now);
    expect(plan.fresh).toEqual([]);
    expect(plan.stale).toEqual([1]);
  });
});

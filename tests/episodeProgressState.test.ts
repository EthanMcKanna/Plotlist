import { describe, expect, it } from "@jest/globals";

import {
  getEpisodeProgressState,
  getLatestWatchedEpisode,
  getNextEpisodeAfter,
  getTotalKnownEpisodes,
  isEpisodeVerified,
  normalizeEpisodeSeasonSummaries,
} from "../lib/episodeProgressState";

describe("episode progress state", () => {
  it("rolls from a season finale to the first episode of the next season", () => {
    expect(
      getNextEpisodeAfter(
        { seasonNumber: 1, episodeNumber: 10 },
        [
          { seasonNumber: 1, episodeCount: 10 },
          { seasonNumber: 2, episodeCount: 8 },
        ],
      ),
    ).toEqual({ seasonNumber: 2, episodeNumber: 1 });
  });

  it("does not invent high episode numbers when the latest known episode is caught up", () => {
    const state = getEpisodeProgressState({
      watchedEpisodes: [
        { seasonNumber: 1, episodeNumber: 1 },
        { seasonNumber: 1, episodeNumber: 2 },
        { seasonNumber: 2, episodeNumber: 1 },
        { seasonNumber: 2, episodeNumber: 2 },
      ],
      seasons: [
        { seasonNumber: 1, episodeCount: 2 },
        { seasonNumber: 2, episodeCount: 2 },
      ],
    });

    expect(state.nextEpisode).toBeNull();
    expect(state.isCaughtUp).toBe(true);
    expect(state.latestWatched).toEqual({ seasonNumber: 2, episodeNumber: 2 });
  });

  it("falls back to incrementing within the same season when season metadata is missing", () => {
    expect(
      getEpisodeProgressState({
        watchedEpisodes: [{ seasonNumber: 3, episodeNumber: 6 }],
        seasons: [],
      }).nextEpisode,
    ).toEqual({ seasonNumber: 3, episodeNumber: 7 });
  });

  it("keeps unknown future seasons actionable instead of treating zero counts as complete", () => {
    const state = getEpisodeProgressState({
      watchedEpisodes: [{ seasonNumber: 1, episodeNumber: 8 }],
      seasons: [
        { seasonNumber: 1, episodeCount: 8 },
        { seasonNumber: 2, episodeCount: 0 },
      ],
    });

    expect(state.nextEpisode).toEqual({ seasonNumber: 2, episodeNumber: 1 });
    expect(state.isCaughtUp).toBe(false);
  });

  it("deduplicates watched rows so progress totals cannot jump from duplicate cache rows", () => {
    const state = getEpisodeProgressState({
      watchedEpisodes: [
        { seasonNumber: 1, episodeNumber: 1 },
        { seasonNumber: 1, episodeNumber: 1 },
        { seasonNumber: 1, episodeNumber: 2 },
      ],
      seasons: [{ seasonNumber: 1, episodeCount: 4 }],
    });

    expect(state.totalWatched).toBe(2);
    expect(state.nextEpisode).toEqual({ seasonNumber: 1, episodeNumber: 3 });
  });

  it("filters specials and malformed season metadata before totaling episodes", () => {
    const seasons = normalizeEpisodeSeasonSummaries([
      { seasonNumber: 0, episodeCount: 99 },
      { seasonNumber: 1, episodeCount: 10 },
      { seasonNumber: 1, episodeCount: 8 },
      { seasonNumber: 2, episodeCount: -1 },
      { seasonNumber: 3.5, episodeCount: 7 },
    ]);

    expect(seasons).toEqual([
      { seasonNumber: 1, episodeCount: 10, airDate: null },
      { seasonNumber: 2, episodeCount: 0, airDate: null },
    ]);
    expect(getTotalKnownEpisodes(seasons)).toBe(10);
  });

  it("prefers a later season with known episodes over an announced empty one", () => {
    expect(
      getNextEpisodeAfter({ seasonNumber: 1, episodeNumber: 8 }, [
        { seasonNumber: 1, episodeCount: 8 },
        { seasonNumber: 2, episodeCount: 0 },
        { seasonNumber: 3, episodeCount: 10 },
      ]),
    ).toEqual({ seasonNumber: 3, episodeNumber: 1 });
  });

  it("verifies episode existence against season metadata", () => {
    const seasons = [
      { seasonNumber: 1, episodeCount: 8 },
      { seasonNumber: 2, episodeCount: 0 },
    ];

    expect(isEpisodeVerified({ seasonNumber: 1, episodeNumber: 8 }, seasons)).toBe(true);
    expect(isEpisodeVerified({ seasonNumber: 1, episodeNumber: 9 }, seasons)).toBe(false);
    expect(isEpisodeVerified({ seasonNumber: 2, episodeNumber: 1 }, seasons)).toBe(false);
    expect(isEpisodeVerified({ seasonNumber: 3, episodeNumber: 1 }, seasons)).toBe(false);
    expect(isEpisodeVerified({ seasonNumber: 1, episodeNumber: 1 }, [])).toBe(false);
    expect(isEpisodeVerified(null, seasons)).toBe(false);
  });

  it("ignores invalid watched positions when finding the latest progress frontier", () => {
    expect(
      getLatestWatchedEpisode([
        { seasonNumber: 1, episodeNumber: 4 },
        { seasonNumber: 2, episodeNumber: 0 },
        { seasonNumber: -1, episodeNumber: 99 },
        { seasonNumber: 2, episodeNumber: 1 },
      ]),
    ).toEqual({ seasonNumber: 2, episodeNumber: 1 });
  });
});

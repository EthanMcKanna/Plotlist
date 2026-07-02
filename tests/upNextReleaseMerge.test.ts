import { describe, expect, it } from "@jest/globals";

import {
  getReleaseAwareUpNextEpisode,
  type UpNextFallbackEpisode,
  type UpNextReleaseEvent,
} from "../lib/upNextReleaseMerge";

function fallback(
  overrides: Partial<UpNextFallbackEpisode> = {},
): UpNextFallbackEpisode {
  return {
    nextSeasonNumber: 1,
    nextEpisodeNumber: 5,
    nextEpisodeName: null,
    nextEpisodeStillUrl: null,
    nextAirDate: null,
    nextReleaseDate: null,
    nextEpisodeReleasedToday: false,
    isUpcoming: false,
    totalEpisodes: 10,
    sortTimestamp: Date.parse("2026-05-20T12:00:00.000Z"),
    ...overrides,
  };
}

function release(
  overrides: Partial<UpNextReleaseEvent> = {},
): UpNextReleaseEvent {
  return {
    airDate: "2026-05-30",
    airDateTs: Date.parse("2026-05-30T12:00:00.000Z"),
    seasonNumber: 1,
    episodeNumber: 5,
    episodeTitle: "The Return",
    ...overrides,
  };
}

describe("getReleaseAwareUpNextEpisode", () => {
  it("adds release-calendar episode context to the next resume card", () => {
    const result = getReleaseAwareUpNextEpisode({
      fallback: fallback(),
      latestWatched: { season: 1, episode: 4 },
      watchedEpisodeCount: 4,
      releaseEvents: [release()],
      today: "2026-05-30",
    });

    expect(result).toMatchObject({
      nextSeasonNumber: 1,
      nextEpisodeNumber: 5,
      nextEpisodeName: "The Return",
      isUpcoming: false,
      nextAirDate: null,
      nextReleaseDate: Date.parse("2026-05-30T12:00:00.000Z"),
      nextEpisodeReleasedToday: true,
      totalEpisodes: 10,
      sortTimestamp: Date.parse("2026-05-30T12:00:00.000Z"),
    });
  });

  it("brings a newly available episode back when the season cache still looks caught up", () => {
    const result = getReleaseAwareUpNextEpisode({
      fallback: fallback({
        nextSeasonNumber: 1,
        nextEpisodeNumber: 8,
        totalEpisodes: 8,
      }),
      latestWatched: { season: 1, episode: 8 },
      watchedEpisodeCount: 8,
      releaseEvents: [
        release({
          seasonNumber: 2,
          episodeNumber: 1,
          episodeTitle: "A New Door",
        }),
      ],
      today: "2026-05-30",
    });

    expect(result).toMatchObject({
      nextSeasonNumber: 2,
      nextEpisodeNumber: 1,
      nextEpisodeName: "A New Door",
      totalEpisodes: 9,
      isUpcoming: false,
      nextEpisodeReleasedToday: true,
    });
  });

  it("does not skip the season-derived next episode just because a later release is visible", () => {
    const result = getReleaseAwareUpNextEpisode({
      fallback: fallback(),
      latestWatched: { season: 1, episode: 4 },
      watchedEpisodeCount: 4,
      releaseEvents: [
        release({
          seasonNumber: 1,
          episodeNumber: 6,
          episodeTitle: "Too Far Ahead",
        }),
      ],
      today: "2026-05-30",
    });

    expect(result).toEqual(fallback());
  });

  it("marks future release-calendar episodes as upcoming without over-promoting them", () => {
    const original = fallback({
      nextSeasonNumber: 2,
      nextEpisodeNumber: 1,
      totalEpisodes: 8,
    });
    const result = getReleaseAwareUpNextEpisode({
      fallback: original,
      latestWatched: { season: 1, episode: 8 },
      watchedEpisodeCount: 8,
      releaseEvents: [
        release({
          airDate: "2026-06-03",
          airDateTs: Date.parse("2026-06-03T12:00:00.000Z"),
          seasonNumber: 2,
          episodeNumber: 1,
          episodeTitle: "Next Week",
        }),
      ],
      today: "2026-05-30",
    });

    expect(result).toMatchObject({
      nextSeasonNumber: 2,
      nextEpisodeNumber: 1,
      nextEpisodeName: "Next Week",
      isUpcoming: true,
      nextAirDate: Date.parse("2026-06-03T12:00:00.000Z"),
      nextReleaseDate: Date.parse("2026-06-03T12:00:00.000Z"),
      nextEpisodeReleasedToday: false,
      totalEpisodes: 8,
      sortTimestamp: original.sortTimestamp,
    });
  });
});

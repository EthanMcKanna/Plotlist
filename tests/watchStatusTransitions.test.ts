import { describe, expect, it } from "@jest/globals";

import {
  listReleasedEpisodes,
  readLastAiredEpisode,
  resolveStatusAfterEpisodeChange,
  type WatchStatus,
} from "../lib/watchStatusTransitions";

describe("resolveStatusAfterEpisodeChange", () => {
  const statuses: Array<WatchStatus | null> = [
    null,
    "watchlist",
    "watching",
    "completed",
    "dropped",
  ];

  it("marks that finish an ended show always complete it", () => {
    for (const currentStatus of statuses) {
      expect(
        resolveStatusAfterEpisodeChange({
          direction: "marked",
          currentStatus,
          completesShow: true,
        }),
      ).toBe("completed");
    }
  });

  it("marking an episode never downgrades an explicit completed", () => {
    expect(
      resolveStatusAfterEpisodeChange({
        direction: "marked",
        currentStatus: "completed",
        completesShow: false,
      }),
    ).toBe("completed");
  });

  it("marking an episode moves watchlist, dropped, and untracked shows into watching", () => {
    for (const currentStatus of [null, "watchlist", "watching", "dropped"] as const) {
      expect(
        resolveStatusAfterEpisodeChange({
          direction: "marked",
          currentStatus,
          completesShow: false,
        }),
      ).toBe("watching");
    }
  });

  it("unmarking on a completed show that is no longer finished demotes to watching", () => {
    expect(
      resolveStatusAfterEpisodeChange({
        direction: "unmarked",
        currentStatus: "completed",
        completesShow: false,
      }),
    ).toBe("watching");
  });

  it("unmarking keeps completed when the show is still fully watched", () => {
    expect(
      resolveStatusAfterEpisodeChange({
        direction: "unmarked",
        currentStatus: "completed",
        completesShow: true,
      }),
    ).toBe("completed");
  });

  it("unmarking never resurrects dropped or watchlist into watching", () => {
    for (const currentStatus of ["watchlist", "watching", "dropped"] as const) {
      expect(
        resolveStatusAfterEpisodeChange({
          direction: "unmarked",
          currentStatus,
          completesShow: false,
        }),
      ).toBe(currentStatus);
    }
  });

  it("unmarking without an existing watch state creates nothing", () => {
    expect(
      resolveStatusAfterEpisodeChange({
        direction: "unmarked",
        currentStatus: null,
        completesShow: false,
      }),
    ).toBeNull();
  });
});

describe("readLastAiredEpisode", () => {
  it("reads snake_case TMDB payloads", () => {
    expect(
      readLastAiredEpisode({
        last_episode_to_air: { season_number: 3, episode_number: 7 },
      }),
    ).toEqual({ seasonNumber: 3, episodeNumber: 7 });
  });

  it("reads camelCase normalized payloads", () => {
    expect(
      readLastAiredEpisode({
        lastEpisodeToAir: { seasonNumber: 2, episodeNumber: 10 },
      }),
    ).toEqual({ seasonNumber: 2, episodeNumber: 10 });
  });

  it("rejects specials, non-numbers, and missing pointers", () => {
    expect(readLastAiredEpisode(null)).toBeNull();
    expect(readLastAiredEpisode({})).toBeNull();
    expect(
      readLastAiredEpisode({ last_episode_to_air: { season_number: 0, episode_number: 3 } }),
    ).toBeNull();
    expect(
      readLastAiredEpisode({ last_episode_to_air: { season_number: "1", episode_number: 3 } }),
    ).toBeNull();
  });
});

describe("listReleasedEpisodes", () => {
  const seasons = [
    { seasonNumber: 1, episodeCount: 2 },
    { seasonNumber: 2, episodeCount: 3 },
    { seasonNumber: 3, episodeCount: 0 },
  ];

  it("releases every known episode of an ended show", () => {
    expect(
      listReleasedEpisodes({ seasons, isEnded: true, lastAiredEpisode: null }),
    ).toEqual([
      { seasonNumber: 1, episodeNumber: 1 },
      { seasonNumber: 1, episodeNumber: 2 },
      { seasonNumber: 2, episodeNumber: 1 },
      { seasonNumber: 2, episodeNumber: 2 },
      { seasonNumber: 2, episodeNumber: 3 },
    ]);
  });

  it("releases up to the last aired episode of an airing show", () => {
    expect(
      listReleasedEpisodes({
        seasons,
        isEnded: false,
        lastAiredEpisode: { seasonNumber: 2, episodeNumber: 2 },
      }),
    ).toEqual([
      { seasonNumber: 1, episodeNumber: 1 },
      { seasonNumber: 1, episodeNumber: 2 },
      { seasonNumber: 2, episodeNumber: 1 },
      { seasonNumber: 2, episodeNumber: 2 },
    ]);
  });

  it("never runs past a stale season episode count", () => {
    expect(
      listReleasedEpisodes({
        seasons: [{ seasonNumber: 1, episodeCount: 4 }],
        isEnded: false,
        lastAiredEpisode: { seasonNumber: 1, episodeNumber: 9 },
      }),
    ).toHaveLength(4);
  });

  it("releases nothing for an airing show with no aired episodes", () => {
    expect(
      listReleasedEpisodes({ seasons, isEnded: false, lastAiredEpisode: null }),
    ).toEqual([]);
  });

  it("ignores specials and handles missing season data", () => {
    expect(
      listReleasedEpisodes({
        seasons: [{ seasonNumber: 0, episodeCount: 5 }],
        isEnded: true,
        lastAiredEpisode: null,
      }),
    ).toEqual([]);
    expect(
      listReleasedEpisodes({ seasons: null, isEnded: true, lastAiredEpisode: null }),
    ).toEqual([]);
  });
});

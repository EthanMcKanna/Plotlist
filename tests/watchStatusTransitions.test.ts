import { describe, expect, it } from "@jest/globals";

import {
  computeShowProgressFacts,
  listReleasedEpisodes,
  normalizeWatchStatus,
  readLastAiredEpisode,
  reconcileWatchStatus,
  resolveStatusAfterEpisodeChange,
  resolveWatchTier,
  type LegacyWatchStatus,
  type ShowProgressFacts,
} from "../lib/watchStatusTransitions";

function facts(overrides: Partial<ShowProgressFacts> = {}): ShowProgressFacts {
  return {
    hasWatchedAny: true,
    hasReleasedAfterFrontier: false,
    isEnded: false,
    gapEpisodes: [],
    releasedCount: 10,
    ...overrides,
  };
}

describe("resolveWatchTier", () => {
  it("is watching while released episodes remain past the frontier", () => {
    expect(resolveWatchTier(facts({ hasReleasedAfterFrontier: true }))).toBe("watching");
  });

  it("distinguishes a finished miniseries from a caught-up returning series", () => {
    expect(resolveWatchTier(facts({ isEnded: true }))).toBe("finished");
    expect(resolveWatchTier(facts({ isEnded: false }))).toBe("caught_up");
  });

  it("stays watching when metadata is too thin to judge", () => {
    expect(resolveWatchTier(facts({ releasedCount: 0 }))).toBe("watching");
  });

  it("stays watching when nothing has been watched", () => {
    expect(resolveWatchTier(facts({ hasWatchedAny: false }))).toBe("watching");
  });

  it("gaps behind the frontier don't hold a show out of caught_up", () => {
    expect(
      resolveWatchTier(
        facts({ gapEpisodes: [{ seasonNumber: 1, episodeNumber: 3 }] }),
      ),
    ).toBe("caught_up");
  });
});

describe("resolveStatusAfterEpisodeChange", () => {
  const allStatuses: Array<LegacyWatchStatus | null> = [
    null,
    "watchlist",
    "watching",
    "caught_up",
    "finished",
    "paused",
    "dropped",
    "completed",
  ];

  it("marks that reach the end of an ended show always finish it", () => {
    for (const currentStatus of allStatuses) {
      expect(
        resolveStatusAfterEpisodeChange({
          direction: "marked",
          currentStatus,
          facts: facts({ isEnded: true }),
        }),
      ).toBe("finished");
    }
  });

  it("marks that reach the frontier of a returning show land on caught_up", () => {
    expect(
      resolveStatusAfterEpisodeChange({
        direction: "marked",
        currentStatus: "watching",
        facts: facts(),
      }),
    ).toBe("caught_up");
  });

  it("marking an episode resumes watchlist, paused, dropped, and untracked shows", () => {
    for (const currentStatus of [null, "watchlist", "paused", "dropped"] as const) {
      expect(
        resolveStatusAfterEpisodeChange({
          direction: "marked",
          currentStatus,
          facts: facts({ hasReleasedAfterFrontier: true }),
        }),
      ).toBe("watching");
    }
  });

  it("unmarking demotes the watch tier when the show is no longer at the frontier", () => {
    for (const currentStatus of ["caught_up", "finished", "completed"] as const) {
      expect(
        resolveStatusAfterEpisodeChange({
          direction: "unmarked",
          currentStatus,
          facts: facts({ hasReleasedAfterFrontier: true }),
        }),
      ).toBe("watching");
    }
  });

  it("unmarking keeps finished when the show is still fully watched", () => {
    expect(
      resolveStatusAfterEpisodeChange({
        direction: "unmarked",
        currentStatus: "finished",
        facts: facts({ isEnded: true }),
      }),
    ).toBe("finished");
  });

  it("unmarking never resurrects watchlist, paused, or dropped", () => {
    for (const currentStatus of ["watchlist", "paused", "dropped"] as const) {
      expect(
        resolveStatusAfterEpisodeChange({
          direction: "unmarked",
          currentStatus,
          facts: facts({ hasReleasedAfterFrontier: true }),
        }),
      ).toBe(currentStatus);
    }
  });

  it("unmarking without an existing watch state creates nothing", () => {
    expect(
      resolveStatusAfterEpisodeChange({
        direction: "unmarked",
        currentStatus: null,
        facts: facts(),
      }),
    ).toBeNull();
  });
});

describe("reconcileWatchStatus", () => {
  it("never auto-changes user-intent statuses", () => {
    for (const currentStatus of ["watchlist", "paused", "dropped"] as const) {
      expect(
        reconcileWatchStatus({
          currentStatus,
          facts: facts({ isEnded: true }),
        }),
      ).toBe(currentStatus);
    }
  });

  it("flips caught_up to finished when the show ends", () => {
    expect(
      reconcileWatchStatus({ currentStatus: "caught_up", facts: facts({ isEnded: true }) }),
    ).toBe("finished");
  });

  it("flips caught_up back to watching when a new episode releases", () => {
    expect(
      reconcileWatchStatus({
        currentStatus: "caught_up",
        facts: facts({ hasReleasedAfterFrontier: true }),
      }),
    ).toBe("watching");
  });

  it("reopens finished to caught_up on a revival", () => {
    expect(
      reconcileWatchStatus({ currentStatus: "finished", facts: facts({ isEnded: false }) }),
    ).toBe("caught_up");
  });

  it("promotes watching to the caught-up tier once the frontier is reached", () => {
    expect(
      reconcileWatchStatus({ currentStatus: "watching", facts: facts() }),
    ).toBe("caught_up");
  });

  it("resolves legacy completed against real show state", () => {
    expect(
      reconcileWatchStatus({ currentStatus: "completed", facts: facts({ isEnded: true }) }),
    ).toBe("finished");
    expect(
      reconcileWatchStatus({ currentStatus: "completed", facts: facts({ isEnded: false }) }),
    ).toBe("caught_up");
  });

  it("legacy completed with no usable metadata reads as finished", () => {
    expect(
      reconcileWatchStatus({
        currentStatus: "completed",
        facts: facts({ releasedCount: 0 }),
      }),
    ).toBe("finished");
  });

  it("holds the stored tier when metadata is too thin to judge", () => {
    expect(
      reconcileWatchStatus({
        currentStatus: "caught_up",
        facts: facts({ releasedCount: 0 }),
      }),
    ).toBe("caught_up");
  });
});

describe("computeShowProgressFacts", () => {
  const seasons = [
    { seasonNumber: 1, episodeCount: 3 },
    { seasonNumber: 2, episodeCount: 2 },
  ];

  it("detects gaps behind the frontier and releases past it", () => {
    const result = computeShowProgressFacts({
      watchedEpisodes: [
        { seasonNumber: 1, episodeNumber: 1 },
        { seasonNumber: 1, episodeNumber: 3 },
      ],
      seasons,
      isEnded: false,
      lastAiredEpisode: { seasonNumber: 2, episodeNumber: 1 },
    });
    expect(result.hasWatchedAny).toBe(true);
    expect(result.hasReleasedAfterFrontier).toBe(true); // S2E1 is out
    expect(result.gapEpisodes).toEqual([{ seasonNumber: 1, episodeNumber: 2 }]);
    expect(result.releasedCount).toBe(4);
  });

  it("reports caught up at the released frontier even mid-season", () => {
    const result = computeShowProgressFacts({
      watchedEpisodes: [
        { seasonNumber: 1, episodeNumber: 1 },
        { seasonNumber: 1, episodeNumber: 2 },
      ],
      seasons,
      isEnded: false,
      lastAiredEpisode: { seasonNumber: 1, episodeNumber: 2 },
    });
    expect(result.hasReleasedAfterFrontier).toBe(false);
    expect(resolveWatchTier(result)).toBe("caught_up");
  });

  it("counts every known episode for ended shows", () => {
    const result = computeShowProgressFacts({
      watchedEpisodes: [{ seasonNumber: 2, episodeNumber: 2 }],
      seasons,
      isEnded: true,
      lastAiredEpisode: null,
    });
    expect(result.releasedCount).toBe(5);
    expect(result.hasReleasedAfterFrontier).toBe(false);
    expect(result.gapEpisodes).toHaveLength(4);
  });
});

describe("normalizeWatchStatus", () => {
  it("maps legacy completed to finished and rejects junk", () => {
    expect(normalizeWatchStatus("completed")).toBe("finished");
    expect(normalizeWatchStatus("paused")).toBe("paused");
    expect(normalizeWatchStatus("banana")).toBeNull();
    expect(normalizeWatchStatus(null)).toBeNull();
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

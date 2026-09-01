import { describe, expect, it } from "@jest/globals";

import {
  findQueuedEpisodeAfter,
  getQueuedEpisodeAirStatus,
  normalizeContinueEpisodeQueue,
  trimQueueAfter,
} from "../lib/continueEpisodeQueue";

const queue = normalizeContinueEpisodeQueue([
  {
    seasonNumber: 2,
    episodeNumber: 8,
    name: "Finale",
    stillUrl: "s2e8.jpg",
    overview: "It ends.",
    runtime: 58,
    airDate: "2026-06-01",
    airDateTs: Date.parse("2026-06-01T00:00:00.000Z"),
  },
  {
    seasonNumber: 3,
    episodeNumber: 1,
    name: "Return",
    stillUrl: null,
    overview: null,
    runtime: null,
    airDate: "2026-09-15",
    airDateTs: Date.parse("2026-09-15T00:00:00.000Z"),
  },
  // Out of order on purpose: the queue sorts itself.
  {
    seasonNumber: 2,
    episodeNumber: 7,
    name: "Penultimate",
    stillUrl: null,
    overview: null,
    runtime: 0,
    airDate: null,
    airDateTs: null,
  },
]);

describe("continue episode queue", () => {
  it("normalizes into episode order and drops junk", () => {
    expect(queue.map((entry) => `${entry.seasonNumber}:${entry.episodeNumber}`)).toEqual([
      "2:7",
      "2:8",
      "3:1",
    ]);
    // Zero runtimes read as unknown; duplicates and invalid positions vanish.
    expect(queue[0].runtime).toBeNull();
    expect(
      normalizeContinueEpisodeQueue([
        { seasonNumber: 1, episodeNumber: 1 },
        { seasonNumber: 1, episodeNumber: 1 },
        { seasonNumber: 0, episodeNumber: 3 },
        { seasonNumber: 1, episodeNumber: -2 },
      ]),
    ).toHaveLength(1);
    expect(normalizeContinueEpisodeQueue(undefined)).toEqual([]);
  });

  it("finds the next queued episode after the frontier, across a season boundary", () => {
    expect(findQueuedEpisodeAfter(queue, { seasonNumber: 2, episodeNumber: 6 })?.name).toBe(
      "Penultimate",
    );
    expect(findQueuedEpisodeAfter(queue, { seasonNumber: 2, episodeNumber: 8 })?.name).toBe(
      "Return",
    );
    expect(findQueuedEpisodeAfter(queue, { seasonNumber: 3, episodeNumber: 1 })).toBeNull();
    expect(findQueuedEpisodeAfter(queue, null)?.name).toBe("Penultimate");
  });

  it("trims everything at or before a position", () => {
    expect(
      trimQueueAfter(queue, { seasonNumber: 2, episodeNumber: 8 }).map((entry) => entry.name),
    ).toEqual(["Return"]);
  });

  it("reads air status against the user's local day", () => {
    expect(getQueuedEpisodeAirStatus(queue[2], "2026-09-01")).toEqual({
      isUpcoming: true,
      releasedToday: false,
      nextAirDate: Date.parse("2026-09-15T00:00:00.000Z"),
      nextReleaseDate: Date.parse("2026-09-15T00:00:00.000Z"),
    });
    expect(getQueuedEpisodeAirStatus(queue[1], "2026-06-01")).toEqual({
      isUpcoming: false,
      releasedToday: true,
      nextAirDate: null,
      nextReleaseDate: Date.parse("2026-06-01T00:00:00.000Z"),
    });
    expect(getQueuedEpisodeAirStatus(queue[1], "2026-06-20").releasedToday).toBe(false);
    // Listed but undated: not out yet.
    expect(getQueuedEpisodeAirStatus(queue[0], "2026-06-20")).toMatchObject({
      isUpcoming: true,
      nextAirDate: null,
    });
  });
});

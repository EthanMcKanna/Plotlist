import { describe, expect, it, jest } from "@jest/globals";

import {
  optimisticMarkEpisodeWatched,
  optimisticToggleEpisode,
} from "../lib/episodeProgressOptimistic";
import { api, getFunctionName } from "../lib/plotlist/api";
import type { LocalStore } from "../lib/plotlist/react";

function keyFor(query: unknown, args: Record<string, any> | undefined) {
  return `${getFunctionName(query)}:${JSON.stringify(args)}`;
}

function createLocalStore(initial: Array<{
  query: unknown;
  args?: Record<string, any>;
  data: any;
}> = []) {
  const data = new Map<string, any>();
  for (const entry of initial) {
    data.set(keyFor(entry.query, entry.args), entry.data);
  }

  const store: LocalStore = {
    getQuery: (query, args) => data.get(keyFor(query, args)),
    setQuery: (query, args, value) => {
      data.set(keyFor(query, args), value);
    },
    setPaginatedQuery: jest.fn(),
    patchQueriesByName: jest.fn(),
  };

  return {
    store,
    get: (query: unknown, args?: Record<string, any>) =>
      data.get(keyFor(query, args)),
  };
}

describe("episode progress optimistic cache updates", () => {
  it("rolls the home rail into the next season when marking a season finale", () => {
    const watchedEpisodes = Array.from({ length: 9 }, (_, index) => ({
      _id: `episode_${index + 1}`,
      showId: "show_1",
      seasonNumber: 1,
      episodeNumber: index + 1,
      watchedAt: 1_700_000_000_000 + index,
    }));
    const { store, get } = createLocalStore([
      {
        query: api.episodeProgress.getProgressForShow,
        args: { showId: "show_1" },
        data: watchedEpisodes,
      },
      {
        query: api.episodeProgress.getUpNext,
        data: [
          {
            showId: "show_1",
            totalWatched: 9,
            totalEpisodes: 18,
            progressPct: 0.5,
            nextSeasonNumber: 1,
            nextEpisodeNumber: 10,
            nextEpisodeName: "Finale",
            nextEpisodeReleasedToday: true,
            seasons: [
              { seasonNumber: 1, episodeCount: 10, airDate: null },
              { seasonNumber: 2, episodeCount: 8, airDate: null },
            ],
          },
        ],
      },
    ]);

    optimisticMarkEpisodeWatched(store, {
      showId: "show_1",
      seasonNumber: 1,
      episodeNumber: 10,
    });

    expect(get(api.episodeProgress.getUpNext)).toEqual([
      expect.objectContaining({
        showId: "show_1",
        totalWatched: 10,
        progressPct: 10 / 18,
        nextSeasonNumber: 2,
        nextEpisodeNumber: 1,
        nextEpisodeName: null,
        nextEpisodeReleasedToday: false,
        isCaughtUp: false,
      }),
    ]);
  });

  it("marks the home rail caught up instead of inventing an episode after the finale", () => {
    const { store, get } = createLocalStore([
      {
        query: api.episodeProgress.getProgressForShow,
        args: { showId: "show_1" },
        data: [
          {
            _id: "episode_1",
            showId: "show_1",
            seasonNumber: 1,
            episodeNumber: 1,
            watchedAt: 1_700_000_000_000,
          },
        ],
      },
      {
        query: api.episodeProgress.getUpNext,
        data: [
          {
            showId: "show_1",
            totalWatched: 1,
            totalEpisodes: 2,
            progressPct: 0.5,
            nextSeasonNumber: 1,
            nextEpisodeNumber: 2,
            seasons: [{ seasonNumber: 1, episodeCount: 2, airDate: null }],
          },
        ],
      },
    ]);

    optimisticMarkEpisodeWatched(store, {
      showId: "show_1",
      seasonNumber: 1,
      episodeNumber: 2,
    });

    expect(get(api.episodeProgress.getUpNext)).toEqual([
      expect.objectContaining({
        totalWatched: 2,
        progressPct: 1,
        nextSeasonNumber: 1,
        nextEpisodeNumber: 2,
        isCaughtUp: true,
      }),
    ]);
  });

  it("can roll seasons from the home item even when the per-show progress cache has not loaded", () => {
    const { store, get } = createLocalStore([
      {
        query: api.episodeProgress.getUpNext,
        data: [
          {
            showId: "show_1",
            totalWatched: 0,
            totalEpisodes: 6,
            progressPct: 0,
            nextSeasonNumber: 1,
            nextEpisodeNumber: 1,
            seasons: [
              { seasonNumber: 1, episodeCount: 1, airDate: null },
              { seasonNumber: 2, episodeCount: 5, airDate: null },
            ],
          },
        ],
      },
    ]);

    optimisticMarkEpisodeWatched(store, {
      showId: "show_1",
      seasonNumber: 1,
      episodeNumber: 1,
    });

    expect(get(api.episodeProgress.getUpNext)).toEqual([
      expect.objectContaining({
        totalWatched: 1,
        nextSeasonNumber: 2,
        nextEpisodeNumber: 1,
        isCaughtUp: false,
      }),
    ]);
  });

  it("advances a stale continue watching item when marking from home", () => {
    const { store, get } = createLocalStore([
      {
        query: api.episodeProgress.getUpNext,
        data: [
          {
            showId: "show_1",
            totalWatched: 0,
            totalEpisodes: 10,
            progressPct: 0,
            nextSeasonNumber: 1,
            nextEpisodeNumber: 1,
          },
        ],
      },
    ]);

    optimisticMarkEpisodeWatched(store, {
      showId: "show_1",
      seasonNumber: 1,
      episodeNumber: 1,
    });

    expect(get(api.episodeProgress.getProgressForShow, { showId: "show_1" }))
      .toEqual([
        expect.objectContaining({
          showId: "show_1",
          seasonNumber: 1,
          episodeNumber: 1,
        }),
      ]);
    expect(get(api.episodeProgress.getUpNext)).toEqual([
      expect.objectContaining({
        showId: "show_1",
        totalWatched: 1,
        progressPct: 0.1,
        nextSeasonNumber: 1,
        nextEpisodeNumber: 2,
      }),
    ]);
  });

  it("does not unwatch an already-watched episode when the home rail is stale", () => {
    const existingProgress = {
      _id: "episode_1",
      showId: "show_1",
      seasonNumber: 1,
      episodeNumber: 1,
      watchedAt: 1_700_000_000_000,
    };
    const { store, get } = createLocalStore([
      {
        query: api.episodeProgress.getProgressForShow,
        args: { showId: "show_1" },
        data: [existingProgress],
      },
      {
        query: api.episodeProgress.getUpNext,
        data: [
          {
            showId: "show_1",
            totalWatched: 0,
            totalEpisodes: 10,
            progressPct: 0,
            nextSeasonNumber: 1,
            nextEpisodeNumber: 1,
          },
        ],
      },
    ]);

    optimisticMarkEpisodeWatched(store, {
      showId: "show_1",
      seasonNumber: 1,
      episodeNumber: 1,
    });

    expect(get(api.episodeProgress.getProgressForShow, { showId: "show_1" }))
      .toEqual([existingProgress]);
    expect(get(api.episodeProgress.getUpNext)).toEqual([
      expect.objectContaining({
        totalWatched: 1,
        nextEpisodeNumber: 2,
      }),
    ]);
  });

  it("keeps an ongoing show active when the server total is release-inflated", () => {
    // The server reports totalEpisodes = watchedCount + 1 for ongoing shows
    // with a released next episode; marking that episode must not flip the
    // card to caught-up (it used to vanish and flash back on refetch).
    const { store, get } = createLocalStore([
      {
        query: api.episodeProgress.getProgressForShow,
        args: { showId: "show_1" },
        data: Array.from({ length: 7 }, (_, index) => ({
          _id: `episode_${index + 1}`,
          showId: "show_1",
          seasonNumber: 1,
          episodeNumber: index + 1,
          watchedAt: 1_700_000_000_000 + index,
        })),
      },
      {
        query: api.episodeProgress.getUpNext,
        data: [
          {
            showId: "show_1",
            totalWatched: 7,
            totalEpisodes: 8,
            progressPct: 7 / 8,
            nextSeasonNumber: 1,
            nextEpisodeNumber: 8,
            nextReleaseDate: 1_750_000_000_000,
            nextEpisodeReleasedToday: true,
          },
        ],
      },
    ]);

    optimisticMarkEpisodeWatched(store, {
      showId: "show_1",
      seasonNumber: 1,
      episodeNumber: 8,
    });

    expect(get(api.episodeProgress.getUpNext)).toEqual([
      expect.objectContaining({
        totalWatched: 8,
        isCaughtUp: false,
      }),
    ]);
  });

  it("flags freshly caught-up items so the rail can keep them until the server confirms", () => {
    const { store, get } = createLocalStore([
      {
        query: api.episodeProgress.getUpNext,
        data: [
          {
            showId: "show_1",
            totalWatched: 1,
            totalEpisodes: 2,
            progressPct: 0.5,
            nextSeasonNumber: 1,
            nextEpisodeNumber: 2,
            seasons: [{ seasonNumber: 1, episodeCount: 2, airDate: null }],
          },
        ],
      },
    ]);

    optimisticMarkEpisodeWatched(store, {
      showId: "show_1",
      seasonNumber: 1,
      episodeNumber: 2,
    });

    expect(get(api.episodeProgress.getUpNext)).toEqual([
      expect.objectContaining({
        isCaughtUp: true,
        optimisticCaughtUp: true,
      }),
    ]);
  });

  it("toggles show-detail episode progress immediately", () => {
    const { store, get } = createLocalStore([
      {
        query: api.episodeProgress.getProgressForShow,
        args: { showId: "show_1" },
        data: [
          {
            _id: "episode_1",
            showId: "show_1",
            seasonNumber: 1,
            episodeNumber: 1,
            watchedAt: 1_700_000_000_000,
          },
        ],
      },
    ]);

    optimisticToggleEpisode(store, {
      showId: "show_1",
      seasonNumber: 1,
      episodeNumber: 1,
    });

    expect(get(api.episodeProgress.getProgressForShow, { showId: "show_1" }))
      .toEqual([]);
  });
});

describe("queue-driven optimistic repaints", () => {
  const { getLocalDateString, addDaysToDateOnlyString } = require("../lib/releaseCalendar");
  const today: string = getLocalDateString(new Date());
  const day = (offset: number) => addDaysToDateOnlyString(today, offset) as string;
  const dayTs = (offset: number) => Date.parse(`${day(offset)}T00:00:00.000Z`);
  const queued = (
    seasonNumber: number,
    episodeNumber: number,
    name: string,
    airOffset: number | null,
  ) => ({
    seasonNumber,
    episodeNumber,
    name,
    stillUrl: `${name}.jpg`,
    overview: `${name} overview`,
    runtime: 45,
    airDate: airOffset === null ? null : day(airOffset),
    airDateTs: airOffset === null ? null : dayTs(airOffset),
  });

  it("paints the next episode's real metadata from the queue instead of a placeholder", () => {
    const { store, get } = createLocalStore([
      {
        query: api.episodeProgress.getUpNext,
        data: [
          {
            showId: "show_1",
            totalWatched: 4,
            totalEpisodes: 10,
            nextSeasonNumber: 2,
            nextEpisodeNumber: 5,
            nextEpisodeName: "Five",
            nextEpisodeStillUrl: "five.jpg",
            nextEpisodeRuntime: 44,
            seasons: [{ seasonNumber: 1, episodeCount: 0 }, { seasonNumber: 2, episodeCount: 10 }],
            nextEpisodes: [
              queued(2, 6, "Six", -20),
              queued(2, 7, "Seven", -13),
              queued(2, 8, "Eight", -6),
            ],
          },
        ],
      },
    ]);

    optimisticMarkEpisodeWatched(store, { showId: "show_1", seasonNumber: 2, episodeNumber: 5 });

    expect(get(api.episodeProgress.getUpNext)).toEqual([
      expect.objectContaining({
        totalWatched: 5,
        nextSeasonNumber: 2,
        nextEpisodeNumber: 6,
        nextEpisodeName: "Six",
        nextEpisodeStillUrl: "Six.jpg",
        nextEpisodeOverview: "Six overview",
        nextEpisodeRuntime: 45,
        isUpcoming: false,
        isCaughtUp: false,
        // An old backlog episode is not a fresh drop.
        nextEpisodeReleasedToday: false,
        nextEpisodes: [
          expect.objectContaining({ episodeNumber: 7 }),
          expect.objectContaining({ episodeNumber: 8 }),
        ],
      }),
    ]);
    expect(get(api.episodeProgress.getUpNext)[0].nextReleaseDate).toBe(dayTs(-20));
  });

  it("flips a weekly show to 'airs next week' the moment tonight's episode is marked", () => {
    const { store, get } = createLocalStore([
      {
        query: api.episodeProgress.getUpNext,
        data: [
          {
            showId: "show_1",
            totalWatched: 5,
            totalEpisodes: 10,
            nextSeasonNumber: 2,
            nextEpisodeNumber: 6,
            nextEpisodeReleasedToday: true,
            nextReleaseDate: dayTs(0),
            seasons: [{ seasonNumber: 2, episodeCount: 10 }],
            nextEpisodes: [queued(2, 7, "Seven", 7), queued(2, 8, "Eight", 14)],
          },
        ],
      },
    ]);

    optimisticMarkEpisodeWatched(store, { showId: "show_1", seasonNumber: 2, episodeNumber: 6 });

    expect(get(api.episodeProgress.getUpNext)[0]).toMatchObject({
      nextEpisodeNumber: 7,
      nextEpisodeName: "Seven",
      isUpcoming: true,
      nextAirDate: dayTs(7),
      nextEpisodeReleasedToday: false,
      isCaughtUp: false,
    });
  });

  it("crosses into the next season when the queue looked ahead", () => {
    const { store, get } = createLocalStore([
      {
        query: api.episodeProgress.getUpNext,
        data: [
          {
            showId: "show_1",
            totalWatched: 7,
            totalEpisodes: 8,
            nextSeasonNumber: 1,
            nextEpisodeNumber: 8,
            seasons: [{ seasonNumber: 1, episodeCount: 8 }],
            nextEpisodes: [queued(2, 1, "Premiere", -3)],
          },
        ],
      },
    ]);

    optimisticMarkEpisodeWatched(store, { showId: "show_1", seasonNumber: 1, episodeNumber: 8 });

    // The summary alone would have called this caught up; the queue knows better.
    expect(get(api.episodeProgress.getUpNext)[0]).toMatchObject({
      nextSeasonNumber: 2,
      nextEpisodeNumber: 1,
      nextEpisodeName: "Premiere",
      isCaughtUp: false,
      totalEpisodes: 9,
      nextEpisodes: [],
    });
  });

  it("reads an empty queue after the finale as caught up rather than inventing an episode", () => {
    const { store, get } = createLocalStore([
      {
        query: api.episodeProgress.getUpNext,
        data: [
          {
            showId: "show_1",
            totalWatched: 7,
            totalEpisodes: 8,
            nextSeasonNumber: 1,
            nextEpisodeNumber: 8,
            seasons: [{ seasonNumber: 1, episodeCount: 8 }],
            nextEpisodes: [],
          },
        ],
      },
    ]);

    optimisticMarkEpisodeWatched(store, { showId: "show_1", seasonNumber: 1, episodeNumber: 8 });

    expect(get(api.episodeProgress.getUpNext)[0]).toMatchObject({
      isCaughtUp: true,
      optimisticCaughtUp: true,
      nextEpisodes: [],
    });
  });

  it("shows an announced-but-empty next season as coming soon after the finale", () => {
    const { store, get } = createLocalStore([
      {
        query: api.episodeProgress.getUpNext,
        data: [
          {
            showId: "show_1",
            totalWatched: 7,
            totalEpisodes: 8,
            nextSeasonNumber: 1,
            nextEpisodeNumber: 8,
            seasons: [
              { seasonNumber: 1, episodeCount: 8 },
              { seasonNumber: 2, episodeCount: 0 },
            ],
            nextEpisodes: [],
          },
        ],
      },
    ]);

    optimisticMarkEpisodeWatched(store, { showId: "show_1", seasonNumber: 1, episodeNumber: 8 });

    expect(get(api.episodeProgress.getUpNext)[0]).toMatchObject({
      nextSeasonNumber: 2,
      nextEpisodeNumber: 1,
      isCaughtUp: false,
      isUpcoming: true,
      nextAirDate: null,
      nextEpisodeName: null,
    });
  });

  it("patches every bucket of the sectioned continue surface too", () => {
    const card = {
      showId: "show_1",
      totalWatched: 4,
      totalEpisodes: 10,
      nextSeasonNumber: 2,
      nextEpisodeNumber: 5,
      seasons: [{ seasonNumber: 2, episodeCount: 10 }],
      nextEpisodes: [queued(2, 6, "Six", -1)],
    };
    const { store, get } = createLocalStore([
      {
        query: api.episodeProgress.getContinue,
        args: { utcOffsetMinutes: -new Date().getTimezoneOffset() },
        data: {
          resume: [card],
          newEpisodes: [],
          returning: [{ showId: "show_2", nextSeasonNumber: 1, nextEpisodeNumber: 1 }],
          gaps: [card],
          paused: [],
          dropped: [],
          generatedAt: 1,
        },
      },
    ]);

    optimisticMarkEpisodeWatched(store, { showId: "show_1", seasonNumber: 2, episodeNumber: 5 });

    const surface = get(api.episodeProgress.getContinue, {
      utcOffsetMinutes: -new Date().getTimezoneOffset(),
    });
    expect(surface.resume[0]).toMatchObject({ nextEpisodeNumber: 6, nextEpisodeName: "Six" });
    expect(surface.gaps[0]).toMatchObject({ nextEpisodeNumber: 6 });
    expect(surface.returning[0]).toEqual({
      showId: "show_2",
      nextSeasonNumber: 1,
      nextEpisodeNumber: 1,
    });
    expect(surface.generatedAt).toBe(1);
  });
});

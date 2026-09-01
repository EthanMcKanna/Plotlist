import { describe, expect, it } from "@jest/globals";

import {
  applyStatusChangeToCounts,
  applyStatusToContinueSurface,
  applyStatusToDetailedRows,
  applyStatusToStateRows,
  applyStatusToUpNextItems,
  optimisticRemoveWatchStatus,
  optimisticSetWatchStatus,
  watchStatusMatchesFilter,
} from "../lib/watchStatusOptimistic";
import { api, getFunctionName } from "../lib/plotlist/api";
import type { LocalStore } from "../lib/plotlist/react";

type Entry = { query: unknown; args?: Record<string, any>; data: any; paginated?: boolean };

function keyFor(query: unknown, args: Record<string, any> | undefined) {
  return `${getFunctionName(query)}:${JSON.stringify(args ?? null)}`;
}

// Mirrors the real LocalStore closely enough to exercise the args-agnostic
// patching: plain queries live in one map keyed by name+args, paginated ones
// in another keyed the same way, and patchQueriesByName walks every plain
// entry for the name.
function createLocalStore(initial: Entry[] = []) {
  const plain = new Map<string, { args: Record<string, any> | undefined; data: any }>();
  const paginated = new Map<string, { args: Record<string, any>; data: any }>();
  for (const entry of initial) {
    if (entry.paginated) {
      paginated.set(keyFor(entry.query, entry.args), { args: entry.args ?? {}, data: entry.data });
    } else {
      plain.set(keyFor(entry.query, entry.args), { args: entry.args, data: entry.data });
    }
  }
  const nameOf = (query: unknown) => getFunctionName(query);
  const store: LocalStore = {
    getQuery: (query, args) => plain.get(keyFor(query, args))?.data,
    setQuery: (query, args, value) => {
      plain.set(keyFor(query, args), { args, data: value });
    },
    setPaginatedQuery: (query, args, updater) => {
      for (const [key, record] of paginated) {
        if (!key.startsWith(`${nameOf(query)}:`)) continue;
        const matches = Object.entries(args).every(
          ([argKey, argValue]) => record.args[argKey] === argValue,
        );
        if (!matches) continue;
        record.data = updater(record.data);
      }
    },
    patchQueriesByName: (query, updater) => {
      for (const [key, record] of plain) {
        if (!key.startsWith(`${nameOf(query)}:`)) continue;
        const next = updater(record.data, record.args);
        if (next !== undefined && next !== record.data) record.data = next;
      }
    },
  };
  return {
    store,
    get: (query: unknown, args?: Record<string, any>) => plain.get(keyFor(query, args))?.data,
    getPaginated: (query: unknown, args: Record<string, any>) =>
      paginated.get(keyFor(query, args))?.data,
  };
}

const show = {
  _id: "show_1",
  title: "Severance",
  posterUrl: "https://img/poster.jpg",
  backdropUrl: null,
  externalId: "95396",
};

describe("watchStatusMatchesFilter", () => {
  it("mirrors the server's legacy completed/finished aliases", () => {
    expect(watchStatusMatchesFilter("caught_up", "completed")).toBe(true);
    expect(watchStatusMatchesFilter("finished", "completed")).toBe(true);
    expect(watchStatusMatchesFilter("completed", "finished")).toBe(true);
    expect(watchStatusMatchesFilter("caught_up", "finished")).toBe(false);
    expect(watchStatusMatchesFilter("watching", undefined)).toBe(true);
    expect(watchStatusMatchesFilter("watching", "paused")).toBe(false);
  });
});

describe("applyStatusChangeToCounts", () => {
  const keyOf = (status: string) => ({ watching: "watching", paused: "paused" })[status];

  it("moves a show between tallies without touching the total", () => {
    const next = applyStatusChangeToCounts(
      { watching: 3, paused: 1, total: 4 },
      "watching",
      "paused",
      keyOf,
      "total",
    );
    expect(next).toEqual({ watching: 2, paused: 2, total: 4 });
  });

  it("counts a brand-new show into the total and removals out of it", () => {
    expect(
      applyStatusChangeToCounts({ watching: 0, total: 0 }, null, "watching", keyOf, "total"),
    ).toEqual({ watching: 1, total: 1 });
    expect(
      applyStatusChangeToCounts({ watching: 1, total: 1 }, "watching", null, keyOf, "total"),
    ).toEqual({ watching: 0, total: 0 });
  });
});

describe("applyStatusToStateRows / applyStatusToDetailedRows", () => {
  const state = { _id: "state_1", showId: "show_1", status: "paused", updatedAt: 10 };

  it("keeps a row only in lists whose filter admits the new status", () => {
    const rows = [
      { _id: "state_1", showId: "show_1", status: "watching", updatedAt: 1 },
      { _id: "state_2", showId: "show_2", status: "watching", updatedAt: 2 },
    ];
    expect(applyStatusToStateRows(rows, state, "watching").map((row) => row.showId)).toEqual([
      "show_2",
    ]);
    expect(applyStatusToStateRows(rows, state, "paused")[0]).toBe(state);
    expect(applyStatusToStateRows(rows, state, undefined)[0]).toBe(state);
    // Not in the list and not admitted: untouched reference.
    const untouched = [rows[1]];
    expect(applyStatusToStateRows(untouched, state, "dropped")).toBe(untouched);
  });

  it("inserts a detailed row only when a show doc is available", () => {
    const empty: any[] = [];
    expect(applyStatusToDetailedRows(empty, state, null, undefined)).toBe(empty);
    const next = applyStatusToDetailedRows(empty, state, show, "paused");
    expect(next).toHaveLength(1);
    expect(next[0].show).toBe(show);
    expect(next[0].state?.status).toBe("paused");
  });

  it("retains the existing show doc and row identity when changing status", () => {
    const rows = [
      { state: { _id: "state_1", showId: "show_1", status: "watching", updatedAt: 1 }, show },
    ];
    const next = applyStatusToDetailedRows(rows, state, null, undefined);
    expect(next[0].state?._id).toBe("state_1");
    expect(next[0].state?.status).toBe("paused");
    expect(next[0].show).toBe(show);
  });
});

describe("continue caches", () => {
  const card = { showId: "show_1", status: "watching", show, totalWatched: 2 };
  const other = { showId: "show_2", status: "watching", show, totalWatched: 0 };

  it("adds a rail card for a show that becomes watching and removes it otherwise", () => {
    const added = applyStatusToUpNextItems([other], "show_1", "watching", () => card);
    expect(added.map((item) => item.showId)).toEqual(["show_1", "show_2"]);
    expect(applyStatusToUpNextItems([card, other], "show_1", "paused", () => card)).toEqual([
      other,
    ]);
    const untouched = [other];
    expect(applyStatusToUpNextItems(untouched, "show_1", "finished", () => card)).toBe(untouched);
    expect(applyStatusToUpNextItems(untouched, "show_1", "watching", () => null)).toBe(untouched);
  });

  it("moves a /continue card between buckets to match its new status", () => {
    const surface = { resume: [card, other], gaps: [card], paused: [], dropped: [] };
    const paused = applyStatusToContinueSurface(surface, "show_1", "paused", () => null);
    expect(paused.resume).toEqual([other]);
    expect(paused.gaps).toEqual([]);
    expect(paused.paused?.[0]).toMatchObject({ showId: "show_1", status: "paused" });

    const resumed = applyStatusToContinueSurface(paused, "show_1", "watching", () => null);
    expect(resumed.paused).toEqual([]);
    expect(resumed.resume?.[0]).toMatchObject({ showId: "show_1", status: "watching" });

    const finished = applyStatusToContinueSurface(surface, "show_1", "finished", () => null);
    expect(finished.resume).toEqual([other]);
    // Finished shows are still active-tier: a gap keeps nagging.
    expect(finished.gaps?.[0]).toMatchObject({ showId: "show_1", status: "finished" });

    const gone = applyStatusToContinueSurface(surface, "show_1", null, () => null);
    expect(gone.resume).toEqual([other]);
    expect(gone.gaps).toEqual([]);
  });

  it("keeps a caught-up show in returning even when it is set to watching", () => {
    const waiting = { ...card, isCaughtUp: true };
    const surface = { resume: [], returning: [waiting] };
    const next = applyStatusToContinueSurface(surface, "show_1", "watching", () => null);
    expect(next.resume).toEqual([]);
    expect(next.returning?.[0]).toMatchObject({ showId: "show_1", status: "watching" });
  });
});

describe("optimisticSetWatchStatus", () => {
  const detailedArgs = (status: string | undefined) => ({
    status,
    sortBy: "recent",
    paginationOpts: { cursor: null, numItems: 40 },
  });
  const detailedPage = (rows: any[]) => ({ page: rows, results: rows, isDone: true });

  function seed() {
    return createLocalStore([
      {
        query: api.watchStates.getForShow,
        args: { showId: "show_1" },
        data: { _id: "state_1", userId: "user_1", showId: "show_1", status: "watching", updatedAt: 1 },
      },
      { query: api.shows.get, args: { showId: "show_1" }, data: show },
      {
        query: api.watchStates.listForUser,
        args: {},
        data: [{ _id: "state_1", showId: "show_1", status: "watching", updatedAt: 1 }],
      },
      {
        query: api.watchStates.listForUser,
        args: { status: "watching", limit: 50 },
        data: [{ _id: "state_1", showId: "show_1", status: "watching", updatedAt: 1 }],
      },
      {
        query: api.watchStates.listForUser,
        args: { status: "completed", limit: 50 },
        data: [],
      },
      {
        query: api.watchStates.getCounts,
        args: {},
        data: { watching: 1, caughtUp: 0, finished: 0, paused: 0, total: 1 },
      },
      {
        query: api.users.me,
        args: {},
        data: { _id: "user_1", countsWatching: 1, countsCaughtUp: 0, countsTotalShows: 1 },
      },
      {
        query: api.episodeProgress.getUpNext,
        args: { utcOffsetMinutes: -300 },
        data: [{ showId: "show_1", status: "watching", show, totalWatched: 2 }],
      },
      {
        query: api.episodeProgress.getContinue,
        args: { utcOffsetMinutes: -300 },
        data: { resume: [{ showId: "show_1", status: "watching", show }], paused: [] },
      },
      {
        query: api.watchStates.listForUserDetailed,
        args: detailedArgs(undefined),
        paginated: true,
        data: detailedPage([
          { state: { _id: "state_1", showId: "show_1", status: "watching" }, show },
        ]),
      },
      {
        query: api.watchStates.listForUserDetailed,
        args: detailedArgs("watching"),
        paginated: true,
        data: detailedPage([
          { state: { _id: "state_1", showId: "show_1", status: "watching" }, show },
        ]),
      },
      {
        query: api.watchStates.listForUserDetailed,
        args: detailedArgs("caught_up"),
        paginated: true,
        data: detailedPage([]),
      },
    ]);
  }

  it("patches every library, count and continue cache for a status change", () => {
    const { store, get, getPaginated } = seed();
    optimisticSetWatchStatus(store, { showId: "show_1", status: "caught_up" });

    expect(get(api.watchStates.getForShow, { showId: "show_1" })).toMatchObject({
      _id: "state_1",
      status: "caught_up",
    });
    // Flat lists under every arg shape.
    expect(get(api.watchStates.listForUser, {})[0].status).toBe("caught_up");
    expect(get(api.watchStates.listForUser, { status: "watching", limit: 50 })).toEqual([]);
    expect(get(api.watchStates.listForUser, { status: "completed", limit: 50 })).toHaveLength(1);
    // Both count docs.
    expect(get(api.watchStates.getCounts, {})).toMatchObject({ watching: 0, caughtUp: 1, total: 1 });
    expect(get(api.users.me, {})).toMatchObject({
      countsWatching: 0,
      countsCaughtUp: 1,
      countsTotalShows: 1,
    });
    // Rail loses the card; /continue moves it to returning.
    expect(get(api.episodeProgress.getUpNext, { utcOffsetMinutes: -300 })).toEqual([]);
    const surface = get(api.episodeProgress.getContinue, { utcOffsetMinutes: -300 });
    expect(surface.resume).toEqual([]);
    expect(surface.returning[0]).toMatchObject({ showId: "show_1", status: "caught_up" });
    // Paginated detailed lists per filter.
    expect(
      getPaginated(api.watchStates.listForUserDetailed, detailedArgs(undefined)).results[0].state
        .status,
    ).toBe("caught_up");
    expect(
      getPaginated(api.watchStates.listForUserDetailed, detailedArgs("watching")).results,
    ).toEqual([]);
    expect(
      getPaginated(api.watchStates.listForUserDetailed, detailedArgs("caught_up")).results[0],
    ).toMatchObject({ state: { showId: "show_1", status: "caught_up" } });
  });

  it("builds a rail card from the cached show when a new show starts watching", () => {
    const { store, get } = createLocalStore([
      { query: api.shows.get, args: { showId: "show_9" }, data: { ...show, _id: "show_9" } },
      {
        query: api.episodeProgress.getProgressForShow,
        args: { showId: "show_9" },
        data: [
          { showId: "show_9", seasonNumber: 1, episodeNumber: 1 },
          { showId: "show_9", seasonNumber: 1, episodeNumber: 2 },
        ],
      },
      { query: api.episodeProgress.getUpNext, args: {}, data: [] },
      { query: api.watchStates.getCounts, args: {}, data: { watching: 0, total: 0 } },
    ]);
    optimisticSetWatchStatus(store, { showId: "show_9", status: "watching" }, { userId: "user_1" });
    const [card] = get(api.episodeProgress.getUpNext, {});
    expect(card).toMatchObject({
      showId: "show_9",
      status: "watching",
      show: { title: "Severance" },
      totalWatched: 2,
      nextSeasonNumber: 1,
      nextEpisodeNumber: 3,
    });
    expect(get(api.watchStates.getForShow, { showId: "show_9" })).toMatchObject({
      userId: "user_1",
      status: "watching",
    });
    expect(get(api.watchStates.getCounts, {})).toMatchObject({ watching: 1, total: 1 });
  });

  it("infers the previous status from the continue surface when getForShow is cold", () => {
    const { store, get } = createLocalStore([
      {
        query: api.episodeProgress.getContinue,
        args: {},
        data: { paused: [{ showId: "show_1", status: "paused", show }], resume: [] },
      },
      {
        query: api.users.me,
        args: {},
        data: { countsPaused: 1, countsWatching: 0, countsTotalShows: 1 },
      },
    ]);
    optimisticSetWatchStatus(store, { showId: "show_1", status: "watching" });
    expect(get(api.users.me, {})).toMatchObject({
      countsPaused: 0,
      countsWatching: 1,
      countsTotalShows: 1,
    });
    const surface = get(api.episodeProgress.getContinue, {});
    expect(surface.paused).toEqual([]);
    expect(surface.resume[0]).toMatchObject({ showId: "show_1", status: "watching" });
  });

  it("removes a show from every cache when its status is cleared", () => {
    const { store, get } = seed();
    optimisticRemoveWatchStatus(store, { showId: "show_1" });
    expect(get(api.watchStates.getForShow, { showId: "show_1" })).toBeNull();
    expect(get(api.watchStates.listForUser, {})).toEqual([]);
    expect(get(api.watchStates.listForUser, { status: "watching", limit: 50 })).toEqual([]);
    expect(get(api.watchStates.getCounts, {})).toMatchObject({ watching: 0, total: 0 });
    expect(get(api.users.me, {})).toMatchObject({ countsWatching: 0, countsTotalShows: 0 });
    expect(get(api.episodeProgress.getUpNext, { utcOffsetMinutes: -300 })).toEqual([]);
    expect(get(api.episodeProgress.getContinue, { utcOffsetMinutes: -300 }).resume).toEqual([]);
  });
});

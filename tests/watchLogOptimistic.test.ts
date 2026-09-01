import { describe, expect, it } from "@jest/globals";

import type { DiaryItem } from "../lib/logDiary";
import {
  buildOptimisticWatchLog,
  insertDiaryLog,
  insertShowLog,
  isOptimisticId,
  patchDiaryLog,
  patchShowLog,
  removeDiaryItem,
  resolveOptimisticWatchedAt,
} from "../lib/watchLogOptimistic";

const NOW = Date.UTC(2026, 8, 1, 20, 0, 0);
const show = { _id: "show_1", title: "Severance" } as any;

function diaryLog(id: string, watchedAt: number): DiaryItem {
  return {
    id: id as any,
    type: "log",
    timestamp: watchedAt,
    show,
    log: { _id: id, id, watchedAt, showId: "show_1", note: null } as any,
  };
}

function diaryReview(id: string, createdAt: number): DiaryItem {
  return {
    id: id as any,
    type: "review",
    timestamp: createdAt,
    show,
    review: { _id: id, id, createdAt } as any,
  };
}

describe("buildOptimisticWatchLog", () => {
  it("stamps an optimistic id and anchors exact viewings to now", () => {
    const log = buildOptimisticWatchLog(
      { showId: "show_1", seasonNumber: 1, episodeNumber: 3, note: "  great  ", rating: 4.5 },
      NOW,
    );
    expect(isOptimisticId(log._id)).toBe(true);
    expect(log.id).toBe(log._id);
    expect(log).toMatchObject({
      showId: "show_1",
      seasonNumber: 1,
      episodeNumber: 3,
      note: "great",
      rating: 4.5,
      reaction: null,
      isRewatch: false,
      datePrecision: "exact",
      watchedOn: null,
      watchedAt: NOW,
      createdAt: NOW,
      _creationTime: NOW,
    });
  });

  it("anchors backdated viewings to local noon at the start of their period", () => {
    const resolved = resolveOptimisticWatchedAt(
      { datePrecision: "month", watchedOn: "2024-03" },
      NOW,
    );
    expect(resolved.datePrecision).toBe("month");
    expect(resolved.watchedOn).toBe("2024-03");
    expect(new Date(resolved.watchedAt).getFullYear()).toBe(2024);
    expect(new Date(resolved.watchedAt).getMonth()).toBe(2);
    expect(new Date(resolved.watchedAt).getDate()).toBe(1);
    expect(new Date(resolved.watchedAt).getHours()).toBe(12);
  });

  it("treats unknown dates as now and falls back to exact when the period is unparsable", () => {
    expect(resolveOptimisticWatchedAt({ datePrecision: "unknown" }, NOW)).toEqual({
      watchedAt: NOW,
      datePrecision: "unknown",
      watchedOn: null,
    });
    expect(resolveOptimisticWatchedAt({ datePrecision: "day", watchedOn: "bogus" }, NOW)).toEqual({
      watchedAt: NOW,
      datePrecision: "exact",
      watchedOn: null,
    });
  });
});

describe("diary patches", () => {
  const activity = {
    items: [diaryLog("log_new", NOW - 1000), diaryReview("rev_1", NOW - 5000), diaryLog("log_old", NOW - 9000)],
    hasMore: true,
  };

  it("inserts a new log by viewing time, newest first, keeping hasMore", () => {
    const log = buildOptimisticWatchLog({ showId: "show_1" }, NOW - 3000);
    const next = insertDiaryLog(activity, log, show);
    expect(next?.hasMore).toBe(true);
    expect(next?.items.map((item) => item.id)).toEqual(["log_new", log._id, "rev_1", "log_old"]);
    const inserted = next?.items[1];
    expect(inserted?.type).toBe("log");
    expect(inserted?.show).toBe(show);
  });

  it("leaves a missing or malformed payload untouched", () => {
    const log = buildOptimisticWatchLog({ showId: "show_1" }, NOW);
    expect(insertDiaryLog(undefined, log, show)).toBeUndefined();
    const malformed = { items: null } as any;
    expect(insertDiaryLog(malformed, log, show)).toBe(malformed);
    expect(removeDiaryItem(malformed, "x")).toBe(malformed);
    expect(patchDiaryLog(malformed, "x", {})).toBe(malformed);
  });

  it("removes logs and reviews by id", () => {
    expect(removeDiaryItem(activity, "rev_1")?.items.map((item) => item.id)).toEqual([
      "log_new",
      "log_old",
    ]);
    expect(removeDiaryItem(activity, "log_old")?.items).toHaveLength(2);
  });

  it("patches edited fields in place and returns the same object when nothing matched", () => {
    const next = patchDiaryLog(activity, "log_old", { note: "edited", rating: 3 });
    const patched = next?.items.find((item) => item.id === "log_old");
    expect(patched?.type === "log" && patched.log.note).toBe("edited");
    expect(patched?.type === "log" && patched.log.rating).toBe(3);
    expect(next?.items.map((item) => item.id)).toEqual(["log_new", "rev_1", "log_old"]);
    expect(patchDiaryLog(activity, "missing", { note: "x" })).toBe(activity);
  });

  it("re-sorts when the viewing date moves", () => {
    const next = patchDiaryLog(activity, "log_old", { watchedAt: NOW });
    expect(next?.items.map((item) => item.id)).toEqual(["log_old", "log_new", "rev_1"]);
    expect(next?.items[0]?.timestamp).toBe(NOW);
  });
});

describe("per-show log list patches", () => {
  const rows = [
    { _id: "log_b", watchedAt: NOW - 1000, seasonNumber: 1, episodeNumber: 2 },
    { _id: "log_a", watchedAt: NOW - 9000, seasonNumber: 1, episodeNumber: 1 },
  ];

  it("inserts newest-first and patches by id", () => {
    const log = buildOptimisticWatchLog({ showId: "show_1", seasonNumber: 1, episodeNumber: 3 }, NOW);
    expect(insertShowLog(rows, log)?.map((row) => row._id)).toEqual([log._id, "log_b", "log_a"]);
    expect(insertShowLog(undefined, log)).toBeUndefined();

    const patched = patchShowLog(rows, "log_a", { watchedAt: NOW + 1 });
    expect(patched?.map((row) => row._id)).toEqual(["log_a", "log_b"]);
    expect(patchShowLog(rows, "nope", { note: "x" })).toBe(rows);
  });
});

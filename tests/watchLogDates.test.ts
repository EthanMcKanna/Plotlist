import { describe, expect, it } from "@jest/globals";

import {
  daysInMonth,
  formatWatchedDateLabel,
  getLogDatePrecision,
  getLogDiaryTimestamp,
  parseWatchedOnParts,
  precisionForParts,
  watchedOnFromParts,
} from "../lib/watchLogDates";
import {
  buildDiaryFeed,
  getDiaryApproxLabel,
  getDiaryEpisodeLabel,
  getDiaryItemRating,
  getDiaryItemReaction,
  isDiaryRewatch,
  withLocalDiaryTimestamps,
  type DiaryItem,
} from "../lib/logDiary";

function logItem(overrides: Record<string, unknown>): DiaryItem {
  const log = {
    _id: "log_1",
    id: "log_1",
    showId: "show_1",
    watchedAt: new Date("2026-06-01T20:00:00Z").getTime(),
    seasonNumber: 1,
    episodeNumber: 1,
    episodeTitle: "Pilot",
    note: null,
    datePrecision: "exact",
    watchedOn: null,
    rating: null,
    reaction: null,
    isRewatch: false,
    ...overrides,
  };
  return {
    id: log._id as any,
    type: "log",
    timestamp: log.watchedAt as number,
    show: { _id: "show_1", id: "show_1", title: "Test Show", posterUrl: null },
    log,
  };
}

describe("watched-on parsing", () => {
  it("round-trips day, month, and year shapes", () => {
    expect(parseWatchedOnParts("2024-03-15")).toEqual({ year: 2024, month: 3, day: 15 });
    expect(parseWatchedOnParts("2024-03")).toEqual({ year: 2024, month: 3, day: null });
    expect(parseWatchedOnParts("2024")).toEqual({ year: 2024, month: null, day: null });
    for (const value of ["2024-03-15", "2024-03", "2024"]) {
      expect(watchedOnFromParts(parseWatchedOnParts(value)!)).toBe(value);
    }
  });

  it("derives precision from the deepest part present", () => {
    expect(precisionForParts({ year: 2024, month: 3, day: 15 })).toBe("day");
    expect(precisionForParts({ year: 2024, month: 3, day: null })).toBe("month");
    expect(precisionForParts({ year: 2024, month: null, day: null })).toBe("year");
  });

  it("rejects malformed strings", () => {
    expect(parseWatchedOnParts("15/03/2024")).toBeNull();
    expect(parseWatchedOnParts("")).toBeNull();
    expect(parseWatchedOnParts(null)).toBeNull();
  });

  it("knows month lengths", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2026, 7)).toBe(31);
  });
});

describe("precision-aware display", () => {
  it("labels each precision at its own granularity", () => {
    const base = { watchedAt: new Date("2026-06-01T20:00:00Z").getTime() };
    expect(formatWatchedDateLabel({ ...base, datePrecision: "unknown" })).toBe("Date unknown");
    expect(
      formatWatchedDateLabel({ ...base, datePrecision: "year", watchedOn: "2019" }),
    ).toBe("2019");
    expect(
      formatWatchedDateLabel({ ...base, datePrecision: "month", watchedOn: "2024-07" }),
    ).toBe("July 2024");
    expect(
      formatWatchedDateLabel({ ...base, datePrecision: "day", watchedOn: "2024-03-15" }),
    ).toBe("Mar 15, 2024");
  });

  it("falls back to exact for legacy rows without a precision", () => {
    expect(getLogDatePrecision({ watchedAt: 123 })).toBe("exact");
    expect(getLogDatePrecision({ watchedAt: 123, datePrecision: "bogus" })).toBe("exact");
  });

  it("anchors approximate viewings to local calendar periods", () => {
    const anchored = getLogDiaryTimestamp({
      watchedAt: Date.UTC(2024, 2, 15, 12),
      watchedOn: "2024-03-15",
      datePrecision: "day",
    });
    const local = new Date(anchored);
    expect(local.getFullYear()).toBe(2024);
    expect(local.getMonth()).toBe(2);
    expect(local.getDate()).toBe(15);
  });
});

describe("diary rendering of logged viewings", () => {
  it("keeps enriched viewings out of binge collapsing", () => {
    const sameDay = new Date("2026-06-01T20:00:00Z").getTime();
    const items = [
      logItem({ _id: "log_a", id: "log_a", episodeNumber: 1, watchedAt: sameDay }),
      logItem({
        _id: "log_b",
        id: "log_b",
        episodeNumber: 2,
        watchedAt: sameDay + 1,
        isRewatch: true,
      }),
      logItem({ _id: "log_c", id: "log_c", episodeNumber: 3, watchedAt: sameDay + 2 }),
    ].map((item, index) => ({ ...item, id: `log_${"abc"[index]}` as any }));
    const rows = buildDiaryFeed({ items, filter: "all", now: sameDay + 10 });
    const entryRows = rows.filter((row) => row.kind === "entry");
    // The rewatch stays a standalone entry instead of merging into a binge.
    expect(entryRows.some((row) => row.kind === "entry" && isDiaryRewatch(row.item))).toBe(true);
  });

  it("gives year-precision viewings their own year section", () => {
    const items = withLocalDiaryTimestamps([
      logItem({ _id: "log_y", id: "log_y", datePrecision: "year", watchedOn: "2019", isRewatch: true }),
    ]);
    const rows = buildDiaryFeed({ items, filter: "all", now: Date.now() });
    const monthRow = rows.find((row) => row.kind === "month");
    expect(monthRow && "label" in monthRow ? monthRow.label : null).toBe("2019");
    const entry = rows.find((row) => row.kind === "entry");
    expect(entry && entry.kind === "entry" ? entry.dayLabel?.day : null).toBe("~");
  });

  it("exposes per-viewing rating, reaction, rewatch, and approx labels", () => {
    const item = logItem({ rating: 4.5, reaction: "🔥", isRewatch: true, datePrecision: "month", watchedOn: "2024-07" });
    expect(getDiaryItemRating(item)).toBe(4.5);
    expect(getDiaryItemReaction(item)).toBe("🔥");
    expect(isDiaryRewatch(item)).toBe(true);
    expect(getDiaryApproxLabel(item)).toBe("approx");
    expect(getDiaryApproxLabel(logItem({ datePrecision: "unknown" }))).toBe("date unknown");
    expect(getDiaryApproxLabel(logItem({}))).toBeNull();
  });

  it("labels season- and show-scope viewings", () => {
    expect(getDiaryEpisodeLabel(logItem({ episodeNumber: null, episodeTitle: null }))).toBe(
      "Season 1",
    );
    expect(
      getDiaryEpisodeLabel(
        logItem({ seasonNumber: null, episodeNumber: null, episodeTitle: null, isRewatch: true }),
      ),
    ).toBe("Whole show");
  });
});

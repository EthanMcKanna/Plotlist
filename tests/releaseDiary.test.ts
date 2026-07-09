import { describe, expect, it } from "@jest/globals";

import {
  buildReleaseDiaryRows,
  getReleaseDiaryCounts,
  getReleaseDiaryDayLabel,
  getReleaseDiaryHeadline,
  getReleaseDiaryWeekActivity,
} from "../lib/releaseDiary";
import { getUserLocalDayContext } from "../lib/releaseCalendar";

const TODAY = "2026-07-08";

function group(airDate: string, count: number) {
  return {
    airDate,
    airDateTs: Date.parse(`${airDate}T00:00:00Z`),
    items: Array.from({ length: count }, (_, index) => ({
      show: { _id: `show-${airDate}-${index}` },
      seasonNumber: 1,
      episodeNumber: index + 1,
    })),
  };
}

describe("getUserLocalDayContext", () => {
  it("resolves today from the user's UTC offset, not the server clock", () => {
    // Wednesday 7pm PDT is already Thursday 02:00 UTC.
    const now = Date.parse("2026-07-09T02:00:00Z");
    const context = getUserLocalDayContext(now, -420);
    expect(context.today).toBe("2026-07-08");
    // The user's local midnight as a real UTC instant (PDT midnight = 07:00Z).
    expect(context.todayStartTs).toBe(Date.parse("2026-07-08T07:00:00Z"));
  });

  it("handles positive offsets east of UTC", () => {
    // 23:30 UTC Tuesday is already Wednesday 09:00 in Sydney (+570).
    const now = Date.parse("2026-07-07T23:30:00Z");
    const context = getUserLocalDayContext(now, 570);
    expect(context.today).toBe("2026-07-08");
  });

  it("falls back to the process clock without an offset", () => {
    const now = Date.parse("2026-07-08T12:00:00Z");
    const context = getUserLocalDayContext(now, null);
    expect(context.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isFinite(context.todayStartTs)).toBe(true);
  });
});

describe("buildReleaseDiaryRows", () => {
  it("labels only the first row of each day and marks the last for dividers", () => {
    const rows = buildReleaseDiaryRows(
      [group(TODAY, 2), group("2026-07-10", 1)],
      TODAY,
    );

    const events = rows.filter((row) => row.kind === "event");
    expect(events).toHaveLength(3);
    expect(events[0]?.dayLabel).toEqual({ day: "8", weekday: "WED", isToday: true });
    expect(events[0]?.isLastOfDay).toBe(false);
    expect(events[1]?.dayLabel).toBeNull();
    expect(events[1]?.isLastOfDay).toBe(true);
    expect(events[2]?.dayLabel).toEqual({ day: "10", weekday: "FRI", isToday: false });
  });

  it("adds month headers only when the calendar crosses into a later month", () => {
    const rows = buildReleaseDiaryRows(
      [group(TODAY, 1), group("2026-08-02", 2), group("2026-08-05", 1)],
      TODAY,
    );

    const months = rows.filter((row) => row.kind === "month");
    expect(months).toHaveLength(1);
    expect(months[0]).toMatchObject({ label: "August", entryCount: 3 });
    // Header appears before the first August event.
    expect(rows.findIndex((row) => row.kind === "month")).toBe(1);
  });

  it("skips empty groups", () => {
    const rows = buildReleaseDiaryRows([{ airDate: TODAY, items: [] }], TODAY);
    expect(rows).toHaveLength(0);
  });
});

describe("release diary headline", () => {
  it("summarizes tonight, this week, and later buckets", () => {
    const counts = getReleaseDiaryCounts(
      [
        group(TODAY, 2),
        group("2026-07-11", 1),
        group("2026-08-01", 3),
      ],
      TODAY,
    );
    expect(counts).toEqual({
      tonightCount: 2,
      weekCount: 1,
      laterCount: 3,
      total: 6,
    });
    expect(getReleaseDiaryHeadline(counts)).toBe(
      "2 tonight · 1 more this week · 3 later",
    );
  });

  it("has calm copy when nothing is scheduled", () => {
    const counts = getReleaseDiaryCounts([], TODAY);
    expect(getReleaseDiaryHeadline(counts)).toBe(
      "New episodes from your shows land here.",
    );
  });
});

describe("getReleaseDiaryWeekActivity", () => {
  it("builds a forward-looking seven-day pulse starting today", () => {
    const days = getReleaseDiaryWeekActivity(
      [group(TODAY, 2), group("2026-07-10", 1), group("2026-08-01", 5)],
      TODAY,
    );

    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ key: TODAY, count: 2, isToday: true });
    expect(days[2]).toEqual({ key: "2026-07-10", count: 1, isToday: false });
    // Releases beyond the window don't leak into the pulse.
    expect(days.reduce((sum, day) => sum + day.count, 0)).toBe(3);
  });
});

describe("getReleaseDiaryDayLabel", () => {
  it("formats the spine label from a date-only string", () => {
    expect(getReleaseDiaryDayLabel("2026-07-09", TODAY)).toEqual({
      day: "9",
      weekday: "THU",
      isToday: false,
    });
    expect(getReleaseDiaryDayLabel("not-a-date", TODAY)).toBeNull();
  });
});

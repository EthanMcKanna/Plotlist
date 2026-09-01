import { describe, expect, it } from "@jest/globals";

import {
  formatAirDate,
  formatAirDay,
  formatCalendarDay,
  toAirDateString,
} from "../lib/format";
import {
  RELEASE_EVENT_RETENTION_DAYS,
  buildTmdbReleaseEventsForShow,
  getReleaseEventWindowStart,
  isCalendarPeriodAfterLocalToday,
} from "../lib/releaseCalendar";
import { getDayAnchoredWatchedAt } from "../lib/watchLogDates";

// Jest runs in UTC, so "local" formatting here is UTC formatting; the
// assertions that matter are the ones where a UTC-midnight instant and its
// calendar day disagree once a real offset is applied.

describe("release refresh retention window (A1)", () => {
  it("keeps a couple of days before the UTC anchor", () => {
    expect(RELEASE_EVENT_RETENTION_DAYS).toBe(2);
    expect(getReleaseEventWindowStart("2026-09-02")).toBe("2026-08-31");
    // Month and year boundaries roll correctly.
    expect(getReleaseEventWindowStart("2026-01-01")).toBe("2025-12-30");
    // Garbage anchors fall back to themselves rather than widening the window.
    expect(getReleaseEventWindowStart("not-a-date")).toBe("not-a-date");
  });

  const details = {
    status: "Returning Series",
    seasons: [{ season_number: 3, episode_count: 10, air_date: "2026-08-01" }],
  };
  const seasonPayloads = [
    {
      season_number: 3,
      episodes: [
        { air_date: "2026-08-29", season_number: 3, episode_number: 4, name: "Older" },
        { air_date: "2026-08-31", season_number: 3, episode_number: 5, name: "Two days ago" },
        { air_date: "2026-09-01", season_number: 3, episode_number: 6, name: "Yesterday UTC" },
        { air_date: "2026-09-02", season_number: 3, episode_number: 7, name: "Today UTC" },
        { air_date: "2026-09-09", season_number: 3, episode_number: 8, name: "Next week" },
      ],
    },
  ];

  it("a rebuild anchored on UTC today still carries last night's episode", () => {
    // 00:40Z on Sep 2 is 17:40 on Sep 1 in Los Angeles: the Sep 1 episode is
    // still "tonight" there and must survive the delete-and-reinsert.
    const today = "2026-09-02";
    const events = buildTmdbReleaseEventsForShow({
      showId: "show-1",
      details,
      seasonPayloads,
      today,
      horizon: "2026-12-31",
      windowStart: getReleaseEventWindowStart(today),
    });
    expect(events.map((event) => event.airDate)).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-09",
    ]);
  });

  it("defaults to today when no window is given, and never widens forward", () => {
    const base = {
      showId: "show-1",
      details,
      seasonPayloads,
      today: "2026-09-02",
      horizon: "2026-12-31",
    };
    expect(buildTmdbReleaseEventsForShow(base).map((event) => event.airDate)).toEqual([
      "2026-09-02",
      "2026-09-09",
    ]);
    // A window start after today is ignored (it can only extend backwards).
    expect(
      buildTmdbReleaseEventsForShow({ ...base, windowStart: "2026-09-05" }).map(
        (event) => event.airDate,
      ),
    ).toEqual(["2026-09-02", "2026-09-09"]);
    expect(
      buildTmdbReleaseEventsForShow({ ...base, windowStart: "garbage" }).map(
        (event) => event.airDate,
      ),
    ).toEqual(["2026-09-02", "2026-09-09"]);
  });
});

describe("date-only air date formatting (A2/A8)", () => {
  it("formats YYYY-MM-DD strings by their calendar day", () => {
    expect(formatAirDate("2026-09-08")).toBe("Sep 8, 2026");
    expect(formatAirDay("2026-09-08")).toBe("Sep 8");
    expect(formatCalendarDay("2026-09-08")).toBe("Tuesday, Sep 8");
  });

  it("reads a full ISO air date by its UTC calendar day", () => {
    // What an older deep link handed the show page: UTC midnight rendered
    // with toISOString(). Must still read as the 8th, never the 7th.
    expect(formatAirDate("2026-09-08T00:00:00.000Z")).toBe("Sep 8, 2026");
  });

  it("reads UTC-day timestamps by their UTC calendar day", () => {
    const utcMidnight = Date.parse("2026-09-08T00:00:00.000Z");
    const utcNoon = Date.parse("2026-09-08T12:00:00.000Z");
    expect(formatAirDate(utcMidnight)).toBe("Sep 8, 2026");
    expect(formatAirDate(utcNoon)).toBe("Sep 8, 2026");
    expect(formatAirDay(utcMidnight)).toBe("Sep 8");
    // The schedule-card fallback when `airDate` is missing.
    expect(formatCalendarDay(utcMidnight)).toBe("Tuesday, Sep 8");
    expect(formatCalendarDay(utcMidnight - 1)).toBe("Monday, Sep 7");
  });

  it("round-trips a UTC-day timestamp back to its date string", () => {
    expect(toAirDateString(Date.parse("2026-09-08T00:00:00.000Z"))).toBe("2026-09-08");
    expect(toAirDateString(Date.parse("2026-09-08T12:00:00.000Z"))).toBe("2026-09-08");
    expect(formatAirDate(toAirDateString(Date.parse("2026-09-08T00:00:00.000Z")))).toBe(
      "Sep 8, 2026",
    );
  });
});

describe("backdated log 'today' check (A4)", () => {
  // 2026-09-01 22:30Z: still Sep 1 in UTC and points west, already Sep 2
  // east of UTC+01:30.
  const now = Date.parse("2026-09-01T22:30:00.000Z");

  it("accepts the user's local today east of UTC", () => {
    // Auckland (UTC+12): local date is Sep 2. The UTC-noon sort key for
    // Sep 2 is after `now`, which is exactly what the old check rejected.
    expect(isCalendarPeriodAfterLocalToday("2026-09-02", now, 720)).toBe(false);
    expect(isCalendarPeriodAfterLocalToday("2026-09-01", now, 720)).toBe(false);
    expect(isCalendarPeriodAfterLocalToday("2026-09-03", now, 720)).toBe(true);
  });

  it("rejects tomorrow for a user west of UTC", () => {
    // Los Angeles (UTC-7): local date is still Sep 1.
    expect(isCalendarPeriodAfterLocalToday("2026-09-01", now, -420)).toBe(false);
    expect(isCalendarPeriodAfterLocalToday("2026-09-02", now, -420)).toBe(true);
  });

  it("tolerates the most eastern possible day when no offset was sent", () => {
    // Older builds: anything up to UTC+14's date is allowed, the day after is not.
    expect(isCalendarPeriodAfterLocalToday("2026-09-02", now, undefined)).toBe(false);
    expect(isCalendarPeriodAfterLocalToday("2026-09-02", now, null)).toBe(false);
    expect(isCalendarPeriodAfterLocalToday("2026-09-03", now, undefined)).toBe(true);
    // Non-finite offsets behave like a missing one.
    expect(isCalendarPeriodAfterLocalToday("2026-09-02", now, Number.NaN)).toBe(false);
  });

  it("compares month and year periods at their own precision", () => {
    expect(isCalendarPeriodAfterLocalToday("2026-09", now, -420)).toBe(false);
    expect(isCalendarPeriodAfterLocalToday("2026-10", now, -420)).toBe(true);
    expect(isCalendarPeriodAfterLocalToday("2026", now, -420)).toBe(false);
    expect(isCalendarPeriodAfterLocalToday("2027", now, -420)).toBe(true);
    // Local New Year east of UTC: Dec 31 22:30Z is already 2027 in Auckland.
    const newYearsEve = Date.parse("2026-12-31T22:30:00.000Z");
    expect(isCalendarPeriodAfterLocalToday("2027", newYearsEve, 720)).toBe(false);
    expect(isCalendarPeriodAfterLocalToday("2027-01", newYearsEve, 720)).toBe(false);
    expect(isCalendarPeriodAfterLocalToday("2027", newYearsEve, -420)).toBe(true);
  });

  it("never flags malformed periods (the resolver validates shape separately)", () => {
    expect(isCalendarPeriodAfterLocalToday("soon", now, 0)).toBe(false);
    expect(isCalendarPeriodAfterLocalToday("", now, 0)).toBe(false);
  });
});

describe("day-anchored watchedAt for precision-less rows (A6)", () => {
  it("re-anchors the server's UTC-noon day sentinel to local noon of that day", () => {
    const utcNoon = Date.parse("2026-09-01T12:00:00.000Z");
    const anchored = new Date(getDayAnchoredWatchedAt(utcNoon));
    expect(anchored.getFullYear()).toBe(2026);
    expect(anchored.getMonth()).toBe(8);
    expect(anchored.getDate()).toBe(1);
    expect(anchored.getHours()).toBe(12);
  });

  it("leaves exact viewing instants untouched", () => {
    const exact = Date.parse("2026-09-01T12:00:00.001Z");
    expect(getDayAnchoredWatchedAt(exact)).toBe(exact);
    const evening = Date.parse("2026-09-01T03:17:42.512Z");
    expect(getDayAnchoredWatchedAt(evening)).toBe(evening);
    expect(getDayAnchoredWatchedAt(Number.NaN)).toBeNaN();
  });
});

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  formatDate,
  formatMonth,
  formatRelativeTime,
  formatShortDate,
  formatTime,
  getMonthStart,
  isCurrentMonth,
} from "../lib/format";

describe("format helpers", () => {
  const now = new Date("2026-03-10T18:30:00.000Z");
  const referenceTimestamp = now.getTime();

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("formats the core date labels used in the app", () => {
    expect(formatDate(referenceTimestamp)).toBe("Mar 10, 2026");
    expect(formatTime(referenceTimestamp)).toBe("6:30 PM");
    expect(formatMonth(referenceTimestamp)).toBe("March 2026");
    expect(formatShortDate(referenceTimestamp)).toBe("Mar 10");
  });

  it("computes relative and month-based helpers from a stable clock", () => {
    const twoDaysAgo = new Date("2026-03-08T18:30:00.000Z").getTime();
    const lastMonth = new Date("2026-02-28T12:00:00.000Z").getTime();

    expect(formatRelativeTime(twoDaysAgo)).toBe("2 days ago");
    expect(isCurrentMonth(twoDaysAgo)).toBe(true);
    expect(isCurrentMonth(lastMonth)).toBe(false);
    expect(getMonthStart(referenceTimestamp)).toBe(
      new Date("2026-03-01T00:00:00.000Z").getTime()
    );
  });
});

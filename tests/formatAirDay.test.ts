import { describe, expect, it } from "@jest/globals";

import { formatAirDay } from "../lib/format";

describe("formatAirDay", () => {
  it("labels a UTC-midnight air date by its calendar day", () => {
    // Jest runs in UTC, so emulate a west-of-UTC reading by hand: the same
    // instant is Sep 7 evening in Los Angeles, and must still read Sep 8.
    const utcMidnight = Date.parse("2026-09-08T00:00:00.000Z");
    expect(formatAirDay(utcMidnight)).toBe("Sep 8");
    expect(formatAirDay(utcMidnight - 1)).toBe("Sep 7");
    // A local-midnight timestamp from a dev worker (07:00Z) reads the same day.
    expect(formatAirDay(Date.parse("2026-09-08T07:00:00.000Z"))).toBe("Sep 8");
  });
});

import { describe, expect, it } from "@jest/globals";

import { getHomeDiscoveryRailHeaderCopy } from "../lib/homeRailHeaderCopy";

// Local-time anchors (tests run under TZ=UTC).
const TUESDAY_MORNING = Date.parse("2026-06-30T09:00:00.000Z");
const TUESDAY_EVENING = Date.parse("2026-06-30T20:00:00.000Z");
const TUESDAY_LATE = Date.parse("2026-06-30T23:30:00.000Z");
const TUESDAY_MIDDAY = Date.parse("2026-06-30T15:00:00.000Z");
const SATURDAY = Date.parse("2026-07-04T15:00:00.000Z");

describe("home discovery rail header copy", () => {
  it("keeps rail titles fixed while kickers follow the daypart", () => {
    for (const now of [TUESDAY_MORNING, TUESDAY_EVENING, TUESDAY_LATE, SATURDAY]) {
      expect(getHomeDiscoveryRailHeaderCopy("heat", { now }).title).toBe("Trending");
      expect(getHomeDiscoveryRailHeaderCopy("fresh", { now }).title).toBe("New");
      expect(getHomeDiscoveryRailHeaderCopy("critics", { now }).title).toBe("Acclaimed");
      expect(getHomeDiscoveryRailHeaderCopy("quick", { now }).title).toBe("Quick");
      expect(getHomeDiscoveryRailHeaderCopy("rooms", { now }).title).toBe("Streaming");
    }
  });

  it("marks trending with the moment of day", () => {
    expect(getHomeDiscoveryRailHeaderCopy("heat", { now: TUESDAY_MORNING }).kicker).toBe(
      "Today",
    );
    expect(getHomeDiscoveryRailHeaderCopy("heat", { now: TUESDAY_EVENING }).kicker).toBe(
      "Tonight",
    );
    expect(getHomeDiscoveryRailHeaderCopy("heat", { now: TUESDAY_MIDDAY }).kicker).toBe(
      "Now",
    );
  });

  it("offers quick picks as a nightcap late in the evening", () => {
    expect(getHomeDiscoveryRailHeaderCopy("quick", { now: TUESDAY_LATE }).kicker).toBe(
      "Nightcap",
    );
    expect(getHomeDiscoveryRailHeaderCopy("quick", { now: TUESDAY_MORNING }).kicker).toBe(
      "Short",
    );
  });

  it("leans into weekends for critics and streaming rooms", () => {
    expect(getHomeDiscoveryRailHeaderCopy("critics", { now: SATURDAY }).kicker).toBe(
      "Weekend",
    );
    expect(getHomeDiscoveryRailHeaderCopy("rooms", { now: SATURDAY }).kicker).toBe(
      "Settle in",
    );
    expect(getHomeDiscoveryRailHeaderCopy("critics", { now: TUESDAY_MIDDAY }).kicker).toBe(
      "Quality",
    );
    expect(getHomeDiscoveryRailHeaderCopy("rooms", { now: TUESDAY_MIDDAY }).kicker).toBe(
      "Watch",
    );
  });

  it("falls back to a real date for invalid input", () => {
    const copy = getHomeDiscoveryRailHeaderCopy("fresh", { now: "not-a-date" });
    expect(copy.title).toBe("New");
    expect(copy.kicker.length).toBeGreaterThan(0);
  });
});

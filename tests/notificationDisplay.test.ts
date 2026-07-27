import { describe, expect, it } from "@jest/globals";

import { formatCompactRelativeTime } from "../lib/format";
import {
  notificationBodySegments,
  notificationSections,
  notificationVisuals,
  type NotificationItem,
} from "../lib/notificationDisplay";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// Fixed mid-day UTC so calendar-day bucketing is stable under TZ=UTC.
const NOW = Date.parse("2026-07-26T12:00:00Z");

function item(overrides: Partial<NotificationItem> & { _id: string }): NotificationItem {
  return {
    type: "follow",
    title: "New follower",
    body: "Ana started following you.",
    createdAt: NOW - HOUR,
    readAt: null,
    data: null,
    actor: null,
    show: null,
    ...overrides,
  };
}

describe("formatCompactRelativeTime", () => {
  it("compacts each age bracket", () => {
    expect(formatCompactRelativeTime(NOW - 30 * 1000, NOW)).toBe("now");
    expect(formatCompactRelativeTime(NOW - 5 * 60 * 1000, NOW)).toBe("5m");
    expect(formatCompactRelativeTime(NOW - 3 * HOUR, NOW)).toBe("3h");
    expect(formatCompactRelativeTime(NOW - 2 * DAY, NOW)).toBe("2d");
    expect(formatCompactRelativeTime(NOW - 3 * 7 * DAY, NOW)).toBe("3w");
    expect(formatCompactRelativeTime(NOW - 400 * DAY, NOW)).toBe("1y");
  });

  it("never goes negative for future timestamps", () => {
    expect(formatCompactRelativeTime(NOW + HOUR, NOW)).toBe("now");
  });
});

describe("notificationSections", () => {
  it("puts the contiguous unread prefix in New and buckets the rest by date", () => {
    const entries = notificationSections(
      [
        item({ _id: "a", createdAt: NOW - HOUR }),
        item({ _id: "b", createdAt: NOW - 2 * HOUR }),
        item({ _id: "c", createdAt: NOW - 3 * HOUR, readAt: NOW - HOUR }),
        item({ _id: "d", createdAt: NOW - 2 * DAY, readAt: NOW - DAY }),
      ],
      NOW,
    );
    expect(entries.map((entry) => entry.key)).toEqual([
      "header:New",
      "a",
      "b",
      "header:Today",
      "c",
      "header:This week",
      "d",
    ]);
  });

  it("does not lift unread rows past a read row into New", () => {
    const entries = notificationSections(
      [
        item({ _id: "read", createdAt: NOW - HOUR, readAt: NOW }),
        item({ _id: "unread-later", createdAt: NOW - 2 * HOUR }),
      ],
      NOW,
    );
    expect(entries.map((entry) => entry.key)).toEqual([
      "header:Today",
      "read",
      "unread-later",
    ]);
  });

  it("buckets read items across Today, This week, This month, Earlier", () => {
    const entries = notificationSections(
      [
        item({ _id: "today", createdAt: NOW - 2 * HOUR, readAt: NOW }),
        item({ _id: "week", createdAt: NOW - 3 * DAY, readAt: NOW }),
        item({ _id: "month", createdAt: NOW - 20 * DAY, readAt: NOW }),
        item({ _id: "older", createdAt: NOW - 90 * DAY, readAt: NOW }),
      ],
      NOW,
    );
    expect(entries.filter((entry) => entry.kind === "header").map((entry) => entry.key)).toEqual([
      "header:Today",
      "header:This week",
      "header:This month",
      "header:Earlier",
    ]);
  });

  it("returns no entries for an empty list", () => {
    expect(notificationSections([], NOW)).toEqual([]);
  });
});

describe("notificationBodySegments", () => {
  const actor = {
    _id: "u1",
    username: "ana",
    displayName: "Ana",
    avatarUrl: null,
  };

  it("bolds the actor-name prefix", () => {
    const segments = notificationBodySegments(
      item({ _id: "a", actor, body: "Ana started following you." }),
    );
    expect(segments).toEqual([
      { text: "Ana", bold: true },
      { text: " started following you." },
    ]);
  });

  it("falls back to plain text when the body does not start with the name", () => {
    const segments = notificationBodySegments(
      item({ _id: "a", actor, body: "Someone started following you." }),
    );
    expect(segments).toEqual([{ text: "Someone started following you." }]);
  });

  it("uses the username when there is no display name", () => {
    const segments = notificationBodySegments(
      item({
        _id: "a",
        actor: { ...actor, displayName: null },
        body: "ana liked your review.",
      }),
    );
    expect(segments[0]).toEqual({ text: "ana", bold: true });
  });

  it("returns one plain segment without an actor", () => {
    expect(notificationBodySegments(item({ _id: "a", body: "S2E4 airs tonight." }))).toEqual([
      { text: "S2E4 airs tonight." },
    ]);
  });
});

describe("notificationVisuals", () => {
  const actor = { _id: "u1", username: "ana", displayName: "Ana", avatarUrl: null };
  const show = { _id: "s1", title: "Severance", posterUrl: "https://img/poster.jpg" };

  it("keeps the avatar + follow button for follow rows with an actor", () => {
    const visuals = notificationVisuals(item({ _id: "a", type: "follow", actor }));
    expect(visuals.leading).toBe("avatar");
    expect(visuals.trailing).toBe("followButton");
  });

  it("degrades avatar rows without an actor to a glyph tile", () => {
    const visuals = notificationVisuals(item({ _id: "a", type: "follow" }));
    expect(visuals.leading).toBe("tile");
    expect(visuals.trailing).toBeNull();
  });

  it("uses the poster as leading visual for episode rows with a show", () => {
    const visuals = notificationVisuals(item({ _id: "a", type: "episode", show }));
    expect(visuals.leading).toBe("poster");
  });

  it("degrades episode rows without a poster to a glyph tile", () => {
    const visuals = notificationVisuals(
      item({ _id: "a", type: "episode", show: { ...show, posterUrl: null } }),
    );
    expect(visuals.leading).toBe("tile");
  });

  it("swaps the trailing poster for a tile when a like has no show", () => {
    const visuals = notificationVisuals(item({ _id: "a", type: "like", actor }));
    expect(visuals.trailing).toBe("tile");
  });

  it("falls back to the generic glyph for unknown types", () => {
    const visuals = notificationVisuals(item({ _id: "a", type: "mystery_type" }));
    expect(visuals.glyph).toBe("notifications");
    expect(visuals.leading).toBe("tile");
  });
});

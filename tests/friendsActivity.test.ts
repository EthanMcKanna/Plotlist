import { describe, expect, it } from "@jest/globals";

import {
  buildFriendActivity,
  getFriendActivityActorName,
  getFriendWatchedPhrase,
  type FriendWatchedEntry,
  type RawFriendFeedItem,
} from "../lib/friendsActivity";

const actor = (id: string) => ({ _id: id, displayName: id, username: id });
const show = (id: string, title = id) => ({ _id: id, title });

function logRow(
  actorId: string,
  showId: string,
  timestamp: number,
  episode?: { seasonNumber: number; episodeNumber: number },
): RawFriendFeedItem {
  return {
    type: "log",
    timestamp,
    actor: actor(actorId),
    show: show(showId),
    log: episode ?? null,
  };
}

describe("buildFriendActivity", () => {
  it("collapses per-episode logs into one entry per friend and show", () => {
    const entries = buildFriendActivity([
      logRow("maya", "silo", 300, { seasonNumber: 1, episodeNumber: 2 }),
      logRow("maya", "silo", 200, { seasonNumber: 1, episodeNumber: 1 }),
      logRow("maya", "boys", 100, { seasonNumber: 2, episodeNumber: 4 }),
    ]);

    expect(entries).toHaveLength(2);
    const [siloEntry, boysEntry] = entries as FriendWatchedEntry[];

    // The duplicate "started ShowX twice" bug: two logs for the same show
    // must merge into a single entry that counts episodes.
    expect(siloEntry.show._id).toBe("silo");
    expect(siloEntry.episodeCount).toBe(2);
    expect(siloEntry.episodeLabel).toBe("2 episodes");
    expect(siloEntry.timestamp).toBe(300);
    // Contains the S1 E1 premiere, so the verb is "started".
    expect(siloEntry.verb).toBe("started");

    expect(boysEntry.episodeCount).toBe(1);
    expect(boysEntry.episodeLabel).toBe("S02E04");
    expect(boysEntry.verb).toBe("watched");
  });

  it("keeps reviews individual and deduped by review id", () => {
    const review = {
      type: "review",
      timestamp: 500,
      actor: actor("maya"),
      show: show("bear", "The Bear"),
      review: { _id: "rev1", rating: 4.5, reviewText: "Great", spoiler: false },
    } satisfies RawFriendFeedItem;

    const entries = buildFriendActivity([review, review]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "review",
      reviewId: "rev1",
      rating: 4.5,
      reviewText: "Great",
    });
  });

  it("filters the viewer's own rows and rows without actor or show", () => {
    const entries = buildFriendActivity(
      [
        logRow("viewer", "silo", 100, { seasonNumber: 1, episodeNumber: 1 }),
        { type: "log", timestamp: 100, actor: null, show: show("silo") },
        { type: "log", timestamp: 100, actor: actor("maya"), show: null },
        logRow("maya", "silo", 100, { seasonNumber: 1, episodeNumber: 1 }),
      ],
      { viewerId: "viewer" },
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].actor._id).toBe("maya");
  });

  it("drops entries older than the freshness window and sorts newest first", () => {
    const now = 1_000_000;
    const entries = buildFriendActivity(
      [
        logRow("maya", "old", now - 500, { seasonNumber: 1, episodeNumber: 1 }),
        logRow("maya", "newer", now - 50, { seasonNumber: 1, episodeNumber: 1 }),
        logRow("maya", "newest", now - 10, { seasonNumber: 1, episodeNumber: 1 }),
      ],
      { sinceMs: 100, now },
    );

    expect(
      entries.map((entry) => (entry.kind === "watched" ? entry.show._id : null)),
    ).toEqual(["newest", "newer"]);
  });

  it("dedupes legacy status rows against grouped logs for the same show", () => {
    const entries = buildFriendActivity([
      logRow("maya", "silo", 300, { seasonNumber: 1, episodeNumber: 1 }),
      {
        type: "started",
        timestamp: 200,
        actor: actor("maya"),
        show: show("silo"),
      },
      {
        type: "completed",
        timestamp: 100,
        actor: actor("maya"),
        show: show("bear"),
      },
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ kind: "watched", verb: "started" });
    expect(entries[1]).toMatchObject({ kind: "watched", verb: "finished" });
  });
});

describe("friend activity copy helpers", () => {
  it("builds readable actor names and watch phrases", () => {
    expect(getFriendActivityActorName({ _id: "u", displayName: "Maya" })).toBe("Maya");
    expect(getFriendActivityActorName({ _id: "u", username: "maya" })).toBe("maya");
    expect(getFriendActivityActorName({ _id: "u" })).toBe("Someone");

    const base = {
      kind: "watched" as const,
      key: "k",
      timestamp: 1,
      actor: actor("maya"),
      avatarUrl: null,
      show: show("silo"),
      episodeCount: 1,
      episodeLabel: null,
      logId: null,
    };
    expect(getFriendWatchedPhrase({ ...base, verb: "started" })).toBe("started");
    expect(getFriendWatchedPhrase({ ...base, verb: "watched" })).toBe("watched");
    expect(getFriendWatchedPhrase({ ...base, verb: "finished" })).toBe("finished");
  });
});

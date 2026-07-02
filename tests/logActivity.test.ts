import { describe, expect, it } from "@jest/globals";

import {
  computeLogSummary,
  organizeLogTimeline,
  type LogActivityItem,
} from "../lib/logActivity";

const NOW = new Date("2026-06-02T20:30:00Z").getTime();

function show(id: string, title: string) {
  return { _id: id, id, title, posterUrl: null };
}

function minutesAgo(minutes: number) {
  return NOW - minutes * 60_000;
}

function watchLog({
  id,
  showItem,
  minutes,
  episode,
  note,
}: {
  id: string;
  showItem: ReturnType<typeof show>;
  minutes: number;
  episode: number;
  note?: string;
}): LogActivityItem {
  return {
    id: id as any,
    type: "log",
    timestamp: minutesAgo(minutes),
    show: showItem,
    log: {
      _id: id,
      id,
      showId: showItem._id,
      watchedAt: minutesAgo(minutes),
      seasonNumber: 1,
      episodeNumber: episode,
      episodeTitle: `Episode ${episode}`,
      note: note ?? null,
    },
  };
}

function review({
  id,
  showItem,
  minutes,
  rating,
  reviewText,
}: {
  id: string;
  showItem: ReturnType<typeof show>;
  minutes: number;
  rating: number;
  reviewText?: string;
}): LogActivityItem {
  return {
    id: id as any,
    type: "review",
    timestamp: minutesAgo(minutes),
    show: showItem,
    review: {
      _id: id,
      id,
      showId: showItem._id,
      createdAt: minutesAgo(minutes),
      rating,
      reviewText: reviewText ?? null,
      spoiler: false,
    },
  };
}

describe("log activity organization", () => {
  it("compacts repeated low-signal watch logs from the same show and day", () => {
    const signal = show("signal", "The Signal");
    const items = [
      watchLog({ id: "log-3", showItem: signal, minutes: 30, episode: 3 }),
      watchLog({ id: "log-2", showItem: signal, minutes: 45, episode: 2 }),
      watchLog({ id: "log-1", showItem: signal, minutes: 60, episode: 1 }),
    ];

    const sections = organizeLogTimeline({
      items,
      filter: "all",
      sort: "recent",
      now: NOW,
    });

    expect(sections).toHaveLength(1);
    expect(sections[0]?.rows).toHaveLength(1);
    expect(sections[0]?.rows[0]).toMatchObject({
      kind: "cluster",
      title: "The Signal",
    });
    if (sections[0]?.rows[0]?.kind !== "cluster") {
      throw new Error("Expected compacted cluster row");
    }
    expect(sections[0].rows[0].logs).toHaveLength(3);
    expect(sections[0].rows[0].subtitle).toBe("S01E01 to S01E03");
  });

  it("keeps highlights focused on notes, reviews, ratings, and compact episode runs", () => {
    const signal = show("signal", "The Signal");
    const studio = show("studio", "Studio");
    const items = [
      watchLog({ id: "plain-single", showItem: studio, minutes: 10, episode: 1 }),
      watchLog({
        id: "note",
        showItem: signal,
        minutes: 20,
        episode: 4,
        note: "This changed how the whole season reads.",
      }),
      watchLog({ id: "run-2", showItem: signal, minutes: 30, episode: 3 }),
      watchLog({ id: "run-1", showItem: signal, minutes: 40, episode: 2 }),
      review({
        id: "rating",
        showItem: studio,
        minutes: 50,
        rating: 4.5,
      }),
    ];

    const rows = organizeLogTimeline({
      items,
      filter: "highlights",
      sort: "recent",
      now: NOW,
    }).flatMap((section) => section.rows);

    expect(rows).toHaveLength(3);
    expect(rows.some((row) => row.kind === "cluster")).toBe(true);
    expect(
      rows.some((row) => row.kind === "item" && row.item.id === ("plain-single" as any)),
    ).toBe(false);
    expect(rows.some((row) => row.kind === "item" && row.item.id === ("note" as any))).toBe(
      true,
    );
    expect(rows.some((row) => row.kind === "item" && row.item.id === ("rating" as any))).toBe(
      true,
    );
  });

  it("summarizes weekly entries, reviews, notes, and average rating", () => {
    const signal = show("signal", "The Signal");
    const items = [
      watchLog({ id: "note", showItem: signal, minutes: 20, episode: 1, note: "Great." }),
      watchLog({ id: "plain", showItem: signal, minutes: 40, episode: 2 }),
      review({
        id: "review",
        showItem: signal,
        minutes: 80,
        rating: 4,
        reviewText: "Sharp.",
      }),
    ];

    expect(computeLogSummary(items, NOW)).toMatchObject({
      totalItems: 3,
      totalEntries: 2,
      totalReviews: 1,
      totalNotes: 2,
      weekEntries: 2,
      weekReviews: 1,
      weekNotes: 2,
      uniqueShows: 1,
      averageRating: 4,
    });
  });
});

import { describe, expect, it } from "@jest/globals";

import {
  buildDiaryFeed,
  computeDiaryPulse,
  formatEpisodeRange,
  getDiaryHeadline,
  type DiaryItem,
  type DiaryLogItem,
} from "../lib/logDiary";

const NOW = new Date("2026-06-02T20:30:00Z").getTime();

function show(id: string, title: string) {
  return { _id: id, id, title, posterUrl: null };
}

function minutesAgo(minutes: number) {
  return NOW - minutes * 60_000;
}

function daysAgo(days: number, hour = 21) {
  const date = new Date(NOW);
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(hour, 15, 0, 0);
  return date.getTime();
}

function watchLog({
  id,
  showItem,
  timestamp,
  season = 1,
  episode,
  note,
}: {
  id: string;
  showItem: ReturnType<typeof show>;
  timestamp: number;
  season?: number | null;
  episode: number | null;
  note?: string;
}): DiaryItem {
  return {
    id: id as any,
    type: "log",
    timestamp,
    show: showItem,
    log: {
      _id: id,
      id,
      showId: showItem._id,
      watchedAt: timestamp,
      seasonNumber: season,
      episodeNumber: episode,
      episodeTitle: episode === null ? null : `Episode ${episode}`,
      note: note ?? null,
    },
  };
}

function review({
  id,
  showItem,
  timestamp,
  rating,
  reviewText,
}: {
  id: string;
  showItem: ReturnType<typeof show>;
  timestamp: number;
  rating: number;
  reviewText?: string;
}): DiaryItem {
  return {
    id: id as any,
    type: "review",
    timestamp,
    show: showItem,
    review: {
      _id: id,
      id,
      showId: showItem._id,
      createdAt: timestamp,
      rating,
      reviewText: reviewText ?? null,
      spoiler: false,
    },
  };
}

describe("buildDiaryFeed", () => {
  it("collapses same-day plain episode runs into a single binge row", () => {
    const signal = show("signal", "The Signal");
    const items = [
      watchLog({ id: "log-3", showItem: signal, timestamp: minutesAgo(30), episode: 3 }),
      watchLog({ id: "log-2", showItem: signal, timestamp: minutesAgo(45), episode: 2 }),
      watchLog({ id: "log-1", showItem: signal, timestamp: minutesAgo(60), episode: 1 }),
    ];

    const rows = buildDiaryFeed({ items, filter: "all", now: NOW });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: "month" });
    expect(rows[1]).toMatchObject({
      kind: "binge",
      title: "The Signal",
      episodeRange: "S01E01–E03",
      isLastOfDay: true,
    });
    if (rows[1]?.kind !== "binge") throw new Error("Expected binge row");
    expect(rows[1].logs).toHaveLength(3);
    expect(rows[1].dayLabel).toMatchObject({ isToday: true });
  });

  it("keeps noted logs and reviews out of binge runs", () => {
    const signal = show("signal", "The Signal");
    const items = [
      watchLog({ id: "plain-2", showItem: signal, timestamp: minutesAgo(10), episode: 4 }),
      watchLog({
        id: "noted",
        showItem: signal,
        timestamp: minutesAgo(20),
        episode: 3,
        note: "This changed everything.",
      }),
      watchLog({ id: "plain-1", showItem: signal, timestamp: minutesAgo(30), episode: 2 }),
    ];

    const rows = buildDiaryFeed({ items, filter: "all", now: NOW });
    const kinds = rows.map((row) => row.kind);
    expect(kinds).toEqual(["month", "entry", "entry", "entry"]);
  });

  it("labels only the first row of each day and inserts month headers", () => {
    const signal = show("signal", "The Signal");
    const studio = show("studio", "Studio");
    const items = [
      review({ id: "r-today", showItem: signal, timestamp: minutesAgo(20), rating: 4 }),
      review({ id: "r-today-2", showItem: studio, timestamp: minutesAgo(40), rating: 3 }),
      review({ id: "r-old", showItem: studio, timestamp: daysAgo(40), rating: 5 }),
    ];

    const rows = buildDiaryFeed({ items, filter: "all", now: NOW });

    expect(rows.map((row) => row.kind)).toEqual([
      "month",
      "entry",
      "entry",
      "month",
      "entry",
    ]);
    if (rows[0]?.kind !== "month" || rows[3]?.kind !== "month") {
      throw new Error("Expected month rows");
    }
    expect(rows[0].label).toBe("June 2026");
    expect(rows[0].entryCount).toBe(2);
    expect(rows[3].label).toBe("April 2026");
    if (rows[1]?.kind !== "entry" || rows[2]?.kind !== "entry") {
      throw new Error("Expected entry rows");
    }
    expect(rows[1].dayLabel).not.toBeNull();
    expect(rows[2].dayLabel).toBeNull();
    expect(rows[1].isLastOfDay).toBe(false);
    expect(rows[2].isLastOfDay).toBe(true);
  });

  it("applies content filters", () => {
    const signal = show("signal", "The Signal");
    const items = [
      watchLog({ id: "plain", showItem: signal, timestamp: minutesAgo(10), episode: 1 }),
      watchLog({
        id: "noted",
        showItem: signal,
        timestamp: minutesAgo(20),
        episode: 2,
        note: "Great hour of TV.",
      }),
      review({
        id: "written",
        showItem: signal,
        timestamp: minutesAgo(30),
        rating: 4,
        reviewText: "Sharp.",
      }),
      review({ id: "rating-only", showItem: signal, timestamp: minutesAgo(40), rating: 2 }),
    ];

    const idsFor = (filter: "episodes" | "reviews" | "notes") =>
      buildDiaryFeed({ items, filter, now: NOW })
        .filter((row) => row.kind === "entry")
        .map((row) => (row.kind === "entry" ? row.item.id : ""));

    expect(idsFor("episodes")).toEqual(["plain", "noted"]);
    expect(idsFor("reviews")).toEqual(["written", "rating-only"]);
    expect(idsFor("notes")).toEqual(["noted", "written"]);
  });
});

describe("formatEpisodeRange", () => {
  it("spans seasons when a run crosses a boundary", () => {
    const signal = show("signal", "The Signal");
    const logs = [
      watchLog({ id: "b", showItem: signal, timestamp: minutesAgo(5), season: 2, episode: 1 }),
      watchLog({ id: "a", showItem: signal, timestamp: minutesAgo(10), season: 1, episode: 9 }),
    ] as DiaryLogItem[];

    expect(formatEpisodeRange(logs)).toBe("S01E09–S02E01");
  });

  it("returns null when no episode metadata exists", () => {
    const signal = show("signal", "The Signal");
    const logs = [
      watchLog({
        id: "a",
        showItem: signal,
        timestamp: minutesAgo(5),
        season: null,
        episode: null,
      }),
    ] as DiaryLogItem[];

    expect(formatEpisodeRange(logs)).toBeNull();
  });
});

describe("computeDiaryPulse", () => {
  it("computes streak, weekly counts, and the 7-day histogram", () => {
    const signal = show("signal", "The Signal");
    const items = [
      watchLog({ id: "today", showItem: signal, timestamp: minutesAgo(30), episode: 3 }),
      watchLog({ id: "yesterday", showItem: signal, timestamp: daysAgo(1), episode: 2 }),
      review({ id: "two-back", showItem: signal, timestamp: daysAgo(2), rating: 4 }),
      watchLog({ id: "old", showItem: signal, timestamp: daysAgo(20), episode: 1 }),
    ];

    const pulse = computeDiaryPulse(items, NOW);

    expect(pulse.totalItems).toBe(4);
    expect(pulse.uniqueShows).toBe(1);
    expect(pulse.weekItems).toBe(3);
    expect(pulse.weekEpisodes).toBe(2);
    expect(pulse.weekReviews).toBe(1);
    expect(pulse.streakDays).toBe(3);
    expect(pulse.days).toHaveLength(7);
    expect(pulse.days[6]).toMatchObject({ count: 1, isToday: true });
    expect(pulse.days[5]).toMatchObject({ count: 1, isToday: false });
    expect(pulse.days[3]).toMatchObject({ count: 0 });
  });

  it("lets a streak survive an empty today", () => {
    const signal = show("signal", "The Signal");
    const items = [
      watchLog({ id: "yesterday", showItem: signal, timestamp: daysAgo(1), episode: 2 }),
      watchLog({ id: "two-back", showItem: signal, timestamp: daysAgo(2), episode: 1 }),
    ];

    expect(computeDiaryPulse(items, NOW).streakDays).toBe(2);
  });
});

describe("getDiaryHeadline", () => {
  it("adapts to activity level", () => {
    const signal = show("signal", "The Signal");

    expect(getDiaryHeadline(computeDiaryPulse([], NOW))).toBe(
      "Everything you watch, remembered in order.",
    );

    const quiet = computeDiaryPulse(
      [watchLog({ id: "old", showItem: signal, timestamp: daysAgo(20), episode: 1 })],
      NOW,
    );
    expect(getDiaryHeadline(quiet)).toBe("Quiet week so far · 1 entry across 1 show");

    const streaking = computeDiaryPulse(
      [
        watchLog({ id: "today", showItem: signal, timestamp: minutesAgo(30), episode: 2 }),
        watchLog({ id: "yesterday", showItem: signal, timestamp: daysAgo(1), episode: 1 }),
      ],
      NOW,
    );
    expect(getDiaryHeadline(streaking)).toBe("2 entries this week · 2-day streak");
  });
});

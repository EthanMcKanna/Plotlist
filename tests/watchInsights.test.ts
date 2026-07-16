import { describe, expect, it } from "@jest/globals";

import {
  buildWatchInsights,
  extractShowRuntimeMinutes,
  WATCH_INSIGHTS_DEFAULT_RUNTIME_MINUTES,
} from "../lib/watchInsights";

const NOW = Date.parse("2026-07-03T20:00:00.000Z");
const DAY = 86_400_000;

const SHOW = {
  id: "show_1",
  title: "Severance",
  posterUrl: "https://example.com/poster.jpg",
  genreIds: [18, 9648],
  externalSource: "tmdb",
  externalId: "95396",
};

function episode(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: `ep_${Math.abs(JSON.stringify(overrides).length)}_${String(overrides.watchedAt ?? "")}`,
    showId: SHOW.id,
    seasonNumber: 1,
    episodeNumber: 1,
    watchedAt: NOW - DAY,
    ...overrides,
  };
}

describe("buildWatchInsights", () => {
  it("returns an empty payload for no input", () => {
    const insights = buildWatchInsights({ now: NOW });
    expect(insights.totals.episodes).toBe(0);
    expect(insights.totals.minutes).toBe(0);
    expect(insights.firstWatchedAt).toBeNull();
    expect(insights.monthlyActivity).toHaveLength(12);
    expect(insights.monthlyActivity.every((month) => month.episodes === 0)).toBe(true);
    expect(insights.streaks).toEqual({ current: 0, longest: 0 });
  });

  it("dedupes rewatches of the same episode, keeping the latest timestamp", () => {
    const insights = buildWatchInsights({
      now: NOW,
      shows: [SHOW],
      episodes: [
        episode({ id: "a", watchedAt: NOW - 3 * DAY }),
        episode({ id: "b", watchedAt: NOW - DAY }),
      ],
    });
    expect(insights.totals.episodes).toBe(1);
    expect(insights.latestWatchedAt).toBe(NOW - DAY);
  });

  it("drops malformed and far-future rows without poisoning the payload", () => {
    const insights = buildWatchInsights({
      now: NOW,
      shows: [SHOW],
      episodes: [
        episode({ episodeNumber: 2 }),
        episode({ episodeNumber: 3, watchedAt: NOW + 60 * 60 * 1000 }),
        episode({ episodeNumber: null }),
        episode({ showId: undefined }),
        episode({ episodeNumber: 4, watchedAt: "not-a-date" }),
      ],
    });
    expect(insights.totals.episodes).toBe(1);
  });

  it("uses exact per-episode runtime, then season median, then show runtime, then default", () => {
    const insights = buildWatchInsights({
      now: NOW,
      shows: [
        SHOW,
        { ...SHOW, id: "show_2", externalId: "222" },
        { ...SHOW, id: "show_3", externalId: "333" },
      ],
      episodes: [
        episode({ episodeNumber: 1 }), // exact runtime: 61
        episode({ episodeNumber: 9 }), // not in season data → season median: 50
        episode({ showId: "show_2", watchedAt: NOW - 2 * DAY }), // show-level: 30
        episode({ showId: "show_3", watchedAt: NOW - 3 * DAY }), // default
      ],
      seasonRuntimes: [
        {
          externalId: SHOW.externalId,
          seasonNumber: 1,
          episodes: [
            { episodeNumber: 1, runtime: 61 },
            { episodeNumber: 2, runtime: 50 },
            { episodeNumber: 3, runtime: 45 },
          ],
        },
      ],
      showRuntimes: [{ externalId: "222", runtimeMinutes: 30 }],
    });
    expect(insights.totals.minutes).toBe(
      61 + 50 + 30 + WATCH_INSIGHTS_DEFAULT_RUNTIME_MINUTES,
    );
    expect(insights.totals.exactRuntimeShare).toBeCloseTo(0.25);
  });

  it("buckets days, weekdays, and dayparts in the user's timezone", () => {
    // 02:00 UTC = 18:00 previous day in UTC-8.
    const watchedAt = Date.parse("2026-07-02T02:00:00.000Z");
    const utcInsights = buildWatchInsights({
      now: NOW,
      shows: [SHOW],
      episodes: [episode({ watchedAt })],
      utcOffsetMinutes: 0,
    });
    const pacificInsights = buildWatchInsights({
      now: NOW,
      shows: [SHOW],
      episodes: [episode({ watchedAt })],
      utcOffsetMinutes: -480,
    });

    // UTC: Thursday July 2, late night. Pacific: Wednesday July 1, evening.
    expect(utcInsights.weekdayActivity[4].episodes).toBe(1); // Thu
    expect(utcInsights.daypartActivity[3].episodes).toBe(1); // Late night
    expect(pacificInsights.weekdayActivity[3].episodes).toBe(1); // Wed
    expect(pacificInsights.daypartActivity[2].episodes).toBe(1); // Evening
  });

  it("computes streaks from consecutive local days", () => {
    const insights = buildWatchInsights({
      now: NOW,
      shows: [SHOW],
      episodes: [
        episode({ episodeNumber: 1, watchedAt: NOW - 2 * DAY }),
        episode({ episodeNumber: 2, watchedAt: NOW - DAY }),
        episode({ episodeNumber: 3, watchedAt: NOW - 2 * 60 * 60 * 1000 }),
        // A separate two-day run further back.
        episode({ episodeNumber: 4, watchedAt: NOW - 20 * DAY }),
        episode({ episodeNumber: 5, watchedAt: NOW - 21 * DAY }),
      ],
    });
    expect(insights.streaks.current).toBe(3);
    expect(insights.streaks.longest).toBe(3);
    expect(insights.totals.activeDays).toBe(5);
  });

  it("keeps only the latest watch status per show", () => {
    const insights = buildWatchInsights({
      now: NOW,
      watchStates: [
        { showId: "s1", status: "watching", updatedAt: 1 },
        { showId: "s1", status: "completed", updatedAt: 2 },
        { showId: "s2", status: "watchlist", updatedAt: 1 },
        { showId: "s3", status: "not-a-status", updatedAt: 1 },
      ],
    });
    expect(insights.library).toEqual({
      watchlist: 1,
      watching: 0,
      completed: 1,
      dropped: 0,
      total: 2,
    });
  });

  it("aggregates genres and top shows by runtime minutes", () => {
    const insights = buildWatchInsights({
      now: NOW,
      shows: [SHOW],
      episodes: [
        episode({ episodeNumber: 1, watchedAt: NOW - DAY }),
        episode({ episodeNumber: 2, watchedAt: NOW - 2 * DAY }),
      ],
      showRuntimes: [{ externalId: SHOW.externalId, runtimeMinutes: 40 }],
    });
    expect(insights.topShows).toHaveLength(1);
    expect(insights.topShows[0]).toMatchObject({
      showId: SHOW.id,
      title: SHOW.title,
      episodes: 2,
      minutes: 80,
    });
    const genreLabels = insights.topGenres.map((genre) => genre.label);
    expect(genreLabels).toContain("Drama");
    expect(genreLabels).toContain("Mystery");
    expect(insights.topGenres[0].minutes).toBe(80);
  });

  it("summarizes reviews and surfaces top-rated shows", () => {
    const insights = buildWatchInsights({
      now: NOW,
      shows: [SHOW],
      reviews: [
        { id: "r1", showId: SHOW.id, rating: 5, createdAt: NOW - DAY },
        { id: "r2", showId: SHOW.id, rating: 3, createdAt: NOW - 2 * DAY },
        { id: "r3", showId: SHOW.id, rating: 9 }, // invalid rating dropped
      ],
    });
    expect(insights.reviews.total).toBe(2);
    expect(insights.reviews.averageRating).toBe(4);
    expect(insights.reviews.fiveStarCount).toBe(1);
    expect(insights.reviews.topRated).toHaveLength(1);
    expect(insights.reviews.topRated[0]).toMatchObject({ reviewId: "r1", title: SHOW.title });
  });

  it("scopes yearToDate to the current local year", () => {
    const insights = buildWatchInsights({
      now: NOW, // 2026-07-03 UTC
      shows: [SHOW],
      episodes: [
        episode({ episodeNumber: 1, watchedAt: NOW - DAY }),
        episode({ episodeNumber: 2, watchedAt: Date.parse("2026-01-05T20:00:00.000Z") }),
        episode({ episodeNumber: 3, watchedAt: Date.parse("2025-12-30T20:00:00.000Z") }),
      ],
      showRuntimes: [{ externalId: SHOW.externalId, runtimeMinutes: 40 }],
    });
    expect(insights.yearToDate.year).toBe(2026);
    expect(insights.yearToDate.episodes).toBe(2);
    expect(insights.yearToDate.minutes).toBe(80);
    expect(insights.yearToDate.shows).toBe(1);
    expect(insights.yearToDate.activeDays).toBe(2);
    expect(insights.yearToDate.topShows[0]).toMatchObject({
      showId: SHOW.id,
      episodes: 2,
      posterUrl: SHOW.posterUrl,
    });
    expect(insights.yearToDate.topGenres[0]).toMatchObject({
      label: "Drama",
      episodes: 2,
      posterUrls: [SHOW.posterUrl],
    });
  });

  it("assigns year boundaries in the user's timezone", () => {
    // 2025-12-31 23:30 UTC is already 2026 in UTC+2, still 2025 in UTC-8.
    const watchedAt = Date.parse("2025-12-31T23:30:00.000Z");
    const eastOfUtc = buildWatchInsights({
      now: NOW,
      shows: [SHOW],
      episodes: [episode({ watchedAt })],
      utcOffsetMinutes: 120,
    });
    const westOfUtc = buildWatchInsights({
      now: NOW,
      shows: [SHOW],
      episodes: [episode({ watchedAt })],
      utcOffsetMinutes: -480,
    });
    expect(eastOfUtc.yearToDate.episodes).toBe(1);
    expect(westOfUtc.yearToDate.episodes).toBe(0);
  });

  it("finds the biggest binge as a consecutive-day run on one show", () => {
    const insights = buildWatchInsights({
      now: NOW,
      shows: [SHOW, { ...SHOW, id: "show_2", title: "Other", externalId: "222" }],
      episodes: [
        // Severance: 6 episodes across 3 consecutive days.
        episode({ episodeNumber: 1, watchedAt: NOW - 3 * DAY }),
        episode({ episodeNumber: 2, watchedAt: NOW - 3 * DAY + 1000 }),
        episode({ episodeNumber: 3, watchedAt: NOW - 2 * DAY }),
        episode({ episodeNumber: 4, watchedAt: NOW - 2 * DAY + 1000 }),
        episode({ episodeNumber: 5, watchedAt: NOW - DAY }),
        episode({ episodeNumber: 6, watchedAt: NOW - DAY + 1000 }),
        // Other show: 5 episodes but split by a gap day — runs of 3 and 2.
        episode({ showId: "show_2", episodeNumber: 1, watchedAt: NOW - 10 * DAY }),
        episode({ showId: "show_2", episodeNumber: 2, watchedAt: NOW - 10 * DAY + 1000 }),
        episode({ showId: "show_2", episodeNumber: 3, watchedAt: NOW - 10 * DAY + 2000 }),
        episode({ showId: "show_2", episodeNumber: 4, watchedAt: NOW - 8 * DAY }),
        episode({ showId: "show_2", episodeNumber: 5, watchedAt: NOW - 8 * DAY + 1000 }),
      ],
    });
    expect(insights.yearToDate.biggestBinge).toMatchObject({
      showId: SHOW.id,
      title: SHOW.title,
      episodes: 6,
      days: 3,
    });
  });

  it("returns no binge below the episode threshold and prefers denser runs", () => {
    const sparse = buildWatchInsights({
      now: NOW,
      shows: [SHOW],
      episodes: [
        episode({ episodeNumber: 1, watchedAt: NOW - 2 * DAY }),
        episode({ episodeNumber: 2, watchedAt: NOW - DAY }),
        episode({ episodeNumber: 3, watchedAt: NOW - 10 * DAY }),
      ],
    });
    expect(sparse.yearToDate.biggestBinge).toBeNull();

    const dense = buildWatchInsights({
      now: NOW,
      shows: [SHOW, { ...SHOW, id: "show_2", title: "Other", externalId: "222" }],
      episodes: [
        // 4 episodes in one day…
        episode({ episodeNumber: 1, watchedAt: NOW - DAY }),
        episode({ episodeNumber: 2, watchedAt: NOW - DAY + 1000 }),
        episode({ episodeNumber: 3, watchedAt: NOW - DAY + 2000 }),
        episode({ episodeNumber: 4, watchedAt: NOW - DAY + 3000 }),
        // …beats 4 episodes across 2 days.
        episode({ showId: "show_2", episodeNumber: 1, watchedAt: NOW - 10 * DAY }),
        episode({ showId: "show_2", episodeNumber: 2, watchedAt: NOW - 10 * DAY + 1000 }),
        episode({ showId: "show_2", episodeNumber: 3, watchedAt: NOW - 9 * DAY }),
        episode({ showId: "show_2", episodeNumber: 4, watchedAt: NOW - 9 * DAY + 1000 }),
      ],
    });
    expect(dense.yearToDate.biggestBinge).toMatchObject({
      showId: SHOW.id,
      episodes: 4,
      days: 1,
    });
  });

  it("tracks the busiest day and 30-day window", () => {
    const insights = buildWatchInsights({
      now: NOW,
      shows: [SHOW],
      episodes: [
        episode({ episodeNumber: 1, watchedAt: NOW - DAY }),
        episode({ episodeNumber: 2, watchedAt: NOW - DAY + 1000 }),
        episode({ episodeNumber: 3, watchedAt: NOW - 40 * DAY }),
      ],
      showRuntimes: [{ externalId: SHOW.externalId, runtimeMinutes: 50 }],
    });
    expect(insights.busiestDay?.episodes).toBe(2);
    expect(insights.window.episodesLast30Days).toBe(2);
    expect(insights.window.minutesLast30Days).toBe(100);
  });
});

describe("extractShowRuntimeMinutes", () => {
  it("takes the median of the episode_run_time list", () => {
    expect(extractShowRuntimeMinutes({ episode_run_time: [30, 60, 45] })).toBe(45);
    expect(extractShowRuntimeMinutes({ episodeRunTime: 55 })).toBe(55);
  });

  it("rejects garbage values", () => {
    expect(extractShowRuntimeMinutes({ episode_run_time: [0, -5, 100000] })).toBeNull();
    expect(extractShowRuntimeMinutes(null)).toBeNull();
    expect(extractShowRuntimeMinutes({})).toBeNull();
  });
});

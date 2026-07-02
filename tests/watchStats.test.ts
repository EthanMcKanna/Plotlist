import { describe, expect, it } from "@jest/globals";

import {
  WATCH_STATS_DEFAULT_RUNTIME_MINUTES,
  buildWatchStats,
  extractRuntimeMinutes,
} from "../lib/watchStats";

const NOW = Date.parse("2026-06-02T12:00:00.000Z");
const ts = (iso: string) => Date.parse(iso);

function episode(
  showId: string,
  seasonNumber: number,
  episodeNumber: number,
  watchedAt: string | number,
  id = `${showId}-${seasonNumber}-${episodeNumber}`,
) {
  return {
    id,
    showId,
    seasonNumber,
    episodeNumber,
    watchedAt: typeof watchedAt === "string" ? ts(watchedAt) : watchedAt,
  };
}

function show(id: string, title = id, externalId = id, genreIds: number[] = []) {
  return {
    id,
    title,
    posterUrl: `https://img.example/${id}.jpg`,
    genreIds,
    externalSource: "tmdb",
    externalId,
  };
}

function runtime(externalId: string, payload: unknown) {
  return { externalSource: "tmdb", externalId, payload };
}

describe("extractRuntimeMinutes", () => {
  it("reads camel-case TMDB runtime payloads", () => {
    expect(extractRuntimeMinutes({ episodeRunTime: 52 })).toBe(52);
  });

  it("reads snake-case TMDB runtime arrays and ignores unusable values", () => {
    expect(extractRuntimeMinutes({ episode_run_time: [0, -1, 30, 60, 9999] })).toBe(45);
  });

  it("supports fallback runtime field names", () => {
    expect(extractRuntimeMinutes({ runtimeMinutes: 41 })).toBe(41);
    expect(extractRuntimeMinutes({ runtime: "44" })).toBe(44);
  });

  it("returns null when the payload cannot produce a realistic runtime", () => {
    expect(extractRuntimeMinutes({ episodeRunTime: 0 })).toBeNull();
    expect(extractRuntimeMinutes({ episode_run_time: [-20, 5000] })).toBeNull();
    expect(extractRuntimeMinutes(null)).toBeNull();
  });
});

describe("buildWatchStats", () => {
  it("returns a complete zero-state payload for a new user", () => {
    const stats = buildWatchStats({ now: NOW });

    expect(stats.totalEpisodes).toBe(0);
    expect(stats.totalMinutes).toBe(0);
    expect(stats.averageEpisodeMinutes).toBe(0);
    expect(stats.firstWatchedAt).toBeNull();
    expect(stats.latestWatchedAt).toBeNull();
    expect(stats.statusCounts).toEqual({
      watchlist: 0,
      watching: 0,
      completed: 0,
      dropped: 0,
      total: 0,
    });
    expect(stats.monthlyActivity.map((item) => item.key)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
  });

  it("counts unique watched episodes, shows, minutes, and average runtime", () => {
    const stats = buildWatchStats({
      now: NOW,
      episodes: [
        episode("a", 1, 1, "2026-06-01T08:00:00.000Z"),
        episode("a", 1, 2, "2026-06-01T09:00:00.000Z"),
        episode("b", 2, 1, "2026-06-02T10:00:00.000Z"),
      ],
      shows: [show("a", "Alpha", "100"), show("b", "Beta", "200")],
      runtimePayloads: [runtime("100", { episodeRunTime: 30 }), runtime("200", { episodeRunTime: 60 })],
    });

    expect(stats.totalEpisodes).toBe(3);
    expect(stats.showsWithProgress).toBe(2);
    expect(stats.totalMinutes).toBe(120);
    expect(stats.averageEpisodeMinutes).toBe(40);
  });

  it("deduplicates duplicate progress rows by show, season, and episode", () => {
    const stats = buildWatchStats({
      now: NOW,
      episodes: [
        episode("a", 1, 1, "2026-05-01T08:00:00.000Z", "old"),
        episode("a", 1, 1, "2026-05-02T08:00:00.000Z", "new"),
      ],
      shows: [show("a")],
      runtimePayloads: [runtime("a", { episodeRunTime: 50 })],
    });

    expect(stats.totalEpisodes).toBe(1);
    expect(stats.totalMinutes).toBe(50);
    expect(stats.latestWatchedAt).toBe(ts("2026-05-02T08:00:00.000Z"));
    expect(stats.recentEpisodes[0]?._id).toBe("new");
  });

  it("keeps season zero specials while rejecting invalid episode coordinates", () => {
    const stats = buildWatchStats({
      now: NOW,
      episodes: [
        episode("a", 0, 1, "2026-05-01T08:00:00.000Z"),
        episode("a", -1, 2, "2026-05-01T08:00:00.000Z"),
        episode("a", 1, 0, "2026-05-01T08:00:00.000Z"),
      ],
      shows: [show("a")],
    });

    expect(stats.totalEpisodes).toBe(1);
    expect(stats.recentEpisodes[0]?.seasonNumber).toBe(0);
  });

  it("ignores rows with missing show IDs, bad timestamps, or far-future timestamps", () => {
    const stats = buildWatchStats({
      now: NOW,
      episodes: [
        { showId: "", seasonNumber: 1, episodeNumber: 1, watchedAt: NOW },
        { showId: "a", seasonNumber: 1, episodeNumber: 1, watchedAt: Number.NaN },
        { showId: "a", seasonNumber: 1, episodeNumber: 2, watchedAt: -1 },
        { showId: "a", seasonNumber: 1, episodeNumber: 3, watchedAt: NOW + 10 * 60 * 1000 },
        episode("a", 1, 4, "2026-06-02T09:00:00.000Z"),
      ],
      shows: [show("a")],
    });

    expect(stats.totalEpisodes).toBe(1);
    expect(stats.recentEpisodes[0]?.episodeNumber).toBe(4);
  });

  it("clamps tiny future clock drift instead of throwing away the row", () => {
    const stats = buildWatchStats({
      now: NOW,
      episodes: [episode("a", 1, 1, NOW + 60_000)],
      shows: [show("a")],
    });

    expect(stats.totalEpisodes).toBe(1);
    expect(stats.latestWatchedAt).toBe(NOW);
  });

  it("uses the default runtime when runtime cache data is unavailable", () => {
    const stats = buildWatchStats({
      now: NOW,
      episodes: [episode("a", 1, 1, "2026-06-01T08:00:00.000Z")],
      shows: [show("a")],
    });

    expect(stats.totalMinutes).toBe(WATCH_STATS_DEFAULT_RUNTIME_MINUTES);
    expect(stats.recentEpisodes[0]?.runtimeMinutes).toBe(WATCH_STATS_DEFAULT_RUNTIME_MINUTES);
  });

  it("counts episodes even if the show join is missing", () => {
    const stats = buildWatchStats({
      now: NOW,
      episodes: [episode("missing", 1, 1, "2026-06-01T08:00:00.000Z")],
      shows: [],
    });

    expect(stats.totalEpisodes).toBe(1);
    expect(stats.showsWithProgress).toBe(1);
    expect(stats.topShows).toEqual([]);
    expect(stats.recentEpisodes[0]?.show).toBeNull();
  });

  it("sorts top shows by episodes, minutes, latest watch, then ID", () => {
    const stats = buildWatchStats({
      now: NOW,
      episodes: [
        episode("a", 1, 1, "2026-06-01T08:00:00.000Z"),
        episode("a", 1, 2, "2026-06-01T09:00:00.000Z"),
        episode("b", 1, 1, "2026-06-01T10:00:00.000Z"),
        episode("b", 1, 2, "2026-06-01T11:00:00.000Z"),
        episode("c", 1, 1, "2026-06-02T08:00:00.000Z"),
      ],
      shows: [show("a", "Alpha", "a"), show("b", "Beta", "b"), show("c", "Charlie", "c")],
      runtimePayloads: [runtime("a", { episodeRunTime: 30 }), runtime("b", { episodeRunTime: 60 })],
    });

    expect(stats.topShows.map((item) => item.show._id)).toEqual(["b", "a", "c"]);
  });

  it("caps top shows at five without dropping total progress", () => {
    const stats = buildWatchStats({
      now: NOW,
      episodes: Array.from({ length: 7 }, (_, index) =>
        episode(`show-${index}`, 1, 1, NOW - index * 1000),
      ),
      shows: Array.from({ length: 7 }, (_, index) => show(`show-${index}`)),
    });

    expect(stats.totalEpisodes).toBe(7);
    expect(stats.showsWithProgress).toBe(7);
    expect(stats.topShows).toHaveLength(5);
  });

  it("is invariant to input order for all summary totals", () => {
    const episodes = [
      episode("a", 1, 1, "2026-06-01T08:00:00.000Z"),
      episode("a", 1, 2, "2026-06-02T08:00:00.000Z"),
      episode("b", 1, 1, "2026-05-31T08:00:00.000Z"),
      episode("b", 1, 1, "2026-06-01T10:00:00.000Z", "b-newer-duplicate"),
    ];
    const base = buildWatchStats({
      now: NOW,
      episodes,
      shows: [show("a"), show("b")],
      runtimePayloads: [runtime("a", { episodeRunTime: 30 }), runtime("b", { episodeRunTime: 60 })],
      watchStates: [
        { showId: "a", status: "watching", updatedAt: 2 },
        { showId: "b", status: "completed", updatedAt: 1 },
      ],
    });
    const shuffled = buildWatchStats({
      now: NOW,
      episodes: [...episodes].reverse(),
      shows: [show("b"), show("a")],
      runtimePayloads: [runtime("b", { episodeRunTime: 60 }), runtime("a", { episodeRunTime: 30 })],
      watchStates: [
        { showId: "b", status: "completed", updatedAt: 1 },
        { showId: "a", status: "watching", updatedAt: 2 },
      ],
    });

    expect(shuffled.totalEpisodes).toBe(base.totalEpisodes);
    expect(shuffled.totalMinutes).toBe(base.totalMinutes);
    expect(shuffled.statusCounts).toEqual(base.statusCounts);
    expect(shuffled.topShows.map((item) => item.show._id)).toEqual(base.topShows.map((item) => item.show._id));
  });

  it("limits recent episodes to the latest eight in deterministic order", () => {
    const episodes = Array.from({ length: 10 }, (_, index) =>
      episode("a", 1, index + 1, NOW - index * 60_000, `episode-${index + 1}`),
    );
    const stats = buildWatchStats({ now: NOW, episodes, shows: [show("a")] });

    expect(stats.recentEpisodes).toHaveLength(8);
    expect(stats.recentEpisodes.map((item) => item._id)).toEqual([
      "episode-1",
      "episode-2",
      "episode-3",
      "episode-4",
      "episode-5",
      "episode-6",
      "episode-7",
      "episode-8",
    ]);
  });

  it("computes first and latest watch timestamps from normalized rows", () => {
    const stats = buildWatchStats({
      now: NOW,
      episodes: [
        episode("a", 1, 1, "2026-04-01T08:00:00.000Z"),
        episode("a", 1, 2, "2026-06-01T09:00:00.000Z"),
        episode("a", 1, 3, "2026-05-01T09:00:00.000Z"),
      ],
      shows: [show("a")],
    });

    expect(stats.firstWatchedAt).toBe(ts("2026-04-01T08:00:00.000Z"));
    expect(stats.latestWatchedAt).toBe(ts("2026-06-01T09:00:00.000Z"));
  });

  it("counts last-30-days activity using a rolling timestamp window", () => {
    const stats = buildWatchStats({
      now: NOW,
      episodes: [
        episode("a", 1, 1, NOW - 30 * 86_400_000),
        episode("a", 1, 2, NOW - 30 * 86_400_000 - 1),
        episode("a", 1, 3, NOW - 1),
      ],
      shows: [show("a")],
    });

    expect(stats.episodesLast30Days).toBe(2);
  });

  it("aggregates monthly activity for the visible six-month window", () => {
    const stats = buildWatchStats({
      now: NOW,
      episodes: [
        episode("a", 1, 1, "2026-01-15T08:00:00.000Z"),
        episode("a", 1, 2, "2026-05-31T08:00:00.000Z"),
        episode("a", 1, 3, "2026-06-01T08:00:00.000Z"),
        episode("a", 1, 4, "2025-12-31T08:00:00.000Z"),
      ],
      shows: [show("a")],
    });

    expect(stats.monthlyActivity.map((item) => [item.key, item.count])).toEqual([
      ["2026-01", 1],
      ["2026-02", 0],
      ["2026-03", 0],
      ["2026-04", 0],
      ["2026-05", 1],
      ["2026-06", 1],
    ]);
  });

  it("keeps the six-month window correct across year boundaries", () => {
    const stats = buildWatchStats({
      now: ts("2026-01-15T12:00:00.000Z"),
      episodes: [
        episode("a", 1, 1, "2025-08-01T08:00:00.000Z"),
        episode("a", 1, 2, "2025-12-31T08:00:00.000Z"),
        episode("a", 1, 3, "2026-01-01T08:00:00.000Z"),
      ],
      shows: [show("a")],
    });

    expect(stats.monthlyActivity.map((item) => [item.key, item.count])).toEqual([
      ["2025-08", 1],
      ["2025-09", 0],
      ["2025-10", 0],
      ["2025-11", 0],
      ["2025-12", 1],
      ["2026-01", 1],
    ]);
  });

  it("aggregates weekday heat in UTC", () => {
    const stats = buildWatchStats({
      now: NOW,
      episodes: [
        episode("a", 1, 1, "2026-05-31T08:00:00.000Z"),
        episode("a", 1, 2, "2026-06-01T08:00:00.000Z"),
        episode("a", 1, 3, "2026-06-01T09:00:00.000Z"),
      ],
      shows: [show("a")],
    });

    expect(stats.weekdayActivity).toEqual([
      { label: "Sun", count: 1 },
      { label: "Mon", count: 2 },
      { label: "Tue", count: 0 },
      { label: "Wed", count: 0 },
      { label: "Thu", count: 0 },
      { label: "Fri", count: 0 },
      { label: "Sat", count: 0 },
    ]);
  });

  it("places watches into expected time-of-day buckets", () => {
    const stats = buildWatchStats({
      now: NOW,
      episodes: [
        episode("a", 1, 1, "2026-06-01T05:00:00.000Z"),
        episode("a", 1, 2, "2026-06-01T12:00:00.000Z"),
        episode("a", 1, 3, "2026-06-01T17:00:00.000Z"),
        episode("a", 1, 4, "2026-06-01T23:00:00.000Z"),
      ],
      shows: [show("a")],
    });

    expect(stats.timeOfDayActivity).toEqual([
      { label: "Morning", count: 1 },
      { label: "Afternoon", count: 1 },
      { label: "Evening", count: 1 },
      { label: "Late night", count: 1 },
    ]);
  });

  it("counts active days once even when multiple episodes land on one day", () => {
    const stats = buildWatchStats({
      now: NOW,
      episodes: [
        episode("a", 1, 1, "2026-06-01T08:00:00.000Z"),
        episode("a", 1, 2, "2026-06-01T09:00:00.000Z"),
        episode("a", 1, 3, "2026-06-02T09:00:00.000Z"),
      ],
      shows: [show("a")],
    });

    expect(stats.activeDays).toBe(2);
  });

  it("computes longest streak across gaps", () => {
    const stats = buildWatchStats({
      now: NOW,
      episodes: [
        episode("a", 1, 1, "2026-05-01T08:00:00.000Z"),
        episode("a", 1, 2, "2026-05-02T08:00:00.000Z"),
        episode("a", 1, 3, "2026-05-04T08:00:00.000Z"),
        episode("a", 1, 4, "2026-05-05T08:00:00.000Z"),
        episode("a", 1, 5, "2026-05-06T08:00:00.000Z"),
      ],
      shows: [show("a")],
    });

    expect(stats.longestStreak).toBe(3);
  });

  it("keeps current streak active when the latest watch was yesterday", () => {
    const stats = buildWatchStats({
      now: NOW,
      episodes: [
        episode("a", 1, 1, "2026-05-30T08:00:00.000Z"),
        episode("a", 1, 2, "2026-05-31T08:00:00.000Z"),
        episode("a", 1, 3, "2026-06-01T08:00:00.000Z"),
      ],
      shows: [show("a")],
    });

    expect(stats.currentStreak).toBe(3);
  });

  it("counts current streak through today when today has activity", () => {
    const stats = buildWatchStats({
      now: NOW,
      episodes: [
        episode("a", 1, 1, "2026-06-01T08:00:00.000Z"),
        episode("a", 1, 2, "2026-06-02T08:00:00.000Z"),
      ],
      shows: [show("a")],
    });

    expect(stats.currentStreak).toBe(2);
  });

  it("sets current streak to zero when the last watch day is stale", () => {
    const stats = buildWatchStats({
      now: NOW,
      episodes: [
        episode("a", 1, 1, "2026-05-01T08:00:00.000Z"),
        episode("a", 1, 2, "2026-05-02T08:00:00.000Z"),
      ],
      shows: [show("a")],
    });

    expect(stats.longestStreak).toBe(2);
    expect(stats.currentStreak).toBe(0);
  });

  it("counts library statuses and ignores unknown statuses", () => {
    const stats = buildWatchStats({
      now: NOW,
      watchStates: [
        { showId: "a", status: "watchlist", updatedAt: 1 },
        { showId: "b", status: "watching", updatedAt: 1 },
        { showId: "c", status: "completed", updatedAt: 1 },
        { showId: "d", status: "dropped", updatedAt: 1 },
        { showId: "e", status: "paused", updatedAt: 1 },
      ],
    });

    expect(stats.statusCounts).toEqual({
      watchlist: 1,
      watching: 1,
      completed: 1,
      dropped: 1,
      total: 4,
    });
  });

  it("deduplicates library statuses by show using the newest update", () => {
    const stats = buildWatchStats({
      now: NOW,
      watchStates: [
        { showId: "a", status: "watchlist", updatedAt: 1 },
        { showId: "a", status: "completed", updatedAt: 2 },
        { showId: "b", status: "watching", updatedAt: 1 },
      ],
    });

    expect(stats.statusCounts).toEqual({
      watchlist: 0,
      watching: 1,
      completed: 1,
      dropped: 0,
      total: 2,
    });
  });

  it("deduplicates same-timestamp library statuses by the last observed row", () => {
    const stats = buildWatchStats({
      now: NOW,
      watchStates: [
        { showId: "a", status: "watching", updatedAt: 10 },
        { showId: "a", status: "dropped", updatedAt: 10 },
      ],
    });

    expect(stats.statusCounts).toEqual({
      watchlist: 0,
      watching: 0,
      completed: 0,
      dropped: 1,
      total: 1,
    });
  });

  it("still counts valid status rows without show IDs", () => {
    const stats = buildWatchStats({
      now: NOW,
      watchStates: [{ status: "watchlist" }, { status: "watching" }],
    });

    expect(stats.statusCounts.total).toBe(2);
  });

  it("computes review averages, rated shows, and five-star counts", () => {
    const stats = buildWatchStats({
      now: NOW,
      reviews: [
        { id: "r1", showId: "a", rating: 5, createdAt: ts("2026-05-01T08:00:00.000Z") },
        { id: "r2", showId: "a", rating: 4, createdAt: ts("2026-05-02T08:00:00.000Z") },
        { id: "r3", showId: "b", rating: 3, createdAt: ts("2026-05-03T08:00:00.000Z") },
      ],
      shows: [show("a", "Alpha"), show("b", "Beta")],
    });

    expect(stats.reviewStats.totalReviews).toBe(3);
    expect(stats.reviewStats.ratedShows).toBe(2);
    expect(stats.reviewStats.averageRating).toBe(4);
    expect(stats.reviewStats.fiveStarCount).toBe(1);
  });

  it("ignores invalid ratings instead of corrupting review stats", () => {
    const stats = buildWatchStats({
      now: NOW,
      reviews: [
        { id: "bad-low", showId: "a", rating: -1, createdAt: 1 },
        { id: "bad-high", showId: "a", rating: 6, createdAt: 1 },
        { id: "bad-nan", showId: "a", rating: Number.NaN, createdAt: 1 },
        { id: "ok", showId: "a", rating: 4.5, createdAt: 1 },
      ],
      shows: [show("a")],
    });

    expect(stats.reviewStats.totalReviews).toBe(1);
    expect(stats.reviewStats.averageRating).toBe(4.5);
  });

  it("sorts top-rated reviews by rating, recency, and caps at three", () => {
    const stats = buildWatchStats({
      now: NOW,
      reviews: [
        { id: "r1", showId: "a", rating: 4, createdAt: 1 },
        { id: "r2", showId: "b", rating: 5, createdAt: 2 },
        { id: "r3", showId: "c", rating: 5, createdAt: 3 },
        { id: "r4", showId: "d", rating: 4.5, createdAt: 4 },
        { id: "r5", showId: "e", rating: 3.5, createdAt: 5 },
      ],
      shows: [show("a"), show("b"), show("c"), show("d"), show("e")],
    });

    expect(stats.reviewStats.topRated.map((item) => item.review._id)).toEqual(["r3", "r2", "r4"]);
  });

  it("keeps top-rated reviews even when the show row is missing", () => {
    const stats = buildWatchStats({
      now: NOW,
      reviews: [{ id: "r1", showId: "missing", rating: 5, createdAt: 1 }],
      shows: [],
    });

    expect(stats.reviewStats.topRated[0]?.review._id).toBe("r1");
    expect(stats.reviewStats.topRated[0]?.show).toBeNull();
  });

  it("accepts date objects, ISO strings, and numeric strings at the input edge", () => {
    const stats = buildWatchStats({
      now: new Date(NOW),
      episodes: [
        {
          id: "date-object",
          showId: "a",
          seasonNumber: "1",
          episodeNumber: "1",
          watchedAt: new Date("2026-06-01T08:00:00.000Z"),
        },
        {
          id: "iso-string",
          showId: "a",
          seasonNumber: 1,
          episodeNumber: 2,
          watchedAt: "2026-06-02T08:00:00.000Z",
        },
      ],
      shows: [show("a")],
    });

    expect(stats.totalEpisodes).toBe(2);
    expect(stats.recentEpisodes.map((item) => item._id)).toEqual(["iso-string", "date-object"]);
  });

  it("does not cross-contaminate runtimes with the same external id from another source", () => {
    const stats = buildWatchStats({
      now: NOW,
      episodes: [episode("a", 1, 1, "2026-06-01T08:00:00.000Z")],
      shows: [{ ...show("a", "Alpha", "shared-id"), externalSource: "tmdb" }],
      runtimePayloads: [
        { externalSource: "imdb", externalId: "shared-id", payload: { episodeRunTime: 99 } },
        { externalSource: "tmdb", externalId: "shared-id", payload: { episodeRunTime: 31 } },
      ],
    });

    expect(stats.totalMinutes).toBe(31);
  });

  it("keeps every public numeric stat finite and non-negative under adversarial input", () => {
    const stats = buildWatchStats({
      now: NOW,
      episodes: Array.from({ length: 120 }, (_, index) => ({
        id: `row-${index}`,
        showId: index % 11 === 0 ? "" : `show-${index % 9}`,
        seasonNumber: index % 13 === 0 ? -1 : index % 4,
        episodeNumber: index % 17 === 0 ? 0 : index + 1,
        watchedAt:
          index % 19 === 0
            ? Number.NaN
            : index % 23 === 0
              ? NOW + 10_000_000
              : NOW - index * 3_600_000,
      })),
      watchStates: Array.from({ length: 40 }, (_, index) => ({
        showId: `show-${index % 6}`,
        status: ["watchlist", "watching", "completed", "dropped", "nonsense"][index % 5],
        updatedAt: index,
      })),
      reviews: Array.from({ length: 40 }, (_, index) => ({
        id: `review-${index}`,
        showId: `show-${index % 9}`,
        rating: index % 7 === 0 ? 99 : (index % 11) / 2,
        createdAt: NOW - index,
      })),
      shows: Array.from({ length: 9 }, (_, index) => show(`show-${index}`)),
      runtimePayloads: Array.from({ length: 9 }, (_, index) =>
        runtime(`show-${index}`, { episode_run_time: [0, 42 + index, 9999] }),
      ),
    });

    const numericValues = [
      stats.totalEpisodes,
      stats.totalMinutes,
      stats.showsWithProgress,
      stats.averageEpisodeMinutes,
      stats.episodesLast30Days,
      stats.activeDays,
      stats.currentStreak,
      stats.longestStreak,
      stats.statusCounts.total,
      stats.reviewStats.totalReviews,
      stats.reviewStats.ratedShows,
      stats.reviewStats.fiveStarCount,
      ...(stats.reviewStats.averageRating === null ? [] : [stats.reviewStats.averageRating]),
      ...stats.monthlyActivity.map((item) => item.count),
      ...stats.weekdayActivity.map((item) => item.count),
      ...stats.timeOfDayActivity.map((item) => item.count),
      ...stats.topShows.flatMap((item) => [item.episodes, item.minutes, item.latestWatchedAt]),
      ...stats.recentEpisodes.flatMap((item) => [item.seasonNumber, item.episodeNumber, item.watchedAt, item.runtimeMinutes]),
    ];

    expect(numericValues.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
  });

  it("does not mutate caller-owned arrays or objects", () => {
    const episodes = [episode("a", 1, 1, "2026-06-01T08:00:00.000Z")];
    const shows = [show("a")];
    const snapshot = JSON.stringify({ episodes, shows });

    buildWatchStats({ now: NOW, episodes, shows });

    expect(JSON.stringify({ episodes, shows })).toBe(snapshot);
  });
});

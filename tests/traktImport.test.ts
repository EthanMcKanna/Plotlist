import { describe, expect, it } from "@jest/globals";

import {
  buildShowRef,
  computeImportProgressPercent,
  computeRewatchFlags,
  mergeHistoryIntoWatched,
  normalizeEpisodeRatings,
  normalizeHistoryItems,
  normalizeShowRatings,
  normalizeWatchedShows,
  normalizeWatchlistItems,
  parseTraktTimestamp,
  traktLogId,
  traktRatingToStars,
  traktReviewId,
  type TraktShowRef,
  type TraktSnapshotHistoryEvent,
} from "../lib/traktImport";

const NOW = Date.parse("2026-07-19T12:00:00.000Z");

const breakingBadShow = {
  title: "Breaking Bad",
  year: 2008,
  ids: { trakt: 1388, slug: "breaking-bad", tvdb: 81189, imdb: "tt0903747", tmdb: 1396 },
};

describe("parseTraktTimestamp", () => {
  it("parses ISO timestamps to ms", () => {
    expect(parseTraktTimestamp("2014-09-01T09:10:11.000Z", NOW)).toBe(
      Date.parse("2014-09-01T09:10:11.000Z"),
    );
  });

  it("clamps future timestamps to now", () => {
    expect(parseTraktTimestamp("2030-01-01T00:00:00.000Z", NOW)).toBe(NOW);
  });

  it("rejects garbage", () => {
    expect(parseTraktTimestamp("not-a-date", NOW)).toBeNull();
    expect(parseTraktTimestamp(undefined, NOW)).toBeNull();
    expect(parseTraktTimestamp("", NOW)).toBeNull();
  });
});

describe("traktRatingToStars", () => {
  it("maps the 1-10 scale onto half-star increments", () => {
    expect(traktRatingToStars(10)).toBe(5);
    expect(traktRatingToStars(7)).toBe(3.5);
    expect(traktRatingToStars(1)).toBe(0.5);
  });

  it("rejects out-of-range and non-numeric ratings", () => {
    expect(traktRatingToStars(0)).toBeNull();
    expect(traktRatingToStars(11)).toBeNull();
    expect(traktRatingToStars("8")).toBeNull();
    expect(traktRatingToStars(Number.NaN)).toBeNull();
  });
});

describe("buildShowRef", () => {
  it("prefers the trakt id for the key and keeps all external ids", () => {
    const ref = buildShowRef(breakingBadShow);
    expect(ref).toEqual({
      key: "trakt:1388",
      title: "Breaking Bad",
      year: 2008,
      tmdbId: 1396,
      imdbId: "tt0903747",
      tvdbId: 81189,
    });
  });

  it("falls back through tmdb, imdb, tvdb, then title", () => {
    expect(buildShowRef({ title: "X", ids: { tmdb: 5 } })?.key).toBe("tmdb:5");
    expect(buildShowRef({ title: "X", ids: { imdb: "tt1" } })?.key).toBe("imdb:tt1");
    expect(buildShowRef({ title: "X", ids: { tvdb: 9 } })?.key).toBe("tvdb:9");
    expect(buildShowRef({ title: "X", year: 1999, ids: {} })?.key).toBe("title:x|1999");
  });

  it("returns null when there is nothing to key on", () => {
    expect(buildShowRef({ ids: {} })).toBeNull();
    expect(buildShowRef(undefined)).toBeNull();
  });

  it("ignores malformed imdb ids", () => {
    expect(buildShowRef({ title: "X", ids: { imdb: "nope", tmdb: 3 } })?.imdbId).toBeNull();
  });
});

describe("normalizeWatchedShows", () => {
  it("flattens seasons into episode rows and registers the show ref", () => {
    const refs: Record<string, TraktShowRef> = {};
    const result = normalizeWatchedShows(
      [
        {
          last_watched_at: "2020-01-05T00:00:00.000Z",
          show: breakingBadShow,
          seasons: [
            {
              number: 1,
              episodes: [
                { number: 1, plays: 2, last_watched_at: "2020-01-01T00:00:00.000Z" },
                { number: 2, plays: 1, last_watched_at: null },
              ],
            },
            { number: 0, episodes: [{ number: 1, plays: 1, last_watched_at: null }] },
          ],
        },
      ],
      refs,
      NOW,
    );

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("trakt:1388");
    expect(result[0].episodes).toHaveLength(3);
    expect(result[0].episodes[0]).toEqual({
      seasonNumber: 1,
      episodeNumber: 1,
      plays: 2,
      lastWatchedAt: Date.parse("2020-01-01T00:00:00.000Z"),
    });
    // Missing per-episode date falls back to the show-level date.
    expect(result[0].episodes[1].lastWatchedAt).toBe(Date.parse("2020-01-05T00:00:00.000Z"));
    // Specials (season 0) are kept.
    expect(result[0].episodes[2].seasonNumber).toBe(0);
    expect(refs["trakt:1388"]).toBeTruthy();
  });

  it("drops seasons-less aggregate entries (the modern API shape)", () => {
    // Since ~2025 /sync/watched/shows returns only aggregate plays — no
    // seasons array. These entries carry no episode data; progress instead
    // derives from history via mergeHistoryIntoWatched.
    const refs: Record<string, TraktShowRef> = {};
    const result = normalizeWatchedShows(
      [
        {
          plays: 2,
          last_watched_at: "2026-07-20T04:26:00.000Z",
          last_updated_at: "2026-07-20T04:26:00.000Z",
          reset_at: null,
          show: { ...breakingBadShow, aired_episodes: 46 },
        },
      ],
      refs,
      NOW,
    );
    expect(result).toHaveLength(0);
    // The show ref still registers so matching covers it.
    expect(refs["trakt:1388"]).toBeTruthy();
  });

  it("drops shows without keys or episodes and tolerates junk", () => {
    const refs: Record<string, TraktShowRef> = {};
    const result = normalizeWatchedShows(
      [
        { show: { ids: {} }, seasons: [{ number: 1, episodes: [{ number: 1 }] }] },
        { show: breakingBadShow, seasons: [] },
        null,
        "junk",
      ],
      refs,
      NOW,
    );
    expect(result).toHaveLength(0);
  });
});

describe("normalizeHistoryItems", () => {
  it("keeps well-formed episode events and skips the rest", () => {
    const refs: Record<string, TraktShowRef> = {};
    const events = normalizeHistoryItems(
      [
        {
          id: 100,
          watched_at: "2019-05-01T20:00:00.000Z",
          action: "watch",
          type: "episode",
          episode: { season: 2, number: 3, title: "Bit by a Dead Bee", ids: {} },
          show: breakingBadShow,
        },
        { id: 101, type: "movie", watched_at: "2019-05-01T20:00:00.000Z" },
        { id: 102, type: "episode", episode: { season: 1 }, show: breakingBadShow },
        { type: "episode", episode: { season: 1, number: 1 }, show: breakingBadShow },
      ],
      refs,
      NOW,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      id: 100,
      key: "trakt:1388",
      seasonNumber: 2,
      episodeNumber: 3,
      episodeTitle: "Bit by a Dead Bee",
      watchedAt: Date.parse("2019-05-01T20:00:00.000Z"),
    });
  });
});

describe("ratings + watchlist normalization", () => {
  it("converts show ratings and drops invalid ones", () => {
    const refs: Record<string, TraktShowRef> = {};
    const ratings = normalizeShowRatings(
      [
        { rated_at: "2021-01-01T00:00:00.000Z", rating: 9, type: "show", show: breakingBadShow },
        { rating: 0, type: "show", show: breakingBadShow },
        { rating: 8, type: "season", show: breakingBadShow },
      ],
      refs,
      NOW,
    );
    expect(ratings).toEqual([
      { key: "trakt:1388", rating: 4.5, ratedAt: Date.parse("2021-01-01T00:00:00.000Z") },
    ]);
  });

  it("keeps episode scope on episode ratings", () => {
    const refs: Record<string, TraktShowRef> = {};
    const ratings = normalizeEpisodeRatings(
      [
        {
          rated_at: "2021-02-01T00:00:00.000Z",
          rating: 10,
          type: "episode",
          episode: { season: 5, number: 14, ids: {} },
          show: breakingBadShow,
        },
      ],
      refs,
      NOW,
    );
    expect(ratings).toEqual([
      {
        key: "trakt:1388",
        seasonNumber: 5,
        episodeNumber: 14,
        rating: 5,
        ratedAt: Date.parse("2021-02-01T00:00:00.000Z"),
      },
    ]);
  });

  it("keeps only show-type watchlist items", () => {
    const refs: Record<string, TraktShowRef> = {};
    const items = normalizeWatchlistItems(
      [
        { listed_at: "2022-03-04T00:00:00.000Z", type: "show", show: breakingBadShow },
        { listed_at: "2022-03-04T00:00:00.000Z", type: "episode", show: breakingBadShow },
      ],
      refs,
      NOW,
    );
    expect(items).toEqual([
      { key: "trakt:1388", listedAt: Date.parse("2022-03-04T00:00:00.000Z") },
    ]);
  });
});

describe("mergeHistoryIntoWatched", () => {
  const historyEvent = (
    id: number,
    watchedAt: number,
    episode: { s: number; e: number },
    key = "trakt:1388",
  ): TraktSnapshotHistoryEvent => ({
    id,
    key,
    seasonNumber: episode.s,
    episodeNumber: episode.e,
    episodeTitle: null,
    watchedAt,
  });

  it("builds watched shows entirely from history when watched/shows is bare", () => {
    const merged = mergeHistoryIntoWatched(
      [],
      [
        historyEvent(2, 2_000, { s: 1, e: 1 }),
        historyEvent(1, 1_000, { s: 1, e: 1 }),
        historyEvent(3, 3_000, { s: 1, e: 2 }),
        historyEvent(4, 4_000, { s: 2, e: 1 }, "trakt:999"),
      ],
    );
    expect(merged).toHaveLength(2);
    const first = merged.find((show) => show.key === "trakt:1388")!;
    // Earliest play wins as the watched date; both plays are counted.
    expect(first.episodes).toEqual([
      { seasonNumber: 1, episodeNumber: 1, plays: 2, lastWatchedAt: 1_000 },
      { seasonNumber: 1, episodeNumber: 2, plays: 1, lastWatchedAt: 3_000 },
    ]);
    expect(merged.find((show) => show.key === "trakt:999")!.episodes).toHaveLength(1);
  });

  it("keeps seasons-style episodes untouched and only appends missing ones", () => {
    const merged = mergeHistoryIntoWatched(
      [
        {
          key: "trakt:1388",
          lastWatchedAt: 9_000,
          episodes: [{ seasonNumber: 1, episodeNumber: 1, plays: 5, lastWatchedAt: 9_000 }],
        },
      ],
      [
        historyEvent(1, 1_000, { s: 1, e: 1 }),
        historyEvent(2, 2_000, { s: 1, e: 2 }),
      ],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].episodes).toEqual([
      { seasonNumber: 1, episodeNumber: 1, plays: 5, lastWatchedAt: 9_000 },
      { seasonNumber: 1, episodeNumber: 2, plays: 1, lastWatchedAt: 2_000 },
    ]);
  });

  it("preserves original show order and appends new shows after", () => {
    const merged = mergeHistoryIntoWatched(
      [
        {
          key: "trakt:2",
          lastWatchedAt: null,
          episodes: [{ seasonNumber: 1, episodeNumber: 1, plays: 1, lastWatchedAt: 1 }],
        },
        {
          key: "trakt:1",
          lastWatchedAt: null,
          episodes: [{ seasonNumber: 1, episodeNumber: 1, plays: 1, lastWatchedAt: 1 }],
        },
      ],
      [historyEvent(1, 1_000, { s: 1, e: 1 }, "trakt:3")],
    );
    expect(merged.map((show) => show.key)).toEqual(["trakt:2", "trakt:1", "trakt:3"]);
  });
});

describe("computeRewatchFlags", () => {
  const event = (
    id: number,
    watchedAt: number,
    episode: { s: number; e: number } = { s: 1, e: 1 },
  ): TraktSnapshotHistoryEvent => ({
    id,
    key: "trakt:1388",
    seasonNumber: episode.s,
    episodeNumber: episode.e,
    episodeTitle: null,
    watchedAt,
  });

  it("marks every play after the first chronological one as a rewatch", () => {
    const flags = computeRewatchFlags([
      event(3, 3_000),
      event(1, 1_000),
      event(2, 2_000),
      event(4, 1_500, { s: 1, e: 2 }),
    ]);
    expect(flags.get(1)).toBe(false);
    expect(flags.get(2)).toBe(true);
    expect(flags.get(3)).toBe(true);
    expect(flags.get(4)).toBe(false);
  });

  it("is stable when timestamps tie (event id breaks the tie)", () => {
    const forward = computeRewatchFlags([event(1, 1_000), event(2, 1_000)]);
    const reversed = computeRewatchFlags([event(2, 1_000), event(1, 1_000)]);
    expect(forward.get(1)).toBe(false);
    expect(forward.get(2)).toBe(true);
    expect(reversed.get(1)).toBe(false);
    expect(reversed.get(2)).toBe(true);
  });
});

describe("deterministic ids", () => {
  it("derives stable diary ids from history event ids", () => {
    expect(traktLogId(12345)).toBe("log_trakt_12345");
  });

  it("derives distinct review ids per scope", () => {
    expect(traktReviewId({ traktKey: "trakt:1388" })).toBe("review_trakt_trakt-1388_show");
    expect(
      traktReviewId({ traktKey: "trakt:1388", seasonNumber: 5, episodeNumber: 14 }),
    ).toBe("review_trakt_trakt-1388_e5x14");
  });
});

describe("computeImportProgressPercent", () => {
  const options = { history: true, ratings: true, watchlist: true };

  it("is indeterminate while fetching", () => {
    expect(
      computeImportProgressPercent({ phase: "fetch", options, counts: {}, cursor: {} }),
    ).toBeNull();
  });

  it("weights phases by item counts", () => {
    const counts = {
      showsTotal: 10,
      watchedShowsTotal: 10,
      historyTotal: 60,
      showRatingsTotal: 10,
      episodeRatingsTotal: 0,
      watchlistTotal: 10,
    };
    // 100 items total; 10 matched + 10 progress + 30 diary = 50 done.
    expect(
      computeImportProgressPercent({
        phase: "diary",
        options,
        counts,
        cursor: { matchIndex: 10, progressIndex: 10, diaryIndex: 30 },
      }),
    ).toBe(50);
  });

  it("skips disabled sections in the weighting", () => {
    const counts = { showsTotal: 10, watchlistTotal: 10 };
    expect(
      computeImportProgressPercent({
        phase: "watchlist",
        options: { history: false, ratings: false, watchlist: true },
        counts,
        cursor: { matchIndex: 10, watchlistIndex: 5 },
      }),
    ).toBe(75);
  });

  it("caps cursor overshoot at 100", () => {
    expect(
      computeImportProgressPercent({
        phase: "watchlist",
        options: { history: false, ratings: false, watchlist: true },
        counts: { showsTotal: 1, watchlistTotal: 1 },
        cursor: { matchIndex: 5, watchlistIndex: 5 },
      }),
    ).toBe(100);
  });

  it("reports 100 at finalize even with an empty account", () => {
    expect(
      computeImportProgressPercent({ phase: "finalize", options, counts: {}, cursor: {} }),
    ).toBe(100);
  });
});

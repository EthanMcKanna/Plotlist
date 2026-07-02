import { describe, expect, it } from "@jest/globals";

import {
  RELEASE_CALENDAR_MAX_ITEMS,
  addDaysToDateOnlyString,
  buildReleaseCalendarData,
  buildTmdbReleaseEventsForShow,
  extractTmdbReleaseProviders,
  getDateOnlyTimestamp,
  getReleaseCalendarShowIds,
  getTmdbReleaseCandidateSeasonNumbers,
  isDateOnlyString,
  isReleaseSyncStateStale,
  matchesReleaseView,
  matchesSelectedProviders,
  normalizeReleaseCalendarView,
  normalizeSelectedProviders,
  type ReleaseCalendarShowSource,
  type ReleaseCalendarView,
  type ReleaseEventRecord,
} from "../lib/releaseCalendar";

function isoDay(dayOffset: number) {
  return new Date(Date.UTC(2026, 0, 1 + dayOffset)).toISOString().slice(0, 10);
}

function event(overrides: Partial<ReleaseEventRecord> = {}): ReleaseEventRecord {
  const airDate = overrides.airDate ?? "2026-01-10";

  return {
    showId: "show-1",
    airDate,
    airDateTs: getDateOnlyTimestamp(airDate),
    seasonNumber: 1,
    episodeNumber: 1,
    episodeTitle: "Pilot",
    isPremiere: false,
    isReturningSeason: false,
    isSeasonFinale: false,
    isSeriesFinale: false,
    ...overrides,
  };
}

function show(overrides: Partial<ReleaseCalendarShowSource> = {}): ReleaseCalendarShowSource {
  return {
    _id: "show-1",
    title: "Alpha",
    posterUrl: null,
    backdropUrl: null,
    providers: [{ name: "Netflix" }],
    isStale: false,
    events: [event()],
    ...overrides,
  };
}

describe("release calendar robustness matrix", () => {
  const validDates = [
    "2026-01-01",
    "2026-02-28",
    "2026-03-01",
    "2026-04-30",
    "2026-05-31",
    "2026-06-01",
    "2026-07-04",
    "2026-08-15",
    "2026-09-30",
    "2026-10-31",
    "2026-11-30",
    "2026-12-31",
    "2028-02-29",
  ];

  it.each(validDates)("accepts strict date-only value %s", (value) => {
    expect(isDateOnlyString(value)).toBe(true);
    expect(Number.isFinite(getDateOnlyTimestamp(value))).toBe(true);
  });

  const invalidDates = [
    "",
    "2026",
    "2026-1-01",
    "2026-01-1",
    "2026-00-01",
    "2026-13-01",
    "2026-01-00",
    "2026-01-32",
    "2026-02-29",
    "2026-04-31",
    "2026-06-31",
    "2026-11-31",
    "not-a-date",
    "2026-01-01T00:00:00.000Z",
    "2026/01/01",
    " 2026-01-01 ",
  ];

  it.each(invalidDates)("rejects malformed or impossible date-only value %s", (value) => {
    expect(isDateOnlyString(value)).toBe(false);
    expect(Number.isNaN(getDateOnlyTimestamp(value))).toBe(true);
  });

  const dateMathCases: Array<[string, number, string | null]> = [
    ["2026-01-01", 1, "2026-01-02"],
    ["2026-01-31", 1, "2026-02-01"],
    ["2026-02-28", 1, "2026-03-01"],
    ["2028-02-28", 1, "2028-02-29"],
    ["2028-02-29", 1, "2028-03-01"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2026-06-01", 120, "2026-09-29"],
    ["2026-02-29", 1, null],
  ];

  it.each(dateMathCases)("adds days to date-only value %#", (value, days, expected) => {
    expect(addDaysToDateOnlyString(value, days)).toBe(expected);
  });

  const providerInputs: Array<[string, string[]]> = [
    ["Netflix", ["Netflix"]],
    [" netflix ", ["Netflix"]],
    ["NETFLIX", ["Netflix"]],
    ["apple_tv", ["Apple TV"]],
    ["Apple TV+", ["Apple TV"]],
    ["Apple TV Plus", ["Apple TV"]],
    ["disney_plus", ["Disney+"]],
    ["Disney Plus", ["Disney+"]],
    ["prime_video", ["Prime Video"]],
    ["Amazon Prime Video", ["Prime Video"]],
    ["HBO Max", ["Max"]],
    ["max", ["Max"]],
    ["unknown", []],
    ["", []],
  ];

  it.each(providerInputs)("normalizes provider token %s", (input, expected) => {
    expect(normalizeSelectedProviders([input])).toEqual(expected);
  });

  it("dedupes selected providers while preserving canonical order of first mention", () => {
    expect(
      normalizeSelectedProviders([
        "netflix",
        "Netflix",
        "Apple TV+",
        "apple_tv",
        "Disney Plus",
      ]),
    ).toEqual(["Netflix", "Apple TV", "Disney+"]);
  });

  it("extracts canonical US streaming providers from raw TMDB watch-provider payloads", () => {
    expect(
      extractTmdbReleaseProviders({
        "watch/providers": {
          results: {
            US: {
              flatrate: [
                {
                  provider_name: "Apple TV Plus",
                  logo_path: "/apple.png",
                },
                {
                  provider_name: "HBO Max",
                  logo_path: "/max.png",
                },
              ],
              ads: [
                {
                  provider_name: "Peacock",
                  logo_path: "/peacock.png",
                },
              ],
              free: [
                {
                  provider_name: "Unknown Service",
                  logo_path: "/unknown.png",
                },
              ],
            },
          },
        },
      }),
    ).toEqual([
      {
        name: "Apple TV",
        logoUrl: "https://image.tmdb.org/t/p/w92/apple.png",
      },
      {
        name: "Max",
        logoUrl: "https://image.tmdb.org/t/p/w92/max.png",
      },
      {
        name: "Peacock",
        logoUrl: "https://image.tmdb.org/t/p/w92/peacock.png",
      },
    ]);
  });

  it("supports normalized provider payloads and ignores non-US availability by default", () => {
    expect(
      extractTmdbReleaseProviders({
        watchProviders: {
          results: {
            CA: {
              flatrate: [{ providerName: "Netflix", logoUrl: "https://cdn.test/netflix.png" }],
            },
            US: {
              flatrate: [{ providerName: "Disney+", logoUrl: "https://cdn.test/disney.png" }],
            },
          },
        },
      }),
    ).toEqual([{ name: "Disney+", logoUrl: "https://cdn.test/disney.png" }]);
  });

  const providerMatchCases: Array<[string[], string[], boolean]> = [
    [["Netflix"], ["Netflix"], true],
    [["Netflix"], ["netflix"], true],
    [["Apple TV"], ["Apple TV+"], true],
    [["Max"], ["HBO Max"], true],
    [["Prime Video"], ["Amazon Prime"], true],
    [["Hulu"], ["Netflix"], false],
    [[], ["Netflix"], false],
    [["Peacock"], [], true],
  ];

  it.each(providerMatchCases)(
    "matches providers %j against filter %j",
    (providers, selectedProviders, expected) => {
      expect(
        matchesSelectedProviders(
          providers.map((name) => ({ name })),
          normalizeSelectedProviders([...selectedProviders]),
        ),
      ).toBe(expected);
    },
  );

  const normalizedViewCases: Array<[string | null, ReleaseCalendarView]> = [
    [null, "upcoming"],
    ["", "upcoming"],
    ["tonight", "tonight"],
    ["upcoming", "upcoming"],
    ["premieres", "premieres"],
    ["returning", "returning"],
    ["finales", "finales"],
    ["bad-view", "upcoming"],
  ];

  it.each(normalizedViewCases)("normalizes release view %s", (input, expected) => {
    expect(normalizeReleaseCalendarView(input)).toBe(expected);
  });

  const viewCases: Array<[ReleaseCalendarView, ReleaseEventRecord, string, boolean]> = [
    ["tonight", event({ airDate: "2026-01-10" }), "2026-01-10", true],
    ["tonight", event({ airDate: "2026-01-11" }), "2026-01-10", false],
    ["upcoming", event({ airDate: "2026-01-11" }), "2026-01-10", true],
    ["upcoming", event({ airDate: "2026-01-09" }), "2026-01-10", false],
    ["premieres", event({ isPremiere: true }), "2026-01-10", true],
    ["premieres", event({ isPremiere: false }), "2026-01-10", false],
    ["returning", event({ isReturningSeason: true }), "2026-01-10", true],
    ["returning", event({ isReturningSeason: false }), "2026-01-10", false],
    ["finales", event({ isSeasonFinale: true }), "2026-01-10", true],
    ["finales", event({ isSeriesFinale: true, isSeasonFinale: true }), "2026-01-10", true],
    ["finales", event({ isSeasonFinale: false }), "2026-01-10", false],
  ];

  it.each(viewCases)("matches %s view release rules", (view, release, today, expected) => {
    expect(matchesReleaseView(release, view, today)).toBe(expected);
  });

  it.each(Array.from({ length: 140 }, (_, index) => index))(
    "keeps upcoming release day offset %i grouped by its air-date string",
    (dayOffset) => {
      const airDate = isoDay(dayOffset);
      const result = buildReleaseCalendarData({
        shows: [show({ events: [event({ airDate, episodeNumber: dayOffset + 1 })] })],
        today: "2026-01-01",
        view: "upcoming",
      });

      expect(result.totalItems).toBe(1);
      expect(result.groups[0].airDate).toBe(airDate);
      expect(result.groups[0].items[0].episodeNumber).toBe(dayOffset + 1);
    },
  );

  it("sorts multi-show, multi-episode drops predictably inside a release day", () => {
    const result = buildReleaseCalendarData({
      shows: [
        show({
          _id: "show-b",
          title: "Beta",
          events: [
            event({ showId: "show-b", airDate: "2026-01-10", seasonNumber: 2, episodeNumber: 2 }),
            event({ showId: "show-b", airDate: "2026-01-10", seasonNumber: 2, episodeNumber: 1 }),
          ],
        }),
        show({
          _id: "show-a",
          title: "Alpha",
          events: [
            event({ showId: "show-a", airDate: "2026-01-10", seasonNumber: 1, episodeNumber: 4 }),
          ],
        }),
      ],
      today: "2026-01-01",
      view: "upcoming",
    });

    expect(result.groups[0].items.map((item) => `${item.show.title}:${item.episodeNumber}`)).toEqual([
      "Alpha:4",
      "Beta:1",
      "Beta:2",
    ]);
  });

  it("dedupes repeated release rows for the same show episode", () => {
    const result = buildReleaseCalendarData({
      shows: [
        show({
          events: [
            event({ airDate: "2026-01-10", episodeNumber: 1 }),
            event({ airDate: "2026-01-10", episodeNumber: 1, episodeTitle: "Duplicate" }),
          ],
        }),
      ],
      today: "2026-01-01",
      view: "upcoming",
    });

    expect(result.totalItems).toBe(1);
    expect(result.groups[0].items[0].episodeTitle).toBe("Pilot");
  });

  it("drops invalid release rows instead of leaking impossible dates into the UI", () => {
    const result = buildReleaseCalendarData({
      shows: [
        show({
          events: [
            event({ airDate: "2026-02-29", airDateTs: Date.parse("2026-02-29T00:00:00.000Z") }),
            event({ airDate: "2026-03-01" }),
          ],
        }),
      ],
      today: "2026-01-01",
      view: "upcoming",
    });

    expect(result.totalItems).toBe(1);
    expect(result.groups[0].airDate).toBe("2026-03-01");
  });

  it.each([1, 2, 3, 4, 5, 10, 25, 50, 100, 150, 250, 500])(
    "clamps and paginates release result limit %i",
    (limit) => {
      const events = Array.from({ length: 300 }, (_, index) =>
        event({ airDate: isoDay(index), episodeNumber: index + 1 }),
      );
      const result = buildReleaseCalendarData({
        shows: [show({ events })],
        today: "2026-01-01",
        view: "upcoming",
        limit,
      });

      expect(result.groups.length).toBe(Math.min(limit, RELEASE_CALENDAR_MAX_ITEMS));
      expect(result.totalItems).toBe(300);
      expect(Number(result.continueCursor)).toBe(Math.min(limit, RELEASE_CALENDAR_MAX_ITEMS));
    },
  );

  const showIdMergeCases: Array<[string[], string[], string[]]> = [
    [["show-a", "show-b"], ["show-c"], ["show-a", "show-b", "show-c"]],
    [["show-a"], ["show-a", "show-b"], ["show-a", "show-b"]],
    [[], ["show-a"], ["show-a"]],
    [["show-a"], [], ["show-a"]],
  ];

  it.each(showIdMergeCases)("merges active and favorite show ids", (tracked, favorites, expected) => {
    expect(
      getReleaseCalendarShowIds({
        states: tracked.map((showId) => ({ showId, status: "watching" })),
        favoriteShowIds: [...favorites],
      }),
    ).toEqual(expected);
  });

  it("trims favorite show ids before calendar scope dedupe", () => {
    expect(
      getReleaseCalendarShowIds({
        states: [{ showId: "show-a", status: "watching" }],
        favoriteShowIds: [" show-b ", "", "   ", "show-a"],
      }),
    ).toEqual(["show-a", "show-b"]);
  });

  const syncStateCases: Array<[
    { status: string; expiresAtOffset?: number } | null,
    boolean,
  ]> = [
    [null, true],
    [{ status: "ready", expiresAtOffset: 1000 }, false],
    [{ status: "ready", expiresAtOffset: -1 }, true],
    [{ status: "failed", expiresAtOffset: 1000 }, false],
    [{ status: "failed", expiresAtOffset: -1 }, true],
    [{ status: "running", expiresAtOffset: 1000 }, false],
    [{ status: "running", expiresAtOffset: -1 }, true],
    [{ status: "scheduled", expiresAtOffset: 1000 }, false],
    [{ status: "scheduled", expiresAtOffset: -1 }, true],
    [{ status: "idle" }, true],
    [{ status: "idle", expiresAtOffset: 1000 }, true],
    [{ status: "unknown", expiresAtOffset: 1000 }, true],
  ];

  it.each(syncStateCases)("classifies stale sync state %j", (syncState, expected) => {
    const now = 1_000_000;
    const state = syncState
      ? {
          status: syncState.status,
          expiresAt:
            typeof syncState.expiresAtOffset === "number"
              ? now + syncState.expiresAtOffset
              : undefined,
        }
      : null;

    expect(isReleaseSyncStateStale(state, now)).toBe(expected);
  });

  it("selects next, last, and horizon seasons without season-zero specials", () => {
    expect(
      getTmdbReleaseCandidateSeasonNumbers({
        today: "2026-01-01",
        horizon: "2026-05-01",
        details: {
          next_episode_to_air: { season_number: 5 },
          last_episode_to_air: { season_number: 4 },
          seasons: [
            { season_number: 0, air_date: "2026-02-01" },
            { season_number: 3, air_date: "2025-01-01" },
            { season_number: 4, air_date: "2025-09-01" },
            { season_number: 5, air_date: "2026-02-01" },
            { season_number: 6, air_date: "2026-04-01" },
          ],
        },
      }),
    ).toEqual([5, 4, 6]);
  });

  it.each(Array.from({ length: 50 }, (_, index) => index + 1))(
    "builds TMDB release event for episode %i without marking partial seasons as finales",
    (episodeNumber) => {
      const release = buildTmdbReleaseEventsForShow({
        showId: "show-1",
        today: "2026-01-01",
        horizon: "2026-12-31",
        details: {
          status: "Returning Series",
          seasons: [{ season_number: 1, episode_count: 100, air_date: "2026-01-01" }],
        },
        seasonPayloads: [
          {
            season_number: 1,
            episodes: [
              {
                air_date: isoDay(episodeNumber - 1),
                season_number: 1,
                episode_number: episodeNumber,
                name: `Episode ${episodeNumber}`,
              },
            ],
          },
        ],
      })[0];

      expect(release).toMatchObject({
        showId: "show-1",
        seasonNumber: 1,
        episodeNumber,
        episodeTitle: `Episode ${episodeNumber}`,
        isSeasonFinale: false,
      });
    },
  );

  it("builds TMDB finale and premiere flags from real season metadata", () => {
    const releases = buildTmdbReleaseEventsForShow({
      showId: "show-1",
      today: "2026-01-01",
      horizon: "2026-01-31",
      details: {
        status: "Ended",
        seasons: [
          { season_number: 1, episode_count: 2, air_date: "2026-01-01" },
          { season_number: 2, episode_count: 2, air_date: "2026-01-15" },
        ],
      },
      seasonPayloads: [
        {
          season_number: 1,
          episodes: [
            { air_date: "2026-01-01", season_number: 1, episode_number: 1, name: "Pilot" },
            { air_date: "2026-01-08", season_number: 1, episode_number: 2, name: "First Finale" },
          ],
        },
        {
          season_number: 2,
          episodes: [
            { air_date: "2026-01-15", season_number: 2, episode_number: 1, name: "Return" },
            { air_date: "2026-01-22", season_number: 2, episode_number: 2, name: "The End" },
          ],
        },
      ],
    });

    expect(releases.map((release) => release.episodeTitle)).toEqual([
      "Pilot",
      "First Finale",
      "Return",
      "The End",
    ]);
    expect(releases[0]).toMatchObject({ isPremiere: true });
    expect(releases[2]).toMatchObject({ isReturningSeason: true });
    expect(releases[3]).toMatchObject({ isSeasonFinale: true, isSeriesFinale: true });
  });

  it("does not guess finales when TMDB omits the season episode count", () => {
    const releases = buildTmdbReleaseEventsForShow({
      showId: "show-1",
      today: "2026-01-01",
      horizon: "2026-01-31",
      details: {
        status: "Returning Series",
        seasons: [{ season_number: 2, episode_count: 0, air_date: "2026-01-01" }],
      },
      seasonPayloads: [
        {
          season_number: 2,
          episodes: [
            { air_date: "2026-01-10", season_number: 2, episode_number: 8, name: "Maybe Not Last" },
          ],
        },
      ],
    });

    expect(releases[0]).toMatchObject({
      episodeNumber: 8,
      isSeasonFinale: false,
      isSeriesFinale: false,
    });
  });
});

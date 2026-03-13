import { describe, expect, it } from "@jest/globals";

import {
  buildReleaseCalendarData,
  getReleaseEventFlags,
  getTrackedShowIdsFromStates,
  isReleaseSyncStateStale,
} from "../lib/releaseCalendar";

describe("release calendar helpers", () => {
  it("classifies premieres, returning seasons, season finales, and series finales", () => {
    expect(
      getReleaseEventFlags({
        seasonNumber: 1,
        episodeNumber: 1,
        lastEpisodeNumber: 10,
        maxSeasonNumber: 3,
        showStatus: "Returning Series",
      }),
    ).toEqual({
      isPremiere: true,
      isReturningSeason: false,
      isSeasonFinale: false,
      isSeriesFinale: false,
    });

    expect(
      getReleaseEventFlags({
        seasonNumber: 3,
        episodeNumber: 1,
        lastEpisodeNumber: 8,
        maxSeasonNumber: 3,
        showStatus: "Returning Series",
      }),
    ).toEqual({
      isPremiere: false,
      isReturningSeason: true,
      isSeasonFinale: false,
      isSeriesFinale: false,
    });

    expect(
      getReleaseEventFlags({
        seasonNumber: 2,
        episodeNumber: 13,
        lastEpisodeNumber: 13,
        maxSeasonNumber: 4,
        showStatus: "Returning Series",
      }),
    ).toEqual({
      isPremiere: false,
      isReturningSeason: false,
      isSeasonFinale: true,
      isSeriesFinale: false,
    });

    expect(
      getReleaseEventFlags({
        seasonNumber: 4,
        episodeNumber: 10,
        lastEpisodeNumber: 10,
        maxSeasonNumber: 4,
        showStatus: "Ended",
      }),
    ).toEqual({
      isPremiere: false,
      isReturningSeason: false,
      isSeasonFinale: true,
      isSeriesFinale: true,
    });
  });

  it("limits tracked scope to watchlist and watching shows", () => {
    expect(
      getTrackedShowIdsFromStates([
        { showId: "show-1", status: "watchlist" },
        { showId: "show-2", status: "watching" },
        { showId: "show-3", status: "completed" },
        { showId: "show-4", status: "dropped" },
        { showId: "show-1", status: "watchlist" },
      ]),
    ).toEqual(["show-1", "show-2"]);
  });

  it("filters results by selected providers without dropping matching upcoming releases", () => {
    const result = buildReleaseCalendarData({
      shows: [
        {
          _id: "show-1",
          title: "Alpha",
          posterUrl: null,
          providers: [{ name: "Netflix" }],
          isStale: false,
          events: [
            {
              showId: "show-1",
              airDate: "2026-03-20",
              airDateTs: Date.parse("2026-03-20T00:00:00.000Z"),
              seasonNumber: 1,
              episodeNumber: 2,
              episodeTitle: "Next",
              isPremiere: false,
              isReturningSeason: false,
              isSeasonFinale: false,
              isSeriesFinale: false,
            },
          ],
        },
        {
          _id: "show-2",
          title: "Beta",
          posterUrl: null,
          providers: [{ name: "Hulu" }],
          isStale: false,
          events: [
            {
              showId: "show-2",
              airDate: "2026-03-20",
              airDateTs: Date.parse("2026-03-20T00:00:00.000Z"),
              seasonNumber: 2,
              episodeNumber: 1,
              episodeTitle: "Return",
              isPremiere: false,
              isReturningSeason: true,
              isSeasonFinale: false,
              isSeriesFinale: false,
            },
          ],
        },
      ],
      today: "2026-03-13",
      view: "upcoming",
      selectedProviders: ["Netflix"],
    });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].items).toHaveLength(1);
    expect(result.groups[0].items[0].show.title).toBe("Alpha");
  });

  it("uses the provided local date for the tonight view", () => {
    const result = buildReleaseCalendarData({
      shows: [
        {
          _id: "show-1",
          title: "Alpha",
          posterUrl: null,
          providers: [{ name: "Netflix" }],
          isStale: false,
          events: [
            {
              showId: "show-1",
              airDate: "2026-03-13",
              airDateTs: Date.parse("2026-03-13T00:00:00.000Z"),
              seasonNumber: 1,
              episodeNumber: 1,
              episodeTitle: "Pilot",
              isPremiere: true,
              isReturningSeason: false,
              isSeasonFinale: false,
              isSeriesFinale: false,
            },
            {
              showId: "show-1",
              airDate: "2026-03-14",
              airDateTs: Date.parse("2026-03-14T00:00:00.000Z"),
              seasonNumber: 1,
              episodeNumber: 2,
              episodeTitle: "Tomorrow",
              isPremiere: false,
              isReturningSeason: false,
              isSeasonFinale: false,
              isSeriesFinale: false,
            },
          ],
        },
      ],
      today: "2026-03-13",
      view: "tonight",
    });

    expect(result.totalItems).toBe(1);
    expect(result.groups[0].items[0].episodeTitle).toBe("Pilot");
  });

  it("flags stale sync state while still returning cached release rows", () => {
    expect(isReleaseSyncStateStale(null, Date.now())).toBe(true);

    const result = buildReleaseCalendarData({
      shows: [
        {
          _id: "show-1",
          title: "Alpha",
          posterUrl: null,
          providers: [{ name: "Netflix" }],
          isStale: true,
          events: [
            {
              showId: "show-1",
              airDate: "2026-03-15",
              airDateTs: Date.parse("2026-03-15T00:00:00.000Z"),
              seasonNumber: 1,
              episodeNumber: 3,
              episodeTitle: "Cached",
              isPremiere: false,
              isReturningSeason: false,
              isSeasonFinale: false,
              isSeriesFinale: false,
            },
          ],
        },
      ],
      today: "2026-03-13",
      view: "upcoming",
    });

    expect(result.staleShowIds).toEqual(["show-1"]);
    expect(result.groups[0].items[0].episodeTitle).toBe("Cached");
  });
});

import { describe, expect, it } from "@jest/globals";

import { buildMonthlyRecap } from "../lib/watchInsights";

// "Now" is 2026-07-01 10:00 local (offset 0) — recap covers June 2026.
const NOW = Date.UTC(2026, 6, 1, 10);

const SEVERANCE = {
  id: "show_1",
  title: "Severance",
  posterUrl: "https://example.com/severance.jpg",
  genreIds: [18, 9648],
  externalSource: "tmdb",
  externalId: "95396",
};
const DARK = {
  id: "show_2",
  title: "Dark",
  posterUrl: "https://example.com/dark.jpg",
  genreIds: [10765],
  externalSource: "tmdb",
  externalId: "70523",
};

let counter = 0;
function episode(showId: string, watchedAt: number, episodeNumber?: number) {
  counter += 1;
  return {
    id: `ep_${counter}`,
    showId,
    seasonNumber: 1,
    episodeNumber: episodeNumber ?? counter,
    watchedAt,
  };
}

describe("buildMonthlyRecap", () => {
  it("rolls up only the previous local calendar month", () => {
    const recap = buildMonthlyRecap({
      now: NOW,
      utcOffsetMinutes: 0,
      shows: [SEVERANCE, DARK],
      episodes: [
        // June (in range): 3 Severance + 1 Dark.
        episode(SEVERANCE.id, Date.UTC(2026, 5, 3, 20)),
        episode(SEVERANCE.id, Date.UTC(2026, 5, 4, 20)),
        episode(SEVERANCE.id, Date.UTC(2026, 5, 5, 20)),
        episode(DARK.id, Date.UTC(2026, 5, 10, 21)),
        // May and July (out of range).
        episode(DARK.id, Date.UTC(2026, 4, 20, 20)),
        episode(DARK.id, Date.UTC(2026, 6, 1, 1)),
      ],
    });
    expect(recap).not.toBeNull();
    expect(recap!.monthKey).toBe("2026-06");
    expect(recap!.monthLabel).toBe("June");
    expect(recap!.year).toBe(2026);
    expect(recap!.episodes).toBe(4);
    expect(recap!.shows).toBe(2);
    expect(recap!.activeDays).toBe(4);
    expect(recap!.topShow).toMatchObject({ showId: SEVERANCE.id, episodes: 3 });
    // Drama (18) leads on minutes via the 3-episode show.
    expect(recap!.topGenre).toBe("Drama");
    // Default 42-minute runtime × 4 episodes.
    expect(recap!.minutes).toBe(4 * 42);
  });

  it("respects the viewer's utc offset at the month boundary", () => {
    // 2026-07-01 03:00 UTC is still June 30 in UTC-5; an episode watched at
    // 2026-06-01 02:00 UTC is still May 31 locally and must not count.
    const recap = buildMonthlyRecap({
      now: Date.UTC(2026, 6, 1, 3),
      utcOffsetMinutes: -300,
      shows: [SEVERANCE],
      episodes: [
        episode(SEVERANCE.id, Date.UTC(2026, 5, 1, 2)),
        episode(SEVERANCE.id, Date.UTC(2026, 4, 15, 20)),
      ],
    });
    // Local "now" is June 30 → previous month is May; both episodes are May
    // local time.
    expect(recap).not.toBeNull();
    expect(recap!.monthKey).toBe("2026-05");
    expect(recap!.episodes).toBe(2);
  });

  it("returns null when the month had no episodes", () => {
    expect(
      buildMonthlyRecap({
        now: NOW,
        utcOffsetMinutes: 0,
        shows: [SEVERANCE],
        episodes: [episode(SEVERANCE.id, Date.UTC(2026, 2, 3))],
      }),
    ).toBeNull();
    expect(buildMonthlyRecap({ now: NOW, utcOffsetMinutes: 0 })).toBeNull();
  });
});

import { describe, expect, it } from "@jest/globals";

import {
  buildContinueCandidate,
  type ContinueCandidateInput,
} from "../lib/continueCandidateBuilder";
import {
  CONTINUE_WATCHING_TIER_READY,
  CONTINUE_WATCHING_TIER_UPCOMING_DATED,
  CONTINUE_WATCHING_TIER_UPCOMING_UNDATED,
  getContinueWatchingOrderTier,
  isContinueRailEligible,
} from "../lib/continueWatchingOrder";

const DAY_MS = 24 * 60 * 60 * 1000;
// A US evening: 7pm PDT on Sep 1 is already Sep 2 in UTC.
const NOW = Date.parse("2026-09-02T02:00:00.000Z");
const PDT_OFFSET = -420;
const TODAY = "2026-09-01";
const RELEASED_SINCE = "2026-08-18";

function watched(season: number, count: number, startAt = NOW - 10 * DAY_MS) {
  return Array.from({ length: count }, (_, index) => ({
    seasonNumber: season,
    episodeNumber: index + 1,
    watchedAt: startAt + index * 60_000,
  }));
}

function event(airDate: string, seasonNumber: number, episodeNumber: number, title?: string) {
  return {
    airDate,
    airDateTs: Date.parse(`${airDate}T00:00:00.000Z`),
    seasonNumber,
    episodeNumber,
    episodeTitle: title ?? null,
  };
}

function build(overrides: Partial<ContinueCandidateInput> & { status?: string }) {
  const { status, ...rest } = overrides;
  return buildContinueCandidate({
    state: {
      id: "state_1",
      showId: "show_1",
      status: (status ?? "watching") as ContinueCandidateInput["state"]["status"],
      updatedAt: NOW - 30 * DAY_MS,
    },
    detailPayload: undefined,
    progressEpisodes: [],
    releaseEvents: [],
    day: { today: TODAY, utcOffsetMinutes: PDT_OFFSET },
    releasedSince: RELEASED_SINCE,
    now: NOW,
    ...rest,
  });
}

describe("buildContinueCandidate", () => {
  it("ranks tonight's drop by the start of the user's local day, above last night's binge", () => {
    const candidate = build({
      detailPayload: {
        status: "Returning Series",
        seasons: [{ season_number: 2, episode_count: 10 }],
        last_episode_to_air: { season_number: 2, episode_number: 6 },
      },
      progressEpisodes: watched(2, 5, NOW - 8 * DAY_MS),
      releaseEvents: [event(TODAY, 2, 6, "Tonight")],
    });

    expect(candidate).toMatchObject({
      nextSeasonNumber: 2,
      nextEpisodeNumber: 6,
      nextEpisodeName: "Tonight",
      nextEpisodeReleasedToday: true,
      isUpcoming: false,
      isCaughtUp: false,
      status: "watching",
    });
    // Local midnight PDT = 07:00Z — later than a 9pm watch the evening before.
    const localMidnight = Date.parse(`${TODAY}T07:00:00.000Z`);
    expect(candidate.sortTimestamp).toBe(localMidnight);
    const binge = build({
      detailPayload: { status: "Returning Series", seasons: [{ season_number: 1, episode_count: 10 }] },
      progressEpisodes: watched(1, 3, Date.parse("2026-09-01T04:00:00.000Z")),
    });
    expect(binge.sortTimestamp).toBeLessThan(candidate.sortTimestamp);
    expect(getContinueWatchingOrderTier(candidate, NOW)).toBe(CONTINUE_WATCHING_TIER_READY);
  });

  it("does not read tomorrow's episode as tonight's for a user west of UTC", () => {
    const candidate = build({
      detailPayload: {
        status: "Returning Series",
        seasons: [{ season_number: 2, episode_count: 10 }],
        last_episode_to_air: { season_number: 2, episode_number: 5 },
      },
      progressEpisodes: watched(2, 5),
      releaseEvents: [event("2026-09-02", 2, 6, "Tomorrow")],
    });

    expect(candidate).toMatchObject({
      nextEpisodeNumber: 6,
      isUpcoming: true,
      nextEpisodeReleasedToday: false,
      nextAirDate: Date.parse("2026-09-02T00:00:00.000Z"),
    });
    expect(getContinueWatchingOrderTier(candidate, NOW)).toBe(
      CONTINUE_WATCHING_TIER_UPCOMING_DATED,
    );
    expect(isContinueRailEligible(candidate, NOW)).toBe(true);
  });

  it("dates a caught-up show's next-season premiere straight from the details summary", () => {
    const candidate = build({
      status: "caught_up",
      detailPayload: {
        status: "Returning Series",
        seasons: [
          { season_number: 1, episode_count: 8, air_date: "2025-01-10" },
          { season_number: 2, episode_count: 8, air_date: "2026-09-20" },
        ],
        last_episode_to_air: { season_number: 1, episode_number: 8 },
      },
      progressEpisodes: watched(1, 8),
    });

    expect(candidate).toMatchObject({
      status: "caught_up",
      statusChanged: false,
      nextSeasonNumber: 2,
      nextEpisodeNumber: 1,
      isUpcoming: true,
      isCaughtUp: false,
      nextAirDate: Date.parse("2026-09-20T00:00:00.000Z"),
    });
    expect(isContinueRailEligible(candidate, NOW)).toBe(true);
    // Six months out is not "continue" material for the home rail.
    const farOut = build({
      status: "caught_up",
      detailPayload: {
        status: "Returning Series",
        seasons: [
          { season_number: 1, episode_count: 8 },
          { season_number: 2, episode_count: 8, air_date: "2027-03-01" },
        ],
        last_episode_to_air: { season_number: 1, episode_number: 8 },
      },
      progressEpisodes: watched(1, 8),
    });
    expect(farOut.isUpcoming).toBe(true);
    expect(isContinueRailEligible(farOut, NOW)).toBe(false);
  });

  it("brings a finished show back as coming soon when a revival is announced", () => {
    const candidate = build({
      status: "finished",
      detailPayload: {
        status: "Returning Series",
        seasons: [
          { season_number: 1, episode_count: 8 },
          { season_number: 2, episode_count: 0 },
        ],
        last_episode_to_air: { season_number: 1, episode_number: 8 },
      },
      progressEpisodes: watched(1, 8),
    });

    expect(candidate).toMatchObject({
      status: "caught_up",
      statusChanged: true,
      nextSeasonNumber: 2,
      nextEpisodeNumber: 1,
      isUpcoming: true,
      nextAirDate: null,
      nextEpisodeUnverified: true,
    });
    expect(getContinueWatchingOrderTier(candidate, NOW)).toBe(
      CONTINUE_WATCHING_TIER_UPCOMING_UNDATED,
    );
  });

  it("resurrects a caught-up show from a release that dropped a few days ago", () => {
    const candidate = build({
      status: "caught_up",
      detailPayload: {
        status: "Returning Series",
        seasons: [{ season_number: 1, episode_count: 8 }],
        last_episode_to_air: { season_number: 1, episode_number: 8 },
      },
      progressEpisodes: watched(1, 8, NOW - 20 * DAY_MS),
      releaseEvents: [event("2026-08-29", 2, 1, "Back"), event("2026-09-05", 2, 2)],
    });

    expect(candidate).toMatchObject({
      status: "watching",
      statusChanged: true,
      nextSeasonNumber: 2,
      nextEpisodeNumber: 1,
      nextEpisodeName: "Back",
      isUpcoming: false,
      isCaughtUp: false,
      nextReleaseDate: Date.parse("2026-08-29T00:00:00.000Z"),
      totalEpisodes: 9,
    });
    expect(candidate.sortTimestamp).toBe(Date.parse("2026-08-29T07:00:00.000Z"));
  });

  it("keeps a not-yet-started show on its first episode despite later release events", () => {
    const candidate = build({
      detailPayload: {
        status: "Returning Series",
        seasons: [
          { season_number: 1, episode_count: 10, air_date: "2020-01-01" },
          { season_number: 3, episode_count: 6, air_date: "2026-08-10" },
        ],
        last_episode_to_air: { season_number: 3, episode_number: 5 },
      },
      releaseEvents: [event("2026-09-02", 3, 6)],
    });

    expect(candidate).toMatchObject({
      nextSeasonNumber: 1,
      nextEpisodeNumber: 1,
      isUpcoming: false,
      totalWatched: 0,
    });
    expect(getContinueWatchingOrderTier(candidate, NOW)).toBe(CONTINUE_WATCHING_TIER_READY);
  });

  it("presents a premiere event for an unstarted show as upcoming", () => {
    const candidate = build({
      detailPayload: {
        status: "In Production",
        seasons: [{ season_number: 1, episode_count: 8, air_date: "2026-09-10" }],
      },
      releaseEvents: [event("2026-09-10", 1, 1, "Pilot")],
    });

    expect(candidate).toMatchObject({
      nextSeasonNumber: 1,
      nextEpisodeNumber: 1,
      nextEpisodeName: "Pilot",
      isUpcoming: true,
      nextAirDate: Date.parse("2026-09-10T00:00:00.000Z"),
    });
  });

  it("flips a caught-up show to finished once it ends, preserving the row's activity time", () => {
    const candidate = build({
      status: "caught_up",
      detailPayload: {
        status: "Ended",
        seasons: [{ season_number: 1, episode_count: 8 }],
        last_episode_to_air: { season_number: 1, episode_number: 8 },
      },
      progressEpisodes: watched(1, 8),
    });

    expect(candidate).toMatchObject({
      status: "finished",
      statusChanged: true,
      isCaughtUp: true,
      stateUpdatedAt: NOW - 30 * DAY_MS,
    });
  });
});

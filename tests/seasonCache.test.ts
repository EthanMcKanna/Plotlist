import { describe, expect, it } from "@jest/globals";

import {
  findCachedSeasonEpisode,
  seasonCacheKey,
  slimSeasonPayload,
} from "../api/_lib/season-cache";

describe("season cache payload slimming", () => {
  it("keeps only the episode fields up-next needs, from raw TMDB shape", () => {
    const payload = slimSeasonPayload({
      season_number: 2,
      air_date: "2026-04-22",
      name: "Season 2",
      overview: "long season overview",
      episodes: [
        {
          episode_number: 2,
          season_number: 2,
          name: "Harvest",
          overview: "Cassian returns.",
          air_date: "2026-04-29",
          still_path: "/still2.jpg",
          runtime: 52,
          vote_average: 8.1,
          vote_count: 40,
          crew: [{ job: "Director" }],
          guest_stars: [{ name: "Guest" }],
        },
        {
          episode_number: 1,
          season_number: 2,
          name: "One Year Later",
          air_date: "2026-04-22",
          still_path: null,
          runtime: null,
        },
      ],
    });

    expect(payload).toEqual({
      seasonNumber: 2,
      airDate: "2026-04-22",
      episodes: [
        {
          seasonNumber: 2,
          episodeNumber: 1,
          name: "One Year Later",
          overview: null,
          airDate: "2026-04-22",
          stillUrl: null,
          runtime: null,
          voteAverage: null,
          voteCount: null,
        },
        {
          seasonNumber: 2,
          episodeNumber: 2,
          name: "Harvest",
          overview: "Cassian returns.",
          airDate: "2026-04-29",
          stillUrl: "https://image.tmdb.org/t/p/w780/still2.jpg",
          runtime: 52,
          voteAverage: 8.1,
          voteCount: 40,
        },
      ],
    });
  });

  it("accepts already-normalized payloads and absolute still URLs", () => {
    const payload = slimSeasonPayload({
      seasonNumber: 1,
      airDate: "2025-01-01",
      episodes: [
        {
          episodeNumber: 3,
          seasonNumber: 1,
          name: "Third",
          stillUrl: "https://image.tmdb.org/t/p/w780/abs.jpg",
          runtime: 30,
        },
      ],
    });

    expect(payload?.episodes[0]?.stillUrl).toBe("https://image.tmdb.org/t/p/w780/abs.jpg");
    expect(payload?.episodes[0]?.runtime).toBe(30);
  });

  it("rejects payloads without a season number or episode list", () => {
    expect(slimSeasonPayload(null)).toBeNull();
    expect(slimSeasonPayload({ episodes: [] })).toBeNull();
    expect(slimSeasonPayload({ season_number: 1 })).toBeNull();
  });

  it("drops specials-style zero or invalid episode numbers", () => {
    const payload = slimSeasonPayload({
      season_number: 1,
      episodes: [{ episode_number: 0, name: "Special" }, { name: "Broken" }],
    });
    expect(payload?.episodes).toEqual([]);
  });
});

describe("cached episode lookup", () => {
  const payload = slimSeasonPayload({
    season_number: 4,
    episodes: [
      { episode_number: 1, name: "Opener" },
      { episode_number: 2, name: "Second" },
    ],
  });

  it("finds an episode by number", () => {
    expect(findCachedSeasonEpisode(payload, 2)?.name).toBe("Second");
  });

  it("returns null for unknown episodes or missing payloads", () => {
    expect(findCachedSeasonEpisode(payload, 9)).toBeNull();
    expect(findCachedSeasonEpisode(null, 1)).toBeNull();
    expect(findCachedSeasonEpisode(undefined, 1)).toBeNull();
  });
});

describe("season cache keys", () => {
  it("is stable per show and season", () => {
    expect(seasonCacheKey("12345", 2)).toBe("12345:2");
  });
});

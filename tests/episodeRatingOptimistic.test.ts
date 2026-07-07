import { describe, expect, it } from "@jest/globals";

import {
  removeEpisodeRatingEntry,
  upsertEpisodeRating,
  type EpisodeRatingEntry,
} from "../lib/episodeRatingOptimistic";

const baseEntry: EpisodeRatingEntry = {
  _id: "review_1",
  showId: "show_1",
  seasonNumber: 1,
  episodeNumber: 4,
  rating: 3,
  reviewText: "Solid setup episode.",
  episodeTitle: "The Heist",
};

describe("upsertEpisodeRating", () => {
  it("adds a new rating entry when none exists", () => {
    const next = upsertEpisodeRating([], {
      showId: "show_1",
      seasonNumber: 2,
      episodeNumber: 1,
      rating: 4.5,
      episodeTitle: "Premiere",
    });
    expect(next).toHaveLength(1);
    expect(next[0].rating).toBe(4.5);
    expect(next[0].seasonNumber).toBe(2);
    expect(next[0].reviewText).toBeNull();
    expect(next[0]._id).toContain("optimistic:");
  });

  it("updates the rating in place and keeps the note when reviewText is omitted", () => {
    const next = upsertEpisodeRating([baseEntry], {
      showId: "show_1",
      seasonNumber: 1,
      episodeNumber: 4,
      rating: 5,
    });
    expect(next).toHaveLength(1);
    expect(next[0].rating).toBe(5);
    expect(next[0].reviewText).toBe("Solid setup episode.");
  });

  it("replaces the note when reviewText is provided", () => {
    const next = upsertEpisodeRating([baseEntry], {
      showId: "show_1",
      seasonNumber: 1,
      episodeNumber: 4,
      rating: 3,
      reviewText: "  Actually a great episode.  ",
    });
    expect(next[0].reviewText).toBe("Actually a great episode.");
  });

  it("clears the note when reviewText is empty", () => {
    const next = upsertEpisodeRating([baseEntry], {
      showId: "show_1",
      seasonNumber: 1,
      episodeNumber: 4,
      rating: 3,
      reviewText: "",
    });
    expect(next[0].reviewText).toBeNull();
  });

  it("does not touch other episodes", () => {
    const other: EpisodeRatingEntry = { ...baseEntry, _id: "review_2", episodeNumber: 5 };
    const next = upsertEpisodeRating([baseEntry, other], {
      showId: "show_1",
      seasonNumber: 1,
      episodeNumber: 4,
      rating: 1,
    });
    expect(next.find((entry) => entry.episodeNumber === 5)?.rating).toBe(3);
  });
});

describe("removeEpisodeRatingEntry", () => {
  it("removes only the matching episode", () => {
    const other: EpisodeRatingEntry = { ...baseEntry, _id: "review_2", episodeNumber: 5 };
    const next = removeEpisodeRatingEntry([baseEntry, other], {
      showId: "show_1",
      seasonNumber: 1,
      episodeNumber: 4,
    });
    expect(next).toHaveLength(1);
    expect(next[0].episodeNumber).toBe(5);
  });

  it("tolerates an empty cache", () => {
    expect(removeEpisodeRatingEntry(undefined, {
      showId: "show_1",
      seasonNumber: 1,
      episodeNumber: 4,
    })).toEqual([]);
  });
});

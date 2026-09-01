import { describe, expect, it } from "@jest/globals";

import {
  optimisticRateEpisode,
  optimisticRemoveEpisodeRating,
  removeEpisodeRatingEntry,
  removeViewerEpisodeReviewRow,
  upsertEpisodeRating,
  upsertViewerEpisodeReviewRow,
  type EpisodeRatingEntry,
} from "../lib/episodeRatingOptimistic";
import { api, getFunctionName } from "../lib/plotlist/api";
import type { LocalStore } from "../lib/plotlist/react";

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

function createLocalStore(
  initial: Array<{ query: unknown; args?: Record<string, any>; data: any }> = [],
) {
  const keyFor = (query: unknown, args: Record<string, any> | undefined) =>
    `${getFunctionName(query)}:${JSON.stringify(args ?? null)}`;
  const data = new Map<string, any>();
  for (const entry of initial) data.set(keyFor(entry.query, entry.args), entry.data);
  const store: LocalStore = {
    getQuery: (query, args) => data.get(keyFor(query, args)),
    setQuery: (query, args, value) => {
      data.set(keyFor(query, args), value);
    },
    setPaginatedQuery: () => undefined,
    patchQueriesByName: () => undefined,
  };
  return { store, get: (query: unknown, args?: Record<string, any>) => data.get(keyFor(query, args)) };
}

const episodeArgs = { showId: "show_1", seasonNumber: 1, episodeNumber: 4 };
const viewer = { _id: "user_me", username: "me", displayName: "Me" };

describe("viewer row in the episode community list", () => {
  it("prepends the viewer's row with their avatar when they have none", () => {
    const next = upsertViewerEpisodeReviewRow(
      { results: [{ review: { _id: "r_other", authorId: "user_2", rating: 2 } }], page: [] },
      { ...episodeArgs, _id: "optimistic:x", rating: 4.5, reviewText: "Great", updatedAt: 5 },
      { viewer, viewerAvatarUrl: "https://cdn/me.jpg" },
      { _id: "show_1", title: "Severance" },
    ) as any;
    expect(next.results).toHaveLength(2);
    expect(next.results[0]).toMatchObject({
      review: { authorId: "user_me", rating: 4.5, reviewText: "Great", seasonNumber: 1 },
      author: viewer,
      authorAvatarUrl: "https://cdn/me.jpg",
      show: { title: "Severance" },
      likeCount: 0,
    });
    expect(next.page).toBe(next.results);
  });

  it("updates the viewer's existing row in place and keeps its likes", () => {
    const mine = {
      review: { _id: "r_me", authorId: "user_me", rating: 2, reviewText: "Meh", createdAt: 1 },
      author: viewer,
      authorAvatarUrl: "https://cdn/old.jpg",
      likeCount: 3,
      likedByViewer: false,
    };
    const next = upsertViewerEpisodeReviewRow(
      [mine],
      { ...episodeArgs, _id: "optimistic:x", rating: 5, reviewText: "Meh", updatedAt: 9 },
      { viewer },
      null,
    ) as any[];
    expect(next).toHaveLength(1);
    expect(next[0].review).toMatchObject({ _id: "r_me", rating: 5, createdAt: 1, updatedAt: 9 });
    expect(next[0].likeCount).toBe(3);
    expect(next[0].authorAvatarUrl).toBe("https://cdn/old.jpg");
  });

  it("leaves the list alone without a viewer, and removes only the viewer's row", () => {
    const rows = [{ review: { _id: "r_me", authorId: "user_me", rating: 2 } }];
    expect(
      upsertViewerEpisodeReviewRow(rows, { ...episodeArgs, rating: 5 }, {}, null),
    ).toBe(rows);
    expect(removeViewerEpisodeReviewRow(rows, "user_me")).toEqual([]);
    expect(removeViewerEpisodeReviewRow(rows, "user_9")).toBe(rows);
  });
});

describe("optimisticRateEpisode cache patching", () => {
  it("moves the episode stats and community list with the viewer's rating", () => {
    const { store, get } = createLocalStore([
      { query: api.reviews.getMyEpisodeRatings, args: { showId: "show_1" }, data: [] },
      {
        query: api.reviews.getEpisodeStats,
        args: episodeArgs,
        data: { count: 1, reviewCount: 1, averageRating: 3, histogram: [0, 0, 1, 0, 0] },
      },
      { query: api.reviews.listForEpisodeDetailed, args: episodeArgs, data: { results: [] } },
    ]);
    optimisticRateEpisode(store, { ...episodeArgs, rating: 5 }, { viewer });
    expect(get(api.reviews.getMyEpisodeRatings, { showId: "show_1" })).toHaveLength(1);
    expect(get(api.reviews.getEpisodeStats, episodeArgs)).toMatchObject({
      count: 2,
      averageRating: 4,
      histogram: [0, 0, 1, 0, 1],
    });
    expect(get(api.reviews.listForEpisodeDetailed, episodeArgs).results[0]).toMatchObject({
      review: { authorId: "user_me", rating: 5 },
    });

    // Re-rating swaps the star without inflating the count.
    optimisticRateEpisode(store, { ...episodeArgs, rating: 1 }, { viewer });
    expect(get(api.reviews.getEpisodeStats, episodeArgs)).toMatchObject({
      count: 2,
      averageRating: 2,
      histogram: [1, 0, 1, 0, 0],
    });
    expect(get(api.reviews.listForEpisodeDetailed, episodeArgs).results).toHaveLength(1);

    optimisticRemoveEpisodeRating(store, episodeArgs, { viewer });
    expect(get(api.reviews.getMyEpisodeRatings, { showId: "show_1" })).toEqual([]);
    expect(get(api.reviews.getEpisodeStats, episodeArgs)).toMatchObject({
      count: 1,
      averageRating: 3,
      histogram: [0, 0, 1, 0, 0],
    });
    expect(get(api.reviews.listForEpisodeDetailed, episodeArgs).results).toEqual([]);
  });

  it("does not invent stats or community rows that were never loaded", () => {
    const { store, get } = createLocalStore([
      { query: api.reviews.getMyEpisodeRatings, args: { showId: "show_1" }, data: [] },
    ]);
    optimisticRateEpisode(store, { ...episodeArgs, rating: 4 }, { viewer });
    expect(get(api.reviews.getEpisodeStats, episodeArgs)).toBeUndefined();
    expect(get(api.reviews.listForEpisodeDetailed, episodeArgs)).toBeUndefined();
  });
});

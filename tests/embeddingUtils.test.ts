import { describe, expect, it } from "@jest/globals";
import {
  buildRecommendationSignalFingerprint,
  buildShowEmbeddingText,
  cosineSimilarity,
  mapGenreIdsToNames,
  mergeHybridCandidates,
  weightedCentroid,
} from "../lib/plotlist/embeddingUtils";

describe("embeddingUtils", () => {
  it("maps TMDB genre ids to readable names", () => {
    expect(mapGenreIdsToNames([18, 10765, 999999])).toEqual([
      "Drama",
      "Sci-Fi & Fantasy",
    ]);
  });

  it("builds rich embedding text from show metadata", () => {
    const text = buildShowEmbeddingText({
      _id: "show_1" as any,
      _creationTime: 0,
      externalSource: "tmdb",
      externalId: "123",
      title: "Severance",
      originalTitle: undefined,
      year: 2022,
      overview: "Employees surgically divide their work and personal memories.",
      posterUrl: undefined,
      backdropUrl: undefined,
      genreIds: [18, 9648, 10765],
      originalLanguage: "en",
      originCountries: ["US"],
      tmdbPopularity: 100,
      tmdbVoteAverage: 8.4,
      tmdbVoteCount: 1000,
      searchText: "severance",
      createdAt: 0,
      updatedAt: 0,
    });

    expect(text).toContain("Title: Severance");
    expect(text).toContain("Genres: Drama, Mystery, Sci-Fi & Fantasy");
    expect(text).toContain("Overview: Employees surgically divide their work and personal memories.");
  });

  it("computes a weighted centroid", () => {
    expect(
      weightedCentroid([
        { vector: [1, 0, 0], weight: 2 },
        { vector: [0, 1, 0], weight: 1 },
      ]),
    ).toEqual([2 / 3, 1 / 3, 0]);
  });

  it("builds a stable recommendation signal fingerprint", () => {
    const left = buildRecommendationSignalFingerprint({
      embeddingVersion: "shows-v1",
      themeKey: "__default__",
      watchSignals: ["a:completed:1", "b:watching:2"],
      reviewSignals: ["b:4.5:3:0"],
    });
    const right = buildRecommendationSignalFingerprint({
      embeddingVersion: "shows-v1",
      themeKey: "__default__",
      watchSignals: ["b:watching:2", "a:completed:1"],
      reviewSignals: ["b:4.5:3:0"],
    });

    expect(left).toBe(right);
    expect(
      buildRecommendationSignalFingerprint({
        embeddingVersion: "shows-v1",
        themeKey: "crime drama",
        watchSignals: ["a:completed:1", "b:watching:2"],
        reviewSignals: ["b:4.5:3:0"],
      }),
    ).not.toBe(left);
  });

  it("keeps exact lexical matches ahead of semantic-only matches", () => {
    const ranked = mergeHybridCandidates(
      [
        {
          id: "exact",
          lexicalScore: 1,
          semanticScore: 0.35,
          exactTitleMatch: true,
        },
        {
          id: "semantic",
          lexicalScore: 0,
          semanticScore: 0.92,
        },
      ],
      2,
    );

    expect(ranked[0].id).toBe("exact");
  });

  it("computes cosine similarity", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1, 5);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });
});

import { describe, expect, it } from "@jest/globals";

import {
  buildShowEmbeddingDocV2,
  computeEmbeddingInputHash,
  extractEnrichmentFromTmdbDetails,
  isShowWorthEmbedding,
  EMBEDDING_VERSION,
} from "../lib/plotlist/embeddingDoc";
import { FACET_DEFS, facetEmbeddingText } from "../lib/plotlist/facets";

const breakingBad = {
  title: "Breaking Bad",
  originalTitle: "Breaking Bad",
  year: 2008,
  overview:
    "A high school chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine with a former student.",
  genreIds: [18, 80],
  originalLanguage: "en",
  originCountries: ["US"],
};

const rawTmdbDetails = {
  tagline: "Change the equation.",
  type: "Scripted",
  status: "Ended",
  first_air_date: "2008-01-20",
  last_air_date: "2013-09-29",
  number_of_seasons: 5,
  number_of_episodes: 62,
  episode_run_time: [47],
  created_by: [{ name: "Vince Gilligan" }],
  networks: [{ name: "AMC" }],
  keywords: {
    results: [
      { name: "drug cartel" },
      { name: "chemistry teacher" },
      { name: "new mexico" },
    ],
  },
  credits: {
    cast: [
      { name: "Bryan Cranston" },
      { name: "Aaron Paul" },
      { name: "Anna Gunn" },
    ],
  },
  content_ratings: {
    results: [
      { iso_3166_1: "DE", rating: "16" },
      { iso_3166_1: "US", rating: "TV-MA" },
    ],
  },
};

describe("extractEnrichmentFromTmdbDetails", () => {
  it("pulls keywords, credits, networks, format, and the US rating", () => {
    const enrichment = extractEnrichmentFromTmdbDetails(rawTmdbDetails);
    expect(enrichment.keywords).toEqual(["drug cartel", "chemistry teacher", "new mexico"]);
    expect(enrichment.creators).toEqual(["Vince Gilligan"]);
    expect(enrichment.cast).toEqual(["Bryan Cranston", "Aaron Paul", "Anna Gunn"]);
    expect(enrichment.networks).toEqual(["AMC"]);
    expect(enrichment.contentRating).toBe("TV-MA");
    expect(enrichment.firstAirYear).toBe(2008);
    expect(enrichment.lastAirYear).toBe(2013);
    expect(enrichment.numberOfSeasons).toBe(5);
    expect(enrichment.numberOfEpisodes).toBe(62);
    expect(enrichment.episodeRunTimeMinutes).toBe(47);
  });

  it("tolerates missing payloads and normalized cache shapes", () => {
    expect(extractEnrichmentFromTmdbDetails(null)).toEqual({});
    const normalized = extractEnrichmentFromTmdbDetails({
      numberOfSeasons: 3,
      numberOfEpisodes: 24,
      episodeRunTime: 30,
    });
    expect(normalized.numberOfSeasons).toBe(3);
    expect(normalized.episodeRunTimeMinutes).toBe(30);
  });
});

describe("buildShowEmbeddingDocV2", () => {
  it("renders a fully enriched doc with stable labeled lines", () => {
    const doc = buildShowEmbeddingDocV2(
      breakingBad,
      extractEnrichmentFromTmdbDetails(rawTmdbDetails),
    );
    expect(doc).toContain("Title: Breaking Bad (2008–2013, ended)");
    expect(doc).toContain("Type: scripted series");
    expect(doc).toContain("Genres: Drama, Crime");
    expect(doc).toContain("Keywords: drug cartel, chemistry teacher, new mexico");
    expect(doc).toContain("Created by: Vince Gilligan");
    expect(doc).toContain("Cast: Bryan Cranston, Aaron Paul, Anna Gunn");
    expect(doc).toContain("Network: AMC · Language: English · Country: US");
    expect(doc).toContain("Format: 5 seasons, 62 episodes, ~47 min episodes");
    expect(doc).toContain("Audience: TV-MA");
    expect(doc).toContain("Premise: A high school chemistry teacher");
    // No duplicated original title when it matches the title.
    expect(doc).not.toContain("Original title:");
  });

  it("degrades gracefully with only base row data", () => {
    const doc = buildShowEmbeddingDocV2({
      title: "Some Obscure Show",
      year: 2001,
      overview: "A tiny show.",
      genreIds: [35],
      originalLanguage: "ko",
    });
    expect(doc).toContain("Title: Some Obscure Show (2001)");
    expect(doc).toContain("Genres: Comedy");
    expect(doc).toContain("Language: Korean");
    expect(doc).toContain("Premise: A tiny show.");
    expect(doc).not.toContain("Keywords:");
  });

  it("labels anime via original language + animation genre", () => {
    const doc = buildShowEmbeddingDocV2(
      {
        title: "Frieren",
        genreIds: [16, 10765],
        originalLanguage: "ja",
        overview: "An elf mage reflects on time and loss.",
      },
      { type: "Scripted" },
    );
    expect(doc).toContain("Type: anime series");
  });

  it("marks ongoing shows as present-running", () => {
    const doc = buildShowEmbeddingDocV2(breakingBad, {
      status: "Returning Series",
      firstAirYear: 2008,
    });
    expect(doc).toContain("(2008–present, ongoing)");
  });
});

describe("computeEmbeddingInputHash", () => {
  it("is stable and version-scoped", () => {
    const doc = buildShowEmbeddingDocV2(breakingBad);
    expect(computeEmbeddingInputHash(doc)).toBe(computeEmbeddingInputHash(doc));
    expect(computeEmbeddingInputHash(doc)).not.toBe(computeEmbeddingInputHash(`${doc} `));
    expect(EMBEDDING_VERSION).toContain("1536");
  });
});

describe("isShowWorthEmbedding", () => {
  it("keeps shows with real overviews or engagement and skips stubs", () => {
    expect(isShowWorthEmbedding(breakingBad as any)).toBe(true);
    expect(isShowWorthEmbedding({ overview: "", tmdbPopularity: 0.4, tmdbVoteCount: 0 })).toBe(
      false,
    );
    expect(isShowWorthEmbedding({ overview: null, tmdbPopularity: 3 })).toBe(true);
    expect(isShowWorthEmbedding({ overview: "short", tmdbVoteCount: 9 })).toBe(true);
  });
});

describe("facet taxonomy", () => {
  it("has unique keys and non-empty descriptions", () => {
    const keys = FACET_DEFS.map((facet) => facet.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const facet of FACET_DEFS) {
      expect(facet.title.length).toBeGreaterThan(2);
      expect(facet.description.length).toBeGreaterThan(40);
      expect(facet.key).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("renders embeddable query text", () => {
    const text = facetEmbeddingText(FACET_DEFS[0]);
    expect(text).toContain(FACET_DEFS[0].title);
    expect(text).toContain(FACET_DEFS[0].description);
  });
});

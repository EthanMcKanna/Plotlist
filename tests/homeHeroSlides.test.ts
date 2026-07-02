import { describe, expect, it } from "@jest/globals";

import {
  buildHeroMeta,
  getHeroEyebrowDisplay,
  getHeroReasonLabel,
} from "../components/HeroCarousel";
import { getHomeEditorialSeedItemByTitle } from "../lib/homeEditorialSeeds";
import { buildHeroSlides } from "../lib/useHomeData";

const currentYear = new Date().getUTCFullYear();

function show(overrides: Partial<Parameters<typeof buildHeroSlides>[0]["premieres"][number]>) {
  return {
    externalSource: "tmdb",
    externalId: overrides.title ?? "show",
    title: overrides.title ?? "Show",
    year: currentYear,
    posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
    overview: "A show worth opening.",
    genreIds: [18],
    tmdbPopularity: 100,
    tmdbVoteAverage: 8,
    tmdbVoteCount: 500,
    ...overrides,
  };
}

describe("home hero slides", () => {
  it("lets researched fresh premieres replace stale-but-popular personalization in the hero", () => {
    const stalePersonalPick = show({
      externalId: "stale-personal",
      title: "Stale Personal Favorite",
      year: currentYear - 7,
      tmdbPopularity: 900,
      tmdbVoteAverage: 8.5,
      tmdbVoteCount: 5000,
    });
    const freshPremiere = show({
      externalId: "fresh-premiere",
      title: "Fresh Premiere",
      year: currentYear,
      tmdbPopularity: 180,
      tmdbVoteAverage: 7.8,
      tmdbVoteCount: 500,
    });

    const slides = buildHeroSlides({
      forYou: [stalePersonalPick],
      trending: [stalePersonalPick],
      premieres: [freshPremiere],
      airing: [],
    });

    expect(slides[0]).toMatchObject({
      title: "Fresh Premiere",
      eyebrow: "fresh",
    });
    expect(slides.map((slide) => slide.title)).not.toContain("Stale Personal Favorite");
  });

  it("keeps a current personalized pick in front when it is fresh enough", () => {
    const freshPersonalPick = show({
      externalId: "fresh-personal",
      title: "Fresh Personal Match",
      year: currentYear - 1,
      tmdbPopularity: 160,
      tmdbVoteAverage: 7.9,
      tmdbVoteCount: 400,
    });
    const freshPremiere = show({
      externalId: "fresh-premiere",
      title: "Fresh Premiere",
      year: currentYear,
      tmdbPopularity: 180,
      tmdbVoteAverage: 7.4,
      tmdbVoteCount: 80,
    });

    const slides = buildHeroSlides({
      forYou: [freshPersonalPick],
      trending: [],
      premieres: [freshPremiere],
      airing: [],
    });

    expect(slides[0]).toMatchObject({
      title: "Fresh Personal Match",
      eyebrow: "for-you",
    });
    expect(slides[0].reason).toBeNull();
    expect(getHeroReasonLabel(slides[0])).toBeNull();
  });

  it("lets an explicit release-window premiere lead over an unsignaled personal match", () => {
    const recentPersonalPick = show({
      externalId: "recent-personal",
      title: "Recent Personal Match",
      year: currentYear - 1,
      tmdbPopularity: 190,
      tmdbVoteAverage: 8.2,
      tmdbVoteCount: 800,
    });
    const releaseWindowPremiere = show({
      externalId: "release-window-premiere",
      title: "Release Window Premiere",
      year: currentYear,
      homeSignal: "Apple TV+ May 29",
      tmdbPopularity: 80,
      tmdbVoteAverage: 7.5,
      tmdbVoteCount: 120,
    });

    const slides = buildHeroSlides({
      forYou: [recentPersonalPick],
      trending: [],
      premieres: [releaseWindowPremiere],
      airing: [],
    });

    expect(slides[0]).toMatchObject({
      title: "Release Window Premiere",
      eyebrow: "fresh",
      signal: "Apple TV+ May 29",
    });
    expect(slides[1]).toMatchObject({
      title: "Recent Personal Match",
      eyebrow: "for-you",
    });
  });

  it("uses release-window recency for the fresh hero instead of older dated launches", () => {
    const olderRelease = show({
      externalId: "older-release",
      title: "Older Release",
      year: currentYear,
      homeSignal: "Prime May 13",
      tmdbPopularity: 300,
      tmdbVoteAverage: 9.1,
      tmdbVoteCount: 1200,
    });
    const weekendLaunch = show({
      externalId: "weekend-launch",
      title: "Weekend Launch",
      year: currentYear,
      homeSignal: "Apple TV+ May 29",
      tmdbPopularity: 70,
      tmdbVoteAverage: 0,
      tmdbVoteCount: 0,
    });

    const slides = buildHeroSlides({
      forYou: [],
      trending: [],
      premieres: [olderRelease, weekendLaunch],
      airing: [],
      now: `${currentYear}-05-29T12:00:00.000Z`,
    });

    expect(slides[0]).toMatchObject({
      title: "Weekend Launch",
      eyebrow: "fresh",
      signal: "Apple TV+ May 29",
    });
    expect(slides.map((slide) => slide.title)).toContain("Older Release");
  });

  it("lets current-demand confidence break close release-window hero ties", () => {
    const now = "2026-05-30T12:00:00.000Z";
    const spiderNoir = getHomeEditorialSeedItemByTitle("Spider-Noir", now);
    const forAllMankind = getHomeEditorialSeedItemByTitle("For All Mankind", now);
    const starCity = getHomeEditorialSeedItemByTitle("Star City", now);

    expect(spiderNoir).not.toBeNull();
    expect(forAllMankind).not.toBeNull();
    expect(starCity).not.toBeNull();

    const slides = buildHeroSlides({
      forYou: [],
      trending: [],
      premieres: [
        forAllMankind!,
        starCity!,
        spiderNoir!,
      ],
      airing: [],
      now,
    });

    expect(slides[0]).toMatchObject({
      title: "Spider-Noir",
      eyebrow: "fresh",
      signal: "Prime May 27",
      reason: "JustWatch #1 today",
    });
    expect(getHeroReasonLabel(slides[0])).toBe("JustWatch #1 today");
  });

  it("lets the live #1 daily chart title win close same-week hero ties", () => {
    const now = "2026-05-30T12:00:00.000Z";
    const spiderNoir = getHomeEditorialSeedItemByTitle("Spider-Noir", now);
    const fourSeasons = getHomeEditorialSeedItemByTitle("The Four Seasons", now);

    expect(spiderNoir).not.toBeNull();
    expect(fourSeasons).not.toBeNull();

    const slides = buildHeroSlides({
      forYou: [],
      trending: [fourSeasons!, spiderNoir!],
      premieres: [fourSeasons!, spiderNoir!],
      airing: [],
      now,
    });

    expect(slides[0]).toMatchObject({
      title: "Spider-Noir",
      eyebrow: "fresh",
      signal: "Prime May 27",
      reason: "JustWatch #1 today",
    });
  });

  it("uses ranking confidence instead of source order for the fresh hero lead", () => {
    const noisyFirstSeed = show({
      externalId: "noisy-first",
      title: "Noisy First Seed",
      year: currentYear,
      tmdbPopularity: 900,
      tmdbVoteAverage: 9.4,
      tmdbVoteCount: 60,
    });
    const returningEvent = show({
      externalId: "returning-event",
      title: "Returning Event",
      year: currentYear - 4,
      homeSignal: "Returns Jun 21",
      tmdbPopularity: 180,
      tmdbVoteAverage: 8.4,
      tmdbVoteCount: 1200,
    });

    const slides = buildHeroSlides({
      forYou: [],
      trending: [],
      premieres: [noisyFirstSeed, returningEvent],
      airing: [],
    });

    expect(slides[0]).toMatchObject({
      title: "Returning Event",
      eyebrow: "fresh",
      signal: "Returns Jun 21",
    });
  });

  it("dedupes hero slides by title when sources disagree on ids", () => {
    const firstSource = show({
      externalId: "internal-adolescence",
      title: "Adolescence",
      tmdbPopularity: 500,
    });
    const secondSource = show({
      externalId: "tmdb-adolescence",
      title: "Adolescence",
      tmdbPopularity: 450,
    });
    const backup = show({
      externalId: "foundation",
      title: "Foundation",
    });

    const slides = buildHeroSlides({
      forYou: [firstSource],
      trending: [secondSource, backup],
      premieres: [],
      airing: [],
    });

    expect(slides.filter((slide) => slide.title === "Adolescence")).toHaveLength(1);
    expect(slides.map((slide) => slide.title)).toContain("Foundation");
  });

  it("keeps old generic trending hits out of the hero carousel", () => {
    const oldTrendingHit = show({
      externalId: "old-hit",
      title: "Old Hit",
      year: currentYear - 6,
      tmdbPopularity: 900,
      tmdbVoteAverage: 8.4,
      tmdbVoteCount: 5000,
    });
    const oldReturningHit = show({
      externalId: "old-returning",
      title: "Old Returning Hit",
      year: currentYear - 6,
      homeSignal: "S9 airing now",
      tmdbPopularity: 180,
      tmdbVoteAverage: 8.4,
      tmdbVoteCount: 5000,
    });

    const slides = buildHeroSlides({
      forYou: [],
      trending: [oldTrendingHit, oldReturningHit],
      premieres: [],
      airing: [],
    });

    expect(slides.map((slide) => slide.title)).toEqual(["Old Returning Hit"]);
    expect(slides[0]).toMatchObject({
      eyebrow: "current",
      signal: "S9 airing now",
    });
  });

  it("labels current trending-sourced heroes as happening now instead of generic trending", () => {
    const currentTrend = show({
      externalId: "current-trend",
      title: "Current Trend",
      year: currentYear,
      homeSignal: "Paramount+ May 15",
      tmdbPopularity: 220,
      tmdbVoteAverage: 8.1,
      tmdbVoteCount: 300,
    });

    const slides = buildHeroSlides({
      forYou: [],
      trending: [currentTrend],
      premieres: [],
      airing: [],
    });

    expect(slides[0]).toMatchObject({
      title: "Current Trend",
      eyebrow: "current",
      signal: "Paramount+ May 15",
    });
  });

  it("keeps generic recent trends labeled as on the rise", () => {
    const recentTrend = show({
      externalId: "recent-trend",
      title: "Recent Trend",
      year: currentYear,
      tmdbPopularity: 220,
      tmdbVoteAverage: 8.1,
      tmdbVoteCount: 300,
    });

    const slides = buildHeroSlides({
      forYou: [],
      trending: [recentTrend],
      premieres: [],
      airing: [],
    });

    expect(slides[0]).toMatchObject({
      title: "Recent Trend",
      eyebrow: "trending",
    });
  });

  it("does not use stale generic personalization as the fallback hero", () => {
    const stalePersonalPick = show({
      externalId: "stale-personal-only",
      title: "Stale Personal Only",
      year: currentYear - 5,
      tmdbPopularity: 900,
      tmdbVoteAverage: 8.8,
      tmdbVoteCount: 5000,
    });

    const slides = buildHeroSlides({
      forYou: [stalePersonalPick],
      trending: [],
      premieres: [],
      airing: [],
    });

    expect(slides).toEqual([]);
  });

  it("uses the supplied homepage year for hero recency floors", () => {
    const returningHit = show({
      externalId: "returning-hit",
      title: "Returning Hit",
      year: 2022,
      homeSignal: "S4 airing now",
      tmdbPopularity: 220,
      tmdbVoteAverage: 8.3,
      tmdbVoteCount: 1200,
    });

    expect(
      buildHeroSlides({
        forYou: [],
        trending: [returningHit],
        premieres: [],
        airing: [],
        now: "2026-05-30T12:00:00.000Z",
      }).map((slide) => slide.title),
    ).toContain("Returning Hit");
    expect(
      buildHeroSlides({
        forYou: [],
        trending: [returningHit],
        premieres: [],
        airing: [],
        now: "2030-05-30T12:00:00.000Z",
      }),
    ).toEqual([]);
  });

  it("dedupes hero meta labels when a fallback signal repeats the rating", () => {
    expect(
      buildHeroMeta({
        key: "rating-repeat",
        title: "Rating Repeat",
        eyebrow: "trending",
        genreIds: [18],
        signal: "8.4 TMDB",
        tmdbVoteAverage: 8.4,
        year: 2025,
      }),
    ).toEqual(["Drama", "8.4 TMDB", "2025"]);
  });

  it("turns dated fresh hero badges into simple recency labels", () => {
    const base = {
      key: "fresh-launch",
      title: "Fresh Launch",
      eyebrow: "fresh" as const,
      signal: "Apple TV+ May 29",
    };

    expect(
      getHeroEyebrowDisplay(base, `${currentYear}-05-29T12:00:00.000Z`)?.label,
    ).toBe("New");
    expect(
      getHeroEyebrowDisplay(base, `${currentYear}-05-30T12:00:00.000Z`)?.label,
    ).toBe("New");
    expect(
      getHeroEyebrowDisplay(
        { ...base, signal: "Returns Jun 21" },
        `${currentYear}-06-16T12:00:00.000Z`,
      )?.label,
    ).toBe("Returning");
  });

  it("projects hero signals against the supplied homepage timestamp", () => {
    const from = show({
      title: "FROM",
      year: 2022,
      tmdbVoteAverage: 8.2,
      homeSignal: null,
    });

    expect(
      buildHeroSlides({
        forYou: [],
        trending: [],
        premieres: [from],
        airing: [],
        now: "2026-05-30",
      })[0]?.signal,
    ).toBe("MGM+ S4 airing now");
    expect(
      buildHeroSlides({
        forYou: [],
        trending: [],
        premieres: [from],
        airing: [],
        now: "2026-06-29",
      })[0]?.signal,
    ).toBe("8.2 TMDB");
  });
});

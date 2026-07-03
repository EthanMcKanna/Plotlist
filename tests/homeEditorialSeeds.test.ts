import { describe, expect, it } from "@jest/globals";

import {
  auditHomeEditorialSeeds,
  getHomeEditorialCurrentDemandSeedItems,
  getHomeEditorialDailyChartRank,
  getHomeEditorialDemandConfidenceScore,
  getHomeEditorialPlatformKeyByTitle,
  getHomeEditorialProviderSeedItems,
  getHomeEditorialSeedEntries,
  getHomeEditorialSeedItemByTitle,
  getHomeEditorialSeedItems,
  getHomeEditorialSeedProvenance,
  getHomeEditorialSeedTitles,
  HOME_EDITORIAL_DEMAND_SOURCE_IDS,
  HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART,
  HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART_TITLES,
  HOME_EDITORIAL_RESEARCH_SOURCES,
  HOME_EDITORIAL_SEED_VALID_THROUGH_DATES,
  type HomeEditorialSeedGroup,
  isHomeEditorialSeedGroupFresh,
} from "../lib/homeEditorialSeeds";

const SEED_GROUPS: HomeEditorialSeedGroup[] = ["newOrBack", "quality", "quick"];
const MIN_RESEARCH_DATE = Date.parse("2026-05-28T00:00:00.000Z");

function expectRecentResearchDate(value: string | undefined) {
  const timestamp = Date.parse(`${value ?? ""}T00:00:00.000Z`);
  expect(Number.isFinite(timestamp)).toBe(true);
  expect(timestamp).toBeGreaterThanOrEqual(MIN_RESEARCH_DATE);
}

describe("home editorial seeds", () => {
  it("provides current fallback seeds during their explicit freshness window", () => {
    expect(getHomeEditorialSeedTitles("newOrBack", "2026-05-28")).toContain("Dutton Ranch");
    expect(getHomeEditorialSeedTitles("newOrBack", "2026-05-28")).toContain("Spider-Noir");
    expect(getHomeEditorialSeedTitles("newOrBack", "2026-05-28")).toContain(
      "A Good Girl's Guide to Murder",
    );
    expect(getHomeEditorialSeedTitles("newOrBack", "2026-05-28")).toContain("The Boroughs");
    expect(getHomeEditorialSeedTitles("newOrBack", "2026-05-28")).toContain("Deli Boys");
    expect(getHomeEditorialSeedTitles("newOrBack", "2026-05-28")).toContain("House of the Dragon");
    expect(getHomeEditorialSeedTitles("newOrBack", "2026-05-30")).toContain("The Boys");
    expect(getHomeEditorialSeedTitles("newOrBack", "2026-05-30")).toContain("Euphoria");
    expect(getHomeEditorialSeedTitles("newOrBack", "2026-05-30")).toContain("FROM");
    expect(getHomeEditorialSeedTitles("newOrBack", "2026-05-30")).toContain(
      "Love Island USA",
    );
    expect(getHomeEditorialSeedTitles("newOrBack", "2026-05-30")).toContain(
      "For All Mankind",
    );
    expect(getHomeEditorialSeedTitles("newOrBack", "2026-05-30")).toContain("Cape Fear");
    expect(getHomeEditorialSeedTitles("newOrBack", "2026-05-30")).toContain("Man on Fire");
    expect(getHomeEditorialSeedTitles("newOrBack", "2026-05-30")).toContain(
      "Murder Mindfully",
    );
    expect(getHomeEditorialSeedTitles("newOrBack", "2026-05-30")).toContain("Rafa");
    expect(getHomeEditorialSeedTitles("newOrBack", "2026-05-30")).toContain(
      "Sweet Magnolias",
    );
    expect(getHomeEditorialSeedTitles("newOrBack", "2026-05-30")).toContain(
      "Avatar: The Last Airbender",
    );
    expect(getHomeEditorialSeedTitles("newOrBack", "2026-05-30")).toContain("Elle");
    expect(getHomeEditorialSeedTitles("newOrBack", "2026-05-30")).toContain(
      "Maximum Pleasure Guaranteed",
    );
    expect(getHomeEditorialSeedTitles("newOrBack", "2026-05-30")).toContain(
      "Not Suitable for Work",
    );
    expect(getHomeEditorialSeedTitles("newOrBack", "2026-05-30")).toContain(
      "The Testaments",
    );
    expect(getHomeEditorialSeedTitles("newOrBack", "2026-05-30")).toContain(
      "The Beauty",
    );
    expect(getHomeEditorialSeedTitles("newOrBack", "2026-05-30")).toContain(
      "Dragon Striker",
    );
    expect(getHomeEditorialSeedTitles("quality", "2026-05-28")).toContain("The Pitt");
    expect(getHomeEditorialSeedTitles("quick", "2026-05-28")).toContain("Hacks");
    expect(getHomeEditorialSeedTitles("newOrBack", "2026-05-29")).toContain(
      "Sofia the First: Royal Magic",
    );
  });

  it("keeps the new/back fallback on a review window with title-level freshness gates", () => {
    expect(HOME_EDITORIAL_SEED_VALID_THROUGH_DATES.newOrBack).toBe("2026-07-12");
    expect(isHomeEditorialSeedGroupFresh("newOrBack", "2026-07-12T12:00:00.000Z")).toBe(true);
    expect(isHomeEditorialSeedGroupFresh("newOrBack", "2026-07-13T00:00:00.000Z")).toBe(false);

    const lateJuneTitles = getHomeEditorialSeedTitles("newOrBack", "2026-06-22");
    expect(lateJuneTitles).toContain("House of the Dragon");
    expect(lateJuneTitles).toContain("Rick and Morty");
    expect(lateJuneTitles).toContain("Love Island USA");
    expect(lateJuneTitles).toContain("Sweet Magnolias");
    expect(lateJuneTitles).toContain("Avatar: The Last Airbender");
    expect(lateJuneTitles).toContain("Elle");
    expect(lateJuneTitles).not.toContain("Off Campus");
    expect(lateJuneTitles).not.toContain("Legends");
    expect(getHomeEditorialSeedTitles("newOrBack", "2026-07-13")).toEqual([]);
  });

  it("keeps quality and quick shelves on a bounded review window", () => {
    expect(getHomeEditorialSeedTitles("quality", "2026-06-22")).toContain("Andor");
    expect(getHomeEditorialSeedTitles("quick", "2026-06-22")).toContain("The Studio");
    expect(getHomeEditorialSeedTitles("quick", "2026-06-22")).not.toContain("Hacks");
    expect(getHomeEditorialSeedTitles("quality", "2026-09-01")).toEqual([]);
    expect(getHomeEditorialSeedTitles("quick", "2026-09-01")).toEqual([]);
  });

  it("fails closed when freshness input is invalid", () => {
    expect(isHomeEditorialSeedGroupFresh("newOrBack", "not-a-date")).toBe(false);
    expect(getHomeEditorialSeedTitles("newOrBack", "not-a-date")).toEqual([]);
  });

  it("ships verified catalog payloads for deterministic rail fallbacks", () => {
    const qualityItems = getHomeEditorialSeedItems("quality", "2026-05-28");
    expect(qualityItems.map((item) => item.title)).toContain("Andor");
    expect(qualityItems.every((item) => item.posterUrl && item.externalId)).toBe(true);
    expect(qualityItems.find((item) => item.title === "Severance")?.homeSignal).toBeUndefined();

    const quickItems = getHomeEditorialSeedItems("quick", "2026-05-28");
    expect(quickItems.map((item) => item.title)).toContain("The Rehearsal");
    expect(quickItems.find((item) => item.title === "Hacks")?.homeSignal).toBe(
      "Finale May 28",
    );

    const freshItems = getHomeEditorialSeedItems("newOrBack", "2026-05-28");
    expect(freshItems.map((item) => item.title)).toContain("Your Friends & Neighbors");
    expect(freshItems.find((item) => item.title === "Deli Boys")?.homeSignal).toBe(
      "S2 May 28",
    );
    expect(
      freshItems.find((item) => item.title === "A Good Girl's Guide to Murder")?.homeSignal,
    ).toBe("S2 May 27");
    expect(freshItems.find((item) => item.title === "The Boroughs")?.homeSignal).toBe(
      "Netflix May 21",
    );
    expect(freshItems.find((item) => item.title === "House of the Dragon")?.homeSignal).toBe(
      "Returns Jun 21",
    );
    expect(freshItems.find((item) => item.title === "Rick and Morty")?.homeSignal).toBe(
      "S9 airing now",
    );
    expect(getHomeEditorialSeedItems("newOrBack", "2026-05-30").find(
      (item) => item.title === "The Boys",
    )?.homeSignal).toBe("S5 airing now");
    expect(getHomeEditorialSeedItems("newOrBack", "2026-05-30").find(
      (item) => item.title === "Euphoria",
    )?.homeSignal).toBe("S3 airing now");
    expect(getHomeEditorialSeedItems("newOrBack", "2026-05-30").find(
      (item) => item.title === "FROM",
    )?.homeSignal).toBe("MGM+ S4 airing now");
    expect(getHomeEditorialSeedItems("newOrBack", "2026-05-30").find(
      (item) => item.title === "M.I.A.",
    )?.homeSignal).toBe("Peacock May 7");
    expect(getHomeEditorialSeedItems("newOrBack", "2026-05-30").find(
      (item) => item.title === "Love Island USA",
    )?.homeSignal).toBe("Peacock Jun 2");
    expect(getHomeEditorialSeedItems("newOrBack", "2026-05-30").find(
      (item) => item.title === "Man on Fire",
    )?.homeSignal).toBe("Netflix Top 10");
    expect(getHomeEditorialSeedItems("newOrBack", "2026-05-30").find(
      (item) => item.title === "Murder Mindfully",
    )?.homeSignal).toBe("Netflix S2 now");
    expect(getHomeEditorialSeedItems("newOrBack", "2026-05-30").find(
      (item) => item.title === "Rafa",
    )?.homeSignal).toBe("Netflix May 29");
    expect(getHomeEditorialSeedItems("newOrBack", "2026-05-30").find(
      (item) => item.title === "Sweet Magnolias",
    )?.homeSignal).toBe("Netflix Jun 11");
    expect(getHomeEditorialSeedItems("newOrBack", "2026-05-30").find(
      (item) => item.title === "Avatar: The Last Airbender",
    )?.homeSignal).toBe("Netflix Jun 25");
    expect(getHomeEditorialSeedItems("newOrBack", "2026-05-30").find(
      (item) => item.title === "Elle",
    )?.homeSignal).toBe("Prime Jul 1");
    expect(getHomeEditorialSeedItems("newOrBack", "2026-05-30").find(
      (item) => item.title === "Maximum Pleasure Guaranteed",
    )?.homeSignal).toBe("Apple TV+ May 20");
    expect(getHomeEditorialSeedItems("newOrBack", "2026-05-30").find(
      (item) => item.title === "Cape Fear",
    )?.homeSignal).toBe("Apple TV+ Jun 5");
    expect(getHomeEditorialSeedItems("newOrBack", "2026-05-30").find(
      (item) => item.title === "The Bear",
    )?.homeSignal).toBe("FX/Hulu Jun 25");
    expect(getHomeEditorialSeedItems("newOrBack", "2026-05-30").find(
      (item) => item.title === "Not Suitable for Work",
    )?.homeSignal).toBe("Hulu Jun 2");
    expect(getHomeEditorialSeedItems("newOrBack", "2026-05-30").find(
      (item) => item.title === "The Testaments",
    )?.homeSignal).toBe("Finale May 27");
    expect(getHomeEditorialSeedItems("newOrBack", "2026-05-30").find(
      (item) => item.title === "The Beauty",
    )?.homeSignal).toBe("JustWatch chart #9");
    expect(getHomeEditorialSeedItems("newOrBack", "2026-05-30").find(
      (item) => item.title === "Dragon Striker",
    )?.homeSignal).toBe("Disney+ Jun 10");
    expect(
      freshItems.find((item) => item.title === "Sofia the First: Royal Magic")?.homeSignal,
    ).toBeUndefined();
    expect(
      getHomeEditorialSeedItems("newOrBack", "2026-05-29").find(
        (item) => item.title === "Sofia the First: Royal Magic",
      )?.homeSignal,
    ).toBe("Disney+ May 25");
  });

  it("can look up active editorial seed payloads by live catalog title", () => {
    expect(getHomeEditorialSeedItemByTitle("from", "2026-05-30")?.homeSignal).toBe(
      "MGM+ S4 airing now",
    );
    expect(getHomeEditorialSeedItemByTitle("m.i.a.", "2026-05-30")?.homeSignal).toBe(
      "Peacock May 7",
    );
    expect(getHomeEditorialSeedItemByTitle("love island usa", "2026-05-30")?.homeSignal).toBe(
      "Peacock Jun 2",
    );
    expect(getHomeEditorialSeedItemByTitle("Murder Mindfully", "2026-05-30")?.homeSignal).toBe(
      "Netflix S2 now",
    );
    expect(getHomeEditorialSeedItemByTitle("Rafa", "2026-05-30")?.homeSignal).toBe(
      "Netflix May 29",
    );
    expect(getHomeEditorialSeedItemByTitle("Sweet Magnolias", "2026-05-30")?.homeSignal).toBe(
      "Netflix Jun 11",
    );
    expect(
      getHomeEditorialSeedItemByTitle("avatar: the last airbender", "2026-05-30")?.homeSignal,
    ).toBe("Netflix Jun 25");
    expect(getHomeEditorialSeedItemByTitle("Elle", "2026-05-30")?.homeSignal).toBe(
      "Prime Jul 1",
    );
    expect(getHomeEditorialSeedItemByTitle("Cape Fear", "2026-05-30")?.homeSignal).toBe(
      "Apple TV+ Jun 5",
    );
    expect(getHomeEditorialSeedItemByTitle("Rafa", "2026-05-28")).toBeNull();
    expect(getHomeEditorialSeedItemByTitle("The Testaments", "2026-05-30")?.homeSignal).toBe(
      "Finale May 27",
    );
    expect(getHomeEditorialSeedItemByTitle("The Beauty", "2026-05-30")?.homeSignal).toBe(
      "JustWatch chart #9",
    );
    expect(getHomeEditorialSeedItemByTitle("The Testaments", "2026-05-26")).toBeNull();
    expect(getHomeEditorialSeedItemByTitle("FROM", "2026-07-13")).toBeNull();
  });

  it("requires visible freshness signals to stay title-gated", () => {
    const signaledTitles = SEED_GROUPS.flatMap((group) =>
      getHomeEditorialSeedEntries(group, "2026-05-28")
        .filter((entry) => entry.item.homeSignal?.trim())
        .map((entry) => entry.title),
    );

    expect(signaledTitles).toEqual(expect.arrayContaining(["Widow's Bay", "Rick and Morty"]));
    expect(signaledTitles).not.toContain("Severance");
    expect(auditHomeEditorialSeeds("2026-05-28T12:00:00.000Z").findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ issue: "signal_missing_title_window" }),
      ]),
    );
  });

  it("rotates curated seed order daily without changing the curated set", () => {
    const today = getHomeEditorialSeedTitles("newOrBack", "2026-05-30");
    const tomorrow = getHomeEditorialSeedTitles("newOrBack", "2026-05-31");

    expect(today).not.toEqual(tomorrow);
    expect(new Set(today)).toEqual(new Set(tomorrow));
    expect(today.length).toBeGreaterThan(4);
  });

  it("keeps every curated title traceable to researched sources", () => {
    const knownSourceIds = new Set(Object.keys(HOME_EDITORIAL_RESEARCH_SOURCES));
    SEED_GROUPS.forEach((group) => {
      getHomeEditorialSeedTitles(group, "2026-05-28").forEach((title) => {
        const provenance = getHomeEditorialSeedProvenance(title);
        expect(provenance).not.toBeNull();
        expectRecentResearchDate(provenance?.researchedAt);
        expect(provenance?.note).toMatch(/\S/);
        expect(provenance?.sourceIds.length).toBeGreaterThanOrEqual(2);
        provenance?.sourceIds.forEach((sourceId) => {
          expect(knownSourceIds.has(sourceId)).toBe(true);
          expect(HOME_EDITORIAL_RESEARCH_SOURCES[sourceId].url).toMatch(/^https:\/\//);
          expectRecentResearchDate(HOME_EDITORIAL_RESEARCH_SOURCES[sourceId].checkedAt);
        });
      });
    });
  });

  it("returns provenance entries only inside the active review window", () => {
    const entries = getHomeEditorialSeedEntries("newOrBack", "2026-05-28");
    expect(entries.map((entry) => entry.title)).toContain("Spider-Noir");
    expect(entries.every((entry) => entry.item.title === entry.title)).toBe(true);
    expect(entries.every((entry) => entry.provenance.sourceIds.includes("tmdb_live_catalog"))).toBe(true);
    expect(getHomeEditorialSeedEntries("newOrBack", "2026-07-13")).toEqual([]);
  });

  it("anchors marquee return signals to official network sources", () => {
    expect(getHomeEditorialSeedProvenance("Off Campus")?.sourceIds).toContain(
      "about_amazon_off_campus",
    );
    expect(getHomeEditorialSeedProvenance("Dutton Ranch")?.sourceIds).toContain(
      "paramount_dutton_ranch_launch",
    );
    expect(getHomeEditorialSeedProvenance("Spider-Noir")?.sourceIds).toContain(
      "marvel_spider_noir_teaser",
    );
    expect(getHomeEditorialSeedProvenance("The Four Seasons")?.sourceIds).toContain(
      "netflix_tudum_four_seasons_s2",
    );
    expect(getHomeEditorialSeedProvenance("House of the Dragon")?.sourceIds).toContain(
      "wbd_house_dragon_s3",
    );
    expect(getHomeEditorialSeedProvenance("Rick and Morty")?.sourceIds).toContain(
      "wbd_rick_morty_s9",
    );
    expect(getHomeEditorialSeedProvenance("A Good Girl's Guide to Murder")?.sourceIds).toContain(
      "netflix_tudum_good_girl_s2",
    );
    expect(getHomeEditorialSeedProvenance("The Boroughs")?.sourceIds).toContain(
      "netflix_tudum_boroughs",
    );
    expect(getHomeEditorialSeedProvenance("Man on Fire")?.sourceIds).toContain(
      "netflix_tudum_man_on_fire",
    );
    expect(getHomeEditorialSeedProvenance("Murder Mindfully")?.sourceIds).toContain(
      "netflix_murder_mindfully_series",
    );
    expect(getHomeEditorialSeedProvenance("Maximum Pleasure Guaranteed")?.sourceIds).toContain(
      "apple_tv_maximum_pleasure_series",
    );
    expect(getHomeEditorialSeedProvenance("Deli Boys")?.sourceIds).toContain(
      "hulu_deli_boys_s2",
    );
    expect(getHomeEditorialSeedProvenance("The Beauty")?.sourceIds).toContain(
      "disney_plus_the_beauty_fx",
    );
    expect(getHomeEditorialSeedProvenance("Not Suitable for Work")?.sourceIds).toContain(
      "hulu_not_suitable_work_press",
    );
    expect(getHomeEditorialSeedProvenance("The Bear")?.sourceIds).toContain(
      "abc_the_bear_s5_watch",
    );
    expect(getHomeEditorialSeedProvenance("Lord of the Flies")?.sourceIds).toContain(
      "netflix_tudum_lord_flies",
    );
    expect(getHomeEditorialSeedProvenance("Legends")?.sourceIds).toContain(
      "netflix_tudum_legends",
    );
    expect(getHomeEditorialSeedProvenance("Nemesis")?.sourceIds).toContain(
      "netflix_tudum_nemesis",
    );
    expect(getHomeEditorialSeedProvenance("Star City")?.sourceIds).toContain(
      "apple_tv_star_city_press",
    );
    expect(getHomeEditorialSeedProvenance("For All Mankind")?.sourceIds).toContain(
      "apple_tv_for_all_mankind_s6_press",
    );
    expect(getHomeEditorialSeedProvenance("Cape Fear")?.sourceIds).toContain(
      "apple_tv_cape_fear_press",
    );
    expect(getHomeEditorialSeedProvenance("The Boys")?.sourceIds).toContain(
      "prime_video_the_boys_series",
    );
    expect(getHomeEditorialSeedProvenance("Euphoria")?.sourceIds).toContain(
      "hbo_euphoria_series",
    );
    expect(getHomeEditorialSeedProvenance("Widow's Bay")?.sourceIds).toContain(
      "apple_tv_widows_bay_series",
    );
    expect(getHomeEditorialSeedProvenance("FROM")?.sourceIds).toContain(
      "mgm_plus_from_series",
    );
    expect(getHomeEditorialSeedProvenance("M.I.A.")?.sourceIds).toContain(
      "peacock_mia_series",
    );
    expect(getHomeEditorialSeedProvenance("Love Island USA")?.sourceIds).toContain(
      "peacock_love_island_usa_s8",
    );
    expect(getHomeEditorialSeedProvenance("Avatar: The Last Airbender")?.sourceIds).toContain(
      "netflix_tudum_avatar_last_airbender_s2",
    );
    expect(getHomeEditorialSeedProvenance("Elle")?.sourceIds).toContain(
      "about_amazon_elle_prime_video",
    );
    expect(getHomeEditorialSeedProvenance("Dragon Striker")?.sourceIds).toContain(
      "disney_branded_dragon_striker",
    );
    expect(getHomeEditorialSeedProvenance("Hacks")?.sourceIds).toContain(
      "wbd_hacks_s5_finale",
    );
  });

  it("requires current-demand picks to have an independent demand signal source", () => {
    const demandSourceIds = new Set(HOME_EDITORIAL_DEMAND_SOURCE_IDS);
    const currentDemand = getHomeEditorialSeedEntries("newOrBack", "2026-05-29").filter(
      (entry) => entry.provenance.rationale === "current_demand",
    );

    expect(currentDemand.length).toBeGreaterThanOrEqual(8);
    currentDemand.forEach((entry) => {
      expect(entry.provenance.sourceIds.some((sourceId) => demandSourceIds.has(sourceId))).toBe(
        true,
      );
    });
    expect(getHomeEditorialSeedProvenance("Star City")?.sourceIds).toEqual(
      expect.arrayContaining([
        "apple_tv_star_city_press",
        "thewrap_may29_weekend",
        "rotten_tomatoes_may_streaming",
      ]),
    );
    expect(getHomeEditorialSeedProvenance("For All Mankind")?.sourceIds).toEqual(
      expect.arrayContaining([
        "apple_tv_for_all_mankind_s6_press",
        "tvline_for_all_mankind_s5_finale",
        "toms_guide_star_city_watch",
      ]),
    );
    expect(getHomeEditorialSeedProvenance("Cape Fear")?.sourceIds).toEqual(
      expect.arrayContaining([
        "apple_tv_cape_fear_press",
        "toms_guide_apple_tv_june",
        "gamesradar_2026_new_tv",
        "tvline_june_2026_calendar",
        "rotten_tomatoes_cape_fear",
      ]),
    );
    expect(getHomeEditorialSeedProvenance("The Boroughs")?.sourceIds).toEqual(
      expect.arrayContaining([
        "netflix_tudum_boroughs",
        "rotten_tomatoes_boroughs",
        "toms_guide_netflix_top10_may26",
      ]),
    );
    expect(getHomeEditorialSeedProvenance("Man on Fire")?.sourceIds).toEqual(
      expect.arrayContaining([
        "netflix_tudum_man_on_fire",
        "toms_guide_netflix_top10_may26",
      ]),
    );
    expect(getHomeEditorialSeedProvenance("Murder Mindfully")?.sourceIds).toEqual(
      expect.arrayContaining([
        "netflix_murder_mindfully_series",
        "justwatch_murder_mindfully_may30",
        "toms_guide_netflix_may25",
      ]),
    );
    expect(getHomeEditorialSeedProvenance("Rick and Morty")?.sourceIds).toContain(
      "tvline_may24_week",
    );
    expect(getHomeEditorialSeedProvenance("The Boys")?.sourceIds).toEqual(
      expect.arrayContaining([
        "prime_video_the_boys_series",
        "reelgood_us_streaming_charts_may28",
        "justwatch_us_tv_charts_may30",
      ]),
    );
    expect(getHomeEditorialSeedProvenance("Spider-Noir")?.sourceIds).toContain(
      "justwatch_us_daily_streaming_charts_may31",
    );
    expect(getHomeEditorialSeedProvenance("Off Campus")?.sourceIds).toContain(
      "justwatch_us_daily_streaming_charts_may31",
    );
    expect(getHomeEditorialSeedProvenance("Dutton Ranch")?.sourceIds).toContain(
      "paramount_dutton_ranch_launch",
    );
    expect(getHomeEditorialSeedProvenance("Dutton Ranch")?.sourceIds).toContain(
      "justwatch_us_daily_streaming_charts_may31",
    );
    expect(getHomeEditorialSeedProvenance("Your Friends & Neighbors")?.sourceIds).toEqual(
      expect.arrayContaining([
        "apple_tv_your_friends_neighbors_series",
        "rotten_tomatoes_premiere_calendar",
      ]),
    );
    expect(getHomeEditorialSeedProvenance("Your Friends & Neighbors")?.rationale).toBe(
      "current_demand",
    );
    expect(getHomeEditorialSeedProvenance("The Beauty")?.sourceIds).toEqual(
      expect.arrayContaining([
        "disney_plus_the_beauty_fx",
        "justwatch_us_daily_streaming_charts_may31",
        "justwatch_us_daily_streaming_charts_jun1",
        "justwatch_the_beauty_may30",
      ]),
    );
    expect(getHomeEditorialSeedProvenance("Euphoria")?.sourceIds).toEqual(
      expect.arrayContaining([
        "hbo_euphoria_series",
        "reelgood_us_streaming_charts_may28",
        "flixpatrol_us_streaming_may29",
        "justwatch_us_tv_charts_may30",
      ]),
    );
    expect(getHomeEditorialSeedProvenance("The Pitt")?.sourceIds).toContain(
      "flixpatrol_us_streaming_may29",
    );
    expect(getHomeEditorialSeedProvenance("Hacks")?.sourceIds).toContain(
      "flixpatrol_us_streaming_may29",
    );
    expect(getHomeEditorialSeedProvenance("Widow's Bay")?.sourceIds).toEqual(
      expect.arrayContaining([
        "apple_tv_widows_bay_series",
        "reelgood_us_streaming_charts_may28",
        "justwatch_widows_bay_may30",
      ]),
    );
    expect(getHomeEditorialSeedProvenance("FROM")?.sourceIds).toEqual(
      expect.arrayContaining([
        "mgm_plus_from_series",
        "justwatch_from_may30",
        "justwatch_us_daily_streaming_charts_may31",
      ]),
    );
    expect(getHomeEditorialSeedProvenance("M.I.A.")?.sourceIds).toEqual(
      expect.arrayContaining(["peacock_mia_series", "toms_guide_mia_watch"]),
    );
    expect(getHomeEditorialSeedProvenance("Love Island USA")?.sourceIds).toEqual(
      expect.arrayContaining([
        "peacock_love_island_usa_s8",
        "toms_guide_peacock_june",
      ]),
    );
    expect(getHomeEditorialSeedProvenance("Avatar: The Last Airbender")?.sourceIds).toEqual(
      expect.arrayContaining([
        "netflix_tudum_avatar_last_airbender_s2",
        "toms_guide_netflix_june",
      ]),
    );
    expect(getHomeEditorialSeedProvenance("Elle")?.sourceIds).toEqual(
      expect.arrayContaining([
        "about_amazon_elle_prime_video",
        "rotten_tomatoes_premiere_calendar",
      ]),
    );
    expect(getHomeEditorialSeedProvenance("Maximum Pleasure Guaranteed")?.sourceIds).toEqual(
      expect.arrayContaining([
        "apple_tv_maximum_pleasure_series",
        "rotten_tomatoes_maximum_pleasure_s1",
        "tvline_maximum_pleasure_review",
      ]),
    );
    expect(getHomeEditorialSeedProvenance("The Bear")?.sourceIds).toEqual(
      expect.arrayContaining(["abc_the_bear_s5_watch", "toms_guide_hulu_june"]),
    );
    expect(getHomeEditorialSeedProvenance("Not Suitable for Work")?.sourceIds).toEqual(
      expect.arrayContaining([
        "hulu_not_suitable_work_press",
        "toms_guide_hulu_june",
        "justwatch_us_daily_streaming_charts_jun1",
      ]),
    );
    expect(getHomeEditorialSeedProvenance("Dragon Striker")?.sourceIds).toEqual(
      expect.arrayContaining([
        "disney_branded_dragon_striker",
        "toms_guide_disney_june",
      ]),
    );
    expect(getHomeEditorialSeedProvenance("Spider-Noir")?.sourceIds).toContain(
      "gamesradar_may29_weekend",
    );
    expect(getHomeEditorialSeedProvenance("The Four Seasons")?.sourceIds).toContain(
      "gamesradar_may29_weekend",
    );
    expect(getHomeEditorialSeedProvenance("Star City")?.sourceIds).toContain(
      "gamesradar_may29_weekend",
    );
    expect(getHomeEditorialSeedProvenance("Off Campus")?.sourceIds).toContain(
      "reelgood_us_streaming_charts_may28",
    );
    expect(getHomeEditorialSeedProvenance("Dutton Ranch")?.sourceIds).toContain(
      "reelgood_us_streaming_charts_may28",
    );
    expect(getHomeEditorialSeedProvenance("The Boroughs")?.sourceIds).toContain(
      "reelgood_us_streaming_charts_may28",
    );
    expect(getHomeEditorialSeedProvenance("The Boroughs")?.sourceIds).toContain(
      "flixpatrol_us_streaming_may29",
    );
    expect(getHomeEditorialSeedProvenance("The Four Seasons")?.sourceIds).toContain(
      "flixpatrol_us_streaming_may29",
    );
    expect(getHomeEditorialSeedProvenance("A Good Girl's Guide to Murder")?.sourceIds).toContain(
      "flixpatrol_us_streaming_may29",
    );
    expect(getHomeEditorialSeedProvenance("Man on Fire")?.sourceIds).toContain(
      "flixpatrol_us_streaming_may29",
    );
    expect(getHomeEditorialSeedProvenance("Nemesis")?.sourceIds).toContain(
      "reelgood_us_streaming_charts_may28",
    );
    expect(getHomeEditorialSeedProvenance("Nemesis")?.sourceIds).toContain(
      "flixpatrol_us_streaming_may29",
    );
    expect(getHomeEditorialSeedProvenance("Sofia the First: Royal Magic")?.sourceIds).toContain(
      "flixpatrol_us_streaming_may30",
    );
    expect(getHomeEditorialSeedProvenance("Love Island USA")?.sourceIds).toEqual(
      expect.arrayContaining([
        "peacock_love_island_usa_s8",
        "nbcuniversal_love_island_usa_s8_press",
        "toms_guide_peacock_june",
        "justwatch_us_daily_streaming_charts_jun1",
      ]),
    );
    expect(HOME_EDITORIAL_DEMAND_SOURCE_IDS).toContain(
      "flixpatrol_us_streaming_may29",
    );
    expect(HOME_EDITORIAL_DEMAND_SOURCE_IDS).toContain(
      "flixpatrol_us_streaming_may30",
    );
    expect(HOME_EDITORIAL_DEMAND_SOURCE_IDS).toContain("justwatch_the_beauty_may30");
    expect(HOME_EDITORIAL_DEMAND_SOURCE_IDS).toContain("toms_guide_peacock_june");
    expect(HOME_EDITORIAL_DEMAND_SOURCE_IDS).toContain("toms_guide_netflix_june");
    expect(HOME_EDITORIAL_DEMAND_SOURCE_IDS).toContain("toms_guide_apple_tv_june");
    expect(auditHomeEditorialSeeds("2026-05-29T12:00:00.000Z").findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ issue: "current_demand_missing_demand_source" }),
      ]),
    );
  });

  it("marks active current-demand seeds as source-verified with compact release signals", () => {
    const currentDemand = getHomeEditorialSeedEntries("newOrBack", "2026-05-30").filter(
      (entry) => entry.provenance.rationale === "current_demand",
    );
    const audit = auditHomeEditorialSeeds("2026-06-01T12:00:00.000Z");

    expect(currentDemand.map((entry) => entry.title)).toEqual(
      expect.arrayContaining([
        "Off Campus",
        "Dutton Ranch",
        "Widow's Bay",
        "Spider-Noir",
        "The Four Seasons",
        "A Good Girl's Guide to Murder",
        "The Boroughs",
        "For All Mankind",
        "Cape Fear",
        "Man on Fire",
        "Murder Mindfully",
        "Rafa",
        "Sweet Magnolias",
        "Avatar: The Last Airbender",
        "Elle",
        "Deli Boys",
        "The Testaments",
        "The Beauty",
        "Lord of the Flies",
        "Legends",
        "Nemesis",
        "House of the Dragon",
        "Rick and Morty",
        "Star City",
        "Maximum Pleasure Guaranteed",
        "The Boys",
        "FROM",
        "M.I.A.",
        "Euphoria",
        "Your Friends & Neighbors",
        "The Bear",
        "Not Suitable for Work",
        "Love Island USA",
        "Dragon Striker",
      ]),
    );
    expect(currentDemand.every((entry) => entry.item.editorialTier === "verified_current")).toBe(
      true,
    );
    expect(currentDemand.every((entry) => entry.item.homeSignal?.trim())).toBe(true);
    expect(audit.activeCurrentDemandNonfictionCount).toBeGreaterThanOrEqual(1);
    expect(
      currentDemand.find((entry) => entry.title === "A Good Girl's Guide to Murder")?.provenance
        .sourceIds,
    ).toContain("netflix_tudum_good_girl_s2");
    expect(
      currentDemand.find((entry) => entry.title === "The Boroughs")?.provenance.sourceIds,
    ).toContain("netflix_tudum_boroughs");
    expect(
      currentDemand.find((entry) => entry.title === "Man on Fire")?.provenance.sourceIds,
    ).toContain("netflix_tudum_man_on_fire");
    expect(
      currentDemand.find((entry) => entry.title === "Murder Mindfully")?.provenance.sourceIds,
    ).toContain("justwatch_murder_mindfully_may30");
    expect(
      currentDemand.find((entry) => entry.title === "Rafa")?.provenance.sourceIds,
    ).toEqual(
      expect.arrayContaining([
        "about_netflix_rafa_may29",
        "netflix_rafa_series",
        "rotten_tomatoes_rafa",
        "flixpatrol_rafa_may29",
      ]),
    );
    expect(
      currentDemand.find((entry) => entry.title === "Sweet Magnolias")?.provenance.sourceIds,
    ).toEqual(
      expect.arrayContaining([
        "netflix_tudum_sweet_magnolias_s5",
        "toms_guide_netflix_june",
      ]),
    );
    expect(
      currentDemand.find((entry) => entry.title === "Avatar: The Last Airbender")?.provenance
        .sourceIds,
    ).toEqual(
      expect.arrayContaining([
        "netflix_tudum_avatar_last_airbender_s2",
        "toms_guide_netflix_june",
      ]),
    );
    expect(
      currentDemand.find((entry) => entry.title === "Elle")?.provenance.sourceIds,
    ).toEqual(
      expect.arrayContaining([
        "about_amazon_elle_prime_video",
        "rotten_tomatoes_premiere_calendar",
      ]),
    );
    expect(
      currentDemand.find((entry) => entry.title === "Deli Boys")?.provenance.sourceIds,
    ).toContain("hulu_deli_boys_s2");
    expect(
      currentDemand.find((entry) => entry.title === "The Testaments")?.provenance.sourceIds,
    ).toContain("hulu_testaments_guide");
    expect(
      currentDemand.find((entry) => entry.title === "The Beauty")?.provenance.sourceIds,
    ).toEqual(
      expect.arrayContaining([
        "disney_plus_the_beauty_fx",
        "justwatch_the_beauty_may30",
      ]),
    );
    expect(
      currentDemand.find((entry) => entry.title === "Star City")?.provenance.sourceIds,
    ).toContain("apple_tv_star_city_press");
    expect(
      currentDemand.find((entry) => entry.title === "For All Mankind")?.provenance
        .sourceIds,
    ).toEqual(
      expect.arrayContaining([
        "apple_tv_for_all_mankind_s6_press",
        "tvline_for_all_mankind_s5_finale",
      ]),
    );
    expect(
      currentDemand.find((entry) => entry.title === "Cape Fear")?.provenance.sourceIds,
    ).toEqual(
      expect.arrayContaining([
        "apple_tv_cape_fear_press",
        "toms_guide_apple_tv_june",
        "gamesradar_2026_new_tv",
      ]),
    );
    expect(
      currentDemand.find((entry) => entry.title === "Widow's Bay")?.provenance.sourceIds,
    ).toContain("justwatch_widows_bay_may30");
    expect(
      currentDemand.find((entry) => entry.title === "Maximum Pleasure Guaranteed")?.provenance
        .sourceIds,
    ).toContain("tvline_maximum_pleasure_review");
    expect(
      currentDemand.find((entry) => entry.title === "FROM")?.provenance.sourceIds,
    ).toContain("justwatch_from_may30");
    expect(
      currentDemand.find((entry) => entry.title === "Not Suitable for Work")?.provenance
        .sourceIds,
    ).toContain("hulu_not_suitable_work_press");
    expect(
      currentDemand.find((entry) => entry.title === "Dragon Striker")?.provenance.sourceIds,
    ).toContain("toms_guide_disney_june");
    expect(
      currentDemand.find((entry) => entry.title === "Dutton Ranch")?.provenance
        .sourceIds,
    ).toContain("justwatch_us_daily_streaming_charts_may31");
  });

  it("can isolate current-demand seeds for live heat fallback", () => {
    const demandTitles = getHomeEditorialCurrentDemandSeedItems("2026-05-30").map(
      (item) => item.title,
    );

    expect(demandTitles).toEqual(
      expect.arrayContaining([
        "Spider-Noir",
        "Dutton Ranch",
        "Widow's Bay",
        "Off Campus",
        "Star City",
        "For All Mankind",
        "Cape Fear",
        "Maximum Pleasure Guaranteed",
        "The Four Seasons",
        "A Good Girl's Guide to Murder",
        "The Boroughs",
        "Man on Fire",
        "Murder Mindfully",
        "Rafa",
        "Sweet Magnolias",
        "Avatar: The Last Airbender",
        "Elle",
        "Deli Boys",
        "The Testaments",
        "The Beauty",
        "The Bear",
        "Not Suitable for Work",
        "House of the Dragon",
        "Rick and Morty",
        "The Boys",
        "FROM",
        "Euphoria",
        "Your Friends & Neighbors",
        "Dragon Striker",
        "Hacks",
      ]),
    );
    expect(demandTitles.slice(0, 8)).toEqual(
      expect.arrayContaining(["Spider-Noir", "Hacks", "The Boroughs"]),
    );
    expect(getHomeEditorialDemandConfidenceScore("The Beauty")).toBeGreaterThan(
      getHomeEditorialDemandConfidenceScore("For All Mankind"),
    );
    expect(getHomeEditorialDemandConfidenceScore("Spider-Noir")).toBeGreaterThan(
      getHomeEditorialDemandConfidenceScore("Man on Fire"),
    );
    expect(getHomeEditorialDemandConfidenceScore("Hacks")).toBeGreaterThan(
      getHomeEditorialDemandConfidenceScore("Man on Fire"),
    );
  });

  it("keeps the current JustWatch daily top 10 machine-readable and fully covered", () => {
    const chartTitles = [...HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART_TITLES];
    const activeDemandTitles = new Set(
      getHomeEditorialCurrentDemandSeedItems("2026-07-02").map((item) => item.title),
    );

    expect(HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART).toMatchObject({
      checkedAt: "2026-07-02",
      country: "US",
      maxAgeDays: 7,
      period: "daily",
      sourceId: "justwatch_us_daily_streaming_charts_jul2",
    });
    expect(chartTitles).toEqual([
      "Widow's Bay",
      "The Bear",
      "I Will Find You",
      "FROM",
      "House of the Dragon",
      "X-Men '97",
      "Maximum Pleasure Guaranteed",
      "Elle",
      "Silo",
      "The Agency",
    ]);
    chartTitles.forEach((title, index) => {
      expect(activeDemandTitles.has(title)).toBe(true);
      expect(getHomeEditorialDailyChartRank(title)).toBe(index + 1);
      expect(getHomeEditorialSeedProvenance(title)?.sourceIds).toContain(
        "justwatch_us_daily_streaming_charts_jul2",
      );
    });
    expect(getHomeEditorialDailyChartRank("Not Suitable for Work")).toBeNull();
    expect(getHomeEditorialDailyChartRank("For All Mankind")).toBeNull();
    expect(getHomeEditorialDemandConfidenceScore("Widow's Bay")).toBeGreaterThan(
      getHomeEditorialDemandConfidenceScore("For All Mankind"),
    );
    expect(getHomeEditorialDemandConfidenceScore("FROM")).toBeGreaterThan(
      getHomeEditorialDemandConfidenceScore("The Boys"),
    );
    expect(auditHomeEditorialSeeds("2026-07-02T12:00:00.000Z").findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ issue: "daily_chart_snapshot_stale" }),
        expect.objectContaining({ issue: "daily_chart_title_missing_seed" }),
        expect.objectContaining({ issue: "daily_chart_title_missing_source" }),
      ]),
    );
  });

  it("fails the editorial audit when the current chart snapshot gets stale", () => {
    const audit = auditHomeEditorialSeeds("2026-07-10T12:00:00.000Z");

    expect(audit.healthy).toBe(false);
    expect(audit.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issue: "daily_chart_snapshot_stale",
          sourceId: "justwatch_us_daily_streaming_charts_jul2",
        }),
      ]),
    );
  });

  it("warns before the current chart snapshot crosses its freshness window", () => {
    const audit = auditHomeEditorialSeeds("2026-07-08T12:00:00.000Z");

    expect(audit.healthy).toBe(true);
    expect(audit.findings).toEqual([]);
    expect(audit.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issue: "daily_chart_snapshot_expires_soon",
          effectiveAt: "2026-07-10",
          daysUntil: 2,
          detail: expect.stringContaining(
            "Affected daily-chart titles: Widow's Bay, The Bear",
          ),
          expiringTitles: [...HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART_TITLES],
          findings: [
            expect.objectContaining({
              issue: "daily_chart_snapshot_stale",
              sourceId: "justwatch_us_daily_streaming_charts_jul2",
            }),
          ],
        }),
      ]),
    );
  });

  it("maps researched editorial seeds into provider-specific rooms", () => {
    expect(
      getHomeEditorialProviderSeedItems("netflix", "2026-05-28").map(
        (item) => item.title,
      ),
    ).toEqual(
      expect.arrayContaining([
        "A Good Girl's Guide to Murder",
        "The Boroughs",
        "Man on Fire",
        "Adolescence",
        "Lord of the Flies",
      ]),
    );
    expect(
      getHomeEditorialProviderSeedItems("netflix", "2026-05-30").map(
        (item) => item.title,
      ),
    ).toEqual(expect.arrayContaining(["Murder Mindfully", "Rafa", "Sweet Magnolias"]));
    expect(
      getHomeEditorialProviderSeedItems("netflix", "2026-05-30").map(
        (item) => item.title,
      ),
    ).toContain("Avatar: The Last Airbender");
    expect(
      getHomeEditorialProviderSeedItems("netflix", "2026-05-28").map(
        (item) => item.title,
      ),
    ).not.toContain("Rafa");
    expect(getHomeEditorialPlatformKeyByTitle("Rafa", "2026-05-30")).toBe(
      "netflix",
    );
    expect(getHomeEditorialPlatformKeyByTitle("Sweet Magnolias", "2026-05-30")).toBe(
      "netflix",
    );
    expect(getHomeEditorialPlatformKeyByTitle("Avatar: The Last Airbender", "2026-05-30")).toBe(
      "netflix",
    );
    expect(
      getHomeEditorialSeedEntries("newOrBack", "2026-05-30")
        .filter((entry) => entry.provenance.rationale === "current_demand")
        .map((entry) => entry.item.genreIds[0]),
    ).toContain(99);
    expect(
      getHomeEditorialProviderSeedItems("apple_tv", "2026-05-28").map(
        (item) => item.title,
      ),
    ).toEqual(expect.arrayContaining(["Widow's Bay", "Severance"]));
    expect(
      getHomeEditorialProviderSeedItems("apple_tv", "2026-05-30").map(
        (item) => item.title,
      ),
    ).toEqual(
      expect.arrayContaining([
        "Maximum Pleasure Guaranteed",
        "Star City",
        "For All Mankind",
        "Cape Fear",
      ]),
    );
    expect(getHomeEditorialPlatformKeyByTitle("Maximum Pleasure Guaranteed", "2026-05-30")).toBe(
      "apple_tv",
    );
    expect(getHomeEditorialPlatformKeyByTitle("For All Mankind", "2026-05-30")).toBe(
      "apple_tv",
    );
    expect(getHomeEditorialPlatformKeyByTitle("Cape Fear", "2026-05-30")).toBe(
      "apple_tv",
    );
    expect(getHomeEditorialPlatformKeyByTitle("Murder Mindfully", "2026-05-30")).toBe(
      "netflix",
    );
    expect(
      getHomeEditorialProviderSeedItems("max", "2026-05-28").map(
        (item) => item.title,
      ),
    ).toEqual(
      expect.arrayContaining([
        "House of the Dragon",
        "Rick and Morty",
        "The Pitt",
        "Euphoria",
      ]),
    );
    expect(
      getHomeEditorialProviderSeedItems("prime_video", "2026-05-30").map(
        (item) => item.title,
      ),
    ).toEqual(expect.arrayContaining(["Off Campus", "The Boys", "Elle"]));
    expect(getHomeEditorialPlatformKeyByTitle("Elle", "2026-05-30")).toBe("prime_video");
    expect(getHomeEditorialProviderSeedItems("disney_plus", "2026-05-30").map(
      (item) => item.title,
    )).toEqual(
      expect.arrayContaining([
        "Andor",
        "Dragon Striker",
        "Sofia the First: Royal Magic",
        "Best of the World with Antoni Porowski",
        "The Simpsons",
      ]),
    );
    expect(getHomeEditorialPlatformKeyByTitle("The Simpsons", "2026-05-30")).toBe(
      "disney_plus",
    );
    expect(getHomeEditorialProviderSeedItems("disney_plus", "2026-05-30")[0]?.title).toBe(
      "Dragon Striker",
    );
    expect(
      getHomeEditorialProviderSeedItems("disney_plus", "2026-05-30").find(
        (item) => item.title === "Dragon Striker",
      )?.homeSignal,
    ).toBe("Disney+ Jun 10");
    expect(getHomeEditorialPlatformKeyByTitle("Dragon Striker", "2026-05-30")).toBe(
      "disney_plus",
    );
    expect(
      getHomeEditorialPlatformKeyByTitle(
        "Best of the World with Antoni Porowski",
        "2026-05-30",
      ),
    ).toBe("disney_plus");
    expect(
      getHomeEditorialProviderSeedItems("hulu", "2026-05-28").map(
        (item) => item.title,
      ),
    ).toContain("Deli Boys");
    expect(
      getHomeEditorialProviderSeedItems("hulu", "2026-05-30").map(
        (item) => item.title,
      ),
    ).toContain("The Testaments");
    expect(
      getHomeEditorialProviderSeedItems("hulu", "2026-05-30").map(
        (item) => item.title,
      ),
    ).toContain("The Beauty");
    expect(
      getHomeEditorialProviderSeedItems("hulu", "2026-05-26").map(
        (item) => item.title,
      ),
    ).not.toContain("The Testaments");
    expect(
      getHomeEditorialProviderSeedItems("hulu", "2026-05-30").find(
        (item) => item.title === "Not Suitable for Work",
      )?.homeSignal,
    ).toBe("Hulu Jun 2");
    expect(getHomeEditorialPlatformKeyByTitle("The Testaments", "2026-05-30")).toBe(
      "hulu",
    );
    expect(getHomeEditorialPlatformKeyByTitle("The Beauty", "2026-05-30")).toBe("hulu");
    expect(
      getHomeEditorialProviderSeedItems("hulu", "2026-05-30").find(
        (item) => item.title === "The Bear",
      )?.homeSignal,
    ).toBe("FX/Hulu Jun 25");
    expect(getHomeEditorialPlatformKeyByTitle("Not Suitable for Work", "2026-05-30")).toBe(
      "hulu",
    );
    expect(
      getHomeEditorialProviderSeedItems("peacock", "2026-05-30").map(
        (item) => item.title,
      ),
    ).toEqual(expect.arrayContaining(["Love Island USA", "M.I.A."]));
    expect(getHomeEditorialProviderSeedItems("peacock", "2026-05-30")[0]?.title).toBe(
      "Love Island USA",
    );
    expect(getHomeEditorialPlatformKeyByTitle("Love Island USA", "2026-05-30")).toBe(
      "peacock",
    );
    expect(
      getHomeEditorialProviderSeedItems("paramount_plus", "2026-05-28").map(
        (item) => item.title,
      ),
    ).toContain("Dutton Ranch");
    expect(
      getHomeEditorialProviderSeedItems("mgm_plus", "2026-05-30").map(
        (item) => item.title,
      ),
    ).toContain("FROM");
  });

  it("expires provider room seeds with their editorial source windows", () => {
    expect(getHomeEditorialProviderSeedItems("netflix", "2026-09-01")).toEqual([]);
    expect(getHomeEditorialProviderSeedItems("max", "2026-09-01")).toEqual([]);
    expect(getHomeEditorialProviderSeedItems("peacock", "2026-09-01")).toEqual([]);
    expect(getHomeEditorialProviderSeedItems("mgm_plus", "2026-09-01")).toEqual([]);
  });

  it("audits editorial fallbacks as sourced, bounded, and current", () => {
    const audit = auditHomeEditorialSeeds("2026-06-01T12:00:00.000Z");

    expect(audit.healthy).toBe(true);
    expect(audit.findings).toEqual([]);
    expect(audit.activeCurrentDemandCount).toBeGreaterThanOrEqual(8);
    expect(audit.activeCurrentDemandPlatformCount).toBeGreaterThanOrEqual(5);
    expect(audit.activeCurrentDemandPrimaryGenreCount).toBeGreaterThanOrEqual(4);
    expect(audit.activeCurrentDemandNonfictionCount).toBeGreaterThanOrEqual(1);
    expect(audit.warnings).toEqual([]);
  });

  it("keeps late-June current-demand coverage broad enough after early-June launches", () => {
    const audit = auditHomeEditorialSeeds("2026-06-22T12:00:00.000Z");

    expect(audit.healthy).toBe(true);
    expect(audit.activeCurrentDemandCount).toBeGreaterThanOrEqual(8);
    expect(audit.activeCurrentDemandPlatformCount).toBeGreaterThanOrEqual(5);
    expect(audit.activeCurrentDemandNonfictionCount).toBeGreaterThanOrEqual(1);
    expect(audit.findings).toEqual([]);
    expect(audit.warnings).toEqual([
      expect.objectContaining({
        issue: "current_demand_coverage_expires_soon",
        effectiveAt: "2026-07-13",
        daysUntil: 21,
        detail: expect.stringContaining(
          "Titles dropping out before then: Widow's Bay, FROM",
        ),
        expiringTitles: expect.arrayContaining(["The Bear", "Cape Fear"]),
        findings: expect.arrayContaining([
          expect.objectContaining({
            issue: "current_demand_too_few_active_titles",
          }),
        ]),
      }),
    ]);
  });

  it("forecasts when the researched current-demand shelf is about to expire", () => {
    const audit = auditHomeEditorialSeeds("2026-06-13T12:00:00.000Z");

    expect(audit.healthy).toBe(true);
    expect(audit.findings).toEqual([]);
    expect(audit.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issue: "current_demand_coverage_expires_soon",
          effectiveAt: "2026-07-13",
          daysUntil: 30,
          findings: expect.arrayContaining([
            expect.objectContaining({
              issue: "current_demand_too_few_active_titles",
            }),
          ]),
        }),
      ]),
    );
  });

  it("fails the editorial audit when current-demand research expires", () => {
    const audit = auditHomeEditorialSeeds("2026-07-13T00:00:00.000Z");

    expect(audit.healthy).toBe(false);
    expect(audit.findings.map((finding) => finding.issue)).toEqual(
      expect.arrayContaining([
        "group_window_expired",
        "current_demand_research_stale",
        "current_demand_too_few_active_titles",
      ]),
    );
  });
});

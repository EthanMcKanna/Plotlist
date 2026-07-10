import { describe, expect, it } from "@jest/globals";

import {
  buildHomePreviewContinueWatchingItems,
  buildHomePreviewData,
  buildHomePreviewSchedule,
} from "../lib/homePreviewData";
import {
  getActiveContinueWatchingItems,
  getContinueWatchingPreviewItems,
} from "../components/ContinueWatchingRail";
import {
  getHomeTasteBriefPreviewKeys,
  getHomeTasteBriefSelection,
} from "../components/HomeTasteBrief";
import {
  buildFreshRailRoomTopUpItems,
  buildVisibleFreshRailItems,
} from "../lib/homeFreshRail";
import {
  buildHomeCuratedEdits,
  getHomeCuratedEditLeadPreviewKeys,
  getHomeCuratedEditPreviewKeys,
} from "../lib/homeCuratedEdits";
import { hasHomePersonalizationSignals } from "../lib/homePersonalization";
import { buildHomepageFeedSurfaceAuditInput } from "../lib/homepageFeedRefresh";
import {
  getHomeDiscoveryPreviewKeys,
  getHomeRailIdentitySet,
  limitHomeRailItemsByTitleAppearances,
  prioritizeUnpreviewedHomeRailItems,
  removePreviewedHomeRailItems,
} from "../lib/homeRailIdentity";
import {
  auditHomeSurfaceRender,
  type HomeSurfaceAuditItem,
  type HomeSurfaceAuditProviderRoom,
} from "../lib/homeSurfaceAudit";
import { getHomeRoomQuickTopUpItems } from "../lib/homeRoomRailTopUps";

function toAuditItem(item: {
  key?: string | null;
  externalSource?: string | null;
  externalId?: string | null;
  title: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  year?: number | null;
  signal?: string | null;
  homeSignal?: string | null;
  editorialTier?: "verified_current" | string | null;
  homeScore?: number | null;
}): HomeSurfaceAuditItem {
  return {
    key:
      item.key ??
      (item.externalSource && item.externalId
        ? `${item.externalSource}:${item.externalId}`
        : item.externalId ?? item.title),
    title: item.title,
    posterUrl: item.posterUrl ?? null,
    backdropUrl: item.backdropUrl ?? null,
    year: item.year ?? null,
    signal: item.signal ?? item.homeSignal ?? null,
    editorialTier: item.editorialTier ?? null,
    homeScore: item.homeScore ?? null,
  };
}

function buildPreviewOpeningSurface(data: ReturnType<typeof buildHomePreviewData>) {
  const activeContinueWatching = getActiveContinueWatchingItems(
    buildHomePreviewContinueWatchingItems(),
  );
  const continueWatchingPreviewKeys = getHomeRailIdentitySet(
    getContinueWatchingPreviewItems(activeContinueWatching),
  );
  const heroPreviewKeys = getHomeRailIdentitySet(data.heroSlides);
  const openingPreviewKeys = new Set([
    ...continueWatchingPreviewKeys,
    ...heroPreviewKeys,
  ]);
  const briefForYouItems = prioritizeUnpreviewedHomeRailItems(
    data.forYou,
    openingPreviewKeys,
  );
  const briefHeatItems = prioritizeUnpreviewedHomeRailItems(
    data.heat,
    openingPreviewKeys,
  );
  const briefFreshItems = prioritizeUnpreviewedHomeRailItems(
    data.fresh,
    openingPreviewKeys,
  );
  const briefSelection = getHomeTasteBriefSelection({
    forYou: briefForYouItems,
    heat: briefHeatItems,
    fresh: briefFreshItems,
    personalized: hasHomePersonalizationSignals(data.me, {
      activeShowCount: activeContinueWatching.length,
    }),
    demotedKeys: openingPreviewKeys,
    now: data.generatedAt,
  });
  const briefPreviewKeys = getHomeTasteBriefPreviewKeys(briefSelection);
  const personalPreviewKeys = new Set([
    ...continueWatchingPreviewKeys,
    ...briefPreviewKeys,
  ]);
  const curatedBlockedKeys = new Set([
    ...heroPreviewKeys,
    ...personalPreviewKeys,
  ]);
  const curatedEdits = buildHomeCuratedEdits({
    heat: prioritizeUnpreviewedHomeRailItems(data.heat, personalPreviewKeys),
    fresh: prioritizeUnpreviewedHomeRailItems(data.fresh, personalPreviewKeys),
    critics: data.critics,
    quick: data.quick,
    blockedKeys: curatedBlockedKeys,
    now: data.generatedAt,
  });
  const briefSurfaceItems = [
    briefSelection.tasteItem,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const curatedLeadItems = curatedEdits
    .map((edit) => edit.items[0])
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const curatedSupportItems = curatedEdits.flatMap((edit) => edit.items.slice(1, 4));
  const openingSurfaceItems = [
    ...getContinueWatchingPreviewItems(activeContinueWatching),
    ...data.heroSlides.slice(0, 1),
    ...briefSurfaceItems,
    ...curatedLeadItems,
  ];

  return {
    briefPreviewKeys,
    continueWatchingPreviewKeys,
    curatedEdits,
    curatedLeadItems,
    curatedSupportItems,
    heroPreviewKeys,
    openingSurfaceItems,
    visibleEditorialSurfaceItems: [
      ...openingSurfaceItems,
      ...curatedSupportItems,
    ],
  };
}

function buildPreviewFreshRoomTopUps(data: ReturnType<typeof buildHomePreviewData>) {
  return buildFreshRailRoomTopUpItems(
    data.streamingRooms.map((room) => ({
      items: room.items.map((item) => {
        const key = String(
          (item.externalSource && item.externalId
            ? `${item.externalSource}:${item.externalId}`
            : null) ??
            item.externalId ??
            item.title,
        );
        const catalog = data.getCatalogForKey(key);
        return {
          key,
          title: catalog?.title ?? item.title,
          posterUrl: catalog?.posterUrl ?? item.posterUrl ?? null,
          backdropUrl: catalog?.backdropUrl ?? item.backdropUrl ?? null,
          overview: catalog?.overview ?? null,
          year: catalog?.year ?? null,
          signal: catalog?.homeSignal ?? item.homeSignal ?? null,
        };
      }),
    })),
    8,
  );
}

describe("home preview data", () => {
  it("builds a complete authenticated homepage model for dev browser QA", () => {
    const data = buildHomePreviewData("2026-05-30T12:00:00.000Z");

    expect(data.hasProfile).toBe(true);
    expect(data.isAuthenticated).toBe(true);
    expect(data.generatedAt).toBe(Date.parse("2026-05-30T12:00:00.000Z"));
    expect(data.heroSlides.length).toBeGreaterThanOrEqual(3);
    expect(data.forYou.length).toBeGreaterThanOrEqual(4);
    expect(data.heat.length).toBeGreaterThanOrEqual(4);
    expect(data.fresh.length).toBeGreaterThanOrEqual(4);
    expect(data.critics.length).toBeGreaterThanOrEqual(4);
    expect(data.quick.length).toBeGreaterThanOrEqual(4);
    expect(data.streamingRooms.length).toBeGreaterThanOrEqual(3);
    expect(data.catalogDiagnostics).toEqual({
      failedCategories: [],
      staleCategories: [],
    });
    expect(data.loading).toEqual({
      hero: false,
      forYou: false,
      heat: false,
      fresh: false,
      critics: false,
      quick: false,
      rooms: false,
      tasteRails: false,
    });
    expect(data.getCatalogForKey(data.heroSlides[0].key)?.title).toBe(
      data.heroSlides[0].title,
    );
  });

  it("keeps the preview homepage broad, fresh, and visually complete", () => {
    const data = buildHomePreviewData("2026-05-30T12:00:00.000Z");
    const rooms: HomeSurfaceAuditProviderRoom[] = data.streamingRooms.map((room) => ({
      key: room.key,
      label: room.label,
      items: room.items.map(toAuditItem),
    }));
    const curatedEdits = buildHomeCuratedEdits({
      heat: data.heat,
      fresh: data.fresh,
      critics: data.critics,
      quick: data.quick,
      now: data.generatedAt,
    });
    const auditedSurface = {
      ...buildHomepageFeedSurfaceAuditInput({
        forYou: data.forYou,
        heat: data.heat,
        fresh: data.fresh,
        critics: data.critics,
        quick: data.quick,
        curatedEdits,
        rooms,
        maxTitleAppearances: 3,
        now: data.generatedAt,
      }),
    };

    const report = auditHomeSurfaceRender(
      auditedSurface,
      data.generatedAt,
      {
        minSignalPlatformCount: 5,
        maxTitleAppearances: 3,
        maxProviderRoomTitleAppearances: 1,
      },
    );

    expect(report.findings).toEqual([]);
    expect(report.healthy).toBe(true);
    expect(report.composition).toMatchObject({
      missingArtworkCount: 0,
      providerRoomCount: expect.any(Number),
      repeatedTitleCount: 0,
      staleSectionKeys: [],
    });
    expect(report.composition.providerRoomCount).toBeGreaterThanOrEqual(4);
    expect(report.composition.signalPlatformCount).toBeGreaterThanOrEqual(5);
  });

  it("keeps browser-QA resume and schedule fixtures in the shared preview module", () => {
    const continueWatching = buildHomePreviewContinueWatchingItems();
    const schedule = buildHomePreviewSchedule();

    expect(continueWatching.map((item) => item.show.title)).toEqual([
      "Andor",
      "Poker Face",
    ]);
    expect(schedule.tonightItems.map((item) => item.show.title)).toEqual(["Sirens"]);
    expect(schedule.upcomingItems.map((item) => item.show.title)).toEqual([
      "Love Island USA",
    ]);
    expect(schedule.tonightCount).toBe(1);
    expect(schedule.weekCount).toBe(1);
  });

  it("keeps fresh rail candidates from recycling text-visible opening titles", () => {
    const data = buildHomePreviewData("2026-05-30T12:00:00.000Z");
    const { openingSurfaceItems } = buildPreviewOpeningSurface(data);
    const freshItems = buildVisibleFreshRailItems({
      items: data.fresh,
      previewKeys: getHomeRailIdentitySet(openingSurfaceItems),
      precedingItems: openingSurfaceItems,
      maxTitleAppearances: 1,
      minimumRemaining: 3,
      now: data.generatedAt,
    });

    expect(openingSurfaceItems.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        "The Four Seasons",
        "Rafa",
        "Rick and Morty",
        "Star City",
      ]),
    );
    expect(freshItems.map((item) => item.title)).not.toEqual(
      expect.arrayContaining([
        "The Four Seasons",
        "Rafa",
        "Rick and Morty",
        "Star City",
      ]),
    );
    expect(freshItems.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        "For All Mankind",
        "A Good Girl's Guide to Murder",
        "Not Suitable for Work",
      ]),
    );
  });

  it("keeps visible fresh rail cards distinct from every rotating hero slide", () => {
    const data = buildHomePreviewData("2026-05-30T12:00:00.000Z");
    const { openingSurfaceItems } = buildPreviewOpeningSurface(data);
    const precedingDiscoveryItems = [
      ...openingSurfaceItems,
      ...data.forYou.slice(0, 5),
      ...data.heat.slice(0, 6),
    ];
    const heroPreviewKeys = getHomeRailIdentitySet(data.heroSlides);
    const previewKeys = new Set([
      ...heroPreviewKeys,
      ...getHomeRailIdentitySet(precedingDiscoveryItems),
    ]);
    const freshItems = buildVisibleFreshRailItems({
      items: [...data.fresh, ...buildPreviewFreshRoomTopUps(data)],
      previewKeys,
      precedingItems: [...data.heroSlides, ...precedingDiscoveryItems],
      maxTitleAppearances: 1,
      minimumRemaining: 3,
      limit: 4,
      now: data.generatedAt,
    });

    expect(data.heroSlides[0]).toMatchObject({
      title: "The Four Seasons",
      signal: "S2 May 28",
    });
    expect(data.heroSlides.map((item) => item.title)).toEqual(
      expect.arrayContaining(["The Boys", "Euphoria"]),
    );
    expect(freshItems).toHaveLength(4);
    expect(freshItems.map((item) => item.title)).not.toEqual(
      expect.arrayContaining([
        ...data.heroSlides.map((item) => item.title),
        ...precedingDiscoveryItems.map((item) => item.title),
      ]),
    );
    expect(freshItems.map((item) => item.title)).toEqual(
      expect.arrayContaining(["For All Mankind", "Not Suitable for Work"]),
    );
  });

  it("keeps quality rail candidates from recycling text-visible curated titles", () => {
    const data = buildHomePreviewData("2026-05-30T12:00:00.000Z");
    const {
      briefPreviewKeys,
      continueWatchingPreviewKeys,
      curatedEdits,
      curatedLeadItems,
      heroPreviewKeys,
      openingSurfaceItems,
    } = buildPreviewOpeningSurface(data);
    const personalPreviewKeys = new Set([
      ...continueWatchingPreviewKeys,
      ...briefPreviewKeys,
    ]);
    expect(getHomeCuratedEditLeadPreviewKeys(curatedEdits)).toEqual(
      getHomeRailIdentitySet(curatedLeadItems),
    );
    const curatedLeadPreviewKeys = getHomeCuratedEditLeadPreviewKeys(curatedEdits);
    const railPreviewKeys = new Set([
      ...heroPreviewKeys,
      ...personalPreviewKeys,
      ...curatedLeadPreviewKeys,
    ]);
    const discoveryPreviewKeys = getHomeDiscoveryPreviewKeys(railPreviewKeys, []);
    const candidates = removePreviewedHomeRailItems(
      data.critics,
      discoveryPreviewKeys,
      3,
    );
    const criticsItems = limitHomeRailItemsByTitleAppearances(
      candidates,
      openingSurfaceItems,
      1,
      3,
      4,
    );

    const openingCriticTitles = data.critics
      .map((item) => item.title)
      .filter((title) =>
        openingSurfaceItems.some((openingItem) => openingItem.title === title),
      );

    expect(openingCriticTitles.length).toBeGreaterThan(0);
    expect(candidates.map((item) => item.title)).not.toEqual(
      expect.arrayContaining(openingCriticTitles),
    );
    expect(data.critics.map((item) => item.title)).toContain("Lord of the Flies");
    expect(criticsItems.map((item) => item.title)).not.toEqual(
      expect.arrayContaining(openingCriticTitles),
    );
    expect(criticsItems.map((item) => item.title)).toEqual([
      "Avatar: The Last Airbender",
      "Lord of the Flies",
      "The Pitt",
      "Adolescence",
    ]);
  });

  it("keeps quick hits from recycling visible curated edit cards", () => {
    const data = buildHomePreviewData("2026-05-30T12:00:00.000Z");
    const {
      briefPreviewKeys,
      continueWatchingPreviewKeys,
      curatedEdits,
      heroPreviewKeys,
      visibleEditorialSurfaceItems,
    } = buildPreviewOpeningSurface(data);
    const personalPreviewKeys = new Set([
      ...continueWatchingPreviewKeys,
      ...briefPreviewKeys,
    ]);
    const railPreviewKeys = new Set([
      ...heroPreviewKeys,
      ...personalPreviewKeys,
      ...getHomeCuratedEditLeadPreviewKeys(curatedEdits),
    ]);
    const visibleEditorialPreviewKeys = new Set([
      ...railPreviewKeys,
      ...getHomeCuratedEditPreviewKeys(curatedEdits),
    ]);
    const candidates = removePreviewedHomeRailItems(
      [...data.quick, ...getHomeRoomQuickTopUpItems(data)],
      getHomeDiscoveryPreviewKeys(visibleEditorialPreviewKeys, []),
      3,
    );
    const quickItems = limitHomeRailItemsByTitleAppearances(
      candidates,
      visibleEditorialSurfaceItems,
      1,
      3,
    );

    expect(visibleEditorialSurfaceItems.map((item) => item.title)).toContain(
      "Overcompensating",
    );
    expect(data.quick.map((item) => item.title)).toContain("Overcompensating");
    const visibleTitles = new Set(
      visibleEditorialSurfaceItems.map((item) => item.title),
    );
    expect(quickItems.length).toBeGreaterThanOrEqual(3);
    expect(quickItems.map((item) => item.title)).not.toContain(
      "Overcompensating",
    );
    expect(quickItems.some((item) => visibleTitles.has(item.title))).toBe(false);
  });
});

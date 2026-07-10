import type { ContinueWatchingItem } from "../components/ContinueWatchingRail";
import type { SignatureRailItem } from "../components/SignatureRail";
import type { HomeSchedulePreviewState } from "../components/TonightStrip";
import { getHomeEditorialProviderSeedItems } from "./homeEditorialSeeds";
import { getDateOnlyTimestamp } from "./releaseCalendar";
import {
  appendFreshEditorialTopUpRailItems,
  buildForYouRailCandidates,
  buildFreshRailCandidates,
  buildHeatRailCandidates,
  buildHeroSlides,
  buildProviderSectionsFromCatalog,
  buildQualityRailCandidates,
  buildQuickRailItems,
  getHomeDataGeneratedAt,
  getHomeDataItemKey,
  getRuntimeHomeEditorialSeedPayload,
  toCatalog,
  toRailItem,
  type AnyShowItem,
  type CatalogItem,
  type HomeData,
} from "./useHomeData";

const HOME_PREVIEW_PROVIDER_CATEGORIES = [
  "netflix",
  "apple_tv",
  "max",
  "disney_plus",
  "hulu",
  "peacock",
  "prime_video",
  "paramount_plus",
  "mgm_plus",
] as const;

export const HOME_PREVIEW_NOW = new Date("2026-05-30T12:00:00.000Z");
const HOME_PREVIEW_TODAY = "2026-05-30";
const HOME_PREVIEW_TODAY_TS = getDateOnlyTimestamp(HOME_PREVIEW_TODAY);

export function buildHomePreviewContinueWatchingItems(): ContinueWatchingItem[] {
  return [
    {
      showId: "show-andor" as ContinueWatchingItem["showId"],
      show: {
        _id: "show-andor",
        title: "Andor",
        backdropUrl: null,
        posterUrl: null,
      },
      totalWatched: 6,
      totalEpisodes: 12,
      progressPct: 0.5,
      nextSeasonNumber: 2,
      nextEpisodeNumber: 7,
      nextEpisodeName: "Messenger",
      nextEpisodeRuntime: 48,
      nextEpisodeReleasedToday: true,
      isCaughtUp: false,
      seasons: [
        { seasonNumber: 1, episodeCount: 6, airDate: null },
        { seasonNumber: 2, episodeCount: 6, airDate: null },
      ],
    },
    {
      showId: "show-poker-face" as ContinueWatchingItem["showId"],
      show: {
        _id: "show-poker-face",
        title: "Poker Face",
        backdropUrl: null,
        posterUrl: null,
      },
      totalWatched: 3,
      totalEpisodes: 12,
      progressPct: 0.25,
      nextSeasonNumber: 2,
      nextEpisodeNumber: 4,
      nextEpisodeName: "Whodunit",
      nextEpisodeRuntime: 61,
      isCaughtUp: false,
      seasons: [
        { seasonNumber: 1, episodeCount: 3, airDate: null },
        { seasonNumber: 2, episodeCount: 9, airDate: null },
      ],
    },
  ];
}

export function buildHomePreviewSchedule(): HomeSchedulePreviewState {
  const tonightItems = [
    {
      airDate: HOME_PREVIEW_TODAY,
      airDateTs: HOME_PREVIEW_TODAY_TS,
      episodeTitle: "Premiere",
      isPremiere: true,
      providers: [{ name: "Netflix" }],
      seasonNumber: 1,
      episodeNumber: 1,
      show: {
        _id: "show-sirens",
        title: "Sirens",
        backdropUrl: null,
        posterUrl: null,
      },
    },
  ];
  const upcomingItems = [
    {
      airDate: "2026-06-02",
      airDateTs: getDateOnlyTimestamp("2026-06-02"),
      episodeTitle: "Season premiere",
      isPremiere: true,
      providers: [{ name: "Peacock" }],
      seasonNumber: 7,
      episodeNumber: 1,
      show: {
        _id: "show-love-island-usa",
        title: "Love Island USA",
        backdropUrl: null,
        posterUrl: null,
      },
    },
  ];

  return {
    isAuthenticated: true,
    today: HOME_PREVIEW_TODAY,
    preview: {
      tonightGroups: [
        {
          airDate: HOME_PREVIEW_TODAY,
          airDateTs: HOME_PREVIEW_TODAY_TS,
          items: tonightItems,
        },
      ],
      upcomingGroups: [
        {
          airDate: "2026-06-02",
          airDateTs: getDateOnlyTimestamp("2026-06-02"),
          items: upcomingItems,
        },
      ],
      staleShowIds: [],
    },
    tonightItems,
    upcomingItems,
    tonightCount: tonightItems.length,
    weekCount: upcomingItems.length,
    hasScheduleItems: true,
    loading: false,
    refresh: async () => {},
  };
}

export function buildHomePreviewData(
  now: Date | string | number = new Date(),
): HomeData {
  const generatedAt = getHomeDataGeneratedAt(now);
  const payload = getRuntimeHomeEditorialSeedPayload(now);
  const currentDemandCatalog = payload.currentDemandSeeds;
  const newOrBackCatalog = payload.newOrBackSeeds;
  const qualityCatalog = payload.qualitySeeds;
  const quickSeedCatalog = payload.quickSeeds;
  const currentDemandRaw = currentDemandCatalog as AnyShowItem[];
  const newOrBackRaw = newOrBackCatalog as AnyShowItem[];
  const qualityRaw = qualityCatalog as AnyShowItem[];
  const quickSeedRaw = quickSeedCatalog as AnyShowItem[];
  const trendFallbackRaw = [
    ...currentDemandRaw,
    ...newOrBackRaw,
    ...qualityRaw,
    ...quickSeedRaw,
  ];
  const heroSlides = buildHeroSlides({
    trending: currentDemandRaw,
    forYou: [],
    premieres: newOrBackCatalog,
    airing: [],
    now,
  });
  const forYou = buildForYouRailCandidates({
    forYou: [],
    fallback: trendFallbackRaw,
    heroSlides,
    now,
  })
    .map((catalog) => toRailItem(catalog as AnyShowItem, now))
    .filter((item): item is SignatureRailItem => Boolean(item))
    .slice(0, 10);
  const heat = buildHeatRailCandidates({
    trending: [],
    dailyTrending: [],
    rising: [],
    weeklyTrending: [],
    curatedDemand: currentDemandRaw,
    heroSlides,
    forYou,
    now,
  })
    .map((catalog) => toRailItem(catalog as AnyShowItem, now))
    .filter((item): item is SignatureRailItem => Boolean(item))
    .slice(0, 10);
  const freshPrimary = buildFreshRailCandidates({
    curatedNewOrBack: newOrBackRaw,
    premieres: [],
    airing: [],
    rising: [],
    weeklyTrending: [],
    trending: currentDemandRaw,
    forYou,
    heroSlides,
    now,
  })
    .map((catalog) => toRailItem(catalog as AnyShowItem, now))
    .filter((item): item is SignatureRailItem => Boolean(item))
    .slice(0, 12);
  const fresh = appendFreshEditorialTopUpRailItems(
    freshPrimary,
    newOrBackRaw,
    now,
  ).slice(0, 12);
  const critics = buildQualityRailCandidates({
    critics: qualityRaw,
    qualitySeeds: qualityRaw,
    weeklyTrending: currentDemandRaw,
    rising: newOrBackRaw,
    premieres: newOrBackRaw,
    trending: currentDemandRaw,
    forYouRaw: [],
    heroSlides,
    seenRails: [...forYou, ...heat, ...fresh],
    now,
  })
    .map((catalog) => toRailItem(catalog as AnyShowItem, now))
    .filter((item): item is SignatureRailItem => Boolean(item))
    .slice(0, 12);
  const quick = buildQuickRailItems({
    quickRaw: quickSeedRaw,
    quickSeedRaw,
    risingRaw: newOrBackRaw,
    tmdbTrendingRaw: currentDemandRaw,
    heroSlides,
    forYou,
    heat,
    fresh,
    critics,
    now,
  });
  const providerCatalogProviders = Object.fromEntries(
    HOME_PREVIEW_PROVIDER_CATEGORIES.map((category) => [
      category,
      getHomeEditorialProviderSeedItems(category, now),
    ]),
  );
  const streamingRooms = buildProviderSectionsFromCatalog(
    providerCatalogProviders,
    { now },
  );
  const catalogIndex = new Map<string, CatalogItem>();
  const collect = (items: AnyShowItem[]) => {
    items.forEach((item) => {
      const show = toCatalog(item);
      if (show) {
        catalogIndex.set(String(getHomeDataItemKey(item)), show);
      }
    });
  };
  collect(currentDemandRaw);
  collect(newOrBackRaw);
  collect(qualityRaw);
  collect(quickSeedRaw);
  streamingRooms.forEach((room) => collect(room.items as AnyShowItem[]));

  return {
    hasProfile: true,
    isAuthenticated: true,
    generatedAt,
    me: {
      _id: "dev-home-preview-user",
      displayName: "Preview Viewer",
      username: "preview",
      countsWatchlist: 12,
      countsWatching: 3,
      countsCompleted: 18,
      countsReviews: 8,
      countsLogs: 34,
      countsTotalShows: 33,
    },
    heroSlides,
    forYou,
    heat,
    fresh,
    critics,
    quick,
    tasteRails: [],
    streamingRooms,
    streamingProviderKeys: [],
    catalogDiagnostics: {
      failedCategories: [],
      staleCategories: [],
    },
    loading: {
      hero: false,
      forYou: false,
      heat: false,
      fresh: false,
      critics: false,
      quick: false,
      rooms: false,
      tasteRails: false,
    },
    refresh: async () => {},
    contactMatches: [],
    similarTaste: [],
    suggested: [],
    friendActivity: [],
    feedEmpty: true,
    showContactSyncNudge: false,
    hasSyncedContacts: false,
    contactStatusKnown: true,
    getCatalogForKey: (key) => catalogIndex.get(key) ?? null,
  };
}

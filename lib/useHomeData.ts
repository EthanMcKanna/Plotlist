import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "./plotlist/api";
import { getApiBaseUrl } from "./api/env";
import { useAction, useAuth, usePaginatedQuery, useQuery } from "./plotlist/react";
import { queryClient } from "./queryClient";
import {
  getHomeEditorialCurrentDemandSeedItems,
  getHomeEditorialDailyChartRank,
  getHomeEditorialDemandConfidenceScore,
  getHomeEditorialSeedItemByTitle,
  getHomeEditorialSeedItems,
  getHomeEditorialSeedItemsByRationale,
  getHomeEditorialProviderSeedItems,
  getHomeEditorialPlatformKeyByTitle,
  type HomeEditorialProviderKey,
} from "./homeEditorialSeeds";
import { getHomeShowKey, rankHomeShows } from "./homeRanking";
import {
  getHomeSignalReleaseDistanceDays,
  hasChartOnlyHomeSignal,
  hasReleaseWindowHomeSignal,
  isHomeReleaseWindowNear,
} from "./homeCurrentSignal";
import { sortFreshRailItemsByReleaseProximity } from "./homeFreshRail";
import {
  rotateHomeRailForEpoch,
  selectHeroSlidesForEpoch,
} from "./homeSurfaceRotation";
import {
  sortProviderRoomItemsForFreshness,
  sortProviderRoomsForFreshness,
} from "./providerRoomFreshness";
import { getHomepageCatalogDiagnostics } from "./homepageCatalogHealth";
import {
  buildStreamingAvailabilityIndex,
  filterSectionsToStreamingProviders,
  leanItemsToStreamingAvailability,
  normalizeStreamingProviderKeys,
} from "./streamingProviders";
import { toHomeFeedItem } from "./homeFeedItems";
import { getHomeRailIdentityKeys } from "./homeRailIdentity";
import { shouldLoadEditorialSeedRail } from "./homeRailHealth";
import type { HeroSlide } from "../components/HeroCarousel";
import type { ProviderRoom } from "../components/StreamingRooms";
import type { SignatureRailItem } from "../components/SignatureRail";
import type { FeedItemProps } from "../components/FeedItem";

export {
  sortProviderRoomItemsForFreshness,
  sortProviderRoomsForFreshness,
} from "./providerRoomFreshness";

const GENRE_LABELS: Record<number, string> = {
  16: "Animated",
  18: "Drama",
  35: "Comedy",
  37: "Western",
  80: "Crime",
  99: "Docuseries",
  9648: "Mystery",
  10751: "Family",
  10759: "Action",
  10762: "Kids",
  10763: "News",
  10764: "Reality",
  10765: "Sci-fi",
  10766: "Soap",
  10767: "Talk",
  10768: "War",
};

const NOISY_TV_GENRE_IDS = new Set([10763, 10764, 10767]);
const SUPPRESSED_HOME_TITLE_KEYS = new Set([
  // TMDB occasionally surfaces episode-like rows in TV/provider lists.
  "berlin and the lady with an ermine",
]);
const MIN_POSTER_RAIL_ITEMS = 4;
const MIN_PROVIDER_ROOM_ITEMS = 4;
const MIN_EDITORIAL_PROVIDER_ROOM_ITEMS = 3;
const PROVIDER_ROOM_CATALOG_LIMIT = 18;
const FRESH_FEED_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const EDITORIAL_SEED_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const LIVE_HEAT_SIGNAL_PATTERN =
  /\b(airing|breakouts?|drops?|finale|launch|new|premiere|returns?|season|s\d+|today|tonight)\b/i;

export function getHomeDataGeneratedAt(
  now: Date | string | number = Date.now(),
) {
  const timestamp =
    now instanceof Date
      ? now.getTime()
      : typeof now === "number"
        ? now
        : Date.parse(now);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function getHomeReferenceYear(now?: Date | string | number) {
  return new Date(getHomeDataGeneratedAt(now ?? Date.now())).getUTCFullYear();
}

export type CatalogItem = {
  _id?: string;
  showId?: string;
  externalSource?: string;
  externalId?: string;
  title: string;
  year?: number | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  overview?: string | null;
  genreIds?: number[] | null;
  tmdbPopularity?: number | null;
  tmdbVoteAverage?: number | null;
  tmdbVoteCount?: number | null;
  homeSignal?: string | null;
  editorialTier?: "verified_current" | null;
  updatedAt?: number | null;
};

type RankedShowItem = {
  show?: CatalogItem | null;
  rank?: number;
  score?: number;
  reviewCount?: number;
  logCount?: number;
  statusCount?: number;
  homeScore?: number;
  homeReasons?: string[];
  _id?: string;
};

export type AnyShowItem = CatalogItem | RankedShowItem;

type ProviderConfig = {
  key: string;
  category: HomeEditorialProviderKey;
  label: string;
  logoUrl: string;
  tint: string;
  candidateProfile?: "broadcast" | "niche";
};

const TMDB_LOGO = (path: string) => `https://image.tmdb.org/t/p/w92${path}`;

const PROVIDERS: ProviderConfig[] = [
  {
    key: "netflix",
    category: "netflix",
    label: "Netflix",
    logoUrl: TMDB_LOGO("/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg"),
    tint: "#E50914",
  },
  {
    key: "apple_tv",
    category: "apple_tv",
    label: "Apple TV+",
    logoUrl: TMDB_LOGO("/mcbz1LgtErU9p4UdbZ0rG6RTWHX.jpg"),
    tint: "#A8A8A8",
  },
  {
    key: "max",
    category: "max",
    label: "Max",
    logoUrl: TMDB_LOGO("/jbe4gVSfRlbPTdESXhEKpornsfu.jpg"),
    tint: "#7B2CBF",
  },
  {
    key: "disney_plus",
    category: "disney_plus",
    label: "Disney+",
    logoUrl: TMDB_LOGO("/97yvRBw1GzX7fXprcF80er19ot.jpg"),
    tint: "#1F80E0",
  },
  {
    key: "hulu",
    category: "hulu",
    label: "Hulu",
    logoUrl: TMDB_LOGO("/bxBlRPEPpMVDc4jMhSrTf2339DW.jpg"),
    tint: "#1CE783",
  },
  {
    key: "peacock",
    category: "peacock",
    label: "Peacock",
    logoUrl: TMDB_LOGO("/2aGrp1xw3qhwCYvNGAJZPdjfeeX.jpg"),
    tint: "#8AC926",
    candidateProfile: "broadcast",
  },
  {
    key: "prime_video",
    category: "prime_video",
    label: "Prime Video",
    logoUrl: TMDB_LOGO("/pvske1MyAoymrs5bguRfVqYiM9a.jpg"),
    tint: "#00A8E1",
  },
  {
    key: "paramount_plus",
    category: "paramount_plus",
    label: "Paramount+",
    logoUrl: TMDB_LOGO("/fts6X10Jn4QT0X6ac3udKEn2tJA.jpg"),
    tint: "#0064FF",
  },
  {
    key: "mgm_plus",
    category: "mgm_plus",
    label: "MGM+",
    logoUrl: TMDB_LOGO("/ctiRpS16dlaTXQBSsiFncMrgWmh.jpg"),
    tint: "#D6B35A",
    candidateProfile: "niche",
  },
];

export type HomeCatalogDiagnostics = {
  failedCategories: string[];
  staleCategories: string[];
};

type HomeCatalogPayload = {
  risingNow?: CatalogItem[];
  breakoutPremieres?: CatalogItem[];
  criticsChoice?: CatalogItem[];
  quickPicks?: CatalogItem[];
  airingToday?: CatalogItem[];
  trendingDay?: CatalogItem[];
  trendingWeek?: CatalogItem[];
  providers?: Partial<Record<ProviderConfig["category"], CatalogItem[]>>;
  diagnostics: HomeCatalogDiagnostics;
};

type HomeCatalogAction = (args?: Record<string, unknown>) => Promise<unknown>;

function getEmptyHomeCatalogDiagnostics(): HomeCatalogDiagnostics {
  return {
    failedCategories: [],
    staleCategories: [],
  };
}

function toCatalogArray(value: unknown): CatalogItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is CatalogItem =>
      Boolean(item && typeof item === "object" && "title" in item),
  );
}

export function normalizeHomeCatalogPayload(value: unknown): HomeCatalogPayload {
  const payload =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const providerPayload =
    payload.providers && typeof payload.providers === "object"
      ? (payload.providers as Record<string, unknown>)
      : {};

  return {
    risingNow: toCatalogArray(payload.risingNow),
    breakoutPremieres: toCatalogArray(payload.breakoutPremieres),
    criticsChoice: toCatalogArray(payload.criticsChoice),
    quickPicks: toCatalogArray(payload.quickPicks),
    airingToday: toCatalogArray(payload.airingToday),
    trendingDay: toCatalogArray(payload.trendingDay),
    trendingWeek: toCatalogArray(payload.trendingWeek),
    providers: Object.fromEntries(
      PROVIDERS.map((provider) => [
        provider.category,
        toCatalogArray(providerPayload[provider.category]),
      ]),
    ) as Partial<Record<ProviderConfig["category"], CatalogItem[]>>,
    diagnostics: getHomepageCatalogDiagnostics(payload),
  };
}

export function getRuntimeHomeEditorialSeedPayload(
  now: Date | string | number = new Date(),
) {
  const currentDemandSeeds = getHomeEditorialCurrentDemandSeedItems(now);
  const premiereCalendarSeeds = getHomeEditorialSeedItemsByRationale(
    "newOrBack",
    "premiere_calendar",
    now,
  );

  return {
    currentDemandSeeds,
    newOrBackSeeds: [...currentDemandSeeds, ...premiereCalendarSeeds],
    qualitySeeds: getHomeEditorialSeedItems("quality", now),
    quickSeeds: getHomeEditorialSeedItems("quick", now),
  };
}

async function loadHomeCatalogFallback(
  getTmdbList: HomeCatalogAction,
): Promise<HomeCatalogPayload> {
  const load = async (category: string, limit: number) => {
    try {
      return toCatalogArray(await getTmdbList({ category, limit }));
    } catch {
      return [];
    }
  };
  const providerEntriesPromise = Promise.all(
    PROVIDERS.map(async (provider) => [
      provider.category,
      await load(provider.category, PROVIDER_ROOM_CATALOG_LIMIT),
    ] as const),
  );
  const [
    risingNow,
    breakoutPremieres,
    criticsChoice,
    quickPicks,
    airingToday,
    trendingDay,
    trendingWeek,
    providerEntries,
  ] = await Promise.all([
    load("rising_now", 16),
    load("breakout_premieres", 16),
    load("critics_choice", 16),
    load("quick_picks", 16),
    load("airing_today", 10),
    load("trending_day", 20),
    load("trending_week", 10),
    providerEntriesPromise,
  ]);

  return {
    risingNow,
    breakoutPremieres,
    criticsChoice,
    quickPicks,
    airingToday,
    trendingDay,
    trendingWeek,
    providers: Object.fromEntries(providerEntries) as Partial<
      Record<ProviderConfig["category"], CatalogItem[]>
    >,
    diagnostics: getEmptyHomeCatalogDiagnostics(),
  };
}

async function loadHomeCatalog(
  getHomeCatalog: HomeCatalogAction,
  getTmdbList: HomeCatalogAction,
): Promise<HomeCatalogPayload> {
  if (!shouldUseBatchedHomeCatalog()) {
    return await loadHomeCatalogFallback(getTmdbList);
  }
  try {
    return normalizeHomeCatalogPayload(await getHomeCatalog({}));
  } catch {
    return await loadHomeCatalogFallback(getTmdbList);
  }
}

export function shouldUseBatchedHomeCatalog(
  apiBaseUrl = getApiBaseUrl(),
  currentOrigin =
    typeof window !== "undefined" && window.location
      ? window.location.origin
      : null,
) {
  if (!currentOrigin) {
    return true;
  }

  try {
    const apiOrigin = new URL(apiBaseUrl).origin;
    const webOrigin = new URL(currentOrigin).origin;
    if (apiOrigin === webOrigin) {
      return true;
    }

    // Local web QA often points at the already-deployed production API. Avoid
    // probing new RPC actions there so old backends fall back without console noise.
    return new URL(apiOrigin).hostname !== "plotlist.app";
  } catch {
    return true;
  }
}

export function buildProviderSectionsFromCatalog(
  providers: HomeCatalogPayload["providers"] = {},
  options: {
    includeEditorialSeeds?: boolean;
    now?: Date | string | number;
  } = {},
): ProviderRoom[] {
  const includeEditorialSeeds = options.includeEditorialSeeds ?? true;
  const now = options.now ?? new Date();
  const globalRoomSeen = new Set<string>();
  const rooms: ProviderRoom[] = [];

  PROVIDERS.forEach((provider) => {
    const editorialItems = includeEditorialSeeds
      ? getHomeEditorialProviderSeedItems(provider.category, now)
      : [];
    const editorialKeys = new Set(
      editorialItems
        .map((item) => getHomeShowKey(item))
        .filter((key): key is string => Boolean(key)),
    );
    const rankItems = (
      items: CatalogItem[],
      isEditorialSeed: boolean,
      seedKeys?: Iterable<string>,
    ) =>
      rankHomeShows(
        dedupeHomeCandidates(items)
          .map((item) => getShow(item))
          .filter((item): item is CatalogItem => Boolean(item))
          .map((item) => overlayHomeEditorialSeedSignal(item, now))
          .filter((item) =>
            isReliableProviderRoomCandidate(
              item,
              isEditorialSeed,
              now,
              provider.category,
              provider.candidateProfile,
            ),
          ),
        {
          seedKeys,
          diversityStrength: 0.2,
          preferFresh: true,
          now: getHomeDataGeneratedAt(now),
        },
      );
    const rankedEditorialItems = rankItems(
      editorialItems,
      true,
      editorialKeys,
    );
    const rankedCatalogItems = rankItems(
      toCatalogArray(providers[provider.category])
        .map((item) => getShow(item))
        .filter((item): item is CatalogItem => Boolean(item)),
      false,
    );
    const minimumRoomItems =
      rankedEditorialItems.length >= MIN_EDITORIAL_PROVIDER_ROOM_ITEMS
        ? MIN_EDITORIAL_PROVIDER_ROOM_ITEMS
        : MIN_PROVIDER_ROOM_ITEMS;
    const rankedItems = buildDistinctRailCandidates(
      [
        ...rankedEditorialItems.slice(0, 2),
        ...rankedCatalogItems,
        ...rankedEditorialItems.slice(2),
      ],
      new Set<string>(),
      [],
      minimumRoomItems,
    );
    const roomItems = sortProviderRoomItemsForFreshness(
      pickProviderRoomItemsWithGlobalDiversity(
        rankedItems,
        globalRoomSeen,
        minimumRoomItems,
      ),
      now,
    );

    if (roomItems.length < minimumRoomItems) {
      return;
    }

    rooms.push({
      key: provider.key,
      label: provider.label,
      logoUrl: provider.logoUrl,
      tint: provider.tint,
      items: roomItems,
    });
  });

  return sortProviderRoomsForFreshness(rooms, now);
}

function isRanked(item: AnyShowItem | null | undefined): item is RankedShowItem {
  return Boolean(item && typeof item === "object" && "show" in item);
}

function getShow(item: AnyShowItem | null | undefined): CatalogItem | null {
  if (!item) return null;
  return isRanked(item) ? item.show ?? null : item;
}

function getShowId(item: AnyShowItem | null | undefined) {
  const show = getShow(item);
  return show?._id ?? show?.showId ?? (isRanked(item) ? item._id : undefined);
}

export function getHomeDataItemKey(
  item: AnyShowItem | null | undefined,
  fallback = "show",
) {
  const show = getShow(item);
  return (
    getShowId(item) ??
    (show?.externalSource && show?.externalId
      ? `${show.externalSource}:${show.externalId}`
      : undefined) ??
    show?.externalId ??
    show?.title ??
    fallback
  );
}

function compactCount(count: number) {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`;
  }
  return String(count);
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${compactCount(count)} ${count === 1 ? singular : plural}`;
}

export function getHomeShowSignal(
  item: AnyShowItem | null | undefined,
  now: Date | string | number = new Date(),
): string | null {
  const show = getShow(item);
  const homeSignal = show?.homeSignal?.trim();
  if (homeSignal) return homeSignal;
  const editorialSignal = getHomeEditorialSeedItemByTitle(show?.title, now)?.homeSignal?.trim();
  if (editorialSignal) return editorialSignal;
  if (isRanked(item)) {
    if ((item.reviewCount ?? 0) > 0)
      return pluralize(item.reviewCount ?? 0, "review");
    if ((item.logCount ?? 0) > 0) return pluralize(item.logCount ?? 0, "watch");
    if ((item.statusCount ?? 0) > 0)
      return pluralize(item.statusCount ?? 0, "save");
  }
  // TMDB scores are never surfaced as user-facing signals; ratings shown in
  // the app come from IMDb on the show screen.
  if (typeof show?.tmdbPopularity === "number" && show.tmdbPopularity > 0) {
    return "Trending";
  }
  return null;
}

function getGenreLabel(show: CatalogItem | null) {
  const firstGenre = Array.isArray(show?.genreIds) ? show?.genreIds[0] : undefined;
  return firstGenre ? GENRE_LABELS[firstGenre] ?? null : null;
}

function getSuppressedHomeTitleKey(title: string | null | undefined) {
  return title?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

function isEditorialCandidate(show: CatalogItem | null | undefined) {
  if (!show?.title || !show.posterUrl) return false;
  if (SUPPRESSED_HOME_TITLE_KEYS.has(getSuppressedHomeTitleKey(show.title))) {
    return false;
  }
  return !(show.genreIds ?? []).some((genreId) => NOISY_TV_GENRE_IDS.has(genreId));
}

function isRecentEnough(show: CatalogItem | null | undefined, oldestYear: number) {
  return Boolean(show?.year && show.year >= oldestYear);
}

function isRecentEnoughForWindow(
  show: CatalogItem | null | undefined,
  now: Date | string | number | undefined,
  yearWindow: number,
) {
  return isRecentEnough(show, getHomeReferenceYear(now) - yearWindow);
}

function isLeadCandidate(
  show: CatalogItem | null | undefined,
  now?: Date | string | number,
) {
  return isEditorialCandidate(show) && isRecentEnoughForWindow(show, now, 7);
}

function hasQualitySignal(
  show: CatalogItem | null | undefined,
  minAverage: number,
  minVotes = 50,
) {
  return Boolean(
    typeof show?.tmdbVoteAverage === "number" &&
      show.tmdbVoteAverage >= minAverage &&
      typeof show.tmdbVoteCount === "number" &&
      show.tmdbVoteCount >= minVotes,
  );
}

function hasFreshHomeSignal(show: CatalogItem | null | undefined) {
  return Boolean(show?.homeSignal?.trim());
}

function overlayHomeEditorialSeedSignal(
  show: CatalogItem,
  now?: Date | string | number,
): CatalogItem {
  const seed = getHomeEditorialSeedItemByTitle(show.title, now);
  if (!seed) return show;

  return {
    ...seed,
    ...show,
    genreIds: show.genreIds?.length ? show.genreIds : seed.genreIds,
    posterUrl: show.posterUrl ?? seed.posterUrl,
    backdropUrl: show.backdropUrl ?? seed.backdropUrl,
    overview: show.overview ?? seed.overview,
    homeSignal: show.homeSignal?.trim() ? show.homeSignal : seed.homeSignal,
    editorialTier: show.editorialTier ?? seed.editorialTier,
    tmdbPopularity: show.tmdbPopularity ?? seed.tmdbPopularity,
    tmdbVoteAverage: show.tmdbVoteAverage ?? seed.tmdbVoteAverage,
    tmdbVoteCount: show.tmdbVoteCount ?? seed.tmdbVoteCount,
  };
}

function isVerifiedCurrentEditorialSeed(show: CatalogItem | null | undefined) {
  return show?.editorialTier === "verified_current" && hasFreshHomeSignal(show);
}

function hasVerifiedCurrentFloor(
  show: CatalogItem | null | undefined,
  now?: Date | string | number,
) {
  return Boolean(
    isVerifiedCurrentEditorialSeed(show) &&
      (Boolean(
        show &&
          isHomeReleaseWindowNear(show, {
            now,
            maxPastDays: 7,
            maxFutureDays: 14,
          }),
      ) ||
        hasQualitySignal(show, 6.5, 20) ||
        hasPopularitySignal(show, 5)),
  );
}

function hasPopularitySignal(
  show: CatalogItem | null | undefined,
  minPopularity: number,
) {
  return Boolean(
    typeof show?.tmdbPopularity === "number" &&
      show.tmdbPopularity >= minPopularity,
  );
}

function isReliableHeatCandidate(
  show: CatalogItem | null | undefined,
  now?: Date | string | number,
) {
  if (!isEditorialCandidate(show) || !isRecentEnoughForWindow(show, now, 7)) {
    return false;
  }
  if (!isAvailableForHeatNow(show, now)) {
    return false;
  }
  if (hasVerifiedCurrentFloor(show, now)) {
    return true;
  }
  if (hasFreshHomeSignal(show)) {
    return hasQualitySignal(show, 7, 40);
  }
  if (isRecentEnoughForWindow(show, now, 1)) {
    return hasQualitySignal(show, 7.2, 75) && hasPopularitySignal(show, 20);
  }
  return hasQualitySignal(show, 7.35, 150) && hasPopularitySignal(show, 30);
}

function isReliableProviderRoomCandidate(
  show: CatalogItem | null | undefined,
  isEditorialSeed = false,
  now?: Date | string | number,
  providerKey?: HomeEditorialProviderKey,
  candidateProfile?: ProviderConfig["candidateProfile"],
) {
  if (!isEditorialCandidate(show)) {
    return false;
  }
  const editorialPlatform = getHomeEditorialPlatformKeyByTitle(show?.title, now);
  if (editorialPlatform && providerKey && editorialPlatform !== providerKey) {
    return false;
  }
  if (hasVerifiedCurrentFloor(show, now)) {
    return true;
  }
  if (hasFreshHomeSignal(show)) {
    return hasQualitySignal(show, 7, 40);
  }
  if (isEditorialSeed) {
    return hasQualitySignal(show, 7, 40);
  }
  if (!isRecentEnoughForWindow(show, now, 6)) {
    return false;
  }
  if (
    candidateProfile === "niche" &&
    isRecentEnoughForWindow(show, now, 7)
  ) {
    return hasQualitySignal(show, 7.4, 100);
  }
  if (isRecentEnoughForWindow(show, now, 1)) {
    return hasQualitySignal(show, 7.2, 150) && hasPopularitySignal(show, 20);
  }
  return hasQualitySignal(show, 7.3, 150) && hasPopularitySignal(show, 25);
}

function isFreshOrReturningCandidate(
  show: CatalogItem | null | undefined,
  now?: Date | string | number,
) {
  if (!isEditorialCandidate(show)) return false;
  if (isRecentEnoughForWindow(show, now, 1)) return true;
  return hasFreshHomeSignal(show) && hasQualitySignal(show, 7.2, 100);
}

function isFreshRailCandidate(
  show: CatalogItem | null | undefined,
  now?: Date | string | number,
) {
  if (!show) return false;
  if (!isFreshOrReturningCandidate(show, now)) return false;
  if (hasFreshHomeSignal(show) && !hasReleaseWindowHomeSignal(show)) {
    return false;
  }
  return true;
}

function isReliableQualityCandidate(
  show: CatalogItem | null | undefined,
  now?: Date | string | number,
) {
  return Boolean(
    isEditorialCandidate(show) &&
      isRecentEnoughForWindow(show, now, 4) &&
      hasQualitySignal(show, 7.6, 75),
  );
}

function keepRailIfSubstantial<T>(items: T[]) {
  return items.length >= MIN_POSTER_RAIL_ITEMS ? items : [];
}

export function getHomeTitleDiversityKey(title: string | null | undefined) {
  const normalized = title?.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized ? `title:${normalized}` : null;
}

function getCatalogDiversityKeys(item: CatalogItem) {
  return [
    getHomeShowKey(item),
    getHomeTitleDiversityKey(item.title),
  ].filter((key): key is string => Boolean(key));
}

function createHeroSeenSet(slides: HeroSlide[]) {
  const seen = new Set<string>();
  slides.forEach((slide) => {
    seen.add(slide.key);
    const titleKey = getHomeTitleDiversityKey(slide.title);
    if (titleKey) seen.add(titleKey);
  });
  return seen;
}

function createRailSeenSet(items: SignatureRailItem[]) {
  const seen = new Set<string>();
  items.forEach((item) => {
    seen.add(item.key);
    const titleKey = getHomeTitleDiversityKey(item.title);
    if (titleKey) seen.add(titleKey);
  });
  return seen;
}

function appendDistinctRailItems(
  primary: SignatureRailItem[],
  fallback: SignatureRailItem[],
) {
  const seen = new Set<string>();
  const out: SignatureRailItem[] = [];
  const add = (item: SignatureRailItem) => {
    const keys = getHomeRailIdentityKeys(item);
    if (keys.some((key) => seen.has(key))) return;
    keys.forEach((key) => seen.add(key));
    out.push(item);
  };
  primary.forEach(add);
  fallback.forEach(add);
  return out;
}

export function appendFreshEditorialTopUpRailItems(
  primary: SignatureRailItem[],
  editorialCandidates: AnyShowItem[],
  now?: Date | string | number,
) {
  const editorialTopUp = editorialCandidates
    .filter((candidate) => {
      const catalog = toCatalog(candidate);
      return Boolean(catalog && hasReleaseWindowHomeSignal(catalog));
    })
    .map((catalog) => toRailItem(catalog, now))
    .filter((item): item is SignatureRailItem => Boolean(item));

  return sortFreshRailItemsByReleaseProximity(
    appendDistinctRailItems(primary, editorialTopUp),
    now,
  );
}

function hasUndatedLiveHeatSignal(show: CatalogItem | null | undefined) {
  const signal = show?.homeSignal?.trim();
  return Boolean(
    signal &&
      hasReleaseWindowHomeSignal(show ?? {}) &&
      getHomeSignalReleaseDistanceDays(show) === null &&
      LIVE_HEAT_SIGNAL_PATTERN.test(signal),
  );
}

function isAvailableForHeatNow(
  show: CatalogItem | null | undefined,
  now?: Date | string | number,
) {
  if (!hasFreshHomeSignal(show)) return true;
  if (hasChartOnlyHomeSignal(show ?? {}) || hasUndatedLiveHeatSignal(show)) {
    return true;
  }
  if (!hasReleaseWindowHomeSignal(show ?? {})) return true;
  const distance = getHomeSignalReleaseDistanceDays(show, now);
  return distance === null || distance <= 0;
}

function getHeatSignalScore(show: CatalogItem, now?: Date | string | number) {
  const demandBoost = Math.min(
    120,
    Math.floor(getHomeEditorialDemandConfidenceScore(show.title) / 2),
  );
  if (hasUndatedLiveHeatSignal(show)) return 140 + demandBoost;
  if (isHomeReleaseWindowNear(show, { now, maxPastDays: 7, maxFutureDays: 14 })) {
    const distance = getHomeSignalReleaseDistanceDays(show, now) ?? 0;
    return 120 - Math.abs(distance) * 4 + demandBoost;
  }
  if (hasChartOnlyHomeSignal(show)) return 84 + demandBoost;
  const distance = getHomeSignalReleaseDistanceDays(show, now);
  if (distance !== null) {
    return (
      (demandBoost >= 80 ? 92 : 48 - Math.min(40, Math.abs(distance))) +
      demandBoost
    );
  }
  return hasFreshHomeSignal(show) ? 70 + demandBoost : demandBoost;
}

function sortHeatCurrentSignals<T extends CatalogItem>(
  items: T[],
  now?: Date | string | number,
) {
  return [...items].sort((left, right) => {
    const scoreDelta = getHeatSignalScore(right, now) - getHeatSignalScore(left, now);
    if (scoreDelta !== 0) return scoreDelta;
    return (
      ((right as CatalogItem & { homeScore?: number }).homeScore ?? 0) -
      ((left as CatalogItem & { homeScore?: number }).homeScore ?? 0)
    );
  });
}

export function preferDistinctWhenSubstantial<T extends CatalogItem>(
  items: T[],
  seen: Set<string>,
) {
  const distinct: T[] = [];
  const repeats: T[] = [];
  items.forEach((item) => {
    if (getCatalogDiversityKeys(item).some((key) => seen.has(key))) {
      repeats.push(item);
    } else {
      distinct.push(item);
    }
  });
  if (distinct.length >= MIN_POSTER_RAIL_ITEMS) {
    return distinct;
  }
  return [...distinct, ...repeats];
}

export function buildDistinctRailCandidates<T extends CatalogItem>(
  primaryItems: T[],
  seen: Set<string>,
  fallbackItems: T[] = [],
  minimum = MIN_POSTER_RAIL_ITEMS,
) {
  const picked: T[] = [];
  const pickedKeys = new Set<string>();
  const tryPick = (item: T) => {
    const keys = getCatalogDiversityKeys(item);
    if (keys.some((key) => seen.has(key) || pickedKeys.has(key))) {
      return;
    }
    keys.forEach((key) => pickedKeys.add(key));
    picked.push(item);
  };

  primaryItems.forEach(tryPick);
  fallbackItems.forEach(tryPick);
  return picked.length >= minimum ? picked : [];
}

export function buildDistinctOrDemotedRailCandidates<T extends CatalogItem>(
  primaryItems: T[],
  seen: Set<string>,
  fallbackItems: T[] = [],
  minimum = MIN_POSTER_RAIL_ITEMS,
) {
  const picked: T[] = [];
  const repeats: T[] = [];
  const pickedKeys = new Set<string>();
  const tryBucket = (item: T) => {
    const keys = getCatalogDiversityKeys(item);
    if (keys.some((key) => pickedKeys.has(key))) return;
    keys.forEach((key) => pickedKeys.add(key));
    if (keys.some((key) => seen.has(key))) {
      repeats.push(item);
      return;
    }
    picked.push(item);
  };

  primaryItems.forEach(tryBucket);
  fallbackItems.forEach(tryBucket);

  if (picked.length >= minimum) {
    return picked;
  }
  return [...picked, ...repeats].length >= minimum
    ? [...picked, ...repeats]
    : [];
}

function pickProviderRoomItemsWithGlobalDiversity<T extends CatalogItem>(
  items: T[],
  globalSeen: Set<string>,
  minimum = MIN_PROVIDER_ROOM_ITEMS,
) {
  const localSeen = new Set<string>();
  const globallyDistinct: T[] = [];
  const globalRepeats: T[] = [];

  items.forEach((item) => {
    const keys = getCatalogDiversityKeys(item);
    if (keys.some((key) => localSeen.has(key))) return;
    keys.forEach((key) => localSeen.add(key));
    if (keys.some((key) => globalSeen.has(key))) {
      globalRepeats.push(item);
      return;
    }
    globallyDistinct.push(item);
  });

  const picked =
    globallyDistinct.length >= minimum
      ? globallyDistinct
      : [
          ...globallyDistinct,
          ...globalRepeats.slice(0, minimum - globallyDistinct.length),
        ];
  if (picked.length < minimum) {
    return [];
  }

  picked.forEach((item) => {
    getCatalogDiversityKeys(item).forEach((key) => globalSeen.add(key));
  });
  return picked;
}

function toCatalogCandidates(
  items: AnyShowItem[],
  predicate: (show: CatalogItem) => boolean,
) {
  return dedupeHomeCandidates(items)
    .map((item) => getShow(item))
    .filter((item): item is CatalogItem => {
      if (!item) return false;
      return predicate(item);
    });
}

export function buildHeatRailCandidates(args: {
  trending: AnyShowItem[];
  dailyTrending: AnyShowItem[];
  rising: AnyShowItem[];
  weeklyTrending: AnyShowItem[];
  curatedDemand: AnyShowItem[];
  heroSlides: HeroSlide[];
  forYou: SignatureRailItem[];
  now?: Date | string | number;
}) {
  const rankingNow = getHomeDataGeneratedAt(args.now);
  const heroSeen = createHeroSeenSet(args.heroSlides);
  const softSeen = createRailSeenSet(args.forYou);
  const source = [
    ...args.trending,
    ...args.dailyTrending,
    ...args.rising,
    ...args.weeklyTrending,
  ];
  const ranked = rankHomeShows(
    toCatalogCandidates(source, (item) => isReliableHeatCandidate(item, args.now)),
    { diversityStrength: 0.18, preferFresh: true, now: rankingNow },
  );
  const candidates = ranked
    .filter((item) => getCatalogDiversityKeys(item).every((key) => !heroSeen.has(key)));
  const curatedDemand = rankHomeShows(
    toCatalogCandidates(args.curatedDemand, (item) =>
      isFreshOrReturningCandidate(item, args.now) &&
      isAvailableForHeatNow(item, args.now),
    ).filter((item) => getCatalogDiversityKeys(item).every((key) => !heroSeen.has(key))),
    { diversityStrength: 0.2, preferFresh: true, now: rankingNow },
  );
  const currentSignals = sortHeatCurrentSignals(
    curatedDemand.filter((item) => hasFreshHomeSignal(item)),
    args.now,
  );
  const quieterDemand = curatedDemand.filter((item) => !hasFreshHomeSignal(item));
  const wovenCandidates = [
    ...currentSignals,
    ...candidates.slice(0, 2),
    ...quieterDemand.slice(0, 1),
    ...candidates.slice(2),
  ];
  return buildDistinctRailCandidates(
    wovenCandidates,
    softSeen,
    quieterDemand.slice(1),
  ).slice(0, 10);
}

export function buildFreshRailCandidates(args: {
  curatedNewOrBack: AnyShowItem[];
  premieres: AnyShowItem[];
  airing: AnyShowItem[];
  rising: AnyShowItem[];
  weeklyTrending: AnyShowItem[];
  trending: AnyShowItem[];
  forYou: SignatureRailItem[];
  heroSlides: HeroSlide[];
  now?: Date | string | number;
}) {
  const rankingNow = getHomeDataGeneratedAt(args.now);
  const heroSeen = createHeroSeenSet(args.heroSlides);
  const softSeen = createRailSeenSet(args.forYou);
  const primary = toCatalogCandidates(
    [
      ...args.curatedNewOrBack,
      ...args.premieres,
      ...args.airing,
    ],
    (item) => isFreshRailCandidate(item, args.now),
  );
  const fallback = toCatalogCandidates(
    [
      ...args.premieres,
      ...args.airing,
      ...args.rising,
      ...args.weeklyTrending,
      ...args.curatedNewOrBack,
      ...args.trending,
    ],
    (item) =>
      isFreshRailCandidate(item, args.now) &&
      hasQualitySignal(item, 7.1, 25),
  );
  const buildItems = (source: CatalogItem[]) =>
    {
      const ranked = rankHomeShows(source, {
        diversityStrength: 0.2,
        preferFresh: true,
        now: rankingNow,
      });
      const distinctFromHero = ranked.filter((item) =>
        getCatalogDiversityKeys(item).every((key) => !heroSeen.has(key)),
      );
      return sortFreshRailItemsByReleaseProximity(
        buildDistinctRailCandidates(
          distinctFromHero.length >= MIN_POSTER_RAIL_ITEMS ? distinctFromHero : ranked,
          softSeen,
        ),
        args.now,
      ).slice(0, 12);
    };
  const primaryItems = buildItems(primary);
  const useFallback = shouldLoadEditorialSeedRail({
    primaryCount: primary.length,
    categoryRaw: args.premieres,
    genericSources: [args.rising, args.weeklyTrending],
  });
  if (!useFallback && primaryItems.length >= MIN_POSTER_RAIL_ITEMS) {
    return primaryItems;
  }
  const fallbackItems = buildItems(fallback);
  return keepRailIfSubstantial(
    fallbackItems.length >= MIN_POSTER_RAIL_ITEMS ? fallbackItems : primaryItems,
  );
}

export function buildForYouRailCandidates(args: {
  forYou: AnyShowItem[];
  fallback: AnyShowItem[];
  heroSlides: HeroSlide[];
  now?: Date | string | number;
}) {
  const rankingNow = getHomeDataGeneratedAt(args.now);
  const seen = createHeroSeenSet(args.heroSlides);
  const rankSource = (
    source: AnyShowItem[],
    options: { excludeChartOnly?: boolean } = {},
  ) =>
    rankHomeShows(
      dedupeHomeCandidates(source)
        .map((item) => getShow(item))
        .filter((item): item is CatalogItem => {
          if (!item) return false;
          if (!isEditorialCandidate(item)) return false;
          if (!isRecentEnoughForWindow(item, args.now, 7)) return false;
          return !(options.excludeChartOnly && hasChartOnlyHomeSignal(item));
        }),
      {
        seedKeys: args.heroSlides.map((slide) => slide.key),
        diversityStrength: 0.22,
        preferFresh: true,
        now: rankingNow,
      },
    ).filter((item) => getCatalogDiversityKeys(item).every((key) => !seen.has(key)));

  const personal = rankSource(args.forYou, { excludeChartOnly: true });
  if (personal.length >= MIN_POSTER_RAIL_ITEMS) {
    return personal.slice(0, 10);
  }
  const preferred = rankSource([...args.forYou, ...args.fallback], {
    excludeChartOnly: true,
  });
  if (preferred.length >= MIN_POSTER_RAIL_ITEMS) {
    return preferred.slice(0, 10);
  }
  return rankSource([...args.forYou, ...args.fallback]).slice(0, 10);
}

export function buildQualityRailCandidates(args: {
  critics: AnyShowItem[];
  qualitySeeds: AnyShowItem[];
  weeklyTrending: AnyShowItem[];
  rising: AnyShowItem[];
  premieres: AnyShowItem[];
  trending: AnyShowItem[];
  forYouRaw: AnyShowItem[];
  heroSlides: HeroSlide[];
  seenRails: SignatureRailItem[];
  now?: Date | string | number;
}) {
  const rankingNow = getHomeDataGeneratedAt(args.now);
  const heroSeen = createHeroSeenSet(args.heroSlides);
  const softSeen = createRailSeenSet(args.seenRails);
  const buildItems = (
    source: CatalogItem[],
    fallbackSource: CatalogItem[] = [],
  ) =>
    buildDistinctOrDemotedRailCandidates(
      rankHomeShows(source, {
        diversityStrength: 0.24,
        preferFresh: true,
        now: rankingNow,
      }).filter((item) => getCatalogDiversityKeys(item).every((key) => !heroSeen.has(key))),
      softSeen,
      rankHomeShows(fallbackSource, {
        diversityStrength: 0.24,
        preferFresh: true,
        now: rankingNow,
      }).filter((item) => getCatalogDiversityKeys(item).every((key) => !heroSeen.has(key))),
    ).slice(0, 12);

  const primary = toCatalogCandidates(
    [
      ...args.critics,
      ...args.weeklyTrending,
    ],
    (item) =>
      isEditorialCandidate(item) &&
      isRecentEnoughForWindow(item, args.now, 2) &&
      hasQualitySignal(item, 7.6, 75),
  );
  const qualityFallback = toCatalogCandidates(
    [
      ...args.qualitySeeds,
      ...args.critics,
    ],
    (item) => isReliableQualityCandidate(item, args.now),
  );
  const broadFallback = toCatalogCandidates(
    [
      ...args.weeklyTrending,
      ...args.rising,
      ...args.premieres,
      ...args.trending,
      ...args.forYouRaw,
    ],
    (item) => isReliableQualityCandidate(item, args.now),
  );
  const primaryItems = buildItems(primary);
  const useFallback = shouldLoadEditorialSeedRail({
    primaryCount: primary.length,
    categoryRaw: args.critics,
    genericSources: [args.rising, args.weeklyTrending],
  });
  if (!useFallback && primaryItems.length >= MIN_POSTER_RAIL_ITEMS) {
    return primaryItems;
  }
  const fallbackItems = buildItems(qualityFallback, broadFallback);
  return keepRailIfSubstantial(
    fallbackItems.length >= MIN_POSTER_RAIL_ITEMS ? fallbackItems : primaryItems,
  );
}

export function toRailItem(
  item: AnyShowItem,
  now?: Date | string | number,
): SignatureRailItem | null {
  const show = getShow(item);
  if (!show) return null;
  const rank = isRanked(item) ? item.rank ?? null : null;
  return {
    key: String(getHomeDataItemKey(item)),
    title: show.title,
    posterUrl: show.posterUrl ?? null,
    backdropUrl: show.backdropUrl ?? null,
    overview: show.overview ?? null,
    year: show.year ?? null,
    genreLabel: getGenreLabel(show),
    signal: getHomeShowSignal(item, now),
    rank,
  };
}

export function toCatalog(item: AnyShowItem | null | undefined): CatalogItem | null {
  return getShow(item);
}

export function buildQuickRailItems(args: {
  quickRaw: AnyShowItem[];
  quickSeedRaw: AnyShowItem[];
  risingRaw: AnyShowItem[];
  tmdbTrendingRaw: AnyShowItem[];
  heroSlides: HeroSlide[];
  forYou: SignatureRailItem[];
  heat: SignatureRailItem[];
  fresh: SignatureRailItem[];
  critics: SignatureRailItem[];
  now?: Date | string | number;
}) {
  const rankingNow = getHomeDataGeneratedAt(args.now);
  const heroSeen = createHeroSeenSet(args.heroSlides);
  const softSeen = new Set([
    ...createRailSeenSet(args.forYou),
    ...createRailSeenSet(args.heat),
    ...createRailSeenSet(args.fresh),
    ...createRailSeenSet(args.critics),
  ]);
  const primary = toCatalogCandidates(
    args.quickRaw,
    (item) =>
      isEditorialCandidate(item) &&
      isRecentEnoughForWindow(item, args.now, 5) &&
      hasQualitySignal(item, 7.1, 50),
  );
  const fallback = toCatalogCandidates(
    [...args.quickSeedRaw, ...args.quickRaw],
    (item) =>
      isEditorialCandidate(item) &&
      isRecentEnoughForWindow(item, args.now, 5) &&
      hasQualitySignal(item, 7, 50),
  );
  const buildItems = (source: CatalogItem[]) =>
    buildDistinctOrDemotedRailCandidates(
      rankHomeShows(source, {
        diversityStrength: 0.26,
        preferFresh: true,
        now: rankingNow,
      })
        .filter((item) => getCatalogDiversityKeys(item).every((key) => !heroSeen.has(key))),
      softSeen,
    )
      .map((catalog) => toRailItem(catalog as AnyShowItem, args.now))
      .filter((item): item is SignatureRailItem => Boolean(item))
      .slice(0, 12);
  const primaryItems = buildItems(primary);
  const useFallback = shouldLoadEditorialSeedRail({
    primaryCount: primary.length,
    categoryRaw: args.quickRaw,
    genericSources: [args.risingRaw, args.tmdbTrendingRaw],
  });
  if (!useFallback && primaryItems.length >= MIN_POSTER_RAIL_ITEMS) {
    return primaryItems;
  }
  const fallbackItems = buildItems(fallback);
  return keepRailIfSubstantial(
    fallbackItems.length >= MIN_POSTER_RAIL_ITEMS ? fallbackItems : primaryItems,
  );
}

export function dedupeHomeCandidates<T extends AnyShowItem>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const show = getShow(item);
    if (!show?.title) return false;
    const key = getHomeDataItemKey(item);
    const titleKey = getHomeTitleDiversityKey(show.title);
    const identityKeys = [key, titleKey].filter((value): value is string => Boolean(value));
    if (identityKeys.length === 0) return true;
    if (identityKeys.some((value) => seen.has(value))) return false;
    identityKeys.forEach((value) => seen.add(value));
    return true;
  });
}

function isFirstImpressionCandidate(
  show: CatalogItem | null | undefined,
  now?: Date | string | number,
) {
  if (!isLeadCandidate(show, now)) return false;
  if (hasFreshHomeSignal(show) && hasQualitySignal(show, 7.2, 100)) {
    return true;
  }
  if (isRecentEnoughForWindow(show, now, 1)) {
    return hasQualitySignal(show, 7.6, 400);
  }
  return isRecentEnoughForWindow(show, now, 4) && hasQualitySignal(show, 8, 500);
}

function isHeroCarouselCandidate(
  show: CatalogItem | null | undefined,
  now?: Date | string | number,
) {
  if (!isLeadCandidate(show, now)) return false;
  if (hasFreshHomeSignal(show)) return true;
  if (isRecentEnoughForWindow(show, now, 1)) {
    return hasQualitySignal(show, 7.2, 75) || hasPopularitySignal(show, 20);
  }
  return false;
}

function getHeroReleaseRecencyScore(
  show: CatalogItem | null | undefined,
  now?: Date | string | number,
) {
  if (!show || !hasReleaseWindowHomeSignal(show)) return Number.NEGATIVE_INFINITY;
  const distance = getHomeSignalReleaseDistanceDays(show, now);
  if (distance === null) return 20;
  if (distance >= -3 && distance <= 14) {
    return 100 - Math.abs(distance) * 4;
  }
  if (distance >= -14 && distance < -3) {
    return 56 - Math.abs(distance);
  }
  if (distance > 14 && distance <= 45) {
    return 42 - distance * 0.5;
  }
  return 0 - Math.abs(distance);
}

function getHeroCurrentDemandLeadScore(
  show: CatalogItem | null | undefined,
  now?: Date | string | number,
) {
  if (!show) return Number.NEGATIVE_INFINITY;
  const releaseScore = getHeroReleaseRecencyScore(show, now);
  if (!Number.isFinite(releaseScore)) return releaseScore;
  const demandScore = Math.min(
    60,
    getHomeEditorialDemandConfidenceScore(show.title) / 4,
  );
  const dailyChartRank = getHomeEditorialDailyChartRank(show.title);
  const dailyChartLeadScore =
    dailyChartRank === null ? 0 : Math.max(0, 14 - dailyChartRank);
  return releaseScore + demandScore + dailyChartLeadScore;
}

function getHeroDailyChartReason(
  title: string | null | undefined,
  signal: string | null | undefined,
) {
  const rank = getHomeEditorialDailyChartRank(title);
  if (rank === null) return null;
  if (signal?.trim().toLowerCase() === `justwatch #${rank}`) return null;
  return `JustWatch #${rank} today`;
}

function pickFreshHeroLead(
  rankedPremieres: Array<CatalogItem & { homeScore?: number }>,
  now?: Date | string | number,
) {
  const releaseWindowCandidates = rankedPremieres
    .filter(
      (item) =>
        Boolean(item.backdropUrl) &&
        hasReleaseWindowHomeSignal(item) &&
        isHeroCarouselCandidate(item, now),
    )
    .sort((left, right) => {
      const recencyDelta =
        getHeroCurrentDemandLeadScore(right, now) -
        getHeroCurrentDemandLeadScore(left, now);
      if (recencyDelta !== 0) return recencyDelta;
      return (right.homeScore ?? 0) - (left.homeScore ?? 0);
    });

  return (
    releaseWindowCandidates[0] ??
    rankedPremieres.find(
      (item) =>
        Boolean(item?.backdropUrl) && isFirstImpressionCandidate(item, now),
    ) ??
    rankedPremieres.find(
      (item) => Boolean(item?.backdropUrl) && isHeroCarouselCandidate(item, now),
    )
  );
}

export function buildHeroSlides(args: {
  trending: AnyShowItem[];
  forYou: AnyShowItem[];
  premieres: CatalogItem[];
  airing: CatalogItem[];
  now?: Date | string | number;
  /** Candidate pool size; the surface rotates a 5-slide window over it. */
  limit?: number;
}): HeroSlide[] {
  const slideLimit = args.limit ?? 5;
  const rankingNow = getHomeDataGeneratedAt(args.now);
  const seen = new Set<string>();
  const out: HeroSlide[] = [];

  const tryAdd = (item: AnyShowItem | undefined, eyebrow: HeroSlide["eyebrow"], reason?: string) => {
    if (!item) return;
    const show = getShow(item);
    if (!show) return;
    if (!show.backdropUrl && !show.posterUrl) return;
    const key = String(getHomeDataItemKey(item));
    const identityKeys = [key, getHomeTitleDiversityKey(show.title)].filter(
      (value): value is string => Boolean(value),
    );
    if (identityKeys.some((value) => seen.has(value))) return;
    identityKeys.forEach((value) => seen.add(value));
    const signal = getHomeShowSignal(item, args.now);
    out.push({
      key,
      showId: getShowId(item) ?? null,
      externalSource: show.externalSource ?? null,
      externalId: show.externalId ?? null,
      title: show.title,
      overview: show.overview ?? null,
      backdropUrl: show.backdropUrl ?? null,
      posterUrl: show.posterUrl ?? null,
      year: show.year ?? null,
      genreIds: show.genreIds ?? null,
      signal,
      eyebrow: eyebrow === "trending" && hasFreshHomeSignal(show) ? "current" : eyebrow,
      reason: reason ?? getHeroDailyChartReason(show.title, signal),
    });
  };

  const rankedForYou = rankHomeShows(
    args.forYou
      .map((item) => getShow(item))
      .filter((item): item is CatalogItem => isLeadCandidate(item, args.now)),
    {
      now: rankingNow,
      diversityStrength: 0.2,
      preferFresh: true,
    },
  );
  const rankedPremieres = rankHomeShows(
    args.premieres.filter((item) => isEditorialCandidate(item)),
    { diversityStrength: 0.18, preferFresh: true, now: rankingNow },
  );
  const rankedAiring = rankHomeShows(
    args.airing.filter(
      (item) =>
        isEditorialCandidate(item) && isRecentEnoughForWindow(item, args.now, 4),
    ),
    { diversityStrength: 0.14, preferFresh: true, now: rankingNow },
  );
  const rankedTrending = rankHomeShows(
    args.trending
      .map((item) => getShow(item))
      .filter((item): item is CatalogItem => isLeadCandidate(item, args.now)),
    { diversityStrength: 0.18, preferFresh: true, now: rankingNow },
  );

  const personalizedLead = args.forYou.find((item) => {
    const show = getShow(item);
    return (
      show &&
      rankedForYou.some((ranked) => getHomeShowKey(ranked) === getHomeShowKey(show)) &&
      (show.backdropUrl || show.posterUrl) &&
      isLeadCandidate(show, args.now) &&
      (typeof show.tmdbVoteAverage !== "number" || show.tmdbVoteAverage >= 6.5)
    );
  });

  const freshLead = pickFreshHeroLead(rankedPremieres, args.now);
  const rankedForYouHero = rankedForYou.find(
    (item) => Boolean(item?.backdropUrl) && isHeroCarouselCandidate(item, args.now),
  );
  const personalizedHero = isHeroCarouselCandidate(getShow(personalizedLead), args.now)
    ? personalizedLead
    : rankedForYouHero;
  const personalizedHeroShow = getShow(personalizedHero);
  const freshLeadHasReleaseWindow = Boolean(
    freshLead && hasReleaseWindowHomeSignal(freshLead),
  );
  const personalizedHeroHasReleaseWindow = Boolean(
    personalizedHeroShow && hasReleaseWindowHomeSignal(personalizedHeroShow),
  );

  // First impression should feel alive: let fresh researched launches outrank
  // unsignaled personalization, then still keep the personal pick nearby.
  const leadCandidate =
    freshLeadHasReleaseWindow && !personalizedHeroHasReleaseWindow
      ? freshLead
      : isFirstImpressionCandidate(getShow(personalizedHero), args.now)
        ? personalizedHero
        : freshLead ?? personalizedHero;
  tryAdd(
    leadCandidate,
    leadCandidate === personalizedHero ? "for-you" : "fresh",
  );
  if (personalizedHero) {
    tryAdd(personalizedHero, "for-you");
  }

  const trendingLead =
    args.trending.find((item) =>
      rankedTrending.some(
        (ranked) => getHomeShowKey(ranked) === getHomeShowKey(getShow(item)),
      ) &&
        Boolean(getShow(item)?.backdropUrl) &&
        isHeroCarouselCandidate(getShow(item), args.now),
    ) ??
    rankedTrending.find(
      (item) =>
        Boolean(item.backdropUrl) && isHeroCarouselCandidate(item, args.now),
    );
  tryAdd(trendingLead, "trending");

  const tonight = rankedAiring.find(
    (item) => Boolean(item?.backdropUrl) && isHeroCarouselCandidate(item, args.now),
  );
  tryAdd(tonight, "tonight");

  const fresh = rankedPremieres.find(
    (item) => Boolean(item?.backdropUrl) && isHeroCarouselCandidate(item, args.now),
  );
  tryAdd(fresh, "fresh");

  // Top up with additional diversified shows so the carousel has enough
  // candidates for its rotating window.
  for (const item of [...rankedForYou, ...rankedTrending, ...rankedPremieres]) {
    if (out.length >= slideLimit) break;
    if (!isHeroCarouselCandidate(item, args.now)) continue;
    tryAdd(item, "trending");
  }

  // Last resort: tonight.
  for (const item of rankedAiring) {
    if (out.length >= slideLimit) break;
    if (!isHeroCarouselCandidate(item, args.now)) continue;
    tryAdd(item, "fresh");
  }

  return out.slice(0, slideLimit);
}

export type HomeData = {
  hasProfile: boolean;
  isAuthenticated: boolean;
  /** Timestamp used for freshness ranking and release-window labels. */
  generatedAt: number;
  /** Logged-in user (raw from `users:me`). */
  me: {
    _id?: string;
    displayName?: string | null;
    username?: string | null;
    name?: string | null;
    avatarUrl?: string | null;
    favoriteShowIds?: string[] | null;
    countsReviews?: number | null;
    countsLogs?: number | null;
    countsWatchlist?: number | null;
    countsWatching?: number | null;
    countsCompleted?: number | null;
    countsDropped?: number | null;
    countsTotalShows?: number | null;
  } | null;
  /** Carousel slides (≤ 5). */
  heroSlides: HeroSlide[];
  /** "For You" rail items. */
  forYou: SignatureRailItem[];
  /** "Plotlist Heat" rail items. */
  heat: SignatureRailItem[];
  /** Current and recent premieres. */
  fresh: SignatureRailItem[];
  /** High-quality recent series with strong audience signals. */
  critics: SignatureRailItem[];
  /** Shorter, lower-commitment picks. */
  quick: SignatureRailItem[];
  /** Streaming room cards. */
  streamingRooms: ProviderRoom[];
  /** Batched catalog freshness diagnostics, kept for local QA and observability. */
  catalogDiagnostics: HomeCatalogDiagnostics;
  /** Loading flags for skeletons. */
  loading: {
    hero: boolean;
    forYou: boolean;
    heat: boolean;
    fresh: boolean;
    critics: boolean;
    quick: boolean;
    rooms: boolean;
  };
  /** Trigger a manual refresh. */
  refresh: () => Promise<void>;
  /** Friends-related data. */
  contactMatches: any[];
  similarTaste: any[];
  suggested: any[];
  feedItems: FeedItemProps[];
  feedEmpty: boolean;
  /** Contact sync state for the small nudge pill. */
  showContactSyncNudge: boolean;
  /** Whether contacts have been synced at least once. */
  hasSyncedContacts: boolean;
  /** Whether contact sync status has loaded. */
  contactStatusKnown: boolean;
  /** Lookup helper to resolve a show item back to a catalog payload. */
  getCatalogForKey: (key: string) => CatalogItem | null;
};

export function useHomeData(): HomeData {
  const { isAuthenticated } = useAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const hasProfile = Boolean(me?._id);

  const trendingRaw =
    useQuery(api.trending.shows, { windowHours: 96, limit: 10 }) ?? [];

  const {
    results: feed,
    status: feedStatus,
  } = usePaginatedQuery(
    api.feed.listForUser,
    hasProfile ? {} : "skip",
    { initialNumItems: 6 },
  );

  const contactStatus =
    useQuery(api.contacts.getStatus, hasProfile ? {} : "skip") ?? null;
  const contactMatches =
    useQuery(
      api.contacts.getMatches,
      hasProfile && contactStatus?.hasSynced ? { limit: 4 } : "skip",
    ) ?? [];
  const suggested =
    useQuery(api.users.suggested, hasProfile ? { limit: 4 } : "skip") ?? [];

  const getHomeCatalog = useAction(api.shows.getHomeCatalog);
  const getTmdbList = useAction(api.shows.getTmdbList);
  const getPersonalized = useAction(api.embeddings.getPersonalizedRecommendations);
  const getSimilarTasteUsers = useAction(api.embeddings.getSimilarTasteUsers);

  const [forYouRaw, setForYouRaw] = useState<AnyShowItem[]>([]);
  const [risingRaw, setRisingRaw] = useState<CatalogItem[]>([]);
  const [premieresRaw, setPremieresRaw] = useState<CatalogItem[]>([]);
  const [criticsRaw, setCriticsRaw] = useState<CatalogItem[]>([]);
  const [quickRaw, setQuickRaw] = useState<CatalogItem[]>([]);
  const [currentDemandSeedRaw, setCurrentDemandSeedRaw] = useState<CatalogItem[]>([]);
  const [newOrBackSeedRaw, setNewOrBackSeedRaw] = useState<CatalogItem[]>([]);
  const [qualitySeedRaw, setQualitySeedRaw] = useState<CatalogItem[]>([]);
  const [quickSeedRaw, setQuickSeedRaw] = useState<CatalogItem[]>([]);
  const [airingRaw, setAiringRaw] = useState<CatalogItem[]>([]);
  const [tmdbDailyTrendingRaw, setTmdbDailyTrendingRaw] = useState<CatalogItem[]>([]);
  const [tmdbTrendingRaw, setTmdbTrendingRaw] = useState<CatalogItem[]>([]);
  const [providerCatalogProviders, setProviderCatalogProviders] = useState<
    HomeCatalogPayload["providers"] | null
  >(null);
  const [catalogDiagnostics, setCatalogDiagnostics] = useState<HomeCatalogDiagnostics>(
    () => getEmptyHomeCatalogDiagnostics(),
  );
  const [similarTaste, setSimilarTaste] = useState<any[]>([]);

  const [refreshKey, setRefreshKey] = useState(0);
  const [editorialSeedNow, setEditorialSeedNow] = useState(() => Date.now());

  const [forYouLoading, setForYouLoading] = useState(true);
  const [risingLoading, setRisingLoading] = useState(true);
  const [premieresLoading, setPremieresLoading] = useState(true);
  const [criticsLoading, setCriticsLoading] = useState(true);
  const [quickLoading, setQuickLoading] = useState(true);
  const [tmdbDailyTrendingLoading, setTmdbDailyTrendingLoading] = useState(true);
  const [tmdbTrendingLoading, setTmdbTrendingLoading] = useState(true);
  const [roomsLoading, setRoomsLoading] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setEditorialSeedNow(Date.now());
    }, EDITORIAL_SEED_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Discovery + provider loaders (tied to authentication, so cold start fires once).
  useEffect(() => {
    if (!isAuthenticated) {
      setForYouRaw([]);
      setRisingRaw([]);
      setPremieresRaw([]);
      setCriticsRaw([]);
      setQuickRaw([]);
      setAiringRaw([]);
      setTmdbDailyTrendingRaw([]);
      setTmdbTrendingRaw([]);
      setProviderCatalogProviders(null);
      setCatalogDiagnostics(getEmptyHomeCatalogDiagnostics());
      setForYouLoading(false);
      setRisingLoading(false);
      setPremieresLoading(false);
      setCriticsLoading(false);
      setQuickLoading(false);
      setTmdbDailyTrendingLoading(false);
      setTmdbTrendingLoading(false);
      setRoomsLoading(false);
      return;
    }

    let cancelled = false;
    setForYouLoading(true);
    setRisingLoading(true);
    setPremieresLoading(true);
    setCriticsLoading(true);
    setQuickLoading(true);
    setTmdbDailyTrendingLoading(true);
    setTmdbTrendingLoading(true);
    setRoomsLoading(true);

    const run = async <T,>(
      loader: () => Promise<T>,
      onSuccess: (value: T) => void,
      onSettled?: () => void,
    ) => {
      try {
        const value = await loader();
        if (!cancelled) onSuccess(value);
      } catch {
        // Swallow rail-level errors; sibling rails keep rendering.
      } finally {
        if (!cancelled) onSettled?.();
      }
    };

    void run(
      () => getPersonalized({ limit: 12 }),
      (value) => {
        setForYouRaw(value);
      },
      () => setForYouLoading(false),
    );

    void run(
      () => loadHomeCatalog(getHomeCatalog, getTmdbList),
      (payload) => {
        setRisingRaw(payload.risingNow ?? []);
        setPremieresRaw(payload.breakoutPremieres ?? []);
        setCriticsRaw(payload.criticsChoice ?? []);
        setQuickRaw(payload.quickPicks ?? []);
        setAiringRaw(payload.airingToday ?? []);
        setTmdbDailyTrendingRaw(payload.trendingDay ?? []);
        setTmdbTrendingRaw(payload.trendingWeek ?? []);
        setProviderCatalogProviders(payload.providers ?? {});
        setCatalogDiagnostics(payload.diagnostics);
      },
      () => {
        setRisingLoading(false);
        setPremieresLoading(false);
        setCriticsLoading(false);
        setQuickLoading(false);
        setTmdbDailyTrendingLoading(false);
        setTmdbTrendingLoading(false);
        setRoomsLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [getHomeCatalog, getPersonalized, getTmdbList, isAuthenticated, refreshKey]);

  useEffect(() => {
    if (!isAuthenticated) {
      setCurrentDemandSeedRaw([]);
      setNewOrBackSeedRaw([]);
      setQualitySeedRaw([]);
      setQuickSeedRaw([]);
      return;
    }

    const payload = getRuntimeHomeEditorialSeedPayload(editorialSeedNow);
    setCurrentDemandSeedRaw(payload.currentDemandSeeds);
    setNewOrBackSeedRaw(payload.newOrBackSeeds);
    setQualitySeedRaw(payload.qualitySeeds);
    setQuickSeedRaw(payload.quickSeeds);
  }, [editorialSeedNow, isAuthenticated]);

  const streamingProviderKeys = useMemo(
    () => normalizeStreamingProviderKeys(me?.streamingProviders),
    [me?.streamingProviders],
  );
  const streamingAvailability = useMemo(
    () => buildStreamingAvailabilityIndex(providerCatalogProviders, streamingProviderKeys),
    [providerCatalogProviders, streamingProviderKeys],
  );

  const providerSections = useMemo(
    () =>
      isAuthenticated && providerCatalogProviders
        ? filterSectionsToStreamingProviders(
            buildProviderSectionsFromCatalog(providerCatalogProviders, {
              now: editorialSeedNow,
            }),
            streamingProviderKeys,
          )
        : [],
    [editorialSeedNow, isAuthenticated, providerCatalogProviders, streamingProviderKeys],
  );

  // Similar taste users (only for authenticated users with profile).
  useEffect(() => {
    if (!hasProfile) {
      setSimilarTaste([]);
      return;
    }

    let cancelled = false;
    void getSimilarTasteUsers({ limit: 6 })
      .then((value) => {
        if (!cancelled) setSimilarTaste(value);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [getSimilarTasteUsers, hasProfile, refreshKey]);

  // Build hero slides from a curated blend: an 8-candidate pool with a
  // rotating 5-slide window, so the carousel line-up (including the lead)
  // changes across visits instead of pinning the same five all day.
  const heroSlides = useMemo(
    () =>
      selectHeroSlidesForEpoch(
        buildHeroSlides({
          trending:
            trendingRaw.length > 0
              ? trendingRaw
              : tmdbDailyTrendingRaw.length > 0
                ? tmdbDailyTrendingRaw
                : risingRaw.length > 0
                  ? risingRaw
                  : tmdbTrendingRaw,
          forYou: forYouRaw,
          premieres: [...newOrBackSeedRaw, ...premieresRaw],
          airing: airingRaw,
          now: editorialSeedNow,
          limit: 8,
        }),
        { now: editorialSeedNow, count: 5, leadPoolSize: 3 },
      ),
    [
      trendingRaw,
      tmdbDailyTrendingRaw,
      risingRaw,
      tmdbTrendingRaw,
      forYouRaw,
      newOrBackSeedRaw,
      premieresRaw,
      airingRaw,
      editorialSeedNow,
    ],
  );

  const forYou = useMemo(() => {
    const candidates = buildForYouRailCandidates({
      forYou: forYouRaw,
      fallback: [
        ...(risingRaw as AnyShowItem[]),
        ...(premieresRaw as AnyShowItem[]),
        ...(criticsRaw as AnyShowItem[]),
        ...(tmdbTrendingRaw as AnyShowItem[]),
      ],
      heroSlides,
      now: editorialSeedNow,
    });
    // Picks lean toward the user's streaming services: candidates known to
    // stream on them come first, relative order otherwise preserved.
    const items = leanItemsToStreamingAvailability(
      candidates,
      streamingAvailability,
      (catalog) =>
        (catalog?.externalSource ?? "tmdb") === "tmdb" ? catalog?.externalId : null,
    )
      .map((catalog) => toRailItem(catalog, editorialSeedNow))
      .filter((item): item is SignatureRailItem => Boolean(item))
      .slice(0, 10);
    // Keep the strongest personal pick leading; rotate the rest per epoch.
    return rotateHomeRailForEpoch(items, "for-you", {
      now: editorialSeedNow,
      keepTop: 1,
    });
  }, [
    forYouRaw,
    risingRaw,
    premieresRaw,
    criticsRaw,
    tmdbTrendingRaw,
    heroSlides,
    editorialSeedNow,
    streamingAvailability,
  ]);

  const heat = useMemo(() => {
    const items = buildHeatRailCandidates({
      trending: trendingRaw,
      dailyTrending: tmdbDailyTrendingRaw,
      rising: risingRaw as AnyShowItem[],
      weeklyTrending: tmdbTrendingRaw as AnyShowItem[],
      curatedDemand: currentDemandSeedRaw,
      heroSlides,
      forYou,
      now: editorialSeedNow,
    })
      .map((catalog) => toRailItem(catalog, editorialSeedNow))
      .filter((item): item is SignatureRailItem => Boolean(item))
      .slice(0, 10);
    // Heat reads like a chart, so its top three stay anchored; only the tail
    // rotates through the day.
    return rotateHomeRailForEpoch(items, "heat", {
      now: editorialSeedNow,
      keepTop: 3,
    });
  }, [
    trendingRaw,
    tmdbDailyTrendingRaw,
    risingRaw,
    tmdbTrendingRaw,
    currentDemandSeedRaw,
    heroSlides,
    forYou,
    editorialSeedNow,
  ]);

  const fresh = useMemo(() => {
    const primary = buildFreshRailCandidates({
      curatedNewOrBack: newOrBackSeedRaw as AnyShowItem[],
      premieres: premieresRaw as AnyShowItem[],
      airing: airingRaw as AnyShowItem[],
      rising: risingRaw as AnyShowItem[],
      weeklyTrending: tmdbTrendingRaw as AnyShowItem[],
      trending: trendingRaw,
      forYou,
      heroSlides,
      now: editorialSeedNow,
    })
      .map((catalog) => toRailItem(catalog as AnyShowItem, editorialSeedNow))
      .filter((item): item is SignatureRailItem => Boolean(item))
      .slice(0, 12);
    const items = appendFreshEditorialTopUpRailItems(
      primary,
      newOrBackSeedRaw as AnyShowItem[],
      editorialSeedNow,
    ).slice(0, 12);
    // The nearest releases stay up front; the longer tail rotates per epoch.
    return rotateHomeRailForEpoch(items, "fresh", {
      now: editorialSeedNow,
      keepTop: 2,
    });
  }, [
    premieresRaw,
    airingRaw,
    risingRaw,
    tmdbTrendingRaw,
    newOrBackSeedRaw,
    trendingRaw,
    heroSlides,
    forYou,
    editorialSeedNow,
  ]);

  const critics = useMemo(() => {
    const items = buildQualityRailCandidates({
      critics: criticsRaw as AnyShowItem[],
      qualitySeeds: qualitySeedRaw as AnyShowItem[],
      weeklyTrending: tmdbTrendingRaw as AnyShowItem[],
      rising: risingRaw as AnyShowItem[],
      premieres: premieresRaw as AnyShowItem[],
      trending: trendingRaw,
      forYouRaw,
      heroSlides,
      seenRails: [...forYou, ...heat, ...fresh],
      now: editorialSeedNow,
    })
      .map((catalog) => toRailItem(catalog as AnyShowItem, editorialSeedNow))
      .filter((item): item is SignatureRailItem => Boolean(item))
      .slice(0, 12);
    return rotateHomeRailForEpoch(items, "critics", {
      now: editorialSeedNow,
      keepTop: 1,
    });
  }, [
    criticsRaw,
    tmdbTrendingRaw,
    qualitySeedRaw,
    risingRaw,
    premieresRaw,
    trendingRaw,
    forYouRaw,
    heroSlides,
    forYou,
    heat,
    fresh,
    editorialSeedNow,
  ]);

  const quick = useMemo(() => {
    const items = buildQuickRailItems({
      quickRaw: quickRaw as AnyShowItem[],
      quickSeedRaw: quickSeedRaw as AnyShowItem[],
      risingRaw: risingRaw as AnyShowItem[],
      tmdbTrendingRaw: tmdbTrendingRaw as AnyShowItem[],
      heroSlides,
      forYou,
      heat,
      fresh,
      critics,
      now: editorialSeedNow,
    });
    return rotateHomeRailForEpoch(items, "quick", {
      now: editorialSeedNow,
      keepTop: 1,
    });
  }, [
    quickRaw,
    quickSeedRaw,
    risingRaw,
    tmdbTrendingRaw,
    heroSlides,
    forYou,
    heat,
    fresh,
    critics,
    editorialSeedNow,
  ]);

  // Build a lookup table to resolve rail/hero item keys to catalog payloads.
  const catalogIndex = useMemo(() => {
    const index = new Map<string, CatalogItem>();
    const collect = (items: AnyShowItem[]) => {
      items.forEach((item) => {
        const show = toCatalog(item);
        if (show) {
          index.set(String(getHomeDataItemKey(item)), show);
        }
      });
    };
    collect(trendingRaw);
    collect(forYouRaw);
    collect(risingRaw as AnyShowItem[]);
    collect(premieresRaw as AnyShowItem[]);
    collect(criticsRaw as AnyShowItem[]);
    collect(quickRaw as AnyShowItem[]);
    collect(currentDemandSeedRaw as AnyShowItem[]);
    collect(newOrBackSeedRaw as AnyShowItem[]);
    collect(qualitySeedRaw as AnyShowItem[]);
    collect(quickSeedRaw as AnyShowItem[]);
    collect(airingRaw as AnyShowItem[]);
    collect(tmdbDailyTrendingRaw as AnyShowItem[]);
    collect(tmdbTrendingRaw as AnyShowItem[]);
    providerSections.forEach((section) =>
      collect(section.items as AnyShowItem[]),
    );
    return index;
  }, [
    trendingRaw,
    forYouRaw,
    risingRaw,
    premieresRaw,
    criticsRaw,
    quickRaw,
    currentDemandSeedRaw,
    newOrBackSeedRaw,
    qualitySeedRaw,
    quickSeedRaw,
    airingRaw,
    tmdbDailyTrendingRaw,
    tmdbTrendingRaw,
    providerSections,
  ]);

  const getCatalogForKey = useCallback(
    (key: string) => catalogIndex.get(key) ?? null,
    [catalogIndex],
  );

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["plotlist-rpc"] });
    setEditorialSeedNow(Date.now());
    setRefreshKey((current) => current + 1);
  }, []);

  const showContactSyncNudge =
    hasProfile && contactStatus?.hasSynced === false;

  const feedItems = useMemo(() => {
    const cutoff = Date.now() - FRESH_FEED_WINDOW_MS;
    return feed
      .flatMap((item: any) => {
        if (typeof item?.timestamp !== "number" || item.timestamp < cutoff) return [];
        const feedItem = toHomeFeedItem(item);
        return feedItem ? [feedItem] : [];
      })
      .slice(0, 6);
  }, [feed]);
  const feedEmpty = feedItems.length === 0 && feedStatus !== "LoadingFirstPage";

  const heroLoading = heroSlides.length === 0 && (forYouLoading || tmdbTrendingLoading);

  return {
    hasProfile,
    isAuthenticated,
    generatedAt: editorialSeedNow,
    me: me ?? null,
    heroSlides,
    forYou,
    heat,
    fresh,
    critics,
    quick,
    streamingRooms: providerSections,
    catalogDiagnostics,
    loading: {
      hero: heroLoading,
      forYou: forYouLoading,
      heat:
        trendingRaw.length === 0 &&
        tmdbDailyTrendingRaw.length === 0 &&
        (tmdbDailyTrendingLoading || risingLoading || tmdbTrendingLoading),
      fresh: premieresLoading,
      critics: criticsLoading,
      quick: quickLoading,
      rooms: roomsLoading,
    },
    refresh,
    contactMatches,
    similarTaste,
    suggested,
    feedItems,
    feedEmpty,
    showContactSyncNudge,
    hasSyncedContacts: Boolean(contactStatus?.hasSynced),
    contactStatusKnown: Boolean(contactStatus),
    getCatalogForKey,
  };
}

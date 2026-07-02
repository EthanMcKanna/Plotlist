import {
  getHomeEditorialDemandConfidenceScore,
  getHomeEditorialProviderSeedItems,
  type HomeEditorialProviderKey,
} from "./homeEditorialSeeds";
import {
  getHomeSignalReleaseDistanceDays,
  hasChartOnlyHomeSignal,
  hasExplicitCurrentHomeSignal,
  hasReleaseWindowHomeSignal,
  isHomeReleaseWindowNear,
} from "./homeCurrentSignal";
import { rankHomeShows } from "./homeRanking";

export type ProviderCatalogItem = {
  externalSource?: string | null;
  externalId?: string | null;
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
  homeScore?: number | null;
  updatedAt?: number | null;
};

const DEFAULT_PROVIDER_PAGE_SIZE = 20;

function normalizeTitle(title: string) {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getProviderCatalogItemKey(item: ProviderCatalogItem) {
  if (item.externalSource && item.externalId) {
    return `${item.externalSource}:${item.externalId}`;
  }
  return `title:${normalizeTitle(item.title)}`;
}

export function getProviderCatalogSignalLabel(item: ProviderCatalogItem) {
  const signal = item.homeSignal?.trim();
  return signal ? signal : null;
}

export function pinProviderCatalogTitle(
  items: ProviderCatalogItem[],
  title: string | null | undefined,
) {
  const targetTitle = title?.trim();
  if (!targetTitle) return items;

  const targetKey = normalizeTitle(targetTitle);
  const index = items.findIndex((item) => normalizeTitle(item.title) === targetKey);
  if (index <= 0) return items;

  return [items[index], ...items.slice(0, index), ...items.slice(index + 1)];
}

function getProviderFreshnessScore(
  show: ProviderCatalogItem,
  now?: Date | string | number,
) {
  const distance = getHomeSignalReleaseDistanceDays(show, now);
  if (
    show.editorialTier === "verified_current" &&
    isHomeReleaseWindowNear(show, { now, maxPastDays: 7, maxFutureDays: 14 })
  ) {
    return 180 - Math.abs(distance ?? 0) * 4;
  }
  if (isHomeReleaseWindowNear(show, { now, maxPastDays: 7, maxFutureDays: 14 })) {
    return 145 - Math.abs(distance ?? 0) * 4;
  }
  if (
    hasReleaseWindowHomeSignal(show) &&
    typeof distance === "number" &&
    distance > 14 &&
    distance <= 45
  ) {
    return 95 - distance;
  }
  if (
    hasReleaseWindowHomeSignal(show) &&
    distance === null &&
    hasExplicitCurrentHomeSignal(show, { now })
  ) {
    return 130;
  }
  if (hasChartOnlyHomeSignal(show)) return 75;
  if (hasExplicitCurrentHomeSignal(show, { now })) return 60;
  return 0;
}

export function mergeProviderCatalogItems({
  providerKey,
  pages,
  now = new Date(),
}: {
  providerKey: HomeEditorialProviderKey;
  pages: ProviderCatalogItem[][];
  now?: Date | string | number;
}) {
  const seenKeys = new Set<string>();
  const seenTitles = new Set<string>();
  const seeded = getHomeEditorialProviderSeedItems(providerKey, now);
  const seedKeys = seeded.map(getProviderCatalogItemKey);
  const rankNow =
    typeof now === "number" ? now : new Date(now).getTime();
  const merged = [...seeded, ...pages.flat()];

  const deduped = merged.filter((item) => {
    if (!item?.title) return false;
    const key = getProviderCatalogItemKey(item);
    const titleKey = normalizeTitle(item.title);
    if (seenKeys.has(key) || seenTitles.has(titleKey)) {
      return false;
    }
    seenKeys.add(key);
    seenTitles.add(titleKey);
    return true;
  });

  return rankHomeShows(deduped, {
    diversityStrength: 0.12,
    now: Number.isFinite(rankNow) ? rankNow : Date.now(),
    preferFresh: true,
    seedKeys,
  }).sort((left, right) => {
    const signalDelta =
      getProviderFreshnessScore(right, now) -
      getProviderFreshnessScore(left, now);
    if (signalDelta !== 0) return signalDelta;
    const demandDelta =
      getHomeEditorialDemandConfidenceScore(right.title) -
      getHomeEditorialDemandConfidenceScore(left.title);
    if (demandDelta !== 0) return demandDelta;
    return (right.homeScore ?? 0) - (left.homeScore ?? 0);
  });
}

export function hasProviderCatalogMore(
  page: ProviderCatalogItem[],
  pageSize = DEFAULT_PROVIDER_PAGE_SIZE,
) {
  return page.length >= pageSize;
}

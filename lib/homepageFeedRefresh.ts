import {
  auditHomeRailHealth,
  type HomeRailHealthReport,
  type HomeRailHealthItem,
} from "./homeRailHealth";
import type { HomeEditorialSeedAuditReport } from "./homeEditorialSeeds";
import type { HomeEditorialProviderKey } from "./homeEditorialSeeds";
import {
  auditHomeEditorialSeeds,
  getHomeEditorialCurrentDemandSeedItems,
  getHomeEditorialDemandConfidenceScore,
  getHomeEditorialSeedItems,
  getHomeEditorialPlatformKeyByTitle,
  HOME_EDITORIAL_RESEARCH_SOURCES,
  HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART,
  HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART_TITLES,
} from "./homeEditorialSeeds";
import type { HomeCuratedEditAuditReport } from "./homeCuratedEdits";
import {
  auditHomeCuratedEdits,
  buildHomeCuratedEdits,
  type HomeCuratedEdit,
  type HomeCuratedEditItem,
} from "./homeCuratedEdits";
import type {
  HomeSurfaceAuditInputs,
  HomeSurfaceAuditItem,
} from "./homeSurfaceAudit";
import {
  auditHomeSurfaceRender,
  type HomeSurfaceAuditReport,
} from "./homeSurfaceAudit";
import {
  getHomepageCatalogDiagnostics,
  getHomepageCatalogItemsByCategory,
  HOMEPAGE_CATALOG_HEALTH_CATEGORIES,
} from "./homepageCatalogHealth";
import {
  getProviderCatalogItemKey,
  mergeProviderCatalogItems,
  type ProviderCatalogItem,
} from "./providerDiscovery";
import {
  getHomeRailIdentityKeys,
  getHomeRailTitleKey,
  limitHomeRoomItemsByTitleAppearances,
} from "./homeRailIdentity";
import {
  getHomeSignalReleaseDistanceDays,
  hasChartOnlyHomeSignal,
  hasReleaseWindowHomeSignal,
} from "./homeCurrentSignal";
import { buildColdStartHomeShelfItems } from "./homeStarterShelf";
import {
  sortProviderRoomItemsForFreshness,
  sortProviderRoomsForFreshness,
} from "./providerRoomFreshness";

export type HomepageFeedRefreshCategoryResult = {
  category: string;
  itemCount: number;
  health: HomeRailHealthReport;
};

export type HomepageFeedRefreshDegradedCategory = {
  category: string;
  itemCount: number;
  issues: HomeRailHealthReport["issues"];
  uniqueItemCount: number;
  missingArtworkCount: number;
  recentItemCount: number | null;
};

export type HomepageFeedRefreshActionOwner =
  | "catalog"
  | "editorial"
  | "curation"
  | "surface";

export type HomepageFeedRefreshActionItem = {
  owner: HomepageFeedRefreshActionOwner;
  severity: "critical" | "warning";
  code: string;
  message: string;
  category?: string;
  editKey?: string;
  group?: string;
  sectionKey?: string;
  effectiveAt?: string;
  relatedTitles?: string[];
  sourceCheckedAt?: string;
  sourceId?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  title?: string;
};

export type HomepageFeedRefreshSummaryOptions = {
  actionItems?: HomepageFeedRefreshActionItem[];
  forceUnhealthy?: boolean;
};

export type HomepageFeedRefreshFreshnessSummary = {
  currentDemandDailyChart: {
    sourceId: string;
    sourceCheckedAt: string;
    sourceLabel?: string;
    sourceUrl?: string;
    maxAgeDays: number;
    staleAt: string | null;
    daysUntilStale: number | null;
    titleCount: number;
    titles: string[];
  };
  currentDemandCoverage: {
    activeTitleCount: number | null;
    platformCount: number | null;
    primaryGenreCount: number | null;
    nonfictionCount: number | null;
    findingCount: number;
    warningCount: number;
  };
};

export type HomepageFeedRefreshCronSummaryOptions = {
  catalogActionFailed?: boolean;
};

export type HomepageEditorialSurfaceFallbacks = {
  heat: HomeSurfaceAuditItem[];
  fresh: HomeSurfaceAuditItem[];
  critics: HomeSurfaceAuditItem[];
  quick: HomeSurfaceAuditItem[];
};

export type HomepageProviderRoomAuditConfig = {
  key: HomeEditorialProviderKey;
  category: string;
  label: string;
};

export const HOMEPAGE_PROVIDER_ROOM_AUDIT_CONFIGS: HomepageProviderRoomAuditConfig[] = [
  { key: "netflix", category: "netflix", label: "Netflix" },
  { key: "apple_tv", category: "apple_tv", label: "Apple TV+" },
  { key: "max", category: "max", label: "Max" },
  { key: "disney_plus", category: "disney_plus", label: "Disney+" },
  { key: "hulu", category: "hulu", label: "Hulu" },
  { key: "peacock", category: "peacock", label: "Peacock" },
  { key: "prime_video", category: "prime_video", label: "Prime Video" },
  { key: "paramount_plus", category: "paramount_plus", label: "Paramount+" },
  { key: "mgm_plus", category: "mgm_plus", label: "MGM+" },
];

const MIN_PROVIDER_ROOM_AUDIT_ITEMS = 3;
const MIN_PERSONAL_SURFACE_AUDIT_ITEMS = 3;
const MIN_HEAT_SURFACE_AUDIT_ITEMS = 3;
const MIN_FRESH_SURFACE_AUDIT_ITEMS = 4;
const MAX_PROVIDER_ROOM_SURFACE_TITLE_APPEARANCES = 1;
const MAX_SURFACE_AUDIT_TITLE_APPEARANCES = 3;
const TARGET_EDITORIAL_SURFACE_FALLBACK_ITEMS = 6;
const TARGET_HEAT_SURFACE_AUDIT_SOURCE_ITEMS = 20;
const TARGET_FRESH_SURFACE_AUDIT_SOURCE_ITEMS = 12;
const TARGET_PROVIDER_ROOM_AUDIT_ITEMS = 6;
const MIN_CURATED_EDIT_AUDIT_ITEMS = 3;
const TARGET_CURATED_EDIT_AUDIT_ITEMS = 4;

function getRailHealthShow(item: HomeRailHealthItem) {
  return item.show ?? item;
}

function toProviderCatalogItem(
  item: HomeRailHealthItem,
): ProviderCatalogItem | null {
  const show = getRailHealthShow(item) as ProviderCatalogItem;
  const title = show.title?.trim();
  if (!title) return null;

  return {
    ...show,
    title,
    externalSource: show.externalSource ?? "tmdb",
    externalId: show.externalId ?? null,
    posterUrl: show.posterUrl ?? null,
    backdropUrl: show.backdropUrl ?? null,
    year: show.year ?? null,
    overview: show.overview ?? null,
    homeSignal: show.homeSignal ?? null,
  };
}

function toSurfaceAuditItem(item: ProviderCatalogItem): HomeSurfaceAuditItem {
  return {
    key: getProviderCatalogItemKey(item),
    title: item.title,
    posterUrl: item.posterUrl ?? null,
    backdropUrl: item.backdropUrl ?? null,
    year: item.year ?? null,
    signal: item.homeSignal ?? null,
    editorialTier: item.editorialTier ?? null,
    homeScore: item.homeScore ?? null,
  };
}

function toEditorialSurfaceFallbackItem(
  item: ReturnType<typeof getHomeEditorialSeedItems>[number],
): HomeSurfaceAuditItem {
  return {
    key: getProviderCatalogItemKey(item),
    title: item.title,
    posterUrl: item.posterUrl ?? null,
    backdropUrl: item.backdropUrl ?? null,
    year: item.year ?? null,
    signal: item.homeSignal ?? null,
    editorialTier: item.editorialTier ?? null,
  };
}

function interleaveSurfaceItemsByPlatform<T extends HomeSurfaceAuditItem>(
  items: T[],
  now: Date | string | number,
) {
  const buckets = new Map<string, T[]>();
  const platformOrder: string[] = [];
  const platformBestScores = new Map<string, number>();

  items.forEach((item) => {
    const platform = getHomeEditorialPlatformKeyByTitle(item.title, now) ?? "unknown";
    if (!buckets.has(platform)) {
      buckets.set(platform, []);
      platformOrder.push(platform);
    }
    buckets.get(platform)?.push(item);
    platformBestScores.set(
      platform,
      Math.max(
        platformBestScores.get(platform) ?? Number.NEGATIVE_INFINITY,
        getSurfaceFallbackSignalScore(item, now),
      ),
    );
  });

  buckets.forEach((bucket) => {
    bucket.sort(
      (left, right) =>
        getSurfaceFallbackSignalScore(right, now) -
        getSurfaceFallbackSignalScore(left, now),
    );
  });
  platformOrder.sort(
    (left, right) =>
      (platformBestScores.get(right) ?? 0) -
      (platformBestScores.get(left) ?? 0),
  );

  const interleaved: T[] = [];
  let added = true;
  while (added) {
    added = false;
    platformOrder.forEach((platform) => {
      const bucket = buckets.get(platform);
      const next = bucket?.shift();
      if (!next) return;
      interleaved.push(next);
      added = true;
    });
  }

  return interleaved;
}

function getSurfaceFallbackSignalScore(
  item: HomeSurfaceAuditItem,
  now: Date | string | number,
) {
  const demandBoost = Math.min(
    120,
    Math.floor(getHomeEditorialDemandConfidenceScore(item.title) / 2),
  );
  if (hasChartOnlyHomeSignal(item)) return 84 + demandBoost;
  if (hasReleaseWindowHomeSignal(item)) {
    const distance = getHomeSignalReleaseDistanceDays(item, now);
    if (distance === null) return 86;
    if (distance >= -3 && distance <= 7) {
      return 132 - Math.abs(distance) * 4 + demandBoost;
    }
    if (distance >= -14 && distance < -3) {
      return 96 - Math.abs(distance) + demandBoost;
    }
    if (distance > 7 && distance <= 45) {
      return 82 - Math.min(40, distance) + demandBoost;
    }
    return (
      (demandBoost >= 80 ? 92 : 34 - Math.min(34, Math.abs(distance))) +
      demandBoost
    );
  }
  return item.signal?.trim() ? 48 + demandBoost : demandBoost;
}

function avoidLeadingSurfaceFallbackOverlap<T extends HomeSurfaceAuditItem>(
  items: T[],
  leadingItems: HomeSurfaceAuditItem[],
  minimumDistinctItems: number,
) {
  const blockedTitleKeys = new Set(
    leadingItems
      .slice(0, minimumDistinctItems)
      .map((item) => getHomeRailTitleKey(item.title))
      .filter((key): key is string => Boolean(key)),
  );
  const freshFirst = items.filter((item) => {
    const titleKey = getHomeRailTitleKey(item.title);
    return !titleKey || !blockedTitleKeys.has(titleKey);
  });
  const deferred = items.filter((item) => {
    const titleKey = getHomeRailTitleKey(item.title);
    return Boolean(titleKey && blockedTitleKeys.has(titleKey));
  });

  return freshFirst.length >= minimumDistinctItems
    ? [...freshFirst, ...deferred]
    : items;
}

export function buildHomepageEditorialSurfaceFallbacks(
  now: Date | string | number = Date.now(),
): HomepageEditorialSurfaceFallbacks {
  const heat = interleaveSurfaceItemsByPlatform(
    getHomeEditorialCurrentDemandSeedItems(now).map(
      toEditorialSurfaceFallbackItem,
    ),
    now,
  );
  const fresh = getHomeEditorialSeedItems("newOrBack", now).map(
    toEditorialSurfaceFallbackItem,
  );
  const releaseFresh = fresh.filter(
    (item) => !item.signal?.trim() || hasReleaseWindowHomeSignal(item),
  );
  const nonReleaseFresh = fresh.filter(
    (item) => item.signal?.trim() && !hasReleaseWindowHomeSignal(item),
  );

  return {
    heat,
    fresh: avoidLeadingSurfaceFallbackOverlap(
      [...releaseFresh, ...nonReleaseFresh],
      heat,
      TARGET_EDITORIAL_SURFACE_FALLBACK_ITEMS,
    ),
    critics: getHomeEditorialSeedItems("quality", now).map(
      toEditorialSurfaceFallbackItem,
    ),
    quick: getHomeEditorialSeedItems("quick", now).map(
      toEditorialSurfaceFallbackItem,
    ),
  };
}

export function topUpHomepageSurfaceAuditItems<T extends HomeSurfaceAuditItem>(
  primary: T[],
  fallback: T[],
  targetItems: number,
) {
  const picked: T[] = [];
  const seen = new Set<string>();
  const add = (item: T) => {
    if (picked.length >= targetItems) return;
    const keys = getHomeRailIdentityKeys(item);
    if (keys.some((key) => seen.has(key))) return;
    keys.forEach((key) => seen.add(key));
    picked.push(item);
  };

  primary.forEach(add);
  fallback.forEach(add);
  return picked;
}

export function buildHomepageProviderRoomAuditInputs(
  itemByCategory: Map<string, HomeRailHealthItem[]>,
  now = Date.now(),
): NonNullable<HomeSurfaceAuditInputs["rooms"]> {
  return HOMEPAGE_PROVIDER_ROOM_AUDIT_CONFIGS.flatMap((provider) => {
    const items = mergeProviderCatalogItems({
      providerKey: provider.key,
      pages: [
        (itemByCategory.get(provider.category) ?? [])
          .map(toProviderCatalogItem)
          .filter((item): item is ProviderCatalogItem => Boolean(item)),
      ],
      now,
    }).slice(0, 6).map(toSurfaceAuditItem);

    return items.length >= MIN_PROVIDER_ROOM_AUDIT_ITEMS
      ? [{ key: provider.key, label: provider.label, items }]
      : [];
  });
}

function takeDistinctSurfaceItems<T extends HomeSurfaceAuditItem>(
  items: T[],
  limit: number,
  blockedKeys: Set<string>,
  allowBlockedBackfill = true,
  blockedBackfillTarget = limit,
) {
  const picked: T[] = [];
  const localKeys = new Set<string>();
  const tryPick = (item: T, allowBlocked: boolean, target = limit) => {
    if (picked.length >= target) return;
    const keys = getHomeRailIdentityKeys(item);
    if (keys.some((key) => localKeys.has(key))) return;
    if (!allowBlocked && keys.some((key) => blockedKeys.has(key))) return;
    keys.forEach((key) => localKeys.add(key));
    picked.push(item);
  };

  for (const item of items) {
    tryPick(item, false);
  }
  const backfillTarget = Math.min(limit, blockedBackfillTarget);
  if (allowBlockedBackfill && picked.length < backfillTarget) {
    for (const item of items) {
      tryPick(item, true, backfillTarget);
    }
  }
  picked.flatMap(getHomeRailIdentityKeys).forEach((key) => blockedKeys.add(key));
  return picked;
}

function addSurfaceTitleCounts(
  counts: Map<string, number>,
  items: HomeSurfaceAuditItem[],
) {
  items.forEach((item) => {
    const titleKey = getHomeRailTitleKey(item.title);
    if (!titleKey) return;
    counts.set(titleKey, (counts.get(titleKey) ?? 0) + 1);
  });
}

function getSurfaceTitleCounts(items: HomeSurfaceAuditItem[]) {
  const counts = new Map<string, number>();
  addSurfaceTitleCounts(counts, items);
  return counts;
}

function withDistinctSurfaceLead<T extends HomeSurfaceAuditItem>(
  items: T[],
  usedLeadTitleKeys: Set<string>,
  requireDistinctLead = false,
) {
  if (items.length === 0) return items;
  const firstLeadKey = getHomeRailTitleKey(items[0].title);
  if (!firstLeadKey || !usedLeadTitleKeys.has(firstLeadKey)) {
    if (firstLeadKey) usedLeadTitleKeys.add(firstLeadKey);
    return items;
  }

  const replacementIndex = items.findIndex((item, index) => {
    if (index === 0) return false;
    const titleKey = getHomeRailTitleKey(item.title);
    return Boolean(titleKey && !usedLeadTitleKeys.has(titleKey));
  });
  if (replacementIndex < 0) return requireDistinctLead ? [] : items;

  const lead = items[replacementIndex];
  const ordered = [
    lead,
    ...items.slice(0, replacementIndex),
    ...items.slice(replacementIndex + 1),
  ];
  const leadKey = getHomeRailTitleKey(lead.title);
  if (leadKey) usedLeadTitleKeys.add(leadKey);
  return ordered;
}

function takeSurfaceItemsWithinTitleBudget<T extends HomeSurfaceAuditItem>(
  items: T[],
  titleCounts: Map<string, number>,
  maxTitleAppearances: number,
  minimumItems: number,
  targetItems: number,
) {
  const picked: T[] = [];
  const localKeys = new Set<string>();
  const pendingTitleCounts = new Map(titleCounts);

  for (const item of items) {
    if (picked.length >= targetItems) break;
    const keys = getHomeRailIdentityKeys(item);
    if (keys.some((key) => localKeys.has(key))) continue;

    const titleKey = getHomeRailTitleKey(item.title);
    const titleCount = titleKey ? pendingTitleCounts.get(titleKey) ?? 0 : 0;
    if (titleKey && titleCount >= maxTitleAppearances) continue;

    keys.forEach((key) => localKeys.add(key));
    if (titleKey) pendingTitleCounts.set(titleKey, titleCount + 1);
    picked.push(item);
  }

  return picked.length >= minimumItems ? picked : [];
}

function orderProviderRoomItemsForVisibleLead<T extends HomeSurfaceAuditItem>(
  items: T[],
  mutedTitleKeys: Set<string>,
) {
  if (items.length === 0) return items;
  const firstUnmutedIndex = items.findIndex((item) => {
    const titleKey = getHomeRailTitleKey(item.title);
    return !titleKey || !mutedTitleKeys.has(titleKey);
  });
  if (firstUnmutedIndex < 0) return items;

  const firstUnmuted = items[firstUnmutedIndex];
  const signalLeadIndex = items.findIndex((item) => item.signal?.trim());
  const leadIndex = firstUnmuted.signal?.trim()
    ? firstUnmutedIndex
    : signalLeadIndex >= 0
      ? signalLeadIndex
      : firstUnmutedIndex;
  if (leadIndex <= 0) return items;

  return [
    items[leadIndex],
    ...items.slice(0, leadIndex),
    ...items.slice(leadIndex + 1),
  ];
}

function getCuratedSurfaceAuditCandidates(
  edit: HomeCuratedEdit<HomeCuratedEditItem>,
  args: {
    heat: HomeCuratedEditItem[];
    fresh: HomeCuratedEditItem[];
    critics: HomeCuratedEditItem[];
    quick: HomeCuratedEditItem[];
  },
) {
  const sourceItems =
    edit.key === "conversation"
      ? args.heat
      : edit.key === "fresh-week"
        ? args.fresh
        : edit.key === "prestige"
          ? args.critics
          : edit.key === "short"
            ? args.quick
            : [...args.heat, ...args.fresh, ...args.critics, ...args.quick];
  return [...edit.items, ...sourceItems];
}

function buildSurfaceAuditCuratedEdits(
  args: {
    heat: HomeCuratedEditItem[];
    fresh: HomeCuratedEditItem[];
    critics: HomeCuratedEditItem[];
    quick: HomeCuratedEditItem[];
    curatedEdits: Array<HomeCuratedEdit<HomeCuratedEditItem>>;
  },
  mainSurfaceItems: HomeSurfaceAuditItem[],
  usedLeadTitleKeys: Set<string>,
  maxTitleAppearances: number,
) {
  const titleCounts = getSurfaceTitleCounts(mainSurfaceItems);
  return args.curatedEdits.flatMap((edit) => {
    const items = takeSurfaceItemsWithinTitleBudget(
      getCuratedSurfaceAuditCandidates(edit, args),
      titleCounts,
      maxTitleAppearances,
      MIN_CURATED_EDIT_AUDIT_ITEMS,
      TARGET_CURATED_EDIT_AUDIT_ITEMS,
    );
    const leadBalancedItems = withDistinctSurfaceLead(
      items,
      usedLeadTitleKeys,
      true,
    );
    if (leadBalancedItems.length < MIN_CURATED_EDIT_AUDIT_ITEMS) return [];

    addSurfaceTitleCounts(titleCounts, leadBalancedItems);
    return [{
      key: edit.key,
      title: edit.title,
      items: leadBalancedItems,
    }];
  });
}

function getHeroSurfaceAuditCandidates(args: {
  heat: HomeCuratedEditItem[];
  fresh: HomeCuratedEditItem[];
  critics: HomeCuratedEditItem[];
  now?: Date | string | number;
}) {
  return [
    ...interleaveSurfaceItemsByPlatform(
      [...args.heat, ...args.fresh],
      args.now ?? Date.now(),
    ),
    ...args.critics,
  ];
}

function reorderProviderRoomItemsForSurface(
  rooms: HomeSurfaceAuditInputs["rooms"] = [],
  mainSurfaceItems: HomeSurfaceAuditItem[],
  roomLeadMutedItems: HomeSurfaceAuditItem[],
  usedLeadTitleKeys: Set<string>,
  maxTitleAppearances: number,
  now?: Date | string | number,
): HomeSurfaceAuditInputs["rooms"] {
  const mainKeys = new Set(mainSurfaceItems.flatMap(getHomeRailIdentityKeys));
  const roomLeadMutedTitleKeys = new Set(
    roomLeadMutedItems
      .map((item) => getHomeRailTitleKey(item.title))
      .filter((key): key is string => Boolean(key)),
  );
  const titleCounts = getSurfaceTitleCounts(mainSurfaceItems);
  const providerRoomTitleCounts = new Map<string, number>();
  const visibleRooms = rooms.flatMap((room) => {
    const preferred: HomeSurfaceAuditItem[] = [];
    const fallback: HomeSurfaceAuditItem[] = [];
    const localKeys = new Set<string>();
    for (const item of room.items) {
      const keys = getHomeRailIdentityKeys(item);
      if (keys.some((key) => localKeys.has(key))) continue;
      keys.forEach((key) => localKeys.add(key));
      const bucket = keys.some((key) => mainKeys.has(key)) ? fallback : preferred;
      bucket.push(item);
    }
    const budgetedItems = limitHomeRoomItemsByTitleAppearances(
      [...preferred, ...fallback],
      mainSurfaceItems,
      maxTitleAppearances,
      MIN_PROVIDER_ROOM_AUDIT_ITEMS,
      TARGET_PROVIDER_ROOM_AUDIT_ITEMS,
    );
    const items = takeSurfaceItemsWithinTitleBudget(
      budgetedItems.filter((item) => {
        const titleKey = getHomeRailTitleKey(item.title);
        const providerRoomTitleCount = titleKey
          ? providerRoomTitleCounts.get(titleKey) ?? 0
          : 0;
        return (
          !titleKey ||
          providerRoomTitleCount < MAX_PROVIDER_ROOM_SURFACE_TITLE_APPEARANCES
        );
      }),
      titleCounts,
      maxTitleAppearances,
      MIN_PROVIDER_ROOM_AUDIT_ITEMS,
      TARGET_PROVIDER_ROOM_AUDIT_ITEMS,
    );
    const leadBalancedItems = withDistinctSurfaceLead(
      orderProviderRoomItemsForVisibleLead(
        sortProviderRoomItemsForFreshness(items, now),
        roomLeadMutedTitleKeys,
      ),
      usedLeadTitleKeys,
      true,
    );
    if (leadBalancedItems.length < MIN_PROVIDER_ROOM_AUDIT_ITEMS) return [];

    addSurfaceTitleCounts(titleCounts, leadBalancedItems);
    leadBalancedItems.forEach((item) => {
      const titleKey = getHomeRailTitleKey(item.title);
      if (titleKey) {
        providerRoomTitleCounts.set(
          titleKey,
          (providerRoomTitleCounts.get(titleKey) ?? 0) + 1,
        );
      }
    });
    return leadBalancedItems.length >= MIN_PROVIDER_ROOM_AUDIT_ITEMS
      ? [{ ...room, items: leadBalancedItems }]
      : [];
  });

  return sortProviderRoomsForFreshness(visibleRooms, now);
}

export function buildHomepageFeedSurfaceAuditInput(args: {
  forYou?: HomeCuratedEditItem[];
  heat: HomeCuratedEditItem[];
  fresh: HomeCuratedEditItem[];
  critics: HomeCuratedEditItem[];
  quick: HomeCuratedEditItem[];
  curatedEdits: Array<HomeCuratedEdit<HomeCuratedEditItem>>;
  rooms: HomeSurfaceAuditInputs["rooms"];
  maxTitleAppearances?: number;
  now?: Date | string | number;
}): HomeSurfaceAuditInputs {
  const maxTitleAppearances =
    args.maxTitleAppearances ?? MAX_SURFACE_AUDIT_TITLE_APPEARANCES;
  const usedLeadTitleKeys = new Set<string>();
  const curatedLeadKeys = new Set(
    args.curatedEdits.flatMap((edit) =>
      edit.items[0] ? getHomeRailIdentityKeys(edit.items[0]) : [],
    ),
  );
  const blockedKeys = new Set(curatedLeadKeys);
  const heroItems = takeDistinctSurfaceItems(
    getHeroSurfaceAuditCandidates(args),
    5,
    blockedKeys,
  );
  const hero = withDistinctSurfaceLead(heroItems, usedLeadTitleKeys);
  const forYou = withDistinctSurfaceLead(
    takeDistinctSurfaceItems(
      args.forYou ?? [],
      5,
      blockedKeys,
      true,
      MIN_PERSONAL_SURFACE_AUDIT_ITEMS,
    ),
    usedLeadTitleKeys,
  );
  const heat = withDistinctSurfaceLead(
    takeDistinctSurfaceItems(
      args.heat,
      6,
      blockedKeys,
      true,
      MIN_HEAT_SURFACE_AUDIT_ITEMS,
    ),
    usedLeadTitleKeys,
  );
  const fresh = withDistinctSurfaceLead(
    takeDistinctSurfaceItems(
      args.fresh,
      6,
      blockedKeys,
      true,
      MIN_FRESH_SURFACE_AUDIT_ITEMS,
    ),
    usedLeadTitleKeys,
  );
  const critics = withDistinctSurfaceLead(
    takeDistinctSurfaceItems(args.critics, 5, blockedKeys),
    usedLeadTitleKeys,
  );
  const quick = withDistinctSurfaceLead(
    takeDistinctSurfaceItems(args.quick, 5, blockedKeys),
    usedLeadTitleKeys,
  );
  const mainSurfaceItems = [
    ...hero,
    ...forYou,
    ...heat,
    ...fresh,
    ...critics,
    ...quick,
  ];
  const curated = buildSurfaceAuditCuratedEdits(
    args,
    mainSurfaceItems,
    usedLeadTitleKeys,
    maxTitleAppearances,
  );

  return {
    hero,
    curated,
    ...(forYou.length > 0 ? { forYou } : {}),
    heat,
    fresh,
    critics,
    quick,
    rooms: reorderProviderRoomItemsForSurface(
      args.rooms,
      [...mainSurfaceItems, ...curated.flatMap((edit) => edit.items)],
      hero,
      usedLeadTitleKeys,
      maxTitleAppearances,
      args.now,
    ),
  };
}

function getActionSeverity(code: string): HomepageFeedRefreshActionItem["severity"] {
  return /expired|invalid|missing|provider_room_repeated|repeated|too_few|duplicate|empty|stale|under_sourced|unknown_source|echoes_generic/i.test(code)
    ? "critical"
    : "warning";
}

function fallbackActionMessage(
  owner: HomepageFeedRefreshActionOwner,
  code: string,
) {
  if (owner === "catalog") return `Refresh or repair homepage catalog source: ${code}`;
  if (owner === "editorial") return `Review homepage editorial provenance: ${code}`;
  if (owner === "curation") return `Rebalance homepage curated edits: ${code}`;
  return `Fix rendered homepage surface: ${code}`;
}

function getEditorialSourceContext(sourceId: string | undefined) {
  if (!sourceId) return {};
  const source =
    HOME_EDITORIAL_RESEARCH_SOURCES[
      sourceId as keyof typeof HOME_EDITORIAL_RESEARCH_SOURCES
    ];
  if (!source) return {};

  return {
    sourceCheckedAt: source.checkedAt,
    sourceLabel: source.label,
    sourceUrl: source.url,
  };
}

const ACTION_SEVERITY_PRIORITY: Record<HomepageFeedRefreshActionItem["severity"], number> = {
  critical: 0,
  warning: 1,
};

const ACTION_OWNER_PRIORITY: Record<HomepageFeedRefreshActionOwner, number> = {
  catalog: 0,
  surface: 1,
  editorial: 2,
  curation: 3,
};

const ACTION_CODE_PRIORITY: Record<string, number> = {
  catalog_action_failed: -1,
  catalog_list_failed: -0.5,
  catalog_list_stale: 0.5,
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function getStartOfUtcDate(value: string | number | Date) {
  const date = new Date(value);
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
}

function getIsoDateFromTimestamp(timestamp: number | null) {
  if (!Number.isFinite(timestamp ?? Number.NaN)) return null;
  return new Date(timestamp as number).toISOString().slice(0, 10);
}

export function getHomepageFeedRefreshFreshnessSummary(
  refreshedAt: number | string | Date,
  editorialAudit?: HomeEditorialSeedAuditReport,
): HomepageFeedRefreshFreshnessSummary {
  const chart = HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART;
  const chartSource = HOME_EDITORIAL_RESEARCH_SOURCES[chart.sourceId];
  const checkedAt = getStartOfUtcDate(chart.checkedAt);
  const currentDay = getStartOfUtcDate(refreshedAt);
  const staleAt =
    checkedAt === null
      ? null
      : checkedAt + (chart.maxAgeDays + 1) * ONE_DAY_MS;
  const daysUntilStale =
    staleAt === null || currentDay === null
      ? null
      : Math.floor((staleAt - currentDay) / ONE_DAY_MS);

  return {
    currentDemandDailyChart: {
      sourceId: chart.sourceId,
      sourceCheckedAt: chart.checkedAt,
      sourceLabel: chartSource?.label,
      sourceUrl: chartSource?.url,
      maxAgeDays: chart.maxAgeDays,
      staleAt: getIsoDateFromTimestamp(staleAt),
      daysUntilStale,
      titleCount: chart.titles.length,
      titles: [...chart.titles],
    },
    currentDemandCoverage: {
      activeTitleCount: editorialAudit?.activeCurrentDemandCount ?? null,
      platformCount: editorialAudit?.activeCurrentDemandPlatformCount ?? null,
      primaryGenreCount:
        editorialAudit?.activeCurrentDemandPrimaryGenreCount ?? null,
      nonfictionCount:
        editorialAudit?.activeCurrentDemandNonfictionCount ?? null,
      findingCount: editorialAudit?.findings.length ?? 0,
      warningCount: editorialAudit?.warnings.length ?? 0,
    },
  };
}

function sortHomepageFeedRefreshActionItems(
  actionItems: HomepageFeedRefreshActionItem[],
) {
  return [...actionItems].sort((left, right) => {
    const severityDelta =
      ACTION_SEVERITY_PRIORITY[left.severity] -
      ACTION_SEVERITY_PRIORITY[right.severity];
    if (severityDelta !== 0) return severityDelta;

    const codeDelta =
      (ACTION_CODE_PRIORITY[left.code] ?? 0) -
      (ACTION_CODE_PRIORITY[right.code] ?? 0);
    if (codeDelta !== 0) return codeDelta;

    return ACTION_OWNER_PRIORITY[left.owner] - ACTION_OWNER_PRIORITY[right.owner];
  });
}

export function getHomepageFeedRefreshActionItems(args: {
  degradedCategories?: HomepageFeedRefreshDegradedCategory[];
  editorialAudit?: HomeEditorialSeedAuditReport;
  curatedEditAudit?: HomeCuratedEditAuditReport;
  surfaceAudit?: HomeSurfaceAuditReport;
}): HomepageFeedRefreshActionItem[] {
  const actionItems: HomepageFeedRefreshActionItem[] = [];

  for (const category of args.degradedCategories ?? []) {
    for (const issue of category.issues) {
      actionItems.push({
        owner: "catalog",
        severity: getActionSeverity(issue),
        code: issue,
        category: category.category,
        message: `${category.category} has ${category.itemCount} item(s), ${category.uniqueItemCount} unique item(s), and issue "${issue}"`,
      });
    }
  }

  for (const finding of args.editorialAudit?.findings ?? []) {
    actionItems.push({
      owner: "editorial",
      severity: getActionSeverity(finding.issue),
      code: finding.issue,
      group: finding.group,
      sourceId: finding.sourceId,
      ...getEditorialSourceContext(finding.sourceId),
      title: finding.title,
      message:
        finding.detail ??
        fallbackActionMessage("editorial", finding.issue),
    });
  }

  for (const warning of args.editorialAudit?.warnings ?? []) {
    const firstFinding = warning.findings[0];
    actionItems.push({
      owner: "editorial",
      severity: "warning",
      code: warning.issue,
      effectiveAt: warning.effectiveAt,
      group: firstFinding?.group,
      relatedTitles: warning.expiringTitles,
      sourceId: firstFinding?.sourceId,
      ...getEditorialSourceContext(firstFinding?.sourceId),
      title: firstFinding?.title,
      message: warning.detail,
    });
  }

  for (const finding of args.curatedEditAudit?.findings ?? []) {
    actionItems.push({
      owner: "curation",
      severity: getActionSeverity(finding.issue),
      code: finding.issue,
      editKey: finding.editKey,
      message:
        finding.detail ??
        fallbackActionMessage("curation", finding.issue),
    });
  }

  for (const finding of args.surfaceAudit?.findings ?? []) {
    actionItems.push({
      owner: "surface",
      severity: getActionSeverity(finding.issue),
      code: finding.issue,
      sectionKey: finding.sectionKey,
      title: finding.title,
      relatedTitles: finding.relatedTitles,
      message:
        finding.detail ??
        fallbackActionMessage("surface", finding.issue),
    });
  }

  return sortHomepageFeedRefreshActionItems(actionItems);
}

export function summarizeHomepageFeedRefresh(
  results: HomepageFeedRefreshCategoryResult[],
  refreshedAt = Date.now(),
  editorialAudit?: HomeEditorialSeedAuditReport,
  curatedEditAudit?: HomeCuratedEditAuditReport,
  surfaceAudit?: HomeSurfaceAuditReport,
  options: HomepageFeedRefreshSummaryOptions = {},
) {
  const degradedCategories: HomepageFeedRefreshDegradedCategory[] = results
    .filter((result) => !result.health.healthy)
    .map((result) => ({
      category: result.category,
      itemCount: result.itemCount,
      issues: result.health.issues,
      uniqueItemCount: result.health.uniqueItemCount,
      missingArtworkCount: result.health.missingArtworkCount,
      recentItemCount: result.health.recentItemCount,
    }));
  const actionItems = sortHomepageFeedRefreshActionItems([
    ...getHomepageFeedRefreshActionItems({
      degradedCategories,
      editorialAudit,
      curatedEditAudit,
      surfaceAudit,
    }),
    ...(options.actionItems ?? []),
  ]);
  const criticalActionItemCount = actionItems.filter(
    (item) => item.severity === "critical",
  ).length;
  const warningActionItemCount = actionItems.filter(
    (item) => item.severity === "warning",
  ).length;
  const healthy =
    !options.forceUnhealthy &&
    criticalActionItemCount === 0 &&
    degradedCategories.length === 0 &&
    (editorialAudit?.healthy ?? true) &&
    (curatedEditAudit?.healthy ?? true) &&
    (surfaceAudit?.healthy ?? true);
  const status = !healthy
    ? "critical"
    : warningActionItemCount > 0
      ? "warning"
      : "healthy";

  return {
    statusCode: healthy ? 200 : 503,
    body: {
      refreshedAt,
      healthy,
      status,
      degradedCategoryCount: degradedCategories.length,
      actionItemCount: actionItems.length,
      criticalActionItemCount,
      warningActionItemCount,
      primaryActionItem: actionItems[0] ?? null,
      freshness: getHomepageFeedRefreshFreshnessSummary(
        refreshedAt,
        editorialAudit,
      ),
      degradedCategories,
      actionItems,
      editorialAudit,
      curatedEditAudit,
      surfaceAudit,
      results,
    },
  };
}

function toCuratedEditItem(item: HomeRailHealthItem): HomeCuratedEditItem | null {
  const show = getRailHealthShow(item);
  const title = show.title?.trim();
  if (!title) return null;

  const key =
    item._id ??
    show._id ??
    show.showId ??
    (show.externalSource && show.externalId
      ? `${show.externalSource}:${show.externalId}`
      : undefined) ??
    show.externalId ??
    title;

  return {
    key: String(key),
    title,
    posterUrl: show.posterUrl ?? null,
    backdropUrl: show.backdropUrl ?? null,
    year: show.year ?? null,
    signal: show.homeSignal ?? null,
    editorialTier: show.editorialTier ?? null,
  };
}

function getCuratedEditItems(
  itemByCategory: Map<string, HomeRailHealthItem[]>,
  categories: string[],
) {
  return categories
    .flatMap((category) => itemByCategory.get(category) ?? [])
    .map(toCuratedEditItem)
    .filter((item): item is HomeCuratedEditItem => Boolean(item));
}

export function buildHomepageFeedRefreshCronSummary(
  catalogPayload: unknown,
  refreshedAt = Date.now(),
  options: HomepageFeedRefreshCronSummaryOptions = {},
) {
  const currentYear = new Date(refreshedAt).getUTCFullYear();
  const itemByCategory = getHomepageCatalogItemsByCategory(catalogPayload);
  const catalogDiagnostics = getHomepageCatalogDiagnostics(catalogPayload);
  const genericSources = [
    itemByCategory.get("trending_day") ?? [],
    itemByCategory.get("trending_week") ?? [],
    itemByCategory.get("rising_now") ?? [],
  ];
  const results = HOMEPAGE_CATALOG_HEALTH_CATEGORIES.map((category) => {
    const items = itemByCategory.get(category.category) ?? [];
    const shouldCompareToGeneric =
      category.category !== "trending_day" &&
      category.category !== "trending_week" &&
      category.category !== "rising_now";
    return {
      category: category.category,
      itemCount: items.length,
      health: auditHomeRailHealth({
        items,
        genericSources: shouldCompareToGeneric ? genericSources : [],
        minItems: category.minItems,
        minRecentYear:
          typeof category.freshnessYears === "number"
            ? currentYear - category.freshnessYears
            : undefined,
        minRecentItems: Math.min(category.minItems, 4),
      }),
    };
  });

  const editorialFallbacks = buildHomepageEditorialSurfaceFallbacks(refreshedAt);
  const heat = topUpHomepageSurfaceAuditItems(
    getCuratedEditItems(itemByCategory, [
      "rising_now",
      "trending_day",
      "trending_week",
    ]),
    editorialFallbacks.heat,
    TARGET_HEAT_SURFACE_AUDIT_SOURCE_ITEMS,
  );
  const fresh = topUpHomepageSurfaceAuditItems(
    getCuratedEditItems(itemByCategory, ["breakout_premieres", "airing_today"]),
    editorialFallbacks.fresh,
    TARGET_FRESH_SURFACE_AUDIT_SOURCE_ITEMS,
  );
  const critics = topUpHomepageSurfaceAuditItems(
    getCuratedEditItems(itemByCategory, ["critics_choice"]),
    editorialFallbacks.critics,
    5,
  );
  const quick = topUpHomepageSurfaceAuditItems(
    getCuratedEditItems(itemByCategory, ["quick_picks"]),
    editorialFallbacks.quick,
    5,
  );
  const forYou = buildColdStartHomeShelfItems({
    forYou: getCuratedEditItems(itemByCategory, [
      "rising_now",
      "trending_day",
      "trending_week",
    ]),
    heat,
    fresh,
    critics,
    quick,
    limit: 8,
    now: refreshedAt,
  });
  const curatedEdits = buildHomeCuratedEdits({
    heat,
    fresh,
    critics,
    quick,
    now: refreshedAt,
  });
  const rooms = buildHomepageProviderRoomAuditInputs(
    itemByCategory,
    refreshedAt,
  );

  return summarizeHomepageFeedRefresh(
    results,
    refreshedAt,
    auditHomeEditorialSeeds(refreshedAt),
    auditHomeCuratedEdits(curatedEdits, refreshedAt),
    auditHomeSurfaceRender(
      buildHomepageFeedSurfaceAuditInput({
        forYou,
        heat,
        fresh,
        critics,
        quick,
        curatedEdits,
        rooms,
        now: refreshedAt,
      }),
      refreshedAt,
      {
        demandChartTitles: HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART_TITLES,
        maxTitleAppearances: 3,
        minDemandChartTitleCount:
          HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART_TITLES.length,
        minActiveSections: 9,
        minProviderRooms: 4,
        minSignalPlatformCount: 5,
        maxSignalPlatformShare: 0.5,
        requiredActiveSectionKeys: [
          "hero",
          "for-you",
          "heat",
          "fresh",
          "quality",
          "quick",
        ],
      },
    ),
    {
      forceUnhealthy: options.catalogActionFailed,
      actionItems: [
        ...catalogDiagnostics.failedCategories.map((category) => ({
          owner: "catalog" as const,
          severity: "critical" as const,
          code: "catalog_list_failed",
          category,
          message: `${category} failed to refresh inside the batched homepage catalog; inspect TMDB, cache, and database logs before trusting this rail.`,
        })),
        ...catalogDiagnostics.staleCategories.map((category) => ({
          owner: "catalog" as const,
          severity: "warning" as const,
          code: "catalog_list_stale",
          category,
          message: `${category} is serving stale cached homepage catalog data after a refresh failure; refresh TMDB/cache before the stale-if-error window expires.`,
        })),
        ...(options.catalogActionFailed
          ? [
              {
                owner: "catalog" as const,
                severity: "critical" as const,
                code: "catalog_action_failed",
                message:
                  "Homepage catalog action failed before returning rail payload; inspect RPC, TMDB, and database logs, then rerun the freshness cron.",
              },
            ]
          : []),
      ],
    },
  );
}

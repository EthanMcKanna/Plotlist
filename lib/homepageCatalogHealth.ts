import type { HomeRailHealthItem } from "./homeRailHealth";

export type HomepageCatalogHealthCategory = {
  category: string;
  minItems: number;
  freshnessYears?: number;
  payloadKey?:
    | "trendingDay"
    | "trendingWeek"
    | "risingNow"
    | "breakoutPremieres"
    | "criticsChoice"
    | "quickPicks"
    | "airingToday";
  providerKey?:
    | "netflix"
    | "apple_tv"
    | "max"
    | "disney_plus"
    | "hulu"
    | "peacock"
    | "prime_video"
    | "paramount_plus"
    | "mgm_plus";
};

export const HOMEPAGE_CATALOG_HEALTH_CATEGORIES: HomepageCatalogHealthCategory[] = [
  { category: "trending_day", payloadKey: "trendingDay", minItems: 8 },
  { category: "trending_week", payloadKey: "trendingWeek", minItems: 8 },
  {
    category: "rising_now",
    payloadKey: "risingNow",
    minItems: 6,
    freshnessYears: 2,
  },
  {
    category: "breakout_premieres",
    payloadKey: "breakoutPremieres",
    minItems: 6,
    freshnessYears: 1,
  },
  {
    category: "critics_choice",
    payloadKey: "criticsChoice",
    minItems: 6,
    freshnessYears: 7,
  },
  {
    category: "quick_picks",
    payloadKey: "quickPicks",
    minItems: 5,
    freshnessYears: 5,
  },
  {
    category: "airing_today",
    payloadKey: "airingToday",
    minItems: 4,
    freshnessYears: 7,
  },
  { category: "netflix", providerKey: "netflix", minItems: 4, freshnessYears: 7 },
  { category: "apple_tv", providerKey: "apple_tv", minItems: 4, freshnessYears: 7 },
  { category: "max", providerKey: "max", minItems: 4, freshnessYears: 7 },
  {
    category: "disney_plus",
    providerKey: "disney_plus",
    minItems: 4,
    freshnessYears: 7,
  },
  { category: "hulu", providerKey: "hulu", minItems: 4, freshnessYears: 7 },
  {
    category: "peacock",
    providerKey: "peacock",
    minItems: 4,
    freshnessYears: 7,
  },
  {
    category: "prime_video",
    providerKey: "prime_video",
    minItems: 4,
    freshnessYears: 7,
  },
  {
    category: "paramount_plus",
    providerKey: "paramount_plus",
    minItems: 4,
    freshnessYears: 7,
  },
  {
    category: "mgm_plus",
    providerKey: "mgm_plus",
    minItems: 4,
    freshnessYears: 7,
  },
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asHealthItems(value: unknown): HomeRailHealthItem[] {
  return Array.isArray(value) ? (value as HomeRailHealthItem[]) : [];
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export function getHomepageCatalogDiagnostics(payload: unknown) {
  const catalog = asRecord(payload);
  const diagnostics = asRecord(catalog.diagnostics);

  return {
    failedCategories: [...new Set(asStringArray(diagnostics.failedCategories))],
    staleCategories: [...new Set(asStringArray(diagnostics.staleCategories))],
  };
}

export function getHomepageCatalogItemsByCategory(payload: unknown) {
  const catalog = asRecord(payload);
  const providers = asRecord(catalog.providers);
  const itemsByCategory = new Map<string, HomeRailHealthItem[]>();

  for (const category of HOMEPAGE_CATALOG_HEALTH_CATEGORIES) {
    const rawItems = category.providerKey
      ? providers[category.providerKey]
      : category.payloadKey
        ? catalog[category.payloadKey]
        : [];
    itemsByCategory.set(category.category, asHealthItems(rawItems));
  }

  return itemsByCategory;
}

import { hasCurrentHomeSignal } from "./homeCurrentSignal";

export type HomeRailHealthItem = {
  _id?: string;
  showId?: string;
  externalSource?: string;
  externalId?: string | number;
  title?: string | null;
  year?: number | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  homeSignal?: string | null;
  editorialTier?: "verified_current" | string | null;
  show?: HomeRailHealthItem | null;
};

const DEFAULT_MIN_HEALTHY_RAIL_ITEMS = 4;
const DEFAULT_MAX_MISSING_ARTWORK = 0;

export type HomeRailHealthIssue =
  | "too_few_items"
  | "duplicate_items"
  | "missing_artwork"
  | "stale_items"
  | "echoes_generic_source";

export type HomeRailHealthReport = {
  healthy: boolean;
  issues: HomeRailHealthIssue[];
  itemCount: number;
  uniqueItemCount: number;
  duplicateCount: number;
  missingArtworkCount: number;
  recentItemCount: number | null;
  echoesGenericSource: boolean;
};

function getShow(item: HomeRailHealthItem | null | undefined) {
  return item?.show ?? item ?? null;
}

function getRailHealthStableKey(item: HomeRailHealthItem | null | undefined) {
  const show = getShow(item);
  return (
    item?._id ??
    show?._id ??
    show?.showId ??
    (show?.externalSource && show?.externalId
      ? `${show.externalSource}:${show.externalId}`
      : undefined) ??
    show?.externalId ??
    show?.title ??
    null
  );
}

function getRailHealthDisplayKey(item: HomeRailHealthItem | null | undefined) {
  const show = getShow(item);
  return getRailHealthTitleKey(show?.title) ?? getRailHealthStableKey(item);
}

function getRailHealthTitleKey(title: string | null | undefined) {
  const normalized = title?.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized ? `title:${normalized}` : null;
}

function candidateKeySet(items: HomeRailHealthItem[], limit = 10) {
  const keys = new Set<string>();
  for (const item of items) {
    const show = getShow(item);
    if (!show?.title) continue;
    const key = getRailHealthDisplayKey(item);
    if (!key) continue;
    keys.add(String(key));
    if (keys.size >= limit) break;
  }
  return keys;
}

function getCandidateKeys(items: HomeRailHealthItem[]) {
  return items.flatMap((item) => {
    const show = getShow(item);
    if (!show?.title) return [];
    const key = getRailHealthDisplayKey(item);
    return key ? [String(key)] : [];
  });
}

function countDuplicateItems(items: HomeRailHealthItem[]) {
  const displaySeen = new Set<string>();
  const stableSeen = new Set<string>();
  let duplicates = 0;

  for (const item of items) {
    const displayKey = getRailHealthDisplayKey(item);
    const stableKey = getRailHealthStableKey(item);
    const hasDisplayDuplicate = Boolean(displayKey && displaySeen.has(String(displayKey)));
    const hasStableDuplicate = Boolean(stableKey && stableSeen.has(String(stableKey)));

    if (hasDisplayDuplicate || hasStableDuplicate) {
      duplicates += 1;
    }
    if (displayKey) displaySeen.add(String(displayKey));
    if (stableKey) stableSeen.add(String(stableKey));
  }

  return duplicates;
}

export function hasRailEchoedGenericSource(
  railItems: HomeRailHealthItem[],
  genericItems: HomeRailHealthItem[],
  minItems = DEFAULT_MIN_HEALTHY_RAIL_ITEMS,
) {
  const railKeys = candidateKeySet(railItems);
  const genericKeys = candidateKeySet(genericItems);
  if (railKeys.size < minItems || genericKeys.size < minItems) {
    return false;
  }
  let overlap = 0;
  railKeys.forEach((key) => {
    if (genericKeys.has(key)) overlap += 1;
  });
  return overlap / Math.min(railKeys.size, genericKeys.size) >= 0.6;
}

export function shouldLoadEditorialSeedRail(args: {
  primaryCount: number;
  categoryRaw: HomeRailHealthItem[];
  genericSources?: HomeRailHealthItem[][];
  minItems?: number;
}) {
  const minItems = args.minItems ?? DEFAULT_MIN_HEALTHY_RAIL_ITEMS;
  if (args.primaryCount < minItems) {
    return true;
  }
  return (args.genericSources ?? []).some((generic) =>
    hasRailEchoedGenericSource(args.categoryRaw, generic, minItems),
  );
}

export function auditHomeRailHealth(args: {
  items: HomeRailHealthItem[];
  genericSources?: HomeRailHealthItem[][];
  minItems?: number;
  minRecentYear?: number;
  minRecentItems?: number;
  maxMissingArtwork?: number;
}): HomeRailHealthReport {
  const minItems = args.minItems ?? DEFAULT_MIN_HEALTHY_RAIL_ITEMS;
  const keys = getCandidateKeys(args.items);
  const duplicateCount = countDuplicateItems(args.items);
  const uniqueItemCount = Math.max(0, keys.length - duplicateCount);
  const missingArtworkCount = args.items.filter((item) => {
    const show = getShow(item);
    return !show?.posterUrl;
  }).length;
  const recentItemCount =
    typeof args.minRecentYear === "number"
      ? args.items.filter((item) => {
          const show = getShow(item);
          return hasCurrentHomeSignal(
            {
              year: show?.year,
              homeSignal: show?.homeSignal,
            },
            { minRecentYear: args.minRecentYear },
          );
        }).length
      : null;
  const echoesGenericSource = (args.genericSources ?? []).some((generic) =>
    hasRailEchoedGenericSource(args.items, generic, minItems),
  );

  const issues: HomeRailHealthIssue[] = [];
  if (uniqueItemCount < minItems) {
    issues.push("too_few_items");
  }
  if (duplicateCount > 0) {
    issues.push("duplicate_items");
  }
  if (missingArtworkCount > (args.maxMissingArtwork ?? DEFAULT_MAX_MISSING_ARTWORK)) {
    issues.push("missing_artwork");
  }
  if (
    typeof args.minRecentYear === "number" &&
    recentItemCount !== null &&
    recentItemCount < (args.minRecentItems ?? minItems)
  ) {
    issues.push("stale_items");
  }
  if (echoesGenericSource) {
    issues.push("echoes_generic_source");
  }

  return {
    healthy: issues.length === 0,
    issues,
    itemCount: args.items.length,
    uniqueItemCount,
    duplicateCount,
    missingArtworkCount,
    recentItemCount,
    echoesGenericSource,
  };
}

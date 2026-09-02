export type HomeRailIdentityItem = {
  key: string;
  title: string;
};

export function getHomeRailTitleKey(title: string | null | undefined) {
  const normalized = title?.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized ? `title:${normalized}` : null;
}

export function getHomeRailIdentityKeys(item: HomeRailIdentityItem) {
  return [item.key, getHomeRailTitleKey(item.title)].filter(
    (value): value is string => Boolean(value),
  );
}

export function getHomeRailIdentitySet(items: HomeRailIdentityItem[]) {
  return new Set(items.flatMap(getHomeRailIdentityKeys));
}

export function getHomeDiscoveryPreviewKeys(
  railPreviewKeys: Iterable<string>,
  shelfItems: HomeRailIdentityItem[],
) {
  return new Set([...railPreviewKeys, ...getHomeRailIdentitySet(shelfItems)]);
}

export function removePreviewedHomeRailItems<T extends HomeRailIdentityItem>(
  items: T[],
  previewKeys: Set<string>,
  minimumRemaining: number,
) {
  const filtered = items.filter((item) =>
    getHomeRailIdentityKeys(item).every((key) => !previewKeys.has(key)),
  );
  if (filtered.length === items.length) return items;
  return filtered.length >= minimumRemaining ? filtered : [];
}

export function topUpHomeRailItems<T extends HomeRailIdentityItem>(
  items: T[],
  fallbackItems: T[],
  previewKeys: Set<string>,
  minimumRemaining: number,
  limit: number,
) {
  const selected: T[] = [];
  const selectedKeys = new Set<string>();

  const tryAdd = (item: T) => {
    if (selected.length >= limit) return;
    const identityKeys = getHomeRailIdentityKeys(item);
    const alreadyUsed = identityKeys.some(
      (key) => previewKeys.has(key) || selectedKeys.has(key),
    );
    if (alreadyUsed) return;
    identityKeys.forEach((key) => selectedKeys.add(key));
    selected.push(item);
  };

  items.forEach(tryAdd);
  fallbackItems.forEach(tryAdd);

  return selected.length >= minimumRemaining ? selected : [];
}

export type HomeRailTopUpSource<T extends HomeRailIdentityItem> = {
  items: T[];
  candidates?: T[];
  minimumRemaining: number;
};

export type HomeRoomIdentityItem = {
  key?: string | null;
  _id?: string | null;
  showId?: string | null;
  externalId?: string | null;
  externalSource?: string | null;
  title: string;
};

function getHomeRailAvailabilityKey(item: HomeRailIdentityItem) {
  return getHomeRailTitleKey(item.title) ?? item.key;
}

function isHomeRailIdentityBlocked(
  item: HomeRailIdentityItem,
  blockedKeys: Set<string>,
) {
  return getHomeRailIdentityKeys(item).some((key) => blockedKeys.has(key));
}

function countAvailableHomeRailItems<T extends HomeRailIdentityItem>(
  items: T[],
  blockedKeys: Set<string>,
) {
  const seen = new Set<string>();
  let count = 0;
  items.forEach((item) => {
    const availabilityKey = getHomeRailAvailabilityKey(item);
    if (seen.has(availabilityKey)) return;
    if (isHomeRailIdentityBlocked(item, blockedKeys)) return;
    seen.add(availabilityKey);
    count += 1;
  });
  return count;
}

export function topUpHomeRailItemsPreservingSources<T extends HomeRailIdentityItem>(
  items: T[],
  sources: HomeRailTopUpSource<T>[],
  previewKeys: Set<string>,
  minimumRemaining: number,
  limit: number,
) {
  const selected: T[] = [];
  // One mutable blocked set (preview keys plus everything selected so far)
  // instead of rebuilding the preview/selected union per candidate.
  const blockedKeys = new Set(previewKeys);

  const tryAdd = (item: T) => {
    if (selected.length >= limit) return false;
    const identityKeys = getHomeRailIdentityKeys(item);
    if (identityKeys.some((key) => blockedKeys.has(key))) return false;
    identityKeys.forEach((key) => blockedKeys.add(key));
    selected.push(item);
    return true;
  };

  items.forEach(tryAdd);
  sources.forEach((source) => {
    const candidates = source.candidates ?? source.items;
    // A source's available count only changes when a selection lands, so it
    // is recomputed after successful adds instead of rescanning source.items
    // for every candidate.
    let available = countAvailableHomeRailItems(source.items, blockedKeys);
    let availableStale = false;
    candidates.forEach((item) => {
      if (selected.length >= limit) return;
      if (availableStale) {
        available = countAvailableHomeRailItems(source.items, blockedKeys);
        availableStale = false;
      }
      if (available <= source.minimumRemaining) return;
      if (tryAdd(item)) {
        availableStale = true;
      }
    });
  });

  return selected.length >= minimumRemaining ? selected : [];
}

// Soft cross-rail dedupe. Previewed titles are dropped while the rail still
// has `distinctFloor` distinct items without them; below that floor they are
// kept but moved behind the distinct ones (a show may then appear in two
// discovery rails rather than leaving the later rail short). `distinctFloor`
// defaults to `minimumRemaining` for callers that only need the old
// "hide-or-demote" behaviour.
export function removeOrDemotePreviewedHomeRailItems<T extends HomeRailIdentityItem>(
  items: T[],
  previewKeys: Set<string>,
  minimumRemaining: number,
  distinctFloor = minimumRemaining,
) {
  const filtered = items.filter((item) =>
    getHomeRailIdentityKeys(item).every((key) => !previewKeys.has(key)),
  );
  if (filtered.length === items.length) return items;
  return filtered.length >= Math.max(minimumRemaining, distinctFloor)
    ? filtered
    : prioritizeUnpreviewedHomeRailItems(items, previewKeys);
}

export function prioritizeUnpreviewedHomeRailItems<T extends HomeRailIdentityItem>(
  items: T[],
  previewKeys: Set<string>,
) {
  const unpreviewed: T[] = [];
  const previewed: T[] = [];
  items.forEach((item) => {
    const bucket = getHomeRailIdentityKeys(item).every((key) => !previewKeys.has(key))
      ? unpreviewed
      : previewed;
    bucket.push(item);
  });
  return previewed.length === 0 ? items : [...unpreviewed, ...previewed];
}

function getHomeRailTitleAppearanceCounts(items: HomeRailIdentityItem[]) {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const titleKey = getHomeRailTitleKey(item.title);
    if (!titleKey) return;
    counts.set(titleKey, (counts.get(titleKey) ?? 0) + 1);
  });
  return counts;
}

export type HomeRailTitleAppearanceOptions = {
  /**
   * Prefer titles unseen on the surface while at least this many remain;
   * below it, already-seen titles fill in behind them (so a discovery rail
   * may repeat a show from an earlier rail instead of running short).
   * Defaults to `minimumRemaining`.
   */
  distinctFloor?: number;
  /**
   * Hard ceiling on how many times a title may appear across the surface
   * (preceding items plus this rail): titles already at the ceiling never
   * fill in, even below the floor. Unlimited when omitted.
   */
  maxTotalAppearances?: number;
};

export function limitHomeRailItemsByTitleAppearances<
  T extends HomeRailIdentityItem,
>(
  items: T[],
  precedingItems: HomeRailIdentityItem[],
  maxAppearances: number,
  minimumRemaining: number,
  limit = items.length,
  options: HomeRailTitleAppearanceOptions = {},
) {
  const distinctFloor = Math.max(
    minimumRemaining,
    options.distinctFloor ?? minimumRemaining,
  );
  const maxTotalAppearances = options.maxTotalAppearances ?? Number.POSITIVE_INFINITY;
  const titleCounts = getHomeRailTitleAppearanceCounts(precedingItems);
  const maxTitleAppearances = Math.max(1, Math.floor(maxAppearances));
  const selectedKeys = new Set<string>();
  const preferred: T[] = [];
  const fallback: T[] = [];

  items.forEach((item) => {
    const identityKeys = getHomeRailIdentityKeys(item);
    if (identityKeys.some((key) => selectedKeys.has(key))) return;
    identityKeys.forEach((key) => selectedKeys.add(key));

    const titleKey = getHomeRailTitleKey(item.title);
    const titleCount = titleKey ? titleCounts.get(titleKey) ?? 0 : 0;
    if (!titleKey || titleCount < maxTitleAppearances) {
      preferred.push(item);
      if (titleKey) titleCounts.set(titleKey, titleCount + 1);
    } else if (titleCount < maxTotalAppearances) {
      fallback.push(item);
    }
  });

  const preferredLimited = preferred.slice(0, limit);
  if (preferredLimited.length >= distinctFloor) return preferredLimited;

  const combined = [...preferredLimited, ...fallback].slice(0, limit);
  return combined.length >= minimumRemaining ? combined : [];
}

function getHomeRoomIdentityKeys(item: HomeRoomIdentityItem) {
  const sourceKey =
    item.key ??
    item._id ??
    item.showId ??
    (item.externalSource && item.externalId
      ? `${item.externalSource}:${item.externalId}`
      : null) ??
    item.externalId ??
    item.title;
  return getHomeRailIdentityKeys({
    key: String(sourceKey),
    title: item.title,
  });
}

function getHomeRoomAvailabilityKey(item: HomeRoomIdentityItem) {
  return getHomeRailTitleKey(item.title) ?? String(item.key ?? item.externalId ?? item.title);
}

export function limitHomeRoomItemsByTitleAppearances<
  T extends HomeRoomIdentityItem,
>(
  items: T[],
  precedingItems: HomeRailIdentityItem[],
  maxAppearances: number,
  minimumRemaining: number,
  limit = items.length,
) {
  const titleCounts = getHomeRailTitleAppearanceCounts(precedingItems);
  const maxTitleAppearances = Math.max(1, Math.floor(maxAppearances));
  const localSeen = new Set<string>();
  const preferred: T[] = [];
  const fallback: Array<{
    item: T;
    originalIndex: number;
    titleCount: number;
  }> = [];

  items.forEach((item, originalIndex) => {
    const availabilityKey = getHomeRoomAvailabilityKey(item);
    if (localSeen.has(availabilityKey)) return;
    localSeen.add(availabilityKey);

    const titleKey = getHomeRailTitleKey(item.title);
    const titleCount = titleKey ? titleCounts.get(titleKey) ?? 0 : 0;
    if (!titleKey || titleCount < maxTitleAppearances) {
      preferred.push(item);
      if (titleKey) titleCounts.set(titleKey, titleCount + 1);
    } else {
      fallback.push({
        item,
        originalIndex,
        titleCount,
      });
    }
  });

  const preferredLimited = preferred.slice(0, limit);
  if (preferredLimited.length >= minimumRemaining) return preferredLimited;

  const leastRepetitiveFallback = fallback
    .sort((left, right) => {
      const countDelta = left.titleCount - right.titleCount;
      if (countDelta !== 0) return countDelta;
      return left.originalIndex - right.originalIndex;
    })
    .map((entry) => entry.item);
  const combined = [...preferredLimited, ...leastRepetitiveFallback].slice(0, limit);
  return combined.length >= minimumRemaining ? combined : [];
}

export function prioritizeHomeRoomItemsAgainstPreviewKeys<
  T extends HomeRoomIdentityItem,
>(
  items: T[],
  previewKeys: Set<string>,
  minimumRemaining: number,
  softPreviewKeys: Set<string> = new Set(),
) {
  const localSeen = new Set<string>();
  const preferred: T[] = [];
  const softFallback: T[] = [];
  const fallback: T[] = [];

  items.forEach((item) => {
    const availabilityKey = getHomeRoomAvailabilityKey(item);
    if (localSeen.has(availabilityKey)) return;
    localSeen.add(availabilityKey);
    const titleKey = getHomeRailTitleKey(item.title);
    const blocked =
      Boolean(titleKey && previewKeys.has(titleKey)) ||
      getHomeRoomIdentityKeys(item).some((key) => previewKeys.has(key));
    const softBlocked =
      Boolean(titleKey && softPreviewKeys.has(titleKey)) ||
      getHomeRoomIdentityKeys(item).some((key) => softPreviewKeys.has(key));
    if (blocked) {
      fallback.push(item);
    } else if (softBlocked) {
      softFallback.push(item);
    } else {
      preferred.push(item);
    }
  });

  const preferredWithSoft = [...preferred, ...softFallback];
  const ordered =
    preferred.length >= minimumRemaining
      ? preferred
      : preferredWithSoft.length >= minimumRemaining
        ? preferredWithSoft
        : [...preferredWithSoft, ...fallback];
  return ordered.length >= minimumRemaining ? ordered : [];
}

export function prioritizeHomeRoomsAgainstPreviewKeys<
  TItem extends HomeRoomIdentityItem,
  TRoom extends { items: TItem[] },
>(
  rooms: TRoom[],
  previewKeys: Set<string>,
  minimumRemaining: number,
  softPreviewKeys: Set<string> = new Set(),
  options: { maxGlobalTitleAppearances?: number } = {},
) {
  const maxGlobalTitleAppearances = options.maxGlobalTitleAppearances ?? 1;
  const globalTitleCounts = new Map<string, number>();
  return rooms.flatMap((room) => {
    const roomItems = prioritizeHomeRoomItemsAgainstPreviewKeys(
      room.items,
      previewKeys,
      minimumRemaining,
      softPreviewKeys,
    );
    const items = roomItems.filter((item) => {
      const titleKey = getHomeRailTitleKey(item.title);
      if (!titleKey) return true;
      return (globalTitleCounts.get(titleKey) ?? 0) < maxGlobalTitleAppearances;
    });
    if (items.length < minimumRemaining) return [];
    items.forEach((item) => {
      const titleKey = getHomeRailTitleKey(item.title);
      if (!titleKey) return;
      globalTitleCounts.set(titleKey, (globalTitleCounts.get(titleKey) ?? 0) + 1);
    });
    return [{ ...room, items }];
  });
}

export function filterHomeRoomsWithUnpreviewedFeaturedItems<
  TItem extends HomeRoomIdentityItem,
  TRoom extends { items: TItem[] },
>(
  rooms: TRoom[],
  previewKeys: Set<string>,
  getFeaturedItem: (items: TItem[], mutedTitleKeys: Set<string>) => TItem | undefined,
  minimumRooms: number,
) {
  const additiveRooms = rooms.filter((room) => {
    const featuredItem = getFeaturedItem(room.items, previewKeys);
    const titleKey = getHomeRailTitleKey(featuredItem?.title);
    return !titleKey || !previewKeys.has(titleKey);
  });

  return additiveRooms.length >= minimumRooms ? additiveRooms : rooms;
}

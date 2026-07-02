import {
  getHomeSignalReleaseDistanceDays,
  hasExplicitCurrentHomeSignal,
  hasReleaseWindowHomeSignal,
} from "./homeCurrentSignal";
import {
  getHomeRailIdentityKeys,
  getHomeRailTitleKey,
  type HomeRailIdentityItem,
} from "./homeRailIdentity";

export type HomeFreshRailRankItem = {
  signal?: string | null;
  homeSignal?: string | null;
  homeScore?: number | null;
  year?: number | null;
};

export type HomeVisibleFreshRailItem = HomeRailIdentityItem & HomeFreshRailRankItem;

export type HomeFreshRailTopUpRoom<T extends HomeVisibleFreshRailItem> = {
  items: T[];
};

const PREVIEWED_FRESH_RAIL_SCORE_PENALTY = 90;

function getFreshRailReleaseScore(
  show: HomeFreshRailRankItem,
  now?: Date | string | number,
) {
  if (!hasReleaseWindowHomeSignal(show)) return Number.NEGATIVE_INFINITY;
  const distance = getHomeSignalReleaseDistanceDays(show, now);
  if (distance === null) {
    return hasExplicitCurrentHomeSignal(show, { now }) ? 54 : 0;
  }
  if (distance >= -3 && distance <= 3) {
    return 220 - Math.abs(distance) * 8;
  }
  if (distance >= -10 && distance < -3) {
    return 164 - Math.abs(distance) * 3;
  }
  if (distance > 3 && distance <= 14) {
    return 150 - distance * 4;
  }
  if (distance >= -21 && distance < -10) {
    return 102 - Math.abs(distance) * 2;
  }
  if (distance > 14 && distance <= 45) {
    return 76 - distance;
  }
  return -Math.abs(distance);
}

export function sortFreshRailItemsByReleaseProximity<
  T extends HomeFreshRailRankItem,
>(
  items: T[],
  now?: Date | string | number,
) {
  return [...items].sort((left, right) => {
    const scoreDelta =
      getFreshRailReleaseScore(right, now) - getFreshRailReleaseScore(left, now);
    if (scoreDelta !== 0) return scoreDelta;
    return (right.homeScore ?? 0) - (left.homeScore ?? 0);
  });
}

function isPreviewedFreshRailItem(
  item: HomeRailIdentityItem,
  previewKeys: Set<string>,
) {
  return getHomeRailIdentityKeys(item).some((key) => previewKeys.has(key));
}

function getVisibleFreshRailScore(
  item: HomeVisibleFreshRailItem,
  previewKeys: Set<string>,
  titleCounts: Map<string, number>,
  maxTitleAppearances: number,
  now?: Date | string | number,
) {
  const titleKey = getHomeRailTitleKey(item.title);
  const titleCount = titleKey ? titleCounts.get(titleKey) ?? 0 : 0;
  const previewPenalty =
    isPreviewedFreshRailItem(item, previewKeys) ||
    (titleKey && titleCount >= maxTitleAppearances)
    ? PREVIEWED_FRESH_RAIL_SCORE_PENALTY
    : 0;
  return getFreshRailReleaseScore(item, now) - previewPenalty;
}

function isOpeningRepeatFreshRailItem(
  item: HomeVisibleFreshRailItem,
  previewKeys: Set<string>,
  titleCounts: Map<string, number>,
  maxTitleAppearances: number,
) {
  const titleKey = getHomeRailTitleKey(item.title);
  const titleCount = titleKey ? titleCounts.get(titleKey) ?? 0 : 0;
  return (
    isPreviewedFreshRailItem(item, previewKeys) ||
    Boolean(titleKey && titleCount >= maxTitleAppearances)
  );
}

function sortVisibleFreshRailItems<T extends HomeVisibleFreshRailItem>(
  items: T[],
  previewKeys: Set<string>,
  precedingItems: HomeRailIdentityItem[],
  maxAppearances: number,
  now?: Date | string | number,
) {
  const titleCounts = getFreshRailTitleAppearanceCounts(precedingItems);
  const maxTitleAppearances = Math.max(1, Math.floor(maxAppearances));
  return [...items].sort((left, right) => {
    const leftIsOpeningRepeat = isOpeningRepeatFreshRailItem(
      left,
      previewKeys,
      titleCounts,
      maxTitleAppearances,
    );
    const rightIsOpeningRepeat = isOpeningRepeatFreshRailItem(
      right,
      previewKeys,
      titleCounts,
      maxTitleAppearances,
    );
    if (leftIsOpeningRepeat !== rightIsOpeningRepeat) {
      return leftIsOpeningRepeat ? 1 : -1;
    }

    const scoreDelta =
      getVisibleFreshRailScore(
        right,
        previewKeys,
        titleCounts,
        maxTitleAppearances,
        now,
      ) -
      getVisibleFreshRailScore(
        left,
        previewKeys,
        titleCounts,
        maxTitleAppearances,
        now,
      );
    if (scoreDelta !== 0) return scoreDelta;
    return (right.homeScore ?? 0) - (left.homeScore ?? 0);
  });
}

function getFreshRailTitleAppearanceCounts(items: HomeRailIdentityItem[]) {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const titleKey = getHomeRailTitleKey(item.title);
    if (!titleKey) return;
    counts.set(titleKey, (counts.get(titleKey) ?? 0) + 1);
  });
  return counts;
}

function selectVisibleFreshRailItems<T extends HomeVisibleFreshRailItem>(
  items: T[],
  minimumRemaining: number,
  limit = items.length,
) {
  const selectedKeys = new Set<string>();
  const selected: T[] = [];

  items.forEach((item) => {
    if (selected.length >= limit) return;
    const identityKeys = getHomeRailIdentityKeys(item);
    if (identityKeys.some((key) => selectedKeys.has(key))) return;
    identityKeys.forEach((key) => selectedKeys.add(key));
    selected.push(item);
  });

  return selected.length >= minimumRemaining ? selected : [];
}

export function buildFreshRailRoomTopUpItems<T extends HomeVisibleFreshRailItem>(
  rooms: HomeFreshRailTopUpRoom<T>[],
  limit = rooms.reduce((count, room) => count + room.items.length, 0),
) {
  const selectedKeys = new Set<string>();
  const selected: T[] = [];

  rooms.forEach((room) => {
    room.items.forEach((item) => {
      if (selected.length >= limit) return;
      if (!hasReleaseWindowHomeSignal(item)) return;
      const identityKeys = getHomeRailIdentityKeys(item);
      if (identityKeys.some((key) => selectedKeys.has(key))) return;
      identityKeys.forEach((key) => selectedKeys.add(key));
      selected.push(item);
    });
  });

  return selected;
}

export function buildVisibleFreshRailItems<T extends HomeVisibleFreshRailItem>({
  items,
  previewKeys,
  precedingItems,
  maxTitleAppearances,
  minimumRemaining,
  limit,
  now,
}: {
  items: T[];
  previewKeys: Set<string>;
  precedingItems: HomeRailIdentityItem[];
  maxTitleAppearances: number;
  minimumRemaining: number;
  limit?: number;
  now?: Date | string | number;
}) {
  const normalizedLimit =
    typeof limit === "number" && Number.isFinite(limit)
      ? Math.max(0, Math.floor(limit))
      : items.length;
  const titleCounts = getFreshRailTitleAppearanceCounts(precedingItems);
  const normalizedMaxTitleAppearances = Math.max(
    1,
    Math.floor(maxTitleAppearances),
  );
  const candidates = sortVisibleFreshRailItems(
    items,
    previewKeys,
    precedingItems,
    maxTitleAppearances,
    now,
  );
  const unpreviewedCandidates = candidates.filter(
    (item) =>
      !isOpeningRepeatFreshRailItem(
        item,
        previewKeys,
        titleCounts,
        normalizedMaxTitleAppearances,
      ),
  );
  const unpreviewed = selectVisibleFreshRailItems(
    unpreviewedCandidates,
    minimumRemaining,
    normalizedLimit,
  );

  if (unpreviewed.length >= minimumRemaining) {
    return unpreviewed;
  }

  return selectVisibleFreshRailItems(
    candidates,
    minimumRemaining,
    normalizedLimit,
  );
}

import {
  hasChartOnlyHomeSignal,
  hasCurrentHomeSignal,
  hasExplicitCurrentHomeSignal,
  type HomeCurrentSignalItem,
} from "./homeCurrentSignal";
import {
  getHomeRailIdentityKeys,
  type HomeRailIdentityItem,
} from "./homeRailIdentity";

export type HomeStarterShelfInput<T extends HomeRailIdentityItem & HomeCurrentSignalItem> = {
  forYou: T[];
  heat: T[];
  fresh: T[];
  critics: T[];
  quick: T[];
  limit?: number;
  maxDiscoveryItems?: number;
  now?: Date | number | string;
};

const DEFAULT_STARTER_SHELF_LIMIT = 12;

function isUsefulCurrentShelfItem(
  item: HomeCurrentSignalItem,
  now?: Date | number | string,
) {
  if (hasChartOnlyHomeSignal(item)) return false;
  return (
    hasExplicitCurrentHomeSignal(item, { now }) ||
    hasCurrentHomeSignal(item, { now, recentYearWindow: 1 })
  );
}

function hasShelfContextSignal(item: HomeCurrentSignalItem) {
  const signal = (item.signal ?? item.homeSignal)?.trim();
  return Boolean(signal && !hasChartOnlyHomeSignal(item));
}

export function isContextualHomeShelfLead(
  item: HomeCurrentSignalItem,
  now?: Date | number | string,
) {
  if (hasChartOnlyHomeSignal(item)) return false;
  if (hasExplicitCurrentHomeSignal(item, { now })) return true;
  return (
    hasShelfContextSignal(item) &&
    hasCurrentHomeSignal(item, { now, recentYearWindow: 1 })
  );
}

export function promoteContextualHomeShelfLead<
  T extends HomeRailIdentityItem & HomeCurrentSignalItem,
>(
  items: T[],
  options: { now?: Date | number | string } = {},
) {
  if (items.length < 2 || isContextualHomeShelfLead(items[0], options.now)) {
    return items;
  }

  const index = items.findIndex((item) =>
    isContextualHomeShelfLead(item, options.now),
  );
  if (index <= 0) return items;
  return [items[index], ...items.slice(0, index), ...items.slice(index + 1)];
}

function pushDistinct<T extends HomeRailIdentityItem>(
  item: T,
  out: T[],
  seen: Set<string>,
  limit: number,
) {
  if (out.length >= limit) return;
  const keys = getHomeRailIdentityKeys(item);
  if (keys.some((key) => seen.has(key))) return;
  keys.forEach((key) => seen.add(key));
  out.push(item);
}

export function prioritizeHomeShelfCurrentItems<
  T extends HomeRailIdentityItem & HomeCurrentSignalItem,
>(
  items: T[],
  options: { now?: Date | number | string; limit?: number } = {},
) {
  const explicit: T[] = [];
  const current: T[] = [];
  const fallback: T[] = [];

  items.forEach((item) => {
    if (hasChartOnlyHomeSignal(item)) {
      fallback.push(item);
    } else if (hasExplicitCurrentHomeSignal(item, { now: options.now })) {
      explicit.push(item);
    } else if (hasCurrentHomeSignal(item, { now: options.now, recentYearWindow: 1 })) {
      current.push(item);
    } else {
      fallback.push(item);
    }
  });

  return [...explicit, ...current, ...fallback].slice(0, options.limit ?? items.length);
}

export function buildColdStartHomeShelfItems<
  T extends HomeRailIdentityItem & HomeCurrentSignalItem,
>({
  forYou,
  heat,
  fresh,
  critics,
  quick,
  limit = DEFAULT_STARTER_SHELF_LIMIT,
  now,
}: HomeStarterShelfInput<T>) {
  const out: T[] = [];
  const seen = new Set<string>();
  prioritizeHomeShelfCurrentItems(
    [...fresh, ...heat, ...critics, ...quick, ...forYou],
    { now },
  ).forEach((item) => {
    pushDistinct(item, out, seen, limit);
  });
  return out;
}

export function buildPersonalHomeShelfItems<
  T extends HomeRailIdentityItem & HomeCurrentSignalItem,
>({
  forYou,
  heat,
  fresh,
  critics,
  quick,
  limit = DEFAULT_STARTER_SHELF_LIMIT,
  maxDiscoveryItems = 2,
  now,
}: HomeStarterShelfInput<T>) {
  const sortedForYou = prioritizeHomeShelfCurrentItems(forYou, { now });
  const personalCurrent = sortedForYou.filter((item) =>
    isUsefulCurrentShelfItem(item, now),
  );
  const personalFallback = sortedForYou.filter(
    (item) => !isUsefulCurrentShelfItem(item, now),
  );
  const discoveryCurrent = prioritizeHomeShelfCurrentItems(
    [...fresh, ...heat, ...critics, ...quick],
    { now },
  )
    .filter((item) => isUsefulCurrentShelfItem(item, now))
    .slice(0, maxDiscoveryItems);

  const out: T[] = [];
  const seen = new Set<string>();
  [...personalCurrent, ...discoveryCurrent, ...personalFallback].forEach((item) => {
    pushDistinct(item, out, seen, limit);
  });
  return out;
}

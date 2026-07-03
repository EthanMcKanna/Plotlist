// Deterministic, seedable rotation for the home surface. The goal is a feed
// that feels alive — a different hero lead and rail mix on each visit —
// without storing any per-user state: everything derives from a time epoch,
// so a given (data, epoch) pair always renders the same surface and tests
// stay reproducible by pinning `now`.

export const HOME_ROTATION_EPOCH_MS = 15 * 60 * 1000;

export function getHomeRotationEpoch(
  now: Date | string | number = Date.now(),
  periodMs = HOME_ROTATION_EPOCH_MS,
) {
  const timestamp =
    now instanceof Date ? now.getTime() : typeof now === "number" ? now : Date.parse(now);
  const safeTimestamp = Number.isFinite(timestamp) ? timestamp : Date.now();
  return Math.floor(safeTimestamp / Math.max(1, periodMs));
}

// FNV-1a over the joined parts; small, stable, and good enough to decorrelate
// rails that share the same epoch.
export function hashHomeRotationSeed(...parts: Array<string | number>) {
  let hash = 0x811c9dc5;
  const input = parts.join("|");
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// Cyclic rotation that preserves relative (ranked) order. `keepTop` anchors
// chart-style leaders in place so rotation never lies about a #1.
export function rotateHomeItemsForSeed<T>(items: T[], seed: number, keepTop = 0): T[] {
  const anchor = Math.max(0, keepTop);
  if (items.length - anchor < 2) {
    return items;
  }
  const head = items.slice(0, anchor);
  const tail = items.slice(anchor);
  const offset = Math.abs(seed) % tail.length;
  if (offset === 0) {
    return items;
  }
  return [...head, ...tail.slice(offset), ...tail.slice(0, offset)];
}

// Pick the hero line-up for an epoch from a larger candidate pool: the lead
// alternates among the strongest few candidates, and the remaining slides are
// a rotating cyclic window over the rest of the pool.
export function selectHeroSlidesForEpoch<T>(
  pool: T[],
  options: {
    now?: Date | string | number;
    count?: number;
    leadPoolSize?: number;
    epoch?: number;
  } = {},
): T[] {
  const count = options.count ?? 5;
  if (pool.length <= count) {
    return pool.slice(0, count);
  }
  const epoch = options.epoch ?? getHomeRotationEpoch(options.now);
  const leadPoolSize = Math.max(1, Math.min(options.leadPoolSize ?? 3, pool.length));
  const lead = pool[hashHomeRotationSeed(epoch, "hero-lead") % leadPoolSize];
  const rest = rotateHomeItemsForSeed(
    pool.filter((item) => item !== lead),
    hashHomeRotationSeed(epoch, "hero-rest"),
  );
  return [lead, ...rest].slice(0, count);
}

// Rotate a rail's ranked items for the current epoch. Each rail gets its own
// seed stream via `railKey` so the whole surface doesn't shift in lockstep.
export function rotateHomeRailForEpoch<T>(
  items: T[],
  railKey: string,
  options: {
    now?: Date | string | number;
    keepTop?: number;
    epoch?: number;
  } = {},
): T[] {
  const epoch = options.epoch ?? getHomeRotationEpoch(options.now);
  return rotateHomeItemsForSeed(
    items,
    hashHomeRotationSeed(epoch, railKey),
    options.keepTop ?? 0,
  );
}

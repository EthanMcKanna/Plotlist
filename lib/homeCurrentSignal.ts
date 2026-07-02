export type HomeCurrentSignalItem = {
  year?: number | null;
  signal?: string | null;
  homeSignal?: string | null;
};

export type HomeCurrentSignalOptions = {
  now?: Date | number | string;
  recentYearWindow?: number;
  minRecentYear?: number;
  maxDatedSignalPastDays?: number;
  maxDatedSignalFutureDays?: number;
};

const DEFAULT_RECENT_YEAR_WINDOW = 1;
const DEFAULT_MAX_DATED_SIGNAL_PAST_DAYS = 45;
const DEFAULT_MAX_DATED_SIGNAL_FUTURE_DAYS = 45;
const DAY_MS = 24 * 60 * 60 * 1000;

const SIGNAL_MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const CURRENT_SIGNAL_PATTERN =
  /\b(airing|breakouts?|chart|drops?|finale|launch|new|premiere|returns?|season|s\d+|today|tonight|top\s*10)\b|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i;

const RELEASE_WINDOW_SIGNAL_PATTERN =
  /\b(airing|drops?|finale|launch|new|premiere|returns?|season|s\d+|today|tonight)\b|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i;

const CHART_SIGNAL_PATTERN = /\b(?:chart|top\s*10)\b/i;

const GENERIC_SIGNAL_PATTERN =
  /^(?:trending|\d+(?:\.\d+)?\s*tmdb|[\d,.]+k?\+?\s+(?:reviews?|watches?|saves?))$/i;

function getCurrentSignalYear(now: HomeCurrentSignalOptions["now"]) {
  if (now instanceof Date) return now.getUTCFullYear();
  const timestamp =
    typeof now === "number" ? now : now ? Date.parse(now) : Date.now();
  return new Date(Number.isFinite(timestamp) ? timestamp : Date.now()).getUTCFullYear();
}

function getCurrentSignalTimestamp(now: HomeCurrentSignalOptions["now"]) {
  if (now instanceof Date) return now.getTime();
  if (typeof now === "number") return now;
  return now ? Date.parse(now) : Date.now();
}

export function isGenericHomeSignal(signal: string | null | undefined) {
  const normalized = signal?.trim();
  return Boolean(normalized && GENERIC_SIGNAL_PATTERN.test(normalized));
}

export function hasExplicitCurrentHomeSignal(
  item: HomeCurrentSignalItem,
  options: HomeCurrentSignalOptions = {},
) {
  const signal = (item.signal ?? item.homeSignal)?.trim();
  if (!signal || isGenericHomeSignal(signal) || !CURRENT_SIGNAL_PATTERN.test(signal)) {
    return false;
  }

  const distance = getHomeSignalReleaseDistanceDays(item, options.now);
  if (distance === null) return true;
  const maxPastDays =
    options.maxDatedSignalPastDays ?? DEFAULT_MAX_DATED_SIGNAL_PAST_DAYS;
  const maxFutureDays =
    options.maxDatedSignalFutureDays ?? DEFAULT_MAX_DATED_SIGNAL_FUTURE_DAYS;
  return (
    distance >= -maxPastDays &&
    distance <= maxFutureDays
  );
}

export function hasReleaseWindowHomeSignal(item: HomeCurrentSignalItem) {
  const signal = (item.signal ?? item.homeSignal)?.trim();
  return Boolean(
    signal &&
      !isGenericHomeSignal(signal) &&
      RELEASE_WINDOW_SIGNAL_PATTERN.test(signal),
  );
}

export function getHomeSignalReleaseDistanceDays(
  item: HomeCurrentSignalItem | null | undefined,
  now: HomeCurrentSignalOptions["now"] = new Date(),
) {
  const signal = (item?.signal ?? item?.homeSignal)?.trim();
  if (!signal) return null;
  const match = signal.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})\b/i,
  );
  if (!match) return null;

  const month = SIGNAL_MONTHS[match[1].toLowerCase()];
  const day = Number(match[2]);
  const timestamp = getCurrentSignalTimestamp(now);
  if (!Number.isFinite(timestamp) || month === undefined || !Number.isFinite(day)) {
    return null;
  }

  const current = new Date(timestamp);
  const today = Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth(),
    current.getUTCDate(),
  );
  let release = Date.UTC(current.getUTCFullYear(), month, day);
  let distance = Math.round((release - today) / DAY_MS);
  if (distance < -180) {
    release = Date.UTC(current.getUTCFullYear() + 1, month, day);
    distance = Math.round((release - today) / DAY_MS);
  } else if (distance > 180) {
    release = Date.UTC(current.getUTCFullYear() - 1, month, day);
    distance = Math.round((release - today) / DAY_MS);
  }
  return distance;
}

export function isHomeReleaseWindowNear(
  item: HomeCurrentSignalItem,
  {
    now,
    maxPastDays = 7,
    maxFutureDays = 10,
  }: HomeCurrentSignalOptions & { maxPastDays?: number; maxFutureDays?: number } = {},
) {
  if (!hasReleaseWindowHomeSignal(item)) return false;
  const distance = getHomeSignalReleaseDistanceDays(item, now);
  return distance !== null && distance >= -maxPastDays && distance <= maxFutureDays;
}

export function hasChartOnlyHomeSignal(item: HomeCurrentSignalItem) {
  const signal = (item.signal ?? item.homeSignal)?.trim();
  return Boolean(
    signal &&
      !isGenericHomeSignal(signal) &&
      CHART_SIGNAL_PATTERN.test(signal) &&
      !RELEASE_WINDOW_SIGNAL_PATTERN.test(signal),
  );
}

export function hasCurrentHomeSignal(
  item: HomeCurrentSignalItem,
  options: HomeCurrentSignalOptions = {},
) {
  if (hasExplicitCurrentHomeSignal(item, options)) {
    return true;
  }

  const currentYear = getCurrentSignalYear(options.now);
  const minRecentYear =
    options.minRecentYear ??
    currentYear - (options.recentYearWindow ?? DEFAULT_RECENT_YEAR_WINDOW);
  return typeof item.year === "number" && item.year >= minRecentYear;
}

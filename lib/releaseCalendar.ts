import {
  getWatchService,
  getWatchServiceLogoUrl,
  normalizeWatchProviderToken,
  resolveWatchProviders,
  type WatchProviderSource,
} from "./watchProviders";

export const RELEASE_CALENDAR_MAX_ITEMS = 250;

// Services offered by the calendar's provider filter. Names/logos come from
// the canonical registry so the chips match what rows are labelled with.
const RELEASE_CALENDAR_PROVIDER_KEYS = [
  "netflix",
  "apple_tv",
  "max",
  "disney_plus",
  "hulu",
  "prime_video",
  "peacock",
  "paramount_plus",
];

export const RELEASE_CALENDAR_PROVIDER_OPTIONS: Array<{
  key: string;
  name: string;
  logoUrl: string;
}> = RELEASE_CALENDAR_PROVIDER_KEYS.map((key) => ({
  key,
  name: getWatchService(key)?.name ?? key,
  logoUrl: getWatchServiceLogoUrl(key) ?? "",
}));

export const RELEASE_CALENDAR_VIEWS = [
  { value: "tonight", label: "Tonight" },
  { value: "upcoming", label: "Upcoming" },
  { value: "premieres", label: "Premieres" },
  { value: "returning", label: "Returning" },
  { value: "finales", label: "Finales" },
] as const;

export type ReleaseCalendarView = (typeof RELEASE_CALENDAR_VIEWS)[number]["value"];

const RELEASE_CALENDAR_VIEW_VALUES = new Set<string>(
  RELEASE_CALENDAR_VIEWS.map((view) => view.value),
);

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// Resolved by lib/watchProviders: canonical key + display name, ordered
// original-first. `key`/`source` are optional so older cached payloads and
// hand-built fixtures (name only) keep working.
export type ReleaseCalendarProvider = {
  key?: string;
  name: string;
  logoUrl?: string | null;
  source?: WatchProviderSource;
};

export type ReleaseEventRecord = {
  showId: string;
  airDate: string;
  airDateTs: number;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle?: string | null;
  isPremiere: boolean;
  isReturningSeason: boolean;
  isSeasonFinale: boolean;
  isSeriesFinale: boolean;
};

export type ReleaseCalendarShowSource = {
  _id: string;
  title: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  providers: ReleaseCalendarProvider[];
  events: ReleaseEventRecord[];
  isStale: boolean;
};

export type ReleaseCalendarItem = ReleaseEventRecord & {
  show: {
    _id: string;
    title: string;
    posterUrl?: string | null;
    backdropUrl?: string | null;
  };
  providers: ReleaseCalendarProvider[];
};

export type ReleaseCalendarGroup = {
  airDate: string;
  airDateTs: number;
  items: ReleaseCalendarItem[];
};

export type ReleaseCalendarTrackedState = {
  showId: string;
  status: string;
};

export type TmdbReleaseEventRecord = ReleaseEventRecord;

export function getReleaseCalendarProviderNames() {
  return RELEASE_CALENDAR_PROVIDER_OPTIONS.map((provider) => provider.name);
}

export function normalizeReleaseCalendarView(
  view?: string | null,
): ReleaseCalendarView {
  return RELEASE_CALENDAR_VIEW_VALUES.has(view ?? "")
    ? (view as ReleaseCalendarView)
    : "upcoming";
}

export function isTrackedReleaseStatus(status: string) {
  // Caught-up shows are the ones users are actively waiting on — their
  // upcoming episodes belong on release surfaces just as much.
  return status === "watchlist" || status === "watching" || status === "caught_up";
}

export function getTrackedShowIdsFromStates(states: ReleaseCalendarTrackedState[]) {
  return Array.from(
    new Set(
      states.filter((state) => isTrackedReleaseStatus(state.status)).map((state) => state.showId),
    ),
  );
}

export function getReleaseCalendarShowIds(args: {
  states: ReleaseCalendarTrackedState[];
  favoriteShowIds?: string[] | null;
}) {
  const favoriteShowIds = (args.favoriteShowIds ?? [])
    .map((showId) => showId.trim())
    .filter((showId) => showId.length > 0);

  return Array.from(
    new Set([
      ...getTrackedShowIdsFromStates(args.states),
      ...favoriteShowIds,
    ]),
  );
}

/**
 * Selected-provider tokens (canonical keys, display names, or older stored
 * aliases like "HBO Max") → canonical keys, deduped in first-mention order.
 */
export function normalizeSelectedProviders(selectedProviders?: string[] | null) {
  if (!selectedProviders || selectedProviders.length === 0) {
    return [];
  }

  return Array.from(
    new Set(
      selectedProviders
        .map((provider) => normalizeWatchProviderToken(provider))
        .filter((provider): provider is string => Boolean(provider)),
    ),
  );
}

// Hand-rolled so this module (which QueryProvider pulls onto the root-layout
// graph) doesn't drag the whole non-tree-shaken date-fns barrel into startup.
export function getLocalDateString(value = new Date()) {
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

export function addDaysToDateOnlyString(value: string, days: number) {
  const parts = parseDateOnlyParts(value);
  if (!parts || !Number.isInteger(days)) {
    return null;
  }

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return date.toISOString().slice(0, 10);
}

/**
 * How many calendar days before the rebuild anchor a release-event refresh
 * keeps. The cron anchors on UTC "today", but a user west of UTC is still on
 * the previous evening when the 00:40Z run fires — pruning strictly before
 * UTC-today dropped tonight's episode from Tonight/Continue/calendar for
 * Pacific users and the 17:00-local digest for Alaska/Hawaii. Two days covers
 * every offset (UTC-12 … UTC+14 straddles at most two calendar days) with a
 * day to spare; readers filter on the user's own local day anyway.
 */
export const RELEASE_EVENT_RETENTION_DAYS = 2;

export function getReleaseEventWindowStart(today: string) {
  return addDaysToDateOnlyString(today, -RELEASE_EVENT_RETENTION_DAYS) ?? today;
}

// The easternmost timezone in use (UTC+14, Kiritimati); anywhere on Earth is
// at most this far ahead of the UTC clock.
const MAX_UTC_OFFSET_MINUTES = 14 * 60;

/**
 * Whether a calendar period ("YYYY-MM-DD", "YYYY-MM", or "YYYY") lies after
 * the user's local today. With a known offset that is exact; without one
 * (older builds) it tolerates the most eastern possible local day instead of
 * rejecting — a user east of ~UTC+10 logging "today" at breakfast otherwise
 * looked like a viewing in the future to the UTC worker clock.
 */
export function isCalendarPeriodAfterLocalToday(
  period: string,
  now: number,
  utcOffsetMinutes: number | null | undefined,
) {
  const offsetMinutes =
    typeof utcOffsetMinutes === "number" && Number.isFinite(utcOffsetMinutes)
      ? Math.max(-MAX_UTC_OFFSET_MINUTES, Math.min(MAX_UTC_OFFSET_MINUTES, utcOffsetMinutes))
      : MAX_UTC_OFFSET_MINUTES;
  const latestLocalDate = new Date(now + offsetMinutes * 60_000).toISOString().slice(0, 10);
  const trimmed = period.trim();
  if (!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(trimmed)) {
    return false;
  }
  // Zero-padded ISO pieces compare lexically; truncate "today" to the
  // period's own precision so "2026-09" is fine on any day of September.
  return trimmed > latestLocalDate.slice(0, trimmed.length);
}

/**
 * Resolve "today" for a user from their UTC offset. Server code must use this
 * instead of its own clock/timezone: Workers run in UTC, so a Wednesday
 * evening in the US already reads as Thursday there — which made Thursday
 * episodes flash "New" a day early. Falls back to process-local time when the
 * client didn't send an offset (older app builds).
 */
export function getUserLocalDayContext(
  now: number,
  utcOffsetMinutes: number | null | undefined,
) {
  if (
    typeof utcOffsetMinutes !== "number" ||
    !Number.isFinite(utcOffsetMinutes)
  ) {
    return {
      today: getLocalDateString(new Date(now)),
      todayStartTs: getStartOfLocalDayTimestamp(new Date(now)),
    };
  }
  const offsetMs = utcOffsetMinutes * 60_000;
  const today = new Date(now + offsetMs).toISOString().slice(0, 10);
  return {
    today,
    // Real UTC instant of the user's local midnight.
    todayStartTs: Date.parse(`${today}T00:00:00Z`) - offsetMs,
  };
}

export function getStartOfLocalDayTimestamp(value = new Date()) {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();
}

export function parseDateOnlyParts(value: string) {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const [, rawYear, rawMonth, rawDay] = match;
  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

export function isDateOnlyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(parseDateOnlyParts(value));
}

export function getDateOnlyTimestamp(value: string) {
  const parts = parseDateOnlyParts(value);
  if (!parts) {
    return Number.NaN;
  }

  return new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0).getTime();
}

export function getDateOnlyStartTimestamp(value: string) {
  const parts = parseDateOnlyParts(value);
  if (!parts) {
    return Number.NaN;
  }

  return new Date(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0).getTime();
}

/**
 * The real instant a date-only air date begins in the user's timezone
 * (client offset semantics: `-new Date().getTimezoneOffset()`). Without an
 * offset this degrades to the server's own day start. Used for ranking, so
 * "dropped today" sorts above "watched last night" no matter where the user
 * is relative to UTC.
 */
export function getDateOnlyStartTimestampForOffset(
  value: string,
  utcOffsetMinutes: number | null | undefined,
) {
  if (typeof utcOffsetMinutes !== "number" || !Number.isFinite(utcOffsetMinutes)) {
    return getDateOnlyStartTimestamp(value);
  }
  const parts = parseDateOnlyParts(value);
  if (!parts) {
    return Number.NaN;
  }
  return Date.UTC(parts.year, parts.month - 1, parts.day) - utcOffsetMinutes * 60_000;
}

export function getDateOnlyEndTimestamp(value: string) {
  const parts = parseDateOnlyParts(value);
  if (!parts) {
    return Number.NaN;
  }

  return new Date(parts.year, parts.month - 1, parts.day, 23, 59, 59, 999).getTime();
}

export function getReleaseEventFlags(args: {
  seasonNumber: number;
  episodeNumber: number;
  lastEpisodeNumber: number;
  maxSeasonNumber: number;
  showStatus?: string | null;
}) {
  const isPremiere = args.seasonNumber === 1 && args.episodeNumber === 1;
  const isReturningSeason = args.seasonNumber > 1 && args.episodeNumber === 1;
  const isSeasonFinale =
    args.lastEpisodeNumber > 0 && args.episodeNumber === args.lastEpisodeNumber;
  const normalizedStatus = (args.showStatus ?? "").toLowerCase();
  const isSeriesFinale =
    isSeasonFinale &&
    args.seasonNumber === args.maxSeasonNumber &&
    normalizedStatus === "ended";

  return {
    isPremiere,
    isReturningSeason,
    isSeasonFinale,
    isSeriesFinale,
  };
}

export function matchesReleaseView(
  event: ReleaseEventRecord,
  view: ReleaseCalendarView,
  today: string,
) {
  if (!isDateOnlyString(event.airDate) || !isDateOnlyString(today)) {
    return false;
  }

  if (event.airDate < today) {
    return false;
  }

  switch (normalizeReleaseCalendarView(view)) {
    case "tonight":
      return event.airDate === today;
    case "upcoming":
      return true;
    case "premieres":
      return event.isPremiere;
    case "returning":
      return event.isReturningSeason;
    case "finales":
      return event.isSeasonFinale;
    default:
      return false;
  }
}

export function matchesSelectedProviders(
  providers: ReleaseCalendarProvider[],
  selectedProviders: string[],
) {
  if (selectedProviders.length === 0) {
    return true;
  }

  const providerSet = new Set(
    providers
      .map((provider) => provider.key ?? normalizeWatchProviderToken(provider.name))
      .filter((provider): provider is string => Boolean(provider)),
  );
  return selectedProviders.some((provider) => providerSet.has(provider));
}

export function isReleaseSyncStateStale(
  syncState:
    | {
        expiresAt?: number | null;
        status?: string | null;
      }
    | null
    | undefined,
  now: number,
) {
  if (!syncState) {
    return true;
  }

  if (typeof syncState.expiresAt !== "number") {
    return true;
  }

  const status = syncState.status ?? "idle";
  if (!["ready", "failed", "running", "scheduled"].includes(status)) {
    return true;
  }

  return syncState.expiresAt <= now;
}

/**
 * US "where to watch" for a cached TMDB detail payload (raw or the slim
 * `{ networks, watchProviders }` projection), resolved through the shared
 * lib/watchProviders rules and ordered original-first so the first entry is
 * the right label for a release row.
 */
export function extractTmdbReleaseProviders(
  details: any,
  region = "US",
): ReleaseCalendarProvider[] {
  return resolveWatchProviders(details, { region }).map((provider) => ({
    key: provider.key,
    name: provider.name,
    logoUrl: provider.logoUrl,
    source: provider.source,
  }));
}

function parseOffsetCursor(cursor?: string | null) {
  if (!cursor) {
    return 0;
  }

  const parsed = Number(cursor);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function isUsableReleaseEvent(event: ReleaseEventRecord) {
  return (
    isDateOnlyString(event.airDate) &&
    Number.isFinite(event.airDateTs) &&
    Number.isInteger(event.seasonNumber) &&
    Number.isInteger(event.episodeNumber) &&
    event.seasonNumber > 0 &&
    event.episodeNumber > 0
  );
}

export function buildReleaseCalendarData(args: {
  shows: ReleaseCalendarShowSource[];
  today: string;
  view: ReleaseCalendarView | string;
  selectedProviders?: string[] | null;
  limit?: number;
  cursor?: string | null;
}) {
  const normalizedProviders = normalizeSelectedProviders(args.selectedProviders);
  const view = normalizeReleaseCalendarView(args.view);
  const today = isDateOnlyString(args.today) ? args.today : getLocalDateString();
  const staleShowIds = args.shows.filter((show) => show.isStale).map((show) => show._id);
  const seenEventKeys = new Set<string>();

  const items = args.shows
    .filter((show) => matchesSelectedProviders(show.providers, normalizedProviders))
    .flatMap((show) =>
      show.events
        .filter((event) => isUsableReleaseEvent(event))
        .filter((event) => {
          const key = [
            show._id,
            event.airDate,
            event.seasonNumber,
            event.episodeNumber,
          ].join(":");
          if (seenEventKeys.has(key)) {
            return false;
          }
          seenEventKeys.add(key);
          return true;
        })
        .filter((event) => matchesReleaseView(event, view, today))
        .map<ReleaseCalendarItem>((event) => ({
          ...event,
          airDateTs: getDateOnlyTimestamp(event.airDate),
          show: {
            _id: show._id,
            title: show.title,
            posterUrl: show.posterUrl ?? null,
            backdropUrl: show.backdropUrl ?? null,
          },
          providers: show.providers,
        })),
    )
    .sort((left, right) => {
      return (
        left.airDate.localeCompare(right.airDate) ||
        left.show.title.localeCompare(right.show.title) ||
        left.seasonNumber - right.seasonNumber ||
        left.episodeNumber - right.episodeNumber
      );
    });

  const limit = Math.max(1, Math.min(args.limit ?? 25, RELEASE_CALENDAR_MAX_ITEMS));
  const start = parseOffsetCursor(args.cursor);
  const pageItems = items.slice(start, start + limit);
  const nextOffset = start + pageItems.length;

  const groups: ReleaseCalendarGroup[] = [];
  for (const item of pageItems) {
    const previous = groups[groups.length - 1];
    if (previous && previous.airDate === item.airDate) {
      previous.items.push(item);
      continue;
    }

    groups.push({
      airDate: item.airDate,
      airDateTs: item.airDateTs,
      items: [item],
    });
  }

  return {
    groups,
    providerOptions: RELEASE_CALENDAR_PROVIDER_OPTIONS,
    selectedProviders: normalizedProviders,
    totalItems: items.length,
    staleShowIds,
    continueCursor: String(nextOffset),
    isDone: nextOffset >= items.length,
  };
}

function readTmdbSeasonNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function readTmdbAirDate(value: unknown) {
  return isDateOnlyString(value) ? value : null;
}

function getTmdbSeasonEpisodeCount(details: any, seasonNumber: number) {
  const seasons = Array.isArray(details?.seasons) ? details.seasons : [];
  const summary = seasons.find(
    (season: any) => readTmdbSeasonNumber(season?.season_number) === seasonNumber,
  );
  const count = Number(summary?.episode_count);
  return Number.isInteger(count) && count > 0 ? count : 0;
}

export function getTmdbReleaseCandidateSeasonNumbers(args: {
  details: any;
  today: string;
  horizon: string;
  maxSeasons?: number;
}) {
  if (!isDateOnlyString(args.today) || !isDateOnlyString(args.horizon)) {
    return [];
  }

  const seasons = Array.isArray(args.details?.seasons) ? args.details.seasons : [];
  const importantSeasonNumbers = new Set<number>();
  const nextSeason = readTmdbSeasonNumber(args.details?.next_episode_to_air?.season_number);
  const lastSeason = readTmdbSeasonNumber(args.details?.last_episode_to_air?.season_number);

  if (nextSeason) importantSeasonNumbers.add(nextSeason);
  if (lastSeason) importantSeasonNumbers.add(lastSeason);

  const candidates = seasons
    .filter((season: any) => readTmdbSeasonNumber(season?.season_number))
    .filter((season: any) => {
      const seasonNumber = readTmdbSeasonNumber(season.season_number);
      if (!seasonNumber) return false;
      if (importantSeasonNumbers.has(seasonNumber)) return true;

      const airDate = readTmdbAirDate(season.air_date);
      return Boolean(airDate && airDate <= args.horizon && airDate >= args.today);
    })
    .sort((left: any, right: any) => Number(right.season_number) - Number(left.season_number))
    .map((season: any) => Number(season.season_number));

  return Array.from(new Set([...importantSeasonNumbers, ...candidates])).slice(
    0,
    Math.max(1, args.maxSeasons ?? 4),
  );
}

export function buildTmdbReleaseEventsForShow(args: {
  showId: string;
  details: any;
  seasonPayloads: any[];
  today: string;
  horizon: string;
  /**
   * Earliest air date to keep (defaults to `today`). Refreshes pass a day or
   * two earlier so a UTC-anchored rebuild never discards an episode that is
   * still "tonight" for users west of UTC.
   */
  windowStart?: string;
}): TmdbReleaseEventRecord[] {
  if (!isDateOnlyString(args.today) || !isDateOnlyString(args.horizon)) {
    return [];
  }

  const windowStart =
    args.windowStart && isDateOnlyString(args.windowStart) && args.windowStart < args.today
      ? args.windowStart
      : args.today;
  const todayStart = getDateOnlyStartTimestamp(windowStart);
  const horizonEnd = getDateOnlyEndTimestamp(args.horizon);
  const seasons = Array.isArray(args.details?.seasons) ? args.details.seasons : [];
  const maxSeasonNumber = Math.max(
    0,
    ...seasons
      .map((season: any) => readTmdbSeasonNumber(season?.season_number) ?? 0)
      .filter((seasonNumber: number) => seasonNumber > 0),
  );
  const seenKeys = new Set<string>();
  const events: TmdbReleaseEventRecord[] = [];

  for (const seasonPayload of args.seasonPayloads) {
    const episodes = Array.isArray(seasonPayload?.episodes) ? seasonPayload.episodes : [];
    const payloadSeasonNumber = readTmdbSeasonNumber(seasonPayload?.season_number);
    const lastEpisodeNumber = payloadSeasonNumber
      ? getTmdbSeasonEpisodeCount(args.details, payloadSeasonNumber)
      : 0;

    for (const episode of episodes) {
      const airDate = readTmdbAirDate(episode?.air_date);
      const airDateTs = airDate ? getDateOnlyTimestamp(airDate) : Number.NaN;
      if (
        !airDate ||
        !Number.isFinite(airDateTs) ||
        airDateTs < todayStart ||
        airDateTs > horizonEnd
      ) {
        continue;
      }

      const seasonNumber =
        readTmdbSeasonNumber(episode?.season_number) ?? payloadSeasonNumber;
      const episodeNumber = Number(episode?.episode_number);
      if (
        !seasonNumber ||
        !Number.isInteger(episodeNumber) ||
        episodeNumber <= 0
      ) {
        continue;
      }

      const eventKey = [args.showId, airDate, seasonNumber, episodeNumber].join(":");
      if (seenKeys.has(eventKey)) {
        continue;
      }
      seenKeys.add(eventKey);

      const flags = getReleaseEventFlags({
        seasonNumber,
        episodeNumber,
        lastEpisodeNumber,
        maxSeasonNumber,
        showStatus: args.details?.status,
      });

      events.push({
        showId: args.showId,
        airDate,
        airDateTs,
        seasonNumber,
        episodeNumber,
        episodeTitle:
          typeof episode?.name === "string" && episode.name.trim().length > 0
            ? episode.name
            : null,
        ...flags,
      });
    }
  }

  return events.sort(
    (left, right) =>
      left.airDate.localeCompare(right.airDate) ||
      left.seasonNumber - right.seasonNumber ||
      left.episodeNumber - right.episodeNumber,
  );
}

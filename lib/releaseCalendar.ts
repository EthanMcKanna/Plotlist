import { format } from "date-fns";

export const RELEASE_CALENDAR_MAX_ITEMS = 250;

export const RELEASE_CALENDAR_PROVIDER_OPTIONS = [
  {
    key: "netflix",
    name: "Netflix",
    logoUrl: "https://image.tmdb.org/t/p/w92/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg",
  },
  {
    key: "apple_tv",
    name: "Apple TV",
    logoUrl: "https://image.tmdb.org/t/p/w92/mcbz1LgtErU9p4UdbZ0rG6RTWHX.jpg",
  },
  {
    key: "max",
    name: "Max",
    logoUrl: "https://image.tmdb.org/t/p/w92/jbe4gVSfRlbPTdESXhEKpornsfu.jpg",
  },
  {
    key: "disney_plus",
    name: "Disney+",
    logoUrl: "https://image.tmdb.org/t/p/w92/97yvRBw1GzX7fXprcF80er19ot.jpg",
  },
  {
    key: "hulu",
    name: "Hulu",
    logoUrl: "https://image.tmdb.org/t/p/w92/bxBlRPEPpMVDc4jMhSrTf2339DW.jpg",
  },
  {
    key: "prime_video",
    name: "Prime Video",
    logoUrl: "https://image.tmdb.org/t/p/w92/pvske1MyAoymrs5bguRfVqYiM9a.jpg",
  },
  {
    key: "peacock",
    name: "Peacock",
    logoUrl: "https://image.tmdb.org/t/p/w92/h5DcR0J2EESLitnhR8xLG1QymTE.jpg",
  },
] as const;

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

const PROVIDER_ALIAS_BY_LOOKUP = new Map<string, string>(
  RELEASE_CALENDAR_PROVIDER_OPTIONS.flatMap((provider) => [
    [provider.key.toLowerCase(), provider.name],
    [provider.name.toLowerCase(), provider.name],
  ]),
);

[
  ["apple tv+", "Apple TV"],
  ["apple tv plus", "Apple TV"],
  ["appletv", "Apple TV"],
  ["disney plus", "Disney+"],
  ["prime", "Prime Video"],
  ["amazon prime", "Prime Video"],
  ["amazon prime video", "Prime Video"],
  ["hbo max", "Max"],
].forEach(([alias, name]) => PROVIDER_ALIAS_BY_LOOKUP.set(alias, name));

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type ReleaseCalendarProvider = {
  name: string;
  logoUrl?: string | null;
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

const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

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
  return status === "watchlist" || status === "watching";
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

function normalizeProviderName(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  return PROVIDER_ALIAS_BY_LOOKUP.get(normalized) ?? null;
}

export function normalizeSelectedProviders(selectedProviders?: string[] | null) {
  if (!selectedProviders || selectedProviders.length === 0) {
    return [];
  }

  return Array.from(
    new Set(
      selectedProviders
        .map((provider) => normalizeProviderName(provider))
        .filter((provider): provider is string => Boolean(provider)),
    ),
  );
}

export function getLocalDateString(value = new Date()) {
  return format(value, "yyyy-MM-dd");
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
      .map((provider) => normalizeProviderName(provider.name))
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

function tmdbLogoUrl(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const path = value.trim();
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${TMDB_IMAGE_BASE_URL}/w92${path}`;
}

function readTmdbProviderName(provider: any) {
  const rawName =
    provider?.name ??
    provider?.providerName ??
    provider?.provider_name ??
    provider?.displayName;
  return typeof rawName === "string" ? normalizeProviderName(rawName) : null;
}

function readTmdbProviderLogo(provider: any) {
  return (
    tmdbLogoUrl(provider?.logoUrl) ??
    tmdbLogoUrl(provider?.logoPath) ??
    tmdbLogoUrl(provider?.logo_path)
  );
}

function readRegionalWatchProviders(details: any, region: string) {
  const results =
    details?.watchProviders?.results ??
    details?.watch_providers?.results ??
    details?.["watch/providers"]?.results ??
    details?.["watchProviders"]?.results ??
    {};
  return results?.[region] ?? null;
}

export function extractTmdbReleaseProviders(
  details: any,
  region = "US",
): ReleaseCalendarProvider[] {
  const regionalProviders = readRegionalWatchProviders(details, region);
  const buckets = ["flatrate", "ads", "free"];
  const seen = new Set<string>();
  const providers: ReleaseCalendarProvider[] = [];

  for (const bucket of buckets) {
    const items = Array.isArray(regionalProviders?.[bucket])
      ? regionalProviders[bucket]
      : [];
    for (const item of items) {
      const name = readTmdbProviderName(item);
      if (!name || seen.has(name)) {
        continue;
      }
      seen.add(name);
      providers.push({
        name,
        logoUrl:
          readTmdbProviderLogo(item) ??
          RELEASE_CALENDAR_PROVIDER_OPTIONS.find((provider) => provider.name === name)?.logoUrl ??
          null,
      });
    }
  }

  return providers;
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
}): TmdbReleaseEventRecord[] {
  if (!isDateOnlyString(args.today) || !isDateOnlyString(args.horizon)) {
    return [];
  }

  const todayStart = getDateOnlyStartTimestamp(args.today);
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

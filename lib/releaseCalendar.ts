import { format } from "date-fns";

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
] as const;

export type ReleaseCalendarView = (typeof RELEASE_CALENDAR_VIEWS)[number]["value"];

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
  providers: ReleaseCalendarProvider[];
  events: ReleaseEventRecord[];
  isStale: boolean;
};

export type ReleaseCalendarItem = ReleaseEventRecord & {
  show: {
    _id: string;
    title: string;
    posterUrl?: string | null;
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

export function getReleaseCalendarProviderNames() {
  return RELEASE_CALENDAR_PROVIDER_OPTIONS.map((provider) => provider.name);
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

export function normalizeSelectedProviders(selectedProviders?: string[] | null) {
  if (!selectedProviders || selectedProviders.length === 0) {
    return [];
  }

  const allowed = new Set<string>(getReleaseCalendarProviderNames());
  return Array.from(
    new Set(
      selectedProviders
        .map((provider) => provider.trim())
        .filter((provider) => provider.length > 0 && allowed.has(provider)),
    ),
  );
}

export function getLocalDateString(value = new Date()) {
  return format(value, "yyyy-MM-dd");
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
  if (event.airDate < today) {
    return false;
  }

  switch (view) {
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

  const providerSet = new Set(providers.map((provider) => provider.name));
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

  if (syncState.status === "running" || syncState.status === "scheduled") {
    return false;
  }

  if (typeof syncState.expiresAt !== "number") {
    return true;
  }

  return syncState.expiresAt <= now;
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

export function buildReleaseCalendarData(args: {
  shows: ReleaseCalendarShowSource[];
  today: string;
  view: ReleaseCalendarView;
  selectedProviders?: string[] | null;
  limit?: number;
  cursor?: string | null;
}) {
  const normalizedProviders = normalizeSelectedProviders(args.selectedProviders);
  const staleShowIds = args.shows.filter((show) => show.isStale).map((show) => show._id);

  const items = args.shows
    .filter((show) => matchesSelectedProviders(show.providers, normalizedProviders))
    .flatMap((show) =>
      show.events
        .filter((event) => matchesReleaseView(event, args.view, args.today))
        .map<ReleaseCalendarItem>((event) => ({
          ...event,
          show: {
            _id: show._id,
            title: show.title,
            posterUrl: show.posterUrl ?? null,
          },
          providers: show.providers,
        })),
    )
    .sort((left, right) => {
      return (
        left.airDateTs - right.airDateTs ||
        left.show.title.localeCompare(right.show.title) ||
        left.seasonNumber - right.seasonNumber ||
        left.episodeNumber - right.episodeNumber
      );
    });

  const limit = Math.max(1, Math.min(args.limit ?? 25, 100));
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
    selectedProviders: normalizedProviders,
    totalItems: items.length,
    staleShowIds,
    continueCursor: String(nextOffset),
    isDone: nextOffset >= items.length,
  };
}

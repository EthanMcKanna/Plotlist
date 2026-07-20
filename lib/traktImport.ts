// Pure Trakt-import transforms: raw Trakt API payloads → the normalized
// snapshot the resumable import engine (api/_lib/trakt-import.ts) works
// through, plus the derivations (rewatch flags, rating conversion, progress
// math) that deserve direct unit tests. No IO here.

export type TraktShowRef = {
  /** Stable key for a Trakt show across every snapshot section. */
  key: string;
  title: string;
  year: number | null;
  tmdbId: number | null;
  imdbId: string | null;
  tvdbId: number | null;
};

export type TraktSnapshotEpisode = {
  seasonNumber: number;
  episodeNumber: number;
  plays: number;
  lastWatchedAt: number | null;
};

export type TraktSnapshotWatchedShow = {
  key: string;
  lastWatchedAt: number | null;
  episodes: TraktSnapshotEpisode[];
};

export type TraktSnapshotHistoryEvent = {
  /** Trakt history event id — drives the deterministic diary-row id. */
  id: number;
  key: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string | null;
  watchedAt: number;
};

export type TraktSnapshotShowRating = {
  key: string;
  rating: number;
  ratedAt: number | null;
};

export type TraktSnapshotEpisodeRating = {
  key: string;
  seasonNumber: number;
  episodeNumber: number;
  rating: number;
  ratedAt: number | null;
};

export type TraktSnapshotWatchlistItem = {
  key: string;
  listedAt: number | null;
};

export type TraktSnapshot = {
  version: 1;
  fetchedAt: number;
  showRefs: Record<string, TraktShowRef>;
  watched: TraktSnapshotWatchedShow[];
  history: TraktSnapshotHistoryEvent[];
  showRatings: TraktSnapshotShowRating[];
  episodeRatings: TraktSnapshotEpisodeRating[];
  watchlist: TraktSnapshotWatchlistItem[];
  /** Resolved during the match phase: show key → Plotlist show id (or null). */
  mapping: Record<string, string | null>;
  /** Why an unresolved key could not be matched, keyed like `mapping`. */
  unmatchedReasons: Record<string, string>;
  /** True when history was cut off at the safety cap. */
  historyTruncated: boolean;
};

export type TraktImportOptions = {
  history: boolean;
  ratings: boolean;
  watchlist: boolean;
};

// Trakt timestamps are ISO 8601 UTC instants. Clamp out of the future so a
// skewed client clock can never sort an import ahead of "now".
export function parseTraktTimestamp(value: unknown, now: number): number | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.min(parsed, now);
}

// Trakt rates 1-10; Plotlist stars are 0.5-5 in half steps.
export function traktRatingToStars(rating: unknown): number | null {
  if (typeof rating !== "number" || !Number.isFinite(rating)) {
    return null;
  }
  const stars = Math.round(rating) / 2;
  if (stars < 0.5 || stars > 5) {
    return null;
  }
  return stars;
}

type RawTraktShow = {
  title?: unknown;
  year?: unknown;
  ids?: {
    trakt?: unknown;
    slug?: unknown;
    tvdb?: unknown;
    imdb?: unknown;
    tmdb?: unknown;
  };
};

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildShowRef(raw: RawTraktShow | undefined): TraktShowRef | null {
  const ids = raw?.ids ?? {};
  const traktId = asFiniteNumber(ids.trakt);
  const tmdbId = asFiniteNumber(ids.tmdb);
  const imdbId =
    typeof ids.imdb === "string" && ids.imdb.startsWith("tt") ? ids.imdb : null;
  const tvdbId = asFiniteNumber(ids.tvdb);
  const title = typeof raw?.title === "string" && raw.title.length > 0 ? raw.title : null;

  const key =
    traktId !== null
      ? `trakt:${traktId}`
      : tmdbId !== null
        ? `tmdb:${tmdbId}`
        : imdbId !== null
          ? `imdb:${imdbId}`
          : tvdbId !== null
            ? `tvdb:${tvdbId}`
            : title
              ? `title:${title.toLowerCase()}|${asFiniteNumber(raw?.year) ?? ""}`
              : null;
  if (!key) {
    return null;
  }
  return {
    key,
    title: title ?? "Unknown show",
    year: asFiniteNumber(raw?.year),
    tmdbId,
    imdbId,
    tvdbId,
  };
}

function registerShowRef(
  refs: Record<string, TraktShowRef>,
  raw: RawTraktShow | undefined,
): TraktShowRef | null {
  const ref = buildShowRef(raw);
  if (!ref) {
    return null;
  }
  const existing = refs[ref.key];
  if (!existing) {
    refs[ref.key] = ref;
    return ref;
  }
  // Prefer whichever copy carries more external ids.
  refs[ref.key] = {
    ...existing,
    tmdbId: existing.tmdbId ?? ref.tmdbId,
    imdbId: existing.imdbId ?? ref.imdbId,
    tvdbId: existing.tvdbId ?? ref.tvdbId,
    year: existing.year ?? ref.year,
  };
  return refs[ref.key];
}

export function normalizeWatchedShows(
  raw: unknown,
  refs: Record<string, TraktShowRef>,
  now: number,
): TraktSnapshotWatchedShow[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const normalized: TraktSnapshotWatchedShow[] = [];
  for (const entry of raw) {
    const ref = registerShowRef(refs, entry?.show);
    if (!ref) {
      continue;
    }
    const showLastWatchedAt = parseTraktTimestamp(entry?.last_watched_at, now);
    const episodes: TraktSnapshotEpisode[] = [];
    const seasons = Array.isArray(entry?.seasons) ? entry.seasons : [];
    for (const season of seasons) {
      const seasonNumber = asFiniteNumber(season?.number);
      if (seasonNumber === null || seasonNumber < 0) {
        continue;
      }
      const seasonEpisodes = Array.isArray(season?.episodes) ? season.episodes : [];
      for (const episode of seasonEpisodes) {
        const episodeNumber = asFiniteNumber(episode?.number);
        if (episodeNumber === null || episodeNumber < 0) {
          continue;
        }
        episodes.push({
          seasonNumber,
          episodeNumber,
          plays: Math.max(1, asFiniteNumber(episode?.plays) ?? 1),
          lastWatchedAt:
            parseTraktTimestamp(episode?.last_watched_at, now) ?? showLastWatchedAt,
        });
      }
    }
    if (episodes.length === 0) {
      continue;
    }
    normalized.push({ key: ref.key, lastWatchedAt: showLastWatchedAt, episodes });
  }
  return normalized;
}

export function normalizeHistoryItems(
  raw: unknown,
  refs: Record<string, TraktShowRef>,
  now: number,
): TraktSnapshotHistoryEvent[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const events: TraktSnapshotHistoryEvent[] = [];
  for (const item of raw) {
    if (item?.type !== undefined && item.type !== "episode") {
      continue;
    }
    const ref = registerShowRef(refs, item?.show);
    const id = asFiniteNumber(item?.id);
    const seasonNumber = asFiniteNumber(item?.episode?.season);
    const episodeNumber = asFiniteNumber(item?.episode?.number);
    const watchedAt = parseTraktTimestamp(item?.watched_at, now);
    if (
      !ref ||
      id === null ||
      seasonNumber === null ||
      seasonNumber < 0 ||
      episodeNumber === null ||
      episodeNumber < 0 ||
      watchedAt === null
    ) {
      continue;
    }
    events.push({
      id,
      key: ref.key,
      seasonNumber,
      episodeNumber,
      episodeTitle:
        typeof item?.episode?.title === "string" && item.episode.title.length > 0
          ? item.episode.title
          : null,
      watchedAt,
    });
  }
  return events;
}

export function normalizeShowRatings(
  raw: unknown,
  refs: Record<string, TraktShowRef>,
  now: number,
): TraktSnapshotShowRating[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const ratings: TraktSnapshotShowRating[] = [];
  for (const item of raw) {
    if (item?.type !== undefined && item.type !== "show") {
      continue;
    }
    const ref = registerShowRef(refs, item?.show);
    const stars = traktRatingToStars(item?.rating);
    if (!ref || stars === null) {
      continue;
    }
    ratings.push({
      key: ref.key,
      rating: stars,
      ratedAt: parseTraktTimestamp(item?.rated_at, now),
    });
  }
  return ratings;
}

export function normalizeEpisodeRatings(
  raw: unknown,
  refs: Record<string, TraktShowRef>,
  now: number,
): TraktSnapshotEpisodeRating[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const ratings: TraktSnapshotEpisodeRating[] = [];
  for (const item of raw) {
    if (item?.type !== undefined && item.type !== "episode") {
      continue;
    }
    const ref = registerShowRef(refs, item?.show);
    const stars = traktRatingToStars(item?.rating);
    const seasonNumber = asFiniteNumber(item?.episode?.season);
    const episodeNumber = asFiniteNumber(item?.episode?.number);
    if (
      !ref ||
      stars === null ||
      seasonNumber === null ||
      seasonNumber < 0 ||
      episodeNumber === null ||
      episodeNumber < 0
    ) {
      continue;
    }
    ratings.push({
      key: ref.key,
      seasonNumber,
      episodeNumber,
      rating: stars,
      ratedAt: parseTraktTimestamp(item?.rated_at, now),
    });
  }
  return ratings;
}

export function normalizeWatchlistItems(
  raw: unknown,
  refs: Record<string, TraktShowRef>,
  now: number,
): TraktSnapshotWatchlistItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const items: TraktSnapshotWatchlistItem[] = [];
  for (const item of raw) {
    if (item?.type !== undefined && item.type !== "show") {
      continue;
    }
    const ref = registerShowRef(refs, item?.show);
    if (!ref) {
      continue;
    }
    items.push({ key: ref.key, listedAt: parseTraktTimestamp(item?.listed_at, now) });
  }
  return items;
}

// Fold history events into the watched structure so episode progress can be
// derived even though the modern /sync/watched/shows response carries no
// per-episode seasons breakdown (aggregate plays only — verified 2026-07-20;
// history events are the underlying source of truth anyway). Episodes already
// present from a seasons-style payload win; history-derived episodes use the
// EARLIEST play as the watched date (rewatches live in the diary) and count
// their plays. Original show order is preserved and new shows append, so the
// progress cursor stays stable across resumes.
export function mergeHistoryIntoWatched(
  watched: TraktSnapshotWatchedShow[],
  history: TraktSnapshotHistoryEvent[],
): TraktSnapshotWatchedShow[] {
  const byShow = new Map<string, TraktSnapshotWatchedShow>();
  for (const show of watched) {
    byShow.set(show.key, { ...show, episodes: [...show.episodes] });
  }
  const fromHistory = new Map<string, TraktSnapshotEpisode>();
  const preexisting = new Set<string>();
  for (const show of byShow.values()) {
    for (const episode of show.episodes) {
      preexisting.add(`${show.key}|${episode.seasonNumber}|${episode.episodeNumber}`);
    }
  }

  const sorted = [...history].sort((a, b) => a.watchedAt - b.watchedAt || a.id - b.id);
  for (const event of sorted) {
    const episodeKey = `${event.key}|${event.seasonNumber}|${event.episodeNumber}`;
    if (preexisting.has(episodeKey)) {
      continue;
    }
    const existing = fromHistory.get(episodeKey);
    if (existing) {
      existing.plays += 1;
      continue;
    }
    let show = byShow.get(event.key);
    if (!show) {
      show = { key: event.key, lastWatchedAt: null, episodes: [] };
      byShow.set(event.key, show);
    }
    const episode: TraktSnapshotEpisode = {
      seasonNumber: event.seasonNumber,
      episodeNumber: event.episodeNumber,
      plays: 1,
      lastWatchedAt: event.watchedAt,
    };
    show.episodes.push(episode);
    show.lastWatchedAt = Math.max(show.lastWatchedAt ?? 0, event.watchedAt) || event.watchedAt;
    fromHistory.set(episodeKey, episode);
  }

  return Array.from(byShow.values()).filter((show) => show.episodes.length > 0);
}

// A viewing is a rewatch when an earlier history event exists for the same
// episode. Events are compared chronologically (ties broken by event id, so
// the flags are stable across runs); input order does not matter.
export function computeRewatchFlags(
  events: TraktSnapshotHistoryEvent[],
): Map<number, boolean> {
  const sorted = [...events].sort(
    (a, b) => a.watchedAt - b.watchedAt || a.id - b.id,
  );
  const seen = new Set<string>();
  const flags = new Map<number, boolean>();
  for (const event of sorted) {
    const episodeKey = `${event.key}|${event.seasonNumber}|${event.episodeNumber}`;
    flags.set(event.id, seen.has(episodeKey));
    seen.add(episodeKey);
  }
  return flags;
}

// Deterministic diary-row id per Trakt history event: a re-import can never
// duplicate a viewing because the second insert hits the same primary key.
export function traktLogId(eventId: number) {
  return `log_trakt_${eventId}`;
}

export function traktReviewId(args: {
  traktKey: string;
  seasonNumber?: number;
  episodeNumber?: number;
}) {
  const scope =
    args.seasonNumber !== undefined && args.episodeNumber !== undefined
      ? `e${args.seasonNumber}x${args.episodeNumber}`
      : "show";
  // Keys can contain ":" (e.g. "trakt:123"); normalize for readability.
  return `review_trakt_${args.traktKey.replace(/[^a-zA-Z0-9]/g, "-")}_${scope}`;
}

// Overall progress for the UI: item-weighted across the phases the job will
// actually run. The fetch phase is excluded (its size is unknown until it
// finishes); callers show an indeterminate state while fetching.
export function computeImportProgressPercent(args: {
  phase: string;
  options: TraktImportOptions;
  counts: Record<string, number>;
  cursor: Record<string, number>;
}): number | null {
  if (args.phase === "fetch") {
    return null;
  }
  const showsTotal = args.counts.showsTotal ?? 0;
  const segments: Array<{ total: number; done: number }> = [
    { total: showsTotal, done: Math.min(args.cursor.matchIndex ?? 0, showsTotal) },
  ];
  if (args.options.history) {
    const progressTotal = args.counts.watchedShowsTotal ?? 0;
    const historyTotal = args.counts.historyTotal ?? 0;
    segments.push({
      total: progressTotal,
      done: Math.min(args.cursor.progressIndex ?? 0, progressTotal),
    });
    segments.push({
      total: historyTotal,
      done: Math.min(args.cursor.diaryIndex ?? 0, historyTotal),
    });
  }
  if (args.options.ratings) {
    const total = (args.counts.showRatingsTotal ?? 0) + (args.counts.episodeRatingsTotal ?? 0);
    const done =
      Math.min(args.cursor.showRatingIndex ?? 0, args.counts.showRatingsTotal ?? 0) +
      Math.min(args.cursor.episodeRatingIndex ?? 0, args.counts.episodeRatingsTotal ?? 0);
    segments.push({ total, done });
  }
  if (args.options.watchlist) {
    const total = args.counts.watchlistTotal ?? 0;
    segments.push({ total, done: Math.min(args.cursor.watchlistIndex ?? 0, total) });
  }

  const totalItems = segments.reduce((sum, segment) => sum + segment.total, 0);
  if (totalItems === 0) {
    return args.phase === "finalize" ? 100 : null;
  }
  const doneItems = segments.reduce((sum, segment) => sum + segment.done, 0);
  const percent = Math.round((doneItems / totalItems) * 100);
  return Math.max(0, Math.min(100, percent));
}

export function emptyTraktSnapshot(now: number): TraktSnapshot {
  return {
    version: 1,
    fetchedAt: now,
    showRefs: {},
    watched: [],
    history: [],
    showRatings: [],
    episodeRatings: [],
    watchlist: [],
    mapping: {},
    unmatchedReasons: {},
    historyTruncated: false,
  };
}

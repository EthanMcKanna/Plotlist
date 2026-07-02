const MS_PER_DAY = 86_400_000;
const FUTURE_TIMESTAMP_GRACE_MS = 5 * 60 * 1000;

export const WATCH_STATS_DEFAULT_RUNTIME_MINUTES = 42;
export const WATCH_STATS_MAX_RUNTIME_MINUTES = 720;

const WATCH_STATUSES = ["watchlist", "watching", "completed", "dropped"] as const;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DAYPART_LABELS = ["Morning", "Afternoon", "Evening", "Late night"] as const;

export type WatchStatus = (typeof WATCH_STATUSES)[number];

export type WatchStatsShowDoc = {
  _id: string;
  title?: string | null;
  posterUrl?: string | null;
  genreIds?: number[] | null;
};

export type WatchStatsPayload = {
  totalEpisodes: number;
  totalMinutes: number;
  showsWithProgress: number;
  averageEpisodeMinutes: number;
  firstWatchedAt: number | null;
  latestWatchedAt: number | null;
  episodesLast30Days: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  statusCounts: Record<WatchStatus, number> & { total: number };
  monthlyActivity: Array<{ key: string; label: string; count: number }>;
  weekdayActivity: Array<{ label: string; count: number }>;
  timeOfDayActivity: Array<{ label: string; count: number }>;
  topShows: Array<{
    show: WatchStatsShowDoc;
    episodes: number;
    minutes: number;
    latestWatchedAt: number;
    firstWatchedAt: number;
  }>;
  recentEpisodes: Array<{
    _id: string;
    show: WatchStatsShowDoc | null;
    seasonNumber: number;
    episodeNumber: number;
    watchedAt: number;
    runtimeMinutes: number;
  }>;
  reviewStats: {
    totalReviews: number;
    ratedShows: number;
    averageRating: number | null;
    fiveStarCount: number;
    topRated: Array<{
      review: { _id: string; _creationTime: number; rating: number; createdAt: number };
      show: WatchStatsShowDoc | null;
    }>;
  };
};

export type WatchStatsEpisodeInput = {
  id?: unknown;
  _id?: unknown;
  showId?: unknown;
  seasonNumber?: unknown;
  episodeNumber?: unknown;
  watchedAt?: unknown;
};

export type WatchStatsStateInput = {
  id?: unknown;
  showId?: unknown;
  status?: unknown;
  updatedAt?: unknown;
};

export type WatchStatsReviewInput = {
  id?: unknown;
  _id?: unknown;
  showId?: unknown;
  rating?: unknown;
  createdAt?: unknown;
};

export type WatchStatsShowInput = {
  id?: unknown;
  _id?: unknown;
  title?: unknown;
  posterUrl?: unknown;
  posterPath?: unknown;
  genreIds?: unknown;
  externalSource?: unknown;
  externalId?: unknown;
  createdAt?: unknown;
};

export type WatchStatsRuntimeInput = {
  externalSource?: unknown;
  externalId?: unknown;
  payload?: unknown;
};

export type BuildWatchStatsInput = {
  episodes?: WatchStatsEpisodeInput[];
  watchStates?: WatchStatsStateInput[];
  reviews?: WatchStatsReviewInput[];
  shows?: WatchStatsShowInput[];
  runtimePayloads?: WatchStatsRuntimeInput[];
  now?: unknown;
};

type NormalizedEpisode = {
  id: string;
  showId: string;
  seasonNumber: number;
  episodeNumber: number;
  watchedAt: number;
};

type NormalizedShow = WatchStatsShowDoc & {
  externalSource: string | null;
  externalId: string | null;
};

type NormalizedReview = {
  id: string;
  showId: string | null;
  rating: number;
  createdAt: number;
};

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function integerValue(value: unknown, min: number): number | null {
  const number = finiteNumber(value);
  if (number === null) {
    return null;
  }
  const integer = Math.trunc(number);
  return integer >= min ? integer : null;
}

function validTimestamp(value: unknown, now: number): number | null {
  const timestamp = finiteNumber(value);
  if (timestamp === null || timestamp < 0) {
    return null;
  }
  if (timestamp > now + FUTURE_TIMESTAMP_GRACE_MS) {
    return null;
  }
  return Math.min(timestamp, now);
}

function dayKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function monthKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 7);
}

function startOfUtcDay(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function daypartIndex(timestamp: number): number {
  const hour = new Date(timestamp).getUTCHours();
  if (hour >= 5 && hour < 12) return 0;
  if (hour >= 12 && hour < 17) return 1;
  if (hour >= 17 && hour < 23) return 2;
  return 3;
}

function normalizeGenreIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const genreIds = value
    .map((item) => integerValue(item, 0))
    .filter((item): item is number => item !== null);
  return genreIds.length > 0 ? Array.from(new Set(genreIds)) : null;
}

function normalizeShow(row: WatchStatsShowInput): NormalizedShow | null {
  const id = stringValue(row._id) ?? stringValue(row.id);
  if (!id) {
    return null;
  }
  return {
    _id: id,
    title: nullableString(row.title),
    posterUrl: nullableString(row.posterUrl) ?? nullableString(row.posterPath),
    genreIds: normalizeGenreIds(row.genreIds),
    externalSource: nullableString(row.externalSource),
    externalId: nullableString(row.externalId),
  };
}

function normalizeEpisode(
  row: WatchStatsEpisodeInput,
  now: number,
): NormalizedEpisode | null {
  const showId = stringValue(row.showId);
  const seasonNumber = integerValue(row.seasonNumber, 0);
  const episodeNumber = integerValue(row.episodeNumber, 1);
  const watchedAt = validTimestamp(row.watchedAt, now);
  if (!showId || seasonNumber === null || episodeNumber === null || watchedAt === null) {
    return null;
  }
  const id =
    stringValue(row._id) ??
    stringValue(row.id) ??
    `${showId}:S${seasonNumber}:E${episodeNumber}`;
  return { id, showId, seasonNumber, episodeNumber, watchedAt };
}

function dedupeEpisodes(episodes: NormalizedEpisode[]): NormalizedEpisode[] {
  const byEpisode = new Map<string, NormalizedEpisode>();
  for (const episode of episodes) {
    const key = `${episode.showId}\u0000${episode.seasonNumber}\u0000${episode.episodeNumber}`;
    const existing = byEpisode.get(key);
    if (
      !existing ||
      episode.watchedAt > existing.watchedAt ||
      (episode.watchedAt === existing.watchedAt && episode.id > existing.id)
    ) {
      byEpisode.set(key, episode);
    }
  }
  return Array.from(byEpisode.values()).sort((left, right) => {
    return (
      right.watchedAt - left.watchedAt ||
      left.showId.localeCompare(right.showId) ||
      left.seasonNumber - right.seasonNumber ||
      left.episodeNumber - right.episodeNumber ||
      left.id.localeCompare(right.id)
    );
  });
}

function normalizeWatchStatus(value: unknown): WatchStatus | null {
  return WATCH_STATUSES.includes(value as WatchStatus) ? (value as WatchStatus) : null;
}

function buildStatusCounts(rows: WatchStatsStateInput[]): WatchStatsPayload["statusCounts"] {
  const latestByShow = new Map<string, { status: WatchStatus; updatedAt: number; index: number }>();
  rows.forEach((row, index) => {
    const status = normalizeWatchStatus(row.status);
    if (!status) {
      return;
    }
    const showId = stringValue(row.showId) ?? `__row_${index}`;
    const updatedAt = finiteNumber(row.updatedAt) ?? 0;
    const existing = latestByShow.get(showId);
    if (!existing || updatedAt > existing.updatedAt || (updatedAt === existing.updatedAt && index > existing.index)) {
      latestByShow.set(showId, { status, updatedAt, index });
    }
  });

  const counts = { watchlist: 0, watching: 0, completed: 0, dropped: 0, total: 0 };
  for (const row of latestByShow.values()) {
    counts[row.status] += 1;
    counts.total += 1;
  }
  return counts;
}

function pushRuntimeCandidate(candidates: number[], value: unknown) {
  if (Array.isArray(value)) {
    for (const item of value) {
      pushRuntimeCandidate(candidates, item);
    }
    return;
  }
  const runtime = finiteNumber(value);
  if (
    runtime !== null &&
    runtime > 0 &&
    runtime <= WATCH_STATS_MAX_RUNTIME_MINUTES
  ) {
    candidates.push(Math.round(runtime));
  }
}

export function extractRuntimeMinutes(payload: unknown): number | null {
  const candidates: number[] = [];
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  pushRuntimeCandidate(candidates, record.episodeRunTime);
  pushRuntimeCandidate(candidates, record.episode_run_time);
  pushRuntimeCandidate(candidates, record.runtimeMinutes);
  pushRuntimeCandidate(candidates, record.runtime);
  if (candidates.length === 0) {
    return null;
  }
  const sorted = Array.from(new Set(candidates)).sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[midpoint]
    : Math.round((sorted[midpoint - 1] + sorted[midpoint]) / 2);
}

function runtimeKey(externalSource: string | null | undefined, externalId: string | null | undefined) {
  return externalSource && externalId ? `${externalSource}:${externalId}` : null;
}

function buildRuntimeMap(rows: WatchStatsRuntimeInput[]) {
  const runtimes = new Map<string, number>();
  for (const row of rows) {
    const key = runtimeKey(nullableString(row.externalSource) ?? "tmdb", nullableString(row.externalId));
    const runtime = extractRuntimeMinutes(row.payload);
    if (key && runtime !== null) {
      runtimes.set(key, runtime);
    }
  }
  return runtimes;
}

function normalizeReviews(rows: WatchStatsReviewInput[]): NormalizedReview[] {
  return rows
    .map((row, index): NormalizedReview | null => {
      const rating = finiteNumber(row.rating);
      if (rating === null || rating < 0 || rating > 5) {
        return null;
      }
      const createdAt = finiteNumber(row.createdAt) ?? 0;
      const showId = stringValue(row.showId);
      const id =
        stringValue(row._id) ??
        stringValue(row.id) ??
        `${showId ?? "review"}:${createdAt}:${rating}:${index}`;
      return { id, showId, rating, createdAt };
    })
    .filter((review): review is NormalizedReview => review !== null);
}

function buildMonthlyActivity(episodes: NormalizedEpisode[], now: number) {
  const counts = new Map<string, number>();
  for (const episode of episodes) {
    const key = monthKey(episode.watchedAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const currentMonth = new Date(now);
  const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
  return Array.from({ length: 6 }, (_, index) => {
    const monthDate = new Date(
      Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() - (5 - index), 1),
    );
    const key = monthDate.toISOString().slice(0, 7);
    return { key, label: monthFormatter.format(monthDate), count: counts.get(key) ?? 0 };
  });
}

function buildStreaks(dayKeys: string[], now: number) {
  const sortedDays = Array.from(new Set(dayKeys)).sort();
  let longestStreak = 0;
  let run = 0;
  let previousDay: number | null = null;

  for (const key of sortedDays) {
    const day = Date.parse(`${key}T00:00:00.000Z`);
    run = previousDay !== null && day - previousDay === MS_PER_DAY ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    previousDay = day;
  }

  const daySet = new Set(sortedDays);
  const today = startOfUtcDay(now);
  const yesterday = today - MS_PER_DAY;
  const start =
    daySet.has(new Date(today).toISOString().slice(0, 10))
      ? today
      : daySet.has(new Date(yesterday).toISOString().slice(0, 10))
        ? yesterday
        : null;

  let currentStreak = 0;
  let cursor = start;
  while (cursor !== null && daySet.has(new Date(cursor).toISOString().slice(0, 10))) {
    currentStreak += 1;
    cursor -= MS_PER_DAY;
  }

  return { currentStreak, longestStreak };
}

export function buildWatchStats(input: BuildWatchStatsInput): WatchStatsPayload {
  const now = finiteNumber(input.now) ?? Date.now();
  const showsById = new Map<string, NormalizedShow>();
  for (const show of input.shows ?? []) {
    const normalized = normalizeShow(show);
    if (normalized) {
      showsById.set(normalized._id, normalized);
    }
  }

  const runtimeByExternalKey = buildRuntimeMap(input.runtimePayloads ?? []);
  const episodes = dedupeEpisodes(
    (input.episodes ?? [])
      .map((episode) => normalizeEpisode(episode, now))
      .filter((episode): episode is NormalizedEpisode => episode !== null),
  );

  const runtimeForShow = (showId: string) => {
    const show = showsById.get(showId);
    const key = runtimeKey(show?.externalSource, show?.externalId);
    return (key ? runtimeByExternalKey.get(key) : undefined) ?? WATCH_STATS_DEFAULT_RUNTIME_MINUTES;
  };

  const showProgress = new Map<
    string,
    { episodes: number; minutes: number; firstWatchedAt: number; latestWatchedAt: number }
  >();
  const dayCounts = new Map<string, number>();
  const weekdayActivity = WEEKDAY_LABELS.map((label) => ({ label, count: 0 }));
  const timeOfDayActivity = DAYPART_LABELS.map((label) => ({ label, count: 0 }));
  let totalMinutes = 0;

  for (const episode of episodes) {
    const runtimeMinutes = runtimeForShow(episode.showId);
    totalMinutes += runtimeMinutes;

    const current = showProgress.get(episode.showId) ?? {
      episodes: 0,
      minutes: 0,
      firstWatchedAt: episode.watchedAt,
      latestWatchedAt: episode.watchedAt,
    };
    current.episodes += 1;
    current.minutes += runtimeMinutes;
    current.firstWatchedAt = Math.min(current.firstWatchedAt, episode.watchedAt);
    current.latestWatchedAt = Math.max(current.latestWatchedAt, episode.watchedAt);
    showProgress.set(episode.showId, current);

    const key = dayKey(episode.watchedAt);
    dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
    weekdayActivity[new Date(episode.watchedAt).getUTCDay()].count += 1;
    timeOfDayActivity[daypartIndex(episode.watchedAt)].count += 1;
  }

  const dayKeys = Array.from(dayCounts.keys());
  const { currentStreak, longestStreak } = buildStreaks(dayKeys, now);
  const reviews = normalizeReviews(input.reviews ?? []);
  const averageRating =
    reviews.length > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : null;
  const topRatedReviews = reviews
    .filter((review) => review.rating >= 4)
    .sort((left, right) => right.rating - left.rating || right.createdAt - left.createdAt || left.id.localeCompare(right.id))
    .slice(0, 3);

  return {
    totalEpisodes: episodes.length,
    totalMinutes,
    showsWithProgress: showProgress.size,
    averageEpisodeMinutes: episodes.length > 0 ? Math.round(totalMinutes / episodes.length) : 0,
    firstWatchedAt: episodes.length > 0 ? Math.min(...episodes.map((episode) => episode.watchedAt)) : null,
    latestWatchedAt: episodes.length > 0 ? Math.max(...episodes.map((episode) => episode.watchedAt)) : null,
    episodesLast30Days: episodes.filter((episode) => episode.watchedAt >= now - 30 * MS_PER_DAY).length,
    activeDays: dayCounts.size,
    currentStreak,
    longestStreak,
    statusCounts: buildStatusCounts(input.watchStates ?? []),
    monthlyActivity: buildMonthlyActivity(episodes, now),
    weekdayActivity,
    timeOfDayActivity,
    topShows: Array.from(showProgress.entries())
      .map(([showId, progress]) => {
        const show = showsById.get(showId);
        return show
          ? {
              show,
              episodes: progress.episodes,
              minutes: progress.minutes,
              latestWatchedAt: progress.latestWatchedAt,
              firstWatchedAt: progress.firstWatchedAt,
            }
          : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((left, right) => {
        return (
          right.episodes - left.episodes ||
          right.minutes - left.minutes ||
          right.latestWatchedAt - left.latestWatchedAt ||
          left.show._id.localeCompare(right.show._id)
        );
      })
      .slice(0, 5),
    recentEpisodes: episodes.slice(0, 8).map((episode) => ({
      _id: episode.id,
      show: showsById.get(episode.showId) ?? null,
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      watchedAt: episode.watchedAt,
      runtimeMinutes: runtimeForShow(episode.showId),
    })),
    reviewStats: {
      totalReviews: reviews.length,
      ratedShows: new Set(reviews.map((review) => review.showId).filter(Boolean)).size,
      averageRating,
      fiveStarCount: reviews.filter((review) => review.rating >= 4.75).length,
      topRated: topRatedReviews.map((review) => ({
        review: {
          _id: review.id,
          _creationTime: review.createdAt,
          rating: review.rating,
          createdAt: review.createdAt,
        },
        show: review.showId ? showsById.get(review.showId) ?? null : null,
      })),
    },
  };
}

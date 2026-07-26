// Watch insights engine: a pure, fully-validated aggregation over a user's
// episode history. Replaces the old watchStats module with three structural
// fixes — day/weekday/daypart bucketing happens in the *user's* timezone,
// runtimes resolve per-episode (season cache → season median → show runtime →
// default) instead of one flat guess per show, and every input row is
// normalized so malformed data degrades a single row rather than the payload.

const MS_PER_DAY = 86_400_000;
const FUTURE_TIMESTAMP_GRACE_MS = 5 * 60 * 1000;
const MAX_UTC_OFFSET_MINUTES = 14 * 60;

export const WATCH_INSIGHTS_VERSION = 3;
export const WATCH_INSIGHTS_DEFAULT_RUNTIME_MINUTES = 42;
export const WATCH_INSIGHTS_MAX_RUNTIME_MINUTES = 720;
// A "binge" is a run of consecutive local days watching one show; runs with
// fewer episodes than this never qualify.
export const WATCH_INSIGHTS_BINGE_MIN_EPISODES = 4;

const WATCH_STATUSES = ["watchlist", "watching", "completed", "dropped"] as const;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DAYPART_LABELS = ["Morning", "Afternoon", "Evening", "Late night"] as const;
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

// TMDB TV genre ids.
const TV_GENRE_LABELS: Record<number, string> = {
  16: "Animation",
  35: "Comedy",
  37: "Western",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  9648: "Mystery",
  10751: "Family",
  10759: "Action & Adventure",
  10762: "Kids",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
};

export type WatchStatus = (typeof WATCH_STATUSES)[number];

export type WatchInsightsShowRef = {
  showId: string;
  title: string | null;
  posterUrl: string | null;
};

export type WatchInsightsBinge = WatchInsightsShowRef & {
  /** Episodes watched across the run. */
  episodes: number;
  /** Length of the consecutive-day run, in local days. */
  days: number;
  /** Local day key (YYYY-MM-DD) of the run's last day. */
  endDate: string;
};

export type WatchInsightsYearToDate = {
  /** Calendar year in the user's timezone. */
  year: number;
  episodes: number;
  minutes: number;
  shows: number;
  activeDays: number;
  topShows: Array<WatchInsightsShowRef & { episodes: number; minutes: number }>;
  topGenres: Array<{
    genreId: number;
    label: string;
    episodes: number;
    minutes: number;
    /** Posters of the genre's most-watched shows this year, best first. */
    posterUrls: string[];
  }>;
  biggestBinge: WatchInsightsBinge | null;
};

export type WatchInsights = {
  version: number;
  generatedAt: number;
  utcOffsetMinutes: number;
  totals: {
    episodes: number;
    minutes: number;
    shows: number;
    activeDays: number;
    averageEpisodeMinutes: number;
    /** Share (0..1) of episodes whose runtime came from exact episode data. */
    exactRuntimeShare: number;
  };
  window: {
    episodesLast7Days: number;
    episodesLast30Days: number;
    minutesLast30Days: number;
  };
  firstWatchedAt: number | null;
  latestWatchedAt: number | null;
  streaks: { current: number; longest: number };
  library: Record<WatchStatus, number> & { total: number };
  monthlyActivity: Array<{ key: string; label: string; episodes: number; minutes: number }>;
  weekdayActivity: Array<{ label: string; episodes: number }>;
  daypartActivity: Array<{ label: string; episodes: number }>;
  topShows: Array<
    WatchInsightsShowRef & {
      episodes: number;
      minutes: number;
      lastWatchedAt: number;
    }
  >;
  topGenres: Array<{ genreId: number; label: string; episodes: number; minutes: number }>;
  busiestDay: { date: string; episodes: number } | null;
  yearToDate: WatchInsightsYearToDate;
  recentEpisodes: Array<
    WatchInsightsShowRef & {
      id: string;
      seasonNumber: number;
      episodeNumber: number;
      watchedAt: number;
      runtimeMinutes: number;
    }
  >;
  reviews: {
    total: number;
    ratedShows: number;
    averageRating: number | null;
    fiveStarCount: number;
    topRated: Array<
      WatchInsightsShowRef & { reviewId: string; rating: number; createdAt: number }
    >;
  };
};

// The wire shape of watchStats:getInsights — identical to WatchInsights,
// plus a flag set when the server redacted the all-time sections for a
// free (non-Pro) account.
export type WatchInsightsPayload = WatchInsights & { allTimeLocked?: boolean };

// Server-side redaction for free accounts: deep all-time breakdowns are a
// Plotlist Pro feature. The hero totals, pace window, current streak,
// year-to-date (and its share cards), library mix, ratings, and recent
// episodes stay free. Redacting here keeps gated data off the wire.
export function redactAllTimeInsights(insights: WatchInsights): WatchInsightsPayload {
  return {
    ...insights,
    streaks: { current: insights.streaks.current, longest: 0 },
    monthlyActivity: [],
    weekdayActivity: [],
    daypartActivity: [],
    topShows: [],
    topGenres: [],
    busiestDay: null,
    allTimeLocked: true,
  };
}

export type WatchInsightsEpisodeInput = {
  id?: unknown;
  showId?: unknown;
  seasonNumber?: unknown;
  episodeNumber?: unknown;
  watchedAt?: unknown;
};

export type WatchInsightsStateInput = {
  showId?: unknown;
  status?: unknown;
  updatedAt?: unknown;
};

export type WatchInsightsReviewInput = {
  id?: unknown;
  showId?: unknown;
  rating?: unknown;
  createdAt?: unknown;
};

export type WatchInsightsShowInput = {
  id?: unknown;
  title?: unknown;
  posterUrl?: unknown;
  genreIds?: unknown;
  externalSource?: unknown;
  externalId?: unknown;
};

export type WatchInsightsSeasonRuntimeInput = {
  externalId?: unknown;
  seasonNumber?: unknown;
  episodes?: Array<{ episodeNumber?: unknown; runtime?: unknown }>;
};

export type WatchInsightsShowRuntimeInput = {
  externalId?: unknown;
  runtimeMinutes?: unknown;
};

export type BuildWatchInsightsInput = {
  episodes?: WatchInsightsEpisodeInput[];
  watchStates?: WatchInsightsStateInput[];
  reviews?: WatchInsightsReviewInput[];
  shows?: WatchInsightsShowInput[];
  seasonRuntimes?: WatchInsightsSeasonRuntimeInput[];
  showRuntimes?: WatchInsightsShowRuntimeInput[];
  now?: number;
  utcOffsetMinutes?: number;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readInteger(value: unknown, min: number): number | null {
  const numeric = readNumber(value);
  if (numeric === null) return null;
  const integer = Math.trunc(numeric);
  return integer >= min ? integer : null;
}

function readRuntime(value: unknown): number | null {
  const runtime = readNumber(value);
  if (runtime === null || runtime <= 0 || runtime > WATCH_INSIGHTS_MAX_RUNTIME_MINUTES) {
    return null;
  }
  return Math.round(runtime);
}

function clampUtcOffset(value: unknown): number {
  const offset = readNumber(value) ?? 0;
  return Math.max(-MAX_UTC_OFFSET_MINUTES, Math.min(MAX_UTC_OFFSET_MINUTES, Math.round(offset)));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[midpoint]
    : Math.round((sorted[midpoint - 1] + sorted[midpoint]) / 2);
}

type NormalizedEpisode = {
  id: string;
  showId: string;
  seasonNumber: number;
  episodeNumber: number;
  watchedAt: number;
};

type NormalizedShow = {
  showId: string;
  title: string | null;
  posterUrl: string | null;
  genreIds: number[];
  externalSource: string | null;
  externalId: string | null;
};

// Local-time view of a timestamp: shift by the user's offset, then read UTC
// fields. All day/month/weekday/daypart bucketing goes through this.
function localParts(timestamp: number, offsetMinutes: number) {
  const shifted = new Date(timestamp + offsetMinutes * 60_000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    dayKey: `${year}-${pad(month + 1)}-${pad(day)}`,
    monthKey: `${year}-${pad(month + 1)}`,
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    monthIndex: month,
    year,
  };
}

function daypartIndex(hour: number): number {
  if (hour >= 5 && hour < 12) return 0;
  if (hour >= 12 && hour < 17) return 1;
  if (hour >= 17 && hour < 23) return 2;
  return 3;
}

function normalizeEpisodes(
  rows: WatchInsightsEpisodeInput[],
  now: number,
): NormalizedEpisode[] {
  const byEpisode = new Map<string, NormalizedEpisode>();
  rows.forEach((row, index) => {
    const showId = readString(row.showId);
    const seasonNumber = readInteger(row.seasonNumber, 0);
    const episodeNumber = readInteger(row.episodeNumber, 1);
    const rawWatchedAt = readNumber(row.watchedAt);
    if (
      !showId ||
      seasonNumber === null ||
      episodeNumber === null ||
      rawWatchedAt === null ||
      rawWatchedAt < 0 ||
      rawWatchedAt > now + FUTURE_TIMESTAMP_GRACE_MS
    ) {
      return;
    }
    const watchedAt = Math.min(rawWatchedAt, now);
    const key = `${showId}\x00${seasonNumber}\x00${episodeNumber}`;
    const id = readString(row.id) ?? `${key}:${index}`;
    const existing = byEpisode.get(key);
    if (!existing || watchedAt > existing.watchedAt) {
      byEpisode.set(key, { id, showId, seasonNumber, episodeNumber, watchedAt });
    }
  });
  return Array.from(byEpisode.values()).sort(
    (left, right) =>
      right.watchedAt - left.watchedAt ||
      left.showId.localeCompare(right.showId) ||
      left.seasonNumber - right.seasonNumber ||
      left.episodeNumber - right.episodeNumber,
  );
}

function normalizeShows(rows: WatchInsightsShowInput[]): Map<string, NormalizedShow> {
  const byId = new Map<string, NormalizedShow>();
  for (const row of rows) {
    const showId = readString(row.id);
    if (!showId || byId.has(showId)) continue;
    const genreIds = Array.isArray(row.genreIds)
      ? Array.from(
          new Set(
            row.genreIds
              .map((value) => readInteger(value, 1))
              .filter((value): value is number => value !== null),
          ),
        )
      : [];
    byId.set(showId, {
      showId,
      title: readString(row.title),
      posterUrl: readString(row.posterUrl),
      genreIds,
      externalSource: readString(row.externalSource),
      externalId: readString(row.externalId),
    });
  }
  return byId;
}

type RuntimeResolver = {
  resolve: (episode: NormalizedEpisode) => { minutes: number; exact: boolean };
};

function buildRuntimeResolver(
  showsById: Map<string, NormalizedShow>,
  seasonRuntimes: WatchInsightsSeasonRuntimeInput[],
  showRuntimes: WatchInsightsShowRuntimeInput[],
): RuntimeResolver {
  // externalId:season:episode → exact runtime
  const exactByKey = new Map<string, number>();
  // externalId:season → median of that season's known runtimes
  const seasonMedianByKey = new Map<string, number>();
  // externalId → runtimes seen anywhere for the show
  const runtimesByExternalId = new Map<string, number[]>();

  for (const entry of seasonRuntimes) {
    const externalId = readString(entry.externalId);
    const seasonNumber = readInteger(entry.seasonNumber, 0);
    if (!externalId || seasonNumber === null || !Array.isArray(entry.episodes)) continue;
    const seasonValues: number[] = [];
    for (const episode of entry.episodes) {
      const episodeNumber = readInteger(episode.episodeNumber, 1);
      const runtime = readRuntime(episode.runtime);
      if (episodeNumber === null || runtime === null) continue;
      exactByKey.set(`${externalId}:${seasonNumber}:${episodeNumber}`, runtime);
      seasonValues.push(runtime);
    }
    const seasonMedian = median(seasonValues);
    if (seasonMedian !== null) {
      seasonMedianByKey.set(`${externalId}:${seasonNumber}`, seasonMedian);
      const all = runtimesByExternalId.get(externalId) ?? [];
      all.push(...seasonValues);
      runtimesByExternalId.set(externalId, all);
    }
  }

  const showLevelByExternalId = new Map<string, number>();
  for (const entry of showRuntimes) {
    const externalId = readString(entry.externalId);
    const runtime = readRuntime(entry.runtimeMinutes);
    if (externalId && runtime !== null && !showLevelByExternalId.has(externalId)) {
      showLevelByExternalId.set(externalId, runtime);
    }
  }

  return {
    resolve: (episode) => {
      const show = showsById.get(episode.showId);
      const externalId = show?.externalId ?? null;
      if (externalId) {
        const exact = exactByKey.get(
          `${externalId}:${episode.seasonNumber}:${episode.episodeNumber}`,
        );
        if (exact !== undefined) {
          return { minutes: exact, exact: true };
        }
        const seasonMedian = seasonMedianByKey.get(`${externalId}:${episode.seasonNumber}`);
        if (seasonMedian !== undefined) {
          return { minutes: seasonMedian, exact: false };
        }
        const showMedian = median(runtimesByExternalId.get(externalId) ?? []);
        if (showMedian !== null) {
          return { minutes: showMedian, exact: false };
        }
        const showLevel = showLevelByExternalId.get(externalId);
        if (showLevel !== undefined) {
          return { minutes: showLevel, exact: false };
        }
      }
      return { minutes: WATCH_INSIGHTS_DEFAULT_RUNTIME_MINUTES, exact: false };
    },
  };
}

function buildLibraryCounts(rows: WatchInsightsStateInput[]): WatchInsights["library"] {
  const latestByShow = new Map<string, { status: WatchStatus; updatedAt: number }>();
  rows.forEach((row, index) => {
    const status = WATCH_STATUSES.includes(row.status as WatchStatus)
      ? (row.status as WatchStatus)
      : null;
    if (!status) return;
    const showId = readString(row.showId) ?? `__row_${index}`;
    const updatedAt = readNumber(row.updatedAt) ?? 0;
    const existing = latestByShow.get(showId);
    if (!existing || updatedAt >= existing.updatedAt) {
      latestByShow.set(showId, { status, updatedAt });
    }
  });
  const counts = { watchlist: 0, watching: 0, completed: 0, dropped: 0, total: 0 };
  for (const entry of latestByShow.values()) {
    counts[entry.status] += 1;
    counts.total += 1;
  }
  return counts;
}

function buildStreaks(dayKeys: Set<string>, now: number, offsetMinutes: number) {
  const sortedDays = Array.from(dayKeys).sort();
  let longest = 0;
  let run = 0;
  let previousDay: number | null = null;
  for (const key of sortedDays) {
    const day = Date.parse(`${key}T00:00:00.000Z`);
    run = previousDay !== null && day - previousDay === MS_PER_DAY ? run + 1 : 1;
    longest = Math.max(longest, run);
    previousDay = day;
  }

  const todayKey = localParts(now, offsetMinutes).dayKey;
  const yesterdayKey = localParts(now - MS_PER_DAY, offsetMinutes).dayKey;
  const anchor = dayKeys.has(todayKey)
    ? Date.parse(`${todayKey}T00:00:00.000Z`)
    : dayKeys.has(yesterdayKey)
      ? Date.parse(`${yesterdayKey}T00:00:00.000Z`)
      : null;

  let current = 0;
  let cursor = anchor;
  while (cursor !== null) {
    const key = new Date(cursor).toISOString().slice(0, 10);
    if (!dayKeys.has(key)) break;
    current += 1;
    cursor -= MS_PER_DAY;
  }
  return { current, longest };
}

// Year-to-date rollup for the shareable "Year so far" cards: totals, top
// shows/genres, and the single biggest binge — a maximal run of consecutive
// local days watching one show, ranked by episodes, then density, then
// recency.
function buildYearToDate(
  episodes: NormalizedEpisode[],
  showsById: Map<string, NormalizedShow>,
  runtimeResolver: RuntimeResolver,
  now: number,
  utcOffsetMinutes: number,
): WatchInsightsYearToDate {
  const year = localParts(now, utcOffsetMinutes).year;
  const activeDays = new Set<string>();
  const showTotals = new Map<string, { episodes: number; minutes: number }>();
  const showDayCounts = new Map<string, Map<string, number>>();
  const genreTotals = new Map<number, { episodes: number; minutes: number }>();
  const genreShowMinutes = new Map<number, Map<string, number>>();
  let totalEpisodes = 0;
  let totalMinutes = 0;

  for (const episode of episodes) {
    const parts = localParts(episode.watchedAt, utcOffsetMinutes);
    if (parts.year !== year) continue;
    const { minutes } = runtimeResolver.resolve(episode);
    totalEpisodes += 1;
    totalMinutes += minutes;
    activeDays.add(parts.dayKey);

    const showEntry = showTotals.get(episode.showId) ?? { episodes: 0, minutes: 0 };
    showEntry.episodes += 1;
    showEntry.minutes += minutes;
    showTotals.set(episode.showId, showEntry);

    const dayCounts = showDayCounts.get(episode.showId) ?? new Map<string, number>();
    dayCounts.set(parts.dayKey, (dayCounts.get(parts.dayKey) ?? 0) + 1);
    showDayCounts.set(episode.showId, dayCounts);

    for (const genreId of showsById.get(episode.showId)?.genreIds ?? []) {
      if (!TV_GENRE_LABELS[genreId]) continue;
      const genreEntry = genreTotals.get(genreId) ?? { episodes: 0, minutes: 0 };
      genreEntry.episodes += 1;
      genreEntry.minutes += minutes;
      genreTotals.set(genreId, genreEntry);
      const perShow = genreShowMinutes.get(genreId) ?? new Map<string, number>();
      perShow.set(episode.showId, (perShow.get(episode.showId) ?? 0) + minutes);
      genreShowMinutes.set(genreId, perShow);
    }
  }

  let biggestBinge: WatchInsightsBinge | null = null;
  for (const [showId, dayCounts] of showDayCounts) {
    const sortedDays = Array.from(dayCounts.keys()).sort();
    let runEpisodes = 0;
    let runDays = 0;
    let previousDay: number | null = null;
    for (let index = 0; index < sortedDays.length; index += 1) {
      const key = sortedDays[index];
      const day = Date.parse(`${key}T00:00:00.000Z`);
      if (previousDay === null || day - previousDay !== MS_PER_DAY) {
        runEpisodes = 0;
        runDays = 0;
      }
      runEpisodes += dayCounts.get(key) ?? 0;
      runDays += 1;
      previousDay = day;
      const candidate = { episodes: runEpisodes, days: runDays, endDate: key };
      if (
        candidate.episodes >= WATCH_INSIGHTS_BINGE_MIN_EPISODES &&
        (!biggestBinge ||
          candidate.episodes > biggestBinge.episodes ||
          (candidate.episodes === biggestBinge.episodes &&
            (candidate.days < biggestBinge.days ||
              (candidate.days === biggestBinge.days &&
                candidate.endDate > biggestBinge.endDate))))
      ) {
        biggestBinge = { ...showRef(showsById, showId), ...candidate };
      }
    }
  }

  return {
    year,
    episodes: totalEpisodes,
    minutes: totalMinutes,
    shows: showTotals.size,
    activeDays: activeDays.size,
    topShows: Array.from(showTotals.entries())
      .map(([showId, totals]) => ({ ...showRef(showsById, showId), ...totals }))
      .sort(
        (left, right) =>
          right.episodes - left.episodes ||
          right.minutes - left.minutes ||
          left.showId.localeCompare(right.showId),
      )
      .slice(0, 6),
    topGenres: Array.from(genreTotals.entries())
      .map(([genreId, totals]) => ({
        genreId,
        label: TV_GENRE_LABELS[genreId],
        ...totals,
        posterUrls: Array.from(genreShowMinutes.get(genreId)?.entries() ?? [])
          .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
          .map(([showId]) => showsById.get(showId)?.posterUrl ?? null)
          .filter((posterUrl): posterUrl is string => posterUrl !== null)
          .slice(0, 3),
      }))
      .sort((left, right) => right.minutes - left.minutes || left.genreId - right.genreId)
      .slice(0, 3),
    biggestBinge,
  };
}

function showRef(
  showsById: Map<string, NormalizedShow>,
  showId: string,
): WatchInsightsShowRef {
  const show = showsById.get(showId);
  return {
    showId,
    title: show?.title ?? null,
    posterUrl: show?.posterUrl ?? null,
  };
}

export function buildWatchInsights(input: BuildWatchInsightsInput): WatchInsights {
  const now = readNumber(input.now) ?? Date.now();
  const utcOffsetMinutes = clampUtcOffset(input.utcOffsetMinutes);
  const showsById = normalizeShows(input.shows ?? []);
  const episodes = normalizeEpisodes(input.episodes ?? [], now);
  const runtimeResolver = buildRuntimeResolver(
    showsById,
    input.seasonRuntimes ?? [],
    input.showRuntimes ?? [],
  );

  const showProgress = new Map<
    string,
    { episodes: number; minutes: number; lastWatchedAt: number }
  >();
  const genreProgress = new Map<number, { episodes: number; minutes: number }>();
  const episodesByDay = new Map<string, number>();
  const monthly = new Map<string, { episodes: number; minutes: number }>();
  const weekdayActivity = WEEKDAY_LABELS.map((label) => ({ label, episodes: 0 }));
  const daypartActivity = DAYPART_LABELS.map((label) => ({ label, episodes: 0 }));

  let totalMinutes = 0;
  let exactRuntimeCount = 0;
  let episodesLast7Days = 0;
  let episodesLast30Days = 0;
  let minutesLast30Days = 0;

  for (const episode of episodes) {
    const { minutes, exact } = runtimeResolver.resolve(episode);
    totalMinutes += minutes;
    if (exact) exactRuntimeCount += 1;

    const parts = localParts(episode.watchedAt, utcOffsetMinutes);
    episodesByDay.set(parts.dayKey, (episodesByDay.get(parts.dayKey) ?? 0) + 1);
    const monthEntry = monthly.get(parts.monthKey) ?? { episodes: 0, minutes: 0 };
    monthEntry.episodes += 1;
    monthEntry.minutes += minutes;
    monthly.set(parts.monthKey, monthEntry);
    weekdayActivity[parts.weekday].episodes += 1;
    daypartActivity[daypartIndex(parts.hour)].episodes += 1;

    if (episode.watchedAt >= now - 7 * MS_PER_DAY) episodesLast7Days += 1;
    if (episode.watchedAt >= now - 30 * MS_PER_DAY) {
      episodesLast30Days += 1;
      minutesLast30Days += minutes;
    }

    const progress = showProgress.get(episode.showId) ?? {
      episodes: 0,
      minutes: 0,
      lastWatchedAt: episode.watchedAt,
    };
    progress.episodes += 1;
    progress.minutes += minutes;
    progress.lastWatchedAt = Math.max(progress.lastWatchedAt, episode.watchedAt);
    showProgress.set(episode.showId, progress);

    for (const genreId of showsById.get(episode.showId)?.genreIds ?? []) {
      if (!TV_GENRE_LABELS[genreId]) continue;
      const genreEntry = genreProgress.get(genreId) ?? { episodes: 0, minutes: 0 };
      genreEntry.episodes += 1;
      genreEntry.minutes += minutes;
      genreProgress.set(genreId, genreEntry);
    }
  }

  // Last 12 calendar months, oldest first, zero-filled.
  const nowParts = localParts(now, utcOffsetMinutes);
  const monthlyActivity = Array.from({ length: 12 }, (_, index) => {
    const monthOffset = 11 - index;
    const date = new Date(Date.UTC(nowParts.year, nowParts.monthIndex - monthOffset, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const entry = monthly.get(key);
    return {
      key,
      label: MONTH_LABELS[date.getUTCMonth()],
      episodes: entry?.episodes ?? 0,
      minutes: entry?.minutes ?? 0,
    };
  });

  const streaks = buildStreaks(new Set(episodesByDay.keys()), now, utcOffsetMinutes);

  let busiestDay: WatchInsights["busiestDay"] = null;
  for (const [date, count] of episodesByDay) {
    if (!busiestDay || count > busiestDay.episodes || (count === busiestDay.episodes && date > busiestDay.date)) {
      busiestDay = { date, episodes: count };
    }
  }

  const reviewRows = (input.reviews ?? []).flatMap((row, index) => {
    const rating = readNumber(row.rating);
    if (rating === null || rating < 0 || rating > 5) return [];
    return [
      {
        id: readString(row.id) ?? `review:${index}`,
        showId: readString(row.showId),
        rating,
        createdAt: readNumber(row.createdAt) ?? 0,
      },
    ];
  });
  const averageRating =
    reviewRows.length > 0
      ? Number(
          (reviewRows.reduce((sum, row) => sum + row.rating, 0) / reviewRows.length).toFixed(2),
        )
      : null;
  const topRated = reviewRows
    .filter((row) => row.rating >= 4 && row.showId)
    .sort((left, right) => right.rating - left.rating || right.createdAt - left.createdAt)
    .slice(0, 3)
    .map((row) => ({
      ...showRef(showsById, row.showId as string),
      reviewId: row.id,
      rating: row.rating,
      createdAt: row.createdAt,
    }));

  return {
    version: WATCH_INSIGHTS_VERSION,
    generatedAt: now,
    utcOffsetMinutes,
    totals: {
      episodes: episodes.length,
      minutes: totalMinutes,
      shows: showProgress.size,
      activeDays: episodesByDay.size,
      averageEpisodeMinutes:
        episodes.length > 0 ? Math.round(totalMinutes / episodes.length) : 0,
      exactRuntimeShare:
        episodes.length > 0 ? Number((exactRuntimeCount / episodes.length).toFixed(3)) : 0,
    },
    window: { episodesLast7Days, episodesLast30Days, minutesLast30Days },
    firstWatchedAt:
      episodes.length > 0 ? episodes[episodes.length - 1].watchedAt : null,
    latestWatchedAt: episodes.length > 0 ? episodes[0].watchedAt : null,
    streaks,
    library: buildLibraryCounts(input.watchStates ?? []),
    monthlyActivity,
    weekdayActivity,
    daypartActivity,
    topShows: Array.from(showProgress.entries())
      .map(([showId, progress]) => ({ ...showRef(showsById, showId), ...progress }))
      .sort(
        (left, right) =>
          right.episodes - left.episodes ||
          right.minutes - left.minutes ||
          right.lastWatchedAt - left.lastWatchedAt ||
          left.showId.localeCompare(right.showId),
      )
      .slice(0, 6),
    topGenres: Array.from(genreProgress.entries())
      .map(([genreId, progress]) => ({
        genreId,
        label: TV_GENRE_LABELS[genreId],
        ...progress,
      }))
      .sort((left, right) => right.minutes - left.minutes || left.genreId - right.genreId)
      .slice(0, 5),
    busiestDay,
    yearToDate: buildYearToDate(episodes, showsById, runtimeResolver, now, utcOffsetMinutes),
    recentEpisodes: episodes.slice(0, 10).map((episode) => ({
      ...showRef(showsById, episode.showId),
      id: episode.id,
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      watchedAt: episode.watchedAt,
      runtimeMinutes: runtimeResolver.resolve(episode).minutes,
    })),
    reviews: {
      total: reviewRows.length,
      ratedShows: new Set(reviewRows.map((row) => row.showId).filter(Boolean)).size,
      averageRating,
      fiveStarCount: reviewRows.filter((row) => row.rating >= 4.75).length,
      topRated,
    },
  };
}

// Extract a show-level runtime (median of TMDB's episode_run_time list) from
// a cached details payload. Used as a fallback when no per-episode runtime is
// cached for a show.
export function extractShowRuntimeMinutes(payload: unknown): number | null {
  const record =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const candidates: number[] = [];
  const push = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(push);
      return;
    }
    const runtime = readRuntime(value);
    if (runtime !== null) candidates.push(runtime);
  };
  push(record.episodeRunTime);
  push(record.episode_run_time);
  return median(Array.from(new Set(candidates)));
}

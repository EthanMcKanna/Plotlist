import type { ContinueQueuedEpisode } from "./continueEpisodeQueue";
import {
  getEpisodeProgressState,
  isEpisodeVerified,
  normalizeEpisodeSeasonSummaries,
  type EpisodeSeasonSummary,
} from "./episodeProgressState";
import {
  getDateOnlyStartTimestamp,
  getDateOnlyStartTimestampForOffset,
  isDateOnlyString,
} from "./releaseCalendar";
import {
  getReleaseAwareUpNextEpisode,
  type UpNextReleaseEvent,
} from "./upNextReleaseMerge";
import {
  computeShowProgressFacts,
  readLastAiredEpisode,
  reconcileWatchStatus,
  type LegacyWatchStatus,
  type ShowProgressFacts,
  type WatchStatus,
} from "./watchStatusTransitions";

/**
 * Pure per-show builder for the continue surfaces. Given one watch-state row
 * plus everything already loaded for its show (cached TMDB details, the
 * user's progress rows, nearby release events) it works out where the user
 * stands, which episode is next, whether that episode is out yet, how the
 * card should rank, and whether the stored status has drifted from reality.
 * The server feeds it rows; tests feed it fixtures.
 */

export type ContinueSeasonSummary = EpisodeSeasonSummary;

/** Read season summaries off a cached TMDB details payload (raw or normalized). */
export function readSeasonSummaries(payload: unknown): ContinueSeasonSummary[] {
  const raw = (payload as { seasons?: unknown })?.seasons;
  if (!Array.isArray(raw)) return [];
  return normalizeEpisodeSeasonSummaries(
    raw
      .map((season): ContinueSeasonSummary | null => {
        const seasonNumber =
          (season?.seasonNumber as number | undefined) ??
          (season?.season_number as number | undefined);
        const episodeCount =
          (season?.episodeCount as number | undefined) ??
          (season?.episode_count as number | undefined) ??
          0;
        const airDate =
          (season?.airDate as string | null | undefined) ??
          (season?.air_date as string | null | undefined) ??
          null;
        if (typeof seasonNumber !== "number" || seasonNumber < 1) {
          return null;
        }
        return { seasonNumber, episodeCount: Math.max(0, episodeCount), airDate };
      })
      .filter((season): season is ContinueSeasonSummary => season !== null),
  );
}

export function isShowEnded(payload: unknown): boolean {
  const status = (payload as { status?: unknown })?.status;
  return typeof status === "string" && /^(ended|canceled|cancelled)$/i.test(status.trim());
}

export type ContinueDayContext = {
  /** The user's local calendar day, "YYYY-MM-DD". */
  today: string;
  /** Client offset (`-getTimezoneOffset()`); null when the client sent none. */
  utcOffsetMinutes: number | null;
};

export type ContinueCandidateInput = {
  state: {
    id: string;
    showId: string;
    status: LegacyWatchStatus;
    updatedAt: number;
  };
  /** Cached TMDB details payload (slim or full); undefined for non-TMDB shows. */
  detailPayload: unknown;
  progressEpisodes: ReadonlyArray<{
    seasonNumber: number;
    episodeNumber: number;
    watchedAt: number;
  }>;
  releaseEvents: ReadonlyArray<UpNextReleaseEvent>;
  day: ContinueDayContext;
  /** Date-only lower bound for release events that still count as "new". */
  releasedSince: string;
  now: number;
};

export type ContinueCandidateCore = {
  showId: string;
  /** The reconciled status (what the row *should* say). */
  status: WatchStatus;
  /** True when `status` differs from the stored row and needs writing back. */
  statusChanged: boolean;
  totalWatched: number;
  totalEpisodes: number;
  progressPct: number;
  nextSeasonNumber: number;
  nextEpisodeNumber: number;
  nextEpisodeName: string | null;
  nextEpisodeStillUrl: string | null;
  nextEpisodeOverview: string | null;
  nextEpisodeRuntime: number | null;
  nextAirDate: number | null;
  nextReleaseDate: number | null;
  nextEpisodeReleasedToday: boolean;
  nextEpisodeAirDateTs: number | null;
  nextEpisodes: ContinueQueuedEpisode[];
  isUpcoming: boolean;
  isCaughtUp: boolean;
  /** True when metadata couldn't confirm the pointed-at episode exists. */
  nextEpisodeUnverified: boolean;
  lastWatchedAt: number | null;
  seasons: ContinueSeasonSummary[];
  sortTimestamp: number;
  stateUpdatedAt: number;
  gapCount: number;
  firstGapSeasonNumber: number | null;
  firstGapEpisodeNumber: number | null;
};

export function buildContinueCandidate(input: ContinueCandidateInput): ContinueCandidateCore {
  const { state, detailPayload, progressEpisodes, releaseEvents, day, releasedSince, now } = input;
  const seasons = readSeasonSummaries(detailPayload);
  const progressState = getEpisodeProgressState({
    watchedEpisodes: progressEpisodes,
    seasons,
  });
  let latestWatchedAt: number | null = null;
  for (const episode of progressEpisodes) {
    if (Number.isFinite(episode.watchedAt)) {
      latestWatchedAt = Math.max(latestWatchedAt ?? 0, episode.watchedAt);
    }
  }

  const nextEpisode =
    progressState.nextEpisode ?? progressState.latestWatched ?? {
      seasonNumber: seasons[0]?.seasonNumber ?? 1,
      episodeNumber: 1,
    };

  // A season premiere the details payload already dates: whether the show is
  // brand new to the user or they're caught up waiting on the next season,
  // an episode-1 pointer into a season that starts after today is upcoming
  // with a known date — no season-cache round trip needed to say so.
  const seasonRecord = seasons.find(
    (season) => season.seasonNumber === nextEpisode.seasonNumber,
  );
  const seasonAirDate =
    seasonRecord?.airDate && isDateOnlyString(seasonRecord.airDate)
      ? seasonRecord.airDate
      : null;
  const seasonPremiereUpcoming =
    nextEpisode.episodeNumber === 1 && seasonAirDate !== null && seasonAirDate > day.today;
  const seasonPremiereTs = seasonPremiereUpcoming
    ? getDateOnlyStartTimestamp(seasonAirDate as string)
    : Number.NaN;

  const progressPct =
    progressState.totalEpisodes > 0
      ? Math.min(1, Math.max(0, progressState.totalWatched / progressState.totalEpisodes))
      : 0;
  const fallbackSortTimestamp = Math.max(latestWatchedAt ?? 0, state.updatedAt);
  const releaseAware = getReleaseAwareUpNextEpisode({
    fallback: {
      nextSeasonNumber: nextEpisode.seasonNumber,
      nextEpisodeNumber: nextEpisode.episodeNumber,
      nextEpisodeName: null,
      nextEpisodeStillUrl: null,
      nextAirDate:
        seasonPremiereUpcoming && Number.isFinite(seasonPremiereTs) ? seasonPremiereTs : null,
      nextReleaseDate: null,
      nextEpisodeReleasedToday: false,
      isUpcoming: seasonPremiereUpcoming,
      isCaughtUp: progressState.isCaughtUp,
      totalEpisodes: progressState.totalEpisodes,
      sortTimestamp: fallbackSortTimestamp,
    },
    latestWatched: progressState.latestWatched
      ? {
          season: progressState.latestWatched.seasonNumber,
          episode: progressState.latestWatched.episodeNumber,
        }
      : null,
    watchedEpisodeCount: progressState.totalWatched,
    releaseEvents: releaseEvents as UpNextReleaseEvent[],
    today: day.today,
    releasedSince,
    rankReleaseTimestamp: (event) =>
      getDateOnlyStartTimestampForOffset(event.airDate, day.utcOffsetMinutes),
  });
  const releaseProgressPct =
    releaseAware.totalEpisodes > 0
      ? Math.min(1, Math.max(0, progressState.totalWatched / releaseAware.totalEpisodes))
      : progressPct;

  // Reconcile the stored status against reality. Release events prove a
  // fresh episode exists even when cached season counts lag behind it.
  const facts = computeShowProgressFacts({
    watchedEpisodes: progressEpisodes,
    seasons,
    isEnded: isShowEnded(detailPayload),
    lastAiredEpisode: readLastAiredEpisode(detailPayload),
  });
  const releasedNewEvidence =
    releaseAware.nextEpisodeReleasedToday === true ||
    (typeof releaseAware.nextReleaseDate === "number" &&
      !releaseAware.isUpcoming &&
      releaseAware.nextReleaseDate <= now);
  const effectiveFacts: ShowProgressFacts = releasedNewEvidence
    ? {
        ...facts,
        hasReleasedAfterFrontier: true,
        releasedCount: Math.max(1, facts.releasedCount),
      }
    : facts;
  const status =
    reconcileWatchStatus({ currentStatus: state.status, facts: effectiveFacts }) ??
    "watching";

  const isCaughtUp = releaseAware.isCaughtUp ?? progressState.isCaughtUp;
  // When season metadata exists but can't confirm the pointed-at episode
  // exists (announced-but-empty next season, stale counts) and no release
  // event backs it either, present the card as upcoming so the surface
  // never offers to play or mark an episode that isn't real. Enrichment
  // gets the final say once the season cache is consulted.
  const nextEpisodeVerified = isEpisodeVerified(
    {
      seasonNumber: releaseAware.nextSeasonNumber,
      episodeNumber: releaseAware.nextEpisodeNumber,
    },
    progressState.seasons,
  );
  const nextEpisodeUnverified =
    !isCaughtUp &&
    !releaseAware.nextEpisodeReleasedToday &&
    !releaseAware.nextReleaseDate &&
    progressState.seasons.length > 0 &&
    !nextEpisodeVerified;
  const presentAsUpcoming = Boolean(releaseAware.isUpcoming) || nextEpisodeUnverified;

  const firstGap = effectiveFacts.gapEpisodes[0] ?? null;
  return {
    showId: state.showId,
    status,
    statusChanged: status !== state.status,
    totalWatched: progressState.totalWatched,
    totalEpisodes: releaseAware.totalEpisodes,
    progressPct: releaseProgressPct,
    nextSeasonNumber: releaseAware.nextSeasonNumber,
    nextEpisodeNumber: releaseAware.nextEpisodeNumber,
    nextEpisodeName: releaseAware.nextEpisodeName ?? null,
    nextEpisodeStillUrl: releaseAware.nextEpisodeStillUrl ?? null,
    nextEpisodeOverview: null,
    nextEpisodeRuntime: null,
    nextAirDate: releaseAware.nextAirDate ?? null,
    nextReleaseDate: releaseAware.nextReleaseDate ?? null,
    nextEpisodeReleasedToday: releaseAware.nextEpisodeReleasedToday ?? false,
    nextEpisodeAirDateTs: null,
    nextEpisodes: [],
    isUpcoming: presentAsUpcoming,
    isCaughtUp,
    nextEpisodeUnverified,
    lastWatchedAt: latestWatchedAt,
    seasons: progressState.seasons,
    sortTimestamp: releaseAware.sortTimestamp,
    stateUpdatedAt: state.updatedAt,
    gapCount: effectiveFacts.gapEpisodes.length,
    firstGapSeasonNumber: firstGap?.seasonNumber ?? null,
    firstGapEpisodeNumber: firstGap?.episodeNumber ?? null,
  };
}

import { api } from "./plotlist/api";
import type { LocalStore } from "./plotlist/react";
import { applyRatingChangeToStats } from "./ratingStatsOptimistic";

type EpisodeRatingRef = {
  showId: string;
  seasonNumber: number;
  episodeNumber: number;
};

export type EpisodeRatingEntry = EpisodeRatingRef & {
  _id?: string;
  id?: string;
  authorId?: string;
  rating: number;
  reviewText?: string | null;
  episodeTitle?: string | null;
  createdAt?: number;
  updatedAt?: number;
};

type RateEpisodeArgs = EpisodeRatingRef & {
  rating: number;
  episodeTitle?: string;
  reviewText?: string | null;
};

// Who is rating, so the community list under the episode can show the
// viewer's own row (name, avatar) the moment they tap a star.
export type EpisodeRatingViewer = {
  viewer?: Record<string, any> | null;
  viewerAvatarUrl?: string | null;
};

function sameEpisode(left: EpisodeRatingRef, right: EpisodeRatingRef) {
  return (
    left.showId === right.showId &&
    left.seasonNumber === right.seasonNumber &&
    left.episodeNumber === right.episodeNumber
  );
}

function episodeQueryArgs(ref: EpisodeRatingRef) {
  return {
    showId: ref.showId,
    seasonNumber: ref.seasonNumber,
    episodeNumber: ref.episodeNumber,
  };
}

// Pure so the star/note UI logic is testable without the query cache.
export function upsertEpisodeRating(
  current: EpisodeRatingEntry[] | undefined,
  args: RateEpisodeArgs,
): EpisodeRatingEntry[] {
  const rows = Array.isArray(current) ? current : [];
  const existing = rows.find((entry) => sameEpisode(entry, args));
  const now = Date.now();
  if (existing) {
    return rows.map((entry) =>
      entry === existing
        ? {
            ...entry,
            rating: args.rating,
            episodeTitle: args.episodeTitle ?? entry.episodeTitle,
            // Omitted -> keep note (matches the server contract); empty -> clear.
            ...(args.reviewText !== undefined
              ? { reviewText: args.reviewText?.trim() || null }
              : {}),
            updatedAt: now,
          }
        : entry,
    );
  }
  const key = `${args.showId}:${args.seasonNumber}:${args.episodeNumber}`;
  return [
    ...rows,
    {
      _id: `optimistic:episode-rating:${key}`,
      id: `optimistic:episode-rating:${key}`,
      showId: args.showId,
      seasonNumber: args.seasonNumber,
      episodeNumber: args.episodeNumber,
      rating: args.rating,
      reviewText: args.reviewText === undefined ? null : args.reviewText?.trim() || null,
      episodeTitle: args.episodeTitle ?? null,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function removeEpisodeRatingEntry(
  current: EpisodeRatingEntry[] | undefined,
  args: EpisodeRatingRef,
): EpisodeRatingEntry[] {
  const rows = Array.isArray(current) ? current : [];
  return rows.filter((entry) => !sameEpisode(entry, args));
}

type DetailedReviewRow = {
  review?: Record<string, any> | null;
  author?: Record<string, any> | null;
  authorAvatarUrl?: string | null;
  show?: Record<string, any> | null;
  likeCount?: number;
  likedByViewer?: boolean;
};

function detailedRows(current: unknown): DetailedReviewRow[] | null {
  if (Array.isArray(current)) return current;
  if (current && typeof current === "object") {
    const paged = current as { results?: unknown; page?: unknown };
    if (Array.isArray(paged.results)) return paged.results;
    if (Array.isArray(paged.page)) return paged.page;
  }
  return null;
}

function replaceDetailedRows(current: unknown, rows: DetailedReviewRow[]) {
  if (Array.isArray(current)) return rows;
  return { ...(current as object), results: rows, page: rows };
}

// The community list under an episode (reviews.listForEpisodeDetailed):
// upsert the viewer's own row so their star/note shows at the top at once.
export function upsertViewerEpisodeReviewRow(
  current: unknown,
  entry: EpisodeRatingEntry,
  viewer: EpisodeRatingViewer,
  show: Record<string, any> | null | undefined,
): unknown {
  const rows = detailedRows(current);
  const viewerId = viewer.viewer?._id ?? viewer.viewer?.id;
  if (!rows || !viewerId) return current;
  const existing = rows.find((row) => row?.review?.authorId === viewerId);
  const review = {
    ...(existing?.review ?? {}),
    _id: existing?.review?._id ?? entry._id,
    id: existing?.review?.id ?? entry.id,
    authorId: viewerId,
    showId: entry.showId,
    seasonNumber: entry.seasonNumber,
    episodeNumber: entry.episodeNumber,
    episodeTitle: entry.episodeTitle ?? existing?.review?.episodeTitle ?? null,
    rating: entry.rating,
    reviewText: entry.reviewText ?? null,
    spoiler: existing?.review?.spoiler ?? false,
    createdAt: existing?.review?.createdAt ?? entry.createdAt,
    updatedAt: entry.updatedAt,
  };
  const row: DetailedReviewRow = {
    ...existing,
    review,
    author: existing?.author ?? viewer.viewer ?? null,
    authorAvatarUrl: existing?.authorAvatarUrl ?? viewer.viewerAvatarUrl ?? null,
    show: existing?.show ?? show ?? null,
    likeCount: existing?.likeCount ?? 0,
    likedByViewer: existing?.likedByViewer ?? false,
  };
  const others = rows.filter((candidate) => candidate !== existing);
  return replaceDetailedRows(current, [row, ...others]);
}

export function removeViewerEpisodeReviewRow(current: unknown, viewerId: string | undefined) {
  const rows = detailedRows(current);
  if (!rows || !viewerId) return current;
  if (!rows.some((row) => row?.review?.authorId === viewerId)) return current;
  return replaceDetailedRows(
    current,
    rows.filter((row) => row?.review?.authorId !== viewerId),
  );
}

export function optimisticRateEpisode(
  localStore: LocalStore,
  args: RateEpisodeArgs,
  viewer: EpisodeRatingViewer = {},
) {
  const queryArgs = { showId: args.showId };
  const current = localStore.getQuery(api.reviews.getMyEpisodeRatings, queryArgs) as
    | EpisodeRatingEntry[]
    | undefined;
  const previous = Array.isArray(current)
    ? current.find((entry) => sameEpisode(entry, args))
    : undefined;
  const next = upsertEpisodeRating(current, args);
  localStore.setQuery(api.reviews.getMyEpisodeRatings, queryArgs, next);

  const entry = next.find((candidate) => sameEpisode(candidate, args));
  if (!entry) return;
  const episodeArgs = episodeQueryArgs(args);
  const stats = localStore.getQuery(api.reviews.getEpisodeStats, episodeArgs);
  if (stats && typeof stats === "object") {
    localStore.setQuery(
      api.reviews.getEpisodeStats,
      episodeArgs,
      applyRatingChangeToStats(stats, previous?.rating ?? null, args.rating),
    );
  }
  const community = localStore.getQuery(api.reviews.listForEpisodeDetailed, episodeArgs);
  if (community !== undefined) {
    const show = localStore.getQuery(api.shows.get, { showId: args.showId });
    localStore.setQuery(
      api.reviews.listForEpisodeDetailed,
      episodeArgs,
      upsertViewerEpisodeReviewRow(community, entry, viewer, show),
    );
  }
}

export function optimisticRemoveEpisodeRating(
  localStore: LocalStore,
  args: EpisodeRatingRef,
  viewer: EpisodeRatingViewer = {},
) {
  const queryArgs = { showId: args.showId };
  const current = localStore.getQuery(api.reviews.getMyEpisodeRatings, queryArgs) as
    | EpisodeRatingEntry[]
    | undefined;
  const previous = Array.isArray(current)
    ? current.find((entry) => sameEpisode(entry, args))
    : undefined;
  localStore.setQuery(
    api.reviews.getMyEpisodeRatings,
    queryArgs,
    removeEpisodeRatingEntry(current, args),
  );

  const episodeArgs = episodeQueryArgs(args);
  const stats = localStore.getQuery(api.reviews.getEpisodeStats, episodeArgs);
  if (stats && typeof stats === "object" && previous) {
    localStore.setQuery(
      api.reviews.getEpisodeStats,
      episodeArgs,
      applyRatingChangeToStats(stats, previous.rating, null),
    );
  }
  const community = localStore.getQuery(api.reviews.listForEpisodeDetailed, episodeArgs);
  if (community !== undefined) {
    localStore.setQuery(
      api.reviews.listForEpisodeDetailed,
      episodeArgs,
      removeViewerEpisodeReviewRow(community, viewer.viewer?._id ?? viewer.viewer?.id),
    );
  }
}

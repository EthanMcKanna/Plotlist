import { api } from "./plotlist/api";
import type { LocalStore } from "./plotlist/react";

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

function sameEpisode(left: EpisodeRatingRef, right: EpisodeRatingRef) {
  return (
    left.showId === right.showId &&
    left.seasonNumber === right.seasonNumber &&
    left.episodeNumber === right.episodeNumber
  );
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

export function optimisticRateEpisode(localStore: LocalStore, args: RateEpisodeArgs) {
  const queryArgs = { showId: args.showId };
  const current = localStore.getQuery(api.reviews.getMyEpisodeRatings, queryArgs) as
    | EpisodeRatingEntry[]
    | undefined;
  localStore.setQuery(
    api.reviews.getMyEpisodeRatings,
    queryArgs,
    upsertEpisodeRating(current, args),
  );
}

export function optimisticRemoveEpisodeRating(
  localStore: LocalStore,
  args: EpisodeRatingRef,
) {
  const queryArgs = { showId: args.showId };
  const current = localStore.getQuery(api.reviews.getMyEpisodeRatings, queryArgs) as
    | EpisodeRatingEntry[]
    | undefined;
  localStore.setQuery(
    api.reviews.getMyEpisodeRatings,
    queryArgs,
    removeEpisodeRatingEntry(current, args),
  );
}

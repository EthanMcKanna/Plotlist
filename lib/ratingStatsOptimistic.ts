// Mirrors the server's buildRatingStats (api/_lib/rpc.ts): count, average and
// a 5-bucket histogram keyed by the nearest whole star. Patching the cached
// stats in step with a rating write keeps the "★ 4.3 (12)" chips and the
// histogram honest until the refetch lands.
export type RatingStats = {
  count?: number | null;
  reviewCount?: number | null;
  averageRating?: number | null;
  histogram?: number[] | null;
};

function bucketFor(rating: number) {
  return Math.min(5, Math.max(1, Math.round(rating))) - 1;
}

export type ResolvedRatingStats = {
  count: number;
  reviewCount: number;
  averageRating: number | null;
  histogram: number[];
};

export function applyRatingChangeToStats<T extends RatingStats>(
  stats: T,
  previousRating: number | null | undefined,
  nextRating: number | null | undefined,
): Omit<T, keyof ResolvedRatingStats> & ResolvedRatingStats {
  const count = Math.max(0, stats.count ?? stats.reviewCount ?? 0);
  const average = typeof stats.averageRating === "number" ? stats.averageRating : 0;
  const histogram = Array.isArray(stats.histogram) ? [...stats.histogram] : [0, 0, 0, 0, 0];
  while (histogram.length < 5) histogram.push(0);

  let nextCount = count;
  let sum = average * count;
  if (typeof previousRating === "number") {
    nextCount = Math.max(0, nextCount - 1);
    sum -= previousRating;
    histogram[bucketFor(previousRating)] = Math.max(0, (histogram[bucketFor(previousRating)] ?? 0) - 1);
  }
  if (typeof nextRating === "number") {
    nextCount += 1;
    sum += nextRating;
    histogram[bucketFor(nextRating)] = (histogram[bucketFor(nextRating)] ?? 0) + 1;
  }

  return {
    ...stats,
    count: nextCount,
    reviewCount: nextCount,
    averageRating: nextCount > 0 ? Math.max(0, sum) / nextCount : null,
    histogram,
  };
}

import { hasExplicitCurrentHomeSignal } from "./homeCurrentSignal";

export type HomeRankableShow = {
  _id?: string | null;
  showId?: string | null;
  externalSource?: string | null;
  externalId?: string | number | null;
  title?: string | null;
  year?: number | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  overview?: string | null;
  genreIds?: number[] | null;
  tmdbPopularity?: number | null;
  tmdbVoteAverage?: number | null;
  tmdbVoteCount?: number | null;
  homeSignal?: string | null;
  updatedAt?: number | null;
};

export type HomeReasonSignal = "quality" | "heat" | "fresh" | "taste";

export type HomeRankedShow<T extends HomeRankableShow> = T & {
  homeScore: number;
  homeReasons: HomeReasonSignal[];
};

export type HomeRankingOptions = {
  now?: number;
  genreWeights?: Record<string, number>;
  seenKeys?: Iterable<string>;
  seedKeys?: Iterable<string>;
  maxPopularity?: number;
  diversityStrength?: number;
  preferFresh?: boolean;
};

const RECENT_WINDOW_MS = 120 * 24 * 60 * 60 * 1000;

export function getHomeShowKey(show: HomeRankableShow | null | undefined) {
  if (!show) return null;
  if (show._id) return show._id;
  if (show.showId) return show.showId;
  if (show.externalSource && show.externalId !== undefined && show.externalId !== null) {
    return `${show.externalSource}:${show.externalId}`;
  }
  if (show.externalId !== undefined && show.externalId !== null) {
    return String(show.externalId);
  }
  if (show.title) {
    return `${show.title}:${show.year ?? ""}`.toLowerCase();
  }
  return null;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function qualityScore(show: HomeRankableShow) {
  const average = show.tmdbVoteAverage ?? 0;
  const count = show.tmdbVoteCount ?? 0;
  if (average <= 0 || count <= 0) return 0.35;
  const confidence = count / (count + 450);
  const normalized = clamp01((average - 5.2) / 4.2);
  return clamp01(normalized * confidence + 0.34 * (1 - confidence));
}

function popularityScore(show: HomeRankableShow, maxPopularity: number) {
  const popularity = Math.max(0, show.tmdbPopularity ?? 0);
  if (popularity <= 0 || maxPopularity <= 0) return 0;
  return clamp01(Math.log1p(popularity) / Math.log1p(maxPopularity));
}

function freshnessScore(show: HomeRankableShow, now: number) {
  const updatedAt = show.updatedAt ?? null;
  const currentYear = new Date(now).getUTCFullYear();
  const updateFreshness =
    typeof updatedAt === "number"
      ? clamp01(1 - Math.max(0, now - updatedAt) / RECENT_WINDOW_MS)
      : 0;
  const year = show.year ?? 0;
  const yearFreshness =
    year >= currentYear
      ? 0.86
      : year === currentYear - 1
        ? 0.62
        : year === currentYear - 2
          ? 0.3
          : 0;
  const editorialFreshness = hasExplicitCurrentHomeSignal(show, { now }) ? 1 : 0;
  return Math.max(updateFreshness, yearFreshness, editorialFreshness);
}

function agePenalty(show: HomeRankableShow, now: number) {
  if (!show.year) return 0;
  const currentYear = new Date(now).getUTCFullYear();
  return clamp01((currentYear - show.year - 8) / 18);
}

function tasteScore(show: HomeRankableShow, genreWeights: Record<string, number>) {
  const genres = show.genreIds ?? [];
  if (genres.length === 0) return 0;
  const raw = genres.reduce((sum, genreId) => sum + (genreWeights[String(genreId)] ?? 0), 0);
  return clamp01(raw / Math.max(1, Math.sqrt(genres.length)));
}

function genreOverlap(left: HomeRankableShow, right: HomeRankableShow) {
  const leftGenres = new Set(left.genreIds ?? []);
  const rightGenres = right.genreIds ?? [];
  if (leftGenres.size === 0 || rightGenres.length === 0) return 0;
  let shared = 0;
  rightGenres.forEach((genreId) => {
    if (leftGenres.has(genreId)) shared += 1;
  });
  return shared / Math.max(leftGenres.size, rightGenres.length);
}

function scoreShow(show: HomeRankableShow, options: Required<Pick<HomeRankingOptions, "now">> & HomeRankingOptions) {
  const genreWeights = options.genreWeights ?? {};
  const maxPopularity = options.maxPopularity ?? Math.max(1, show.tmdbPopularity ?? 1);
  const quality = qualityScore(show);
  const popularity = popularityScore(show, maxPopularity);
  const freshness = freshnessScore(show, options.now);
  const taste = tasteScore(show, genreWeights);
  const hasTaste = Object.keys(genreWeights).length > 0;
  const freshPreference = options.preferFresh ? freshness * 0.14 - agePenalty(show, options.now) * 0.16 : 0;
  const score =
    quality * 0.34 +
    popularity * 0.24 +
    freshness * 0.18 +
    (hasTaste ? taste * 0.24 : 0) +
    freshPreference;
  const reasons = [
    quality >= 0.62 ? "quality" : null,
    popularity >= 0.72 ? "heat" : null,
    freshness >= 0.65 ? "fresh" : null,
    taste >= 0.35 ? "taste" : null,
  ].filter((reason): reason is HomeReasonSignal => Boolean(reason));
  return { score, reasons };
}

export function rankHomeShows<T extends HomeRankableShow>(
  candidates: T[],
  options: HomeRankingOptions = {},
): HomeRankedShow<T>[] {
  const now = options.now ?? Date.now();
  const seenKeys = new Set(options.seenKeys ?? []);
  const seedKeys = new Set(options.seedKeys ?? []);
  const maxPopularity =
    options.maxPopularity ??
    Math.max(1, ...candidates.map((show) => Math.max(0, show.tmdbPopularity ?? 0)));
  const unique = new Map<string, T>();

  candidates.forEach((show) => {
    if (!show.title || !show.posterUrl) return;
    const key = getHomeShowKey(show);
    if (!key || seenKeys.has(key) || unique.has(key)) return;
    unique.set(key, show);
  });

  const scored = Array.from(unique.values()).map((show) => {
    const { score, reasons } = scoreShow(show, { ...options, now, maxPopularity });
    const key = getHomeShowKey(show);
    const seedBoost = key && seedKeys.has(key) ? 0.08 : 0;
    return {
      item: show,
      score: score + seedBoost,
      reasons,
    };
  });

  const selected: Array<{ item: T; score: number; reasons: HomeReasonSignal[] }> = [];
  const remaining = [...scored];
  const diversityStrength = options.diversityStrength ?? 0.16;

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const overlapPenalty = selected.reduce(
        (max, picked) => Math.max(max, genreOverlap(candidate.item, picked.item)),
        0,
      );
      const diversifiedScore = candidate.score - overlapPenalty * diversityStrength;
      if (diversifiedScore > bestScore) {
        bestScore = diversifiedScore;
        bestIndex = index;
      }
    }
    const [next] = remaining.splice(bestIndex, 1);
    selected.push(next);
  }

  return selected.map(({ item, score, reasons }) => ({
    ...item,
    homeScore: Number(score.toFixed(4)),
    homeReasons: reasons,
  }));
}

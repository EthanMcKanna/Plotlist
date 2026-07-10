// Pure ranking math for recommendations v2 (api/_lib/recs.ts orchestrates the
// data access; everything here is deterministic and unit-tested).

export type TasteSignal = {
  showId: string;
  weight: number;
  at: number;
};

export type ScoredCandidate = {
  showId: string;
  semanticScore: number;
  voteAverage?: number | null;
  voteCount?: number | null;
  popularity?: number | null;
  year?: number | null;
  genreIds?: number[] | null;
  facetKeys?: string[];
  coWatch?: boolean;
};

export type RankedRecommendation = ScoredCandidate & {
  finalScore: number;
  reasons: string[];
};

const HALF_LIFE_MS = 180 * 24 * 60 * 60 * 1000;
const DECAY_FLOOR = 0.25;

// Recency decay keeps last month's obsession louder than a show finished two
// years ago, without ever fully silencing old favorites.
export function decayWeight(weight: number, at: number, now: number) {
  const age = Math.max(0, now - at);
  const decay = Math.max(DECAY_FLOOR, 0.5 ** (age / HALF_LIFE_MS));
  return weight * decay;
}

export function signalWeightForWatchStatus(status: string): number {
  switch (status) {
    case "watching":
      return 1.2;
    case "completed":
      return 1.0;
    case "watchlist":
      return 0.35;
    case "dropped":
      return -0.8;
    default:
      return 0.3;
  }
}

// reviews.rating is on a 0–5 scale.
export function signalWeightForRating(rating: number): number {
  if (rating >= 4) return 1.5;
  if (rating >= 3.5) return 0.8;
  if (rating >= 3) return 0.3;
  if (rating >= 2.5) return 0;
  return -1.2;
}

export function accumulateSignals(
  signals: TasteSignal[],
  now: number,
): Map<string, number> {
  const byShow = new Map<string, number>();
  for (const signal of signals) {
    const decayed = decayWeight(signal.weight, signal.at, now);
    byShow.set(signal.showId, (byShow.get(signal.showId) ?? 0) + decayed);
  }
  return byShow;
}

// Bayesian quality prior on the TMDB 10-scale: shrink vote_average toward a
// neutral 7.0 by vote volume so a 9.2 with 40 votes doesn't beat an 8.6 with
// 200k votes. Returned in [0, 1].
export function qualityPrior(voteAverage?: number | null, voteCount?: number | null) {
  const votes = Math.max(0, voteCount ?? 0);
  const average = voteAverage ?? 0;
  if (votes === 0 || average <= 0) return 0.35;
  const shrunk = (votes * average + 300 * 7.0) / (votes + 300);
  return Math.min(1, Math.max(0, (shrunk - 5.0) / 4.0));
}

export function freshnessScore(year?: number | null, nowYear?: number) {
  const currentYear = nowYear ?? new Date().getUTCFullYear();
  if (!year) return 0.3;
  const age = currentYear - year;
  if (age <= 0) return 1;
  if (age === 1) return 0.85;
  if (age <= 3) return 0.65;
  if (age <= 7) return 0.45;
  if (age <= 15) return 0.3;
  return 0.2;
}

function popularityScore(popularity?: number | null) {
  return Math.min(1, Math.log1p(Math.max(0, popularity ?? 0)) / Math.log1p(500));
}

function overlap<T>(left: Iterable<T> | null | undefined, right: Set<T>) {
  let shared = 0;
  for (const value of left ?? []) {
    if (right.has(value)) shared += 1;
  }
  return shared;
}

// Vectorize returns approximate (compressed) similarity scores — a vector
// queried against itself lands around 0.7, not 1.0 — so absolute thresholds
// are meaningless while ordering is reliable. Rescale a candidate set's
// scores onto [floor, ceil] so the ranking blend sees a consistent range.
export function normalizeSemanticScores<T extends { semanticScore: number }>(
  candidates: T[],
  floor = 0.35,
  ceil = 0.95,
): T[] {
  if (candidates.length === 0) return candidates;
  let min = Infinity;
  let max = -Infinity;
  for (const candidate of candidates) {
    min = Math.min(min, candidate.semanticScore);
    max = Math.max(max, candidate.semanticScore);
  }
  const span = max - min;
  return candidates.map((candidate) => ({
    ...candidate,
    semanticScore:
      span <= 1e-9
        ? (floor + ceil) / 2
        : floor + ((candidate.semanticScore - min) / span) * (ceil - floor),
  }));
}

export type RankOptions = {
  limit: number;
  excludeShowIds?: Set<string>;
  // Greedy MMR-style diversity: each pick penalizes later candidates that
  // share genres/facets with what's already selected.
  diversityStrength?: number;
  semanticWeight?: number;
  nowYear?: number;
};

// Blends semantic similarity with quality/freshness/popularity priors and a
// co-watch agreement boost, then greedily diversifies. Works for both
// profile-based For-You ranking and per-show similar lists.
export function rankCandidates(
  candidates: ScoredCandidate[],
  options: RankOptions,
): RankedRecommendation[] {
  const diversityStrength = options.diversityStrength ?? 0.16;
  const semanticWeight = options.semanticWeight ?? 0.52;

  const base = candidates
    .filter((candidate) => !options.excludeShowIds?.has(candidate.showId))
    .map((candidate) => {
      const quality = qualityPrior(candidate.voteAverage, candidate.voteCount);
      const fresh = freshnessScore(candidate.year, options.nowYear);
      const pop = popularityScore(candidate.popularity);
      const coWatchBoost = candidate.coWatch ? 0.08 : 0;
      const finalScore =
        candidate.semanticScore * semanticWeight +
        quality * 0.24 +
        fresh * 0.1 +
        pop * 0.06 +
        coWatchBoost;
      const reasons: string[] = [];
      if (candidate.semanticScore >= 0.7) reasons.push("taste");
      if (quality >= 0.62) reasons.push("quality");
      if (pop >= 0.7) reasons.push("heat");
      if (fresh >= 0.85) reasons.push("fresh");
      return { ...candidate, finalScore, reasons };
    })
    .sort((left, right) => right.finalScore - left.finalScore);

  // Greedy diversity pass over the score-ordered pool.
  const picked: RankedRecommendation[] = [];
  const pickedGenres = new Set<number>();
  const pickedFacets = new Set<string>();
  const pool = [...base];
  while (picked.length < options.limit && pool.length > 0) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let index = 0; index < pool.length; index += 1) {
      const candidate = pool[index];
      const genrePenalty = overlap(candidate.genreIds, pickedGenres) * 0.02;
      const facetPenalty = overlap(candidate.facetKeys, pickedFacets) * 0.035;
      const adjusted =
        candidate.finalScore - (genrePenalty + facetPenalty) * (diversityStrength / 0.16);
      if (adjusted > bestScore) {
        bestScore = adjusted;
        bestIndex = index;
      }
    }
    const [chosen] = pool.splice(bestIndex, 1);
    picked.push(chosen);
    (chosen.genreIds ?? []).forEach((genreId) => pickedGenres.add(genreId));
    (chosen.facetKeys ?? []).forEach((facetKey) => pickedFacets.add(facetKey));
  }
  return picked;
}

// Aggregates seed facets into the profile's top facets: facet score weighted
// by how much the user loved the show it came from.
export function aggregateProfileFacets(
  seeds: Array<{ weight: number; facets: Array<{ key: string; score: number }> }>,
  limit = 8,
): Array<{ key: string; score: number }> {
  const totals = new Map<string, number>();
  for (const seed of seeds) {
    if (seed.weight <= 0) continue;
    for (const facet of seed.facets) {
      totals.set(facet.key, (totals.get(facet.key) ?? 0) + facet.score * seed.weight);
    }
  }
  const max = Math.max(1e-6, ...totals.values());
  return Array.from(totals.entries())
    .map(([key, score]) => ({ key, score: Number((score / max).toFixed(4)) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

// Cosine of two unit profile vectors → friendly 0–100 "taste match" percent.
// Cosine 0.55 between two real profiles is already meaningfully similar, so
// the curve is stretched rather than linear.
export function tasteMatchPercent(cosine: number) {
  const clamped = Math.max(0, Math.min(1, cosine));
  return Math.round(100 * clamped ** 0.6);
}

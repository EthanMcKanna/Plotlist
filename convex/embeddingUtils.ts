import type { Doc } from "./_generated/dataModel";

type ShowDoc = Doc<"shows">;

const TMDB_TV_GENRE_NAMES: Record<number, string> = {
  16: "Animation",
  18: "Drama",
  35: "Comedy",
  37: "Western",
  80: "Crime",
  99: "Documentary",
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

type RankedCandidate = {
  id: string;
  coverageScore?: number;
  intentScore?: number;
  lexicalScore?: number;
  semanticScore?: number;
  popularity?: number;
  exactTitleMatch?: boolean;
  prefixTitleMatch?: boolean;
};

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

export function fnv1aHash(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildRecommendationSignalFingerprint(args: {
  watchSignals: string[];
  reviewSignals: string[];
  themeKey: string;
  embeddingVersion: string;
}) {
  return fnv1aHash(
    [
      args.embeddingVersion,
      args.themeKey,
      ...args.watchSignals.slice().sort(),
      ...args.reviewSignals.slice().sort(),
    ].join("|"),
  );
}

export function mapGenreIdsToNames(genreIds?: number[]) {
  return unique(
    (genreIds ?? [])
      .map((genreId) => TMDB_TV_GENRE_NAMES[genreId])
      .filter((genreName): genreName is string => Boolean(genreName)),
  );
}

export function buildShowEmbeddingText(show: ShowDoc) {
  const lines = [
    `Title: ${show.title}`,
    show.originalTitle ? `Original title: ${show.originalTitle}` : null,
    show.year ? `First aired: ${show.year}` : null,
    mapGenreIdsToNames(show.genreIds).length > 0
      ? `Genres: ${mapGenreIdsToNames(show.genreIds).join(", ")}`
      : null,
    show.originalLanguage ? `Original language: ${show.originalLanguage}` : null,
    show.originCountries?.length
      ? `Origin countries: ${show.originCountries.join(", ")}`
      : null,
    show.overview ? `Overview: ${show.overview}` : null,
  ];

  return lines.filter(Boolean).join("\n");
}

export function normalizeVector(vector: number[]) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) {
    return vector.map(() => 0);
  }
  return vector.map((value) => value / magnitude);
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude);
  return denominator ? dot / denominator : 0;
}

export function weightedCentroid(
  vectors: Array<{ vector: number[]; weight: number }>,
) {
  if (!vectors.length) {
    return null;
  }

  const dimensions = vectors[0].vector.length;
  const accumulator = new Array<number>(dimensions).fill(0);
  let totalWeight = 0;

  for (const item of vectors) {
    if (item.vector.length !== dimensions || item.weight <= 0) {
      continue;
    }
    totalWeight += item.weight;
    for (let index = 0; index < dimensions; index += 1) {
      accumulator[index] += item.vector[index] * item.weight;
    }
  }

  if (!totalWeight) {
    return null;
  }

  return accumulator.map((value) => value / totalWeight);
}

export function mergeHybridCandidates(
  candidates: RankedCandidate[],
  limit: number,
) {
  return candidates
    .map((candidate) => {
      const lexicalScore = candidate.lexicalScore ?? 0;
      const semanticScore = candidate.semanticScore ?? 0;
      const coverageScore = candidate.coverageScore ?? 0;
      const popularityBoost = Math.min((candidate.popularity ?? 0) / 250, 0.08);
      const exactBoost = candidate.exactTitleMatch ? 1.25 : 0;
      const prefixBoost = !candidate.exactTitleMatch && candidate.prefixTitleMatch ? 0.35 : 0;

      return {
        ...candidate,
        finalScore:
          lexicalScore * 0.75 +
          semanticScore * 0.55 +
          coverageScore * 0.35 +
          (candidate.intentScore ?? 0) * 0.45 +
          popularityBoost +
          exactBoost +
          prefixBoost,
      };
    })
    .sort((left, right) => right.finalScore - left.finalScore)
    .slice(0, limit);
}

export function overlapRatio(left: number[] | undefined, right: number[] | undefined) {
  const leftSet = new Set(left ?? []);
  const rightSet = new Set(right ?? []);
  if (!leftSet.size || !rightSet.size) {
    return 0;
  }

  let shared = 0;
  for (const value of leftSet) {
    if (rightSet.has(value)) {
      shared += 1;
    }
  }

  return shared / Math.max(leftSet.size, rightSet.size);
}

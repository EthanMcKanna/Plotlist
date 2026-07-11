// Recommendations v2 engine: taste profiles, vector candidate generation,
// similar shows, vibe search, and taste match. Data access + orchestration
// only — the ranking math lives in lib/plotlist/recsRanking.ts and the vector
// store is the Vectorize index (worker/vectorize.ts binding).
//
// Every entry point degrades gracefully: when the Vectorize binding, the
// Gemini key, or the show vectors are missing, callers fall back to the
// legacy heuristic paths in rpc.ts. See docs/recommendations-v2.md.

import { and, eq, gte, inArray } from "drizzle-orm";

import {
  facetDefs,
  reviews,
  showFacets,
  shows,
  userTastePreferences,
  userTasteProfiles,
  watchLogs,
  watchStates,
} from "../../db/schema";
import { db } from "./db";
import { createId } from "./ids";
import { embedText } from "./gemini";
import { getVectorizeIndex } from "../../worker/vectorize";
import { EMBEDDING_VERSION } from "../../lib/plotlist/embeddingDoc";
import {
  buildRecommendationSignalFingerprint,
  cosineSimilarity,
  normalizeVector,
  weightedCentroid,
} from "../../lib/plotlist/embeddingUtils";
import {
  accumulateSignals,
  aggregateProfileFacets,
  signalWeightForRating,
  signalWeightForWatchStatus,
  tasteMatchPercent,
  type TasteSignal,
} from "../../lib/plotlist/recsRanking";

const GET_BY_IDS_CHUNK = 20;
const PROFILE_MAX_SEEDS = 48;
const PROFILE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_CENTROID_DAMPING = 0.35;

export type TasteProfile = {
  userId: string;
  vector: number[];
  positiveSeeds: Array<{ showId: string; weight: number }>;
  negativeShowIds: string[];
  topFacets: Array<{ key: string; score: number }>;
  seenShowIds: Set<string>;
};

export function vectorsAvailable() {
  return getVectorizeIndex() !== null;
}

export async function fetchShowVectors(showIds: string[]): Promise<Map<string, number[]>> {
  const index = getVectorizeIndex();
  const result = new Map<string, number[]>();
  if (!index || showIds.length === 0) return result;
  for (let offset = 0; offset < showIds.length; offset += GET_BY_IDS_CHUNK) {
    const chunk = showIds.slice(offset, offset + GET_BY_IDS_CHUNK);
    const vectors = await index.getByIds(chunk);
    for (const vector of vectors ?? []) {
      if (Array.isArray(vector?.values) && vector.values.length > 0) {
        result.set(vector.id, vector.values);
      }
    }
  }
  return result;
}

async function gatherSignals(userId: string) {
  const logsSince = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const [states, reviewRows, logs, prefs] = await Promise.all([
    db.select().from(watchStates).where(eq(watchStates.userId, userId)),
    db.select().from(reviews).where(eq(reviews.authorId, userId)),
    db
      .select()
      .from(watchLogs)
      .where(and(eq(watchLogs.userId, userId), gte(watchLogs.watchedAt, logsSince))),
    db.select().from(userTastePreferences).where(eq(userTastePreferences.userId, userId)).limit(1),
  ]);

  const now = Date.now();
  const signals: TasteSignal[] = [];
  const seenShowIds = new Set<string>();

  for (const state of states) {
    seenShowIds.add(state.showId);
    signals.push({
      showId: state.showId,
      weight: signalWeightForWatchStatus(state.status),
      at: state.updatedAt,
    });
  }
  for (const review of reviewRows) {
    seenShowIds.add(review.showId);
    signals.push({
      showId: review.showId,
      weight: signalWeightForRating(review.rating),
      at: review.createdAt,
    });
  }
  // Diary logs: mild positive reinforcement, capped so one binge doesn't
  // dominate the profile.
  const logCounts = new Map<string, { count: number; at: number }>();
  for (const log of logs) {
    seenShowIds.add(log.showId);
    const entry = logCounts.get(log.showId) ?? { count: 0, at: 0 };
    entry.count += 1;
    entry.at = Math.max(entry.at, log.watchedAt);
    logCounts.set(log.showId, entry);
  }
  for (const [showId, entry] of logCounts) {
    signals.push({ showId, weight: Math.min(entry.count, 3) * 0.2, at: entry.at });
  }
  for (const favoriteId of prefs[0]?.favoriteShowIds ?? []) {
    seenShowIds.add(favoriteId);
    signals.push({ showId: favoriteId, weight: 1.6, at: now });
  }

  const fingerprint = buildRecommendationSignalFingerprint({
    watchSignals: states.map((state) => `${state.showId}:${state.status}`),
    reviewSignals: reviewRows.map((review) => `${review.showId}:${review.rating}`),
    themeKey: (prefs[0]?.favoriteShowIds ?? []).slice().sort().join(","),
    embeddingVersion: EMBEDDING_VERSION,
  });

  return { signals, seenShowIds, fingerprint, now };
}

async function loadFacetsForShows(showIds: string[]) {
  const byShow = new Map<string, Array<{ key: string; score: number }>>();
  if (showIds.length === 0) return byShow;
  for (let offset = 0; offset < showIds.length; offset += 90) {
    const chunk = showIds.slice(offset, offset + 90);
    const rows = await db.select().from(showFacets).where(inArray(showFacets.showId, chunk));
    for (const row of rows) {
      const list = byShow.get(row.showId) ?? [];
      list.push({ key: row.facetKey, score: row.score });
      byShow.set(row.showId, list);
    }
  }
  for (const list of byShow.values()) {
    list.sort((left, right) => right.score - left.score);
  }
  return byShow;
}

export async function getFacetsForShows(showIds: string[]) {
  return await loadFacetsForShows(showIds);
}

// Builds (or serves from user_taste_profiles cache) the user's taste vector.
// Returns null when the user has no usable signals or vectors are missing.
export async function getTasteProfile(userId: string): Promise<TasteProfile | null> {
  if (!vectorsAvailable()) return null;

  const { signals, seenShowIds, fingerprint, now } = await gatherSignals(userId);
  if (signals.length === 0) return null;

  const cached = await db
    .select()
    .from(userTasteProfiles)
    .where(eq(userTasteProfiles.userId, userId))
    .limit(1);
  if (
    cached[0] &&
    cached[0].signalFingerprint === fingerprint &&
    cached[0].embeddingVersion === EMBEDDING_VERSION &&
    now - cached[0].updatedAt < PROFILE_CACHE_TTL_MS &&
    cached[0].profileVector.length > 0
  ) {
    return {
      userId,
      vector: cached[0].profileVector,
      positiveSeeds: cached[0].positiveSeeds,
      negativeShowIds: cached[0].negativeShowIds,
      topFacets: cached[0].topFacets,
      seenShowIds,
    };
  }

  const byShow = accumulateSignals(signals, now);
  const positives = Array.from(byShow.entries())
    .filter(([, weight]) => weight > 0.05)
    .sort((left, right) => right[1] - left[1])
    .slice(0, PROFILE_MAX_SEEDS);
  const negatives = Array.from(byShow.entries())
    .filter(([, weight]) => weight < -0.1)
    .slice(0, 24);
  if (positives.length === 0) return null;

  const vectorIds = [...positives.map(([id]) => id), ...negatives.map(([id]) => id)];
  const vectors = await fetchShowVectors(vectorIds);
  const positiveVectors = positives
    .map(([showId, weight]) => {
      const vector = vectors.get(showId);
      return vector ? { vector, weight } : null;
    })
    .filter((entry): entry is { vector: number[]; weight: number } => entry !== null);
  if (positiveVectors.length === 0) return null;

  const positiveCentroid = weightedCentroid(positiveVectors);
  if (!positiveCentroid) return null;
  const negativeVectors = negatives
    .map(([showId, weight]) => {
      const vector = vectors.get(showId);
      return vector ? { vector, weight: Math.abs(weight) } : null;
    })
    .filter((entry): entry is { vector: number[]; weight: number } => entry !== null);
  const negativeCentroid = negativeVectors.length > 0 ? weightedCentroid(negativeVectors) : null;

  const combined = positiveCentroid.map((value, index) =>
    negativeCentroid ? value - NEGATIVE_CENTROID_DAMPING * negativeCentroid[index] : value,
  );
  const profileVector = normalizeVector(combined);

  const positiveSeeds = positives.map(([showId, weight]) => ({
    showId,
    weight: Number(weight.toFixed(4)),
  }));
  const facetsBySeed = await loadFacetsForShows(positiveSeeds.map((seed) => seed.showId));
  const topFacets = aggregateProfileFacets(
    positiveSeeds.map((seed) => ({
      weight: seed.weight,
      facets: facetsBySeed.get(seed.showId) ?? [],
    })),
  );
  const negativeShowIds = negatives.map(([showId]) => showId);

  const profileId = cached[0]?.id ?? createId("tasteprof");
  const row = {
    userId,
    embeddingVersion: EMBEDDING_VERSION,
    signalFingerprint: fingerprint,
    profileVector,
    positiveSeeds,
    negativeShowIds,
    topFacets,
    updatedAt: now,
  };
  if (cached[0]) {
    await db.update(userTasteProfiles).set(row).where(eq(userTasteProfiles.id, cached[0].id));
  } else {
    await db.insert(userTasteProfiles).values({ id: profileId, createdAt: now, ...row });
  }

  return { userId, vector: profileVector, positiveSeeds, negativeShowIds, topFacets, seenShowIds };
}

export async function queryVectorCandidates(
  vector: number[],
  options: { topK?: number; excludeIds?: Set<string> } = {},
): Promise<Array<{ showId: string; score: number }>> {
  const index = getVectorizeIndex();
  if (!index || vector.length === 0) return [];
  const { matches } = await index.query(vector, {
    topK: options.topK ?? 100,
    returnMetadata: "none",
    returnValues: false,
  });
  return (matches ?? [])
    .filter((match) => !options.excludeIds?.has(match.id))
    .map((match) => ({ showId: match.id, score: match.score }));
}

// ANN neighbors of an already-embedded show. Returns null (not []) when the
// vector path is unavailable so callers can fall back to the TMDB path.
export async function getSimilarShowIdsByVector(
  showId: string,
  topK = 40,
): Promise<Array<{ showId: string; score: number }> | null> {
  const index = getVectorizeIndex();
  if (!index) return null;
  const vectors = await fetchShowVectors([showId]);
  const vector = vectors.get(showId);
  if (!vector) return null;
  const matches = await queryVectorCandidates(vector, { topK: topK + 1 });
  return matches.filter((match) => match.showId !== showId).slice(0, topK);
}

// Free-text vibe search: embed the query (RETRIEVAL_QUERY side) and return
// nearest shows. Requires GEMINI_API_KEY + the Vectorize binding.
export async function searchShowIdsByVibe(
  query: string,
  topK = 30,
): Promise<Array<{ showId: string; score: number }> | null> {
  const index = getVectorizeIndex();
  if (!index || !process.env.GEMINI_API_KEY) return null;
  const vector = await embedText(query, { taskType: "RETRIEVAL_QUERY" });
  return await queryVectorCandidates(vector, { topK });
}

// Percent-only variant for list surfaces (people discovery chips) — skips
// the shared-show hydration and picks ranking that profile pages need.
export async function computeTasteMatchPercent(viewerId: string, targetUserId: string) {
  const [viewerProfile, targetProfile] = await Promise.all([
    getTasteProfile(viewerId),
    getTasteProfile(targetUserId),
  ]);
  if (!viewerProfile || !targetProfile) return null;
  return tasteMatchPercent(cosineSimilarity(viewerProfile.vector, targetProfile.vector));
}

// "Taste match" between the viewer and another user, for profile pages.
// Returns the calibrated percent plus the two things that make it feel real:
// WHY (shared facets + shared shows) and WHAT NOW (the target's loved shows
// the viewer hasn't seen, ranked by the viewer's own taste vector).
export async function computeTasteMatch(viewerId: string, targetUserId: string) {
  const [viewerProfile, targetProfile] = await Promise.all([
    getTasteProfile(viewerId),
    getTasteProfile(targetUserId),
  ]);
  if (!viewerProfile || !targetProfile) return null;

  const percent = tasteMatchPercent(
    cosineSimilarity(viewerProfile.vector, targetProfile.vector),
  );

  // WHY, part 1: facets both profiles rank highly (scored by the weaker of
  // the two affinities so a facet only counts when it's genuinely mutual).
  const viewerFacets = new Map(viewerProfile.topFacets.map((facet) => [facet.key, facet.score]));
  const sharedFacets = targetProfile.topFacets
    .filter((facet) => viewerFacets.has(facet.key))
    .map((facet) => ({
      key: facet.key,
      score: Number(Math.min(facet.score, viewerFacets.get(facet.key) ?? 0).toFixed(4)),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  // WHY, part 2: shows in both users' positive seeds.
  const targetSeedWeights = new Map(
    targetProfile.positiveSeeds.map((seed) => [seed.showId, seed.weight]),
  );
  const sharedSeedIds = viewerProfile.positiveSeeds
    .filter((seed) => targetSeedWeights.has(seed.showId))
    .sort(
      (left, right) =>
        Math.min(right.weight, targetSeedWeights.get(right.showId) ?? 0) -
        Math.min(left.weight, targetSeedWeights.get(left.showId) ?? 0),
    )
    .map((seed) => seed.showId)
    .slice(0, 12);
  const sharedShows = sharedSeedIds.length
    ? await db.select().from(shows).where(inArray(shows.id, sharedSeedIds))
    : [];

  // WHAT NOW: their strongest positives the viewer hasn't touched, ordered by
  // a blend of how much THEY love it and how close it sits to the VIEWER's
  // taste vector — "picks from their shelf, sorted for you".
  const unseenSeeds = targetProfile.positiveSeeds
    .filter(
      (seed) =>
        !viewerProfile.seenShowIds.has(seed.showId) &&
        !viewerProfile.negativeShowIds.includes(seed.showId),
    )
    .slice(0, 40);
  let picksForViewer: Array<{ show: typeof shows.$inferSelect; theirWeight: number }> = [];
  if (unseenSeeds.length > 0) {
    const seedVectors = await fetchShowVectors(unseenSeeds.map((seed) => seed.showId));
    const maxWeight = Math.max(...unseenSeeds.map((seed) => seed.weight), 1e-6);
    const scored = unseenSeeds
      .map((seed) => {
        const vector = seedVectors.get(seed.showId);
        const affinity = vector ? cosineSimilarity(viewerProfile.vector, vector) : 0;
        return {
          showId: seed.showId,
          theirWeight: seed.weight,
          blended: (seed.weight / maxWeight) * 0.45 + affinity * 0.55,
        };
      })
      .sort((left, right) => right.blended - left.blended)
      .slice(0, 10);
    const pickRows = scored.length
      ? await db.select().from(shows).where(inArray(shows.id, scored.map((pick) => pick.showId)))
      : [];
    const rowById = new Map(pickRows.map((row) => [row.id, row]));
    picksForViewer = scored
      .map((pick) => {
        const show = rowById.get(pick.showId);
        return show && show.posterUrl ? { show, theirWeight: pick.theirWeight } : null;
      })
      .filter((pick): pick is NonNullable<typeof pick> => pick !== null)
      .slice(0, 8);
  }

  return { percent, sharedFacets, sharedShows, picksForViewer };
}

// Attribution for "Because you watched X": among the user's strongest seeds,
// find the one closest to the recommendation.
export function attributeRecommendationToSeed(
  recVector: number[],
  seedVectors: Array<{ showId: string; vector: number[]; weight: number }>,
) {
  let best: { showId: string; similarity: number } | null = null;
  for (const seed of seedVectors) {
    const similarity = cosineSimilarity(recVector, seed.vector);
    if (!best || similarity > best.similarity) {
      best = { showId: seed.showId, similarity };
    }
  }
  return best && best.similarity >= 0.55 ? best : null;
}

export async function loadFacetDefsFromDb() {
  return await db.select().from(facetDefs);
}

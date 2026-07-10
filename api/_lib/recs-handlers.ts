// Vector-path implementations for the embeddings:* RPC surface.
//
// Each function returns `null` when the vector foundation can't serve the
// request (missing Vectorize binding, un-embedded show, signal-less user) so
// the handlers in rpc.ts can fall back to the legacy heuristic paths. Kept
// out of rpc.ts deliberately — everything here depends only on recs
// primitives, schema, and pure ranking math. See docs/recommendations-v2.md.

import { and, count, desc, eq, inArray } from "drizzle-orm";

import { showFacets, shows, tmdbDetailsCache } from "../../db/schema";
import { db } from "./db";
import {
  attributeRecommendationToSeed,
  computeTasteMatch,
  fetchShowVectors,
  getFacetsForShows,
  getSimilarShowIdsByVector,
  getTasteProfile,
  queryVectorCandidates,
  searchShowIdsByVibe,
  type TasteProfile,
} from "./recs";
import {
  normalizeSemanticScores,
  qualityPrior,
  rankCandidates,
} from "../../lib/plotlist/recsRanking";
import { FACET_DEFS, FACET_GROUPS, facetByKey } from "../../lib/plotlist/facets";
import { mapGenreIdsToNames } from "../../lib/plotlist/embeddingUtils";

type ShowRow = typeof shows.$inferSelect;

// Mirrors rpc.ts's showToDoc: raw row plus the legacy Convex-style aliases
// the client keys on.
function toShowDoc(row: ShowRow | null | undefined) {
  return row ? { ...row, _id: row.id, _creationTime: row.createdAt } : null;
}

async function loadShowsByIds(ids: string[]) {
  const byId = new Map<string, ShowRow>();
  for (let offset = 0; offset < ids.length; offset += 90) {
    const chunk = ids.slice(offset, offset + 90);
    const rows = await db.select().from(shows).where(inArray(shows.id, chunk));
    for (const row of rows) byId.set(row.id, row);
  }
  return byId;
}

// ── Similar shows ───────────────────────────────────────────────────────────

// ANN neighbors blended with TMDB's co-watch recommendations (from the cached
// details payload). Returns the exact legacy item contract:
// {_id, showId, externalId, title, posterUrl, voteAverage, overview,
//  sharedGenres, show} — plus score.
export async function getSimilarShowsV2(source: ShowRow, limit: number) {
  const matches = await getSimilarShowIdsByVector(source.id, 60);
  if (!matches || matches.length === 0) return null;

  const cachedRows = await db
    .select()
    .from(tmdbDetailsCache)
    .where(
      and(
        eq(tmdbDetailsCache.externalSource, "tmdb"),
        eq(tmdbDetailsCache.externalId, source.externalId),
      ),
    )
    .limit(1);
  const cachedPayload = cachedRows[0]?.payload as any;
  const coWatchExternalIds = new Set<string>(
    [
      ...(Array.isArray(cachedPayload?.recommendations?.results)
        ? cachedPayload.recommendations.results
        : []),
      ...(Array.isArray(cachedPayload?.similar?.results) ? cachedPayload.similar.results : []),
    ]
      .map((item: any) => (item?.id != null ? String(item.id) : ""))
      .filter(Boolean),
  );

  const showsById = await loadShowsByIds(matches.map((match) => match.showId));
  const facetsById = await getFacetsForShows(matches.map((match) => match.showId));

  const candidates = matches
    .map((match) => {
      const row = showsById.get(match.showId);
      if (!row || !row.posterUrl || !row.title) return null;
      // Same-franchise near-duplicates (score ≥ 0.97) are usually alternate
      // entries of the same title; keep them but let diversity spread them.
      return {
        showId: row.id,
        semanticScore: match.score,
        voteAverage: row.tmdbVoteAverage,
        voteCount: row.tmdbVoteCount,
        popularity: row.tmdbPopularity,
        year: row.year,
        genreIds: row.genreIds,
        facetKeys: (facetsById.get(row.id) ?? []).map((facet) => facet.key),
        coWatch: coWatchExternalIds.has(row.externalId),
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

  const ranked = rankCandidates(normalizeSemanticScores(candidates), {
    limit,
    excludeShowIds: new Set([source.id]),
    semanticWeight: 0.6,
    diversityStrength: 0.1,
  });

  const sourceGenres = new Set(mapGenreIdsToNames(source.genreIds ?? undefined));
  return ranked.map((item) => {
    const row = showsById.get(item.showId)!;
    const sharedGenres = mapGenreIdsToNames(row.genreIds ?? undefined)
      .filter((genre) => sourceGenres.has(genre))
      .slice(0, 2);
    return {
      _id: row.id,
      showId: row.id,
      externalId: row.externalId,
      title: row.title,
      posterUrl: row.posterUrl,
      voteAverage:
        typeof row.tmdbVoteAverage === "number" && row.tmdbVoteAverage > 0
          ? row.tmdbVoteAverage
          : undefined,
      overview: row.overview ?? null,
      sharedGenres,
      score: Number(item.finalScore.toFixed(4)),
      show: toShowDoc(row) ?? undefined,
    };
  });
}

// ── Personalized recommendations ────────────────────────────────────────────

type PersonalizedItem = {
  _id: string;
  show: NonNullable<ReturnType<typeof toShowDoc>>;
  rank: number;
  score: number;
  homeReasons: string[];
  reason: string | null;
};

async function buildReasons(
  picks: Array<{ showId: string; reasons: string[] }>,
  profile: TasteProfile,
): Promise<Map<string, string>> {
  const reasonByShow = new Map<string, string>();
  const topSeeds = profile.positiveSeeds.slice(0, 8);
  if (topSeeds.length === 0) return reasonByShow;

  const [seedVectors, pickVectors, seedShows] = await Promise.all([
    fetchShowVectors(topSeeds.map((seed) => seed.showId)),
    fetchShowVectors(picks.slice(0, 20).map((pick) => pick.showId)),
    db
      .select()
      .from(shows)
      .where(inArray(shows.id, topSeeds.map((seed) => seed.showId))),
  ]);
  const seedTitleById = new Map(seedShows.map((row) => [row.id, row.title]));
  const seedList = topSeeds
    .map((seed) => {
      const vector = seedVectors.get(seed.showId);
      return vector ? { showId: seed.showId, vector, weight: seed.weight } : null;
    })
    .filter((seed): seed is NonNullable<typeof seed> => seed !== null);

  for (const pick of picks.slice(0, 20)) {
    const vector = pickVectors.get(pick.showId);
    if (!vector) continue;
    const attribution = attributeRecommendationToSeed(vector, seedList);
    const title = attribution ? seedTitleById.get(attribution.showId) : null;
    if (title) reasonByShow.set(pick.showId, `Because you watched ${title}`);
  }

  // Facet-based reasons for picks without a strong seed match.
  const facetsByShow = await getFacetsForShows(
    picks.filter((pick) => !reasonByShow.has(pick.showId)).map((pick) => pick.showId),
  );
  const profileFacetKeys = new Set(profile.topFacets.slice(0, 6).map((facet) => facet.key));
  for (const pick of picks) {
    if (reasonByShow.has(pick.showId)) continue;
    const match = (facetsByShow.get(pick.showId) ?? []).find((facet) =>
      profileFacetKeys.has(facet.key),
    );
    const def = match ? facetByKey(match.key) : null;
    if (def) reasonByShow.set(pick.showId, `${def.title} — one of your things`);
  }
  return reasonByShow;
}

export async function getPersonalizedRecommendationsV2(
  userId: string | null | undefined,
  limit: number,
): Promise<PersonalizedItem[] | null> {
  if (!userId) return null;
  const profile = await getTasteProfile(userId);
  if (!profile) return null;

  const exclude = new Set<string>([...profile.seenShowIds, ...profile.negativeShowIds]);
  const matches = await queryVectorCandidates(profile.vector, {
    topK: Math.min(Math.max(limit * 6, 90), 100),
    excludeIds: exclude,
  });
  if (matches.length === 0) return null;

  const showsById = await loadShowsByIds(matches.map((match) => match.showId));
  const facetsById = await getFacetsForShows(matches.map((match) => match.showId));
  const candidates = matches
    .map((match) => {
      const row = showsById.get(match.showId);
      if (!row || !row.posterUrl || !row.title) return null;
      return {
        showId: row.id,
        semanticScore: match.score,
        voteAverage: row.tmdbVoteAverage,
        voteCount: row.tmdbVoteCount,
        popularity: row.tmdbPopularity,
        year: row.year,
        genreIds: row.genreIds,
        facetKeys: (facetsById.get(row.id) ?? []).map((facet) => facet.key),
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);
  if (candidates.length < Math.min(limit, 6)) return null;

  const ranked = rankCandidates(normalizeSemanticScores(candidates), {
    limit,
    diversityStrength: 0.2,
  });
  const reasons = await buildReasons(
    ranked.map((item) => ({ showId: item.showId, reasons: item.reasons })),
    profile,
  );

  return ranked.map((item, index) => {
    const doc = toShowDoc(showsById.get(item.showId))!;
    return {
      _id: item.showId,
      show: {
        ...doc,
        homeScore: Number(item.finalScore.toFixed(4)),
        homeReasons: item.reasons,
      },
      rank: index + 1,
      score: Number(item.finalScore.toFixed(4)),
      homeReasons: item.reasons,
      reason: reasons.get(item.showId) ?? null,
    };
  });
}

// ── Home rails ──────────────────────────────────────────────────────────────

async function facetRailItems(facetKey: string, limit: number, excludeIds: Set<string>) {
  const rows = await db
    .select({ show: shows, facetScore: showFacets.score })
    .from(showFacets)
    .innerJoin(shows, eq(shows.id, showFacets.showId))
    .where(eq(showFacets.facetKey, facetKey))
    .orderBy(desc(showFacets.score))
    .limit(limit * 5);

  return rows
    .filter((row) => row.show.posterUrl && row.show.title && !excludeIds.has(row.show.id))
    .map((row) => ({
      row,
      blended:
        row.facetScore * 0.55 +
        qualityPrior(row.show.tmdbVoteAverage, row.show.tmdbVoteCount) * 0.45,
    }))
    .sort((left, right) => right.blended - left.blended)
    .slice(0, limit)
    .map((entry, index) => {
      const doc = toShowDoc(entry.row.show)!;
      return {
        _id: entry.row.show.id,
        show: { ...doc, homeScore: Number(entry.blended.toFixed(4)), homeReasons: ["taste"] },
        rank: index + 1,
        score: Number(entry.blended.toFixed(4)),
        homeReasons: ["taste"],
      };
    });
}

export async function getHomeRecommendationRailsV2(
  userId: string | null | undefined,
  limitPerRail: number,
) {
  if (!userId) return null;
  const profile = await getTasteProfile(userId);
  if (!profile) return null;

  const rails: Array<{ key: string; title: string; items: unknown[] }> = [];
  const usedShowIds = new Set<string>([...profile.seenShowIds, ...profile.negativeShowIds]);

  const forYou = await getPersonalizedRecommendationsV2(userId, limitPerRail);
  if (forYou && forYou.length > 0) {
    rails.push({ key: "for_you", title: "Picked for you", items: forYou });
    forYou.forEach((item) => usedShowIds.add(item._id));
  }

  for (const facet of profile.topFacets.slice(0, 3)) {
    const def = facetByKey(facet.key);
    if (!def) continue;
    const items = await facetRailItems(facet.key, limitPerRail, usedShowIds);
    if (items.length >= 4) {
      rails.push({ key: `facet:${facet.key}`, title: def.title, items });
      items.forEach((item) => usedShowIds.add(item._id));
    }
    if (rails.length >= 4) break;
  }

  return rails.length > 0 ? rails : null;
}

// ── Smart lists (facet browse) ──────────────────────────────────────────────

const FEATURED_SMART_LIST_FACETS = [
  "prestige-antihero",
  "cozy-crime",
  "mind-bending",
  "feel-good",
  "true-crime-doc",
  "k-drama",
  "high-fantasy",
  "dark-comedy",
  "nordic-noir",
  "gentle-baking",
];

export async function getSmartListsV2(limitPerList: number) {
  const lists: Array<{ key: string; title: string; items: unknown[] }> = [];
  const used = new Set<string>();
  for (const facetKey of FEATURED_SMART_LIST_FACETS) {
    const def = facetByKey(facetKey);
    if (!def) continue;
    const items = await facetRailItems(facetKey, limitPerList, used);
    if (items.length >= 4) {
      lists.push({ key: `facet:${facetKey}`, title: def.title, items: items.map((item) => item.show) });
      items.forEach((item) => used.add(item._id));
    }
    if (lists.length >= 6) break;
  }
  return lists.length > 0 ? lists : null;
}

// Full facet catalog for category browsing surfaces.
export async function getFacetBrowse() {
  const counts = await db
    .select({ facetKey: showFacets.facetKey, showCount: count() })
    .from(showFacets)
    .groupBy(showFacets.facetKey);
  const countByKey = new Map<string, number>(
    counts.map((row) => [row.facetKey, Number(row.showCount)]),
  );
  return Object.entries(FACET_GROUPS).map(([groupKey, group]) => ({
    key: groupKey,
    title: group.title,
    facets: FACET_DEFS.filter((facet) => facet.group === groupKey).map((facet) => ({
      key: facet.key,
      title: facet.title,
      description: facet.description,
      showCount: countByKey.get(facet.key) ?? 0,
    })),
  }));
}

export async function getFacetShows(facetKey: string, limit: number) {
  const def = facetByKey(facetKey);
  if (!def) return null;
  const items = await facetRailItems(facetKey, limit, new Set());
  return { key: def.key, title: def.title, description: def.description, items };
}

// ── Vibe search ─────────────────────────────────────────────────────────────

export async function vibeSearchShows(query: string, limit: number) {
  const matches = await searchShowIdsByVibe(query, Math.min(Math.max(limit * 3, 30), 100));
  if (!matches) return null;
  const showsById = await loadShowsByIds(matches.map((match) => match.showId));
  const results = matches
    .map((match) => {
      const row = showsById.get(match.showId);
      if (!row || !row.posterUrl || !row.title) return null;
      return {
        showId: row.id,
        semanticScore: match.score,
        voteAverage: row.tmdbVoteAverage,
        voteCount: row.tmdbVoteCount,
        popularity: row.tmdbPopularity,
        year: row.year,
        genreIds: row.genreIds,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);
  const ranked = rankCandidates(normalizeSemanticScores(results), {
    limit,
    // Vibe search should honor the query intent more than priors.
    semanticWeight: 0.78,
    diversityStrength: 0.06,
  });
  return ranked.map((item, index) => ({
    _id: item.showId,
    rank: index + 1,
    score: Number(item.finalScore.toFixed(4)),
    show: toShowDoc(showsById.get(item.showId)),
  }));
}

// ── Profile taste experience ────────────────────────────────────────────────

export async function getProfileTasteExperienceV2(
  viewerId: string | null | undefined,
  targetUserId: string,
) {
  const targetProfile = await getTasteProfile(targetUserId);
  if (!targetProfile) return null;

  const topFacets = targetProfile.topFacets
    .map((facet) => ({ def: facetByKey(facet.key), score: facet.score }))
    .filter((entry) => entry.def)
    .slice(0, 6);

  const favoriteSeedIds = targetProfile.positiveSeeds.slice(0, 8).map((seed) => seed.showId);
  const favoriteShows = favoriteSeedIds.length
    ? await db.select().from(shows).where(inArray(shows.id, favoriteSeedIds))
    : [];

  const seedRows = favoriteShows
    .map((row) => toShowDoc(row))
    .filter((doc): doc is NonNullable<typeof doc> => Boolean(doc));

  const genreCounts = new Map<string, number>();
  for (const row of favoriteShows) {
    for (const genre of mapGenreIdsToNames(row.genreIds ?? undefined)) {
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    }
  }
  const topGenres = Array.from(genreCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([genre]) => genre);

  const facetTitles = topFacets.map((entry) => entry.def!.title);
  const tasteSummary =
    facetTitles.length > 0
      ? `Into ${facetTitles.slice(0, 3).join(", ")}${facetTitles.length > 3 ? " and more" : ""}`
      : null;

  let tasteMatch: { percent: number; sharedFavoriteShows: unknown[] } | null = null;
  if (viewerId && viewerId !== targetUserId) {
    const match = await computeTasteMatch(viewerId, targetUserId);
    if (match) {
      tasteMatch = {
        percent: match.percent,
        sharedFavoriteShows: match.sharedShows
          .map((row) => toShowDoc(row))
          .filter((doc): doc is NonNullable<typeof doc> => Boolean(doc)),
      };
    }
  }

  return {
    topGenres,
    topFacets: topFacets.map((entry) => ({
      key: entry.def!.key,
      title: entry.def!.title,
      score: entry.score,
    })),
    favoriteShows: seedRows,
    tasteSummary,
    tasteMatch,
  };
}

// Blend ("For us"): shared recommendations for two people — the mean of
// their taste vectors retrieves candidates, per-person affinities keep the
// picks fair to both, and shows either person has already watched are
// dropped (watchlist survives with a badge — "you both already wanted this"
// is the best possible pick). Pure scoring + prompts live in lib/blend.ts.
//
// Privacy: the partner's taste data is the same class the profile taste-
// match surface exposes, but this endpoint gates it properly — blocked
// either way or private-and-not-followed reads as user_not_found.

import { users } from "../../db/schema";
import {
  blendDisplayName,
  buildBlendExplainPrompt,
  intersectProviderKeys,
  MAX_BLEND_PICKS,
  MIN_BLEND_PICKS,
  scoreBlendCandidates,
  type BlendExplainCandidate,
  type BlendPairCandidate,
} from "../../lib/blend";
import {
  cosineSimilarity,
  mapGenreIdsToNames,
  normalizeVector,
} from "../../lib/plotlist/embeddingUtils";
import { facetByKey } from "../../lib/plotlist/facets";
import {
  normalizeSemanticScores,
  rankCandidates,
  tasteMatchPercent,
} from "../../lib/plotlist/recsRanking";
import {
  loadDetailsByShowId,
  loadShowsByIds,
  loadWatchStatusByShow,
} from "./ask-plotlist";
import { hmacSha256, safeEqual } from "./crypto";
import { getServerEnv } from "./env";
import { ApiError } from "./errors";
import { generateJson } from "./gemini";
import { userHasPro } from "./pro";
import { getProfileAudience, getUserById } from "./privacy";
import { consumeQuota, enforceRateLimit, peekQuota, rateLimitKey } from "./rate-limit";
import {
  getTasteProfile,
  queryVectorCandidates,
  fetchShowVectors,
  vectorsAvailable,
  type TasteProfile,
} from "./recs";

type UserRow = typeof users.$inferSelect;

export type BlendInput = {
  userId: string;
  sessionId?: string;
};

export type BlendPick = {
  showId: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  reason: string;
  providerKeys: string[];
  onSharedService: boolean;
  onViewerWatchlist: boolean;
  onPartnerWatchlist: boolean;
};

export type BlendResult = {
  sessionId: string;
  remaining: number | null;
  partner: {
    id: string;
    name: string;
    username: string | null;
    avatarUrl: string | null;
  };
  percent: number;
  duoLine: string | null;
  sharedFacets: Array<{ key: string; title: string; score: number }>;
  sharedProviders: string[];
  picks: BlendPick[];
};

// ── Sessions + quota ────────────────────────────────────────────────────────
// Same scheme as Ask Plotlist: free users get a monthly budget of blend
// sessions; re-running the same pair inside 15 minutes is free.

const BLEND_SESSION_TTL_MS = 15 * 60 * 1000;
export const BLEND_FREE_SESSIONS_PER_MONTH = 2;
const BLEND_QUOTA_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;

const RETRIEVAL_TOP_K = 100;
// Candidates that get per-person fairness scoring (2 Vectorize getByIds
// calls each way); deeper candidates score by centroid alone.
const FAIRNESS_WINDOW = 60;
const DETAILS_LOAD_LIMIT = 40;
const RANK_LIMIT = 12;
const EXPLAIN_CANDIDATE_LIMIT = 10;
const ANCHOR_TITLE_LIMIT = 6;

function pairKeyOf(userIdA: string, userIdB: string) {
  return [userIdA, userIdB].sort().join(":");
}

type BlendSessionTokenPayload = {
  userId: string;
  pairKey: string;
  purpose: "blend-session";
  exp: number;
};

function signPayload(encodedPayload: string) {
  return hmacSha256(encodedPayload, getServerEnv().JWT_SECRET);
}

export function createBlendSessionToken(
  userId: string,
  pairKey: string,
  now = Date.now(),
) {
  const payload: BlendSessionTokenPayload = {
    userId,
    pairKey,
    purpose: "blend-session",
    exp: now + BLEND_SESSION_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function verifyBlendSessionToken(
  token: string | undefined,
  userId: string,
  pairKey: string,
  now = Date.now(),
): boolean {
  if (!token) return false;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return false;
  if (!safeEqual(signature, signPayload(encodedPayload))) return false;
  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as BlendSessionTokenPayload;
    return (
      payload.purpose === "blend-session" &&
      payload.userId === userId &&
      payload.pairKey === pairKey &&
      typeof payload.exp === "number" &&
      payload.exp > now
    );
  } catch {
    return false;
  }
}

export function blendQuotaKey(userId: string) {
  return rateLimitKey("blend", userId);
}

// ── Pipeline ────────────────────────────────────────────────────────────────

function sharedFacetsOf(viewerProfile: TasteProfile, partnerProfile: TasteProfile) {
  const viewerFacets = new Map(
    viewerProfile.topFacets.map((facet) => [facet.key, facet.score]),
  );
  return partnerProfile.topFacets
    .filter((facet) => viewerFacets.has(facet.key))
    .map((facet) => {
      const def = facetByKey(facet.key);
      if (!def) return null;
      return {
        key: facet.key,
        title: def.title,
        score: Number(
          Math.min(facet.score, viewerFacets.get(facet.key) ?? 0).toFixed(4),
        ),
      };
    })
    .filter((facet): facet is NonNullable<typeof facet> => facet !== null)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
}

async function loadAnchorTitles(
  viewerProfile: TasteProfile,
  partnerProfile: TasteProfile,
) {
  const viewerIds = viewerProfile.positiveSeeds
    .slice(0, ANCHOR_TITLE_LIMIT)
    .map((seed) => seed.showId);
  const partnerIds = partnerProfile.positiveSeeds
    .slice(0, ANCHOR_TITLE_LIMIT)
    .map((seed) => seed.showId);
  const rowsById = await loadShowsByIds([...new Set([...viewerIds, ...partnerIds])]);
  const titlesOf = (ids: string[]) =>
    ids
      .map((showId) => rowsById.get(showId)?.title)
      .filter((title): title is string => Boolean(title));
  return {
    viewerAnchors: titlesOf(viewerIds),
    partnerAnchors: titlesOf(partnerIds),
  };
}

export async function getBlend(viewer: UserRow, input: BlendInput): Promise<BlendResult> {
  const startedAt = Date.now();
  await enforceRateLimit(rateLimitKey("blend-burst", viewer.id), 20, 60_000);

  if (input.userId === viewer.id) {
    throw new ApiError(400, "blend_self", "Pick someone else to blend with");
  }
  const target = await getUserById(input.userId);
  if (!target) {
    throw new ApiError(404, "user_not_found", "User not found");
  }
  // Blocked either way or private-without-follow stays undetectable.
  const audience = await getProfileAudience(viewer.id, target);
  if (!audience.canViewContent) {
    throw new ApiError(404, "user_not_found", "User not found");
  }
  if (!vectorsAvailable()) {
    throw new ApiError(503, "blend_unavailable", "Blends aren't available right now");
  }

  const isPro = userHasPro(viewer);
  const pairKey = pairKeyOf(viewer.id, target.id);
  const hasValidSession = verifyBlendSessionToken(input.sessionId, viewer.id, pairKey);
  let remaining: number | null = null;
  if (!isPro) {
    if (hasValidSession) {
      const peeked = await peekQuota(blendQuotaKey(viewer.id), BLEND_FREE_SESSIONS_PER_MONTH);
      remaining = peeked.remaining;
    } else {
      const quota = await consumeQuota(
        blendQuotaKey(viewer.id),
        BLEND_FREE_SESSIONS_PER_MONTH,
        BLEND_QUOTA_WINDOW_MS,
      );
      if (!quota.allowed) {
        throw new ApiError(
          403,
          "blend_quota_exceeded",
          "You've used this month's free blends",
        );
      }
      remaining = quota.remaining;
    }
  }
  const sessionId = hasValidSession
    ? input.sessionId!
    : createBlendSessionToken(viewer.id, pairKey);

  const [viewerProfile, partnerProfile] = await Promise.all([
    getTasteProfile(viewer.id),
    getTasteProfile(target.id),
  ]);
  if (!viewerProfile) {
    throw new ApiError(
      422,
      "blend_viewer_no_history",
      "Log a few shows first so the blend knows your taste",
    );
  }
  if (!partnerProfile) {
    throw new ApiError(
      422,
      "blend_partner_no_history",
      "They haven't logged enough shows yet",
    );
  }

  const partnerName = blendDisplayName(target);
  const viewerName = blendDisplayName(viewer);
  const percent = tasteMatchPercent(
    cosineSimilarity(viewerProfile.vector, partnerProfile.vector),
  );
  const sharedFacets = sharedFacetsOf(viewerProfile, partnerProfile);
  const sharedProviders = intersectProviderKeys(
    viewer.streamingProviders,
    target.streamingProviders,
  );

  // Retrieve around the midpoint of the two tastes, then post-filter — the
  // house rule: no Vectorize metadata filters, no absolute score thresholds.
  const blendVector = normalizeVector(
    viewerProfile.vector.map((value, index) => (value + partnerProfile.vector[index]) / 2),
  );
  const matches = await queryVectorCandidates(blendVector, { topK: RETRIEVAL_TOP_K });
  if (matches.length === 0) {
    return {
      sessionId,
      remaining,
      partner: partnerPayload(target, partnerName),
      percent,
      duoLine: null,
      sharedFacets,
      sharedProviders,
      picks: [],
    };
  }

  const matchIds = matches.map((match) => match.showId);
  const [showsById, viewerStatusByShow, partnerStatusByShow] = await Promise.all([
    loadShowsByIds(matchIds),
    loadWatchStatusByShow(viewer.id, matchIds),
    loadWatchStatusByShow(target.id, matchIds),
  ]);

  // "Neither has watched": anything either person has touched beyond a
  // watchlist entry is out; watchlist items stay in and get badged.
  const watchedBeyondWatchlist = (showId: string) => {
    const viewerStatus = viewerStatusByShow.get(showId);
    const partnerStatus = partnerStatusByShow.get(showId);
    if (viewerStatus && viewerStatus !== "watchlist") return true;
    if (partnerStatus && partnerStatus !== "watchlist") return true;
    // Reviews/diary entries without a watch state still count as seen.
    if (viewerProfile.seenShowIds.has(showId) && viewerStatus !== "watchlist") return true;
    if (partnerProfile.seenShowIds.has(showId) && partnerStatus !== "watchlist") return true;
    return false;
  };
  const surviving = matches.filter((match) => {
    const row = showsById.get(match.showId);
    if (!row || !row.posterUrl || !row.title) return false;
    return !watchedBeyondWatchlist(match.showId);
  });

  // Fairness: score the top window by each person's own affinity so a pick
  // that thrills one and bores the other sinks.
  const fairnessIds = surviving.slice(0, FAIRNESS_WINDOW).map((match) => match.showId);
  const showVectors = await fetchShowVectors(fairnessIds);
  const pairCandidates: BlendPairCandidate[] = surviving.map((match) => {
    const vector = showVectors.get(match.showId);
    return {
      showId: match.showId,
      centroidScore: match.score,
      simViewer: vector ? cosineSimilarity(viewerProfile.vector, vector) : null,
      simPartner: vector ? cosineSimilarity(partnerProfile.vector, vector) : null,
    };
  });
  const fairScoreByShow = new Map(
    scoreBlendCandidates(pairCandidates).map((entry) => [entry.showId, entry.semanticScore]),
  );

  const detailRows = surviving
    .slice(0, DETAILS_LOAD_LIMIT)
    .map((match) => showsById.get(match.showId)!);
  const detailsByShowId = await loadDetailsByShowId(detailRows);
  const sharedProviderSet = new Set(sharedProviders);
  const onSharedService = (showId: string) =>
    (detailsByShowId.get(showId)?.providerKeys ?? []).some((key) =>
      sharedProviderSet.has(key),
    );

  const normalized = normalizeSemanticScores(
    surviving.map((match) => {
      const row = showsById.get(match.showId)!;
      return {
        showId: match.showId,
        semanticScore: fairScoreByShow.get(match.showId) ?? 0,
        voteAverage: row.tmdbVoteAverage,
        voteCount: row.tmdbVoteCount,
        popularity: row.tmdbPopularity,
        year: row.year,
        genreIds: row.genreIds,
      };
    }),
  ).map((candidate) => {
    // "You both already wanted this" and "you can both stream it tonight"
    // are real-world wins the vectors can't see.
    let boost = 0;
    if (viewerStatusByShow.get(candidate.showId) === "watchlist") boost += 0.05;
    if (partnerStatusByShow.get(candidate.showId) === "watchlist") boost += 0.05;
    if (sharedProviderSet.size > 0 && onSharedService(candidate.showId)) boost += 0.05;
    return boost > 0
      ? { ...candidate, semanticScore: candidate.semanticScore + boost }
      : candidate;
  });
  const ranked = rankCandidates(normalized, {
    limit: RANK_LIMIT,
    semanticWeight: 0.78,
    diversityStrength: 0.1,
  });

  // Explain: reasons that speak to both tastes. LLM flakiness degrades to a
  // templated reason — never a 500.
  const explainCandidates: BlendExplainCandidate[] = ranked
    .slice(0, EXPLAIN_CANDIDATE_LIMIT)
    .map((item) => {
      const row = showsById.get(item.showId)!;
      return {
        showId: item.showId,
        title: row.title,
        year: row.year,
        genres: mapGenreIdsToNames(row.genreIds ?? undefined).slice(0, 3),
        overview: row.overview,
        onViewerWatchlist: viewerStatusByShow.get(item.showId) === "watchlist",
        onPartnerWatchlist: partnerStatusByShow.get(item.showId) === "watchlist",
      };
    });
  const candidateIds = new Set(explainCandidates.map((candidate) => candidate.showId));

  let duoLine: string | null = null;
  let orderedPicks: Array<{ showId: string; reason: string }> = [];
  if (explainCandidates.length > 0) {
    try {
      const { viewerAnchors, partnerAnchors } = await loadAnchorTitles(
        viewerProfile,
        partnerProfile,
      );
      const explained = await generateJson<{
        duoLine?: string;
        picks: Array<{ showId: string; reason: string }>;
      }>(
        buildBlendExplainPrompt({
          viewerName,
          partnerName,
          viewerAnchors,
          partnerAnchors,
          sharedFacetTitles: sharedFacets.map((facet) => facet.title),
          candidates: explainCandidates,
        }),
      );
      duoLine =
        typeof explained.duoLine === "string" && explained.duoLine.trim().length > 0
          ? explained.duoLine.trim().slice(0, 160)
          : null;
      orderedPicks = (explained.picks ?? [])
        .filter(
          (pick) =>
            candidateIds.has(pick.showId) &&
            typeof pick.reason === "string" &&
            pick.reason.trim().length > 0,
        )
        .slice(0, MAX_BLEND_PICKS);
    } catch (error) {
      console.warn("[blend] explain failed; falling back to ranked picks", error);
    }
  }
  if (orderedPicks.length < MIN_BLEND_PICKS) {
    const already = new Set(orderedPicks.map((pick) => pick.showId));
    for (const item of ranked) {
      if (orderedPicks.length >= MAX_BLEND_PICKS) break;
      if (already.has(item.showId)) continue;
      orderedPicks.push({
        showId: item.showId,
        reason: `Squarely where your taste and ${partnerName}'s overlap`,
      });
    }
  }

  const picks: BlendPick[] = orderedPicks.map((pick) => {
    const row = showsById.get(pick.showId)!;
    return {
      showId: pick.showId,
      title: row.title,
      year: row.year ?? null,
      posterUrl: row.posterUrl ?? null,
      reason: pick.reason.trim(),
      providerKeys: detailsByShowId.get(pick.showId)?.providerKeys ?? [],
      onSharedService: onSharedService(pick.showId),
      onViewerWatchlist: viewerStatusByShow.get(pick.showId) === "watchlist",
      onPartnerWatchlist: partnerStatusByShow.get(pick.showId) === "watchlist",
    };
  });

  console.info(
    "[blend] done",
    `pair=${pairKey}`,
    `candidates=${surviving.length}`,
    `picks=${picks.length}`,
    `percent=${percent}`,
    `ms=${Date.now() - startedAt}`,
    `pro=${isPro}`,
  );
  return {
    sessionId,
    remaining,
    partner: partnerPayload(target, partnerName),
    percent,
    duoLine,
    sharedFacets,
    sharedProviders,
    picks,
  };
}

function partnerPayload(target: UserRow, partnerName: string) {
  return {
    id: target.id,
    name: partnerName,
    username: target.username ?? null,
    avatarUrl: target.avatarUrl ?? null,
  };
}

// Read-only status for the "N free blends left" pill.
export async function getBlendStatus(user: UserRow) {
  if (userHasPro(user)) {
    return { isPro: true, remaining: null };
  }
  const { remaining } = await peekQuota(
    blendQuotaKey(user.id),
    BLEND_FREE_SESSIONS_PER_MONTH,
  );
  return { isPro: false, remaining };
}

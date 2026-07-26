// Ask Plotlist pipeline: parse → retrieve → filter → explain. The pure logic
// (chip mapping, constraint filters, prompts) lives in lib/askPlotlist.ts;
// this module owns data access, the LLM calls, quota, and session tokens.
// See docs/ask-plotlist-v1-plan.md.

import { and, desc, eq, gte, inArray } from "drizzle-orm";

import { reviews, shows, tmdbDetailsCache, users, watchStates } from "../../db/schema";
import {
  applyConstraintFilters,
  applyRefinement,
  ASK_MOOD_CHIPS,
  ASK_TIME_CHIPS,
  buildAskQueryFromChips,
  buildExplainPrompt,
  buildParsePrompt,
  mergeParsedConstraints,
  REFINEMENT_CHIPS,
  type AskCandidate,
  type AskChips,
  type AskConstraints,
  type ExplainCandidate,
  type TasteAnchor,
} from "../../lib/askPlotlist";
import { mapGenreIdsToNames } from "../../lib/plotlist/embeddingUtils";
import {
  normalizeSemanticScores,
  rankCandidates,
} from "../../lib/plotlist/recsRanking";
import { extractShowRuntimeMinutes } from "../../lib/watchInsights";
import { hmacSha256, safeEqual } from "./crypto";
import { db } from "./db";
import { getServerEnv } from "./env";
import { ApiError } from "./errors";
import { embedText, generateJson } from "./gemini";
import { userHasPro } from "./pro";
import { consumeQuota, enforceRateLimit, peekQuota, rateLimitKey } from "./rate-limit";
import { queryVectorCandidates } from "./recs";
import { chunkForSqlParams } from "./sql-dialect";
import { extractProviderKeys } from "./streaming-arrivals";

type UserRow = typeof users.$inferSelect;

export type AskInput = {
  text?: string;
  chips?: AskChips;
  refinement?: string;
  sessionId?: string;
  excludeShowIds?: string[];
};

export type AskPick = {
  showId: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  reason: string;
  onWatchlist: boolean;
  providerKeys: string[];
};

export type AskResult = {
  sessionId: string;
  picks: AskPick[];
  remaining: number | null;
  // Echoed back so "Save this vibe" can persist the exact parsed query
  // without a second LLM parse. Old clients ignore these.
  constraints: AskConstraints;
  displayQuery: string;
};

// ── Sessions + quota ────────────────────────────────────────────────────────
// A session = the initial ask plus unlimited refinements for 15 minutes.
// Stateless HMAC token, same signing scheme as the calendar feed token but
// with an expiry.

const ASK_SESSION_TTL_MS = 15 * 60 * 1000;
export const ASK_FREE_SESSIONS_PER_MONTH = 3;
const ASK_QUOTA_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;

type AskSessionTokenPayload = {
  userId: string;
  purpose: "ask-session";
  exp: number;
};

function signPayload(encodedPayload: string) {
  return hmacSha256(encodedPayload, getServerEnv().JWT_SECRET);
}

export function createAskSessionToken(userId: string, now = Date.now()) {
  const payload: AskSessionTokenPayload = {
    userId,
    purpose: "ask-session",
    exp: now + ASK_SESSION_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

// Returns true only for a well-signed, unexpired token belonging to this
// user. Invalid tokens are not an error — the ask just costs a session.
export function verifyAskSessionToken(
  token: string | undefined,
  userId: string,
  now = Date.now(),
): boolean {
  if (!token) return false;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return false;
  if (!safeEqual(signature, signPayload(encodedPayload))) return false;
  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as AskSessionTokenPayload;
    return (
      payload.purpose === "ask-session" &&
      payload.userId === userId &&
      typeof payload.exp === "number" &&
      payload.exp > now
    );
  } catch {
    return false;
  }
}

export function askQuotaKey(userId: string) {
  return rateLimitKey("ask", userId);
}

// ── Context loading ─────────────────────────────────────────────────────────

const RETRIEVAL_TOP_K = 80;
const DETAILS_LOAD_LIMIT = 40;
const EXPLAIN_CANDIDATE_LIMIT = 12;
const TASTE_ANCHOR_LIMIT = 12;
const MIN_LLM_PICKS = 3;
const MAX_PICKS = 6;

export async function loadShowsByIds(ids: string[]) {
  const byId = new Map<string, typeof shows.$inferSelect>();
  for (const chunk of chunkForSqlParams(ids, 1)) {
    const rows = await db.select().from(shows).where(inArray(shows.id, chunk));
    for (const row of rows) byId.set(row.id, row);
  }
  return byId;
}

async function loadWatchStatusByShow(userId: string, showIds: string[]) {
  const byShow = new Map<string, string>();
  for (const chunk of chunkForSqlParams(showIds, 1)) {
    const rows = await db
      .select({ showId: watchStates.showId, status: watchStates.status })
      .from(watchStates)
      .where(and(eq(watchStates.userId, userId), inArray(watchStates.showId, chunk)));
    for (const row of rows) byShow.set(row.showId, row.status);
  }
  return byShow;
}

export type ShowDetails = {
  episodeRunTimeMinutes: number | null;
  status: string | null;
  providerKeys: string[];
};

export async function loadDetailsByShowId(
  showRows: Array<typeof shows.$inferSelect>,
): Promise<Map<string, ShowDetails>> {
  const byShowId = new Map<string, ShowDetails>();
  const tmdbRows = showRows.filter((row) => row.externalSource === "tmdb");
  const showByExternalId = new Map(tmdbRows.map((row) => [row.externalId, row]));
  for (const chunk of chunkForSqlParams(tmdbRows.map((row) => row.externalId), 1)) {
    const rows = await db
      .select({
        externalId: tmdbDetailsCache.externalId,
        payload: tmdbDetailsCache.payload,
      })
      .from(tmdbDetailsCache)
      .where(
        and(
          eq(tmdbDetailsCache.externalSource, "tmdb"),
          inArray(tmdbDetailsCache.externalId, chunk),
        ),
      );
    for (const row of rows) {
      const show = showByExternalId.get(row.externalId);
      if (!show) continue;
      const payload = row.payload as any;
      byShowId.set(show.id, {
        episodeRunTimeMinutes: extractShowRuntimeMinutes(payload),
        status: typeof payload?.status === "string" ? payload.status : null,
        providerKeys: extractProviderKeys(payload),
      });
    }
  }
  return byShowId;
}

// Up to 12 grounding titles: favorites ∪ shows reviewed ≥ 4.5 ∪ most-recent
// finished shows. These make the reasons personal instead of generic.
async function loadTasteAnchors(user: UserRow): Promise<TasteAnchor[]> {
  const yearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const [reviewRows, finishedRows] = await Promise.all([
    db
      .select({ showId: reviews.showId, rating: reviews.rating })
      .from(reviews)
      .where(and(eq(reviews.authorId, user.id), gte(reviews.rating, 4.5)))
      .orderBy(desc(reviews.createdAt))
      .limit(TASTE_ANCHOR_LIMIT),
    db
      .select({ showId: watchStates.showId })
      .from(watchStates)
      .where(
        and(
          eq(watchStates.userId, user.id),
          eq(watchStates.status, "finished"),
          gte(watchStates.updatedAt, yearAgo),
        ),
      )
      .orderBy(desc(watchStates.updatedAt))
      .limit(TASTE_ANCHOR_LIMIT),
  ]);

  const notes = new Map<string, string>();
  for (const favoriteId of user.favoriteShowIds ?? []) {
    if (!notes.has(favoriteId)) notes.set(favoriteId, "an all-time favorite");
  }
  for (const row of reviewRows) {
    if (!notes.has(row.showId)) notes.set(row.showId, `rated ${row.rating} stars`);
  }
  for (const row of finishedRows) {
    if (!notes.has(row.showId)) notes.set(row.showId, "recently finished");
  }

  const anchorIds = [...notes.keys()].slice(0, TASTE_ANCHOR_LIMIT);
  if (anchorIds.length === 0) return [];
  const showsById = await loadShowsByIds(anchorIds);
  return anchorIds
    .map((showId) => {
      const row = showsById.get(showId);
      return row ? { title: row.title, note: notes.get(showId)! } : null;
    })
    .filter((anchor): anchor is TasteAnchor => anchor !== null);
}

// ── Pipeline ────────────────────────────────────────────────────────────────

function chipLabels(chips: AskChips | undefined) {
  const time = ASK_TIME_CHIPS.find((chip) => chip.id === chips?.time)?.label;
  const mood = ASK_MOOD_CHIPS.find((chip) => chip.id === chips?.mood)?.label;
  return { time, mood };
}

async function composeConstraints(user: UserRow, input: AskInput) {
  const freeText = input.text?.trim() || null;
  const { constraints: chipConstraints } = buildAskQueryFromChips({
    time: input.chips?.time ?? null,
    mood: input.chips?.mood ?? null,
    freeText,
    onMyServices: input.chips?.onMyServices,
  });

  let constraints = chipConstraints;
  if (freeText) {
    // Only free text needs the LLM parse; chips are already structured.
    try {
      const parsed = await generateJson<Partial<AskConstraints>>(
        buildParsePrompt(freeText),
      );
      console.info("[ask] parse", JSON.stringify(parsed).slice(0, 400));
      constraints = mergeParsedConstraints(chipConstraints, parsed);
    } catch (error) {
      console.warn("[ask] parse failed; using raw text", error);
    }
  }

  if (input.refinement && REFINEMENT_CHIPS[input.refinement]) {
    let firstPickTitle: string | null = null;
    const firstExcludeId = input.excludeShowIds?.[0];
    if (input.refinement === "more_like_1" && firstExcludeId) {
      const rows = await db
        .select({ title: shows.title })
        .from(shows)
        .where(eq(shows.id, firstExcludeId))
        .limit(1);
      firstPickTitle = rows[0]?.title ?? null;
    }
    constraints = applyRefinement(constraints, input.refinement, { firstPickTitle });
    // "More like #1" should still be allowed to resurface close neighbors of
    // the pick itself, but never the previous picks verbatim — exclusions
    // below handle that.
  }
  return constraints;
}

export async function askPlotlist(user: UserRow, input: AskInput): Promise<AskResult> {
  const startedAt = Date.now();
  const isPro = userHasPro(user);

  // Abuse limit for everyone, quota only for free users. A valid unexpired
  // session token (refinements) never consumes a session.
  await enforceRateLimit(rateLimitKey("ask-burst", user.id), 30, 60_000);
  const hasValidSession = verifyAskSessionToken(input.sessionId, user.id);
  let remaining: number | null = null;
  if (!isPro) {
    if (hasValidSession) {
      const peeked = await peekQuota(askQuotaKey(user.id), ASK_FREE_SESSIONS_PER_MONTH);
      remaining = peeked.remaining;
    } else {
      const quota = await consumeQuota(
        askQuotaKey(user.id),
        ASK_FREE_SESSIONS_PER_MONTH,
        ASK_QUOTA_WINDOW_MS,
      );
      if (!quota.allowed) {
        throw new ApiError(
          403,
          "ask_quota_exceeded",
          "You've used this month's free asks",
        );
      }
      remaining = quota.remaining;
    }
  }
  const sessionId = hasValidSession
    ? input.sessionId!
    : createAskSessionToken(user.id);

  const constraints = await composeConstraints(user, input);
  const { time: timeLabel, mood: moodLabel } = chipLabels(input.chips);
  const displayQuery =
    input.text?.trim() ||
    [moodLabel, timeLabel].filter(Boolean).join(" · ") ||
    "tonight";

  // Retrieve: embed the query and pull a wide candidate pool. Vectorize
  // metadata filters aren't assumed — everything is post-filtered here.
  const vector = await embedText(constraints.semanticQuery, {
    taskType: "RETRIEVAL_QUERY",
  });
  const excludeIds = new Set(input.excludeShowIds ?? []);
  const matches = (
    await queryVectorCandidates(vector, { topK: RETRIEVAL_TOP_K })
  ).filter((match) => !excludeIds.has(match.showId));
  console.info(
    "[ask] retrieve",
    `query="${constraints.semanticQuery.slice(0, 120)}"`,
    `candidates=${matches.length}`,
  );
  if (matches.length === 0) {
    return { sessionId, picks: [], remaining, constraints, displayQuery };
  }

  // Load context: show rows + the user's watch states for the pool.
  const [showsById, statusByShow, tasteAnchors] = await Promise.all([
    loadShowsByIds(matches.map((match) => match.showId)),
    loadWatchStatusByShow(user.id, matches.map((match) => match.showId)),
    loadTasteAnchors(user),
  ]);

  // Already-watched shows never come back; watchlist items stay (with badge).
  const surviving = matches.filter((match) => {
    const row = showsById.get(match.showId);
    if (!row || !row.posterUrl || !row.title) return false;
    const status = statusByShow.get(match.showId);
    return status === undefined || status === "watchlist";
  });

  // TMDB payloads are large, so only the top slice gets runtime/status/
  // provider metadata; deeper candidates pass unknown-metadata filters.
  const detailRows = surviving
    .slice(0, DETAILS_LOAD_LIMIT)
    .map((match) => showsById.get(match.showId)!);
  const detailsByShowId = await loadDetailsByShowId(detailRows);

  const candidatePool: Array<AskCandidate & { semanticScore: number }> =
    surviving.map((match) => {
      const row = showsById.get(match.showId)!;
      const details = detailsByShowId.get(match.showId);
      return {
        showId: match.showId,
        semanticScore: match.score,
        year: row.year,
        episodeRunTimeMinutes: details?.episodeRunTimeMinutes ?? null,
        status: details?.status ?? null,
        providerKeys: details ? details.providerKeys : null,
        onWatchlist: statusByShow.get(match.showId) === "watchlist",
        text: `${row.title} ${row.overview ?? ""}`,
      };
    });

  const filtered = applyConstraintFilters(
    candidatePool,
    constraints,
    user.streamingProviders ?? [],
  ) as Array<AskCandidate & { semanticScore: number }>;
  console.info(
    "[ask] filter",
    `surviving=${surviving.length}`,
    `filtered=${filtered.length}`,
  );

  // Rank exactly like vibe search (query intent first), with a modest boost
  // for watchlist items in Tonight mode — tonight is when "you already said
  // you wanted this" matters most.
  const tonightMode = !input.text?.trim();
  const normalized = normalizeSemanticScores(
    filtered.map((candidate) => {
      const row = showsById.get(candidate.showId)!;
      return {
        showId: candidate.showId,
        semanticScore: candidate.semanticScore,
        voteAverage: row.tmdbVoteAverage,
        voteCount: row.tmdbVoteCount,
        popularity: row.tmdbPopularity,
        year: row.year,
        genreIds: row.genreIds,
      };
    }),
  ).map((candidate) => {
    const onWatchlist = statusByShow.get(candidate.showId) === "watchlist";
    return tonightMode && onWatchlist
      ? { ...candidate, semanticScore: candidate.semanticScore + 0.06 }
      : candidate;
  });
  const ranked = rankCandidates(normalized, {
    limit: EXPLAIN_CANDIDATE_LIMIT,
    semanticWeight: 0.78,
    diversityStrength: 0.06,
  });

  // Explain: reasons grounded in the viewer's taste anchors. Any LLM
  // flakiness degrades to ranked picks with a templated reason — the
  // endpoint never 500s because a model had a bad day.
  const explainCandidates: ExplainCandidate[] = ranked.map((item) => {
    const row = showsById.get(item.showId)!;
    return {
      showId: item.showId,
      title: row.title,
      year: row.year,
      genres: mapGenreIdsToNames(row.genreIds ?? undefined).slice(0, 3),
      overview: row.overview,
      onWatchlist: statusByShow.get(item.showId) === "watchlist",
    };
  });

  const candidateIds = new Set(ranked.map((item) => item.showId));
  let orderedPicks: Array<{ showId: string; reason: string }> = [];
  if (ranked.length > 0) {
    try {
      const explained = await generateJson<{
        picks: Array<{ showId: string; reason: string }>;
      }>(
        buildExplainPrompt({
          query: displayQuery,
          constraints,
          tasteAnchors,
          candidates: explainCandidates,
        }),
      );
      orderedPicks = (explained.picks ?? [])
        .filter(
          (pick) =>
            candidateIds.has(pick.showId) &&
            typeof pick.reason === "string" &&
            pick.reason.trim().length > 0,
        )
        .slice(0, MAX_PICKS);
    } catch (error) {
      console.warn("[ask] explain failed; falling back to ranked picks", error);
    }
  }
  if (orderedPicks.length < MIN_LLM_PICKS) {
    const already = new Set(orderedPicks.map((pick) => pick.showId));
    for (const item of ranked) {
      if (orderedPicks.length >= Math.min(MAX_PICKS, 5)) break;
      if (already.has(item.showId)) continue;
      orderedPicks.push({
        showId: item.showId,
        reason: `Close match for “${displayQuery}”`,
      });
    }
  }

  const picks: AskPick[] = orderedPicks.map((pick) => {
    const row = showsById.get(pick.showId)!;
    const details = detailsByShowId.get(pick.showId);
    return {
      showId: pick.showId,
      title: row.title,
      year: row.year ?? null,
      posterUrl: row.posterUrl ?? null,
      reason: pick.reason.trim(),
      onWatchlist: statusByShow.get(pick.showId) === "watchlist",
      providerKeys: details?.providerKeys ?? [],
    };
  });

  console.info(
    "[ask] done",
    `picks=${picks.length}`,
    `ms=${Date.now() - startedAt}`,
    `pro=${isPro}`,
    `session=${hasValidSession ? "reused" : "new"}`,
  );
  return { sessionId, picks, remaining, constraints, displayQuery };
}

// Read-only status for the "N free asks left" pill.
export async function getAskStatus(user: UserRow) {
  if (userHasPro(user)) {
    return { isPro: true, remaining: null };
  }
  const { remaining } = await peekQuota(
    askQuotaKey(user.id),
    ASK_FREE_SESSIONS_PER_MONTH,
  );
  return { isPro: false, remaining };
}

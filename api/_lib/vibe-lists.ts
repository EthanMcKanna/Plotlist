// Smart Lists ("saved vibes"): a list whose membership is generated from a
// saved Ask Plotlist query. Creation seeds the strongest matches, the hourly
// cron appends new matches as freshly-ingested shows get embedded, and the
// streaming-arrivals cron cross-references arrivals against smart-list
// membership for "a show matching your vibe just hit Netflix" alerts.
// Pure rules (title derivation, membership diffing, caps) live in
// lib/vibeLists.ts so they stay unit-testable.

import { and, asc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";

import { listItems, lists, showNotificationMutes, users, watchStates } from "../../db/schema";
import { applyConstraintFilters, type AskCandidate, type AskConstraints } from "../../lib/askPlotlist";
import {
  buildVibeArrivalNotificationContent,
  buildVibeDigestNotificationContent,
  resolveNotificationPreferences,
} from "../../lib/notificationContent";
import {
  normalizeSemanticScores,
  rankCandidates,
} from "../../lib/plotlist/recsRanking";
import { STREAMING_PROVIDER_OPTIONS } from "../../lib/streamingProviders";
import {
  VIBE_LIST_MAX_ITEMS,
  VIBE_LIST_REFRESH_BATCH_LIMIT,
  VIBE_LIST_REFRESH_STALE_MS,
  VIBE_LIST_SEED_LIMIT,
  computeVibeListAdditions,
  deriveVibeListTitle,
} from "../../lib/vibeLists";
import { loadDetailsByShowId, loadShowsByIds } from "./ask-plotlist";
import { db } from "./db";
import { ApiError } from "./errors";
import { embedText } from "./gemini";
import { createId } from "./ids";
import { moderateText } from "./moderation";
import { createNotificationsAndPush, type NotificationInput } from "./notifications";
import { requirePro, userHasPro } from "./pro";
import { queryVectorCandidates, vectorsAvailable } from "./recs";
import { chunkForSqlParams } from "./sql-dialect";

const PROVIDER_LABEL_BY_KEY = new Map(
  STREAMING_PROVIDER_OPTIONS.map((option) => [option.key, option.label] as const),
);

const VIBE_RETRIEVAL_TOP_K = 80;
const VIBE_DETAILS_LIMIT = 40;

type UserRow = typeof users.$inferSelect;
type ListRow = typeof lists.$inferSelect;
type ShowRow = Awaited<ReturnType<typeof loadShowsByIds>> extends Map<string, infer T>
  ? T
  : never;

// Rank the catalog against a stored vibe vector, mirroring the Ask pipeline
// (same weights) minus the personal watched-filter — a list is a collection,
// not a "watch tonight" pick, so membership stays stable across viewers.
async function computeVibeMatches(args: {
  vector: number[];
  constraints: AskConstraints;
  ownerProviderKeys: string[] | null;
  limit: number;
}): Promise<{ rankedShowIds: string[]; showsById: Map<string, ShowRow> }> {
  const empty = { rankedShowIds: [], showsById: new Map<string, ShowRow>() };
  if (args.vector.length === 0) return empty;
  const matches = await queryVectorCandidates(args.vector, {
    topK: VIBE_RETRIEVAL_TOP_K,
  });
  if (matches.length === 0) return empty;

  const showsById = await loadShowsByIds(matches.map((match) => match.showId));
  const surviving = matches.filter((match) => {
    const row = showsById.get(match.showId);
    return Boolean(row && row.posterUrl && row.title);
  });
  const detailRows = surviving
    .slice(0, VIBE_DETAILS_LIMIT)
    .map((match) => showsById.get(match.showId)!);
  const detailsByShowId = await loadDetailsByShowId(detailRows);

  const pool: Array<AskCandidate & { semanticScore: number }> = surviving.map(
    (match) => {
      const row = showsById.get(match.showId)!;
      const details = detailsByShowId.get(match.showId);
      return {
        showId: match.showId,
        semanticScore: match.score,
        year: row.year,
        episodeRunTimeMinutes: details?.episodeRunTimeMinutes ?? null,
        status: details?.status ?? null,
        providerKeys: details ? details.providerKeys : null,
        onWatchlist: false,
        text: `${row.title} ${row.overview ?? ""}`,
      };
    },
  );
  const filtered = applyConstraintFilters(
    pool,
    args.constraints,
    args.ownerProviderKeys ?? [],
  ) as Array<AskCandidate & { semanticScore: number }>;

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
  );
  const ranked = rankCandidates(normalized, {
    limit: args.limit,
    semanticWeight: 0.78,
    diversityStrength: 0.06,
  });
  return { rankedShowIds: ranked.map((item) => item.showId), showsById };
}

async function appendListItems(listId: string, showIds: string[], now: number) {
  if (showIds.length === 0) return;
  const maxRows = await db
    .select({ max: sql<number | null>`max(${listItems.position})` })
    .from(listItems)
    .where(eq(listItems.listId, listId));
  let position = maxRows[0]?.max ?? 0;
  const rows = showIds.map((showId) => {
    position += 1;
    return {
      id: createId("listitem"),
      listId,
      showId,
      position,
      addedAt: now,
    };
  });
  for (const chunk of chunkForSqlParams(rows, 5)) {
    await db.insert(listItems).values(chunk).onConflictDoNothing();
  }
}

// "Save this vibe": create a private smart list seeded with the current top
// matches. Pro-only — this is what makes unlimited Ask feel like a system.
export async function createVibeList(
  user: UserRow,
  input: { query: string; constraints: AskConstraints; title?: string | null },
): Promise<{ listId: string; added: number; title: string }> {
  requirePro(user);
  if (!vectorsAvailable()) {
    throw new ApiError(503, "vibe_search_unavailable", "Vibe search is unavailable");
  }
  const query = input.query.replace(/\s+/g, " ").trim();
  const title = input.title?.trim() || deriveVibeListTitle(query);
  await moderateText("list", [title, query]);

  const semanticQuery = input.constraints.semanticQuery?.trim() || query;
  const constraints: AskConstraints = { ...input.constraints, semanticQuery };
  const vector = await embedText(semanticQuery, { taskType: "RETRIEVAL_QUERY" });
  const { rankedShowIds } = await computeVibeMatches({
    vector,
    constraints,
    ownerProviderKeys: user.streamingProviders ?? null,
    limit: VIBE_LIST_SEED_LIMIT,
  });

  const now = Date.now();
  const listId = createId("list");
  await db.insert(lists).values({
    id: listId,
    ownerId: user.id,
    title,
    description: null,
    // Private by default — a saved vibe is personal; owners can flip it
    // public later through the normal edit flow.
    isPublic: false,
    commentsEnabled: true,
    vibeQuery: query,
    vibeConstraints: constraints,
    vibeVector: vector,
    vibeRefreshedAt: now,
    vibeExcludedShowIds: [],
    vibeAlertsEnabled: true,
    createdAt: now,
    updatedAt: now,
  });
  await appendListItems(listId, rankedShowIds, now);
  console.info(
    "[vibe-list] created",
    `list=${listId}`,
    `query="${query.slice(0, 80)}"`,
    `seeded=${rankedShowIds.length}`,
  );
  return { listId, added: rankedShowIds.length, title };
}

// Hourly cron tick: re-run each stale smart list's retrieval and append new
// matches (never removes; owner removals are remembered as exclusions). Sends
// at most one "N new shows match your vibe" digest per list per day.
export async function runVibeListRefreshTick(
  now = Date.now(),
  limit = VIBE_LIST_REFRESH_BATCH_LIMIT,
) {
  if (!vectorsAvailable()) {
    return { skipped: "vectorize_unavailable", refreshed: 0, added: 0 };
  }
  const staleBefore = now - VIBE_LIST_REFRESH_STALE_MS;
  const staleLists = await db
    .select()
    .from(lists)
    .where(
      and(
        isNotNull(lists.vibeQuery),
        or(isNull(lists.vibeRefreshedAt), lt(lists.vibeRefreshedAt, staleBefore)),
      ),
    )
    .orderBy(asc(lists.vibeRefreshedAt))
    .limit(limit);
  if (staleLists.length === 0) {
    return { refreshed: 0, added: 0 };
  }

  const ownerIds = Array.from(new Set(staleLists.map((list) => list.ownerId)));
  const ownerById = new Map<string, UserRow>();
  for (const chunk of chunkForSqlParams(ownerIds, 1)) {
    for (const row of await db.select().from(users).where(inArray(users.id, chunk))) {
      ownerById.set(row.id, row);
    }
  }

  let totalAdded = 0;
  const notificationInputs: NotificationInput[] = [];
  for (const list of staleLists) {
    const owner = ownerById.get(list.ownerId) ?? null;
    const constraints = (list.vibeConstraints ?? null) as AskConstraints | null;
    const vector = list.vibeVector ?? [];
    try {
      if (!constraints || vector.length === 0) {
        // Malformed saved vibe — mark refreshed so it doesn't hot-loop.
        await db
          .update(lists)
          .set({ vibeRefreshedAt: now })
          .where(eq(lists.id, list.id));
        continue;
      }
      const { rankedShowIds, showsById } = await computeVibeMatches({
        vector,
        constraints,
        ownerProviderKeys: owner?.streamingProviders ?? null,
        limit: VIBE_LIST_MAX_ITEMS,
      });
      const existingRows = await db
        .select({ showId: listItems.showId })
        .from(listItems)
        .where(eq(listItems.listId, list.id));
      const additions = computeVibeListAdditions({
        rankedShowIds,
        existingShowIds: existingRows.map((row) => row.showId),
        excludedShowIds: list.vibeExcludedShowIds ?? null,
      });
      await appendListItems(list.id, additions, now);
      await db
        .update(lists)
        .set(
          additions.length > 0
            ? { vibeRefreshedAt: now, updatedAt: now }
            : { vibeRefreshedAt: now },
        )
        .where(eq(lists.id, list.id));
      totalAdded += additions.length;

      if (
        additions.length > 0 &&
        owner &&
        list.vibeAlertsEnabled !== false &&
        userHasPro(owner) &&
        resolveNotificationPreferences(owner.notificationPreferences).streaming
      ) {
        const content = buildVibeDigestNotificationContent({
          listId: list.id,
          listTitle: list.title,
          vibeQuery: list.vibeQuery ?? list.title,
          addedTitles: additions
            .map((showId) => showsById.get(showId)?.title ?? "")
            .filter(Boolean),
          localDate: new Date(now).toISOString().slice(0, 10),
        });
        if (content) {
          notificationInputs.push({
            userId: owner.id,
            type: "vibe_digest",
            targetType: "list",
            targetId: list.id,
            title: content.title,
            body: content.body,
            dedupeKey: content.dedupeKey,
            data: { url: `/list/${list.id}`, listId: list.id },
          });
        }
      }
    } catch (error) {
      console.warn("[vibe-list] refresh failed", list.id, error);
      // Still stamp the attempt so one broken list can't starve the batch.
      await db
        .update(lists)
        .set({ vibeRefreshedAt: now })
        .where(eq(lists.id, list.id))
        .catch(() => {});
    }
  }

  const pushed = await createNotificationsAndPush(notificationInputs);
  return {
    refreshed: staleLists.length,
    added: totalAdded,
    ...pushed,
  };
}

// Cross-breed with streaming arrivals: when a show that's already a member of
// a smart list lands on one of the owner's services, tell them. Membership is
// the vibe-match signal — no similarity thresholds at alert time (Vectorize
// scores are compressed; absolute thresholds are banned in this repo).
export async function notifyVibeArrivalsForShows(
  arrivals: Array<{ showId: string; title: string; newKeys: string[] }>,
) {
  if (arrivals.length === 0) {
    return { created: 0, sent: 0 };
  }
  const arrivalByShowId = new Map(arrivals.map((a) => [a.showId, a] as const));
  const memberships: Array<{ showId: string; list: ListRow }> = [];
  for (const chunk of chunkForSqlParams(
    arrivals.map((arrival) => arrival.showId),
    1,
  )) {
    const rows = await db
      .select({ showId: listItems.showId, list: lists })
      .from(listItems)
      .innerJoin(lists, eq(listItems.listId, lists.id))
      .where(and(isNotNull(lists.vibeQuery), inArray(listItems.showId, chunk)));
    memberships.push(...rows);
  }
  if (memberships.length === 0) {
    return { created: 0, sent: 0 };
  }

  const ownerIds = Array.from(new Set(memberships.map((row) => row.list.ownerId)));
  const ownerById = new Map<string, UserRow>();
  for (const chunk of chunkForSqlParams(ownerIds, 1)) {
    for (const row of await db.select().from(users).where(inArray(users.id, chunk))) {
      ownerById.set(row.id, row);
    }
  }

  // Watchlisted shows already get the richer "streaming" arrival alert —
  // don't double-notify the same person about the same show.
  const watchlistedPairs = new Set<string>();
  const mutedPairs = new Set<string>();
  for (const chunk of chunkForSqlParams(ownerIds, 1)) {
    const stateRows = await db
      .select({ userId: watchStates.userId, showId: watchStates.showId })
      .from(watchStates)
      .where(
        and(
          eq(watchStates.status, "watchlist" as any),
          inArray(watchStates.userId, chunk),
        ),
      );
    for (const row of stateRows) {
      watchlistedPairs.add(`${row.userId}:${row.showId}`);
    }
    const muteRows = await db
      .select({
        userId: showNotificationMutes.userId,
        showId: showNotificationMutes.showId,
      })
      .from(showNotificationMutes)
      .where(inArray(showNotificationMutes.userId, chunk));
    for (const row of muteRows) {
      mutedPairs.add(`${row.userId}:${row.showId}`);
    }
  }

  const inputs: NotificationInput[] = [];
  for (const membership of memberships) {
    const arrival = arrivalByShowId.get(membership.showId);
    const list = membership.list;
    const owner = ownerById.get(list.ownerId);
    if (!arrival || !owner) continue;
    if (list.vibeAlertsEnabled === false) continue;
    if (watchlistedPairs.has(`${owner.id}:${arrival.showId}`)) continue;
    if (mutedPairs.has(`${owner.id}:${arrival.showId}`)) continue;
    if (!userHasPro(owner)) continue;
    if (!resolveNotificationPreferences(owner.notificationPreferences).streaming) {
      continue;
    }
    const myProviders = new Set(owner.streamingProviders ?? []);
    const matched = arrival.newKeys.filter((key) => myProviders.has(key));
    if (matched.length === 0) continue;
    const content = buildVibeArrivalNotificationContent({
      listId: list.id,
      showId: arrival.showId,
      showTitle: arrival.title,
      vibeQuery: list.vibeQuery ?? list.title,
      providerKeys: matched,
      providerLabels: matched.map((key) => PROVIDER_LABEL_BY_KEY.get(key) ?? key),
    });
    if (!content) continue;
    inputs.push({
      userId: owner.id,
      type: "vibe_arrival",
      showId: arrival.showId,
      targetType: "list",
      targetId: list.id,
      title: content.title,
      body: content.body,
      dedupeKey: content.dedupeKey,
      data: { url: `/show/${arrival.showId}`, showId: arrival.showId, listId: list.id },
    });
  }
  const result = await createNotificationsAndPush(inputs);
  if (inputs.length > 0) {
    console.info("[vibe-list] arrivals", `matched=${inputs.length}`, `sent=${result.sent}`);
  }
  return result;
}

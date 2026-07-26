// Memory search: "that show with the time loop I watched last winter" —
// semantic search scoped to the viewer's own watch history. Instead of
// ANN-then-intersect (which loses recall over a small personal history), we
// fetch the history shows' vectors by id and score them exactly against the
// query embedding. Time phrases parse to a fuzzy window that boosts in-window
// watches; pure parsing/ranking lives in lib/memorySearch.ts.

import { and, eq, gte, lt, max, ne } from "drizzle-orm";

import { episodeProgress, users, watchLogs, watchStates } from "../../db/schema";
import {
  MEMORY_RESULT_LIMIT,
  MEMORY_WINDOW_GRACE_MS,
  formatWatchedLabel,
  parseMemoryQuery,
  rankMemoryCandidates,
  type MemoryCandidate,
} from "../../lib/memorySearch";
import { cosineSimilarity } from "../../lib/plotlist/embeddingUtils";
import { loadShowsByIds } from "./ask-plotlist";
import { db } from "./db";
import { embedText } from "./gemini";
import { enforceRateLimit, rateLimitKey } from "./rate-limit";
import { fetchShowVectors, vectorsAvailable } from "./recs";

type UserRow = typeof users.$inferSelect;

// Cap on how many history shows get scored. getByIds fetches vectors in
// chunks of 20, so this bounds subrequests; in-window shows are kept first so
// a windowed query never loses its own era to the cap.
const MEMORY_HISTORY_LIMIT = 500;

export type MemoryMatch = {
  showId: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  watchedLabel: string | null;
  status: string | null;
};

export type MemorySearchResult = {
  matches: MemoryMatch[];
  windowLabel: string | null;
};

type HistoryEntry = {
  showId: string;
  lastWatchedAt: number | null;
  inWindowWatchedAt: number | null;
};

async function loadHistory(
  userId: string,
  window: { startMs: number; endMs: number } | null,
): Promise<{ entries: HistoryEntry[]; statusByShow: Map<string, string> }> {
  const [progressRows, logRows, stateRows] = await Promise.all([
    db
      .select({ showId: episodeProgress.showId, last: max(episodeProgress.watchedAt) })
      .from(episodeProgress)
      .where(eq(episodeProgress.userId, userId))
      .groupBy(episodeProgress.showId),
    db
      .select({ showId: watchLogs.showId, last: max(watchLogs.watchedAt) })
      .from(watchLogs)
      .where(eq(watchLogs.userId, userId))
      .groupBy(watchLogs.showId),
    db
      .select({
        showId: watchStates.showId,
        status: watchStates.status,
        updatedAt: watchStates.updatedAt,
      })
      .from(watchStates)
      .where(
        and(eq(watchStates.userId, userId), ne(watchStates.status, "watchlist" as any)),
      ),
  ]);

  const lastByShow = new Map<string, number>();
  const bump = (showId: string, value: number | null | undefined) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    const existing = lastByShow.get(showId);
    if (existing === undefined || value > existing) lastByShow.set(showId, value);
  };
  for (const row of progressRows) bump(row.showId, row.last);
  for (const row of logRows) bump(row.showId, row.last);
  const statusByShow = new Map<string, string>();
  for (const row of stateRows) {
    statusByShow.set(row.showId, row.status);
    // A status change is weak evidence of when they watched — only used when
    // no episode/log timestamps exist for the show.
    if (!lastByShow.has(row.showId)) bump(row.showId, row.updatedAt);
  }

  const inWindowByShow = new Map<string, number>();
  if (window) {
    const startMs = window.startMs - MEMORY_WINDOW_GRACE_MS;
    const endMs = window.endMs + MEMORY_WINDOW_GRACE_MS;
    const [progressInWindow, logsInWindow] = await Promise.all([
      db
        .select({ showId: episodeProgress.showId, last: max(episodeProgress.watchedAt) })
        .from(episodeProgress)
        .where(
          and(
            eq(episodeProgress.userId, userId),
            gte(episodeProgress.watchedAt, startMs),
            lt(episodeProgress.watchedAt, endMs),
          ),
        )
        .groupBy(episodeProgress.showId),
      db
        .select({ showId: watchLogs.showId, last: max(watchLogs.watchedAt) })
        .from(watchLogs)
        .where(
          and(
            eq(watchLogs.userId, userId),
            gte(watchLogs.watchedAt, startMs),
            lt(watchLogs.watchedAt, endMs),
          ),
        )
        .groupBy(watchLogs.showId),
    ]);
    for (const row of [...progressInWindow, ...logsInWindow]) {
      if (typeof row.last !== "number") continue;
      const existing = inWindowByShow.get(row.showId);
      if (existing === undefined || row.last > existing) {
        inWindowByShow.set(row.showId, row.last);
      }
    }
  }

  const allShowIds = new Set<string>([...lastByShow.keys(), ...statusByShow.keys()]);
  const entries: HistoryEntry[] = Array.from(allShowIds).map((showId) => ({
    showId,
    lastWatchedAt: lastByShow.get(showId) ?? null,
    inWindowWatchedAt: inWindowByShow.get(showId) ?? null,
  }));

  // In-window shows survive the cap unconditionally; the rest keep most
  // recent first.
  entries.sort((left, right) => {
    const leftIn = left.inWindowWatchedAt !== null ? 1 : 0;
    const rightIn = right.inWindowWatchedAt !== null ? 1 : 0;
    return (
      rightIn - leftIn || (right.lastWatchedAt ?? 0) - (left.lastWatchedAt ?? 0)
    );
  });
  return { entries: entries.slice(0, MEMORY_HISTORY_LIMIT), statusByShow };
}

export async function searchMemory(
  user: UserRow,
  input: { text: string; utcOffsetMinutes?: number },
): Promise<MemorySearchResult> {
  const startedAt = Date.now();
  await enforceRateLimit(rateLimitKey("memory-burst", user.id), 30, 60_000);
  if (!vectorsAvailable() || !process.env.GEMINI_API_KEY) {
    return { matches: [], windowLabel: null };
  }

  const parsed = parseMemoryQuery(input.text, {
    now: startedAt,
    utcOffsetMinutes: input.utcOffsetMinutes,
  });
  const { entries, statusByShow } = await loadHistory(user.id, parsed.window);
  if (entries.length === 0) {
    return { matches: [], windowLabel: parsed.window?.label ?? null };
  }

  const [queryVector, vectorsByShowId] = await Promise.all([
    embedText(parsed.semanticQuery, { taskType: "RETRIEVAL_QUERY" }),
    fetchShowVectors(entries.map((entry) => entry.showId)),
  ]);

  const candidates: MemoryCandidate[] = [];
  for (const entry of entries) {
    const vector = vectorsByShowId.get(entry.showId);
    if (!vector || vector.length === 0) continue;
    candidates.push({
      showId: entry.showId,
      semanticScore: cosineSimilarity(queryVector, vector),
      lastWatchedAt: entry.lastWatchedAt,
      inWindowWatchedAt: entry.inWindowWatchedAt,
    });
  }
  const ranked = rankMemoryCandidates(candidates, parsed.window, MEMORY_RESULT_LIMIT);

  const showsById = await loadShowsByIds(ranked.map((item) => item.showId));
  const matches: MemoryMatch[] = [];
  for (const item of ranked) {
    const row = showsById.get(item.showId);
    if (!row || !row.title) continue;
    const labelSource =
      parsed.window && typeof item.inWindowWatchedAt === "number"
        ? item.inWindowWatchedAt
        : item.lastWatchedAt;
    matches.push({
      showId: item.showId,
      title: row.title,
      year: row.year ?? null,
      posterUrl: row.posterUrl ?? null,
      watchedLabel: formatWatchedLabel(labelSource, {
        now: startedAt,
        utcOffsetMinutes: input.utcOffsetMinutes,
      }),
      status: statusByShow.get(item.showId) ?? null,
    });
  }

  console.info(
    "[memory] search",
    `query="${parsed.semanticQuery.slice(0, 80)}"`,
    `window=${parsed.window?.label ?? "none"}`,
    `history=${entries.length}`,
    `scored=${candidates.length}`,
    `matches=${matches.length}`,
    `ms=${Date.now() - startedAt}`,
  );
  return { matches, windowLabel: parsed.window?.label ?? null };
}

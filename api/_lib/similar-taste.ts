// Candidate pool for embeddings:getSimilarTasteUsers ("people with your
// taste"). Kept out of rpc.ts so the SQL can be exercised against SQLite in
// tests.

import { desc, getTableColumns, sql } from "drizzle-orm";

import { users } from "../../db/schema";
import { db } from "./db";

export type SimilarTasteCandidate = {
  user: typeof users.$inferSelect;
  // The candidate's watch-state show ids that are also in the viewer's
  // library (viewer watch states ∪ viewer favorites).
  sharedWatchedShowIds: string[];
};

// json_group_array text from the shared-watched subquery; '[]' when none.
export function parseSharedWatchedShowIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

// The most recently active users (same order and limit the pool always
// used), each carrying its shared watched ids computed in SQL: one statement
// with no dependency on the viewer's rows, so it rides in the caller's first
// wave, and only the overlap crosses the wire instead of every watch state
// of every candidate. The outer id is spelled "users"."id" on purpose:
// drizzle renders select-field columns unqualified, and a bare "id" would
// bind to the subquery's own table.
export async function loadSimilarTasteCandidates(
  viewerId: string,
  poolSize: number,
): Promise<SimilarTasteCandidate[]> {
  const rows = await db
    .select({
      ...getTableColumns(users),
      sharedWatchedShowIds: sql<string | null>`(
        select json_group_array(candidate_watch.show_id)
        from watch_states as candidate_watch
        where candidate_watch.user_id = "users"."id"
          and candidate_watch.show_id in (
            select viewer_watch.show_id from watch_states as viewer_watch
            where viewer_watch.user_id = ${viewerId}
            union
            select viewer_favorite.value from json_each((
              select case when json_valid(viewer.favorite_show_ids)
                then viewer.favorite_show_ids else '[]' end
              from users as viewer where viewer.id = ${viewerId}
            )) as viewer_favorite
          )
      )`.as("shared_watched_show_ids"),
    })
    .from(users)
    .orderBy(desc(users.lastSeenAt), desc(users.createdAt))
    .limit(poolSize);
  return rows.map(({ sharedWatchedShowIds, ...user }) => ({
    user,
    sharedWatchedShowIds: parseSharedWatchedShowIds(sharedWatchedShowIds),
  }));
}

// Size of viewerShowIds ∩ (candidate favorites ∪ candidate watched). The
// watched ids arrive pre-filtered to the viewer's library, which leaves the
// intersection unchanged.
export function countSharedShows(
  viewerShowIds: Set<string>,
  candidateFavoriteShowIds: string[] | null | undefined,
  sharedWatchedShowIds: string[],
) {
  const candidateShowIds = new Set([...(candidateFavoriteShowIds ?? []), ...sharedWatchedShowIds]);
  let total = 0;
  for (const showId of viewerShowIds) {
    if (candidateShowIds.has(showId)) total += 1;
  }
  return total;
}

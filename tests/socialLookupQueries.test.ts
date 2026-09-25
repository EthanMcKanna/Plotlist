import { beforeEach, describe, expect, it } from "@jest/globals";
import { desc } from "drizzle-orm";

import { users } from "../db/schema";
import { getContactMatchedUserIds, getContactMatchedUsers } from "../api/_lib/contacts";
import { db, initDb } from "../api/_lib/db";
import {
  countSharedShows,
  loadSimilarTasteCandidates,
  parseSharedWatchedShowIds,
} from "../api/_lib/similar-taste";
import { buildPersonPreviews } from "../api/_lib/social";
import { getUsersByIdsChunked } from "../api/_lib/user-lookup";
import {
  createD1Binding,
  createMigratedSqlite,
  sqliteAvailable,
  type SqliteDatabase,
} from "./fixtures/sqliteD1";

const NOW = 1_790_000_000_000;
const describeSqlite = sqliteAvailable ? describe : describe.skip;

let sqlite: SqliteDatabase;
let counter = 0;
const nextId = (prefix: string) => `${prefix}_${(counter += 1)}`;

function addUser(
  id: string,
  fields: { lastSeenAt?: number | null; favorites?: string | null; username?: string | null } = {},
) {
  sqlite
    .prepare(
      "insert into users (id, username, created_at, last_seen_at, favorite_show_ids) values (?, ?, ?, ?, ?)",
    )
    .run(
      id,
      fields.username === undefined ? `name_${id}` : fields.username,
      NOW - 1000,
      fields.lastSeenAt === undefined ? NOW : fields.lastSeenAt,
      fields.favorites === undefined ? null : fields.favorites,
    );
}
function addWatch(userId: string, ...showIds: string[]) {
  for (const showId of showIds) {
    sqlite
      .prepare(
        "insert into watch_states (id, user_id, show_id, status, updated_at) values (?, ?, ?, 'watching', ?)",
      )
      .run(nextId("ws"), userId, showId, NOW);
  }
}
function addFollow(followerId: string, followeeId: string) {
  sqlite
    .prepare("insert into follows (id, follower_id, followee_id, created_at) values (?, ?, ?, ?)")
    .run(nextId("f"), followerId, followeeId, NOW);
}
function addBlock(blockerId: string, blockedId: string) {
  sqlite
    .prepare("insert into blocks (id, blocker_id, blocked_id, created_at) values (?, ?, ?, ?)")
    .run(nextId("b"), blockerId, blockedId, NOW);
}
function addContact(ownerId: string, matchedUserId: string | null, updatedAt: number) {
  sqlite
    .prepare(
      "insert into contact_sync_entries (id, owner_id, display_name, contact_hash, matched_user_id, created_at, updated_at) values (?, ?, 'Contact', ?, ?, ?, ?)",
    )
    .run(nextId("c"), ownerId, nextId("hash"), matchedUserId, NOW, updatedAt);
}

beforeEach(() => {
  if (!sqliteAvailable) return;
  sqlite = createMigratedSqlite();
  initDb(createD1Binding(sqlite));
});

describe("countSharedShows", () => {
  it("counts the viewer's shows found in candidate favorites ∪ shared watched ids once each", () => {
    const viewer = new Set(["s1", "s2", "s3", "s4"]);
    expect(countSharedShows(viewer, ["s3", "s9"], ["s1", "s3"])).toBe(2);
    expect(countSharedShows(viewer, null, [])).toBe(0);
    expect(countSharedShows(viewer, ["s2"], [])).toBe(1);
  });

  it("parses the json_group_array payload defensively", () => {
    expect(parseSharedWatchedShowIds('["a","b"]')).toEqual(["a", "b"]);
    expect(parseSharedWatchedShowIds("[]")).toEqual([]);
    expect(parseSharedWatchedShowIds(null)).toEqual([]);
    expect(parseSharedWatchedShowIds("not json")).toEqual([]);
  });
});

describeSqlite("loadSimilarTasteCandidates", () => {
  it("returns the recent-user pool with each candidate's watched ∩ viewer library", async () => {
    addUser("viewer", { favorites: JSON.stringify(["s1", "s2"]), lastSeenAt: NOW - 50 });
    addWatch("viewer", "s2", "s3", "s4");
    addUser("cand_a", { favorites: JSON.stringify(["s3"]), lastSeenAt: NOW - 10 });
    addWatch("cand_a", "s1", "s3", "s9");
    addUser("cand_b", { favorites: JSON.stringify(["s2"]), lastSeenAt: NOW - 20 });
    addWatch("cand_b", "s5");
    addUser("cand_c", { lastSeenAt: NOW - 30 });
    addWatch("cand_c", "s4", "s2");
    addUser("cand_d", { lastSeenAt: null });
    addUser("cand_old", { lastSeenAt: NOW - 40 });
    addWatch("cand_old", "s1");

    const pool = await loadSimilarTasteCandidates("viewer", 5);
    const plain = await db
      .select()
      .from(users)
      .orderBy(desc(users.lastSeenAt), desc(users.createdAt))
      .limit(5);

    // Same rows, same order, no extra column leaking into the user payload.
    expect(pool.map((entry) => entry.user)).toEqual(plain);
    const shared = Object.fromEntries(
      pool.map((entry) => [entry.user.id, [...entry.sharedWatchedShowIds].sort()]),
    );
    expect(shared).toEqual({
      cand_a: ["s1", "s3"],
      cand_b: [],
      cand_c: ["s2", "s4"],
      cand_old: ["s1"],
      viewer: ["s2", "s3", "s4"],
    });

    const viewerLibrary = new Set(["s1", "s2", "s3", "s4"]);
    const counts = Object.fromEntries(
      pool.map((entry) => [
        entry.user.id,
        countSharedShows(viewerLibrary, entry.user.favoriteShowIds, entry.sharedWatchedShowIds),
      ]),
    );
    // Identical to the old all-watch-rows computation: s3 is both favorited
    // and watched by cand_a but counts once.
    expect(counts).toMatchObject({ cand_a: 2, cand_b: 1, cand_c: 2, cand_old: 1 });
  });

  it("works for a viewer without favorites", async () => {
    addUser("viewer", { favorites: null });
    addWatch("viewer", "s1");
    addUser("cand", { lastSeenAt: NOW - 1 });
    addWatch("cand", "s1", "s2");
    const pool = await loadSimilarTasteCandidates("viewer", 10);
    expect(pool.find((entry) => entry.user.id === "cand")?.sharedWatchedShowIds).toEqual(["s1"]);

    sqlite.prepare("update users set favorite_show_ids = '[]' where id = 'viewer'").run();
    const again = await loadSimilarTasteCandidates("viewer", 10);
    expect(again.find((entry) => entry.user.id === "cand")?.sharedWatchedShowIds).toEqual(["s1"]);
  });
});

describeSqlite("getContactMatchedUsers", () => {
  it("returns exactly what the ids → users lookup returned, in the same order", async () => {
    addUser("owner");
    const matched = Array.from({ length: 30 }, (_, index) => `user_${(index * 7919) % 1000}`);
    matched.forEach((id) => addUser(id));
    matched.forEach((id, index) => {
      addContact("owner", id, NOW - index);
      // Repeat matches (two contact cards for one person) and unmatched rows.
      if (index % 5 === 0) addContact("owner", id, NOW - index - 100);
      if (index % 4 === 0) addContact("owner", null, NOW - index);
    });

    for (const limit of [1, 12, 25, 60]) {
      const before = await getUsersByIdsChunked(await getContactMatchedUserIds("owner", limit));
      const after = await getContactMatchedUsers("owner", limit);
      expect(after).toEqual(before);
    }
  });
});

describeSqlite("buildPersonPreviews", () => {
  it("filters blocks and resolves relationships across every chunk", async () => {
    addUser("viewer");
    addWatch("viewer", "s1", "s2");
    const candidateIds = Array.from({ length: 130 }, (_, index) => `cand_${String(index).padStart(3, "0")}`);
    candidateIds.forEach((id) => addUser(id));
    addUser("mutual_friend");
    addFollow("viewer", "mutual_friend");

    // Blocks either way, spread over several 40-id block chunks.
    addBlock("viewer", "cand_005");
    addBlock("cand_050", "viewer");
    addBlock("cand_095", "viewer");
    addBlock("viewer", "cand_129");
    // Relationship signal in later 80-id chunks.
    addFollow("viewer", "cand_090");
    addFollow("cand_091", "viewer");
    addFollow("mutual_friend", "cand_120");
    addWatch("cand_100", "s1", "s2", "s3");
    addContact("viewer", "cand_110", NOW);

    const rows = await getUsersByIdsChunked(candidateIds);
    const previews = await buildPersonPreviews("viewer", rows);
    const byId = new Map(previews.map((preview) => [preview.user._id, preview]));

    expect(previews).toHaveLength(126);
    for (const blocked of ["cand_005", "cand_050", "cand_095", "cand_129"]) {
      expect(byId.has(blocked)).toBe(false);
    }
    // Input order is preserved.
    expect(previews.map((preview) => preview.user._id)).toEqual(
      rows.map((row) => row.id).filter((id) => byId.has(id)),
    );
    expect(byId.get("cand_090")).toMatchObject({ isFollowing: true, followsYou: false });
    expect(byId.get("cand_091")).toMatchObject({ isFollowing: false, followsYou: true });
    expect(byId.get("cand_120")?.mutualCount).toBe(1);
    expect(byId.get("cand_100")?.sharedShowCount).toBe(2);
    expect(byId.get("cand_110")?.inContacts).toBe(true);
    expect(byId.get("cand_001")).toMatchObject({
      isFollowing: false,
      followsYou: false,
      mutualCount: 0,
      sharedShowCount: 0,
      inContacts: false,
    });
  });
});

import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";

import { contactSyncEntries, follows, users } from "../../db/schema";
import {
  CONTACT_INVITE_RESEND_COOLDOWN_MS,
  diffContactSnapshot,
  isContactInviteReady,
  prepareContactEntries,
  sortInviteCandidates,
  summarizeContactSnapshot,
  type RawContactEntry,
} from "../../lib/contactSnapshot";
import { db } from "./db";
import { ApiError } from "./errors";
import { createId } from "./ids";
import { notifyContactsUserJoined } from "./notifications";
import { hashPhoneNumber, normalizePhoneNumber } from "./phone";
import { getBlockedEitherWayIdSet } from "./privacy";
import { buildPersonPreviews } from "./social";
import { chunkForSqlParams, ilikeContains } from "./sql-dialect";
import { getUsersByIdsChunked } from "./user-lookup";

export const CONTACT_SYNC_ENTRY_LIMIT = 2000;

// Invite candidate lists sort ready-first across the whole snapshot, so the
// SQL query over-fetches a bounded window before sorting in JS.
const INVITE_CANDIDATE_SCAN_LIMIT = 400;

// Only the fields the invite UI needs; the full row leaks contactHash (an
// HMAC of a phone number) and internal ids to the client.
export function toInviteCandidateDoc(row: typeof contactSyncEntries.$inferSelect) {
  return {
    entryId: row.id,
    sourceRecordId: row.sourceRecordId,
    displayName: row.displayName,
    invitedAt: row.invitedAt,
    matchedUserId: row.matchedUserId,
  };
}

export async function getContactStatus(userId: string) {
  const cutoff = Date.now() - CONTACT_INVITE_RESEND_COOLDOWN_MS;
  const rows = await db
    .select({
      totalCount: sql<number>`count(*)`,
      matchedCount: sql<number>`sum(case when ${contactSyncEntries.matchedUserId} is not null then 1 else 0 end)`,
      invitedCount: sql<number>`sum(case when ${contactSyncEntries.invitedAt} is not null then 1 else 0 end)`,
      inviteCount: sql<number>`sum(case when ${contactSyncEntries.matchedUserId} is null and (${contactSyncEntries.invitedAt} is null or ${contactSyncEntries.invitedAt} <= ${cutoff}) then 1 else 0 end)`,
      lastSyncedAt: sql<number | null>`max(${contactSyncEntries.updatedAt})`,
    })
    .from(contactSyncEntries)
    .where(eq(contactSyncEntries.ownerId, userId));

  const row = rows[0];
  const totalCount = Number(row?.totalCount ?? 0);
  return {
    hasSynced: totalCount > 0,
    totalCount,
    matchedCount: Number(row?.matchedCount ?? 0),
    inviteCount: Number(row?.inviteCount ?? 0),
    invitedCount: Number(row?.invitedCount ?? 0),
    lastSyncedAt: totalCount > 0 ? Number(row?.lastSyncedAt ?? 0) || null : null,
  };
}

export async function getContactMatchedUserIds(userId: string, limit: number) {
  const entries = await db
    .select({ matchedUserId: contactSyncEntries.matchedUserId })
    .from(contactSyncEntries)
    .where(
      and(
        eq(contactSyncEntries.ownerId, userId),
        isNotNull(contactSyncEntries.matchedUserId),
      ),
    )
    .orderBy(desc(contactSyncEntries.updatedAt))
    .limit(limit);
  return Array.from(
    new Set(entries.flatMap((entry) => (entry.matchedUserId ? [entry.matchedUserId] : []))),
  );
}

export async function getContactMatches(userId: string, limit: number) {
  // Over-fetch to survive the blocked-user filter inside buildPersonPreviews.
  const userIds = (await getContactMatchedUserIds(userId, limit * 2)).slice(0, limit);
  if (userIds.length === 0) {
    return [];
  }
  const candidates = await getUsersByIdsChunked(userIds);
  return await buildPersonPreviews(userId, candidates);
}

export async function getInviteCandidates(userId: string, limit: number) {
  const rows = await db
    .select()
    .from(contactSyncEntries)
    .where(and(eq(contactSyncEntries.ownerId, userId), isNull(contactSyncEntries.matchedUserId)))
    // SQLite sorts NULLs first under ASC, so never-invited contacts lead.
    .orderBy(asc(contactSyncEntries.invitedAt), asc(contactSyncEntries.displayName))
    .limit(INVITE_CANDIDATE_SCAN_LIMIT);
  return sortInviteCandidates(rows).slice(0, limit).map(toInviteCandidateDoc);
}

export async function searchInviteCandidates(userId: string, text: string, limit: number) {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  const rows = await db
    .select()
    .from(contactSyncEntries)
    .where(
      and(
        eq(contactSyncEntries.ownerId, userId),
        isNull(contactSyncEntries.matchedUserId),
        ilikeContains(contactSyncEntries.displayName, trimmed),
      ),
    )
    .limit(Math.max(limit * 3, 30));
  return sortInviteCandidates(rows).slice(0, limit).map(toInviteCandidateDoc);
}

export async function syncContactSnapshot(userId: string, rawEntries: RawContactEntry[]) {
  const prepared = prepareContactEntries(rawEntries, {
    normalizePhone: normalizePhoneNumber,
    hashPhone: hashPhoneNumber,
    limit: CONTACT_SYNC_ENTRY_LIMIT,
  });

  const hashes = prepared.map((entry) => entry.contactHash);
  const matchByHash = new Map<string, string>();
  for (const chunk of chunkForSqlParams(hashes, 1, 80)) {
    const matchedRows = await db
      .select({ id: users.id, phoneHash: users.phoneHash })
      .from(users)
      .where(inArray(users.phoneHash, chunk));
    for (const row of matchedRows) {
      if (row.phoneHash) {
        matchByHash.set(row.phoneHash, row.id);
      }
    }
  }

  const nextEntries = prepared.map((entry) => {
    const matchedUserId = matchByHash.get(entry.contactHash) ?? null;
    return {
      ...entry,
      // Never match a contact entry to the syncing user themselves.
      matchedUserId: matchedUserId === userId ? null : matchedUserId,
    };
  });

  const previousRows = await db
    .select()
    .from(contactSyncEntries)
    .where(eq(contactSyncEntries.ownerId, userId));

  const now = Date.now();
  const diff = diffContactSnapshot(previousRows, nextEntries, now);

  for (const chunk of chunkForSqlParams(diff.toDeleteIds, 1, 80)) {
    await db.delete(contactSyncEntries).where(inArray(contactSyncEntries.id, chunk));
  }
  for (const update of diff.toUpdate) {
    await db
      .update(contactSyncEntries)
      .set(update.set)
      .where(and(eq(contactSyncEntries.id, update.id), eq(contactSyncEntries.ownerId, userId)));
  }
  const insertRows = diff.toInsert.map((row) => ({
    id: createId("contact"),
    ownerId: userId,
    ...row,
  }));
  for (const chunk of chunkForSqlParams(insertRows, 9)) {
    await db.insert(contactSyncEntries).values(chunk);
  }

  const previousByHash = new Map(previousRows.map((row) => [row.contactHash, row]));
  const summary = summarizeContactSnapshot(nextEntries.map((entry) => ({
    matchedUserId: entry.matchedUserId,
    invitedAt: previousByHash.get(entry.contactHash)?.invitedAt ?? null,
  })), now);

  return { ...summary, syncedAt: now };
}

export async function markContactInvited(userId: string, entryId: string) {
  const rows = await db
    .select()
    .from(contactSyncEntries)
    .where(and(eq(contactSyncEntries.id, entryId), eq(contactSyncEntries.ownerId, userId)))
    .limit(1);
  const entry = rows[0];
  if (!entry) {
    throw new ApiError(404, "contact_not_found", "Contact invite was not found");
  }
  if (entry.matchedUserId) {
    throw new ApiError(409, "contact_already_joined", "This contact is already on Plotlist");
  }

  const now = Date.now();
  if (!isContactInviteReady(entry, now) && entry.invitedAt) {
    return { success: true, invitedAt: entry.invitedAt, alreadyInvited: true };
  }

  await db
    .update(contactSyncEntries)
    .set({ invitedAt: now, updatedAt: now })
    .where(eq(contactSyncEntries.id, entryId));
  return { success: true, invitedAt: now, alreadyInvited: false };
}

export async function clearContactSync(userId: string) {
  await db.delete(contactSyncEntries).where(eq(contactSyncEntries.ownerId, userId));
  return { success: true };
}

// The join-time half of the contact matching loop. Sync-time matching only
// catches people already on Plotlist; this catches everyone who joins later.
// Called whenever a user's phone hash lands (signup verify or attaching a
// number to an existing account): links every synced address book that
// contains this number, then tells those owners their contact just joined.
// Idempotent — already-linked rows are skipped and the notification dedupe
// key means each owner hears about a given joiner at most once, ever.
export async function linkJoinedUserToContacts(user: typeof users.$inferSelect) {
  if (!user.phoneHash) {
    return { linkedOwnerIds: [] as string[] };
  }

  const rows = await db
    .select()
    .from(contactSyncEntries)
    .where(
      and(
        eq(contactSyncEntries.contactHash, user.phoneHash),
        ne(contactSyncEntries.ownerId, user.id),
      ),
    );
  const staleRows = rows.filter((row) => row.matchedUserId !== user.id);
  if (staleRows.length === 0) {
    return { linkedOwnerIds: [] };
  }

  const now = Date.now();
  for (const chunk of chunkForSqlParams(staleRows.map((row) => row.id), 1, 80)) {
    await db
      .update(contactSyncEntries)
      .set({ matchedUserId: user.id, updatedAt: now })
      .where(inArray(contactSyncEntries.id, chunk));
  }

  const ownerIds = Array.from(new Set(staleRows.map((row) => row.ownerId)));

  // Blocked pairs stay invisible to each other, and owners who already
  // follow the joiner don't need a join alert.
  const blockedIds = await getBlockedEitherWayIdSet(user.id, ownerIds);
  const alreadyFollowingIds = new Set<string>();
  for (const chunk of chunkForSqlParams(ownerIds, 1, 80)) {
    const followRows = await db
      .select({ followerId: follows.followerId })
      .from(follows)
      .where(and(eq(follows.followeeId, user.id), inArray(follows.followerId, chunk)));
    for (const row of followRows) {
      alreadyFollowingIds.add(row.followerId);
    }
  }

  const recipients = staleRows.flatMap((row) =>
    blockedIds.has(row.ownerId) || alreadyFollowingIds.has(row.ownerId)
      ? []
      : [{ ownerId: row.ownerId, contactName: row.displayName }],
  );
  await notifyContactsUserJoined(user, recipients);

  return { linkedOwnerIds: ownerIds };
}

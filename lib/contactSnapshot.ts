// Pure contact-sync snapshot logic shared by the API worker and unit tests.
// No database or platform imports — everything here is deterministic given
// its inputs so the sync pipeline can be tested without a D1 instance.

export const CONTACT_INVITE_RESEND_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export type RawContactEntry = {
  sourceRecordId?: string;
  displayName?: string;
  phone: string;
};

export type PreparedContactEntry = {
  sourceRecordId: string | null;
  displayName: string;
  contactHash: string;
};

export type ContactSnapshotRow = {
  id: string;
  sourceRecordId: string | null;
  displayName: string;
  contactHash: string;
  matchedUserId: string | null;
  invitedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export function isContactInviteReady(
  entry: { matchedUserId?: string | null; invitedAt?: number | null },
  now = Date.now(),
) {
  return (
    !entry.matchedUserId &&
    (!entry.invitedAt || entry.invitedAt <= now - CONTACT_INVITE_RESEND_COOLDOWN_MS)
  );
}

// Invite-ready contacts first, then least-recently-invited, then A→Z so the
// list reads stable between refreshes.
export function sortInviteCandidates<
  T extends { matchedUserId?: string | null; invitedAt?: number | null; displayName: string },
>(rows: T[], now = Date.now()) {
  return [...rows].sort((left, right) => {
    const readyDelta =
      Number(isContactInviteReady(right, now)) - Number(isContactInviteReady(left, now));
    if (readyDelta !== 0) {
      return readyDelta;
    }
    const inviteDelta = (left.invitedAt ?? 0) - (right.invitedAt ?? 0);
    if (inviteDelta !== 0) {
      return inviteDelta;
    }
    return left.displayName.localeCompare(right.displayName);
  });
}

// Normalizes, hashes, and dedupes a raw device snapshot. Normalize/hash are
// injected because hashing needs the server HMAC secret.
export function prepareContactEntries(
  entries: RawContactEntry[],
  options: {
    normalizePhone: (phone: string) => string | null;
    hashPhone: (normalizedPhone: string) => string;
    limit?: number;
  },
): PreparedContactEntry[] {
  const limit = options.limit ?? 2000;
  const deduped = new Map<string, PreparedContactEntry>();
  for (const entry of entries) {
    if (deduped.size >= limit) {
      break;
    }
    const normalizedPhone = options.normalizePhone(entry.phone);
    if (!normalizedPhone) {
      continue;
    }
    const contactHash = options.hashPhone(normalizedPhone);
    if (deduped.has(contactHash)) {
      continue;
    }
    deduped.set(contactHash, {
      sourceRecordId: entry.sourceRecordId ?? null,
      displayName: entry.displayName?.trim() || "Unknown contact",
      contactHash,
    });
  }
  return Array.from(deduped.values());
}

export type ContactSnapshotDiff = {
  toInsert: Array<Omit<ContactSnapshotRow, "id">>;
  toUpdate: Array<{
    id: string;
    set: Partial<Pick<ContactSnapshotRow, "sourceRecordId" | "displayName" | "matchedUserId">> & {
      updatedAt: number;
    };
  }>;
  toDeleteIds: string[];
  unchangedCount: number;
};

// Computes the minimal set of writes to move the stored snapshot to the new
// one. The previous wholesale delete+reinsert rewrote up to 2000 rows per
// sync on D1; a routine resync where nothing changed is now zero writes.
// invitedAt/createdAt survive on carried-over hashes so invite cooldowns
// hold across resyncs.
export function diffContactSnapshot(
  previousRows: ContactSnapshotRow[],
  nextEntries: Array<PreparedContactEntry & { matchedUserId: string | null }>,
  now = Date.now(),
): ContactSnapshotDiff {
  const previousByHash = new Map(previousRows.map((row) => [row.contactHash, row]));
  const nextHashes = new Set(nextEntries.map((entry) => entry.contactHash));

  const diff: ContactSnapshotDiff = {
    toInsert: [],
    toUpdate: [],
    toDeleteIds: [],
    unchangedCount: 0,
  };

  for (const entry of nextEntries) {
    const previous = previousByHash.get(entry.contactHash);
    if (!previous) {
      diff.toInsert.push({
        sourceRecordId: entry.sourceRecordId,
        displayName: entry.displayName,
        contactHash: entry.contactHash,
        matchedUserId: entry.matchedUserId,
        invitedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      continue;
    }

    const set: ContactSnapshotDiff["toUpdate"][number]["set"] = { updatedAt: now };
    let changed = false;
    if (previous.displayName !== entry.displayName) {
      set.displayName = entry.displayName;
      changed = true;
    }
    if ((previous.sourceRecordId ?? null) !== entry.sourceRecordId) {
      set.sourceRecordId = entry.sourceRecordId;
      changed = true;
    }
    if ((previous.matchedUserId ?? null) !== entry.matchedUserId) {
      set.matchedUserId = entry.matchedUserId;
      changed = true;
    }

    if (changed) {
      diff.toUpdate.push({ id: previous.id, set });
    } else {
      diff.unchangedCount += 1;
    }
  }

  for (const row of previousRows) {
    if (!nextHashes.has(row.contactHash)) {
      diff.toDeleteIds.push(row.id);
    }
  }

  return diff;
}

export function summarizeContactSnapshot(
  entries: Array<{ matchedUserId: string | null; invitedAt: number | null }>,
  now = Date.now(),
) {
  return {
    totalCount: entries.length,
    matchedCount: entries.filter((entry) => entry.matchedUserId).length,
    inviteCount: entries.filter((entry) => isContactInviteReady(entry, now)).length,
    invitedCount: entries.filter((entry) => entry.invitedAt).length,
  };
}

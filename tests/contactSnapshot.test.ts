import { describe, expect, it } from "@jest/globals";

import {
  CONTACT_INVITE_RESEND_COOLDOWN_MS,
  diffContactSnapshot,
  isContactInviteReady,
  prepareContactEntries,
  sortInviteCandidates,
  summarizeContactSnapshot,
  type ContactSnapshotRow,
} from "../lib/contactSnapshot";

const NOW = 1_750_000_000_000;

const normalizePhone = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `+1${digits}` : null;
};
const hashPhone = (normalized: string) => `hash:${normalized}`;

function row(overrides: Partial<ContactSnapshotRow> & { contactHash: string }): ContactSnapshotRow {
  return {
    id: `entry-${overrides.contactHash}`,
    sourceRecordId: null,
    displayName: "Someone",
    matchedUserId: null,
    invitedAt: null,
    createdAt: NOW - 100_000,
    updatedAt: NOW - 100_000,
    ...overrides,
  };
}

describe("prepareContactEntries", () => {
  it("normalizes, hashes, and dedupes by phone hash", () => {
    const entries = prepareContactEntries(
      [
        { sourceRecordId: "a:0", displayName: "Ada", phone: "312 555 0182" },
        { sourceRecordId: "a:1", displayName: "Ada", phone: "(312) 555-0182" },
        { sourceRecordId: "b:0", displayName: "  Grace  ", phone: "773 555 0123" },
        { sourceRecordId: "c:0", displayName: "", phone: "555" },
      ],
      { normalizePhone, hashPhone },
    );

    expect(entries).toEqual([
      { sourceRecordId: "a:0", displayName: "Ada", contactHash: "hash:+13125550182" },
      { sourceRecordId: "b:0", displayName: "Grace", contactHash: "hash:+17735550123" },
    ]);
  });

  it("falls back to a placeholder name and enforces the entry cap", () => {
    const entries = prepareContactEntries(
      [
        { phone: "312 555 0001" },
        { phone: "312 555 0002", displayName: "   " },
        { phone: "312 555 0003" },
      ],
      { normalizePhone, hashPhone, limit: 2 },
    );

    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.displayName === "Unknown contact")).toBe(true);
  });
});

describe("diffContactSnapshot", () => {
  it("is a no-op when nothing changed", () => {
    const previous = [row({ contactHash: "h1", displayName: "Ada" })];
    const diff = diffContactSnapshot(
      previous,
      [{ sourceRecordId: null, displayName: "Ada", contactHash: "h1", matchedUserId: null }],
      NOW,
    );

    expect(diff.toInsert).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
    expect(diff.toDeleteIds).toEqual([]);
    expect(diff.unchangedCount).toBe(1);
  });

  it("inserts new hashes, deletes removed ones, and updates renamed contacts", () => {
    const previous = [
      row({ contactHash: "keep", displayName: "Ada" }),
      row({ contactHash: "gone", displayName: "Bea" }),
    ];
    const diff = diffContactSnapshot(
      previous,
      [
        { sourceRecordId: null, displayName: "Ada Lovelace", contactHash: "keep", matchedUserId: null },
        { sourceRecordId: "n:0", displayName: "New Friend", contactHash: "new", matchedUserId: null },
      ],
      NOW,
    );

    expect(diff.toInsert).toEqual([
      {
        sourceRecordId: "n:0",
        displayName: "New Friend",
        contactHash: "new",
        matchedUserId: null,
        invitedAt: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    expect(diff.toUpdate).toEqual([
      { id: "entry-keep", set: { updatedAt: NOW, displayName: "Ada Lovelace" } },
    ]);
    expect(diff.toDeleteIds).toEqual(["entry-gone"]);
  });

  it("records match changes without touching invite history", () => {
    const previous = [
      row({ contactHash: "h1", invitedAt: NOW - 5_000, matchedUserId: null }),
    ];
    const diff = diffContactSnapshot(
      previous,
      [{ sourceRecordId: null, displayName: "Someone", contactHash: "h1", matchedUserId: "user_9" }],
      NOW,
    );

    expect(diff.toUpdate).toEqual([
      { id: "entry-h1", set: { updatedAt: NOW, matchedUserId: "user_9" } },
    ]);
    // invitedAt is never part of an update set — cooldowns survive resyncs.
    expect(diff.toUpdate[0]?.set).not.toHaveProperty("invitedAt");
  });

  it("clears a stale match when the matched account no longer exists", () => {
    const previous = [row({ contactHash: "h1", matchedUserId: "user_deleted" })];
    const diff = diffContactSnapshot(
      previous,
      [{ sourceRecordId: null, displayName: "Someone", contactHash: "h1", matchedUserId: null }],
      NOW,
    );

    expect(diff.toUpdate).toEqual([
      { id: "entry-h1", set: { updatedAt: NOW, matchedUserId: null } },
    ]);
  });
});

describe("invite readiness", () => {
  it("matched contacts are never invite-ready", () => {
    expect(isContactInviteReady({ matchedUserId: "user_1", invitedAt: null }, NOW)).toBe(false);
  });

  it("cooldown expires after the resend window", () => {
    const recent = { matchedUserId: null, invitedAt: NOW - 1000 };
    const old = {
      matchedUserId: null,
      invitedAt: NOW - CONTACT_INVITE_RESEND_COOLDOWN_MS - 1,
    };
    expect(isContactInviteReady(recent, NOW)).toBe(false);
    expect(isContactInviteReady(old, NOW)).toBe(true);
  });

  it("sorts ready-first, then least-recently-invited, then alphabetically", () => {
    const sorted = sortInviteCandidates(
      [
        { matchedUserId: null, invitedAt: NOW - 1000, displayName: "Recently Invited" },
        { matchedUserId: null, invitedAt: null, displayName: "Zoe" },
        { matchedUserId: null, invitedAt: null, displayName: "Ada" },
        {
          matchedUserId: null,
          invitedAt: NOW - CONTACT_INVITE_RESEND_COOLDOWN_MS - 5000,
          displayName: "Long Ago",
        },
      ],
      NOW,
    );

    expect(sorted.map((entry) => entry.displayName)).toEqual([
      "Ada",
      "Zoe",
      "Long Ago",
      "Recently Invited",
    ]);
  });
});

describe("summarizeContactSnapshot", () => {
  it("counts totals, matches, invite-ready, and invited entries", () => {
    expect(
      summarizeContactSnapshot(
        [
          { matchedUserId: "user_1", invitedAt: null },
          { matchedUserId: null, invitedAt: null },
          { matchedUserId: null, invitedAt: NOW - 1000 },
          { matchedUserId: null, invitedAt: NOW - CONTACT_INVITE_RESEND_COOLDOWN_MS - 1 },
        ],
        NOW,
      ),
    ).toEqual({
      totalCount: 4,
      matchedCount: 1,
      inviteCount: 2,
      invitedCount: 2,
    });
  });
});

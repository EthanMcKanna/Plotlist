import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { buildPersonPreviews } from "./people";
import { hashPhoneNumber, normalizePhoneNumber } from "./phone";
import { getCurrentUserOrThrow } from "./utils";
import { rateLimit } from "./rateLimit";

const CONTACT_SYNC_LIMIT = 2_000;
const INVITE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

type SyncEntry = {
  sourceRecordId?: string;
  displayName: string;
  contactHash: string;
  matchedUserId?: Id<"users">;
};

export const findUsersByPhoneHashes = internalQuery({
  args: { hashes: v.array(v.string()) },
  handler: async (ctx, args) => {
    const pairs = await Promise.all(
      args.hashes.map(async (hash) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_phoneHash", (q) => q.eq("phoneHash", hash))
          .unique();
        return user ? { hash, userId: user._id } : null;
      }),
    );
    return pairs.flatMap((pair) => (pair ? [pair] : []));
  },
});

export const replaceSnapshot = internalMutation({
  args: {
    ownerId: v.id("users"),
    syncedAt: v.number(),
    entries: v.array(
      v.object({
        sourceRecordId: v.optional(v.string()),
        displayName: v.string(),
        contactHash: v.string(),
        matchedUserId: v.optional(v.id("users")),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("contactSyncEntries")
      .withIndex("by_owner_updatedAt", (q) => q.eq("ownerId", args.ownerId))
      .collect();

    await Promise.all(existing.map((entry) => ctx.db.delete(entry._id)));

    await Promise.all(
      args.entries.map((entry) =>
        ctx.db.insert("contactSyncEntries", {
          ownerId: args.ownerId,
          sourceRecordId: entry.sourceRecordId,
          displayName: entry.displayName,
          contactHash: entry.contactHash,
          matchedUserId: entry.matchedUserId,
          createdAt: args.syncedAt,
          updatedAt: args.syncedAt,
        }),
      ),
    );
  },
});

export const getEntryByHash = internalQuery({
  args: { ownerId: v.id("users"), contactHash: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contactSyncEntries")
      .withIndex("by_owner_contactHash", (q) =>
        q.eq("ownerId", args.ownerId).eq("contactHash", args.contactHash),
      )
      .unique();
  },
});

export const markInvited = internalMutation({
  args: { entryId: v.id("contactSyncEntries"), invitedAt: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.entryId, {
      invitedAt: args.invitedAt,
      updatedAt: args.invitedAt,
    });
  },
});

export const syncSnapshot = action({
  args: {
    entries: v.array(
      v.object({
        sourceRecordId: v.optional(v.string()),
        displayName: v.optional(v.string()),
        phone: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    await ctx.runMutation(internal.rateLimit.enforce, {
      key: `contacts-sync:${userId}`,
      limit: 6,
      windowMs: 10 * 60 * 1000,
    });

    const deduped = new Map<string, SyncEntry>();
    for (const entry of args.entries.slice(0, CONTACT_SYNC_LIMIT)) {
      const normalizedPhone = normalizePhoneNumber(entry.phone);
      if (!normalizedPhone) {
        continue;
      }
      const contactHash = await hashPhoneNumber(normalizedPhone);
      if (!deduped.has(contactHash)) {
        deduped.set(contactHash, {
          sourceRecordId: entry.sourceRecordId,
          displayName: entry.displayName?.trim() || "Unknown contact",
          contactHash,
        });
      }
    }

    const uniqueEntries = Array.from(deduped.values());
    const matches = await ctx.runQuery(internal.contacts.findUsersByPhoneHashes, {
      hashes: uniqueEntries.map((entry) => entry.contactHash),
    });
    const matchMap = new Map<string, Id<"users">>(
      matches.map((match: { hash: string; userId: Id<"users"> }) => [
        match.hash,
        match.userId,
      ]),
    );
    const syncedAt = Date.now();

    const nextEntries: SyncEntry[] = uniqueEntries.map((entry) => ({
      ...entry,
      matchedUserId:
        matchMap.get(entry.contactHash) === userId
          ? undefined
          : matchMap.get(entry.contactHash),
    }));

    await ctx.runMutation(internal.contacts.replaceSnapshot, {
      ownerId: userId,
      syncedAt,
      entries: nextEntries,
    });

    return {
      totalCount: nextEntries.length,
      matchedCount: nextEntries.filter((entry) => entry.matchedUserId).length,
      invitedCount: nextEntries.filter((entry) => !entry.matchedUserId).length,
      syncedAt,
    };
  },
});

export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        hasSynced: false,
        totalCount: 0,
        matchedCount: 0,
        inviteCount: 0,
        invitedCount: 0,
        lastSyncedAt: null,
      };
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      return {
        hasSynced: false,
        totalCount: 0,
        matchedCount: 0,
        inviteCount: 0,
        invitedCount: 0,
        lastSyncedAt: null,
      };
    }
    const entries = await ctx.db
      .query("contactSyncEntries")
      .withIndex("by_owner_updatedAt", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .collect();

    return {
      hasSynced: entries.length > 0,
      totalCount: entries.length,
      matchedCount: entries.filter((entry) => entry.matchedUserId).length,
      inviteCount: entries.filter((entry) => !entry.matchedUserId).length,
      invitedCount: entries.filter((entry) => entry.invitedAt).length,
      lastSyncedAt: entries[0]?.updatedAt ?? null,
    };
  },
});

export const getMatches = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      return [];
    }
    const limit = Math.min(args.limit ?? 12, 30);
    const entries = await ctx.db
      .query("contactSyncEntries")
      .withIndex("by_owner_updatedAt", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .collect();

    const uniqueUserIds = Array.from(
      new Set(
        entries.flatMap((entry) => (entry.matchedUserId ? [entry.matchedUserId] : [])),
      ),
    ).slice(0, limit);

    const users = await Promise.all(uniqueUserIds.map((id) => ctx.db.get(id)));
    return await buildPersonPreviews(
      ctx,
      user._id,
      users.flatMap((candidate) => (candidate ? [candidate] : [])),
    );
  },
});

export const getInviteCandidates = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      return [];
    }
    const limit = Math.min(args.limit ?? 20, 50);
    const entries = await ctx.db
      .query("contactSyncEntries")
      .withIndex("by_owner_updatedAt", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .collect();

    return entries
      .filter((entry) => !entry.matchedUserId)
      .slice(0, limit)
      .map((entry) => ({
        entryId: entry._id,
        sourceRecordId: entry.sourceRecordId ?? null,
        displayName: entry.displayName,
        invitedAt: entry.invitedAt ?? null,
      }));
  },
});

export const searchInviteCandidates = query({
  args: { text: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user) return [];

    const limit = Math.min(args.limit ?? 10, 30);
    const needle = args.text.toLowerCase().trim();
    if (needle.length < 2) return [];

    const entries = await ctx.db
      .query("contactSyncEntries")
      .withIndex("by_owner_updatedAt", (q) => q.eq("ownerId", user._id))
      .collect();

    return entries
      .filter(
        (entry) =>
          !entry.matchedUserId &&
          entry.displayName.toLowerCase().includes(needle),
      )
      .slice(0, limit)
      .map((entry) => ({
        entryId: entry._id,
        sourceRecordId: entry.sourceRecordId ?? null,
        displayName: entry.displayName,
        invitedAt: entry.invitedAt ?? null,
      }));
  },
});

export const sendInvite = mutation({
  args: { entryId: v.id("contactSyncEntries") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await rateLimit(ctx, `contact-invite:${user._id}`, 10, 60 * 60 * 1000);

    const entry = await ctx.db.get(args.entryId);
    if (!entry || entry.ownerId !== user._id || entry.matchedUserId) {
      throw new Error("This contact is no longer available to invite");
    }

    if (entry.invitedAt && entry.invitedAt > Date.now() - INVITE_COOLDOWN_MS) {
      throw new Error("Invite already sent recently");
    }

    await ctx.db.patch(entry._id, {
      invitedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const clearSync = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrThrow(ctx);
    const entries = await ctx.db
      .query("contactSyncEntries")
      .withIndex("by_owner_updatedAt", (q) => q.eq("ownerId", user._id))
      .collect();

    await Promise.all(entries.map((entry) => ctx.db.delete(entry._id)));
  },
});

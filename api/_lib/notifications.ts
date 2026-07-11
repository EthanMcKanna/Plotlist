import { and, count, eq, inArray, isNull, lte, sql } from "drizzle-orm";

import {
  comments,
  lists,
  notifications,
  pushTickets,
  pushTokens,
  releaseEvents,
  reviews,
  shows,
  users,
  watchLogs,
  watchStates,
  type targetTypeValues,
} from "../../db/schema";
import {
  buildCommentNotificationContent,
  buildThreadCommentNotificationContent,
  buildContactJoinedNotificationContent,
  buildEpisodeNotificationContent,
  buildFollowAcceptedNotificationContent,
  buildFollowNotificationContent,
  buildFollowRequestNotificationContent,
  buildListFollowNotificationContent,
  buildLikeNotificationContent,
  categoryForNotificationType,
  EPISODE_DIGEST_LOCAL_HOUR,
  getLocalDateStringForTimezone,
  getLocalHourForTimezone,
  planPushesForRecipient,
  resolveNotificationPreferences,
  type NotificationType,
} from "../../lib/notificationContent";
import { db } from "./db";
import { createId } from "./ids";
import { getBlockedEitherWayIdSet } from "./privacy";
import { chunkForSqlParams } from "./sql-dialect";

const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const EXPO_PUSH_CHUNK_SIZE = 100;
const EXPO_RECEIPT_CHUNK_SIZE = 300;
// Expo asks that receipts be checked after ~15 minutes; give a margin.
const RECEIPT_CHECK_DELAY_MS = 30 * 60 * 1000;
// Tickets Expo never returned receipts for get dropped after two days.
const RECEIPT_EXPIRY_MS = 48 * 60 * 60 * 1000;

export type NotificationInput = {
  userId: string;
  type: NotificationType;
  actorId?: string | null;
  showId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
  dedupeKey?: string | null;
};

function expoHeaders() {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };
  // Only required when the Expo account has enhanced push security enabled.
  const accessToken = process.env.EXPO_ACCESS_TOKEN;
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return headers;
}

function isExpoPushToken(token: string) {
  return /^Expo(nent)?PushToken\[.+\]$/.test(token);
}

async function deletePushTokens(tokens: string[]) {
  if (tokens.length === 0) {
    return;
  }
  for (const chunk of chunkForSqlParams(tokens, 1)) {
    await db.delete(pushTokens).where(inArray(pushTokens.token, chunk));
  }
}

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: "default";
  badge?: number;
  channelId?: string;
};

// Send messages in Expo-sized chunks, record tickets for later receipt
// checks, and immediately drop tokens Expo reports as unregistered.
export async function sendExpoPushMessages(messages: ExpoPushMessage[]) {
  let sent = 0;
  const deadTokens: string[] = [];
  const ticketRows: Array<typeof pushTickets.$inferInsert> = [];

  for (let index = 0; index < messages.length; index += EXPO_PUSH_CHUNK_SIZE) {
    const chunk = messages.slice(index, index + EXPO_PUSH_CHUNK_SIZE);
    let payload: { data?: Array<Record<string, unknown>> };
    try {
      const response = await fetch(EXPO_PUSH_SEND_URL, {
        method: "POST",
        headers: expoHeaders(),
        body: JSON.stringify(chunk),
      });
      if (!response.ok) {
        console.warn("[notifications] Expo push send failed", response.status);
        continue;
      }
      payload = (await response.json()) as { data?: Array<Record<string, unknown>> };
    } catch (error) {
      console.warn("[notifications] Expo push send errored", error);
      continue;
    }

    const tickets = Array.isArray(payload.data) ? payload.data : [];
    tickets.forEach((ticket, ticketIndex) => {
      const message = chunk[ticketIndex];
      if (!message) {
        return;
      }
      if (ticket.status === "ok" && typeof ticket.id === "string") {
        sent += 1;
        ticketRows.push({
          id: createId("pushticket"),
          ticketId: ticket.id,
          token: message.to,
          createdAt: Date.now(),
        });
        return;
      }
      const errorCode = (ticket.details as { error?: string } | undefined)?.error;
      if (errorCode === "DeviceNotRegistered") {
        deadTokens.push(message.to);
      } else {
        console.warn("[notifications] Expo push ticket error", errorCode, ticket.message);
      }
    });
  }

  for (const chunk of chunkForSqlParams(ticketRows, 4)) {
    await db.insert(pushTickets).values(chunk);
  }
  await deletePushTokens(deadTokens);

  return { sent, pruned: deadTokens.length };
}

// Poll Expo for delivery receipts on tickets old enough to have settled;
// DeviceNotRegistered receipts prune the token so we stop pushing to it.
export async function checkExpoPushReceipts(now = Date.now()) {
  const dueRows = await db
    .select()
    .from(pushTickets)
    .where(lte(pushTickets.createdAt, now - RECEIPT_CHECK_DELAY_MS))
    .limit(EXPO_RECEIPT_CHUNK_SIZE);
  if (dueRows.length === 0) {
    return { checked: 0, pruned: 0 };
  }

  const tokenByTicketId = new Map(dueRows.map((row) => [row.ticketId, row.token] as const));
  let receipts: Record<string, { status?: string; details?: { error?: string } }> = {};
  try {
    const response = await fetch(EXPO_PUSH_RECEIPTS_URL, {
      method: "POST",
      headers: expoHeaders(),
      body: JSON.stringify({ ids: dueRows.map((row) => row.ticketId) }),
    });
    if (!response.ok) {
      console.warn("[notifications] Expo receipts fetch failed", response.status);
      return { checked: 0, pruned: 0 };
    }
    const payload = (await response.json()) as { data?: typeof receipts };
    receipts = payload.data ?? {};
  } catch (error) {
    console.warn("[notifications] Expo receipts fetch errored", error);
    return { checked: 0, pruned: 0 };
  }

  const deadTokens: string[] = [];
  const settledIds: string[] = [];
  for (const [ticketId, receipt] of Object.entries(receipts)) {
    settledIds.push(ticketId);
    if (receipt.status !== "ok") {
      const errorCode = receipt.details?.error;
      const token = tokenByTicketId.get(ticketId);
      if (errorCode === "DeviceNotRegistered" && token) {
        deadTokens.push(token);
      } else {
        console.warn("[notifications] Expo receipt error", ticketId, errorCode);
      }
    }
  }

  // Receipts Expo still hasn't produced stay queued until they expire.
  const expiredIds = dueRows
    .filter((row) => row.createdAt <= now - RECEIPT_EXPIRY_MS)
    .map((row) => row.ticketId)
    .filter((ticketId) => !settledIds.includes(ticketId));
  const doneIds = [...settledIds, ...expiredIds];
  for (const chunk of chunkForSqlParams(doneIds, 1)) {
    await db.delete(pushTickets).where(inArray(pushTickets.ticketId, chunk));
  }
  await deletePushTokens(deadTokens);

  return { checked: settledIds.length, pruned: deadTokens.length };
}

async function getUnreadCountsForUsers(userIds: string[]) {
  const counts = new Map<string, number>();
  for (const chunk of chunkForSqlParams(userIds, 1)) {
    const rows = await db
      .select({ userId: notifications.userId, value: count() })
      .from(notifications)
      .where(and(inArray(notifications.userId, chunk), isNull(notifications.readAt)))
      .groupBy(notifications.userId);
    for (const row of rows) {
      counts.set(row.userId, Number(row.value ?? 0));
    }
  }
  return counts;
}

// Persist inbox rows and push the ones that actually inserted (dedupe keys
// make reruns idempotent) to every device of each opted-in recipient.
export async function createNotificationsAndPush(inputs: NotificationInput[]) {
  if (inputs.length === 0) {
    return { created: 0, sent: 0 };
  }

  const rows = inputs.map((input) => ({
    id: createId("notif"),
    userId: input.userId,
    type: input.type,
    actorId: input.actorId ?? null,
    showId: input.showId ?? null,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    title: input.title,
    body: input.body,
    data: { ...(input.data ?? {}), type: input.type },
    dedupeKey: input.dedupeKey ?? null,
    readAt: null,
    createdAt: Date.now(),
  }));

  const insertedIds = new Set<string>();
  for (const chunk of chunkForSqlParams(rows, 14)) {
    const inserted = await db
      .insert(notifications)
      .values(chunk)
      .onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] })
      .returning({ id: notifications.id });
    for (const row of inserted) {
      insertedIds.add(row.id);
    }
  }

  const insertedRows = rows.filter((row) => insertedIds.has(row.id));
  if (insertedRows.length === 0) {
    return { created: 0, sent: 0 };
  }

  const recipientIds = Array.from(new Set(insertedRows.map((row) => row.userId)));
  const recipientRows: Array<typeof users.$inferSelect> = [];
  const tokenRows: Array<typeof pushTokens.$inferSelect> = [];
  for (const chunk of chunkForSqlParams(recipientIds, 1)) {
    const [userChunk, tokenChunk] = await Promise.all([
      db.select().from(users).where(inArray(users.id, chunk)),
      db.select().from(pushTokens).where(inArray(pushTokens.userId, chunk)),
    ]);
    recipientRows.push(...userChunk);
    tokenRows.push(...tokenChunk);
  }

  const prefsByUser = new Map(
    recipientRows.map((user) => [user.id, resolveNotificationPreferences(user.notificationPreferences)] as const),
  );
  const tokensByUser = new Map<string, Array<typeof pushTokens.$inferSelect>>();
  for (const token of tokenRows) {
    const list = tokensByUser.get(token.userId) ?? [];
    list.push(token);
    tokensByUser.set(token.userId, list);
  }

  const pushableByUser = new Map<string, typeof insertedRows>();
  for (const row of insertedRows) {
    const prefs = prefsByUser.get(row.userId);
    if (!prefs || !prefs[categoryForNotificationType(row.type)]) {
      continue;
    }
    if ((tokensByUser.get(row.userId) ?? []).length === 0) {
      continue;
    }
    const list = pushableByUser.get(row.userId) ?? [];
    list.push(row);
    pushableByUser.set(row.userId, list);
  }

  if (pushableByUser.size === 0) {
    return { created: insertedRows.length, sent: 0 };
  }

  const unreadCounts = await getUnreadCountsForUsers(Array.from(pushableByUser.keys()));
  const messages: ExpoPushMessage[] = [];
  for (const [userId, userRows] of pushableByUser) {
    const planned = planPushesForRecipient(userRows);
    const badge = unreadCounts.get(userId);
    for (const token of tokensByUser.get(userId) ?? []) {
      if (!isExpoPushToken(token.token)) {
        continue;
      }
      for (const push of planned) {
        messages.push({
          to: token.token,
          title: push.title,
          body: push.body,
          data: push.data,
          sound: "default",
          badge,
          channelId: "default",
        });
      }
    }
  }

  const { sent } = await sendExpoPushMessages(messages);
  return { created: insertedRows.length, sent };
}

function actorDisplayName(actor: typeof users.$inferSelect) {
  return actor.displayName ?? actor.username ?? actor.name ?? "Someone";
}

export async function resolveTargetOwner(targetType: string, targetId: string) {
  if (targetType === "review") {
    const rows = await db
      .select({ ownerId: reviews.authorId, showId: reviews.showId })
      .from(reviews)
      .where(eq(reviews.id, targetId))
      .limit(1);
    return rows[0] ?? null;
  }
  if (targetType === "log") {
    const rows = await db
      .select({ ownerId: watchLogs.userId, showId: watchLogs.showId })
      .from(watchLogs)
      .where(eq(watchLogs.id, targetId))
      .limit(1);
    return rows[0] ?? null;
  }
  if (targetType === "list") {
    const rows = await db
      .select({ ownerId: lists.ownerId })
      .from(lists)
      .where(eq(lists.id, targetId))
      .limit(1);
    return rows[0] ? { ownerId: rows[0].ownerId, showId: null } : null;
  }
  return null;
}

function targetUrl(targetType: string, targetId: string) {
  if (targetType === "review") {
    return `/review/${targetId}`;
  }
  if (targetType === "list") {
    return `/list/${targetId}`;
  }
  // Watch logs have no detail screen; the inbox row is the destination.
  return "/notifications";
}

// Comment notifications land on the conversation itself: logs have no detail
// screen, so they open the standalone /comments thread instead of dead-ending
// at the inbox.
function commentTargetUrl(targetType: string, targetId: string) {
  if (targetType === "log") {
    return `/comments?targetType=log&targetId=${encodeURIComponent(targetId)}`;
  }
  return targetUrl(targetType, targetId);
}

// The notify* helpers are best-effort: a push outage must never fail the
// social mutation that triggered it.

export async function notifyFollow(actor: typeof users.$inferSelect, followeeId: string) {
  try {
    if (followeeId === actor.id) {
      return;
    }
    const content = buildFollowNotificationContent(actorDisplayName(actor));
    await createNotificationsAndPush([
      {
        userId: followeeId,
        type: "follow",
        actorId: actor.id,
        title: content.title,
        body: content.body,
        data: { url: `/profile/${actor.id}`, actorId: actor.id },
        dedupeKey: `follow:${actor.id}`,
      },
    ]);
  } catch (error) {
    console.warn("[notifications] follow notification failed", error);
  }
}

// One notification per address-book owner when someone in their contacts
// joins Plotlist. The dedupe key is per (owner, joiner) pair with no time
// component, so an owner hears about a given joiner at most once ever —
// re-verifying a phone or re-attaching a number can't re-fire it.
export async function notifyContactsUserJoined(
  joinedUser: typeof users.$inferSelect,
  recipients: Array<{ ownerId: string; contactName: string }>,
) {
  try {
    const inputs: NotificationInput[] = recipients.flatMap((recipient) => {
      if (recipient.ownerId === joinedUser.id) {
        return [];
      }
      const content = buildContactJoinedNotificationContent(recipient.contactName);
      return [
        {
          userId: recipient.ownerId,
          type: "contact_joined" as const,
          actorId: joinedUser.id,
          title: content.title,
          body: content.body,
          data: { url: `/profile/${joinedUser.id}`, actorId: joinedUser.id },
          dedupeKey: `contact_joined:${joinedUser.id}`,
        },
      ];
    });
    await createNotificationsAndPush(inputs);
  } catch (error) {
    console.warn("[notifications] contact joined notification failed", error);
  }
}

export async function notifyListFollow(
  actor: typeof users.$inferSelect,
  ownerId: string,
  listId: string,
  listTitle: string,
) {
  try {
    if (ownerId === actor.id) {
      return;
    }
    const content = buildListFollowNotificationContent(actorDisplayName(actor), listTitle);
    await createNotificationsAndPush([
      {
        userId: ownerId,
        type: "list_follow",
        actorId: actor.id,
        targetType: "list",
        targetId: listId,
        title: content.title,
        body: content.body,
        data: { url: `/list/${listId}`, targetType: "list", targetId: listId, actorId: actor.id },
        dedupeKey: `list_follow:${actor.id}:${listId}`,
      },
    ]);
  } catch (error) {
    console.warn("[notifications] list follow notification failed", error);
  }
}

export async function notifyFollowRequest(
  actor: typeof users.$inferSelect,
  targetId: string,
) {
  try {
    if (targetId === actor.id) {
      return;
    }
    const content = buildFollowRequestNotificationContent(actorDisplayName(actor));
    await createNotificationsAndPush([
      {
        userId: targetId,
        type: "follow_request",
        actorId: actor.id,
        title: content.title,
        body: content.body,
        data: { url: "/follow-requests", actorId: actor.id },
        dedupeKey: `follow_request:${actor.id}`,
      },
    ]);
  } catch (error) {
    console.warn("[notifications] follow request notification failed", error);
  }
}

export async function notifyFollowAccepted(
  actor: typeof users.$inferSelect,
  requesterId: string,
) {
  try {
    if (requesterId === actor.id) {
      return;
    }
    const content = buildFollowAcceptedNotificationContent(actorDisplayName(actor));
    await createNotificationsAndPush([
      {
        userId: requesterId,
        type: "follow_accepted",
        actorId: actor.id,
        title: content.title,
        body: content.body,
        data: { url: `/profile/${actor.id}`, actorId: actor.id },
        dedupeKey: `follow_accepted:${actor.id}`,
      },
    ]);
  } catch (error) {
    console.warn("[notifications] follow accepted notification failed", error);
  }
}

export async function notifyLike(
  actor: typeof users.$inferSelect,
  targetType: string,
  targetId: string,
) {
  try {
    const target = await resolveTargetOwner(targetType, targetId);
    if (!target || target.ownerId === actor.id) {
      return;
    }
    const content = buildLikeNotificationContent(actorDisplayName(actor), targetType);
    await createNotificationsAndPush([
      {
        userId: target.ownerId,
        type: "like",
        actorId: actor.id,
        showId: target.showId ?? null,
        targetType,
        targetId,
        title: content.title,
        body: content.body,
        data: { url: targetUrl(targetType, targetId), targetType, targetId, actorId: actor.id },
        dedupeKey: `like:${actor.id}:${targetType}:${targetId}`,
      },
    ]);
  } catch (error) {
    console.warn("[notifications] like notification failed", error);
  }
}

// Cap on how many thread participants hear about one comment; a runaway
// thread must not turn a single comment into an unbounded push fan-out.
const THREAD_NOTIFY_MAX_PARTICIPANTS = 20;

export async function notifyComment(
  actor: typeof users.$inferSelect,
  targetType: string,
  targetId: string,
  commentId: string,
  commentText: string,
) {
  try {
    const target = await resolveTargetOwner(targetType, targetId);
    if (!target) {
      return;
    }
    const shared = {
      actorId: actor.id,
      showId: target.showId ?? null,
      targetType,
      targetId,
      data: { url: commentTargetUrl(targetType, targetId), targetType, targetId, actorId: actor.id },
      // Per-comment key; the unique index is (userId, dedupeKey), so the same
      // key fans out to every recipient exactly once.
      dedupeKey: `comment:${commentId}`,
    };
    const inputs: NotificationInput[] = [];
    if (target.ownerId !== actor.id) {
      const content = buildCommentNotificationContent(
        actorDisplayName(actor),
        targetType,
        commentText,
      );
      inputs.push({
        userId: target.ownerId,
        type: "comment",
        title: content.title,
        body: content.body,
        ...shared,
      });
    }
    // Everyone else already in the thread hears about the new comment too —
    // without this, conversations die after the owner's first reply. Runs
    // after the new comment is inserted, so the actor filters themselves out.
    const priorCommenterRows = await db
      .selectDistinct({ authorId: comments.authorId })
      .from(comments)
      .where(
        and(
          eq(comments.targetType, targetType as (typeof targetTypeValues)[number]),
          eq(comments.targetId, targetId),
        ),
      );
    const participantIds = priorCommenterRows
      .map((row) => row.authorId)
      .filter((id) => id !== actor.id && id !== target.ownerId)
      .slice(0, THREAD_NOTIFY_MAX_PARTICIPANTS);
    if (participantIds.length > 0) {
      const blockedIds = await getBlockedEitherWayIdSet(actor.id, participantIds);
      const threadContent = buildThreadCommentNotificationContent(
        actorDisplayName(actor),
        targetType,
        commentText,
      );
      for (const userId of participantIds) {
        if (blockedIds.has(userId)) {
          continue;
        }
        inputs.push({
          userId,
          type: "comment",
          title: threadContent.title,
          body: threadContent.body,
          ...shared,
        });
      }
    }
    await createNotificationsAndPush(inputs);
  } catch (error) {
    console.warn("[notifications] comment notification failed", error);
  }
}

// Hourly cron: for every user whose device timezone just hit the digest hour,
// find today's release events for shows they're watching and notify once per
// show per air date. Dedupe keys make repeated runs no-ops.
export async function runEpisodeAirNotifications(now = new Date()) {
  const tokenRows = await db
    .select({ userId: pushTokens.userId, timezone: pushTokens.timezone })
    .from(pushTokens);

  const localDateByUser = new Map<string, string>();
  for (const token of tokenRows) {
    if (localDateByUser.has(token.userId)) {
      continue;
    }
    const hour = getLocalHourForTimezone(token.timezone, now);
    if (hour !== EPISODE_DIGEST_LOCAL_HOUR) {
      continue;
    }
    const localDate = getLocalDateStringForTimezone(token.timezone, now);
    if (localDate) {
      localDateByUser.set(token.userId, localDate);
    }
  }

  if (localDateByUser.size === 0) {
    return { users: 0, created: 0, sent: 0 };
  }

  const airDates = Array.from(new Set(localDateByUser.values()));
  const eventRows = await db
    .select()
    .from(releaseEvents)
    .where(inArray(releaseEvents.airDate, airDates));
  if (eventRows.length === 0) {
    return { users: localDateByUser.size, created: 0, sent: 0 };
  }

  const eventsByShow = new Map<string, Array<typeof releaseEvents.$inferSelect>>();
  for (const event of eventRows) {
    const list = eventsByShow.get(event.showId) ?? [];
    list.push(event);
    eventsByShow.set(event.showId, list);
  }
  const eventShowIds = Array.from(eventsByShow.keys());
  const userIds = Array.from(localDateByUser.keys());

  const watchingRows: Array<{ userId: string; showId: string }> = [];
  for (const showChunk of chunkForSqlParams(eventShowIds, 1, 40)) {
    for (const userChunk of chunkForSqlParams(userIds, 1, 40)) {
      const rows = await db
        .select({ userId: watchStates.userId, showId: watchStates.showId })
        .from(watchStates)
        .where(
          and(
            eq(watchStates.status, "watching"),
            inArray(watchStates.showId, showChunk),
            inArray(watchStates.userId, userChunk),
          ),
        );
      watchingRows.push(...rows);
    }
  }
  if (watchingRows.length === 0) {
    return { users: localDateByUser.size, created: 0, sent: 0 };
  }

  const watchedShowIds = Array.from(new Set(watchingRows.map((row) => row.showId)));
  const showRows: Array<typeof shows.$inferSelect> = [];
  for (const chunk of chunkForSqlParams(watchedShowIds, 1)) {
    showRows.push(...(await db.select().from(shows).where(inArray(shows.id, chunk))));
  }
  const showById = new Map(showRows.map((show) => [show.id, show] as const));

  const inputs: NotificationInput[] = [];
  for (const row of watchingRows) {
    const localDate = localDateByUser.get(row.userId);
    const show = showById.get(row.showId);
    if (!localDate || !show) {
      continue;
    }
    const events = (eventsByShow.get(row.showId) ?? []).filter(
      (event) => event.airDate === localDate,
    );
    const content = buildEpisodeNotificationContent({
      showId: row.showId,
      showTitle: show.title,
      airDate: localDate,
      events,
    });
    if (!content) {
      continue;
    }
    inputs.push({
      userId: row.userId,
      type: "episode",
      showId: row.showId,
      title: content.title,
      body: content.body,
      dedupeKey: content.dedupeKey,
      data: {
        url: `/show/${row.showId}`,
        showId: row.showId,
        seasonNumber: content.seasonNumber,
        episodeNumber: content.episodeNumber,
        airDate: localDate,
      },
    });
  }

  const result = await createNotificationsAndPush(inputs);
  return { users: localDateByUser.size, ...result };
}

// TTL cleanup: old read notifications; called from the cleanup cron.
export async function cleanupOldNotifications(now = Date.now()) {
  const cutoff = now - 90 * 24 * 60 * 60 * 1000;
  const deleted = await db
    .delete(notifications)
    .where(and(lte(notifications.createdAt, cutoff), sql`${notifications.readAt} is not null`))
    .returning({ id: notifications.id });
  return { deleted: deleted.length };
}

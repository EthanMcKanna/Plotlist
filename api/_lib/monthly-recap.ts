// Monthly recap push: a mini-wrapped notification on the 1st of each month
// for Pro users — last month's episodes/hours/top show, deep-linking to
// /me/stats. Rides the hourly notifications cron and follows the episode
// digest's per-timezone pattern: enumerate push tokens, the most recently
// updated token per user wins, send when that timezone's local wall clock
// hits the recap hour. Idempotent across reruns via dedupe key
// `monthly_recap:<YYYY-MM>`.

import { desc, inArray } from "drizzle-orm";

import { pushTokens, users } from "../../db/schema";
import {
  buildMonthlyRecapNotificationContent,
  getLocalDateStringForTimezone,
  getLocalHourForTimezone,
  getUtcOffsetMinutesForTimezone,
  resolveNotificationPreferences,
} from "../../lib/notificationContent";
import { db } from "./db";
import { createNotificationsAndPush, type NotificationInput } from "./notifications";
import { userHasPro } from "./pro";
import { chunkForSqlParams } from "./sql-dialect";
import { getMonthlyRecapForUser } from "./watch-insights";

// Mid-morning local: late enough to feel like a "your month" moment, early
// enough to land before the evening episode digest.
export const MONTHLY_RECAP_LOCAL_HOUR = 10;

// Each qualifying user costs a full insights load, so bound the per-tick
// batch. Timezones already spread users across hourly ticks; the dedupe key
// makes any spillover safe to pick up next tick... except recap eligibility
// is hour-gated, so keep the cap generous.
const MAX_RECAPS_PER_TICK = 200;

export async function runMonthlyRecapNotifications(now = new Date()) {
  // Cheap gate: some timezone can be on the 1st only near a UTC month
  // boundary (UTC+14 enters the 1st at 10:00 UTC on the last day; UTC-12
  // leaves it at 12:00 UTC on the 2nd).
  const utcDay = now.getUTCDate();
  const lastUtcDayOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  if (utcDay > 2 && utcDay < lastUtcDayOfMonth) {
    return { users: 0, created: 0, sent: 0 };
  }

  const tokenRows = await db
    .select({ userId: pushTokens.userId, timezone: pushTokens.timezone })
    .from(pushTokens)
    .orderBy(desc(pushTokens.updatedAt));

  const timezoneByUser = new Map<string, string>();
  for (const row of tokenRows) {
    if (timezoneByUser.has(row.userId) || !row.timezone) continue;
    timezoneByUser.set(row.userId, row.timezone);
  }

  const dueUserIds: string[] = [];
  for (const [userId, timezone] of timezoneByUser) {
    const localDate = getLocalDateStringForTimezone(timezone, now);
    if (!localDate || !localDate.endsWith("-01")) continue;
    if (getLocalHourForTimezone(timezone, now) !== MONTHLY_RECAP_LOCAL_HOUR) continue;
    dueUserIds.push(userId);
  }
  if (dueUserIds.length === 0) {
    return { users: 0, created: 0, sent: 0 };
  }

  const userById = new Map<string, typeof users.$inferSelect>();
  for (const chunk of chunkForSqlParams(dueUserIds, 1)) {
    for (const row of await db.select().from(users).where(inArray(users.id, chunk))) {
      userById.set(row.id, row);
    }
  }

  const inputs: NotificationInput[] = [];
  let processed = 0;
  for (const userId of dueUserIds) {
    if (processed >= MAX_RECAPS_PER_TICK) break;
    const user = userById.get(userId);
    if (!user || !userHasPro(user)) continue;
    if (!resolveNotificationPreferences(user.notificationPreferences).recaps) continue;
    processed += 1;
    try {
      const timezone = timezoneByUser.get(userId)!;
      const utcOffsetMinutes = getUtcOffsetMinutesForTimezone(timezone, now) ?? 0;
      const recap = await getMonthlyRecapForUser(userId, utcOffsetMinutes, now.getTime());
      if (!recap) continue;
      const content = buildMonthlyRecapNotificationContent({
        monthKey: recap.monthKey,
        monthLabel: recap.monthLabel,
        episodes: recap.episodes,
        minutes: recap.minutes,
        shows: recap.shows,
        topShowTitle: recap.topShow?.title ?? null,
      });
      if (!content) continue;
      inputs.push({
        userId,
        type: "monthly_recap",
        title: content.title,
        body: content.body,
        dedupeKey: content.dedupeKey,
        data: { url: "/me/stats" },
      });
    } catch (error) {
      console.warn("[recap] failed for user", userId, error);
    }
  }

  const result = await createNotificationsAndPush(inputs);
  if (inputs.length > 0) {
    console.info("[recap] monthly", `due=${dueUserIds.length}`, `built=${inputs.length}`, `sent=${result.sent}`);
  }
  return { users: inputs.length, ...result };
}

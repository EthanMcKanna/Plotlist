import { and, eq, gte, inArray, asc } from "drizzle-orm";

import {
  releaseEvents,
  shows,
  userTastePreferences,
  users,
  watchStates,
} from "../../db/schema";
import { formatEpisodeCode } from "../../lib/notificationContent";
import { getReleaseCalendarShowIds } from "../../lib/releaseCalendar";
import { hmacSha256, safeEqual } from "./crypto";
import { db } from "./db";
import { getServerEnv } from "./env";
import { ApiError } from "./errors";

// Personal iCal feed (Plotlist Pro). The token is a long-lived HMAC over the
// user id — same signing scheme as upload tokens but without an expiry, since
// calendar apps poll the URL indefinitely. Pro is re-checked on every fetch.

type CalendarFeedTokenPayload = {
  userId: string;
  purpose: "calendar-feed";
};

function signPayload(encodedPayload: string) {
  return hmacSha256(encodedPayload, getServerEnv().JWT_SECRET);
}

export function createCalendarFeedToken(userId: string) {
  const payload: CalendarFeedTokenPayload = { userId, purpose: "calendar-feed" };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function verifyCalendarFeedToken(token: string): string {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature || !safeEqual(signature, signPayload(encodedPayload))) {
    throw new ApiError(401, "invalid_feed_token", "Invalid calendar feed token");
  }
  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8"),
  ) as CalendarFeedTokenPayload;
  if (!payload.userId || payload.purpose !== "calendar-feed") {
    throw new ApiError(401, "invalid_feed_token", "Invalid calendar feed token");
  }
  return payload.userId;
}

// RFC 5545: escape text values and fold long content lines at 74 octets.
function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function foldIcsLine(line: string) {
  if (line.length <= 74) {
    return line;
  }
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length > 0) {
    parts.push(` ${rest.slice(0, 73)}`);
    rest = rest.slice(73);
  }
  return parts.join("\r\n");
}

const FEED_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const FEED_MAX_EVENTS = 300;

export async function buildIcalFeedForUser(userId: string): Promise<string> {
  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = userRows[0];
  if (!user) {
    throw new ApiError(404, "user_not_found", "Account no longer exists");
  }

  const [states, tasteRows] = await Promise.all([
    db.select().from(watchStates).where(eq(watchStates.userId, userId)),
    db
      .select()
      .from(userTastePreferences)
      .where(eq(userTastePreferences.userId, userId))
      .limit(1),
  ]);
  const favoriteIds = new Set<string>([
    ...(user.favoriteShowIds ?? []),
    ...(tasteRows[0]?.favoriteShowIds ?? []),
  ]);
  const showIds = getReleaseCalendarShowIds({
    states,
    favoriteShowIds: [...favoriteIds],
  });

  const nowMs = Date.now();
  let eventRows: Array<typeof releaseEvents.$inferSelect> = [];
  let showRows: Array<Pick<typeof shows.$inferSelect, "id" | "title">> = [];
  if (showIds.length > 0) {
    eventRows = await db
      .select()
      .from(releaseEvents)
      .where(
        and(
          inArray(releaseEvents.showId, showIds.slice(0, FEED_MAX_EVENTS)),
          gte(releaseEvents.airDateTs, nowMs - FEED_LOOKBACK_MS),
        ),
      )
      .orderBy(asc(releaseEvents.airDateTs))
      .limit(FEED_MAX_EVENTS);
    const eventShowIds = Array.from(new Set(eventRows.map((row) => row.showId)));
    if (eventShowIds.length > 0) {
      showRows = await db
        .select({ id: shows.id, title: shows.title })
        .from(shows)
        .where(inArray(shows.id, eventShowIds));
    }
  }
  const titleByShowId = new Map(showRows.map((row) => [row.id, row.title] as const));

  const dtstamp = `${new Date(nowMs).toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Plotlist//Release Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Plotlist — New episodes",
    "X-WR-CALDESC:Upcoming episodes for the shows you track on Plotlist.",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
  ];

  for (const event of eventRows) {
    const title = titleByShowId.get(event.showId);
    if (!title) {
      continue;
    }
    const code = formatEpisodeCode(event.seasonNumber, event.episodeNumber);
    const marker = event.isSeriesFinale
      ? " (Series finale)"
      : event.isSeasonFinale
        ? " (Season finale)"
        : event.isPremiere
          ? " (Premiere)"
          : event.isReturningSeason
            ? " (Season premiere)"
            : "";
    const episodeTitle = event.episodeTitle?.trim();
    const summary = `${title} ${code}${marker}`;
    const dateDigits = event.airDate.replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      foldIcsLine(`UID:plotlist-${event.showId}-s${event.seasonNumber}e${event.episodeNumber}@plotlist.app`),
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${dateDigits}`,
      foldIcsLine(`SUMMARY:${escapeIcsText(summary)}`),
      ...(episodeTitle
        ? [foldIcsLine(`DESCRIPTION:${escapeIcsText(`“${episodeTitle}” airs today.`)}`)]
        : []),
      foldIcsLine(`URL:https://plotlist.app/show/${event.showId}`),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

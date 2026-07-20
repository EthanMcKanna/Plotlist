import { and, eq, inArray } from "drizzle-orm";

import {
  showNotificationMutes,
  showProviderAvailability,
  shows,
  tmdbDetailsCache,
  users,
  watchStates,
} from "../../db/schema";
import {
  buildStreamingArrivalNotificationContent,
  resolveNotificationPreferences,
} from "../../lib/notificationContent";
import { extractTmdbReleaseProviders } from "../../lib/releaseCalendar";
import { STREAMING_PROVIDER_OPTIONS } from "../../lib/streamingProviders";
import { db } from "./db";
import { createNotificationsAndPush, type NotificationInput } from "./notifications";
import { userHasPro } from "./pro";
import { chunkForSqlParams } from "./sql-dialect";

const PROVIDER_LABEL_BY_KEY = new Map(
  STREAMING_PROVIDER_OPTIONS.map((option) => [option.key, option.label] as const),
);

// TMDB provider display names → Plotlist provider keys. Contains-matching
// absorbs TMDB naming churn ("Netflix Standard with Ads", "Paramount Plus",
// "Peacock Premium", channel bundles, …); anything unmapped is ignored.
export function providerKeyForTmdbName(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.includes("cinemax")) return null;
  if (lower.includes("netflix")) return "netflix";
  if (lower.includes("apple tv")) return "apple_tv";
  if (lower.includes("disney")) return "disney_plus";
  if (lower.includes("hulu")) return "hulu";
  if (lower.includes("peacock")) return "peacock";
  if (lower.includes("prime video")) return "prime_video";
  if (lower.includes("paramount")) return "paramount_plus";
  if (lower.includes("mgm")) return "mgm_plus";
  if (lower === "max" || lower.startsWith("max ") || lower.includes("hbo max")) {
    return "max";
  }
  return null;
}

export function extractProviderKeys(details: unknown): string[] {
  const keys = new Set<string>();
  for (const provider of extractTmdbReleaseProviders(details)) {
    const key = providerKeyForTmdbName(provider.name);
    if (key) {
      keys.add(key);
    }
  }
  return [...keys].sort();
}

// Cron pass: diff each watchlisted show's US streaming providers against the
// last-seen snapshot and tell Pro watchlisters when a show lands on one of
// their own services. First sighting of a show only seeds the snapshot —
// otherwise every existing catalog entry would "arrive" at once.
export async function runStreamingArrivalNotifications(
  now = Date.now(),
  limit = 150,
) {
  const watchlistShowRows = await db
    .selectDistinct({ showId: watchStates.showId })
    .from(watchStates)
    .where(eq(watchStates.status, "watchlist" as any));
  const watchlistShowIds = watchlistShowRows.map((row) => row.showId);
  if (watchlistShowIds.length === 0) {
    return { checked: 0, arrivals: 0, created: 0, sent: 0 };
  }

  const showRows: Array<
    Pick<typeof shows.$inferSelect, "id" | "externalSource" | "externalId" | "title">
  > = [];
  for (const chunk of chunkForSqlParams(watchlistShowIds, 1)) {
    showRows.push(
      ...(await db
        .select({
          id: shows.id,
          externalSource: shows.externalSource,
          externalId: shows.externalId,
          title: shows.title,
        })
        .from(shows)
        .where(inArray(shows.id, chunk))),
    );
  }

  const snapshotByShowId = new Map<
    string,
    { providerKeys: string[]; updatedAt: number }
  >();
  for (const chunk of chunkForSqlParams(watchlistShowIds, 1)) {
    const rows = await db
      .select()
      .from(showProviderAvailability)
      .where(inArray(showProviderAvailability.showId, chunk));
    for (const row of rows) {
      snapshotByShowId.set(row.showId, {
        providerKeys: row.providerKeys ?? [],
        updatedAt: row.updatedAt,
      });
    }
  }

  // Only re-read payloads for shows whose TMDB cache is fresher than our
  // snapshot — payloads are large, and the hourly release cron only refreshes
  // a handful of shows per tick anyway.
  const tmdbShows = showRows.filter((show) => show.externalSource === "tmdb");
  const cacheMetaByExternalId = new Map<string, number>();
  for (const chunk of chunkForSqlParams(
    tmdbShows.map((show) => show.externalId),
    1,
  )) {
    const rows = await db
      .select({
        externalId: tmdbDetailsCache.externalId,
        fetchedAt: tmdbDetailsCache.fetchedAt,
      })
      .from(tmdbDetailsCache)
      .where(
        and(
          eq(tmdbDetailsCache.externalSource, "tmdb"),
          inArray(tmdbDetailsCache.externalId, chunk),
        ),
      );
    for (const row of rows) {
      cacheMetaByExternalId.set(row.externalId, row.fetchedAt);
    }
  }

  const candidates = tmdbShows
    .filter((show) => {
      const fetchedAt = cacheMetaByExternalId.get(show.externalId);
      if (!fetchedAt) {
        return false;
      }
      const snapshot = snapshotByShowId.get(show.id);
      return !snapshot || fetchedAt > snapshot.updatedAt;
    })
    .slice(0, limit);
  if (candidates.length === 0) {
    return { checked: 0, arrivals: 0, created: 0, sent: 0 };
  }

  const arrivals: Array<{ showId: string; title: string; newKeys: string[] }> = [];
  for (const batch of chunkForSqlParams(
    candidates.map((show) => show.externalId),
    1,
    25,
  )) {
    const rows = await db
      .select({
        externalId: tmdbDetailsCache.externalId,
        payload: tmdbDetailsCache.payload,
      })
      .from(tmdbDetailsCache)
      .where(
        and(
          eq(tmdbDetailsCache.externalSource, "tmdb"),
          inArray(tmdbDetailsCache.externalId, batch),
        ),
      );
    for (const row of rows) {
      const show = candidates.find((item) => item.externalId === row.externalId);
      if (!show) {
        continue;
      }
      const keys = extractProviderKeys(row.payload);
      const snapshot = snapshotByShowId.get(show.id);
      if (snapshot) {
        const previous = new Set(snapshot.providerKeys);
        const newKeys = keys.filter((key) => !previous.has(key));
        if (newKeys.length > 0) {
          arrivals.push({ showId: show.id, title: show.title, newKeys });
        }
        await db
          .update(showProviderAvailability)
          .set({ providerKeys: keys, updatedAt: now })
          .where(eq(showProviderAvailability.showId, show.id));
      } else {
        await db
          .insert(showProviderAvailability)
          .values({ showId: show.id, providerKeys: keys, updatedAt: now })
          .onConflictDoNothing();
      }
    }
  }
  if (arrivals.length === 0) {
    return { checked: candidates.length, arrivals: 0, created: 0, sent: 0 };
  }

  const arrivalShowIds = arrivals.map((arrival) => arrival.showId);
  const watchers: Array<{ userId: string; showId: string }> = [];
  for (const chunk of chunkForSqlParams(arrivalShowIds, 1)) {
    watchers.push(
      ...(await db
        .select({ userId: watchStates.userId, showId: watchStates.showId })
        .from(watchStates)
        .where(
          and(
            eq(watchStates.status, "watchlist" as any),
            inArray(watchStates.showId, chunk),
          ),
        )),
    );
  }
  const watcherIds = Array.from(new Set(watchers.map((row) => row.userId)));

  const userById = new Map<string, typeof users.$inferSelect>();
  for (const chunk of chunkForSqlParams(watcherIds, 1)) {
    for (const row of await db.select().from(users).where(inArray(users.id, chunk))) {
      userById.set(row.id, row);
    }
  }

  const mutedPairs = new Set<string>();
  for (const chunk of chunkForSqlParams(watcherIds, 1)) {
    const rows = await db
      .select({
        userId: showNotificationMutes.userId,
        showId: showNotificationMutes.showId,
      })
      .from(showNotificationMutes)
      .where(inArray(showNotificationMutes.userId, chunk));
    for (const row of rows) {
      mutedPairs.add(`${row.userId}:${row.showId}`);
    }
  }

  const arrivalByShowId = new Map(arrivals.map((a) => [a.showId, a] as const));
  const inputs: NotificationInput[] = [];
  for (const watcher of watchers) {
    const arrival = arrivalByShowId.get(watcher.showId);
    const user = userById.get(watcher.userId);
    if (!arrival || !user || mutedPairs.has(`${watcher.userId}:${watcher.showId}`)) {
      continue;
    }
    if (!userHasPro(user)) {
      continue;
    }
    if (!resolveNotificationPreferences(user.notificationPreferences).streaming) {
      continue;
    }
    const myProviders = new Set(user.streamingProviders ?? []);
    const matched = arrival.newKeys.filter((key) => myProviders.has(key));
    if (matched.length === 0) {
      continue;
    }
    const content = buildStreamingArrivalNotificationContent({
      showId: arrival.showId,
      showTitle: arrival.title,
      providerKeys: matched,
      providerLabels: matched.map(
        (key) => PROVIDER_LABEL_BY_KEY.get(key) ?? key,
      ),
    });
    if (!content) {
      continue;
    }
    inputs.push({
      userId: watcher.userId,
      type: "streaming",
      showId: arrival.showId,
      title: content.title,
      body: content.body,
      dedupeKey: content.dedupeKey,
      data: { url: `/show/${arrival.showId}`, showId: arrival.showId },
    });
  }

  const result = await createNotificationsAndPush(inputs);
  return { checked: candidates.length, arrivals: arrivals.length, ...result };
}

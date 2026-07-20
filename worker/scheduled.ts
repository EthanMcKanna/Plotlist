import { cleanupExpiredTmdbCache, cleanupExpiredAuthArtifacts } from "../api/_lib/jobs";
import {
  checkExpoPushReceipts,
  cleanupOldNotifications,
  runEpisodeAirNotifications,
} from "../api/_lib/notifications";
import {
  deleteExpiredReleaseEvents,
  refreshStaleTrackedReleases,
} from "../api/_lib/release-refresh";
import { runStreamingArrivalNotifications } from "../api/_lib/streaming-arrivals";
import { refreshStaleHomeCatalogCategories } from "../api/_lib/rpc";
import { runEmbeddingRefreshTick } from "../api/_lib/embedding-refresh";
import { runShowIngestTick } from "../api/_lib/show-ingest";
import {
  cleanupTraktImportArtifacts,
  runTraktImportCronTick,
} from "../api/_lib/trakt-import";

// Consolidated cron dispatch (six schedules):
//   * * * * *       — bulk catalog ingest: drain due show_ingest_state rows
//                     (backfill by popularity, then tiered freshness refresh)
//                     plus an hourly /tv/changes sync piggybacked on the tick
//   */20 * * * *    — refresh every stale home catalog category (whole surface
//                     converges to fresh each tick on the Workers Paid plan)
//   40 * * * *      — refresh release calendars for tracked shows
//   10 * * * *      — episode-tonight pushes for timezones hitting the digest
//                     hour, then settle pending Expo push receipts
//   5 */6 * * *     — TTL cleanup for caches, sessions, OTPs, rate limits
//   2-57/5 * * * *  — recs v2: re-embed shows nominated stale by ingest
//                     (Gemini + Vectorize; daily token budget guard inside)
export const SHOW_INGEST_CRON = "* * * * *";
export const CATALOG_ROTATE_CRON = "*/20 * * * *";
export const RELEASE_REFRESH_CRON = "40 * * * *";
export const NOTIFICATIONS_CRON = "10 * * * *";
export const CLEANUP_CRON = "5 */6 * * *";
export const EMBEDDING_REFRESH_CRON = "2-57/5 * * * *";

const CATALOG_CATEGORIES_PER_TICK = 16;
const RELEASE_SHOWS_PER_TICK = 12;
const INGEST_SHOWS_PER_TICK = 200;
const EMBEDDING_SHOWS_PER_TICK = 40;

export async function runScheduledTasks(cron: string) {
  try {
    if (cron === SHOW_INGEST_CRON) {
      // Trakt imports ride the minute cron so a user's import keeps moving
      // after they close the app. It runs first (a user is actively waiting
      // on it) and never blocks ingest on failure.
      const traktSummary = await runTraktImportCronTick().catch((error) => {
        console.error("[cron] trakt import tick failed", error);
        return { ran: false as const };
      });
      if (traktSummary.ran) {
        console.info("[cron] trakt import", traktSummary);
      }
      const summary = await runShowIngestTick(INGEST_SHOWS_PER_TICK);
      if (summary.selected > 0 || summary.changesSynced !== null) {
        console.info("[cron] show ingest", summary);
      }
      return;
    }

    if (cron === CATALOG_ROTATE_CRON) {
      const summary = await refreshStaleHomeCatalogCategories(CATALOG_CATEGORIES_PER_TICK);
      console.info("[cron] home catalog rotate", summary);
      return;
    }

    if (cron === RELEASE_REFRESH_CRON) {
      const summary = await refreshStaleTrackedReleases(RELEASE_SHOWS_PER_TICK);
      console.info("[cron] tracked release refresh", summary);
      return;
    }

    if (cron === NOTIFICATIONS_CRON) {
      const digest = await runEpisodeAirNotifications();
      // Rides the same hourly tick; cheap because it only re-reads provider
      // payloads for shows whose TMDB cache refreshed since the last pass.
      const streaming = await runStreamingArrivalNotifications().catch((error) => {
        console.error("[cron] streaming arrivals failed", error);
        return null;
      });
      const receipts = await checkExpoPushReceipts();
      console.info("[cron] notifications", { digest, streaming, receipts });
      return;
    }

    if (cron === EMBEDDING_REFRESH_CRON) {
      const summary = await runEmbeddingRefreshTick(EMBEDDING_SHOWS_PER_TICK);
      if ((summary as any).processed || (summary as any).skipped) {
        console.info("[cron] embedding refresh", summary);
      }
      return;
    }

    if (cron === CLEANUP_CRON) {
      const [tmdb, releases, auth, notifications, trakt] = await Promise.all([
        cleanupExpiredTmdbCache(),
        deleteExpiredReleaseEvents(),
        cleanupExpiredAuthArtifacts(),
        cleanupOldNotifications(),
        cleanupTraktImportArtifacts(),
      ]);
      console.info("[cron] cleanup", { tmdb, releases, auth, notifications, trakt });
      return;
    }

    console.warn("[cron] no task mapped for schedule", cron);
  } catch (error) {
    console.error("[cron] scheduled task failed", cron, error);
    throw error;
  }
}

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
import { refreshStaleHomeCatalogCategories } from "../api/_lib/rpc";
import { runShowIngestTick } from "../api/_lib/show-ingest";

// Consolidated cron dispatch (five schedules):
//   * * * * *     — bulk catalog ingest: drain due show_ingest_state rows
//                   (backfill by popularity, then tiered freshness refresh)
//                   plus an hourly /tv/changes sync piggybacked on the tick
//   */20 * * * *  — refresh every stale home catalog category (whole surface
//                   converges to fresh each tick on the Workers Paid plan)
//   40 * * * *    — refresh release calendars for tracked shows
//   10 * * * *    — episode-tonight pushes for timezones hitting the digest
//                   hour, then settle pending Expo push receipts
//   5 */6 * * *   — TTL cleanup for caches, sessions, OTPs, rate limits
export const SHOW_INGEST_CRON = "* * * * *";
export const CATALOG_ROTATE_CRON = "*/20 * * * *";
export const RELEASE_REFRESH_CRON = "40 * * * *";
export const NOTIFICATIONS_CRON = "10 * * * *";
export const CLEANUP_CRON = "5 */6 * * *";

const CATALOG_CATEGORIES_PER_TICK = 16;
const RELEASE_SHOWS_PER_TICK = 12;
const INGEST_SHOWS_PER_TICK = 200;

export async function runScheduledTasks(cron: string) {
  try {
    if (cron === SHOW_INGEST_CRON) {
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
      const receipts = await checkExpoPushReceipts();
      console.info("[cron] notifications", { digest, receipts });
      return;
    }

    if (cron === CLEANUP_CRON) {
      const [tmdb, releases, auth, notifications] = await Promise.all([
        cleanupExpiredTmdbCache(),
        deleteExpiredReleaseEvents(),
        cleanupExpiredAuthArtifacts(),
        cleanupOldNotifications(),
      ]);
      console.info("[cron] cleanup", { tmdb, releases, auth, notifications });
      return;
    }

    console.warn("[cron] no task mapped for schedule", cron);
  } catch (error) {
    console.error("[cron] scheduled task failed", cron, error);
    throw error;
  }
}

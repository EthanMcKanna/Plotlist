import { cleanupExpiredTmdbCache, cleanupExpiredAuthArtifacts } from "../api/_lib/jobs";
import {
  deleteExpiredReleaseEvents,
  refreshStaleTrackedReleases,
} from "../api/_lib/release-refresh";
import { refreshStaleHomeCatalogCategories } from "../api/_lib/rpc";

// Consolidated cron dispatch. The Workers free plan allows five schedules, so
// the nine legacy Vercel cron endpoints collapse into three rotations:
//   */20 * * * *  — refresh the stalest home catalog categories (4 per tick,
//                   16 categories total, 6h TTL → whole surface stays fresh)
//   40 * * * *    — refresh release calendars for a few tracked shows
//   5 */6 * * *   — TTL cleanup for caches, sessions, OTPs, rate limits
export const CATALOG_ROTATE_CRON = "*/20 * * * *";
export const RELEASE_REFRESH_CRON = "40 * * * *";
export const CLEANUP_CRON = "5 */6 * * *";

const CATALOG_CATEGORIES_PER_TICK = 4;
const RELEASE_SHOWS_PER_TICK = 3;

export async function runScheduledTasks(cron: string) {
  try {
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

    if (cron === CLEANUP_CRON) {
      const [tmdb, releases, auth] = await Promise.all([
        cleanupExpiredTmdbCache(),
        deleteExpiredReleaseEvents(),
        cleanupExpiredAuthArtifacts(),
      ]);
      console.info("[cron] cleanup", { tmdb, releases, auth });
      return;
    }

    console.warn("[cron] no task mapped for schedule", cron);
  } catch (error) {
    console.error("[cron] scheduled task failed", cron, error);
    throw error;
  }
}

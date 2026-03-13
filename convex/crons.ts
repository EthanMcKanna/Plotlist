import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "cleanup expired tmdb cache",
  { hours: 6 },
  internal.maintenance.cleanupTmdbCache,
  {},
);

crons.cron(
  "hot show catalog refresh",
  "10 */6 * * *",
  internal.maintenance.scheduleHotShowCatalogRefresh,
  {},
);

crons.cron(
  "hot embedding refresh",
  "45 */6 * * *",
  internal.maintenance.scheduleEmbeddingRefresh,
  {},
);

crons.cron(
  "hot episode cache refresh",
  "20 */12 * * *",
  internal.maintenance.scheduleHotEpisodeCacheRefresh,
  {},
);

crons.cron(
  "full show catalog refresh",
  "0 9 * * 0",
  internal.maintenance.scheduleFullShowCatalogRefresh,
  {},
);

crons.cron(
  "full embedding refresh",
  "30 10 * * 0",
  internal.maintenance.scheduleEmbeddingRefresh,
  {},
);

crons.cron(
  "full episode cache refresh",
  "0 12 * * 0",
  internal.maintenance.scheduleFullEpisodeCacheRefresh,
  {},
);

crons.cron(
  "tracked release refresh",
  "40 */6 * * *",
  internal.releaseCalendar.scheduleStaleTrackedShowRefresh,
  {},
);

export default crons;

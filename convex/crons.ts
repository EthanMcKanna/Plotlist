import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "cleanup expired tmdb cache",
  { hours: 24 },
  internal.maintenance.cleanupTmdbCache,
  {},
);

crons.cron(
  "hot show catalog refresh",
  "10 4 * * *",
  internal.maintenance.scheduleHotShowCatalogRefresh,
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
  "30 10 * * 1",
  internal.maintenance.scheduleEmbeddingRefresh,
  {},
);

crons.cron(
  "full episode cache refresh",
  "0 12 * * 2",
  internal.maintenance.scheduleFullEpisodeCacheRefresh,
  {},
);

export default crons;

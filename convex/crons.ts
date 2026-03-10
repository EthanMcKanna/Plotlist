import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "cleanup expired tmdb cache",
  { hours: 6 },
  internal.maintenance.cleanupTmdbCache,
  {},
);

export default crons;

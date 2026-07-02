import { z } from "zod";

import { assertCronAuthorized } from "../../_lib/cron";
import { cleanupExpiredTmdbCache } from "../../_lib/jobs";
import { deleteExpiredReleaseEvents } from "../../_lib/release-refresh";
import { withJsonRoute, json } from "../../_lib/http";

export default withJsonRoute(z.object({}).passthrough(), async ({ req, res }) => {
  assertCronAuthorized(req);
  const [tmdb, releases] = await Promise.all([
    cleanupExpiredTmdbCache(),
    deleteExpiredReleaseEvents(),
  ]);
  return json(res, 200, { tmdb, releases });
}, { methods: ["GET", "POST"] });

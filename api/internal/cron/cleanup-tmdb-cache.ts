import { z } from "zod";

import { assertCronAuthorized } from "../../_lib/cron";
import { cleanupExpiredTmdbCache } from "../../_lib/jobs";
import { withJsonRoute, json } from "../../_lib/http";

export default withJsonRoute(z.object({}).passthrough(), async ({ req, res }) => {
  assertCronAuthorized(req);
  const result = await cleanupExpiredTmdbCache();
  return json(res, 200, result);
});

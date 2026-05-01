import { z } from "zod";

import { assertCronAuthorized } from "../../_lib/cron";
import { withJsonRoute, json } from "../../_lib/http";

export default withJsonRoute(z.object({}).passthrough(), async ({ req, res }) => {
  assertCronAuthorized(req);
  return json(res, 200, {
    started: false,
    reason: "tracked release refresh scheduler not implemented yet",
  });
});

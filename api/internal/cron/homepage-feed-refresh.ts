import { z } from "zod";

import { assertCronAuthorized } from "../../_lib/cron";
import { withJsonRoute, json } from "../../_lib/http";
import { runRpcHandler } from "../../_lib/rpc";
import { buildHomepageFeedRefreshRouteSummary } from "../../../lib/homepageFeedRefreshRoute";

export default withJsonRoute(z.object({}).passthrough(), async ({ req, res }) => {
  assertCronAuthorized(req);
  const summary = await buildHomepageFeedRefreshRouteSummary({
    loadCatalog: () =>
      runRpcHandler("action", "shows:getHomeCatalog", {
        args: {},
        req,
      }),
    onCatalogError: (error) => {
      console.error("[homepage-feed-refresh] Catalog action failed", error);
    },
    onSummary: (payload) => {
      console.info("[homepage-feed-refresh] Summary", payload);
    },
    onActionItems: (payload) => {
      const log =
        payload.criticalActionItemCount > 0 ? console.error : console.warn;
      log("[homepage-feed-refresh] Action items", payload);
    },
  });
  return json(res, summary.statusCode, summary.body);
}, { methods: ["GET", "POST"] });

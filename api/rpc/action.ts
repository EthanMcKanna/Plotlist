import { z } from "zod";

import { getRpcEdgeCacheTtl, readRpcEdgeCache, writeRpcEdgeCache } from "../_lib/edge-cache";
import { json, withJsonRoute } from "../_lib/http";
import { setRequestAccessToken, setRequestRefreshToken } from "../_lib/request-auth";
import { runRpcHandler } from "../_lib/rpc";

const requestSchema = z.object({
  name: z.string().min(1),
  args: z.unknown().optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
});

export default withJsonRoute(requestSchema, async ({ body, req, res }) => {
  if (body.accessToken) {
    setRequestAccessToken(req, body.accessToken);
  }
  if (body.refreshToken) {
    setRequestRefreshToken(req, body.refreshToken);
  }

  // Catalog/TMDB-backed actions are identical for every user; a colo cache
  // hit skips both D1 and the upstream TMDB fetch. Null results are never
  // cached so a just-ingested entity can't be masked by a stale miss.
  const cacheTtl = getRpcEdgeCacheTtl("action", body.name);
  if (cacheTtl !== null) {
    const cached = await readRpcEdgeCache("action", body.name, body.args ?? {});
    if (cached) {
      return json(res, 200, { result: cached.result });
    }
  }

  const result = await runRpcHandler("action", body.name, {
    args: body.args ?? {},
    req,
  });
  if (cacheTtl !== null && result != null) {
    await writeRpcEdgeCache("action", body.name, body.args ?? {}, result, cacheTtl);
  }
  return json(res, 200, { result });
});

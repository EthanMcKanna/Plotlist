import { z } from "zod";

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

  const result = await runRpcHandler("query", body.name, {
    args: body.args ?? {},
    req,
  });
  return json(res, 200, { result });
});

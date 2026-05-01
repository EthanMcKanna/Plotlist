import { z } from "zod";

import { json, withJsonRoute } from "../_lib/http";
import { runRpcHandler } from "../_lib/rpc";

const requestSchema = z.object({
  name: z.string().min(1),
  args: z.unknown().optional(),
  accessToken: z.string().optional(),
});

export default withJsonRoute(requestSchema, async ({ body, req, res }) => {
  if (!req.headers.authorization && body.accessToken) {
    req.headers.authorization = `Bearer ${body.accessToken}`;
  }

  const result = await runRpcHandler("mutation", body.name, {
    args: body.args ?? {},
    req,
  });
  return json(res, 200, { result });
});

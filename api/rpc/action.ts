import { z } from "zod";

import { json, withJsonRoute } from "../_lib/http";
import { runRpcHandler } from "../_lib/rpc";

const requestSchema = z.object({
  name: z.string().min(1),
  args: z.unknown().optional(),
});

export default withJsonRoute(requestSchema, async ({ body, req, res }) => {
  const result = await runRpcHandler("action", body.name, {
    args: body.args ?? {},
    req,
  });
  return json(res, 200, { result });
});

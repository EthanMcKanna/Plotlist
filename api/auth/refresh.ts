import { z } from "zod";

import { refreshSession } from "../_lib/auth";
import { withJsonRoute, json } from "../_lib/http";

const requestSchema = z.object({
  refreshToken: z.string().min(1),
});

export default withJsonRoute(requestSchema, async ({ body, res }) => {
  const session = await refreshSession(body.refreshToken);
  return json(res, 200, session);
});

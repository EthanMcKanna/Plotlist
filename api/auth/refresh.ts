import { z } from "zod";

import { refreshSession } from "../_lib/auth";
import { withJsonRoute, json } from "../_lib/http";
import { setSessionCookies } from "../_lib/session-cookies";

const requestSchema = z.object({
  refreshToken: z.string().min(1),
});

export default withJsonRoute(requestSchema, async ({ body, res }) => {
  const session = await refreshSession(body.refreshToken);
  setSessionCookies(res, session);
  return json(res, 200, session);
});

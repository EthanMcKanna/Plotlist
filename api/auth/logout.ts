import { z } from "zod";

import { revokeSession, verifyRefreshToken } from "../_lib/auth";
import { withJsonRoute, json } from "../_lib/http";

const requestSchema = z.object({
  refreshToken: z.string().min(1),
});

export default withJsonRoute(requestSchema, async ({ body, res }) => {
  const payload = await verifyRefreshToken(body.refreshToken);
  await revokeSession(payload.sessionId);
  return json(res, 200, { ok: true });
});

import type { IncomingMessage } from "node:http";

import { getServerEnv } from "./env";
import { ApiError } from "./errors";

export function assertCronAuthorized(req: IncomingMessage) {
  const authHeader = req.headers.authorization;
  const expected = `Bearer ${getServerEnv().CRON_SECRET}`;

  if (authHeader !== expected) {
    throw new ApiError(401, "unauthorized", "Unauthorized");
  }
}

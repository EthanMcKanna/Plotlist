import type { IncomingMessage } from "node:http";

import { eq } from "drizzle-orm";

import { users } from "../../db/schema";
import { db } from "./db";
import { verifyAccessToken } from "./auth";
import { ApiError } from "./errors";

function getBearerToken(req: IncomingMessage) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice("Bearer ".length);
}

export async function getOptionalAuthUser(req: IncomingMessage) {
  const token = getBearerToken(req);
  if (!token) {
    return null;
  }

  try {
    const payload = await verifyAccessToken(token);
    const rows = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function requireAuthUser(req: IncomingMessage) {
  const user = await getOptionalAuthUser(req);
  if (!user) {
    throw new ApiError(401, "not_authenticated", "Not authenticated");
  }
  return user;
}

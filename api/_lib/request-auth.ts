import type { IncomingMessage } from "node:http";

import { eq } from "drizzle-orm";

import { authSessions, users } from "../../db/schema";
import { db } from "./db";
import { verifyAccessToken } from "./auth";
import { safeEqual, sha256 } from "./crypto";
import { ApiError } from "./errors";

const REQUEST_ACCESS_TOKEN = "__plotlistAccessToken";
const REQUEST_REFRESH_TOKEN = "__plotlistRefreshToken";

export function setRequestAccessToken(req: IncomingMessage, token: string) {
  (req as IncomingMessage & Record<typeof REQUEST_ACCESS_TOKEN, string>)[
    REQUEST_ACCESS_TOKEN
  ] = token;
}

export function setRequestRefreshToken(req: IncomingMessage, token: string) {
  (req as IncomingMessage & Record<typeof REQUEST_REFRESH_TOKEN, string>)[
    REQUEST_REFRESH_TOKEN
  ] = token;
}

function getBearerToken(req: IncomingMessage) {
  const requestAccessToken = (req as IncomingMessage &
    Partial<Record<typeof REQUEST_ACCESS_TOKEN, string>>)[REQUEST_ACCESS_TOKEN];
  if (requestAccessToken) {
    return requestAccessToken;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice("Bearer ".length);
}

function getRequestRefreshToken(req: IncomingMessage) {
  return (req as IncomingMessage &
    Partial<Record<typeof REQUEST_REFRESH_TOKEN, string>>)[REQUEST_REFRESH_TOKEN];
}

function readUnsignedSessionId(token: string) {
  const [, body] = token.split(".");
  if (!body) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return typeof payload?.sid === "string" ? payload.sid : null;
  } catch {
    return null;
  }
}

async function getUserFromRefreshToken(refreshToken: string) {
  const sessionId = readUnsignedSessionId(refreshToken);
  if (!sessionId) return null;

  const rows = await db
    .select()
    .from(authSessions)
    .where(eq(authSessions.id, sessionId))
    .limit(1);
  const session = rows[0];
  if (
    !session ||
    session.revokedAt !== null ||
    session.expiresAt <= Date.now() ||
    !safeEqual(session.refreshTokenHash, sha256(refreshToken))
  ) {
    return null;
  }

  const userRows = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  return userRows[0] ?? null;
}

export async function getOptionalAuthUser(req: IncomingMessage) {
  const token = getBearerToken(req);
  if (token) {
    try {
      const payload = await verifyAccessToken(token);
      const rows = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
      return rows[0] ?? null;
    } catch {
      // Fall through to the DB-backed refresh token proof below.
    }
  }

  const refreshToken = getRequestRefreshToken(req);
  return refreshToken ? await getUserFromRefreshToken(refreshToken) : null;
}

export async function requireAuthUser(req: IncomingMessage) {
  const user = await getOptionalAuthUser(req);
  if (!user) {
    throw new ApiError(401, "not_authenticated", "Not authenticated");
  }
  return user;
}

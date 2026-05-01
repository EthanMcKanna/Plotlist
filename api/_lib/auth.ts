import { and, eq, gt, isNull } from "drizzle-orm";

import { authSessions, userIdentities, users } from "../../db/schema";
import { db } from "./db";
import { getServerEnv } from "./env";
import { ApiError } from "./errors";
import { createId } from "./ids";
import { hmacSha256, safeEqual, sha256 } from "./crypto";

const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PHONE_PROVIDER = "phone";

type SessionSubject = {
  sessionId: string;
  userId: string;
};

type TokenPayload = {
  exp?: number;
  iat?: number;
  sid?: string;
  sub?: string;
  typ?: string;
  uid?: string;
};

function getSecrets() {
  const env = getServerEnv();
  return {
    accessSecret: env.JWT_SECRET,
    refreshSecret: env.REFRESH_TOKEN_SECRET,
  };
}

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlJson(value: unknown) {
  return base64UrlEncode(JSON.stringify(value));
}

async function signJwt(payload: TokenPayload, secret: string, ttlMs: number) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: nowSeconds,
    exp: Math.floor((Date.now() + ttlMs) / 1000),
  };
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const body = base64UrlJson(fullPayload);
  const signingInput = `${header}.${body}`;
  const signature = Buffer.from(hmacSha256(signingInput, secret), "hex").toString("base64url");
  return `${signingInput}.${signature}`;
}

async function verifyJwt(token: string, secret: string) {
  const [header, body, signature, extra] = token.split(".");
  if (!header || !body || !signature || extra) {
    throw new ApiError(401, "invalid_token", "Invalid token");
  }

  const expectedSignature = Buffer.from(hmacSha256(`${header}.${body}`, secret), "hex").toString("base64url");
  if (!safeEqual(signature, expectedSignature)) {
    throw new ApiError(401, "invalid_token", "Invalid token");
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new ApiError(401, "invalid_token", "Invalid token");
  }

  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new ApiError(401, "token_expired", "Token expired");
  }

  return payload;
}

async function signAccessToken(subject: SessionSubject) {
  const { accessSecret } = getSecrets();
  return await signJwt(
    { sid: subject.sessionId, sub: subject.userId, uid: subject.userId },
    accessSecret,
    ACCESS_TOKEN_TTL_MS,
  );
}

async function signRefreshToken(subject: SessionSubject) {
  const { refreshSecret } = getSecrets();
  return await signJwt(
    { sid: subject.sessionId, sub: subject.userId, uid: subject.userId, typ: "refresh" },
    refreshSecret,
    REFRESH_TOKEN_TTL_MS,
  );
}

export async function verifyAccessToken(token: string) {
  const { accessSecret } = getSecrets();
  const payload = await verifyJwt(token, accessSecret);
  return {
    userId: String(payload.uid ?? payload.sub),
    sessionId: String(payload.sid),
  };
}

export async function verifyRefreshToken(token: string) {
  const { refreshSecret } = getSecrets();
  const payload = await verifyJwt(token, refreshSecret);
  if (payload.typ !== "refresh") {
    throw new ApiError(401, "invalid_refresh_token", "Invalid refresh token");
  }

  return {
    userId: String(payload.uid ?? payload.sub),
    sessionId: String(payload.sid),
  };
}

export async function findUserByPhone(phone: string) {
  const existing = await db
    .select({
      userId: userIdentities.userId,
    })
    .from(userIdentities)
    .where(
      and(
        eq(userIdentities.provider, PHONE_PROVIDER),
        eq(userIdentities.providerAccountId, phone),
      ),
    )
    .limit(1);

  if (existing.length === 0) {
    return null;
  }

  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.id, existing[0].userId))
    .limit(1);

  return userRows[0] ?? null;
}

export async function ensurePhoneIdentity(userId: string, phone: string) {
  const existing = await db
    .select()
    .from(userIdentities)
    .where(
      and(
        eq(userIdentities.provider, PHONE_PROVIDER),
        eq(userIdentities.providerAccountId, phone),
      ),
    )
    .limit(1);

  const now = Date.now();

  if (existing[0]) {
    return existing[0];
  }

  await db.insert(userIdentities).values({
    id: createId("ident"),
    userId,
    provider: PHONE_PROVIDER,
    providerAccountId: phone,
    createdAt: now,
    updatedAt: now,
  });

  const rows = await db
    .select()
    .from(userIdentities)
    .where(
      and(
        eq(userIdentities.provider, PHONE_PROVIDER),
        eq(userIdentities.providerAccountId, phone),
      ),
    )
    .limit(1);

  return rows[0];
}

export async function createSession(userId: string) {
  const sessionId = createId("sess");
  const refreshToken = await signRefreshToken({ userId, sessionId });
  const accessToken = await signAccessToken({ userId, sessionId });
  const now = Date.now();

  await db.insert(authSessions).values({
    id: sessionId,
    userId,
    refreshTokenHash: sha256(refreshToken),
    expiresAt: now + REFRESH_TOKEN_TTL_MS,
    createdAt: now,
    lastUsedAt: now,
  });

  return {
    sessionId,
    accessToken,
    refreshToken,
    accessTokenExpiresAt: now + ACCESS_TOKEN_TTL_MS,
    refreshTokenExpiresAt: now + REFRESH_TOKEN_TTL_MS,
  };
}

export async function refreshSession(refreshToken: string) {
  const payload = await verifyRefreshToken(refreshToken);
  const tokenHash = sha256(refreshToken);
  const now = Date.now();

  const sessions = await db
    .select()
    .from(authSessions)
    .where(
      and(
        eq(authSessions.id, payload.sessionId),
        eq(authSessions.userId, payload.userId),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now),
      ),
    )
    .limit(1);

  const session = sessions[0];
  if (!session || !safeEqual(session.refreshTokenHash, tokenHash)) {
    throw new ApiError(401, "invalid_refresh_token", "Invalid refresh token");
  }

  const rotated = await createSession(payload.userId);
  await revokeSession(session.id);
  return rotated;
}

export async function revokeSession(sessionId: string) {
  await db
    .update(authSessions)
    .set({
      revokedAt: Date.now(),
      lastUsedAt: Date.now(),
    })
    .where(eq(authSessions.id, sessionId));
}

import { and, eq } from "drizzle-orm";

import { authSessions, userIdentities, users } from "../../db/schema";
import { db } from "./db";
import { getServerEnv } from "./env";
import { ApiError } from "./errors";
import { createId } from "./ids";
import { hmacSha256, safeEqual, sha256 } from "./crypto";

const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PHONE_PROVIDER = "phone";
const APPLE_PROVIDER = "apple";

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

async function findIdentity(provider: string, providerAccountId: string) {
  const rows = await db
    .select()
    .from(userIdentities)
    .where(
      and(
        eq(userIdentities.provider, provider),
        eq(userIdentities.providerAccountId, providerAccountId),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

async function findUserByIdentity(provider: string, providerAccountId: string) {
  const identity = await findIdentity(provider, providerAccountId);
  if (!identity) {
    return null;
  }

  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.id, identity.userId))
    .limit(1);

  return userRows[0] ?? null;
}

async function ensureIdentity(userId: string, provider: string, providerAccountId: string) {
  const existing = await findIdentity(provider, providerAccountId);
  if (existing) {
    return existing;
  }

  const now = Date.now();
  await db.insert(userIdentities).values({
    id: createId("ident"),
    userId,
    provider,
    providerAccountId,
    createdAt: now,
    updatedAt: now,
  });

  return await findIdentity(provider, providerAccountId);
}

export async function findUserByPhoneHash(phoneHash: string) {
  return await findUserByIdentity(PHONE_PROVIDER, phoneHash);
}

export async function findUserByAppleSub(appleSub: string) {
  return await findUserByIdentity(APPLE_PROVIDER, appleSub);
}

// Phone identities are keyed by the HMAC phone hash so the raw number never
// lands in the identities table.
export async function ensurePhoneIdentity(userId: string, phoneHash: string) {
  return await ensureIdentity(userId, PHONE_PROVIDER, phoneHash);
}

export async function ensureAppleIdentity(userId: string, appleSub: string) {
  return await ensureIdentity(userId, APPLE_PROVIDER, appleSub);
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
    .where(eq(authSessions.id, payload.sessionId))
    .limit(1);

  const session = sessions[0];
  if (
    !session ||
    session.userId !== payload.userId ||
    session.revokedAt !== null ||
    session.expiresAt <= now ||
    !safeEqual(session.refreshTokenHash, tokenHash)
  ) {
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

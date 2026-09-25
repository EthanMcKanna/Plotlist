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

  // Session proof and user row in one round trip; an inner join also covers
  // "session exists but its user is gone" the same way as a missing session.
  const rows = await db
    .select({
      revokedAt: authSessions.revokedAt,
      expiresAt: authSessions.expiresAt,
      refreshTokenHash: authSessions.refreshTokenHash,
      user: users,
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
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

  return session.user;
}

// Access tokens are stateless JWTs, so the claimed user id is known after a
// local HMAC check — memoized so the fast path and the user lookup below
// share one verification. Null when there is no access token or it fails
// verification (expired, bad signature): callers then take the refresh-token
// path exactly as before.
const accessTokenUserIdByRequest = new WeakMap<IncomingMessage, Promise<string | null>>();

export function getAccessTokenUserId(req: IncomingMessage) {
  const cached = accessTokenUserIdByRequest.get(req);
  if (cached) {
    return cached;
  }
  const token = getBearerToken(req);
  const pending = token
    ? verifyAccessToken(token).then(
        (payload) => payload.userId,
        () => null,
      )
    : Promise.resolve(null);
  accessTokenUserIdByRequest.set(req, pending);
  return pending;
}

// The viewer lookup is the first serial step of every authenticated RPC, and
// several handlers resolve the viewer more than once — memoize it per request
// so it costs one D1 round trip at most.
const authUserByRequest = new WeakMap<
  IncomingMessage,
  Promise<typeof users.$inferSelect | null>
>();

export async function getOptionalAuthUser(req: IncomingMessage) {
  const cached = authUserByRequest.get(req);
  if (cached) {
    return await cached;
  }
  const pending = resolveOptionalAuthUser(req);
  authUserByRequest.set(req, pending);
  return await pending;
}

async function resolveOptionalAuthUser(req: IncomingMessage) {
  const claimedUserId = await getAccessTokenUserId(req);
  if (claimedUserId) {
    try {
      const rows = await db.select().from(users).where(eq(users.id, claimedUserId)).limit(1);
      return rows[0] ?? null;
    } catch {
      // Fall through to the DB-backed refresh token proof below.
    }
  }

  const refreshToken = getRequestRefreshToken(req);
  return refreshToken ? await getUserFromRefreshToken(refreshToken) : null;
}

function notAuthenticated() {
  return new ApiError(401, "not_authenticated", "Not authenticated");
}

export async function requireAuthUser(req: IncomingMessage) {
  const user = await getOptionalAuthUser(req);
  if (!user) {
    throw notAuthenticated();
  }
  return user;
}

// ─── Speculative auth for reads ───
//
// Every signed-in RPC used to pay the viewer's user-row lookup (one serial D1
// round trip) before its real queries could start, even when the handler only
// needs the id. The helpers below hand back the access token's claimed user
// id right away and start the memoized row lookup in parallel; the RPC
// dispatcher (runWithSpeculativeAuth) then awaits that lookup before any
// result or error leaves the request, so the observable outcome matches the
// serial path:
// - requireAuthUserId: a claim whose user row is missing ends in the same 401
//   requireAuthUser throws.
// - getOptionalAuthUserId: a claim that doesn't validate re-runs the handler
//   on the serial path (it would have run signed-out, not failed).
// Only queries speculate — in actions and mutations the helper awaits the
// full user before handing out an id, so no write happens for an unvalidated
// claim. Outside a
// dispatcher scope (crons, scripts) there is nothing to enforce the check
// later, so the helpers stay serial there too.

type RpcKind = "query" | "mutation" | "action";

type SpeculativeAuthScope = {
  kind: RpcKind;
  disabled: boolean;
  // Claims handed out before validation, by helper.
  requiredClaim: string | null;
  optionalClaim: string | null;
};

const speculativeAuthByRequest = new WeakMap<IncomingMessage, SpeculativeAuthScope>();

async function takeSpeculativeClaim(req: IncomingMessage) {
  const scope = speculativeAuthByRequest.get(req);
  // Queries only: actions may write (caches, embeddings), and mutations always
  // do, so both keep awaiting the full user before any work starts.
  if (!scope || scope.disabled || scope.kind !== "query") {
    return { scope: null, claimedUserId: null };
  }
  const claimedUserId = await getAccessTokenUserId(req);
  if (claimedUserId) {
    // Start the row lookup now; the dispatcher awaits it. Its rejection is
    // observed there, not here.
    getOptionalAuthUser(req).catch(() => undefined);
  }
  return { scope, claimedUserId };
}

// requireAuthUser(req).id without waiting on the user row (see above).
export async function requireAuthUserId(req: IncomingMessage) {
  const { scope, claimedUserId } = await takeSpeculativeClaim(req);
  if (scope && claimedUserId) {
    scope.requiredClaim = claimedUserId;
    return claimedUserId;
  }
  return (await requireAuthUser(req)).id;
}

// getOptionalAuthUser(req)?.id without waiting on the user row (see above).
export async function getOptionalAuthUserId(req: IncomingMessage) {
  const { scope, claimedUserId } = await takeSpeculativeClaim(req);
  if (scope && claimedUserId) {
    scope.optionalClaim = claimedUserId;
    return claimedUserId;
  }
  return (await getOptionalAuthUser(req))?.id ?? null;
}

// Confirms every claim handed out during the handler. "retry" means the
// handler must re-run on the serial path to reproduce its signed-out (or
// refresh-token) behavior.
async function settleSpeculativeAuth(scope: SpeculativeAuthScope, req: IncomingMessage) {
  if (scope.requiredClaim === null && scope.optionalClaim === null) {
    return "ok" as const;
  }
  const user = await getOptionalAuthUser(req);
  const claims = [scope.requiredClaim, scope.optionalClaim].filter(
    (claim): claim is string => claim !== null,
  );
  if (user && claims.every((claim) => claim === user.id)) {
    return "ok" as const;
  }
  if (!user && scope.requiredClaim !== null) {
    throw notAuthenticated();
  }
  // Signed-out after all, or a DB error on the access-token lookup fell
  // through to a refresh-token user: replay serially for exact semantics.
  return "retry" as const;
}

export async function runWithSpeculativeAuth<T>(
  req: IncomingMessage,
  kind: RpcKind,
  run: () => Promise<T>,
): Promise<T> {
  const scope: SpeculativeAuthScope = {
    kind,
    disabled: false,
    requiredClaim: null,
    optionalClaim: null,
  };
  const outerScope = speculativeAuthByRequest.get(req);
  speculativeAuthByRequest.set(req, scope);
  try {
    let result: T;
    try {
      result = await run();
    } catch (error) {
      // A handler that failed on an unvalidated claim (e.g. a 404 for a user
      // that doesn't exist) must still surface the auth outcome instead.
      if ((await settleSpeculativeAuth(scope, req)) === "ok") {
        throw error;
      }
      scope.disabled = true;
      return await run();
    }
    if ((await settleSpeculativeAuth(scope, req)) === "ok") {
      return result;
    }
    scope.disabled = true;
    return await run();
  } finally {
    if (outerScope) {
      speculativeAuthByRequest.set(req, outerScope);
    } else {
      speculativeAuthByRequest.delete(req);
    }
  }
}

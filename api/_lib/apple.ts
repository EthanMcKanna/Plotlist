import { webcrypto } from "node:crypto";

import { getServerEnv } from "./env";
import { ApiError } from "./errors";
import { sha256 } from "./crypto";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 60;

// Workers expose WebCrypto on globalThis; jest under older Node setups only
// has it behind node:crypto, so fall through to that.
const subtle = globalThis.crypto?.subtle ?? webcrypto.subtle;

type AppleJwk = {
  kty: string;
  kid: string;
  alg?: string;
  n: string;
  e: string;
};

type AppleTokenPayload = {
  iss?: string;
  aud?: string;
  exp?: number;
  sub?: string;
  nonce?: string;
  email?: string;
  email_verified?: boolean | string;
  is_private_email?: boolean | string;
};

export type AppleIdentity = {
  sub: string;
  email: string | null;
  emailIsPrivateRelay: boolean;
};

let cachedJwks: { keys: AppleJwk[]; fetchedAt: number } | null = null;

function invalidToken(): never {
  throw new ApiError(401, "invalid_apple_token", "Could not verify Apple sign-in. Please try again.");
}

async function getAppleJwks(forceRefresh: boolean) {
  if (!forceRefresh && cachedJwks && Date.now() - cachedJwks.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cachedJwks.keys;
  }

  const response = await fetch(APPLE_JWKS_URL);
  if (!response.ok) {
    throw new ApiError(502, "apple_keys_unavailable", "Apple sign-in is temporarily unavailable. Please try again.");
  }

  const body = (await response.json()) as { keys?: AppleJwk[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  cachedJwks = { keys, fetchedAt: Date.now() };
  return keys;
}

export function resetAppleJwksCache() {
  cachedJwks = null;
}

// Apple rotates signing keys, so an unknown kid triggers one forced refresh
// before the token is rejected.
async function findAppleKey(kid: string) {
  const cached = await getAppleJwks(false);
  const match = cached.find((key) => key.kid === kid);
  if (match) {
    return match;
  }

  const fresh = await getAppleJwks(true);
  return fresh.find((key) => key.kid === kid) ?? null;
}

function decodeSegment<T>(segment: string): T {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
  } catch {
    invalidToken();
  }
}

function claimIsTrue(value: boolean | string | undefined) {
  return value === true || value === "true";
}

export async function verifyAppleIdentityToken(
  identityToken: string,
  rawNonce?: string,
): Promise<AppleIdentity> {
  const [headerSegment, payloadSegment, signatureSegment, extra] = identityToken.split(".");
  if (!headerSegment || !payloadSegment || !signatureSegment || extra !== undefined) {
    invalidToken();
  }

  const header = decodeSegment<{ alg?: string; kid?: string }>(headerSegment);
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    invalidToken();
  }

  const jwk = await findAppleKey(header.kid);
  if (!jwk || jwk.kty !== "RSA") {
    invalidToken();
  }

  const publicKey = await subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );

  let signatureValid = false;
  try {
    signatureValid = await subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      Buffer.from(signatureSegment, "base64url"),
      Buffer.from(`${headerSegment}.${payloadSegment}`),
    );
  } catch {
    invalidToken();
  }
  if (!signatureValid) {
    invalidToken();
  }

  const payload = decodeSegment<AppleTokenPayload>(payloadSegment);
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (payload.iss !== APPLE_ISSUER) {
    invalidToken();
  }
  // Native tokens carry the app bundle ID as their audience; web tokens
  // (Sign in with Apple JS) carry the Services ID.
  const env = getServerEnv();
  const allowedAudiences = new Set(
    [env.APPLE_BUNDLE_ID, env.APPLE_WEB_CLIENT_ID].filter(
      (value): value is string => Boolean(value),
    ),
  );
  if (typeof payload.aud !== "string" || !allowedAudiences.has(payload.aud)) {
    invalidToken();
  }
  if (typeof payload.exp !== "number" || payload.exp < nowSeconds - CLOCK_SKEW_SECONDS) {
    invalidToken();
  }
  if (typeof payload.sub !== "string" || !payload.sub) {
    invalidToken();
  }

  // The client passes sha256(rawNonce) to Apple, so the token's nonce claim
  // must round-trip against the raw value to rule out replayed tokens.
  if (rawNonce !== undefined && payload.nonce !== sha256(rawNonce)) {
    invalidToken();
  }

  const email =
    typeof payload.email === "string" && claimIsTrue(payload.email_verified)
      ? payload.email.toLowerCase()
      : null;

  return {
    sub: payload.sub,
    email,
    emailIsPrivateRelay: claimIsTrue(payload.is_private_email),
  };
}

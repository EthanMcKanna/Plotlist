import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createHash, createSign, generateKeyPairSync, type KeyObject } from "node:crypto";

import { resetAppleJwksCache, verifyAppleIdentityToken } from "../api/_lib/apple";
import { resetServerEnvCache } from "../api/_lib/env";
import { ApiError } from "../api/_lib/errors";

const BUNDLE_ID = "com.emckanna.Plotlist";
const KID = "test-key-1";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function signToken(key: KeyObject, header: object, payload: object) {
  const headerSegment = base64Url(JSON.stringify(header));
  const payloadSegment = base64Url(JSON.stringify(payload));
  const signer = createSign("RSA-SHA256");
  signer.update(`${headerSegment}.${payloadSegment}`);
  const signature = signer.sign(key).toString("base64url");
  return `${headerSegment}.${payloadSegment}.${signature}`;
}

function validPayload(overrides: Record<string, unknown> = {}) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    iss: "https://appleid.apple.com",
    aud: BUNDLE_ID,
    exp: nowSeconds + 600,
    iat: nowSeconds,
    sub: "001234.abcdef.5678",
    email: "Relay@privaterelay.appleid.com",
    email_verified: "true",
    is_private_email: "true",
    ...overrides,
  };
}

function makeToken(overrides: Record<string, unknown> = {}, header?: object) {
  return signToken(
    privateKey,
    header ?? { alg: "RS256", kid: KID },
    validPayload(overrides),
  );
}

const originalFetch = globalThis.fetch;

beforeAll(() => {
  process.env.JWT_SECRET = "test-jwt-secret-test-jwt-secret-32ch";
  process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-test-refresh-32c";
  process.env.CRON_SECRET = "test-cron";
  process.env.TMDB_API_KEY = "test-tmdb";
  process.env.TWILIO_ACCOUNT_SID = "test-sid";
  process.env.TWILIO_AUTH_TOKEN = "test-token";
  process.env.TWILIO_VERIFY_SERVICE_SID = "test-verify";
  process.env.CONTACT_HASH_SECRET = "test-contact-hash";
  process.env.APPLE_BUNDLE_ID = BUNDLE_ID;
  resetServerEnvCache();
});

beforeEach(() => {
  resetAppleJwksCache();
  const jwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ keys: [{ ...jwk, kid: KID, alg: "RS256" }] }),
  })) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("verifyAppleIdentityToken", () => {
  it("accepts a valid token and normalizes the identity", async () => {
    const identity = await verifyAppleIdentityToken(makeToken());

    expect(identity.sub).toBe("001234.abcdef.5678");
    expect(identity.email).toBe("relay@privaterelay.appleid.com");
    expect(identity.emailIsPrivateRelay).toBe(true);
  });

  it("drops the email when Apple has not verified it", async () => {
    const identity = await verifyAppleIdentityToken(
      makeToken({ email_verified: "false" }),
    );

    expect(identity.email).toBeNull();
  });

  it("verifies a matching nonce round-trip", async () => {
    const rawNonce = "raw-nonce-value";
    const hashedNonce = createHash("sha256").update(rawNonce).digest("hex");

    const identity = await verifyAppleIdentityToken(
      makeToken({ nonce: hashedNonce }),
      rawNonce,
    );

    expect(identity.sub).toBe("001234.abcdef.5678");
  });

  it("rejects a nonce mismatch", async () => {
    const token = makeToken({ nonce: createHash("sha256").update("real").digest("hex") });

    await expect(verifyAppleIdentityToken(token, "attacker-nonce")).rejects.toThrow(ApiError);
  });

  it("rejects a token for another app", async () => {
    await expect(
      verifyAppleIdentityToken(makeToken({ aud: "com.other.App" })),
    ).rejects.toThrow(ApiError);
  });

  it("rejects a token from another issuer", async () => {
    await expect(
      verifyAppleIdentityToken(makeToken({ iss: "https://evil.example.com" })),
    ).rejects.toThrow(ApiError);
  });

  it("rejects an expired token", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    await expect(
      verifyAppleIdentityToken(makeToken({ exp: nowSeconds - 3600 })),
    ).rejects.toThrow(ApiError);
  });

  it("rejects a tampered payload", async () => {
    const token = makeToken();
    const [header, , signature] = token.split(".");
    const forgedPayload = base64Url(JSON.stringify(validPayload({ sub: "other-user" })));

    await expect(
      verifyAppleIdentityToken(`${header}.${forgedPayload}.${signature}`),
    ).rejects.toThrow(ApiError);
  });

  it("rejects a token signed by an unknown key", async () => {
    const { privateKey: otherKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const token = signToken(otherKey, { alg: "RS256", kid: KID }, validPayload());

    await expect(verifyAppleIdentityToken(token)).rejects.toThrow(ApiError);
  });

  it("rejects non-RS256 algorithms", async () => {
    const token = signToken(privateKey, { alg: "HS256", kid: KID }, validPayload());

    await expect(verifyAppleIdentityToken(token)).rejects.toThrow(ApiError);
  });
});

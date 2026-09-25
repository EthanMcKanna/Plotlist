import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { IncomingMessage } from "node:http";

import { authSessions, blocks, users } from "../db/schema";
import { hmacSha256, sha256 } from "../api/_lib/crypto";
import { resetServerEnvCache } from "../api/_lib/env";
import { ApiError } from "../api/_lib/errors";

// A stand-in for the drizzle D1 handle: every select chain resolves through
// `mockRespond`, keyed by the table it reads from.
type Query = { table: unknown; joined: unknown[] };
let mockRespond: (query: Query) => Promise<unknown[]>;
const mockSelectCalls: Query[] = [];

jest.mock("../api/_lib/db", () => {
  const makeChain = () => {
    const query: Query = { table: null, joined: [] };
    mockSelectCalls.push(query);
    const chain: any = {
      from(table: unknown) {
        query.table = table;
        return chain;
      },
      innerJoin(table: unknown) {
        query.joined.push(table);
        return chain;
      },
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) {
        return mockRespond(query).then(resolve, reject);
      },
    };
    return chain;
  };
  return { db: { select: () => makeChain() } };
});

import {
  getOptionalAuthUser,
  getOptionalAuthUserId,
  requireAuthUserId,
  runWithSpeculativeAuth,
  setRequestAccessToken,
  setRequestRefreshToken,
} from "../api/_lib/request-auth";
import { getBlockedEitherWayIdSet, getViewerBlockedIdSet } from "../api/_lib/privacy";

const JWT_SECRET = "test-jwt-secret-test-jwt-secret-32ch";
const REFRESH_SECRET = "test-refresh-secret-test-refresh-32c";

function signToken(payload: Record<string, unknown>, secret = JWT_SECRET) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const nowSeconds = Math.floor(Date.now() / 1000);
  const input = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    iat: nowSeconds,
    exp: nowSeconds + 600,
    ...payload,
  })}`;
  const signature = Buffer.from(hmacSha256(input, secret), "hex").toString("base64url");
  return `${input}.${signature}`;
}

function makeReq(accessToken?: string, refreshToken?: string) {
  const req = { headers: {} } as IncomingMessage;
  if (accessToken) setRequestAccessToken(req, accessToken);
  if (refreshToken) setRequestRefreshToken(req, refreshToken);
  return req;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const USER = { id: "user_1", username: "ethan" };

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.REFRESH_TOKEN_SECRET = REFRESH_SECRET;
  process.env.CRON_SECRET = "test-cron";
  process.env.TMDB_API_KEY = "test-tmdb";
  process.env.TWILIO_ACCOUNT_SID = "test-sid";
  process.env.TWILIO_AUTH_TOKEN = "test-token";
  process.env.TWILIO_VERIFY_SERVICE_SID = "test-verify";
  process.env.CONTACT_HASH_SECRET = "test-contact-hash";
  resetServerEnvCache();
});

beforeEach(() => {
  mockSelectCalls.length = 0;
  mockRespond = async () => [];
});

async function expectNotAuthenticated(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({ status: 401, code: "not_authenticated" });
  await expect(promise).rejects.toBeInstanceOf(ApiError);
}

describe("speculative auth for reads", () => {
  it("hands out the claimed id before the user row resolves, and holds the result until it does", async () => {
    const userLookup = deferred<unknown[]>();
    mockRespond = (query) => (query.table === users ? userLookup.promise : Promise.resolve([]));
    const req = makeReq(signToken({ sid: "s1", sub: USER.id, uid: USER.id }));

    let claimedId: string | null = null;
    let settled = false;
    const dispatch = runWithSpeculativeAuth(req, "query", async () => {
      claimedId = await requireAuthUserId(req);
      return { ok: true };
    }).then((result) => {
      settled = true;
      return result;
    });

    await flush();
    expect(claimedId).toBe(USER.id);
    // The row lookup started in parallel, but the result waits on it.
    expect(mockSelectCalls.filter((call) => call.table === users)).toHaveLength(1);
    expect(settled).toBe(false);

    userLookup.resolve([USER]);
    await expect(dispatch).resolves.toEqual({ ok: true });
  });

  it("fails a valid token whose user row is missing with the same 401 at dispatch", async () => {
    mockRespond = async () => [];
    const req = makeReq(signToken({ sid: "s1", sub: "ghost", uid: "ghost" }));
    const handler = jest.fn(async () => {
      await requireAuthUserId(req);
      return "result";
    });

    await expectNotAuthenticated(runWithSpeculativeAuth(req, "query", handler));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("prefers the auth failure over a handler error raised on an unvalidated claim", async () => {
    mockRespond = async () => [];
    const req = makeReq(signToken({ sid: "s1", sub: "ghost", uid: "ghost" }));

    await expectNotAuthenticated(
      runWithSpeculativeAuth(req, "query", async () => {
        await requireAuthUserId(req);
        throw new ApiError(404, "not_found", "Not found");
      }),
    );
  });

  it("passes handler errors through once the claim validates", async () => {
    mockRespond = async (query) => (query.table === users ? [USER] : []);
    const req = makeReq(signToken({ sid: "s1", sub: USER.id, uid: USER.id }));

    await expect(
      runWithSpeculativeAuth(req, "query", async () => {
        await requireAuthUserId(req);
        throw new ApiError(403, "forbidden", "Nope");
      }),
    ).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });

  it("awaits the full user before returning an id inside a mutation", async () => {
    const userLookup = deferred<unknown[]>();
    mockRespond = (query) => (query.table === users ? userLookup.promise : Promise.resolve([]));
    const req = makeReq(signToken({ sid: "s1", sub: USER.id, uid: USER.id }));

    let claimedId: string | null = null;
    const dispatch = runWithSpeculativeAuth(req, "mutation", async () => {
      claimedId = await requireAuthUserId(req);
      return claimedId;
    });

    await flush();
    expect(claimedId).toBeNull();
    userLookup.resolve([USER]);
    await expect(dispatch).resolves.toBe(USER.id);
  });

  it("never runs a mutation's writes for a missing user", async () => {
    mockRespond = async () => [];
    const req = makeReq(signToken({ sid: "s1", sub: "ghost", uid: "ghost" }));
    const write = jest.fn();

    await expectNotAuthenticated(
      runWithSpeculativeAuth(req, "mutation", async () => {
        await requireAuthUserId(req);
        write();
      }),
    );
    expect(write).not.toHaveBeenCalled();
  });

  it("stays serial outside a dispatcher scope", async () => {
    const userLookup = deferred<unknown[]>();
    mockRespond = (query) => (query.table === users ? userLookup.promise : Promise.resolve([]));
    const req = makeReq(signToken({ sid: "s1", sub: USER.id, uid: USER.id }));

    let claimedId: string | null = null;
    const pending = requireAuthUserId(req).then((id) => {
      claimedId = id;
    });
    await flush();
    expect(claimedId).toBeNull();
    userLookup.resolve([USER]);
    await pending;
    expect(claimedId).toBe(USER.id);
  });

  it("keeps the no-token outcomes: 401 when required, null when optional", async () => {
    const signedOut = makeReq();
    await expectNotAuthenticated(
      runWithSpeculativeAuth(signedOut, "query", async () => await requireAuthUserId(signedOut)),
    );
    const req = makeReq();
    await expect(
      runWithSpeculativeAuth(req, "query", async () => await getOptionalAuthUserId(req)),
    ).resolves.toBeNull();
    expect(mockSelectCalls).toHaveLength(0);
  });

  it("falls back to the refresh token when the access token doesn't verify", async () => {
    const refreshToken = signToken({ sid: "sess_1", sub: USER.id, uid: USER.id, typ: "refresh" }, REFRESH_SECRET);
    mockRespond = async (query) =>
      query.table === authSessions
        ? [
            {
              revokedAt: null,
              expiresAt: Date.now() + 60_000,
              refreshTokenHash: sha256(refreshToken),
              user: USER,
            },
          ]
        : [];
    const req = makeReq(signToken({ sid: "s1", uid: USER.id }, "wrong-secret-wrong-secret-wrong-sec"), refreshToken);

    await expect(
      runWithSpeculativeAuth(req, "query", async () => await requireAuthUserId(req)),
    ).resolves.toBe(USER.id);
    // Session proof and user row come back from one joined query.
    expect(mockSelectCalls).toHaveLength(1);
    expect(mockSelectCalls[0]).toMatchObject({ table: authSessions, joined: [users] });
  });

  it("rejects a revoked refresh session", async () => {
    const refreshToken = signToken({ sid: "sess_1", sub: USER.id, uid: USER.id, typ: "refresh" }, REFRESH_SECRET);
    mockRespond = async () => [
      {
        revokedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        refreshTokenHash: sha256(refreshToken),
        user: USER,
      },
    ];
    await expect(getOptionalAuthUser(makeReq(undefined, refreshToken))).resolves.toBeNull();
  });

  it("re-runs an optional-auth handler signed out when the claim doesn't validate", async () => {
    mockRespond = async () => [];
    const req = makeReq(signToken({ sid: "s1", sub: "ghost", uid: "ghost" }));
    const seen: Array<string | null> = [];

    await expect(
      runWithSpeculativeAuth(req, "query", async () => {
        const viewerId = await getOptionalAuthUserId(req);
        seen.push(viewerId);
        return viewerId ? "signed-in" : "signed-out";
      }),
    ).resolves.toBe("signed-out");
    expect(seen).toEqual(["ghost", null]);
  });
});

describe("viewer block set", () => {
  it("matches candidates against the viewer's whole block set, both directions", async () => {
    mockRespond = async (query) =>
      query.table === blocks
        ? [
            { blockerId: "viewer", blockedId: "a" },
            { blockerId: "b", blockedId: "viewer" },
            { blockerId: "viewer", blockedId: "viewer" },
          ]
        : [];

    const blocked = await getBlockedEitherWayIdSet("viewer", ["a", "b", "c", "viewer", "a"]);
    expect(Array.from(blocked).sort()).toEqual(["a", "b"]);
    await expect(getBlockedEitherWayIdSet(null, ["a"])).resolves.toEqual(new Set());
    await expect(getBlockedEitherWayIdSet("viewer", ["viewer"])).resolves.toEqual(new Set());
    expect(mockSelectCalls).toHaveLength(1);
  });

  it("reads the block set once per request and viewer", async () => {
    mockRespond = async () => [{ blockerId: "viewer", blockedId: "a" }];
    const req = makeReq();

    const [first, second] = await Promise.all([
      getViewerBlockedIdSet("viewer", req),
      getBlockedEitherWayIdSet("viewer", ["a", "z"], req),
    ]);
    expect(first).toEqual(new Set(["a"]));
    expect(second).toEqual(new Set(["a"]));
    expect(mockSelectCalls).toHaveLength(1);
    await expect(getViewerBlockedIdSet(null, req)).resolves.toEqual(new Set());
  });
});

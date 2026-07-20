import { getServerEnv } from "./env";
import { ApiError } from "./errors";

// Thin Trakt API v2 client (https://trakt.docs.apiary.io). Every call sends
// the standard headers (trakt-api-version: 2 + client id); authed calls add
// a Bearer token. GETs retry transient failures with backoff and respect
// Retry-After on 429 up to a small in-request budget — anything longer is
// surfaced as TraktRetryLaterError so the resumable import engine can simply
// end its slice and pick up on the next tick.

const TRAKT_API_BASE = "https://api.trakt.tv";

// Longest single 429 wait we will absorb inside one slice; beyond this the
// caller should yield and resume later.
const MAX_INLINE_RETRY_AFTER_MS = 5_000;
const TRANSIENT_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 400;

export class TraktRetryLaterError extends Error {
  retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(`Trakt asked us to slow down for ${Math.round(retryAfterMs / 1000)}s`);
    this.retryAfterMs = retryAfterMs;
  }
}

export class TraktAuthError extends Error {}

export function isTraktConfigured() {
  const env = getServerEnv();
  return Boolean(env.TRAKT_CLIENT_ID && env.TRAKT_CLIENT_SECRET);
}

function requireTraktCredentials() {
  const env = getServerEnv();
  if (!env.TRAKT_CLIENT_ID || !env.TRAKT_CLIENT_SECRET) {
    throw new ApiError(
      503,
      "trakt_not_configured",
      "Trakt import isn't available right now",
    );
  }
  return { clientId: env.TRAKT_CLIENT_ID, clientSecret: env.TRAKT_CLIENT_SECRET };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type TraktResponse = {
  status: number;
  json: unknown;
  pageCount: number | null;
  itemCount: number | null;
};

async function traktFetch(args: {
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  accessToken?: string;
  searchParams?: Record<string, string>;
  // Auth endpoints use bare status codes as protocol (400 = pending, etc.),
  // so error mapping is left to the caller.
  allowedStatuses?: number[];
}): Promise<TraktResponse> {
  const { clientId } = requireTraktCredentials();
  const url = new URL(`${TRAKT_API_BASE}${args.path}`);
  for (const [key, value] of Object.entries(args.searchParams ?? {})) {
    url.searchParams.set(key, value);
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= TRANSIENT_RETRIES; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: args.method ?? "GET",
        headers: {
          "content-type": "application/json",
          "trakt-api-version": "2",
          "trakt-api-key": clientId,
          // Workers fetch sends no User-Agent by default and Trakt's edge
          // 403s UA-less requests (verified 2026-07-20).
          "user-agent": "Plotlist/1.0 (+https://plotlist.app)",
          ...(args.accessToken ? { authorization: `Bearer ${args.accessToken}` } : {}),
        },
        body: args.body === undefined ? undefined : JSON.stringify(args.body),
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      continue;
    }

    if (response.status === 429) {
      const retryAfterSeconds = Number(response.headers.get("retry-after") ?? "1");
      const retryAfterMs = Math.max(1_000, retryAfterSeconds * 1_000);
      if (args.allowedStatuses?.includes(429)) {
        return { status: 429, json: null, pageCount: null, itemCount: null };
      }
      if (retryAfterMs > MAX_INLINE_RETRY_AFTER_MS || attempt === TRANSIENT_RETRIES) {
        throw new TraktRetryLaterError(retryAfterMs);
      }
      await sleep(retryAfterMs);
      continue;
    }

    if (response.status >= 500) {
      lastError = new Error(`Trakt responded ${response.status}`);
      if (attempt === TRANSIENT_RETRIES) break;
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      continue;
    }

    if (response.status === 401 && !args.allowedStatuses?.includes(401)) {
      throw new TraktAuthError("Trakt access token was rejected");
    }

    if (!response.ok && !args.allowedStatuses?.includes(response.status)) {
      throw new Error(`Trakt request failed with ${response.status} for ${args.path}`);
    }

    const pageCountHeader = response.headers.get("x-pagination-page-count");
    const itemCountHeader = response.headers.get("x-pagination-item-count");
    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      // Some responses (e.g. token-poll statuses) carry no JSON body.
    }
    return {
      status: response.status,
      json,
      pageCount: pageCountHeader !== null ? Number(pageCountHeader) : null,
      itemCount: itemCountHeader !== null ? Number(itemCountHeader) : null,
    };
  }

  throw lastError ?? new Error("Trakt request failed");
}

// ─── Device authentication ───

export type TraktDeviceCode = {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresInSeconds: number;
  intervalSeconds: number;
};

export async function requestDeviceCode(): Promise<TraktDeviceCode> {
  const { clientId } = requireTraktCredentials();
  const response = await traktFetch({
    path: "/oauth/device/code",
    method: "POST",
    body: { client_id: clientId },
  });
  const payload = response.json as {
    device_code?: string;
    user_code?: string;
    verification_url?: string;
    expires_in?: number;
    interval?: number;
  };
  if (!payload?.device_code || !payload.user_code) {
    throw new Error("Trakt device code response was malformed");
  }
  return {
    deviceCode: payload.device_code,
    userCode: payload.user_code,
    verificationUrl: payload.verification_url ?? "https://trakt.tv/activate",
    expiresInSeconds: payload.expires_in ?? 600,
    intervalSeconds: Math.max(1, payload.interval ?? 5),
  };
}

export type TraktTokenGrant = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
};

function readTokenGrant(json: unknown, now: number): TraktTokenGrant {
  const payload = json as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    created_at?: number;
  };
  if (!payload?.access_token) {
    throw new Error("Trakt token response was malformed");
  }
  const createdMs =
    typeof payload.created_at === "number" ? payload.created_at * 1_000 : now;
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresAt:
      typeof payload.expires_in === "number"
        ? createdMs + payload.expires_in * 1_000
        : null,
  };
}

export type DeviceTokenPollResult =
  | { state: "approved"; grant: TraktTokenGrant }
  | { state: "pending" }
  | { state: "denied" }
  | { state: "expired" }
  | { state: "slow_down" };

// Trakt's device-token endpoint speaks entirely in status codes:
// 200 approved · 400 pending · 404 invalid · 409 already used ·
// 410 expired · 418 denied · 429 polling too fast.
export async function pollDeviceToken(deviceCode: string): Promise<DeviceTokenPollResult> {
  const { clientId, clientSecret } = requireTraktCredentials();
  const response = await traktFetch({
    path: "/oauth/device/token",
    method: "POST",
    body: { code: deviceCode, client_id: clientId, client_secret: clientSecret },
    allowedStatuses: [400, 404, 409, 410, 418, 429],
  });
  switch (response.status) {
    case 200:
      return { state: "approved", grant: readTokenGrant(response.json, Date.now()) };
    case 400:
      return { state: "pending" };
    case 429:
      return { state: "slow_down" };
    case 418:
      return { state: "denied" };
    case 404:
    case 409:
    case 410:
    default:
      return { state: "expired" };
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<TraktTokenGrant> {
  const { clientId, clientSecret } = requireTraktCredentials();
  const response = await traktFetch({
    path: "/oauth/token",
    method: "POST",
    body: {
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
      grant_type: "refresh_token",
    },
    allowedStatuses: [401],
  });
  if (response.status === 401) {
    throw new TraktAuthError("Trakt refresh token was rejected");
  }
  return readTokenGrant(response.json, Date.now());
}

// ─── Sync reads ───

export async function getUserSettings(accessToken: string) {
  const response = await traktFetch({ path: "/users/settings", accessToken });
  const payload = response.json as {
    user?: { username?: string; ids?: { slug?: string } };
  };
  return {
    username: payload?.user?.username ?? null,
    slug: payload?.user?.ids?.slug ?? null,
  };
}

export async function getWatchedShows(accessToken: string) {
  const response = await traktFetch({ path: "/sync/watched/shows", accessToken });
  return Array.isArray(response.json) ? response.json : [];
}

export async function getHistoryEpisodesPage(
  accessToken: string,
  page: number,
  limit: number,
) {
  const response = await traktFetch({
    path: "/sync/history/episodes",
    accessToken,
    searchParams: { page: String(page), limit: String(limit) },
  });
  return {
    items: Array.isArray(response.json) ? response.json : [],
    pageCount: response.pageCount ?? 1,
    itemCount: response.itemCount ?? null,
  };
}

export async function getShowRatings(accessToken: string) {
  const response = await traktFetch({ path: "/sync/ratings/shows", accessToken });
  return Array.isArray(response.json) ? response.json : [];
}

export async function getEpisodeRatings(accessToken: string) {
  const response = await traktFetch({ path: "/sync/ratings/episodes", accessToken });
  return Array.isArray(response.json) ? response.json : [];
}

export async function getWatchlistShows(accessToken: string) {
  const response = await traktFetch({ path: "/sync/watchlist/shows", accessToken });
  return Array.isArray(response.json) ? response.json : [];
}

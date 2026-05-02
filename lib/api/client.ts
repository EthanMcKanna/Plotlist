import { getApiBaseUrl } from "./env";
import {
  clearStoredSession,
  getStoredSession,
  setStoredSession,
  type StoredSession,
} from "./session";

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export class PlotlistApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(status: number, code: string | undefined, message: string, details?: unknown) {
    super(message);
    this.name = "PlotlistApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function parseError(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload;
  throw new PlotlistApiError(
    response.status,
    payload.error?.code,
    payload.error?.message ?? `Request failed with ${response.status}`,
    payload.error?.details,
  );
}

let refreshSessionPromise: Promise<StoredSession | null> | null = null;

export async function refreshSessionIfNeeded() {
  const session = await getStoredSession();
  if (!session) {
    return null;
  }

  if (session.accessTokenExpiresAt > Date.now() + 30_000) {
    return session;
  }

  if (session.refreshTokenExpiresAt <= Date.now()) {
    await clearStoredSession();
    return null;
  }

  if (refreshSessionPromise) {
    return await refreshSessionPromise;
  }

  refreshSessionPromise = refreshStoredSession(session).finally(() => {
    refreshSessionPromise = null;
  });

  return await refreshSessionPromise;
}

async function refreshStoredSession(session: StoredSession) {
  const response = await fetch(`${getApiBaseUrl()}/api/auth/refresh`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      refreshToken: session.refreshToken,
    }),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      await clearStoredSession();
    }
    await parseError(response);
  }

  const nextSession = (await response.json()) as StoredSession;
  await setStoredSession(nextSession);
  return nextSession;
}

export async function apiRequest<TResponse>(
  path: string,
  init: RequestInit & { authenticate?: boolean } = {},
) {
  const authenticate = init.authenticate ?? true;
  const session = authenticate ? await refreshSessionIfNeeded() : null;
  const headers = new Headers(init.headers);

  if (!headers.has("content-type") && init.body) {
    headers.set("content-type", "application/json");
  }

  if (session?.accessToken) {
    headers.set("authorization", `Bearer ${session.accessToken}`);
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    await parseError(response);
  }

  return (await response.json()) as TResponse;
}

export const authApi = {
  async startVerification(phone: string) {
    return await apiRequest<{ ok: boolean; phone: string }>("/api/auth/start-verification", {
      method: "POST",
      body: JSON.stringify({ phone }),
      authenticate: false,
    });
  },
  async verify(phone: string, code: string) {
    const session = await apiRequest<
      StoredSession & {
        user: Record<string, unknown>;
      }
    >("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ phone, code }),
      authenticate: false,
    });

    await setStoredSession(session);
    return session;
  },
  async logout() {
    const session = await getStoredSession();
    if (session?.refreshToken) {
      await apiRequest<{ ok: boolean }>("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken: session.refreshToken }),
        authenticate: false,
      }).catch(() => undefined);
    }
    await clearStoredSession();
  },
};

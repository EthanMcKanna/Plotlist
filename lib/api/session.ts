import { authStorage } from "../authStorage";

const ACCESS_TOKEN_KEY = "__plotlistApiAccessToken";
const REFRESH_TOKEN_KEY = "__plotlistApiRefreshToken";
const ACCESS_TOKEN_EXPIRES_AT_KEY = "__plotlistApiAccessTokenExpiresAt";
const REFRESH_TOKEN_EXPIRES_AT_KEY = "__plotlistApiRefreshTokenExpiresAt";

export type StoredSession = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
};

const sessionClearedListeners = new Set<() => void>();
let memorySession: StoredSession | null = null;

export function subscribeToSessionCleared(listener: () => void) {
  sessionClearedListeners.add(listener);
  return () => {
    sessionClearedListeners.delete(listener);
  };
}

function notifySessionCleared() {
  for (const listener of sessionClearedListeners) {
    listener();
  }
}

export async function getStoredSession(): Promise<StoredSession | null> {
  if (memorySession) {
    return memorySession;
  }

  const [accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt] =
    await Promise.all([
      authStorage.getItem(ACCESS_TOKEN_KEY),
      authStorage.getItem(REFRESH_TOKEN_KEY),
      authStorage.getItem(ACCESS_TOKEN_EXPIRES_AT_KEY),
      authStorage.getItem(REFRESH_TOKEN_EXPIRES_AT_KEY),
    ]);

  if (
    !accessToken ||
    !refreshToken ||
    !accessTokenExpiresAt ||
    !refreshTokenExpiresAt
  ) {
    return null;
  }

  memorySession = {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: Number(accessTokenExpiresAt),
    refreshTokenExpiresAt: Number(refreshTokenExpiresAt),
  };
  return memorySession;
}

export async function setStoredSession(session: StoredSession) {
  memorySession = session;
  await Promise.all([
    authStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken),
    authStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken),
    authStorage.setItem(
      ACCESS_TOKEN_EXPIRES_AT_KEY,
      String(session.accessTokenExpiresAt),
    ),
    authStorage.setItem(
      REFRESH_TOKEN_EXPIRES_AT_KEY,
      String(session.refreshTokenExpiresAt),
    ),
  ]);
}

export async function clearStoredSession() {
  memorySession = null;
  await Promise.all([
    authStorage.removeItem(ACCESS_TOKEN_KEY),
    authStorage.removeItem(REFRESH_TOKEN_KEY),
    authStorage.removeItem(ACCESS_TOKEN_EXPIRES_AT_KEY),
    authStorage.removeItem(REFRESH_TOKEN_EXPIRES_AT_KEY),
  ]);
  notifySessionCleared();
}

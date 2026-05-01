import type { ServerResponse } from "node:http";

const ACCESS_TOKEN_KEY = "__plotlistApiAccessToken";
const REFRESH_TOKEN_KEY = "__plotlistApiRefreshToken";
const ACCESS_TOKEN_EXPIRES_AT_KEY = "__plotlistApiAccessTokenExpiresAt";
const REFRESH_TOKEN_EXPIRES_AT_KEY = "__plotlistApiRefreshTokenExpiresAt";

type SessionCookieData = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
};

function serializeCookie(name: string, value: string, maxAge: number) {
  return `${encodeURIComponent(name)}=${encodeURIComponent(
    value,
  )}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`;
}

function clearCookie(name: string) {
  return serializeCookie(name, "", 0);
}

export function setSessionCookies(res: ServerResponse, session: SessionCookieData) {
  const now = Date.now();
  res.setHeader("set-cookie", [
    serializeCookie(
      ACCESS_TOKEN_KEY,
      session.accessToken,
      Math.max(1, Math.floor((session.accessTokenExpiresAt - now) / 1000)),
    ),
    serializeCookie(
      REFRESH_TOKEN_KEY,
      session.refreshToken,
      Math.max(1, Math.floor((session.refreshTokenExpiresAt - now) / 1000)),
    ),
    serializeCookie(
      ACCESS_TOKEN_EXPIRES_AT_KEY,
      String(session.accessTokenExpiresAt),
      Math.max(1, Math.floor((session.refreshTokenExpiresAt - now) / 1000)),
    ),
    serializeCookie(
      REFRESH_TOKEN_EXPIRES_AT_KEY,
      String(session.refreshTokenExpiresAt),
      Math.max(1, Math.floor((session.refreshTokenExpiresAt - now) / 1000)),
    ),
  ]);
}

export function clearSessionCookies(res: ServerResponse) {
  res.setHeader("set-cookie", [
    clearCookie(ACCESS_TOKEN_KEY),
    clearCookie(REFRESH_TOKEN_KEY),
    clearCookie(ACCESS_TOKEN_EXPIRES_AT_KEY),
    clearCookie(REFRESH_TOKEN_EXPIRES_AT_KEY),
  ]);
}

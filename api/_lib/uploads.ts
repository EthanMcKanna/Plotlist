import type { IncomingMessage } from "node:http";

import { getServerEnv } from "./env";
import { ApiError } from "./errors";
import { hmacSha256, safeEqual } from "./crypto";

type UploadTokenPayload = {
  userId: string;
  expiresAt: number;
};

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(encodedPayload: string) {
  return hmacSha256(encodedPayload, getServerEnv().JWT_SECRET);
}

export function createUploadToken(userId: string) {
  const payload: UploadTokenPayload = {
    userId,
    expiresAt: Date.now() + 10 * 60 * 1000,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyUploadToken(token: string) {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    throw new ApiError(401, "invalid_upload_token", "Invalid upload token");
  }

  const expectedSignature = signPayload(encodedPayload);
  if (!safeEqual(signature, expectedSignature)) {
    throw new ApiError(401, "invalid_upload_token", "Invalid upload token");
  }

  const payload = JSON.parse(fromBase64Url(encodedPayload)) as UploadTokenPayload;
  if (!payload.userId || payload.expiresAt <= Date.now()) {
    throw new ApiError(401, "expired_upload_token", "Upload token expired");
  }

  return payload;
}

export function getRequestOrigin(req: IncomingMessage) {
  const protocol =
    (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() ?? "https";
  const host =
    (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim() ??
    req.headers.host;

  if (!host) {
    throw new ApiError(500, "missing_host", "Could not determine upload host");
  }

  return `${protocol}://${host}`;
}

export function getFileExtension(contentType: string | undefined) {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    default:
      return "bin";
  }
}

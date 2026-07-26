import type { IncomingMessage } from "node:http";
import { createHmac } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { rateLimits } from "../../db/schema";
import { db } from "./db";
import { getServerEnv } from "./env";
import { ApiError } from "./errors";
import { createId } from "./ids";

export function rateLimitKey(scope: string, ...parts: Array<string | number | null | undefined>) {
  const env = getServerEnv();
  const digest = createHmac("sha256", env.CONTACT_HASH_SECRET)
    .update(parts.map((part) => String(part ?? "")).join("\0"))
    .digest("base64url")
    .slice(0, 32);
  return `${scope}:${digest}`;
}

export function getClientIp(req: IncomingMessage) {
  const firstForwardedIp = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value?.split(",")[0];

  return (
    firstForwardedIp(req.headers["x-forwarded-for"]) ??
    firstForwardedIp(req.headers["x-real-ip"]) ??
    firstForwardedIp(req.headers["cf-connecting-ip"]) ??
    req.socket.remoteAddress ??
    "unknown"
  )
    .trim()
    .replace(/^::ffff:/, "");
}

export function clientRateLimitKey(req: IncomingMessage, scope: string) {
  return rateLimitKey(scope, getClientIp(req));
}

export async function enforceRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const resetAt = now + windowMs;
  const rows = await db
    .insert(rateLimits)
    .values({
      id: createId("rate"),
      key,
      count: 1,
      resetAt,
    })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql<number>`case when ${rateLimits.resetAt} <= ${now} then 1 else ${rateLimits.count} + 1 end`,
        resetAt: sql<number>`case when ${rateLimits.resetAt} <= ${now} then ${resetAt} else ${rateLimits.resetAt} end`,
      },
    })
    .returning({
      count: rateLimits.count,
    });

  if ((rows[0]?.count ?? 0) > limit) {
    throw new ApiError(429, "rate_limited", "Too many requests");
  }
}

// Non-throwing sibling of enforceRateLimit for user-facing quotas (Ask
// Plotlist free sessions). Same rate_limits upsert, but returns the verdict
// instead of throwing, and never increments past limit + 1 so a burst of
// denied attempts can't push the counter into the next window's budget.
export async function consumeQuota(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const now = Date.now();
  const resetAt = now + windowMs;
  const rows = await db
    .insert(rateLimits)
    .values({
      id: createId("rate"),
      key,
      count: 1,
      resetAt,
    })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql<number>`case when ${rateLimits.resetAt} <= ${now} then 1 else min(${rateLimits.count} + 1, ${limit + 1}) end`,
        resetAt: sql<number>`case when ${rateLimits.resetAt} <= ${now} then ${resetAt} else ${rateLimits.resetAt} end`,
      },
    })
    .returning({
      count: rateLimits.count,
    });

  const count = rows[0]?.count ?? limit + 1;
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}

// Read-only view of a quota key for status pills ("2 free asks left") —
// never increments.
export async function peekQuota(
  key: string,
  limit: number,
): Promise<{ remaining: number }> {
  const now = Date.now();
  const rows = await db
    .select({ count: rateLimits.count, resetAt: rateLimits.resetAt })
    .from(rateLimits)
    .where(eq(rateLimits.key, key))
    .limit(1);
  const row = rows[0];
  if (!row || row.resetAt <= now) {
    return { remaining: limit };
  }
  return { remaining: Math.max(0, limit - row.count) };
}

import { eq } from "drizzle-orm";

import { rateLimits } from "../../db/schema";
import { db } from "./db";
import { ApiError } from "./errors";
import { createId } from "./ids";

export async function enforceRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const rows = await db
    .select()
    .from(rateLimits)
    .where(eq(rateLimits.key, key))
    .limit(1);

  const existing = rows[0];
  if (!existing) {
    await db.insert(rateLimits).values({
      id: createId("rate"),
      key,
      count: 1,
      resetAt: now + windowMs,
    });
    return;
  }

  if (existing.resetAt <= now) {
    await db
      .update(rateLimits)
      .set({ count: 1, resetAt: now + windowMs })
      .where(eq(rateLimits.id, existing.id));
    return;
  }

  if (existing.count >= limit) {
    throw new ApiError(429, "rate_limited", "Too many requests");
  }

  await db
    .update(rateLimits)
    .set({ count: existing.count + 1 })
    .where(eq(rateLimits.id, existing.id));
}

import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { users } from "../../db/schema";
import { PRO_ENTITLEMENT_ID } from "../../lib/purchasesTypes";
import { db } from "../_lib/db";
import { json, methodNotAllowed } from "../_lib/http";

// RevenueCat server notifications keep users.proUntil authoritative — the
// client SDK is UX-only; every server-side Pro gate reads this column.
// https://www.revenuecat.com/docs/integrations/webhooks

const eventSchema = z.object({
  event: z.object({
    type: z.string(),
    app_user_id: z.string().nullish(),
    original_app_user_id: z.string().nullish(),
    aliases: z.array(z.string()).nullish(),
    entitlement_ids: z.array(z.string()).nullish(),
    expiration_at_ms: z.number().nullish(),
    event_timestamp_ms: z.number().nullish(),
  }),
});

async function readBody(req: AsyncIterable<Buffer | string>) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return methodNotAllowed(res);
  }

  const expectedAuth = process.env.REVENUECAT_WEBHOOK_AUTH;
  const authHeader =
    typeof req.headers?.authorization === "string" ? req.headers.authorization : null;
  if (!expectedAuth || authHeader !== expectedAuth) {
    return json(res, 401, { error: { code: "unauthorized" } });
  }

  let parsed: z.infer<typeof eventSchema>;
  try {
    parsed = eventSchema.parse(JSON.parse(await readBody(req)));
  } catch {
    // Malformed payloads get a 200 so RevenueCat doesn't retry them forever.
    return json(res, 200, { ok: true, ignored: "unparseable" });
  }

  const event = parsed.event;
  if (event.type === "TEST") {
    return json(res, 200, { ok: true, ignored: "test" });
  }
  if (event.entitlement_ids && !event.entitlement_ids.includes(PRO_ENTITLEMENT_ID)) {
    return json(res, 200, { ok: true, ignored: "other_entitlement" });
  }

  // The SDK aliases the RevenueCat identity to the Plotlist user id at sign-in
  // (PurchasesBridge), but events can arrive under an anonymous id or any
  // alias — resolve against whichever candidate actually exists.
  const candidateIds = [
    event.app_user_id,
    event.original_app_user_id,
    ...(event.aliases ?? []),
  ].filter((id): id is string => Boolean(id) && !id!.startsWith("$RCAnonymousID:"));
  if (candidateIds.length === 0) {
    return json(res, 200, { ok: true, ignored: "anonymous" });
  }

  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.id, [...new Set(candidateIds)]))
    .limit(1);
  const userId = rows[0]?.id;
  if (!userId) {
    return json(res, 200, { ok: true, ignored: "unknown_user" });
  }

  // EXPIRATION ends access now; everything else (purchase, renewal, even
  // CANCELLATION, which only turns off auto-renew) keeps access until the
  // store-reported expiration.
  const proUntil =
    event.type === "EXPIRATION"
      ? event.event_timestamp_ms ?? Date.now()
      : event.expiration_at_ms ?? null;
  if (proUntil === null) {
    return json(res, 200, { ok: true, ignored: "no_expiration" });
  }

  await db.update(users).set({ proUntil }).where(eq(users.id, userId));
  return json(res, 200, { ok: true, userId, proUntil });
}

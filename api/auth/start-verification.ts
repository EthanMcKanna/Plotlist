import { z } from "zod";

import { phoneVerificationRequests } from "../../db/schema";
import { db } from "../_lib/db";
import { ApiError } from "../_lib/errors";
import { withJsonRoute, json } from "../_lib/http";
import { createId } from "../_lib/ids";
import { normalizePhoneNumber } from "../_lib/phone";
import { enforceRateLimit } from "../_lib/rate-limit";
import { sendPhoneVerificationCode } from "../_lib/twilio";

const requestSchema = z.object({
  phone: z.string(),
});

export default withJsonRoute(requestSchema, async ({ body, res }) => {
  const normalizedPhone = normalizePhoneNumber(body.phone);
  if (!normalizedPhone) {
    throw new ApiError(400, "invalid_phone", "Enter a valid phone number");
  }

  await enforceRateLimit(`phone-verification:${normalizedPhone}`, 5, 10 * 60 * 1000);
  await sendPhoneVerificationCode(normalizedPhone);

  const now = Date.now();
  await db.insert(phoneVerificationRequests).values({
    id: createId("verifyreq"),
    phone: normalizedPhone,
    requestedAt: now,
    expiresAt: now + 10 * 60 * 1000,
    completedAt: null,
  });

  return json(res, 200, {
    ok: true,
    phone: normalizedPhone,
  });
});

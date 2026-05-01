import { z } from "zod";

import { ApiError } from "../_lib/errors";
import { withJsonRoute, json } from "../_lib/http";
import { ensurePhoneIdentity, createSession } from "../_lib/auth";
import { matchesAppReviewBypass, normalizePhoneNumber } from "../_lib/phone";
import { enforceRateLimit } from "../_lib/rate-limit";
import { setSessionCookies } from "../_lib/session-cookies";
import { verifyPhoneVerificationCode } from "../_lib/twilio";
import { upsertPhoneUser } from "../_lib/users";

const requestSchema = z.object({
  phone: z.string(),
  code: z.string().min(1),
});

export default withJsonRoute(requestSchema, async ({ body, res }) => {
  const normalizedPhone = normalizePhoneNumber(body.phone);
  if (!normalizedPhone) {
    throw new ApiError(400, "invalid_phone", "Enter a valid phone number");
  }

  const usingAppReviewBypass = matchesAppReviewBypass(
    normalizedPhone,
    body.code.trim(),
  );

  if (!usingAppReviewBypass) {
    await enforceRateLimit(`phone-verify:${normalizedPhone}`, 10, 10 * 60 * 1000);
  }

  const verified =
    usingAppReviewBypass ||
    (await verifyPhoneVerificationCode(normalizedPhone, body.code));
  if (!verified) {
    throw new ApiError(
      401,
      "invalid_verification_code",
      "That code was invalid or expired. Request a new code and try again.",
    );
  }

  const user = await upsertPhoneUser(normalizedPhone);
  await ensurePhoneIdentity(user.id, normalizedPhone);

  const session = await createSession(user.id);
  setSessionCookies(res, session);
  return json(res, 200, {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt,
    user,
  });
});

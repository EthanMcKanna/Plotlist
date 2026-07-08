import { z } from "zod";

import { verifyAppleIdentityToken } from "../_lib/apple";
import { ensureAppleIdentity, createSession } from "../_lib/auth";
import { withJsonRoute, json } from "../_lib/http";
import { clientRateLimitKey, enforceRateLimit } from "../_lib/rate-limit";
import { setSessionCookies } from "../_lib/session-cookies";
import { upsertAppleUser } from "../_lib/users";

const requestSchema = z.object({
  identityToken: z.string().min(1),
  rawNonce: z.string().min(1).optional(),
  fullName: z
    .object({
      givenName: z.string().nullish(),
      familyName: z.string().nullish(),
    })
    .nullish(),
});

export default withJsonRoute(requestSchema, async ({ body, req, res }) => {
  await enforceRateLimit(clientRateLimitKey(req, "apple-sign-in-ip"), 30, 10 * 60 * 1000);

  const identity = await verifyAppleIdentityToken(body.identityToken, body.rawNonce);

  // Apple only surfaces the name to the client on the very first
  // authorization; it seeds the profile and is otherwise unverified.
  const suggestedName =
    [body.fullName?.givenName, body.fullName?.familyName]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(" ")
      .trim() || null;

  const user = await upsertAppleUser(identity.sub, {
    email: identity.email,
    emailIsPrivateRelay: identity.emailIsPrivateRelay,
    suggestedName,
  });
  await ensureAppleIdentity(user.id, identity.sub);

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

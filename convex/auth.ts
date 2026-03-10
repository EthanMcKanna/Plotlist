import { createAccount, convexAuth, retrieveAccount } from "@convex-dev/auth/server";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";

import { normalizePhoneNumber, verifyPhoneVerificationCode } from "./phone";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    ConvexCredentials({
      id: "phone",
      authorize: async (credentials, ctx) => {
        if (typeof credentials.phone !== "string") {
          throw new Error("Enter a valid phone number");
        }
        if (typeof credentials.code !== "string") {
          throw new Error("Enter the verification code we sent you.");
        }

        const normalizedPhone = normalizePhoneNumber(credentials.phone);
        if (!normalizedPhone) {
          throw new Error("Enter a valid phone number");
        }

        const isVerified = await verifyPhoneVerificationCode(
          normalizedPhone,
          credentials.code,
        );
        if (!isVerified) {
          return null;
        }

        try {
          const { user } = await retrieveAccount(ctx, {
            provider: "phone",
            account: { id: normalizedPhone },
          });
          return { userId: user._id };
        } catch (error) {
          if (!(error instanceof Error) || error.message !== "InvalidAccountId") {
            throw error;
          }
        }

        const now = Date.now();
        const { user } = await createAccount(ctx, {
          provider: "phone",
          account: { id: normalizedPhone },
          profile: {
            name: normalizedPhone,
            phone: normalizedPhone,
            phoneVerificationTime: now,
            createdAt: now,
            lastSeenAt: now,
          },
          shouldLinkViaPhone: true,
        });

        return { userId: user._id };
      },
    }),
  ],
});

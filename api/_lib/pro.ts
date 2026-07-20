import type { users } from "../../db/schema";
import { ApiError } from "./errors";

// Server-side Plotlist Pro checks read users.proUntil, which only the
// RevenueCat webhook writes — never trust client-reported entitlements.

export function userHasPro(user: Pick<typeof users.$inferSelect, "proUntil">) {
  return (user.proUntil ?? 0) > Date.now();
}

export function requirePro(user: Pick<typeof users.$inferSelect, "proUntil">) {
  if (!userHasPro(user)) {
    throw new ApiError(403, "pro_required", "This feature requires Plotlist Pro");
  }
}

import { MutationCtx, QueryCtx } from "./_generated/server";
import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export async function getCurrentUserOrThrow(
  ctx: MutationCtx | QueryCtx,
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("Not authenticated");
  }
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new ConvexError("User profile not found");
  }
  return user;
}

export async function requireAdmin(ctx: MutationCtx | QueryCtx) {
  const user = await getCurrentUserOrThrow(ctx);
  if (!user.isAdmin) {
    throw new ConvexError("Admin access required");
  }
  return user;
}

export function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

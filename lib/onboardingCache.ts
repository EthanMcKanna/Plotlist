import { queryClient } from "./queryClient";

export type OnboardingStep = "profile" | "follow" | "shows" | "complete";

const CACHE_PREFIX = "__plotlistOnboardingStep:";

function getUserId(user: any) {
  return typeof user?._id === "string"
    ? user._id
    : typeof user?.id === "string"
      ? user.id
      : null;
}

export function cacheOnboardingStep(userId: string | null | undefined, step: OnboardingStep) {
  if (!userId || typeof window === "undefined") return;

  try {
    window.localStorage.setItem(`${CACHE_PREFIX}${userId}`, step);
  } catch {
    // Local storage can be unavailable in private or restricted browser contexts.
  }
}

export function getCachedOnboardingStep(userId: string | null | undefined): OnboardingStep | null {
  if (!userId || typeof window === "undefined") return null;

  try {
    const step = window.localStorage.getItem(`${CACHE_PREFIX}${userId}`);
    return step === "profile" || step === "follow" || step === "shows" || step === "complete"
      ? step
      : null;
  } catch {
    return null;
  }
}

export function markOnboardingStep(step: OnboardingStep) {
  queryClient
    .getQueriesData({ queryKey: ["plotlist-rpc", "query", "users:me"] })
    .forEach(([, existing]) => cacheOnboardingStep(getUserId(existing), step));

  queryClient.setQueriesData(
    { queryKey: ["plotlist-rpc", "query", "users:me"] },
    (existing: any) => {
      if (!existing) return existing;
      cacheOnboardingStep(getUserId(existing), step);

      return {
        ...existing,
        onboardingStep: step,
        onboardingCompletedAt:
          step === "complete" ? Date.now() : existing.onboardingCompletedAt,
      };
    },
  );
}

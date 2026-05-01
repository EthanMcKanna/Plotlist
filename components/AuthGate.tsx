import { ReactNode, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSegments } from "expo-router";
import { LoadingScreen } from "./LoadingScreen";
import { api } from "../lib/plotlist/api";
import { clearAuthTokens } from "../lib/authStorage";
import { useAuth, useMutation, useQuery } from "../lib/plotlist/react";

// Set to true to force clear tokens on next app load (for key rotation)
const FORCE_CLEAR_TOKENS = false;
let hasCleared = false;

const ONBOARDING_ROUTES = {
  profile: "/profile",
  follow: "/follow",
  shows: "/shows",
} as const;

export function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const ensureProfile = useMutation(api.users.ensureProfile);
  const hasEnsuredProfile = useRef(false);
  const hasHandledAuthFailure = useRef(false);
  const [isEnsuringProfile, setIsEnsuringProfile] = useState(false);
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");

  // One-time token clear for key rotation
  useEffect(() => {
    if (FORCE_CLEAR_TOKENS && !hasCleared) {
      hasCleared = true;
      clearAuthTokens();
    }
  }, []);

  const isProfileLoading = isAuthenticated && (me === undefined || isEnsuringProfile);

  // Route protection: redirect based on authentication state
  useEffect(() => {
    if (isLoading || isProfileLoading) return;

    const inAuthGroup =
      segments[0] === "(auth)" || pathname?.startsWith("/sign-in");
    const inOnboardingGroup = segments[0] === "(onboarding)";
    const atRoot = pathname === "/";
    const onboardingStep: keyof typeof ONBOARDING_ROUTES =
      isAuthenticated && me?.onboardingStep && me.onboardingStep !== "complete"
        ? me.onboardingStep
        : "profile";
    const needsOnboarding =
      isAuthenticated && (me?.onboardingStep ?? "profile") !== "complete";
    const onExpectedOnboardingScreen =
      pathname === ONBOARDING_ROUTES[onboardingStep];

    if (!isAuthenticated && !inAuthGroup) {
      router.replace("/sign-in");
      return;
    }

    if (isAuthenticated && needsOnboarding && !onExpectedOnboardingScreen) {
      router.replace(ONBOARDING_ROUTES[onboardingStep]);
      return;
    }

    if (isAuthenticated && !needsOnboarding && inOnboardingGroup) {
      router.replace("/home");
      return;
    }

    if (isAuthenticated && (inAuthGroup || atRoot)) {
      router.replace("/home");
    }
  }, [
    isAuthenticated,
    isLoading,
    isProfileLoading,
    me?.onboardingStep,
    pathname,
    router,
    segments,
  ]);

  // Ensure user profile exists when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      hasEnsuredProfile.current = false;
      hasHandledAuthFailure.current = false;
      setIsEnsuringProfile(false);
      return;
    }
    if (hasEnsuredProfile.current) return;
    hasEnsuredProfile.current = true;
    setIsEnsuringProfile(true);
    void ensureProfile({})
      .catch(async (error: unknown) => {
        console.warn("[AuthGate] Failed to ensure profile", error);
        if (hasHandledAuthFailure.current) {
          return;
        }
        hasHandledAuthFailure.current = true;
        await clearAuthTokens();
        router.replace("/sign-in");
      })
      .finally(() => {
        setIsEnsuringProfile(false);
      });
  }, [ensureProfile, isAuthenticated, router]);

  if (isLoading || isProfileLoading) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
}

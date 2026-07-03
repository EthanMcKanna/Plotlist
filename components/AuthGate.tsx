import { ReactNode, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  useGlobalSearchParams,
  usePathname,
  useRouter,
  useSegments,
} from "expo-router";
import { LoadingScreen } from "./LoadingScreen";
import { api } from "../lib/plotlist/api";
import { PlotlistApiError } from "../lib/api/client";
import { clearStoredSession } from "../lib/api/session";
import { getCachedOnboardingStep } from "../lib/onboardingCache";
import { useAuth, useMutation, useQuery } from "../lib/plotlist/react";

function isAuthFailure(error: unknown): boolean {
  if (error instanceof PlotlistApiError) {
    return error.status === 401 || error.status === 403;
  }
  if (error instanceof Error) {
    return error.message.toLowerCase().includes("not authenticated");
  }
  return false;
}

// Set to true to force clear tokens on next app load (for key rotation)
const FORCE_CLEAR_TOKENS = false;
let hasCleared = false;

const ONBOARDING_ROUTE = "/onboarding";
const WELCOME_TOUR_ROUTE = "/onboarding/welcome";

type AuthRoute = "/sign-in" | "/home" | typeof ONBOARDING_ROUTE;

function replaceRoute(router: ReturnType<typeof useRouter>, href: AuthRoute) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    if (window.location.pathname !== href) {
      window.location.replace(href);
    }
    return;
  }
  router.replace(href);
}

function isDevPreviewRoute(
  pathname: string | null | undefined,
  previewParam: string | null,
) {
  return Boolean(
    typeof __DEV__ !== "undefined" &&
      __DEV__ &&
      (pathname?.startsWith("/dev/") ||
        (pathname?.startsWith("/show/") && previewParam === "1") ||
        (pathname === "/home" && previewParam === "1")),
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const previewParam = Array.isArray(params.preview)
    ? params.preview[0] ?? null
    : typeof params.preview === "string"
      ? params.preview
      : null;
  const ensureProfile = useMutation(api.users.ensureProfile);
  const hasEnsuredProfile = useRef(false);
  const hasHandledAuthFailure = useRef(false);
  const [isEnsuringProfile, setIsEnsuringProfile] = useState(false);
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");

  // One-time token clear for key rotation
  useEffect(() => {
    if (FORCE_CLEAR_TOKENS && !hasCleared) {
      hasCleared = true;
      void clearStoredSession();
    }
  }, []);

  const isProfileLoading = isAuthenticated && (me === undefined || isEnsuringProfile);

  // Route protection: redirect based on authentication state
  useEffect(() => {
    if (isLoading || isProfileLoading) return;

    const inAuthGroup =
      segments[0] === "(auth)" || pathname?.startsWith("/sign-in");
    const inOnboardingGroup = segments[0] === "onboarding";
    const inDevPreview = isDevPreviewRoute(pathname, previewParam);
    const atRoot = pathname === "/";
    const cachedOnboardingStep = getCachedOnboardingStep(me?._id ?? me?.id);
    const effectiveOnboardingStep = cachedOnboardingStep ?? me?.onboardingStep;
    const needsOnboarding =
      isAuthenticated && (effectiveOnboardingStep ?? "profile") !== "complete";

    if (!isAuthenticated && !inAuthGroup && !inDevPreview) {
      replaceRoute(router, "/sign-in");
      return;
    }

    if (isAuthenticated && needsOnboarding && !inOnboardingGroup) {
      // The wizard resumes at the right stage (tour, profile, follow, taste)
      // from the server-side step and the device-level tour flag.
      replaceRoute(router, ONBOARDING_ROUTE);
      return;
    }

    const inWelcomeTour = pathname?.startsWith(WELCOME_TOUR_ROUTE) ?? false;
    if (isAuthenticated && !needsOnboarding && inOnboardingGroup && !inWelcomeTour) {
      replaceRoute(router, "/home");
      return;
    }

    if (isAuthenticated && (inAuthGroup || atRoot)) {
      replaceRoute(router, "/home");
    }
  }, [
    isAuthenticated,
    isLoading,
    isProfileLoading,
    me?.id,
    me?.onboardingStep,
    me?._id,
    pathname,
    previewParam,
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
        if (!isAuthFailure(error)) {
          hasEnsuredProfile.current = false;
          return;
        }
        hasHandledAuthFailure.current = true;
        await clearStoredSession();
        if (typeof window !== "undefined" && typeof window.location?.assign === "function") {
          window.location.assign("/sign-in");
          return;
        }
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

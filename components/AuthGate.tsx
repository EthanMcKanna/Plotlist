import { ReactNode, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import {
  useGlobalSearchParams,
  usePathname,
  useRouter,
  useSegments,
} from "expo-router";
import { LaunchOverlay } from "./LaunchOverlay";
import { api } from "../lib/plotlist/api";
import { PlotlistApiError } from "../lib/api/client";
import { clearStoredSession } from "../lib/api/session";
import { getCachedOnboardingStep } from "../lib/onboardingCache";
import { getWelcomeTourSeen } from "../lib/preferences";
import { setSentryUser } from "../lib/sentry";
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
  // True once the redirect effect has run without needing to move the user —
  // i.e. the route on screen is the one they should actually be on. The
  // launch overlay stays up until then so redirects happen out of sight.
  const [isRouteSettled, setIsRouteSettled] = useState(false);
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");

  // One-time token clear for key rotation
  useEffect(() => {
    if (FORCE_CLEAR_TOKENS && !hasCleared) {
      hasCleared = true;
      void clearStoredSession();
    }
  }, []);

  // Warm the welcome-tour flag from storage so the onboarding wizard can
  // resolve its starting stage synchronously instead of showing a loader.
  useEffect(() => {
    void getWelcomeTourSeen().catch(() => undefined);
  }, []);

  // A known profile (fresh or hydrated from the warm-start cache) renders
  // immediately; ensureProfile then verifies in the background. Gating on it
  // would unmount and remount the navigator mid-boot, resetting navigation
  // state to the index route and looping the launch redirect.
  const hasProfileIdentity = Boolean(me?._id ?? me?.id);
  const isProfileLoading =
    isAuthenticated &&
    (me === undefined || (isEnsuringProfile && !hasProfileIdentity));

  // Attach the signed-in user to crash reports; cleared on sign-out.
  useEffect(() => {
    if (!isAuthenticated) {
      setSentryUser(null);
      return;
    }
    const meId = me?._id ?? me?.id;
    if (meId) {
      setSentryUser({
        id: String(meId),
        username: typeof me?.username === "string" ? me.username : undefined,
      });
    }
  }, [isAuthenticated, me?._id, me?.id, me?.username]);

  // Route protection: redirect based on authentication state
  useEffect(() => {
    if (isLoading || isProfileLoading) {
      setIsRouteSettled(false);
      return;
    }

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
      setIsRouteSettled(false);
      replaceRoute(router, "/sign-in");
      return;
    }

    if (isAuthenticated && needsOnboarding && !inOnboardingGroup) {
      // The wizard resumes at the right stage (tour, profile, follow, taste)
      // from the server-side step and the device-level tour flag.
      setIsRouteSettled(false);
      replaceRoute(router, ONBOARDING_ROUTE);
      return;
    }

    const inWelcomeTour = pathname?.startsWith(WELCOME_TOUR_ROUTE) ?? false;
    if (isAuthenticated && !needsOnboarding && inOnboardingGroup && !inWelcomeTour) {
      setIsRouteSettled(false);
      replaceRoute(router, "/home");
      return;
    }

    if (isAuthenticated && (inAuthGroup || atRoot)) {
      setIsRouteSettled(false);
      replaceRoute(router, "/home");
      return;
    }

    setIsRouteSettled(true);
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

  const isBooting = isLoading || isProfileLoading;

  return (
    <View style={styles.root}>
      {!isBooting && children}
      <LaunchOverlay visible={isBooting || !isRouteSettled} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "#0D0F14",
    flex: 1,
  },
});

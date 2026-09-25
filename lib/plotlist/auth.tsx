import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from "react";

import { authApi, refreshSessionIfNeeded } from "../api/client";
import { setStoredSignInPhone } from "../authStorage";
import {
  clearStoredSession,
  getStoredSession,
  type StoredSession,
  subscribeToSessionCleared,
} from "../api/session";
import { clearHomeWarmCache } from "../homeWarmCache";
import { clearUpNextWidget } from "../upNextWidget";

type PlotlistSessionContextValue = {
  isApiAuthenticated: boolean;
  isLoading: boolean;
  markSignedIn: () => void;
  markSignedOut: () => void;
};

const FALLBACK_SESSION: PlotlistSessionContextValue = {
  isApiAuthenticated: false,
  isLoading: false,
  markSignedIn() {},
  markSignedOut() {},
};

const PlotlistSessionContext = createContext<PlotlistSessionContextValue | null>(null);

// A stored session whose refresh token is still valid is treated as signed
// in right away, so the navigator (and the warm-start home cache) mounts on
// the first frame instead of after a refresh round trip — access tokens live
// 15 minutes, so nearly every cold start needs one. The refresh still runs
// now, single-flighted with the first RPCs that need the new token; a 401/403
// clears the stored session, which subscribeToSessionCleared turns into a
// sign-out. A network failure keeps the user signed in (it used to bounce an
// offline launch to the sign-in screen).
function isSessionUsable(session: StoredSession | null): session is StoredSession {
  return Boolean(session && session.refreshTokenExpiresAt > Date.now());
}

export function PlotlistSessionProvider({ children }: PropsWithChildren) {
  const [isLoading, setIsLoading] = useState(true);
  const [isApiAuthenticated, setIsApiAuthenticated] = useState(false);
  const authGeneration = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const generation = authGeneration.current;

    void (async () => {
      const session = await getStoredSession();
      if (!cancelled && generation === authGeneration.current) {
        const usable = isSessionUsable(session);
        setIsApiAuthenticated(usable);
        setIsLoading(false);
        if (usable) {
          void refreshSessionIfNeeded().catch(() => undefined);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () =>
      subscribeToSessionCleared(() => {
        setIsApiAuthenticated(false);
        setIsLoading(false);
      }),
    [],
  );

  const value = useMemo<PlotlistSessionContextValue>(
    () => ({
      isApiAuthenticated,
      isLoading,
      markSignedIn() {
        authGeneration.current += 1;
        setIsApiAuthenticated(true);
        setIsLoading(false);
      },
      markSignedOut() {
        authGeneration.current += 1;
        setIsApiAuthenticated(false);
        setIsLoading(false);
      },
    }),
    [isApiAuthenticated, isLoading],
  );

  return (
    <PlotlistSessionContext.Provider value={value}>
      {children}
    </PlotlistSessionContext.Provider>
  );
}

export function usePlotlistSession() {
  return useContext(PlotlistSessionContext) ?? FALLBACK_SESSION;
}

export function useAuth() {
  const session = usePlotlistSession();

  return {
    isAuthenticated: session.isApiAuthenticated,
    isLoading: session.isLoading,
  };
}

export function useAuthActions() {
  const session = usePlotlistSession();

  return {
    async signIn(provider: string, params?: Record<string, unknown>) {
      if (
        provider === "phone" &&
        typeof params?.phone === "string" &&
        typeof params?.code === "string"
      ) {
        await authApi.verify(params.phone, params.code);
        await setStoredSignInPhone(params.phone);
        session.markSignedIn();
        return { signingIn: true };
      }

      if (provider === "apple" && typeof params?.identityToken === "string") {
        await authApi.appleSignIn({
          identityToken: params.identityToken,
          rawNonce: typeof params.rawNonce === "string" ? params.rawNonce : undefined,
          fullName: params.fullName as
            | { givenName?: string | null; familyName?: string | null }
            | null
            | undefined,
        });
        session.markSignedIn();
        return { signingIn: true };
      }

      throw new Error(`Unsupported sign-in provider: ${provider}`);
    },
    async signOut() {
      // Runs before logout so the still-valid session can disown the device.
      // Dynamic import: pushToken pulls expo-notifications (~90 modules) and
      // sign-out is the only reason this file needs it — keep that graph off
      // the root-layout startup path.
      await import("../pushToken")
        .then((pushToken) => pushToken.unregisterPushTokenFromServer())
        .catch(() => undefined);
      await authApi.logout().catch(() => undefined);
      await clearStoredSession();
      // The warm-start snapshot and widget payload belong to this account;
      // never let them leak into another sign-in on the same device.
      clearHomeWarmCache();
      clearUpNextWidget();
      session.markSignedOut();
      return { ok: true };
    },
  };
}

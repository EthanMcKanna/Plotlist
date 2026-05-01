import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";

import { authApi } from "../api/client";
import { getApiBaseUrl } from "../api/env";
import {
  clearStoredSession,
  getStoredSession,
  setStoredSession,
  type StoredSession,
  subscribeToSessionCleared,
} from "../api/session";

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

async function validateStoredSession(session: StoredSession) {
  const response = await fetch(`${getApiBaseUrl()}/api/auth/refresh`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      refreshToken: session.refreshToken,
    }),
  });

  if (!response.ok) {
    await clearStoredSession();
    return null;
  }

  const nextSession = (await response.json()) as StoredSession;
  await setStoredSession(nextSession);
  return nextSession;
}

export function PlotlistSessionProvider({ children }: PropsWithChildren) {
  const [isLoading, setIsLoading] = useState(true);
  const [isApiAuthenticated, setIsApiAuthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const session = await getStoredSession();
      if (!cancelled) {
        const validatedSession =
          session && session.refreshTokenExpiresAt > Date.now()
            ? await validateStoredSession(session).catch(() => null)
            : null;
        setIsApiAuthenticated(Boolean(validatedSession));
        setIsLoading(false);
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
        setIsApiAuthenticated(true);
      },
      markSignedOut() {
        setIsApiAuthenticated(false);
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
        session.markSignedIn();
        return { signingIn: true };
      }

      throw new Error(`Unsupported sign-in provider: ${provider}`);
    },
    async signOut() {
      await authApi.logout().catch(() => undefined);
      await clearStoredSession();
      session.markSignedOut();
      return { ok: true };
    },
  };
}

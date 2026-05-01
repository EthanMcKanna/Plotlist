import { Platform } from "react-native";

type TokenStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const service = "plotlist";
const nativeFallbackStorage = new Map<string, string>();
const webFallbackStorage = new Map<string, string>();

// Sanitize key for SecureStore (only allow alphanumeric, dots, dashes, underscores)
function sanitizeKey(key: string) {
  return key.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getCookieItem(key: string) {
  if (typeof document === "undefined") return null;
  const encodedKey = encodeURIComponent(key);
  const entry = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${encodedKey}=`));
  if (!entry) return null;
  return decodeURIComponent(entry.slice(encodedKey.length + 1));
}

function setCookieItem(key: string, value: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(
    value,
  )}; path=/; max-age=2592000; samesite=lax; secure`;
}

function removeCookieItem(key: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${encodeURIComponent(
    key,
  )}=; path=/; max-age=0; samesite=lax; secure`;
}

// Web fallback using localStorage
const webStorage: TokenStorage = {
  getItem: async (key) => {
    if (typeof window === "undefined") return null;
    const sanitized = sanitizeKey(key);
    return (
      webFallbackStorage.get(sanitized) ??
      window.localStorage.getItem(sanitized) ??
      getCookieItem(sanitized)
    );
  },
  setItem: async (key, value) => {
    if (typeof window === "undefined") return;
    const sanitized = sanitizeKey(key);
    webFallbackStorage.set(sanitized, value);
    window.localStorage.setItem(sanitized, value);
    setCookieItem(sanitized, value);
  },
  removeItem: async (key) => {
    if (typeof window === "undefined") return;
    const sanitized = sanitizeKey(key);
    webFallbackStorage.delete(sanitized);
    window.localStorage.removeItem(sanitized);
    removeCookieItem(sanitized);
  },
};

// Native storage using SecureStore
function createNativeStorage(): TokenStorage {
  let secureStore: typeof import("expo-secure-store") | null | undefined;

  const getSecureStore = () => {
    if (secureStore !== undefined) {
      return secureStore;
    }

    try {
      // Dynamic import keeps the web bundle clean and lets launch continue if the module is unavailable.
      secureStore = require("expo-secure-store");
    } catch (error) {
      secureStore = null;
      console.warn("[Storage] SecureStore is unavailable, falling back to in-memory storage.", error);
    }

    return secureStore;
  };

  return {
    getItem: async (key: string) => {
      const sanitized = sanitizeKey(key);
      const SecureStore = getSecureStore();

      if (!SecureStore) {
        return nativeFallbackStorage.get(sanitized) ?? null;
      }

      try {
        const value = await SecureStore.getItemAsync(sanitized, {
          keychainService: service,
        });

        if (value === null) {
          nativeFallbackStorage.delete(sanitized);
          return null;
        }

        nativeFallbackStorage.set(sanitized, value);
        return value;
      } catch (error) {
        console.warn(`[Storage] Failed to read ${sanitized} from SecureStore.`, error);
        return nativeFallbackStorage.get(sanitized) ?? null;
      }
    },
    setItem: async (key: string, value: string) => {
      const sanitized = sanitizeKey(key);
      nativeFallbackStorage.set(sanitized, value);

      const SecureStore = getSecureStore();
      if (!SecureStore) {
        return;
      }

      try {
        await SecureStore.setItemAsync(sanitized, value, {
          keychainService: service,
        });
      } catch (error) {
        console.warn(`[Storage] Failed to write ${sanitized} to SecureStore.`, error);
      }
    },
    removeItem: async (key: string) => {
      const sanitized = sanitizeKey(key);
      nativeFallbackStorage.delete(sanitized);

      const SecureStore = getSecureStore();
      if (!SecureStore) {
        return;
      }

      try {
        await SecureStore.deleteItemAsync(sanitized, {
          keychainService: service,
        });
      } catch (error) {
        console.warn(`[Storage] Failed to delete ${sanitized} from SecureStore.`, error);
      }
    },
  };
}

export const authStorage: TokenStorage =
  Platform.OS === "web" ? webStorage : createNativeStorage();

// Helper to clear all auth tokens (call this to force re-login)
export async function clearAuthTokens() {
  const keys = [
    "__plotlistApiAccessToken",
    "__plotlistApiRefreshToken",
    "__plotlistApiAccessTokenExpiresAt",
    "__plotlistApiRefreshTokenExpiresAt",
  ];
  for (const key of keys) {
    try {
      await authStorage.removeItem(key);
    } catch (e) {
      // Ignore errors
    }
  }
  console.log("[Storage] Cleared all auth tokens");
}

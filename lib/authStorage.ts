import { Platform } from "react-native";

type TokenStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const service = "plotlist";
const nativeFallbackStorage = new Map<string, string>();

// Sanitize key for SecureStore (only allow alphanumeric, dots, dashes, underscores)
function sanitizeKey(key: string) {
  return key.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// Web fallback using localStorage
const webStorage: TokenStorage = {
  getItem: async (key) => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(sanitizeKey(key));
  },
  setItem: async (key, value) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(sanitizeKey(key), value);
  },
  removeItem: async (key) => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(sanitizeKey(key));
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

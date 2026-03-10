import { Platform } from "react-native";

const KEY_CONTACTS_SYNC_DISMISSED = "contactsSyncDismissed";
const nativeFallbackStorage = new Map<string, string>();

async function getStorage(): Promise<{
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}> {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return {
      getItem: async (key) => window.localStorage.getItem(key),
      setItem: async (key, value) => window.localStorage.setItem(key, value),
      removeItem: async (key) => window.localStorage.removeItem(key),
    };
  }

  let SecureStore: typeof import("expo-secure-store") | null = null;
  try {
    SecureStore = require("expo-secure-store");
  } catch (error) {
    console.warn("[Preferences] SecureStore is unavailable, falling back to in-memory storage.", error);
  }

  return {
    getItem: async (key) => {
      if (!SecureStore) {
        return nativeFallbackStorage.get(key) ?? null;
      }
      const value = await SecureStore.getItemAsync(key);
      if (value === null) {
        nativeFallbackStorage.delete(key);
        return null;
      }
      nativeFallbackStorage.set(key, value);
      return value;
    },
    setItem: async (key, value) => {
      nativeFallbackStorage.set(key, value);
      if (!SecureStore) {
        return;
      }
      await SecureStore.setItemAsync(key, value);
    },
    removeItem: async (key) => {
      nativeFallbackStorage.delete(key);
      if (!SecureStore) {
        return;
      }
      await SecureStore.deleteItemAsync(key);
    },
  };
}

export async function getContactsSyncDismissed(): Promise<boolean> {
  const storage = await getStorage();
  const value = await storage.getItem(KEY_CONTACTS_SYNC_DISMISSED);
  return value === "true";
}

export async function setContactsSyncDismissed(dismissed: boolean): Promise<void> {
  const storage = await getStorage();
  if (dismissed) {
    await storage.setItem(KEY_CONTACTS_SYNC_DISMISSED, "true");
  } else {
    await storage.removeItem(KEY_CONTACTS_SYNC_DISMISSED);
  }
}

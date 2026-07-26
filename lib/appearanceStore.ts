import { useSyncExternalStore } from "react";

import {
  AccentTheme,
  AccentThemeKey,
  DEFAULT_ACCENT,
  getAccentTheme,
  isAccentThemeKey,
} from "./appearance";
import { getAccentThemePreference, setAccentThemePreference } from "./preferences";

// Live accent-theme store, same shape as the pro-status store in
// lib/purchases: module-level value + listener set + useSyncExternalStore
// hook. The in-memory value makes reads synchronous — storage is only
// touched at hydration and on writes, so rendering never blocks on
// SecureStore.

let currentKey: AccentThemeKey = DEFAULT_ACCENT;
let hydrated = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

export function getAccentKey(): AccentThemeKey {
  return currentKey;
}

export function subscribeAccent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setAccentKey(key: AccentThemeKey): void {
  if (key === currentKey) return;
  currentKey = key;
  notifyListeners();
  // Fire-and-forget persistence — the in-memory value is already live.
  void setAccentThemePreference(key === DEFAULT_ACCENT ? null : key).catch((error) => {
    console.warn("[Appearance] Failed to persist accent theme.", error);
  });
}

export async function hydrateAccentFromStorage(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const stored = await getAccentThemePreference();
    if (stored && isAccentThemeKey(stored) && stored !== currentKey) {
      currentKey = stored;
      notifyListeners();
    }
  } catch (error) {
    console.warn("[Appearance] Failed to hydrate accent theme.", error);
  }
}

// Imperative snapshot for non-React modules (chart palettes, share cards).
// Values read here don't update on theme change — call at use time, never
// capture the result in a module-level constant.
export function getAccent(): AccentTheme {
  return getAccentTheme(currentKey);
}

// Subscribed accent for components: re-renders on theme change.
export function useAccent(): AccentTheme {
  const key = useSyncExternalStore(subscribeAccent, getAccentKey, getAccentKey);
  return getAccentTheme(key);
}

import { Platform } from "react-native";

// Rapid double-taps fire onPress twice before the first push starts its
// transition, stacking duplicate screens. All programmatic pushes go through
// this module-level lock so only the first tap in the window navigates.
// Web navigation is instant (no push transition), so the window only needs
// to absorb a double-click — 700ms there makes legitimate fast
// click → back → click sequences feel dead.
const NAV_LOCK_MS = Platform.OS === "web" ? 300 : 700;

let lockedUntil = 0;

export function acquireNavigationLock(durationMs: number = NAV_LOCK_MS): boolean {
  const now = Date.now();
  if (now < lockedUntil) {
    return false;
  }
  lockedUntil = now + durationMs;
  return true;
}

export function resetNavigationLock() {
  lockedUntil = 0;
}

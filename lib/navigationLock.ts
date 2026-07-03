// Rapid double-taps fire onPress twice before the first push starts its
// transition, stacking duplicate screens. All programmatic pushes go through
// this module-level lock so only the first tap in the window navigates.
const NAV_LOCK_MS = 700;

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

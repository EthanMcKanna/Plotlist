import { router, type Href } from "expo-router";

import { acquireNavigationLock } from "./navigationLock";

// Push that ignores re-entrant taps: double-tapping a show card must open
// the detail screen once, not stack it twice. Use this for every
// user-initiated push.
export function guardedPush(href: Href) {
  if (!acquireNavigationLock()) {
    return;
  }
  router.push(href);
}

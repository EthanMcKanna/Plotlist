import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { getLocalDateString } from "./releaseCalendar";

// Ticks are skipped while the app is backgrounded, so the foreground
// listener catches the day change the moment the app is active again.
export const LOCAL_TODAY_POLL_INTERVAL_MS = 60 * 1000;

/**
 * The user's local calendar day as a `YYYY-MM-DD` string that actually
 * rolls over at midnight. A `useMemo(() => getLocalDateString(), [])`
 * freezes the day at mount, so a screen left open (or backgrounded)
 * overnight keeps asking the server about yesterday.
 */
export function useLocalToday(enabled = true): string {
  const [today, setToday] = useState(() => getLocalDateString());

  useEffect(() => {
    if (!enabled) return;

    const sync = () => {
      setToday((current) => {
        const next = getLocalDateString();
        return next === current ? current : next;
      });
    };

    sync();
    const interval = setInterval(sync, LOCAL_TODAY_POLL_INTERVAL_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        sync();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [enabled]);

  return today;
}

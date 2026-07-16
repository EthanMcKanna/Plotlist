import { PropsWithChildren, useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "../lib/queryClient";
import {
  hydrateHomeQueryClientFromWarmCache,
  isHomeWarmQueryPersistable,
  recordHomeWarmQuery,
} from "../lib/homeWarmCache";
import { getLocalDateString } from "../lib/releaseCalendar";
import { recordUpNextForWidget } from "../lib/upNextWidget";

// This provider wraps the root layout, so it must only import leaf libs —
// pulling component modules in here re-enters the router's module graph
// during startup and breaks web routing.

export function QueryProvider({ children }: PropsWithChildren) {
  // Hydrate synchronously before the first child renders: the home surface
  // sees last session's profile, up-next, and badge payloads on frame one
  // instead of popping in after the network round-trips.
  useState(() => {
    hydrateHomeQueryClientFromWarmCache(queryClient, {
      now: Date.now(),
      today: getLocalDateString(),
    });
    return true;
  });

  useEffect(() => {
    const queryCache = queryClient.getQueryCache();
    return queryCache.subscribe((event) => {
      if (event.type !== "updated" || event.action?.type !== "success") return;
      const key = event.query.queryKey;
      if (!Array.isArray(key) || key[0] !== "plotlist-rpc" || key[1] !== "query") {
        return;
      }
      const name = key[2];
      const args = key[3];
      if (name === "episodeProgress:getUpNext") {
        recordUpNextForWidget(event.query.state.data);
      }
      if (!isHomeWarmQueryPersistable(name)) return;
      if (args !== undefined && (typeof args !== "object" || args === null)) {
        return;
      }
      recordHomeWarmQuery(
        name,
        (args ?? {}) as Record<string, unknown>,
        event.query.state.data,
      );
    });
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

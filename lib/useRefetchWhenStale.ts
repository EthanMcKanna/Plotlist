import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";

import { getFunctionName } from "./plotlist/api";
import type { PlotlistFunctionReference } from "./plotlist/types";
import { queryClient } from "./queryClient";

// `refetchOnWindowFocus` is off globally (lib/queryClient.ts): most screens
// are fed by mutation invalidation and would only waste RPCs on focus. A few
// surfaces change *without* a local mutation — friends post, notifications
// arrive, episodes get watched on another device or from the widget — and
// those go stale silently. This hook is the one shared answer: when the
// screen regains focus or the app returns to the foreground, refetch the
// query only if its cached payload is older than `maxAgeMs`.

export type RefetchWhenStaleOptions = {
  /** Cached data older than this (ms) is refetched on focus / foreground. */
  maxAgeMs: number;
  /**
   * `usePaginatedQuery` keys on ["plotlist-rpc","paginated",name,{...args,
   * paginationOpts}]; set this to match every page of the query (only the
   * active page actually refetches).
   */
  paginated?: boolean;
};

type QueryArgs = Record<string, any> | undefined;

function paginatedKeyMatches(key: readonly unknown[], name: string, args: QueryArgs) {
  if (key[0] !== "plotlist-rpc" || key[1] !== "paginated" || key[2] !== name) {
    return false;
  }
  const keyArgs = key[3];
  if (!keyArgs || typeof keyArgs !== "object") {
    return false;
  }
  return Object.entries(args ?? {}).every(
    ([argKey, argValue]) => (keyArgs as Record<string, any>)[argKey] === argValue,
  );
}

/**
 * Refetch `query` now if its cached data is older than `maxAgeMs`. Returns
 * whether a refetch was triggered. Never-fetched and in-flight queries are
 * left alone: the mounted hook is already loading them.
 */
export function refetchWhenStale(
  query: PlotlistFunctionReference<"query">,
  args: QueryArgs | "skip",
  options: RefetchWhenStaleOptions,
  now = Date.now(),
): boolean {
  if (args === "skip") {
    return false;
  }
  const name = getFunctionName(query);

  if (options.paginated) {
    const matches = queryClient
      .getQueryCache()
      .findAll({ queryKey: ["plotlist-rpc", "paginated", name] })
      .filter((entry) => paginatedKeyMatches(entry.queryKey, name, args));
    const updatedAt = Math.max(0, ...matches.map((entry) => entry.state.dataUpdatedAt));
    if (updatedAt === 0 || now - updatedAt <= options.maxAgeMs) {
      return false;
    }
    if (matches.some((entry) => entry.state.fetchStatus === "fetching")) {
      return false;
    }
    void queryClient.invalidateQueries({
      predicate: (entry) => paginatedKeyMatches(entry.queryKey, name, args),
      refetchType: "active",
    });
    return true;
  }

  const queryKey = ["plotlist-rpc", "query", name, args] as const;
  const state = queryClient.getQueryState(queryKey as any);
  const updatedAt = state?.dataUpdatedAt ?? 0;
  if (updatedAt === 0 || now - updatedAt <= options.maxAgeMs) {
    return false;
  }
  if (state?.fetchStatus === "fetching") {
    return false;
  }
  void queryClient.invalidateQueries({
    queryKey: queryKey as any,
    exact: true,
    refetchType: "active",
  });
  return true;
}

/**
 * Keep a screen's query fresh on natural "fresh look" moments: navigation
 * focus (expo-router) and app foreground (AppState). Pass the same `args`
 * (or "skip") the query hook itself receives so the cache keys line up.
 */
export function useRefetchWhenStale(
  query: PlotlistFunctionReference<"query">,
  args: QueryArgs | "skip",
  options: RefetchWhenStaleOptions,
) {
  // Args are usually fresh object literals each render; read them through a
  // ref so the focus/foreground callbacks keep one identity.
  const latest = useRef({ query, args, options });
  latest.current = { query, args, options };

  const check = useCallback(() => {
    const current = latest.current;
    refetchWhenStale(current.query, current.args, current.options);
  }, []);

  useFocusEffect(check);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        check();
      }
    });
    return () => subscription.remove();
  }, [check]);
}

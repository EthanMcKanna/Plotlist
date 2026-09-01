/**
 * Cache-wide optimistic patching for entities that several screens display.
 *
 * `withOptimisticUpdate` hands a mutation a LocalStore that writes one query
 * at a time by (ref, args). That works when the caller knows exactly which
 * query it is patching, but a like count or a follow flag lives on every
 * cached list that happens to contain the entity — different limits,
 * different cursors, different screens. These helpers walk the query cache
 * by RPC *name* instead, apply a pure patch to every hit, and write the
 * changed ones back through the LocalStore so the mutation's rollback still
 * covers them.
 */

import type { QueryClient } from "@tanstack/react-query";

import { getFunctionName } from "./plotlist/api";
import type { LocalStore } from "./plotlist/react";
import type { PaginatedResult, PlotlistFunctionReference } from "./plotlist/types";

const RPC_KEY_ROOT = "plotlist-rpc";

/** Pure patcher: must return the same reference when nothing changed. */
export type CachePatch = (data: any, args: Record<string, any> | undefined) => any;

/** Minimal store surface the helpers need (LocalStore satisfies it). */
export type CacheWriter = Pick<LocalStore, "getQuery" | "setQuery" | "setPaginatedQuery">;

export function queryRefFor(name: string): PlotlistFunctionReference<"query"> {
  return { __kind: "query", __name: name } as PlotlistFunctionReference<"query">;
}

/** Maps an array while preserving its identity when no element changed. */
export function mapPreservingIdentity<T>(items: T[], patch: (item: T) => T): T[] {
  let changed = false;
  const next = items.map((item) => {
    const patched = patch(item);
    if (patched !== item) changed = true;
    return patched;
  });
  return changed ? next : items;
}

/**
 * Applies `patch` to a paginated page (`page` or `results`) preserving the
 * envelope's identity when the rows did not change.
 */
export function patchPaginatedRows(
  result: PaginatedResult | undefined,
  patch: (rows: any[]) => any[],
): PaginatedResult | undefined {
  if (!result || typeof result !== "object") return result;
  let next: PaginatedResult = result;
  if (Array.isArray(result.page)) {
    const page = patch(result.page);
    if (page !== result.page) next = { ...next, page };
  }
  if (Array.isArray(result.results)) {
    const results = patch(result.results);
    if (results !== result.results) next = { ...next, results };
  }
  return next;
}

/**
 * Patches every cached query (plain or paginated) whose RPC name is listed,
 * writing changed results through `store`. Returns how many queries changed.
 */
export function patchCachedQueries(
  store: CacheWriter,
  client: QueryClient,
  names: readonly string[],
  patch: CachePatch,
): number {
  let touched = 0;
  const wanted = new Set(names);
  const paginatedNames = new Set<string>();

  for (const record of client.getQueryCache().findAll({ queryKey: [RPC_KEY_ROOT] })) {
    const key = record.queryKey as readonly unknown[];
    const kind = key[1];
    const name = key[2];
    if (typeof name !== "string" || !wanted.has(name)) continue;
    if (kind === "paginated") {
      paginatedNames.add(name);
      continue;
    }
    if (kind !== "query") continue;
    const current = record.state.data;
    if (current === undefined) continue;
    const args = key[3] as Record<string, any> | undefined;
    const next = patch(current, args);
    if (next === current) continue;
    store.setQuery(queryRefFor(name), args, next);
    touched += 1;
  }

  for (const name of paginatedNames) {
    // Empty args match every cursor/limit variant of the query; the patch
    // decides per record whether anything inside actually changed.
    store.setPaginatedQuery(queryRefFor(name), {}, (current) => {
      if (current === undefined) return current;
      const next = patch(current, undefined);
      if (next !== current) touched += 1;
      return next;
    });
  }

  return touched;
}

/**
 * Drops rows matching `shouldRemove` from every cached page of a paginated
 * query. Screens pair this with a local "hidden ids" set because pages
 * beyond the first are frozen in `usePaginatedQuery` state.
 */
export function removeRowsFromPaginatedCaches(
  store: CacheWriter,
  client: QueryClient,
  name: string,
  shouldRemove: (row: any) => boolean,
): number {
  return patchCachedQueries(store, client, [name], (data) =>
    patchPaginatedRows(data, (rows) => {
      const next = rows.filter((row) => !shouldRemove(row));
      return next.length === rows.length ? rows : next;
    }),
  );
}

/**
 * A LocalStore that writes straight into the query cache with no rollback
 * ledger — for corrections applied *after* a mutation settled (for example
 * a follow that the server turned into a pending request).
 */
export function createDirectCacheStore(client: QueryClient): LocalStore {
  const keyFor = (query: PlotlistFunctionReference<"query">, args?: Record<string, any>) =>
    [RPC_KEY_ROOT, "query", getFunctionName(query), args] as const;
  return {
    getQuery: (query, args) => client.getQueryData(keyFor(query, args) as any),
    setQuery: (query, args, data) => {
      client.setQueryData(keyFor(query, args) as any, data);
    },
    setPaginatedQuery: (query, _args, updater) => {
      const name = getFunctionName(query);
      for (const record of client.getQueryCache().findAll({
        queryKey: [RPC_KEY_ROOT, "paginated", name],
      })) {
        client.setQueryData(record.queryKey, (current: PaginatedResult | undefined) =>
          updater(current),
        );
      }
    },
    patchQueriesByName: (query, updater) => {
      const name = getFunctionName(query);
      for (const record of client.getQueryCache().findAll({
        queryKey: [RPC_KEY_ROOT, "query", name],
      })) {
        const current = record.state.data;
        if (current === undefined) continue;
        const args = record.queryKey[3] as Record<string, any> | undefined;
        const next = updater(current, args);
        if (next === undefined || next === current) continue;
        client.setQueryData(record.queryKey, next);
      }
    },
  };
}

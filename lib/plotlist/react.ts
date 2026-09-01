import { useCallback, useMemo, useState } from "react";
import {
  hashKey,
  keepPreviousData,
  useMutation as useTanstackMutation,
  useQueries as useTanstackQueries,
  useQuery as useTanstackQuery,
  type UseQueryResult,
} from "@tanstack/react-query";

import { getFunctionName } from "./api";
import { callAction, callMutation, callQuery } from "./rpc";
import { useAuth as useWrappedAuth } from "./auth";
import { queryClient } from "../queryClient";
import type { PaginatedResult, PlotlistFunctionReference } from "./types";

type ArgsOrSkip = [] | [Record<string, any> | "skip"];

// Stable empty page so loading/skipped paginated queries don't hand a fresh
// [] to every consumer on every render (which poisons downstream useMemos).
const EMPTY_PAGE: any[] = [];
export type LocalStore = {
  getQuery: <Query extends PlotlistFunctionReference<"query">>(
    query: Query,
    args?: Record<string, any>,
  ) => any;
  setQuery: <Query extends PlotlistFunctionReference<"query">>(
    query: Query,
    args: Record<string, any> | undefined,
    data: any,
  ) => void;
  setPaginatedQuery: <Query extends PlotlistFunctionReference<"query">>(
    query: Query,
    args: Record<string, any>,
    updater: (current: PaginatedResult | undefined) => PaginatedResult | undefined,
  ) => void;
};
type MutationFn = ((args?: any) => Promise<any>) & {
  withOptimisticUpdate: (handler?: (localStore: LocalStore, args: any) => unknown) => MutationFn;
};

function queryKeyFor<Query extends PlotlistFunctionReference<"query">>(
  query: Query,
  args?: Record<string, any>,
) {
  return ["plotlist-rpc", "query", getFunctionName(query as any), args] as const;
}

// Which query domains a mutation domain can change. Mutations used to
// invalidate the entire ["plotlist-rpc"] cache, so one episode checkbox
// refetched every mounted query on every screen (~15-20 RPCs per tap).
// `null` keeps the old full-cache behavior; unknown domains also fall back
// to it so a new mutation can never silently under-invalidate.
const MUTATION_INVALIDATION_DOMAINS: Record<string, readonly string[] | null> = {
  episodeProgress: [
    "episodeProgress",
    "watchStates",
    "watchLogs",
    "watchStats",
    "shows",
    "users",
    "releaseCalendar",
    "catchup",
  ],
  watchStates: [
    "watchStates",
    "episodeProgress",
    "watchLogs",
    "watchStats",
    "shows",
    "users",
    "releaseCalendar",
    "catchup",
  ],
  watchLogs: [
    "watchLogs",
    "watchStats",
    "episodeProgress",
    "watchStates",
    "users",
  ],
  reviews: ["reviews", "watchStats", "users", "likes"],
  likes: ["likes", "reviews", "comments"],
  comments: ["comments", "reviews", "lists"],
  lists: ["lists", "listItems", "users"],
  listItems: ["listItems", "lists"],
  follows: ["follows", "followRequests", "users", "feed", "contacts"],
  followRequests: ["followRequests", "follows", "users", "feed"],
  users: ["users", "follows", "followRequests", "contacts"],
  notifications: ["notifications"],
  contacts: ["contacts", "users"],
  releaseCalendar: ["releaseCalendar"],
  storage: ["storage", "users"],
  shows: ["shows"],
  phone: ["phone", "users"],
  embeddings: ["embeddings", "users"],
  reports: ["reports"],
  catchup: ["catchup"],
  blends: ["blends"],
  people: ["people"],
  // Blocking and Trakt imports change visibility/library state everywhere.
  blocks: null,
  traktImport: null,
};

function invalidationFilterForMutation(name: string) {
  const affected = MUTATION_INVALIDATION_DOMAINS[name.split(":")[0] ?? ""];
  if (affected == null) {
    return { queryKey: ["plotlist-rpc"] as const };
  }
  const affectedSet = new Set(affected);
  return {
    predicate: (query: { queryKey: readonly unknown[] }) => {
      const key = query.queryKey;
      if (key[0] !== "plotlist-rpc") return false;
      const fnName = key[2];
      return typeof fnName === "string" && affectedSet.has(fnName.split(":")[0] ?? "");
    },
  };
}

function paginatedQueryMatches(
  key: readonly unknown[],
  name: string,
  args: Record<string, any>,
) {
  if (key[0] !== "plotlist-rpc" || key[1] !== "paginated" || key[2] !== name) {
    return false;
  }
  const queryArgs = key[3];
  if (!queryArgs || typeof queryArgs !== "object") {
    return false;
  }
  return Object.entries(args).every(([argKey, argValue]) => {
    return (queryArgs as Record<string, any>)[argKey] === argValue;
  });
}

function createLocalStore() {
  const rollback = new Map<string, { key: readonly unknown[]; data: unknown }>();

  const remember = (key: readonly unknown[]) => {
    const serialized = JSON.stringify(key);
    if (!rollback.has(serialized)) {
      rollback.set(serialized, { key, data: queryClient.getQueryData(key as any) });
    }
  };

  const localStore: LocalStore = {
    getQuery: (query, args) => queryClient.getQueryData(queryKeyFor(query, args)),
    setQuery: (query, args, data) => {
      const key = queryKeyFor(query, args);
      remember(key);
      queryClient.setQueryData(key, data);
    },
    setPaginatedQuery: (query, args, updater) => {
      const name = getFunctionName(query as any);
      const queries = queryClient.getQueryCache().findAll({
        queryKey: ["plotlist-rpc", "paginated", name],
      });
      for (const queryRecord of queries) {
        if (!paginatedQueryMatches(queryRecord.queryKey, name, args)) {
          continue;
        }
        remember(queryRecord.queryKey);
        queryClient.setQueryData(queryRecord.queryKey, (current: PaginatedResult | undefined) =>
          updater(current),
        );
      }
    },
  };

  return {
    localStore,
    rollback: () => {
      for (const snapshot of rollback.values()) {
        queryClient.setQueryData(snapshot.key as any, snapshot.data);
      }
    },
  };
}

export function useAuth() {
  return useWrappedAuth();
}

// When the cached data for a query was last fetched (null if never). Lets
// screens refetch on focus only when the cache is actually old, without
// re-deriving the query-key convention.
export function queryDataUpdatedAt<Query extends PlotlistFunctionReference<"query">>(
  query: Query,
  args?: Record<string, any>,
): number | null {
  return queryClient.getQueryState(queryKeyFor(query, args) as any)?.dataUpdatedAt ?? null;
}

export function useQuery<Query extends PlotlistFunctionReference<"query">>(
  query: Query,
  ...args: ArgsOrSkip
): any {
  const name = getFunctionName(query as any);
  const queryArgs = args[0];
  const rpcResult = useTanstackQuery(
    {
      queryKey: ["plotlist-rpc", "query", name, queryArgs],
      queryFn: ({ signal }) =>
        callQuery(query, queryArgs === "skip" ? undefined : (queryArgs as any), { signal }),
      enabled: queryArgs !== "skip",
    },
    queryClient,
  );

  if (queryArgs === "skip") {
    return undefined;
  }

  return rpcResult.data;
}

// Like useQuery, but exposes fetch state so screens can tell "still loading"
// apart from "the server said this does not exist" and offer a retry on error.
// `keepPreviousData` keeps the last args' data on screen while new args load
// (a growing `limit`, a filter change) instead of blanking to a spinner.
export function useQueryState<Query extends PlotlistFunctionReference<"query">>(
  query: Query,
  queryArgs?: Record<string, any> | "skip",
  options?: { keepPreviousData?: boolean },
): {
  data: any;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => void;
} {
  const name = getFunctionName(query as any);
  const rpcResult = useTanstackQuery(
    {
      queryKey: ["plotlist-rpc", "query", name, queryArgs],
      queryFn: ({ signal }) =>
        callQuery(query, queryArgs === "skip" ? undefined : (queryArgs as any), { signal }),
      enabled: queryArgs !== "skip",
      ...(options?.keepPreviousData ? { placeholderData: keepPreviousData } : {}),
    },
    queryClient,
  );

  return {
    data: queryArgs === "skip" ? undefined : rpcResult.data,
    isLoading: queryArgs !== "skip" && rpcResult.isLoading,
    isError: queryArgs !== "skip" && rpcResult.isError,
    isFetching: queryArgs !== "skip" && rpcResult.isFetching,
    refetch: rpcResult.refetch,
  };
}

export function useMutation<Mutation extends PlotlistFunctionReference<"mutation">>(
  mutation: Mutation,
): MutationFn {
  const name = getFunctionName(mutation as any);
  const rpcMutation = useTanstackMutation(
    {
      mutationFn: (args: any) => callMutation(mutation, args),
    },
    queryClient,
  );

  return useMemo(() => {
    const buildMutation = (
      optimisticHandler?: (localStore: LocalStore, args: any) => unknown,
    ) => {
      const wrapped = (async (args?: any) => {
        const optimistic = optimisticHandler ? createLocalStore() : null;
        const invalidationFilter = invalidationFilterForMutation(name);
        try {
          if (optimisticHandler) {
            await queryClient.cancelQueries(invalidationFilter as any);
          }
          optimisticHandler?.(optimistic!.localStore, args);
          const result = await rpcMutation.mutateAsync(args);
          void queryClient.invalidateQueries({
            ...(invalidationFilter as any),
            refetchType: "active",
          });
          return result;
        } catch (error) {
          optimistic?.rollback();
          throw error;
        }
      }) as MutationFn;
      wrapped.withOptimisticUpdate = (handler) => buildMutation(handler);
      return wrapped;
    };

    return buildMutation();
  }, [name, rpcMutation.mutateAsync]);
}

export function useAction<Action extends PlotlistFunctionReference<"action">>(
  action: Action,
): (args?: any) => Promise<any> {
  const rpcAction = useTanstackMutation(
    {
      mutationFn: (args: any) => callAction(action, args),
    },
    queryClient,
  );

  return useCallback(async (args?: any) => await rpcAction.mutateAsync(args), [
    rpcAction.mutateAsync,
  ]);
}

// Read-only actions (TMDB details, seasons, IMDb ratings, recs) used to run
// as mutations — no cache, no dedupe — so back-navigating to a show refetched
// everything from scratch. This routes them through react-query with a long
// staleTime; mutation invalidation still reaches them via the domain map.
export function useActionQuery<Action extends PlotlistFunctionReference<"action">>(
  action: Action,
  args?: Record<string, any> | "skip",
  options?: { staleTime?: number; gcTime?: number },
): { data: any; isLoading: boolean; isError: boolean; refetch: () => void } {
  const name = getFunctionName(action as any);
  const queryArgs = args === "skip" ? undefined : args ?? {};
  const result = useTanstackQuery(
    {
      queryKey: ["plotlist-rpc", "action", name, queryArgs],
      queryFn: ({ signal }) => callAction(action, queryArgs, { signal }),
      enabled: args !== "skip",
      staleTime: options?.staleTime ?? 10 * 60_000,
      ...(options?.gcTime !== undefined ? { gcTime: options.gcTime } : {}),
    },
    queryClient,
  );

  return {
    data: args === "skip" ? undefined : result.data,
    isLoading: args !== "skip" && result.isLoading,
    isError: args !== "skip" && result.isError,
    refetch: result.refetch,
  };
}

type PaginatedPage = PaginatedResult | undefined;

type PaginationState = {
  // Serialized query args the cursors belong to; a different args key means
  // the consumer changed filters and pagination starts over from page one.
  argsKey: string;
  // Cursors of every page loaded after the first, in order.
  cursors: string[];
};

const NO_CURSORS: string[] = [];

function pageRows(page: PaginatedPage): any[] {
  return (page?.results ?? page?.page ?? EMPTY_PAGE) as any[];
}

// Stable module-level combiner so react-query can structurally share the
// combined result: `pages` keeps its identity while no page's data changed.
function combinePaginatedPages(results: UseQueryResult<PaginatedResult>[]) {
  return {
    pages: results.map((result) => result.data as PaginatedPage),
    firstPageLoading: results.length === 0 || (results[0]?.isLoading ?? true),
    lastPageLoading: results.length > 1 && (results[results.length - 1]?.isLoading ?? false),
  };
}

// Every loaded page is a live react-query observer on its own cache entry
// (one query key per cursor), and `results` is assembled from those entries.
// Earlier pages used to be frozen in component state, so optimistic
// `setPaginatedQuery` patches and mutation invalidation only ever reached the
// last page — rows on older pages kept stale like/read/edit state until the
// screen remounted. Now a cache write to any page repaints it, and
// invalidation refetches all of them.
export function usePaginatedQuery<Query extends PlotlistFunctionReference<"query">>(
  query: Query,
  args: Record<string, any> | "skip",
  options: any,
): {
  results: any[];
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  loadMore: (numItems?: number) => void;
} {
  const name = getFunctionName(query as any);
  const numItems = options?.initialNumItems ?? options?.numItems ?? 20;
  const skipped = args === "skip";
  const argsKey = skipped ? "skip" : hashKey([name, args]);
  const [pagination, setPagination] = useState<PaginationState>({ argsKey, cursors: NO_CURSORS });
  const cursors = pagination.argsKey === argsKey ? pagination.cursors : NO_CURSORS;

  const pageQueries = useMemo(() => {
    if (skipped) {
      return [];
    }
    return [null, ...cursors].map((cursor) => {
      const queryArgs = { ...args, paginationOpts: { cursor, numItems } };
      return {
        queryKey: ["plotlist-rpc", "paginated", name, queryArgs] as const,
        queryFn: ({ signal }: { signal?: AbortSignal }) =>
          callQuery<PaginatedResult>(query, queryArgs, { signal }),
      };
    });
    // args is re-created inline by every consumer; argsKey is its identity.
  }, [argsKey, cursors, name, numItems, query, skipped]);

  const { pages, firstPageLoading, lastPageLoading } = useTanstackQueries(
    { queries: pageQueries, combine: combinePaginatedPages },
    queryClient,
  );

  // Offset cursors mean a row can land on two pages after a prepend or a
  // server-side shift (and optimistic prepends hit every cached page), so
  // the first occurrence of an id wins.
  const results = useMemo(() => {
    const seen = new Set<string>();
    const merged: any[] = [];
    for (const page of pages) {
      for (const row of pageRows(page)) {
        const id = row?._id ?? row?.id;
        if (typeof id === "string") {
          if (seen.has(id)) continue;
          seen.add(id);
        }
        merged.push(row);
      }
    }
    return merged.length === 0 ? EMPTY_PAGE : merged;
  }, [pages]);

  const exhausted = pages.some((page) => page?.isDone === true);
  const nextCursor = pages[pages.length - 1]?.continueCursor ?? null;

  const loadMore = useCallback(
    (_numItems?: number) => {
      if (skipped || firstPageLoading || lastPageLoading || exhausted || !nextCursor) {
        return;
      }
      setPagination((current) => {
        const currentCursors = current.argsKey === argsKey ? current.cursors : NO_CURSORS;
        if (currentCursors.includes(nextCursor)) {
          return current;
        }
        return { argsKey, cursors: [...currentCursors, nextCursor] };
      });
    },
    [argsKey, exhausted, firstPageLoading, lastPageLoading, nextCursor, skipped],
  );

  return {
    results: skipped ? EMPTY_PAGE : results,
    // Skipped queries keep reporting "CanLoadMore" (never loading, never
    // done), matching the disabled-query state consumers already handle.
    status: skipped
      ? "CanLoadMore"
      : firstPageLoading
        ? "LoadingFirstPage"
        : lastPageLoading
          ? "LoadingMore"
          : exhausted
            ? "Exhausted"
            : "CanLoadMore",
    loadMore,
  };
}

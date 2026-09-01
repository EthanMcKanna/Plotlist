import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation as useTanstackMutation, useQuery as useTanstackQuery } from "@tanstack/react-query";

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
//
// Entries are query namespaces; a `-ns:fn` entry carves one query out of a
// listed namespace. Those carve-outs are the surfaces a mutation already
// patches optimistically and that must not re-rank under the user's finger
// (people discovery on a follow, review lists on a like).
//
// `feed` rides on the mutations whose server handlers fan out to feed_items
// on the response path (reviews, watch logs, lists, follows). Episode
// progress is deliberately left out: its fan-out is deferred past the
// response, so a refetch right after a mark would not see the row anyway,
// and marks are far too chatty to refetch the feed for.
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
    "feed",
  ],
  reviews: ["reviews", "watchStats", "users", "likes", "feed"],
  // Like counts on review payloads and comment threads are patched in place
  // (lib/likeCountPatch.ts, lib/comments.ts); refetching those lists here
  // only re-sorted them under the finger.
  likes: ["likes"],
  comments: ["comments", "reviews", "lists"],
  lists: ["lists", "listItems", "users", "feed"],
  listItems: ["listItems", "lists"],
  follows: [
    "follows",
    "followRequests",
    "users",
    "-users:search",
    "-users:suggested",
    "feed",
    "contacts",
    "-contacts:getMatches",
    "-contacts:getInviteCandidates",
    "-contacts:searchInviteCandidates",
  ],
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
  // Blocking changes visibility everywhere authored content or people are
  // listed (both directions, and unblock restores it all), so the list is
  // broad — but explicit, so a settings toggle no longer refetches the
  // whole home screen.
  blocks: [
    "blocks",
    "users",
    "follows",
    "followRequests",
    "feed",
    "reviews",
    "comments",
    "likes",
    "lists",
    "listItems",
    "notifications",
    "contacts",
    "people",
    "watchLogs",
  ],
  // Trakt imports change library state everywhere.
  traktImport: null,
};

function invalidationFilterForMutation(name: string) {
  const affected = MUTATION_INVALIDATION_DOMAINS[name.split(":")[0] ?? ""];
  if (affected == null) {
    return { queryKey: ["plotlist-rpc"] as const };
  }
  const affectedSet = new Set(affected.filter((entry) => !entry.startsWith("-")));
  const excludedSet = new Set(
    affected.filter((entry) => entry.startsWith("-")).map((entry) => entry.slice(1)),
  );
  return {
    predicate: (query: { queryKey: readonly unknown[] }) => {
      const key = query.queryKey;
      if (key[0] !== "plotlist-rpc") return false;
      const fnName = key[2];
      if (typeof fnName !== "string" || excludedSet.has(fnName)) return false;
      return affectedSet.has(fnName.split(":")[0] ?? "");
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
export function useQueryState<Query extends PlotlistFunctionReference<"query">>(
  query: Query,
  ...args: ArgsOrSkip
): { data: any; isLoading: boolean; isError: boolean; refetch: () => void } {
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

  return {
    data: queryArgs === "skip" ? undefined : rpcResult.data,
    isLoading: queryArgs !== "skip" && rpcResult.isLoading,
    isError: queryArgs !== "skip" && rpcResult.isError,
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
  const initialItems = options?.initialNumItems ?? options?.numItems ?? 20;
  const [cursor, setCursor] = useState<string | null>(null);
  const [pages, setPages] = useState<any[][]>([]);
  const [loadingMore, setLoadingMore] = useState(false);

  const queryArgs = args === "skip" ? "skip" : { ...args, paginationOpts: { cursor, numItems: initialItems } };
  const result = useTanstackQuery(
    {
      queryKey: ["plotlist-rpc", "paginated", name, queryArgs],
      queryFn: ({ signal }) =>
        callQuery<PaginatedResult>(query, queryArgs === "skip" ? undefined : queryArgs, { signal }),
      enabled: args !== "skip",
    },
    queryClient,
  );

  const currentPage = (result.data?.results ?? result.data?.page ?? EMPTY_PAGE) as any[];
  const allResults = useMemo(() => {
    if (cursor === null) {
      return currentPage;
    }
    return [...pages.flat(), ...currentPage];
  }, [currentPage, cursor, pages]);

  // Changing the cursor changes the query key, which fires the next page's
  // fetch on its own — no invalidation needed. The flag just needs to clear
  // once that fetch settles.
  const isFetching = result.isFetching;
  useEffect(() => {
    if (!isFetching) {
      setLoadingMore(false);
    }
  }, [isFetching]);

  const loadMore = useCallback(
    (_numItems?: number) => {
      const nextCursor = result.data?.continueCursor ?? null;
      if (!nextCursor || result.data?.isDone || loadingMore) {
        return;
      }
      setLoadingMore(true);
      setPages((existing) => [...existing, currentPage]);
      setCursor(nextCursor);
    },
    [currentPage, loadingMore, result.data],
  );

  return {
    results: args === "skip" ? EMPTY_PAGE : allResults,
    status: result.isLoading
      ? "LoadingFirstPage"
      : loadingMore
        ? "LoadingMore"
        : result.data?.isDone
          ? "Exhausted"
          : "CanLoadMore",
    loadMore,
  };
}

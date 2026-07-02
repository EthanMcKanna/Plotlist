import { useCallback, useMemo, useState } from "react";
import { useMutation as useTanstackMutation, useQuery as useTanstackQuery } from "@tanstack/react-query";

import { getFunctionName } from "./api";
import { callAction, callMutation, callQuery } from "./rpc";
import { useAuth as useWrappedAuth } from "./auth";
import { queryClient } from "../queryClient";
import type { PaginatedResult, PlotlistFunctionReference } from "./types";

type ArgsOrSkip = [] | [Record<string, any> | "skip"];
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

export function useQuery<Query extends PlotlistFunctionReference<"query">>(
  query: Query,
  ...args: ArgsOrSkip
): any {
  const name = getFunctionName(query as any);
  const queryArgs = args[0];
  const rpcResult = useTanstackQuery(
    {
      queryKey: ["plotlist-rpc", "query", name, queryArgs],
      queryFn: () => callQuery(query, queryArgs === "skip" ? undefined : (queryArgs as any)),
      enabled: queryArgs !== "skip",
    },
    queryClient,
  );

  if (queryArgs === "skip") {
    return undefined;
  }

  return rpcResult.data;
}

export function useMutation<Mutation extends PlotlistFunctionReference<"mutation">>(
  mutation: Mutation,
): MutationFn {
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
        try {
          if (optimisticHandler) {
            await queryClient.cancelQueries({ queryKey: ["plotlist-rpc"] });
          }
          optimisticHandler?.(optimistic!.localStore, args);
          const result = await rpcMutation.mutateAsync(args);
          void queryClient.invalidateQueries({
            queryKey: ["plotlist-rpc"],
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
  }, [rpcMutation.mutateAsync]);
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
      queryFn: () => callQuery<PaginatedResult>(query, queryArgs === "skip" ? undefined : queryArgs),
      enabled: args !== "skip",
    },
    queryClient,
  );

  const currentPage = (result.data?.results ?? result.data?.page ?? []) as any[];
  const allResults = useMemo(() => {
    if (cursor === null) {
      return currentPage;
    }
    return [...pages.flat(), ...currentPage];
  }, [currentPage, cursor, pages]);

  const loadMore = useCallback(
    (_numItems?: number) => {
      const nextCursor = result.data?.continueCursor ?? null;
      if (!nextCursor || result.data?.isDone || loadingMore) {
        return;
      }
      setLoadingMore(true);
      setPages((existing) => [...existing, currentPage]);
      setCursor(nextCursor);
      void queryClient
        .invalidateQueries({ queryKey: ["plotlist-rpc", "paginated", name] })
        .finally(() => setLoadingMore(false));
    },
    [currentPage, loadingMore, name, result.data],
  );

  return {
    results: args === "skip" ? [] : allResults,
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

import { useCallback, useMemo, useState } from "react";
import { useMutation as useTanstackMutation, useQuery as useTanstackQuery } from "@tanstack/react-query";

import { getFunctionName } from "./api";
import { callAction, callMutation, callQuery } from "./rpc";
import { useAuth as useWrappedAuth } from "./auth";
import { queryClient } from "../queryClient";
import type { PaginatedResult, PlotlistFunctionReference } from "./types";

type ArgsOrSkip = [] | [Record<string, any> | "skip"];
type MutationFn = ((args?: any) => Promise<any>) & {
  withOptimisticUpdate: (handler?: (...args: any[]) => unknown) => MutationFn;
};

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
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: ["plotlist-rpc"] });
      },
    },
    queryClient,
  );

  return useMemo(() => {
    const wrapped = (async (args?: any) => await rpcMutation.mutateAsync(args)) as MutationFn;
    wrapped.withOptimisticUpdate = () => wrapped;
    return wrapped;
  }, [rpcMutation.mutateAsync]);
}

export function useAction<Action extends PlotlistFunctionReference<"action">>(
  action: Action,
): (args?: any) => Promise<any> {
  const rpcAction = useTanstackMutation(
    {
      mutationFn: (args: any) => callAction(action, args),
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: ["plotlist-rpc"] });
      },
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

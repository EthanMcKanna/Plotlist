import { getFunctionName } from "./api";
import { queryClient } from "../queryClient";
import type { PlotlistFunctionReference } from "./types";

// Every args object the app currently holds cached for one query, so an
// optimistic handler can patch all of them (a diary fetched at limit 60 and
// again at 100 is two cache entries) instead of guessing the one set of args
// the calling screen happens to use. Skipped entries carry no data.
export function cachedQueryArgs<Query extends PlotlistFunctionReference<"query">>(
  query: Query,
): (Record<string, any> | undefined)[] {
  const name = getFunctionName(query as any);
  return queryClient
    .getQueryCache()
    .findAll({ queryKey: ["plotlist-rpc", "query", name] })
    .map((record) => record.queryKey[3])
    .filter((args): args is Record<string, any> | undefined => args !== "skip")
    .filter((args) => args === undefined || (typeof args === "object" && args !== null));
}

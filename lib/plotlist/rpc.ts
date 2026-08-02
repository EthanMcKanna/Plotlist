import { apiRequest, refreshSessionIfNeeded } from "../api/client";
import { getFunctionName } from "./api";

type RpcKind = "query" | "mutation" | "action";

// Mutations stay serialized so rapid-fire writes land in the order the user
// performed them. Queries and actions run concurrently: token refresh is
// already single-flighted inside refreshSessionIfNeeded, and serializing
// reads made every screen's requests wait in one global line (multi-second
// loads). Actions are fetch/cache lookups (TMDB details, embeddings, OMDb)
// or one-shot flows the UI awaits individually, so none rely on queue order.
let rpcWriteQueue: Promise<unknown> = Promise.resolve();

async function enqueueWrite<T>(task: () => Promise<T>) {
  const run = rpcWriteQueue.then(task, task);
  rpcWriteQueue = run.catch(() => undefined);
  return await run;
}

export type RpcCallOptions = { signal?: AbortSignal };

// A stalled connection must never hang a screen (or the write queue) for the
// platform's 60s default. Actions get headroom for LLM-backed flows (Ask,
// catch-up briefs) that legitimately run tens of seconds.
const RPC_TIMEOUT_MS: Record<RpcKind, number> = {
  query: 20_000,
  mutation: 30_000,
  action: 90_000,
};

function timeoutSignal(kind: RpcKind, external: AbortSignal | undefined) {
  if (typeof AbortController === "undefined") {
    return { signal: external, cleanup: () => {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS[kind]);
  const onExternalAbort = () => controller.abort();
  if (external) {
    if (external.aborted) {
      controller.abort();
    } else {
      external.addEventListener("abort", onExternalAbort);
    }
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", onExternalAbort);
    },
  };
}

async function callRpc<T>(
  kind: RpcKind,
  fn: unknown,
  args: Record<string, unknown> | undefined,
  options?: RpcCallOptions,
) {
  const execute = async () => {
    const name = getFunctionName(fn as any);
    const session = await refreshSessionIfNeeded().catch(() => null);
    const { signal, cleanup } = timeoutSignal(kind, options?.signal);
    try {
      const response = await apiRequest<{ result: T }>(`/api/rpc/${kind}`, {
        method: "POST",
        authenticate: false,
        signal,
        body: JSON.stringify({
          name,
          args: args ?? {},
          accessToken: session?.accessToken,
          refreshToken: session?.refreshToken,
        }),
      });

      return response.result;
    } finally {
      cleanup();
    }
  };

  if (kind === "mutation") {
    return await enqueueWrite(execute);
  }
  return await execute();
}

export async function callQuery<T>(
  fn: unknown,
  args?: Record<string, unknown>,
  options?: RpcCallOptions,
) {
  return await callRpc<T>("query", fn, args, options);
}

export async function callMutation<T>(fn: unknown, args?: Record<string, unknown>) {
  return await callRpc<T>("mutation", fn, args);
}

export async function callAction<T>(
  fn: unknown,
  args?: Record<string, unknown>,
  options?: RpcCallOptions,
) {
  return await callRpc<T>("action", fn, args, options);
}

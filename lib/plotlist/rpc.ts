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

async function callRpc<T>(
  kind: RpcKind,
  fn: unknown,
  args: Record<string, unknown> | undefined,
) {
  const execute = async () => {
    const name = getFunctionName(fn as any);
    const session = await refreshSessionIfNeeded().catch(() => null);
    const response = await apiRequest<{ result: T }>(`/api/rpc/${kind}`, {
      method: "POST",
      authenticate: false,
      body: JSON.stringify({
        name,
        args: args ?? {},
        accessToken: session?.accessToken,
        refreshToken: session?.refreshToken,
      }),
    });

    return response.result;
  };

  if (kind === "mutation") {
    return await enqueueWrite(execute);
  }
  return await execute();
}

export async function callQuery<T>(fn: unknown, args?: Record<string, unknown>) {
  return await callRpc<T>("query", fn, args);
}

export async function callMutation<T>(fn: unknown, args?: Record<string, unknown>) {
  return await callRpc<T>("mutation", fn, args);
}

export async function callAction<T>(fn: unknown, args?: Record<string, unknown>) {
  return await callRpc<T>("action", fn, args);
}

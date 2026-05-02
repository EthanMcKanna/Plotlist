import { apiRequest, refreshSessionIfNeeded } from "../api/client";
import { getFunctionName } from "./api";

type RpcKind = "query" | "mutation" | "action";

let rpcQueue: Promise<unknown> = Promise.resolve();

async function enqueueRpc<T>(task: () => Promise<T>) {
  const run = rpcQueue.then(task, task);
  rpcQueue = run.catch(() => undefined);
  return await run;
}

async function callRpc<T>(
  kind: RpcKind,
  fn: unknown,
  args: Record<string, unknown> | undefined,
) {
  return await enqueueRpc(async () => {
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
  });
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

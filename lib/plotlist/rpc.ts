import { apiRequest } from "../api/client";
import { getStoredSession } from "../api/session";
import { getFunctionName } from "./api";

type RpcKind = "query" | "mutation" | "action";

async function callRpc<T>(
  kind: RpcKind,
  fn: unknown,
  args: Record<string, unknown> | undefined,
) {
  const name = getFunctionName(fn as any);
  const session = await getStoredSession();
  const response = await apiRequest<{ result: T }>(`/api/rpc/${kind}`, {
    method: "POST",
    body: JSON.stringify({
      name,
      args: args ?? {},
      accessToken: session?.accessToken,
    }),
  });

  return response.result;
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

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Best-effort work that shouldn't hold up a response: cache upserts, status
 * write-backs, feed fan-out. Inside a Worker request the task rides on
 * `ctx.waitUntil` so the runtime keeps it alive after the response is sent;
 * outside one (tests, scripts) it simply floats. Failures are logged, never
 * thrown — nothing deferred here is load-bearing for the caller.
 */

type BackgroundScope = {
  waitUntil: (task: Promise<unknown>) => void;
};

const scopeStorage = new AsyncLocalStorage<BackgroundScope>();

export function runWithBackgroundScope<T>(scope: BackgroundScope, run: () => Promise<T>) {
  return scopeStorage.run(scope, run);
}

export function deferBackgroundWork(task: Promise<unknown>, label = "background task") {
  const guarded = task.catch((error) => {
    console.error(`[background] ${label} failed`, error);
  });
  const scope = scopeStorage.getStore();
  if (scope) {
    scope.waitUntil(guarded);
    return;
  }
  void guarded;
}

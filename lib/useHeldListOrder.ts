/**
 * Held ordering for lists the user acts on in place (people discovery,
 * suggestions). Same idea as the Continue rail's `applyHeldContinueOrder`:
 * once the user taps a row, the visible order *and membership* are pinned —
 * a followed person must not re-rank or drop out of "People you may know"
 * under their finger. Rows that arrive meanwhile append after the held ones;
 * held rows that vanish from fresh data render from their last-seen
 * snapshot. The hold clears at the next natural re-rank moment, which the
 * caller signals by changing `resetKey` (screen focus, a new search query,
 * pull-to-refresh).
 */

import { useCallback, useMemo, useReducer, useRef } from "react";

const EMPTY: never[] = [];

export function applyHeldListOrder<T>(
  heldKeys: ReadonlyArray<string>,
  fresh: ReadonlyArray<T>,
  getKey: (item: T) => string,
  snapshots: ReadonlyMap<string, T>,
): T[] {
  const byKey = new Map<string, T>();
  for (const item of fresh) byKey.set(getKey(item), item);
  const seen = new Set<string>();
  const result: T[] = [];
  for (const key of heldKeys) {
    if (seen.has(key)) continue;
    const item = byKey.get(key) ?? snapshots.get(key);
    if (!item) continue;
    seen.add(key);
    result.push(item);
  }
  for (const item of fresh) {
    const key = getKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

type HeldState<T> = {
  resetKey: unknown;
  heldKeys: string[] | null;
  snapshots: Map<string, T>;
};

export function useHeldListOrder<T>(
  items: ReadonlyArray<T> | undefined,
  getKey: (item: T) => string,
  options?: { resetKey?: unknown },
): { items: T[]; hold: () => void; isHeld: boolean } {
  const resetKey = options?.resetKey;
  const stateRef = useRef<HeldState<T>>({ resetKey, heldKeys: null, snapshots: new Map() });
  if (!Object.is(stateRef.current.resetKey, resetKey)) {
    stateRef.current = { resetKey, heldKeys: null, snapshots: new Map() };
  }

  const ordered = useMemo(() => {
    const state = stateRef.current;
    if (!state.heldKeys) {
      return (items ?? EMPTY) as T[];
    }
    const result = applyHeldListOrder(state.heldKeys, items ?? EMPTY, getKey, state.snapshots);
    // Every row the user has seen joins the pinned order, and snapshots track
    // the latest version of each (including optimistic patches), so a row
    // that later drops out of fresh data keeps its place and its newest state.
    state.heldKeys = result.map(getKey);
    for (const item of result) state.snapshots.set(getKey(item), item);
    return result;
    // resetKey participates so a reset recomputes even when `items` is stable.
  }, [items, getKey, resetKey]);

  const renderedRef = useRef(ordered);
  renderedRef.current = ordered;

  // hold() pins via the ref (the order it pins is the one already on screen,
  // so nothing needs recomputing) and re-renders once so `isHeld` is current.
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const hold = useCallback(() => {
    const state = stateRef.current;
    if (state.heldKeys) return;
    const rendered = renderedRef.current;
    state.heldKeys = rendered.map(getKey);
    for (const item of rendered) state.snapshots.set(getKey(item), item);
    rerender();
  }, [getKey]);

  return { items: ordered, hold, isHeld: stateRef.current.heldKeys !== null };
}

import { describe, expect, it } from "@jest/globals";
import { act, renderHook } from "@testing-library/react-native";

import { applyHeldListOrder, useHeldListOrder } from "../lib/useHeldListOrder";

type Person = { id: string; isFollowing: boolean };
const key = (person: Person) => person.id;
const people = (...ids: string[]): Person[] => ids.map((id) => ({ id, isFollowing: false }));

describe("applyHeldListOrder", () => {
  it("keeps held rows first, in held order, and appends newcomers", () => {
    const result = applyHeldListOrder(
      ["b", "a"],
      people("c", "a", "b"),
      key,
      new Map(),
    );
    expect(result.map(key)).toEqual(["b", "a", "c"]);
  });

  it("renders a held row that vanished from fresh data from its snapshot", () => {
    const snapshot: Person = { id: "a", isFollowing: true };
    const result = applyHeldListOrder(
      ["a", "b"],
      people("b"),
      key,
      new Map([["a", snapshot]]),
    );
    expect(result[0]).toBe(snapshot);
    expect(result.map(key)).toEqual(["a", "b"]);
  });

  it("prefers the fresh version of a held row over its snapshot", () => {
    const fresh: Person = { id: "a", isFollowing: true };
    const result = applyHeldListOrder(
      ["a"],
      [fresh],
      key,
      new Map([["a", { id: "a", isFollowing: false }]]),
    );
    expect(result[0]).toBe(fresh);
  });

  it("ignores duplicate held keys and held keys with no data anywhere", () => {
    const result = applyHeldListOrder(["a", "a", "ghost"], people("a", "b"), key, new Map());
    expect(result.map(key)).toEqual(["a", "b"]);
  });
});

describe("useHeldListOrder", () => {
  it("passes items through untouched until the user acts", () => {
    const items = people("a", "b");
    const { result, rerender } = renderHook(
      ({ list }: { list: Person[] | undefined }) => useHeldListOrder(list, key),
      { initialProps: { list: items } },
    );
    expect(result.current.items).toBe(items);
    expect(result.current.isHeld).toBe(false);

    const reranked = people("b", "a");
    rerender({ list: reranked });
    expect(result.current.items).toBe(reranked);
  });

  it("pins order and membership after hold() until the reset key changes", () => {
    const { result, rerender } = renderHook(
      ({ list, resetKey }: { list: Person[] | undefined; resetKey: number }) =>
        useHeldListOrder(list, key, { resetKey }),
      { initialProps: { list: people("a", "b", "c"), resetKey: 0 } },
    );

    act(() => {
      result.current.hold();
    });
    expect(result.current.isHeld).toBe(true);

    // The server re-ranks, drops "a" (say, because they got followed), and
    // adds "d": the user sees the same rows in the same places, plus "d".
    const patchedB: Person = { id: "b", isFollowing: true };
    rerender({ list: [{ id: "c", isFollowing: false }, patchedB, { id: "d", isFollowing: false }], resetKey: 0 });
    expect(result.current.items.map(key)).toEqual(["a", "b", "c", "d"]);
    // Fresh data still wins for rows that are present.
    expect(result.current.items[1]).toBe(patchedB);

    // A vanished row keeps its latest-seen version when the list goes away
    // entirely (query skipped) and comes back.
    rerender({ list: undefined, resetKey: 0 });
    expect(result.current.items.map(key)).toEqual(["a", "b", "c", "d"]);
    expect(result.current.items[1]).toBe(patchedB);

    // Focus / refresh: the hold releases and the fresh ranking applies.
    const fresh = people("d", "c", "b");
    rerender({ list: fresh, resetKey: 1 });
    expect(result.current.isHeld).toBe(false);
    expect(result.current.items).toBe(fresh);
  });

  it("returns a stable empty list while loading and unheld", () => {
    const { result, rerender } = renderHook(
      ({ list }: { list: Person[] | undefined }) => useHeldListOrder(list, key),
      { initialProps: { list: undefined as Person[] | undefined } },
    );
    const first = result.current.items;
    expect(first).toEqual([]);
    rerender({ list: undefined });
    expect(result.current.items).toBe(first);
  });
});

import { describe, expect, it } from "@jest/globals";

import { findFirstMatchInBatches, mapWithConcurrency } from "../api/_lib/concurrency";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("mapWithConcurrency", () => {
  it("returns results in input order", async () => {
    const results = await mapWithConcurrency([3, 1, 2], 2, async (value) => {
      await new Promise((resolve) => setTimeout(resolve, value));
      return value * 10;
    });
    expect(results).toEqual([30, 10, 20]);
  });

  it("never runs more than `limit` tasks at once", async () => {
    const gates = [deferred<void>(), deferred<void>(), deferred<void>(), deferred<void>()];
    let active = 0;
    let peak = 0;
    const done = mapWithConcurrency(gates, 2, async (gate) => {
      active += 1;
      peak = Math.max(peak, active);
      await gate.promise;
      active -= 1;
    });
    await Promise.resolve();
    expect(active).toBe(2);
    gates[0].resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(active).toBeLessThanOrEqual(2);
    gates[1].resolve();
    gates[2].resolve();
    gates[3].resolve();
    await done;
    expect(peak).toBe(2);
  });

  it("handles empty input and oversized limits", async () => {
    expect(await mapWithConcurrency([], 5, async () => 1)).toEqual([]);
    expect(await mapWithConcurrency([1, 2], 50, async (value) => value + 1)).toEqual([2, 3]);
  });

  it("rejects when a task rejects", async () => {
    await expect(
      mapWithConcurrency([1, 2], 2, async (value) => {
        if (value === 2) throw new Error("boom");
        return value;
      }),
    ).rejects.toThrow("boom");
  });
});

describe("findFirstMatchInBatches", () => {
  it("returns the earliest matching candidate by order, not by completion", async () => {
    const probed: string[] = [];
    const result = await findFirstMatchInBatches(["a", "b", "c"], 3, async (candidate) => {
      probed.push(candidate);
      await new Promise((resolve) => setTimeout(resolve, candidate === "b" ? 0 : 5));
      return candidate === "a" || candidate === "b" ? `hit:${candidate}` : null;
    });
    expect(result).toBe("hit:a");
    expect(probed).toEqual(["a", "b", "c"]);
  });

  it("stops probing after the first batch with a hit", async () => {
    const probed: number[] = [];
    const result = await findFirstMatchInBatches([1, 2, 3, 4, 5], 2, async (candidate) => {
      probed.push(candidate);
      return candidate === 3 ? candidate : null;
    });
    expect(result).toBe(3);
    expect(probed).toEqual([1, 2, 3, 4]);
  });

  it("returns null when nothing matches", async () => {
    expect(await findFirstMatchInBatches([1, 2], 1, async () => null)).toBeNull();
    expect(await findFirstMatchInBatches([], 2, async () => 1)).toBeNull();
  });
});

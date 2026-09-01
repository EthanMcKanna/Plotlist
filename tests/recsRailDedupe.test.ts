import { describe, expect, it } from "@jest/globals";

import { dedupeRailItems } from "../lib/plotlist/recsRanking";

const rail = (ids: string[]) => ids.map((id, index) => ({ _id: id, rank: index + 1, score: 1 }));

describe("dedupeRailItems", () => {
  it("drops ids already claimed, trims to the limit, and renumbers ranks", () => {
    const used = new Set(["a"]);
    const kept = dedupeRailItems(rail(["a", "b", "c", "d"]), used, 2);
    expect(kept.map((item) => item._id)).toEqual(["b", "c"]);
    expect(kept.map((item) => item.rank)).toEqual([1, 2]);
  });

  it("claims survivors so a later rail cannot repeat them", () => {
    const used = new Set<string>();
    const first = dedupeRailItems(rail(["x", "y", "z"]), used, 3);
    const second = dedupeRailItems(rail(["y", "w", "x", "v"]), used, 3);
    expect(first.map((item) => item._id)).toEqual(["x", "y", "z"]);
    expect(second.map((item) => item._id)).toEqual(["w", "v"]);
    expect([...used].sort()).toEqual(["v", "w", "x", "y", "z"]);
  });

  it("does not claim items beyond the limit", () => {
    const used = new Set<string>();
    dedupeRailItems(rail(["a", "b", "c"]), used, 1);
    expect([...used]).toEqual(["a"]);
  });
});

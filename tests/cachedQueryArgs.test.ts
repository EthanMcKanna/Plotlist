import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";

import { cachedQueryArgs } from "../lib/plotlist/cachedQueryArgs";
import { queryClient } from "../lib/queryClient";

afterAll(() => {
  queryClient.clear();
});

const activity = { __name: "watchLogs:listActivityForUser" } as any;

describe("cachedQueryArgs", () => {
  beforeEach(() => {
    queryClient.clear();
  });

  it("lists every args object cached for the query, skipping disabled entries", () => {
    queryClient.setQueryData(
      ["plotlist-rpc", "query", "watchLogs:listActivityForUser", { userId: "u1", limit: 60 }],
      { items: [] },
    );
    queryClient.setQueryData(
      ["plotlist-rpc", "query", "watchLogs:listActivityForUser", { userId: "u1", limit: 100 }],
      { items: [] },
    );
    queryClient.setQueryData(
      ["plotlist-rpc", "query", "watchLogs:listActivityForUser", "skip"],
      undefined,
    );
    queryClient.setQueryData(
      ["plotlist-rpc", "query", "watchLogs:listForShow", { showId: "s1" }],
      [],
    );
    queryClient.setQueryData(
      ["plotlist-rpc", "paginated", "watchLogs:listActivityForUser", { userId: "u1" }],
      { results: [] },
    );

    expect(cachedQueryArgs(activity)).toEqual([
      { userId: "u1", limit: 60 },
      { userId: "u1", limit: 100 },
    ]);
  });

  it("returns nothing when the query was never fetched", () => {
    expect(cachedQueryArgs(activity)).toEqual([]);
  });
});

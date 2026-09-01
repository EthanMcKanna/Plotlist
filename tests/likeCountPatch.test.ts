import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { QueryClient } from "@tanstack/react-query";

import {
  applyLikeToggleToCaches,
  optimisticLikeId,
  patchLikeCarrierData,
  patchLikeList,
} from "../lib/likeCountPatch";
import { createDirectCacheStore, patchCachedQueries } from "../lib/optimisticCache";

const target = { targetType: "review", targetId: "review_1" };
const row = (id: string, likeCount = 2, likedByViewer = false) => ({
  review: { _id: id },
  likeCount,
  likedByViewer,
});

describe("patchLikeCarrierData", () => {
  it("bumps the count and flag on the matching review only", () => {
    const data = [row("review_1"), row("review_2")];
    const next = patchLikeCarrierData(data, target, true);
    expect(next).not.toBe(data);
    expect(next[0]).toMatchObject({ likeCount: 3, likedByViewer: true });
    expect(next[1]).toBe(data[1]);
  });

  it("is idempotent and returns the same reference when nothing changes", () => {
    const liked = [row("review_1", 3, true)];
    expect(patchLikeCarrierData(liked, target, true)).toBe(liked);
    const other = [row("review_9")];
    expect(patchLikeCarrierData(other, target, true)).toBe(other);
    const list = [row("review_1")];
    expect(patchLikeCarrierData(list, { targetType: "list", targetId: "review_1" }, true)).toBe(list);
  });

  it("handles single payloads and paginated pages, flooring the count at zero", () => {
    expect(patchLikeCarrierData(row("review_1", 0, true), target, false)).toMatchObject({
      likeCount: 0,
      likedByViewer: false,
    });
    const page = { page: [row("review_1", 1, true)], continueCursor: "1", isDone: true };
    const next = patchLikeCarrierData(page, target, false);
    expect(next.page[0]).toMatchObject({ likeCount: 0, likedByViewer: false });
    expect(next.continueCursor).toBe("1");
  });
});

describe("patchLikeList", () => {
  it("prepends one optimistic row on like and never duplicates it", () => {
    const list = [{ _id: "like_other", userId: "user_x" }];
    const liked = patchLikeList(list, target, true, "me_1");
    expect(liked).toHaveLength(2);
    expect(liked[0]._id).toBe(optimisticLikeId(target));
    expect(liked[0].userId).toBe("me_1");
    expect(patchLikeList(liked, target, true, "me_1")).toBe(liked);
  });

  it("removes the viewer's server-issued like row on unlike", () => {
    const list = [
      { _id: "like_mine", userId: "me_1" },
      { _id: "like_other", userId: "user_x" },
    ];
    const next = patchLikeList(list, target, false, "me_1");
    expect(next.map((like: any) => like._id)).toEqual(["like_other"]);
    expect(patchLikeList(next, target, false, "me_1")).toBe(next);
  });
});

describe("applyLikeToggleToCaches", () => {
  let client: QueryClient;
  const set = (kind: "query" | "paginated", name: string, args: unknown, data: unknown) =>
    client.setQueryData(["plotlist-rpc", kind, name, args], data);
  const get = (kind: "query" | "paginated", name: string, args: unknown) =>
    client.getQueryData(["plotlist-rpc", kind, name, args]) as any;

  // Every seeded query schedules a gc timer that would otherwise keep the
  // jest process alive after the run.
  afterEach(() => {
    client.clear();
  });

  beforeEach(() => {
    client = new QueryClient();
    set("query", "reviews:getDetailed", { reviewId: "review_1" }, row("review_1", 4));
    set("query", "reviews:listForShowDetailed", { showId: "show_1" }, [row("review_1"), row("review_2")]);
    set(
      "paginated",
      "reviews:listForUserDetailed",
      { userId: "user_1", paginationOpts: { cursor: null, numItems: 10 } },
      { page: [row("review_1", 9)], continueCursor: "1", isDone: false },
    );
    set("query", "likes:getForUserTarget", target, false);
    set("query", "likes:listForTarget", { ...target, limit: 100 }, []);
    set("query", "likes:listForTarget", { ...target, limit: 20 }, []);
    set("query", "likes:listForTarget", { targetType: "list", targetId: "list_1", limit: 100 }, []);
    set("query", "users:me", undefined, { _id: "me_1" });
  });

  it("patches every carrier and every like query for the target, whatever the args", () => {
    const touched = applyLikeToggleToCaches(
      createDirectCacheStore(client),
      client,
      target,
      true,
      "me_1",
    );
    expect(touched).toBe(6);
    expect(get("query", "reviews:getDetailed", { reviewId: "review_1" })).toMatchObject({
      likeCount: 5,
      likedByViewer: true,
    });
    expect(get("query", "reviews:listForShowDetailed", { showId: "show_1" })[0]).toMatchObject({
      likeCount: 3,
      likedByViewer: true,
    });
    expect(get("query", "reviews:listForShowDetailed", { showId: "show_1" })[1]).toMatchObject({
      likeCount: 2,
      likedByViewer: false,
    });
    expect(
      get("paginated", "reviews:listForUserDetailed", {
        userId: "user_1",
        paginationOpts: { cursor: null, numItems: 10 },
      }).page[0],
    ).toMatchObject({ likeCount: 10, likedByViewer: true });
    expect(get("query", "likes:getForUserTarget", target)).toBe(true);
    expect(get("query", "likes:listForTarget", { ...target, limit: 100 })).toHaveLength(1);
    expect(get("query", "likes:listForTarget", { ...target, limit: 20 })).toHaveLength(1);
    // Unrelated caches are left alone.
    expect(
      get("query", "likes:listForTarget", { targetType: "list", targetId: "list_1", limit: 100 }),
    ).toEqual([]);
    expect(get("query", "users:me", undefined)).toEqual({ _id: "me_1" });
  });

  it("routes writes through the store so a mutation rollback can restore them", () => {
    const writes: Array<[string, unknown]> = [];
    const store = {
      getQuery: () => undefined,
      setQuery: (ref: any, args: any, data: any) => {
        writes.push([ref.__name, args]);
        client.setQueryData(["plotlist-rpc", "query", ref.__name, args], data);
      },
      setPaginatedQuery: (ref: any, _args: any, updater: any) => {
        for (const record of client.getQueryCache().findAll({
          queryKey: ["plotlist-rpc", "paginated", ref.__name],
        })) {
          writes.push([ref.__name, "paginated"]);
          client.setQueryData(record.queryKey, updater);
        }
      },
    };
    applyLikeToggleToCaches(store, client, target, true, "me_1");
    expect(writes.map(([name]) => name).sort()).toEqual([
      "likes:getForUserTarget",
      "likes:listForTarget",
      "likes:listForTarget",
      "reviews:getDetailed",
      "reviews:listForShowDetailed",
      "reviews:listForUserDetailed",
    ]);
  });

  it("does not write when nothing changes", () => {
    const store = createDirectCacheStore(client);
    applyLikeToggleToCaches(store, client, target, true, "me_1");
    const before = get("query", "reviews:getDetailed", { reviewId: "review_1" });
    const touched = patchCachedQueries(store, client, ["reviews:getDetailed"], (data) =>
      patchLikeCarrierData(data, target, true),
    );
    expect(touched).toBe(0);
    expect(get("query", "reviews:getDetailed", { reviewId: "review_1" })).toBe(before);
  });
});

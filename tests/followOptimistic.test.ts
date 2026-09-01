import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { QueryClient } from "@tanstack/react-query";

import {
  applyFollowStateToCaches,
  FOLLOWING,
  followStateForTap,
  NOT_FOLLOWING,
  patchFollowStateInData,
  patchProfileFollowState,
  removeIncomingFollowRequestFromCaches,
  REQUESTED,
} from "../lib/followOptimistic";
import { createDirectCacheStore } from "../lib/optimisticCache";

const preview = (id: string, isFollowing = false, followsYou = false) => ({
  user: { _id: id },
  isFollowing,
  followsYou,
  isMutualFollow: isFollowing && followsYou,
});

const profile = (id: string, overrides: Record<string, unknown> = {}) => ({
  user: { _id: id, isPrivate: false },
  counts: { followers: 10, following: 3 },
  relationship: {
    isFollowing: false,
    followsYou: true,
    isMutualFollow: false,
    hasPendingRequest: false,
    mutualCount: 0,
    ...overrides,
  },
});

describe("followStateForTap", () => {
  it("requests on private accounts and follows otherwise", () => {
    expect(followStateForTap(true)).toEqual(REQUESTED);
    expect(followStateForTap(false)).toEqual(FOLLOWING);
  });
});

describe("patchProfileFollowState", () => {
  it("flips the relationship and moves the follower count with the edge", () => {
    const next = patchProfileFollowState(profile("u1"), "u1", FOLLOWING);
    expect(next.relationship).toMatchObject({
      isFollowing: true,
      hasPendingRequest: false,
      isMutualFollow: true,
    });
    expect(next.counts.followers).toBe(11);

    const back = patchProfileFollowState(next, "u1", NOT_FOLLOWING);
    expect(back.relationship).toMatchObject({ isFollowing: false, isMutualFollow: false });
    expect(back.counts.followers).toBe(10);
  });

  it("does not count a pending request as a follower", () => {
    const next = patchProfileFollowState(profile("u1"), "u1", REQUESTED);
    expect(next.relationship).toMatchObject({ isFollowing: false, hasPendingRequest: true });
    expect(next.counts.followers).toBe(10);
  });

  it("returns the same reference for other users, no-ops, and signed-out payloads", () => {
    const mine = profile("u1");
    expect(patchProfileFollowState(mine, "u2", FOLLOWING)).toBe(mine);
    expect(patchProfileFollowState(mine, "u1", NOT_FOLLOWING)).toBe(mine);
    const signedOut = { ...mine, relationship: null };
    expect(patchProfileFollowState(signedOut, "u1", FOLLOWING)).toBe(signedOut);
  });

  it("floors the follower count at zero", () => {
    const zero = { ...profile("u1", { isFollowing: true }), counts: { followers: 0 } };
    expect(patchProfileFollowState(zero, "u1", NOT_FOLLOWING).counts.followers).toBe(0);
  });
});

describe("patchFollowStateInData", () => {
  it("patches person previews in arrays and paginated pages", () => {
    const list = [preview("u1", false, true), preview("u2")];
    const next = patchFollowStateInData(list, "u1", FOLLOWING);
    expect(next[0]).toMatchObject({ isFollowing: true, isMutualFollow: true });
    expect(next[1]).toBe(list[1]);
    expect(patchFollowStateInData(next, "u1", FOLLOWING)).toBe(next);

    const page = { page: [preview("u1", true)], continueCursor: "1", isDone: true };
    const patched = patchFollowStateInData(page, "u1", NOT_FOLLOWING);
    expect(patched.page[0]).toMatchObject({ isFollowing: false, isMutualFollow: false });
  });

  it("patches the follow-back state on notification rows", () => {
    const rows = [
      { _id: "n1", actor: { _id: "u1", viewerFollows: false, viewerRequested: false } },
      { _id: "n2", actor: { _id: "u2", viewerFollows: false, viewerRequested: false } },
      { _id: "n3", actor: null },
    ];
    const next = patchFollowStateInData(rows, "u1", REQUESTED);
    expect(next[0].actor).toMatchObject({ viewerFollows: false, viewerRequested: true });
    expect(next[1]).toBe(rows[1]);
    expect(next[2]).toBe(rows[2]);
  });

  it("routes profile payloads to the profile patcher", () => {
    const next = patchFollowStateInData(profile("u1"), "u1", FOLLOWING);
    expect(next.counts.followers).toBe(11);
  });
});

describe("cache application", () => {
  let client: QueryClient;
  const set = (kind: "query" | "paginated", name: string, args: unknown, data: unknown) =>
    client.setQueryData(["plotlist-rpc", kind, name, args], data);
  const get = (kind: "query" | "paginated", name: string, args: unknown) =>
    client.getQueryData(["plotlist-rpc", kind, name, args]) as any;

  beforeEach(() => {
    client = new QueryClient();
  });

  // Every seeded query schedules a gc timer that would otherwise keep the
  // jest process alive after the run.
  afterEach(() => {
    client.clear();
  });

  it("applies one person's follow state to every carrier query", () => {
    set("query", "users:search", { text: "ad", limit: 12 }, [preview("u1"), preview("u2")]);
    set("query", "users:suggested", { limit: 8 }, [preview("u1", false, true)]);
    set("query", "contacts:getMatches", { limit: 12 }, [preview("u3")]);
    set("query", "users:profile", { userId: "u1" }, profile("u1"));
    set("query", "users:profile", { userId: "u2" }, profile("u2"));
    set(
      "paginated",
      "follows:listFollowersDetailed",
      { userId: "u9", paginationOpts: { cursor: null, numItems: 20 } },
      { page: [preview("u1")], continueCursor: "1", isDone: true },
    );
    set("query", "users:me", undefined, { _id: "me", countsFollowing: 3 });

    const touched = applyFollowStateToCaches(createDirectCacheStore(client), client, "u1", FOLLOWING);

    expect(touched).toBe(4);
    expect(get("query", "users:search", { text: "ad", limit: 12 })[0].isFollowing).toBe(true);
    expect(get("query", "users:search", { text: "ad", limit: 12 })[1].isFollowing).toBe(false);
    expect(get("query", "users:suggested", { limit: 8 })[0]).toMatchObject({
      isFollowing: true,
      isMutualFollow: true,
    });
    expect(get("query", "contacts:getMatches", { limit: 12 })[0].isFollowing).toBe(false);
    expect(get("query", "users:profile", { userId: "u1" }).counts.followers).toBe(11);
    expect(get("query", "users:profile", { userId: "u2" }).counts.followers).toBe(10);
    expect(
      get("paginated", "follows:listFollowersDetailed", {
        userId: "u9",
        paginationOpts: { cursor: null, numItems: 20 },
      }).page[0].isFollowing,
    ).toBe(true);
    expect(get("query", "users:me", undefined)).toEqual({ _id: "me", countsFollowing: 3 });
  });

  it("removes an incoming follow request and decrements every count variant", () => {
    const pageArgs = { paginationOpts: { cursor: null, numItems: 30 } };
    set("paginated", "followRequests:listIncoming", pageArgs, {
      page: [
        { ...preview("u1"), requestedAt: 1 },
        { ...preview("u2"), requestedAt: 2 },
      ],
      continueCursor: "2",
      isDone: true,
    });
    set("query", "followRequests:getIncomingCount", {}, 2);
    set("query", "followRequests:getIncomingCount", undefined, 0);

    removeIncomingFollowRequestFromCaches(createDirectCacheStore(client), client, "u1");

    expect(
      get("paginated", "followRequests:listIncoming", pageArgs).page.map((row: any) => row.user._id),
    ).toEqual(["u2"]);
    expect(get("query", "followRequests:getIncomingCount", {})).toBe(1);
    expect(get("query", "followRequests:getIncomingCount", undefined)).toBe(0);
  });
});

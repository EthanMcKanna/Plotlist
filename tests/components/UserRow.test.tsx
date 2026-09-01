import { afterAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Mutation mocks mirror lib/plotlist/react's MutationFn: calling
// `.withOptimisticUpdate(handler)` runs the handler against a store over the
// real query client (no rollback ledger — the tests assert the flip), then
// returns the same callable.
const followCalls: unknown[] = [];
const unfollowCalls: unknown[] = [];
let followDeferred: Deferred<unknown> | null = null;
let unfollowDeferred: Deferred<unknown> | null = null;

const mockFollow = jest.fn((args: unknown) => {
  followCalls.push(args);
  followDeferred = deferred<unknown>();
  return followDeferred.promise;
}) as any;
const mockUnfollow = jest.fn((args: unknown) => {
  unfollowCalls.push(args);
  unfollowDeferred = deferred<unknown>();
  return unfollowDeferred.promise;
}) as any;

jest.mock("expo-image", () => ({
  Image: "Image",
}));

jest.mock("expo-router", () => {
  const passthrough = ({ children }: { children?: unknown }) => children ?? null;
  return {
    Link: passthrough,
    router: { push: jest.fn(), replace: jest.fn() },
  };
});

jest.mock("../../lib/plotlist/react", () => ({
  useMutation: (ref: { __name?: string }) => {
    const name = String(ref?.__name ?? "");
    return name.includes("unfollow") ? mockUnfollow : mockFollow;
  },
}));

import { UserRow } from "../../components/UserRow";
import { createDirectCacheStore } from "../../lib/optimisticCache";
import { queryClient } from "../../lib/queryClient";

const suggestedKey = ["plotlist-rpc", "query", "users:suggested", { limit: 8 }] as const;

function seedSuggested() {
  queryClient.setQueryData(suggestedKey as any, [
    { user: { _id: "user_a" }, isFollowing: false, followsYou: true, isMutualFollow: false },
    { user: { _id: "user_b" }, isFollowing: false, followsYou: false, isMutualFollow: false },
  ]);
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("UserRow follow button", () => {
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

  // Seeded queries schedule gc timers on the app's real query client; clear
  // them so jest can exit.
  afterAll(() => {
    queryClient.clear();
  });

  beforeEach(() => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
    queryClient.clear();
    followCalls.length = 0;
    unfollowCalls.length = 0;
    followDeferred = null;
    unfollowDeferred = null;
    warnSpy.mockClear();
    const store = createDirectCacheStore(queryClient);
    for (const mutation of [mockFollow, mockUnfollow]) {
      mutation.withOptimisticUpdate = (handler: (store: unknown, args: unknown) => void) => {
        const wrapped = (args: unknown) => {
          handler(store, args);
          return mutation(args);
        };
        wrapped.withOptimisticUpdate = mutation.withOptimisticUpdate;
        return wrapped;
      };
    }
  });

  it("flips to Following on the tap on native, before the server answers", async () => {
    render(<UserRow userId="user_a" displayName="Ada" followsYou />);

    expect(screen.getByText("Follow back")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Follow"));

    // Instant local state; the request is still in flight.
    expect(screen.getByText("Following")).toBeTruthy();
    expect(followCalls).toEqual([{ userIdToFollow: "user_a" }]);
    expect(followDeferred).not.toBeNull();

    // Still tappable while pending: the button is not greyed out or disabled.
    expect(screen.getByLabelText("Unfollow").props.accessibilityState?.disabled).toBeFalsy();

    await act(async () => {
      followDeferred!.resolve({ status: "following" });
    });
    await flush();
    expect(screen.getByText("Following")).toBeTruthy();
  });

  it("rolls back to the previous state when the follow fails", async () => {
    render(<UserRow userId="user_a" displayName="Ada" followsYou />);
    fireEvent.press(screen.getByLabelText("Follow"));
    expect(screen.getByText("Following")).toBeTruthy();

    await act(async () => {
      followDeferred!.reject(new Error("offline"));
    });
    await flush();

    expect(screen.getByText("Follow back")).toBeTruthy();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("does not let a stale prop refresh clobber an in-flight optimistic state", async () => {
    const { rerender } = render(<UserRow userId="user_a" displayName="Ada" isFollowing={false} />);
    fireEvent.press(screen.getByLabelText("Follow"));
    expect(screen.getByText("Following")).toBeTruthy();

    // A refetched list still says "not following" while the request is out.
    rerender(<UserRow userId="user_a" displayName="Ada" subtitle="refetched" isFollowing={false} />);
    expect(screen.getByText("Following")).toBeTruthy();

    await act(async () => {
      followDeferred!.resolve({ status: "following" });
    });
    await flush();
    expect(screen.getByText("Following")).toBeTruthy();

    // Once settled, a genuinely new server value wins again.
    rerender(<UserRow userId="user_a" displayName="Ada" isFollowing={true} />);
    expect(screen.getByText("Following")).toBeTruthy();
    rerender(<UserRow userId="user_a" displayName="Ada" isFollowing={false} />);
    expect(screen.getByText("Follow")).toBeTruthy();
  });

  it("turns a private-account follow into Requested and withdraws it on the next tap", async () => {
    render(<UserRow userId="user_b" displayName="Bea" />);
    fireEvent.press(screen.getByLabelText("Follow"));
    expect(screen.getByText("Following")).toBeTruthy();

    await act(async () => {
      followDeferred!.resolve({ status: "requested" });
    });
    await flush();
    expect(screen.getByText("Requested")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Withdraw follow request"));
    expect(screen.getByText("Follow")).toBeTruthy();
    expect(unfollowCalls).toEqual([{ userIdToUnfollow: "user_b" }]);
  });

  it("patches every cached list holding the person and pins the list order first", async () => {
    seedSuggested();
    const onFollowPress = jest.fn();
    render(<UserRow userId="user_a" displayName="Ada" onFollowPress={onFollowPress} />);

    fireEvent.press(screen.getByLabelText("Follow"));

    expect(onFollowPress).toHaveBeenCalledTimes(1);
    const suggested = queryClient.getQueryData(suggestedKey as any) as any[];
    expect(suggested[0]).toMatchObject({ isFollowing: true, isMutualFollow: true });
    expect(suggested[1]).toMatchObject({ isFollowing: false });

    // The server downgrades to a pending request: the cache must not keep
    // claiming a follow edge that does not exist.
    await act(async () => {
      followDeferred!.resolve({ status: "requested" });
    });
    await flush();
    const afterSettle = queryClient.getQueryData(suggestedKey as any) as any[];
    expect(afterSettle[0]).toMatchObject({ isFollowing: false, isMutualFollow: false });
  });
});

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";

const mockUseFocusEffect = jest.fn<(callback: () => void) => void>();

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) => mockUseFocusEffect(callback),
}));

import { api } from "../lib/plotlist/api";
import { queryClient } from "../lib/queryClient";
import { refetchWhenStale, useRefetchWhenStale } from "../lib/useRefetchWhenStale";

const UNREAD_KEY = ["plotlist-rpc", "query", "notifications:getUnreadCount", {}] as const;
const FEED_PAGE_KEY = [
  "plotlist-rpc",
  "paginated",
  "feed:listForUser",
  { paginationOpts: { cursor: null, numItems: 40 } },
] as const;

type AppStateHandler = (state: string) => void;

describe("refetchWhenStale", () => {
  let invalidateSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    queryClient.clear();
    invalidateSpy = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockImplementation(async () => undefined);
  });

  afterEach(() => {
    invalidateSpy.mockRestore();
    queryClient.clear();
  });

  it("refetches a plain query only once its cached data is older than maxAgeMs", () => {
    const now = Date.now();
    queryClient.setQueryData(UNREAD_KEY, 2, { updatedAt: now - 10_000 });

    expect(
      refetchWhenStale(api.notifications.getUnreadCount, {}, { maxAgeMs: 60_000 }, now),
    ).toBe(false);
    expect(invalidateSpy).not.toHaveBeenCalled();

    queryClient.setQueryData(UNREAD_KEY, 2, { updatedAt: now - 90_000 });
    expect(
      refetchWhenStale(api.notifications.getUnreadCount, {}, { maxAgeMs: 60_000 }, now),
    ).toBe(true);
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: UNREAD_KEY,
      exact: true,
      refetchType: "active",
    });
  });

  it("leaves never-fetched, skipped, and in-flight queries alone", async () => {
    const now = Date.now();
    expect(
      refetchWhenStale(api.notifications.getUnreadCount, {}, { maxAgeMs: 60_000 }, now),
    ).toBe(false);
    queryClient.setQueryData(UNREAD_KEY, 2, { updatedAt: now - 90_000 });
    expect(
      refetchWhenStale(api.notifications.getUnreadCount, "skip", { maxAgeMs: 60_000 }, now),
    ).toBe(false);

    // Stale data with a fetch already running: the mounted hook is loading
    // it, so a second invalidation would only cancel and restart that fetch.
    const pending = queryClient.fetchQuery({
      queryKey: UNREAD_KEY,
      queryFn: () => new Promise<number>(() => undefined),
      staleTime: 0,
    });
    expect(queryClient.getQueryState(UNREAD_KEY)?.fetchStatus).toBe("fetching");
    expect(
      refetchWhenStale(api.notifications.getUnreadCount, {}, { maxAgeMs: 60_000 }, now),
    ).toBe(false);
    expect(invalidateSpy).not.toHaveBeenCalled();
    await queryClient.cancelQueries({ queryKey: UNREAD_KEY });
    await pending.catch(() => undefined);
  });

  it("matches every page of a paginated query by name and args", () => {
    const now = Date.now();
    queryClient.setQueryData(FEED_PAGE_KEY, { results: [], continueCursor: null, isDone: true }, {
      updatedAt: now - 90_000,
    });

    expect(
      refetchWhenStale(api.feed.listForUser, {}, { maxAgeMs: 60_000, paginated: true }, now),
    ).toBe(true);
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    const call = invalidateSpy.mock.calls[0]?.[0] as {
      predicate: (query: { queryKey: readonly unknown[] }) => boolean;
      refetchType: string;
    };
    expect(call.refetchType).toBe("active");
    expect(call.predicate({ queryKey: FEED_PAGE_KEY })).toBe(true);
    expect(
      call.predicate({
        queryKey: [
          "plotlist-rpc",
          "paginated",
          "feed:listForUser",
          { paginationOpts: { cursor: "abc", numItems: 40 } },
        ],
      }),
    ).toBe(true);
    expect(
      call.predicate({
        queryKey: ["plotlist-rpc", "paginated", "notifications:list", { paginationOpts: {} }],
      }),
    ).toBe(false);
    expect(call.predicate({ queryKey: ["plotlist-rpc", "query", "feed:listForUser", {}] })).toBe(
      false,
    );
  });

  it("uses the freshest page to decide whether a paginated query is stale", () => {
    const now = Date.now();
    queryClient.setQueryData(FEED_PAGE_KEY, { results: [], continueCursor: "next", isDone: false }, {
      updatedAt: now - 90_000,
    });
    queryClient.setQueryData(
      [
        "plotlist-rpc",
        "paginated",
        "feed:listForUser",
        { paginationOpts: { cursor: "next", numItems: 40 } },
      ],
      { results: [], continueCursor: null, isDone: true },
      { updatedAt: now - 5_000 },
    );

    expect(
      refetchWhenStale(api.feed.listForUser, {}, { maxAgeMs: 60_000, paginated: true }, now),
    ).toBe(false);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe("useRefetchWhenStale", () => {
  let invalidateSpy: ReturnType<typeof jest.spyOn>;
  let appStateHandlers: AppStateHandler[];
  let removeListener: jest.Mock;
  let addListenerSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    queryClient.clear();
    appStateHandlers = [];
    removeListener = jest.fn();
    invalidateSpy = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockImplementation(async () => undefined);
    addListenerSpy = jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation(((_type: string, handler: AppStateHandler) => {
        appStateHandlers.push(handler);
        return { remove: removeListener };
      }) as any);
  });

  afterEach(() => {
    invalidateSpy.mockRestore();
    addListenerSpy.mockRestore();
    queryClient.clear();
  });

  it("checks on screen focus and on app foreground, with one stable callback", () => {
    queryClient.setQueryData(UNREAD_KEY, 4, { updatedAt: Date.now() - 90_000 });

    const { rerender, unmount } = renderHook(
      ({ maxAgeMs }: { maxAgeMs: number }) =>
        useRefetchWhenStale(api.notifications.getUnreadCount, {}, { maxAgeMs }),
      { initialProps: { maxAgeMs: 60_000 } },
    );

    expect(mockUseFocusEffect).toHaveBeenCalledTimes(1);
    const focusCallback = mockUseFocusEffect.mock.calls[0]?.[0];
    expect(typeof focusCallback).toBe("function");
    expect(appStateHandlers).toHaveLength(1);

    act(() => {
      focusCallback?.();
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);

    // Fresh again after the refetch lands: foregrounding is a no-op.
    queryClient.setQueryData(UNREAD_KEY, 4, { updatedAt: Date.now() });
    act(() => {
      appStateHandlers[0]?.("active");
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);

    // Backgrounding never triggers a refetch, even with stale data.
    queryClient.setQueryData(UNREAD_KEY, 4, { updatedAt: Date.now() - 90_000 });
    act(() => {
      appStateHandlers[0]?.("background");
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    act(() => {
      appStateHandlers[0]?.("active");
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(2);

    // Re-rendering with new option objects keeps the same subscriptions and
    // reads the latest options through the ref.
    rerender({ maxAgeMs: 10 * 60_000 });
    expect(mockUseFocusEffect.mock.calls.every(([callback]) => callback === focusCallback)).toBe(
      true,
    );
    expect(appStateHandlers).toHaveLength(1);
    act(() => {
      appStateHandlers[0]?.("active");
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(2);

    unmount();
    expect(removeListener).toHaveBeenCalledTimes(1);
  });

  it("does nothing while the query is skipped", () => {
    queryClient.setQueryData(UNREAD_KEY, 4, { updatedAt: Date.now() - 90_000 });
    renderHook(() =>
      useRefetchWhenStale(api.notifications.getUnreadCount, "skip", { maxAgeMs: 60_000 }),
    );
    act(() => {
      mockUseFocusEffect.mock.calls[0]?.[0]?.();
      appStateHandlers[0]?.("active");
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

import { afterAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, renderHook, waitFor } from "@testing-library/react-native";

const mockCallQuery = jest.fn<(fn: unknown, args?: any) => Promise<any>>();
const mockCallMutation = jest.fn<(fn: unknown, args?: any) => Promise<any>>();

jest.mock("../lib/plotlist/rpc", () => ({
  callQuery: (fn: unknown, args?: any) => mockCallQuery(fn, args),
  callMutation: (fn: unknown, args?: any) => mockCallMutation(fn, args),
  callAction: jest.fn(),
}));
jest.mock("../lib/plotlist/auth", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

import { queryClient } from "../lib/queryClient";
import { useMutation, usePaginatedQuery, useQueryState } from "../lib/plotlist/react";

// The real client keeps 30-minute gc timers per cache entry; drop them so
// jest can exit.
afterAll(() => {
  queryClient.clear();
});

const listQuery = { __name: "lists:listForUser" } as any;
const markMutation = { __name: "lists:update" } as any;

type Row = { _id: string; title: string; liked?: boolean };

// Two-page fixture keyed by cursor, the same offset-cursor shape the worker
// returns (`continueCursor` is the next offset as a string).
function pageFor(cursor: string | null, rows: Row[], pageSize: number) {
  const offset = Number(cursor ?? 0) || 0;
  const page = rows.slice(offset, offset + pageSize);
  const next = offset + page.length;
  return {
    page,
    results: page,
    continueCursor: String(next),
    isDone: next >= rows.length,
  };
}

function serveRows(rows: Row[]) {
  mockCallQuery.mockImplementation(async (_fn, args) =>
    pageFor(args?.paginationOpts?.cursor ?? null, rows, args?.paginationOpts?.numItems ?? 20),
  );
}

const ROWS: Row[] = [
  { _id: "a", title: "A" },
  { _id: "b", title: "B" },
  { _id: "c", title: "C" },
  { _id: "d", title: "D" },
];

function cursorsRequested() {
  return mockCallQuery.mock.calls.map(([, args]) => args?.paginationOpts?.cursor ?? null);
}

describe("usePaginatedQuery", () => {
  beforeEach(() => {
    queryClient.clear();
    mockCallQuery.mockReset();
    mockCallMutation.mockReset();
  });

  it("reports LoadingFirstPage with a stable empty page until the first page lands", async () => {
    serveRows(ROWS);
    const { result, rerender } = renderHook(() =>
      usePaginatedQuery(listQuery, { userId: "u1" }, { initialNumItems: 2 }),
    );
    expect(result.current.status).toBe("LoadingFirstPage");
    const emptyBefore = result.current.results;
    expect(emptyBefore).toEqual([]);
    rerender({});
    expect(result.current.results).toBe(emptyBefore);

    await waitFor(() => expect(result.current.status).toBe("CanLoadMore"));
    expect(result.current.results.map((row: Row) => row._id)).toEqual(["a", "b"]);
    expect(mockCallQuery).toHaveBeenCalledWith(listQuery, {
      userId: "u1",
      paginationOpts: { cursor: null, numItems: 2 },
    });
  });

  it("keeps skipped queries on the stable empty page without fetching", () => {
    const { result, rerender } = renderHook(() =>
      usePaginatedQuery(listQuery, "skip", { initialNumItems: 2 }),
    );
    const first = result.current.results;
    rerender({});
    expect(result.current.results).toBe(first);
    expect(result.current.results).toEqual([]);
    expect(result.current.status).toBe("CanLoadMore");
    expect(mockCallQuery).not.toHaveBeenCalled();
  });

  it("appends pages on loadMore, reports LoadingMore in between, and Exhausted at the end", async () => {
    serveRows(ROWS);
    const { result } = renderHook(() =>
      usePaginatedQuery(listQuery, { userId: "u1" }, { initialNumItems: 2 }),
    );
    await waitFor(() => expect(result.current.status).toBe("CanLoadMore"));

    act(() => result.current.loadMore(2));
    expect(result.current.status).toBe("LoadingMore");
    // Earlier rows stay on screen while the next page loads.
    expect(result.current.results.map((row: Row) => row._id)).toEqual(["a", "b"]);

    await waitFor(() => expect(result.current.status).toBe("Exhausted"));
    expect(result.current.results.map((row: Row) => row._id)).toEqual(["a", "b", "c", "d"]);
    expect(cursorsRequested()).toEqual([null, "2"]);

    // Exhausted: loadMore is a no-op.
    act(() => result.current.loadMore(2));
    expect(cursorsRequested()).toEqual([null, "2"]);
  });

  it("ignores loadMore while a page is still loading", async () => {
    serveRows([...ROWS, { _id: "e", title: "E" }, { _id: "f", title: "F" }]);
    const { result } = renderHook(() =>
      usePaginatedQuery(listQuery, { userId: "u1" }, { initialNumItems: 2 }),
    );
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.status).toBe("CanLoadMore"));
    act(() => {
      result.current.loadMore();
      result.current.loadMore();
    });
    await waitFor(() => expect(result.current.status).toBe("CanLoadMore"));
    expect(cursorsRequested()).toEqual([null, "2"]);
    expect(result.current.results).toHaveLength(4);
  });

  it("keeps results identity across re-renders when no page changed", async () => {
    serveRows(ROWS);
    const { result, rerender } = renderHook(() =>
      usePaginatedQuery(listQuery, { userId: "u1" }, { initialNumItems: 2 }),
    );
    await waitFor(() => expect(result.current.status).toBe("CanLoadMore"));
    const loaded = result.current.results;
    rerender({});
    rerender({});
    expect(result.current.results).toBe(loaded);
  });

  it("restarts from the first page when the args change", async () => {
    serveRows(ROWS);
    const { result, rerender } = renderHook(
      ({ userId }: { userId: string }) =>
        usePaginatedQuery(listQuery, { userId }, { initialNumItems: 2 }),
      { initialProps: { userId: "u1" } },
    );
    await waitFor(() => expect(result.current.status).toBe("CanLoadMore"));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.results).toHaveLength(4));

    const otherRows: Row[] = [{ _id: "x", title: "X" }];
    serveRows(otherRows);
    rerender({ userId: "u2" });
    expect(result.current.status).toBe("LoadingFirstPage");
    await waitFor(() => expect(result.current.status).toBe("Exhausted"));
    expect(result.current.results.map((row: Row) => row._id)).toEqual(["x"]);
    const lastCall = mockCallQuery.mock.calls[mockCallQuery.mock.calls.length - 1]?.[1];
    expect(lastCall).toEqual({ userId: "u2", paginationOpts: { cursor: null, numItems: 2 } });
  });

  it("dedupes a row that appears on two pages after an offset shift", async () => {
    mockCallQuery.mockImplementation(async (_fn, args) => {
      const cursor = args?.paginationOpts?.cursor ?? null;
      return cursor === null
        ? { results: [ROWS[0], ROWS[1]], continueCursor: "2", isDone: false }
        : { results: [ROWS[1], ROWS[2]], continueCursor: "4", isDone: true };
    });
    const { result } = renderHook(() =>
      usePaginatedQuery(listQuery, { userId: "u1" }, { initialNumItems: 2 }),
    );
    await waitFor(() => expect(result.current.status).toBe("CanLoadMore"));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.status).toBe("Exhausted"));
    expect(result.current.results.map((row: Row) => row._id)).toEqual(["a", "b", "c"]);
  });

  describe("with optimistic mutations", () => {
    function useHarness() {
      const paginated = usePaginatedQuery(listQuery, { userId: "u1" }, { initialNumItems: 2 });
      const likeAll = useMutation(markMutation).withOptimisticUpdate((localStore) => {
        localStore.setPaginatedQuery(listQuery, { userId: "u1" }, (current) => {
          if (!current) return current;
          const rows = ((current.results ?? current.page ?? []) as Row[]).map((row) => ({
            ...row,
            liked: true,
          }));
          return { ...current, results: rows, page: rows };
        });
      });
      const prepend = useMutation(markMutation).withOptimisticUpdate((localStore) => {
        localStore.setPaginatedQuery(listQuery, { userId: "u1" }, (current) => {
          if (!current) return current;
          const rows = [
            { _id: "optimistic:new", title: "New" },
            ...((current.results ?? current.page ?? []) as Row[]),
          ];
          return { ...current, results: rows, page: rows };
        });
      });
      return { paginated, likeAll, prepend };
    }

    async function loadTwoPages() {
      serveRows(ROWS);
      const hook = renderHook(useHarness);
      await waitFor(() => expect(hook.result.current.paginated.status).toBe("CanLoadMore"));
      act(() => hook.result.current.paginated.loadMore());
      await waitFor(() => expect(hook.result.current.paginated.results).toHaveLength(4));
      return hook;
    }

    it("applies setPaginatedQuery patches to every loaded page, not just the last", async () => {
      const { result } = await loadTwoPages();
      let resolveMutation: (value: unknown) => void = () => undefined;
      mockCallMutation.mockImplementation(
        () => new Promise((resolve) => { resolveMutation = resolve; }),
      );

      let pending: Promise<unknown> | undefined;
      act(() => {
        pending = result.current.likeAll({});
      });
      // The wrapper cancels in-flight domain queries before running the
      // optimistic handler, so the patch lands a tick later — while the
      // mutation itself is still pending.
      await waitFor(() =>
        expect(result.current.paginated.results.map((row: Row) => row.liked)).toEqual([
          true,
          true,
          true,
          true,
        ]),
      );
      expect(mockCallMutation).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveMutation({ ok: true });
        await pending;
      });
    });

    it("shows an optimistic prepend once even though every cached page was patched", async () => {
      const { result } = await loadTwoPages();
      let resolveMutation: (value: unknown) => void = () => undefined;
      mockCallMutation.mockImplementation(
        () => new Promise((resolve) => { resolveMutation = resolve; }),
      );
      let pending: Promise<unknown> | undefined;
      act(() => {
        pending = result.current.prepend({});
      });
      await waitFor(() =>
        expect(result.current.paginated.results.map((row: Row) => row._id)).toEqual([
          "optimistic:new",
          "a",
          "b",
          "c",
          "d",
        ]),
      );
      await act(async () => {
        resolveMutation({ ok: true });
        await pending;
      });
    });

    it("rolls every page back when the mutation fails", async () => {
      const { result } = await loadTwoPages();
      const failure = Object.assign(new Error("nope"), { status: 400 });
      mockCallMutation.mockRejectedValue(failure);
      await act(async () => {
        await expect(result.current.likeAll({})).rejects.toBe(failure);
      });
      expect(result.current.paginated.results.map((row: Row) => row.liked)).toEqual([
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
    });

    it("refetches every loaded page after the mutation settles", async () => {
      const { result } = await loadTwoPages();
      expect(cursorsRequested()).toEqual([null, "2"]);
      const renamed = ROWS.map((row) => ({ ...row, title: `${row.title}!` }));
      serveRows(renamed);
      mockCallMutation.mockResolvedValue({ ok: true });
      await act(async () => {
        await result.current.likeAll({});
      });
      await waitFor(() =>
        expect(result.current.paginated.results.map((row: Row) => row.title)).toEqual([
          "A!",
          "B!",
          "C!",
          "D!",
        ]),
      );
      expect(cursorsRequested()).toEqual([null, "2", null, "2"]);
    });
  });
});

describe("useQueryState keepPreviousData", () => {
  const activityQuery = { __name: "watchLogs:listActivityForUser" } as any;

  beforeEach(() => {
    queryClient.clear();
    mockCallQuery.mockReset();
  });

  it("keeps the previous limit's data on screen while a larger limit loads", async () => {
    let release: (value: unknown) => void = () => undefined;
    mockCallQuery.mockImplementation(async (_fn, args) => {
      if (args.limit === 60) {
        return { items: [{ id: "1" }], hasMore: true };
      }
      return await new Promise((resolve) => {
        release = resolve;
      });
    });
    const { result, rerender } = renderHook(
      ({ limit }: { limit: number }) =>
        useQueryState(activityQuery, { userId: "u1", limit }, { keepPreviousData: true }),
      { initialProps: { limit: 60 } },
    );
    await waitFor(() => expect(result.current.data?.items).toHaveLength(1));

    rerender({ limit: 100 });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(true);
    expect(result.current.data?.items).toHaveLength(1);

    await act(async () => {
      release({ items: [{ id: "1" }, { id: "2" }], hasMore: false });
    });
    await waitFor(() => expect(result.current.data?.items).toHaveLength(2));
    expect(result.current.isFetching).toBe(false);
  });

  it("still blanks between args without the opt-in", async () => {
    mockCallQuery.mockImplementation(async (_fn, args) => ({ items: [], limit: args.limit }));
    const { result, rerender } = renderHook(
      ({ limit }: { limit: number }) => useQueryState(activityQuery, { userId: "u1", limit }),
      { initialProps: { limit: 60 } },
    );
    await waitFor(() => expect(result.current.data?.limit).toBe(60));
    rerender({ limit: 100 });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });
});

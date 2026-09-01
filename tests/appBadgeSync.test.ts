import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockSetBadgeCountAsync = jest.fn<(count: number) => Promise<void>>();
const mockCallQuery = jest.fn<(...args: any[]) => Promise<unknown>>();

jest.mock("expo-notifications", () => ({
  setBadgeCountAsync: (count: number) => mockSetBadgeCountAsync(count),
  AndroidImportance: { DEFAULT: 3 },
}));

jest.mock("expo-device", () => ({ isDevice: true }));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} }, easConfig: {} },
}));

jest.mock("../lib/plotlist/rpc", () => ({
  callQuery: (...args: unknown[]) => mockCallQuery(...args),
  callMutation: jest.fn(),
}));

import { api } from "../lib/plotlist/api";
import { queryClient } from "../lib/queryClient";
import {
  fetchUnreadCountIntoCache,
  syncAppBadgeCount,
  UNREAD_COUNT_QUERY_KEY,
} from "../lib/pushToken";

// The inbox reads the same query with no args, which hashes to a second key.
const INBOX_UNREAD_KEY = ["plotlist-rpc", "query", "notifications:getUnreadCount", undefined];

describe("syncAppBadgeCount", () => {
  beforeEach(() => {
    queryClient.clear();
    mockSetBadgeCountAsync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("fetches the unread count through react-query so every mounted badge repaints", async () => {
    queryClient.setQueryData(UNREAD_COUNT_QUERY_KEY, 0, { updatedAt: Date.now() });
    queryClient.setQueryData(INBOX_UNREAD_KEY, 0, { updatedAt: Date.now() });
    mockCallQuery.mockResolvedValue(3);

    await syncAppBadgeCount();

    expect(mockCallQuery).toHaveBeenCalledTimes(1);
    expect(mockCallQuery).toHaveBeenCalledWith(
      api.notifications.getUnreadCount,
      {},
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(mockSetBadgeCountAsync).toHaveBeenCalledWith(3);
    expect(queryClient.getQueryData(UNREAD_COUNT_QUERY_KEY)).toBe(3);
    expect(queryClient.getQueryData(INBOX_UNREAD_KEY)).toBe(3);
  });

  it("ignores a fresh cache entry and always asks the server", async () => {
    queryClient.setQueryData(UNREAD_COUNT_QUERY_KEY, 7, { updatedAt: Date.now() });
    mockCallQuery.mockResolvedValue(0);

    await expect(fetchUnreadCountIntoCache()).resolves.toBe(0);
    expect(mockCallQuery).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(UNREAD_COUNT_QUERY_KEY)).toBe(0);
  });

  it("coerces a malformed payload to zero and never throws", async () => {
    mockCallQuery.mockResolvedValueOnce("not-a-number");
    await syncAppBadgeCount();
    expect(mockSetBadgeCountAsync).toHaveBeenCalledWith(0);

    mockSetBadgeCountAsync.mockClear();
    mockCallQuery.mockRejectedValue(new Error("offline"));
    await expect(syncAppBadgeCount()).resolves.toBeUndefined();
    expect(mockSetBadgeCountAsync).not.toHaveBeenCalled();
    // No retry: the next foreground runs the sync again anyway.
    expect(mockCallQuery).toHaveBeenCalledTimes(2);
  });
});

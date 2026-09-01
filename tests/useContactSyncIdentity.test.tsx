import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, renderHook, waitFor } from "@testing-library/react-native";

const mockSyncSnapshot = jest.fn<(args: unknown) => Promise<unknown>>();
const mockSendInvite = jest.fn<(args: unknown) => Promise<unknown>>();

jest.mock("../lib/plotlist/react", () => ({
  useAction: () => mockSyncSnapshot,
  useMutation: () => mockSendInvite,
}));

jest.mock("../lib/deviceContacts", () => ({
  getContactsPermissionState: jest.fn(async () => "granted"),
  loadDeviceContacts: jest.fn(async () => []),
}));

jest.mock("../lib/preferences", () => ({
  setContactsAutoSyncedAt: jest.fn(async () => undefined),
  setContactsSyncDismissed: jest.fn(async () => undefined),
}));

jest.mock("../lib/contactSync", () => ({
  runContactAutoSync: jest.fn(async () => null),
  getContactSyncAlertCopy: () => ({ title: "Synced", message: "" }),
}));

jest.mock("../lib/dialogs", () => ({
  notify: jest.fn(),
  notifyError: jest.fn(),
}));

import { queryClient } from "../lib/queryClient";
import { useContactSync } from "../lib/useContactSync";

describe("useContactSync syncNow identity", () => {
  let invalidateSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    invalidateSpy = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockImplementation(async () => undefined);
  });

  afterEach(() => {
    invalidateSpy.mockRestore();
  });

  it("keeps one syncNow across a sync and still rejects re-entry while running", async () => {
    let resolveSync: (value: unknown) => void = () => undefined;
    mockSyncSnapshot.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSync = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useContactSync({ enabled: false, hasSyncedBefore: false }),
    );
    const syncNow = result.current.syncNow;
    expect(result.current.isSyncing).toBe(false);

    let firstRun: Promise<unknown> = Promise.resolve(null);
    act(() => {
      firstRun = syncNow({ silent: true });
    });
    await waitFor(() => expect(result.current.isSyncing).toBe(true));
    // Depending on `isSyncing` state used to hand out a new function here.
    expect(result.current.syncNow).toBe(syncNow);

    // A second tap during the run is ignored without a second snapshot call.
    await expect(result.current.syncNow({ silent: true })).resolves.toBeNull();
    await waitFor(() => expect(mockSyncSnapshot).toHaveBeenCalledTimes(1));

    await act(async () => {
      resolveSync({ matched: 0, invited: 0 });
      await expect(firstRun).resolves.toEqual({ matched: 0, invited: 0 });
    });
    expect(result.current.isSyncing).toBe(false);
    expect(result.current.syncNow).toBe(syncNow);
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });
});

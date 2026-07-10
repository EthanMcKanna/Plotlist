import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import {
  CONTACT_AUTO_SYNC_INTERVAL_MS,
  getContactSyncAlertCopy,
  getInviteReadyCount,
  shouldAutoSyncContacts,
} from "../lib/contactSync";

describe("contact sync helpers", () => {
  it("treats a zero-entry sync as a no-op with actionable copy", () => {
    expect(
      getContactSyncAlertCopy({
        totalCount: 0,
        matchedCount: 0,
      }),
    ).toEqual({
      title: "No contacts to sync",
      message:
        "We couldn't find any phone numbers in your address book. Add a contact with a phone number and try again.",
    });
  });

  it("pluralizes matched-people copy correctly", () => {
    expect(
      getContactSyncAlertCopy({ totalCount: 10, matchedCount: 1 }).message,
    ).toBe("We found 1 person already on Plotlist.");
    expect(
      getContactSyncAlertCopy({ totalCount: 10, matchedCount: 3 }).message,
    ).toBe("We found 3 people already on Plotlist.");
  });

  it("falls back to the legacy invitedCount field for invite-ready totals", () => {
    expect(
      getInviteReadyCount({
        totalCount: 5,
        matchedCount: 2,
        invitedCount: 3,
      }),
    ).toBe(3);
  });

  it("prefers the explicit inviteCount field when it is present", () => {
    expect(
      getInviteReadyCount({
        totalCount: 5,
        matchedCount: 2,
        inviteCount: 2,
        invitedCount: 99,
      }),
    ).toBe(2);
  });
});

describe("shouldAutoSyncContacts", () => {
  const NOW = 1_750_000_000_000;

  it("syncs when there is no previous background attempt", () => {
    expect(shouldAutoSyncContacts(null, NOW)).toBe(true);
    expect(shouldAutoSyncContacts(undefined, NOW)).toBe(true);
  });

  it("throttles to the daily interval", () => {
    expect(shouldAutoSyncContacts(NOW - CONTACT_AUTO_SYNC_INTERVAL_MS + 1, NOW)).toBe(false);
    expect(shouldAutoSyncContacts(NOW - CONTACT_AUTO_SYNC_INTERVAL_MS, NOW)).toBe(true);
  });
});

describe("runContactAutoSync", () => {
  const mockDeviceContacts = {
    getContactsPermissionState: jest.fn<() => Promise<string>>(),
    loadDeviceContacts: jest.fn<() => Promise<any[]>>(),
  };
  const mockPreferences = {
    getContactsAutoSyncedAt: jest.fn<() => Promise<number | null>>(),
    setContactsAutoSyncedAt: jest.fn<() => Promise<void>>(),
  };

  function load() {
    jest.doMock("../lib/deviceContacts", () => mockDeviceContacts);
    jest.doMock("../lib/preferences", () => mockPreferences);
    return require("../lib/contactSync") as typeof import("../lib/contactSync");
  }

  beforeEach(() => {
    jest.resetModules();
    mockDeviceContacts.getContactsPermissionState.mockReset();
    mockDeviceContacts.loadDeviceContacts.mockReset();
    mockPreferences.getContactsAutoSyncedAt.mockReset();
    mockPreferences.setContactsAutoSyncedAt.mockReset();
  });

  it("does nothing before the user's first explicit sync", async () => {
    const { runContactAutoSync } = load();
    const syncSnapshot = jest.fn<() => Promise<any>>();

    await expect(
      runContactAutoSync({ hasSyncedBefore: false, syncSnapshot }),
    ).resolves.toBeNull();
    expect(mockDeviceContacts.getContactsPermissionState).not.toHaveBeenCalled();
    expect(syncSnapshot).not.toHaveBeenCalled();
  });

  it("never prompts: skips silently when permission is not granted", async () => {
    mockDeviceContacts.getContactsPermissionState.mockResolvedValue("denied");
    const { runContactAutoSync } = load();
    const syncSnapshot = jest.fn<() => Promise<any>>();

    await expect(
      runContactAutoSync({ hasSyncedBefore: true, syncSnapshot }),
    ).resolves.toBeNull();
    expect(mockDeviceContacts.loadDeviceContacts).not.toHaveBeenCalled();
    expect(syncSnapshot).not.toHaveBeenCalled();
  });

  it("respects the daily throttle", async () => {
    const now = 1_750_000_000_000;
    mockDeviceContacts.getContactsPermissionState.mockResolvedValue("granted");
    mockPreferences.getContactsAutoSyncedAt.mockResolvedValue(now - 60_000);
    const { runContactAutoSync } = load();
    const syncSnapshot = jest.fn<() => Promise<any>>();

    await expect(
      runContactAutoSync({ hasSyncedBefore: true, syncSnapshot, now }),
    ).resolves.toBeNull();
    expect(syncSnapshot).not.toHaveBeenCalled();
    expect(mockPreferences.setContactsAutoSyncedAt).not.toHaveBeenCalled();
  });

  it("syncs silently when granted and due, stamping the attempt first", async () => {
    const now = 1_750_000_000_000;
    const entries = [{ sourceRecordId: "1:0", displayName: "Ada", phone: "312 555 0182" }];
    const result = { totalCount: 1, matchedCount: 1 };
    mockDeviceContacts.getContactsPermissionState.mockResolvedValue("granted");
    mockDeviceContacts.loadDeviceContacts.mockResolvedValue(entries);
    mockPreferences.getContactsAutoSyncedAt.mockResolvedValue(null);
    const { runContactAutoSync } = load();
    const syncSnapshot = jest.fn<(args: any) => Promise<any>>().mockResolvedValue(result);

    await expect(
      runContactAutoSync({ hasSyncedBefore: true, syncSnapshot, now }),
    ).resolves.toEqual(result);
    expect(mockPreferences.setContactsAutoSyncedAt).toHaveBeenCalledWith(now);
    expect(mockDeviceContacts.loadDeviceContacts).toHaveBeenCalledWith({
      requestPermission: false,
    });
    expect(syncSnapshot).toHaveBeenCalledWith({ entries });
  });

  it("swallows sync failures so the next daily window retries instead", async () => {
    const now = 1_750_000_000_000;
    mockDeviceContacts.getContactsPermissionState.mockResolvedValue("granted");
    mockDeviceContacts.loadDeviceContacts.mockResolvedValue([]);
    mockPreferences.getContactsAutoSyncedAt.mockResolvedValue(null);
    const { runContactAutoSync } = load();
    const syncSnapshot = jest
      .fn<() => Promise<any>>()
      .mockRejectedValue(new Error("network down"));

    await expect(
      runContactAutoSync({ hasSyncedBefore: true, syncSnapshot, now }),
    ).resolves.toBeNull();
    // Attempt was stamped, so a failing endpoint can't retry-storm.
    expect(mockPreferences.setContactsAutoSyncedAt).toHaveBeenCalledWith(now);
  });

  it("coalesces concurrent callers into a single sync", async () => {
    const now = 1_750_000_000_000;
    mockDeviceContacts.getContactsPermissionState.mockResolvedValue("granted");
    mockDeviceContacts.loadDeviceContacts.mockResolvedValue([]);
    mockPreferences.getContactsAutoSyncedAt.mockResolvedValue(null);
    const { runContactAutoSync } = load();
    let resolveSync: (value: any) => void = () => {};
    const syncSnapshot = jest.fn<() => Promise<any>>().mockReturnValue(
      new Promise((resolve) => {
        resolveSync = resolve;
      }),
    );

    const first = runContactAutoSync({ hasSyncedBefore: true, syncSnapshot, now });
    const second = runContactAutoSync({ hasSyncedBefore: true, syncSnapshot, now });
    resolveSync({ totalCount: 0, matchedCount: 0 });

    await expect(first).resolves.toEqual({ totalCount: 0, matchedCount: 0 });
    await expect(second).resolves.toEqual({ totalCount: 0, matchedCount: 0 });
    expect(syncSnapshot).toHaveBeenCalledTimes(1);
  });
});

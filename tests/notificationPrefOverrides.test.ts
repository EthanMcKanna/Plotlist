import { describe, expect, it } from "@jest/globals";

import { reconcileNotificationOverrides } from "../lib/notificationPrefOverrides";

describe("reconcileNotificationOverrides", () => {
  it("drops overrides the server already reflects and keeps the rest", () => {
    const overrides = { episodes: false, likes: true };
    const next = reconcileNotificationOverrides(overrides, {
      episodes: false,
      likes: false,
      follows: true,
    });
    expect(next).toEqual({ likes: true });
    expect(next).not.toBe(overrides);
  });

  it("returns the same object when nothing changes so state setters no-op", () => {
    const overrides = { episodes: false };
    expect(reconcileNotificationOverrides(overrides, { episodes: true })).toBe(overrides);
    expect(reconcileNotificationOverrides(overrides, undefined)).toBe(overrides);
    expect(reconcileNotificationOverrides(overrides, null)).toBe(overrides);

    const empty = {};
    expect(reconcileNotificationOverrides(empty, { episodes: true })).toBe(empty);
  });

  it("lets a later server-side change show through once the override is cleared", () => {
    // Toggle off locally, server confirms, override cleared...
    const afterConfirm = reconcileNotificationOverrides({ episodes: false }, { episodes: false });
    expect(afterConfirm).toEqual({});
    // ...so when another device flips it back on, nothing shadows the value.
    const resolved = { episodes: true, ...afterConfirm };
    expect(resolved.episodes).toBe(true);
  });
});

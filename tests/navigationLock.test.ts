import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

import { acquireNavigationLock, resetNavigationLock } from "../lib/navigationLock";

describe("navigation lock", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetNavigationLock();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("lets the first tap through and swallows the double-tap", () => {
    expect(acquireNavigationLock()).toBe(true);
    expect(acquireNavigationLock()).toBe(false);
  });

  it("unlocks after the window elapses", () => {
    expect(acquireNavigationLock(700)).toBe(true);
    jest.setSystemTime(Date.now() + 699);
    expect(acquireNavigationLock(700)).toBe(false);
    jest.setSystemTime(Date.now() + 2);
    expect(acquireNavigationLock(700)).toBe(true);
  });
});

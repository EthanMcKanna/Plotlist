import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

describe("preferences storage", () => {
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
    warnSpy.mockClear();
  });

  afterAll(() => {
    warnSpy.mockRestore();
  });

  it("persists the contacts dismissal flag through SecureStore on iOS", async () => {
    const secureStore = {
      getItemAsync: jest.fn<
        (key: string) => Promise<string | null>
      >().mockResolvedValue(null),
      setItemAsync: jest.fn<
        (key: string, value: string) => Promise<void>
      >().mockResolvedValue(undefined),
      deleteItemAsync: jest.fn<
        (key: string) => Promise<void>
      >().mockResolvedValue(undefined),
    };

    jest.doMock("expo-secure-store", () => secureStore);

    const preferences = require("../lib/preferences") as typeof import("../lib/preferences");

    await expect(preferences.getContactsSyncDismissed()).resolves.toBe(false);
    await preferences.setContactsSyncDismissed(true);
    await preferences.setContactsSyncDismissed(false);

    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      "contactsSyncDismissed",
      "true"
    );
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith(
      "contactsSyncDismissed"
    );
  });

  it("falls back to in-memory storage when SecureStore is unavailable", async () => {
    jest.doMock("expo-secure-store", () => {
      throw new Error("SecureStore unavailable");
    });

    const preferences = require("../lib/preferences") as typeof import("../lib/preferences");

    await preferences.setContactsSyncDismissed(true);
    await expect(preferences.getContactsSyncDismissed()).resolves.toBe(true);

    await preferences.setContactsSyncDismissed(false);
    await expect(preferences.getContactsSyncDismissed()).resolves.toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });
});

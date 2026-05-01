import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

describe("authStorage", () => {
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
    warnSpy.mockClear();
    logSpy.mockClear();
  });

  afterAll(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("sanitizes keys before talking to SecureStore", async () => {
    const secureStore = {
      getItemAsync: jest.fn<
        (key: string, options: { keychainService: string }) => Promise<string | null>
      >().mockResolvedValue("value"),
      setItemAsync: jest.fn<
        (key: string, value: string, options: { keychainService: string }) => Promise<void>
      >().mockResolvedValue(undefined),
      deleteItemAsync: jest.fn<
        (key: string, options: { keychainService: string }) => Promise<void>
      >().mockResolvedValue(undefined),
    };

    jest.doMock("expo-secure-store", () => secureStore);

    const { authStorage } = require("../lib/authStorage") as typeof import("../lib/authStorage");

    await authStorage.setItem("token:key/unsafe", "value");
    await authStorage.getItem("token:key/unsafe");
    await authStorage.removeItem("token:key/unsafe");

    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      "token_key_unsafe",
      "value",
      { keychainService: "plotlist" }
    );
    expect(secureStore.getItemAsync).toHaveBeenCalledWith("token_key_unsafe", {
      keychainService: "plotlist",
    });
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith(
      "token_key_unsafe",
      { keychainService: "plotlist" }
    );
  });

  it("falls back to memory storage and clears known auth keys", async () => {
    jest.doMock("expo-secure-store", () => {
      throw new Error("SecureStore unavailable");
    });

    const { authStorage, clearAuthTokens } = require("../lib/authStorage") as typeof import("../lib/authStorage");

    await authStorage.setItem("__plotlistApiAccessToken", "jwt");
    await authStorage.setItem("__plotlistApiRefreshToken", "refresh");

    await expect(
      authStorage.getItem("__plotlistApiAccessToken")
    ).resolves.toBe("jwt");

    await clearAuthTokens();

    await expect(
      authStorage.getItem("__plotlistApiAccessToken")
    ).resolves.toBeNull();
    await expect(
      authStorage.getItem("__plotlistApiRefreshToken")
    ).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith("[Storage] Cleared all auth tokens");
  });
});

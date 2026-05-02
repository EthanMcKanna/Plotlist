import { afterEach, describe, expect, it } from "@jest/globals";

import { getApiBaseUrl } from "../lib/api/env";

const originalApiUrl = process.env.EXPO_PUBLIC_API_URL;
const originalDev = (globalThis as { __DEV__?: boolean }).__DEV__;
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");

function setGlobalWindow(value: unknown) {
  Object.defineProperty(globalThis, "window", {
    value,
    configurable: true,
  });
}

describe("getApiBaseUrl", () => {
  afterEach(() => {
    process.env.EXPO_PUBLIC_API_URL = originalApiUrl;
    Object.defineProperty(globalThis, "__DEV__", {
      value: originalDev,
      configurable: true,
    });

    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, "window", originalWindowDescriptor);
    } else {
      delete (globalThis as { window?: unknown }).window;
    }
  });

  it("uses the configured API URL", () => {
    process.env.EXPO_PUBLIC_API_URL = "https://plotlist.app/";

    expect(getApiBaseUrl()).toBe("https://plotlist.app");
  });

  it("does not read hostname when native window has no location", () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    Object.defineProperty(globalThis, "__DEV__", {
      value: true,
      configurable: true,
    });
    setGlobalWindow({});

    expect(getApiBaseUrl()).toBe("http://localhost:3001");
  });

  it("uses production API as the release fallback", () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    Object.defineProperty(globalThis, "__DEV__", {
      value: false,
      configurable: true,
    });
    setGlobalWindow({});

    expect(getApiBaseUrl()).toBe("https://plotlist.app");
  });
});

import { describe, expect, it, jest } from "@jest/globals";

const mockSignInAsync = jest.fn();
const mockCaptureMessage = jest.fn();

jest.mock("expo-apple-authentication", () => ({
  AppleAuthenticationButton: "AppleAuthenticationButton",
  AppleAuthenticationButtonStyle: { WHITE: 0 },
  AppleAuthenticationButtonType: { SIGN_IN: 0 },
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  isAvailableAsync: jest.fn(async () => true),
  signInAsync: (...args: unknown[]) => mockSignInAsync(...args),
}));

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: jest.fn(async () => "hashed-nonce"),
  randomUUID: jest.fn(() => "raw-nonce"),
}));

jest.mock("../lib/sentry", () => ({
  Sentry: {
    captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
  },
}));

import { signInWithApple } from "../lib/appleAuth";

describe("signInWithApple", () => {
  it.each(["ERR_REQUEST_CANCELED", "ERR_CANCELED"])(
    "records %s as an ambiguous handled cancellation",
    async (code) => {
      const error = Object.assign(new Error("The authorization was canceled"), {
        code,
      });
      mockSignInAsync.mockRejectedValueOnce(error as never);

      await expect(signInWithApple()).resolves.toBeNull();

      expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
      expect(mockCaptureMessage).toHaveBeenCalledWith(
        "Apple sign-in request did not complete",
        expect.objectContaining({
          level: "warning",
          fingerprint: ["apple-auth-native-cancellation"],
          tags: expect.objectContaining({
            auth_provider: "apple",
            auth_stage: "native_authorization",
            apple_auth_error_code: code,
            apple_auth_result: "ambiguous_cancellation",
          }),
          extra: expect.objectContaining({
            ios_version: expect.any(String),
            elapsed_ms: expect.any(Number),
            native_error_name: "Error",
            handled: true,
          }),
        }),
      );
    },
  );

  it("rethrows a non-cancellation failure without reporting it as the incident", async () => {
    const error = Object.assign(new Error("The authorization request failed"), {
      code: "ERR_REQUEST_FAILED",
    });
    mockSignInAsync.mockRejectedValueOnce(error as never);

    await expect(signInWithApple()).rejects.toBe(error);
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });
});

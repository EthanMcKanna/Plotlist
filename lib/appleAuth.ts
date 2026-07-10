import { Platform } from "react-native";
import type { ComponentType } from "react";
import * as Crypto from "expo-crypto";

import { Sentry } from "./sentry";

export type AppleSignInResult = {
  identityToken: string;
  rawNonce: string;
  fullName: {
    givenName: string | null;
    familyName: string | null;
  } | null;
};

type AppleAuthModule = typeof import("expo-apple-authentication");

// Same guard pattern as NativeGlass: the native module only ships on iOS, so
// lazy-require it behind a try/catch instead of importing it at module scope.
let appleAuthModule: AppleAuthModule | null = null;
if (Platform.OS === "ios") {
  try {
    appleAuthModule = require("expo-apple-authentication") as AppleAuthModule;
  } catch {
    appleAuthModule = null;
  }
}

export async function isAppleSignInAvailable() {
  if (!appleAuthModule) {
    return false;
  }
  try {
    return await appleAuthModule.isAvailableAsync();
  } catch {
    return false;
  }
}

function getErrorCode(error: unknown) {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" ? code : null;
}

function isCancellation(error: unknown) {
  const code = getErrorCode(error);
  return code === "ERR_REQUEST_CANCELED" || code === "ERR_CANCELED";
}

function reportAmbiguousCancellation(error: unknown, elapsedMs: number) {
  const code = getErrorCode(error) ?? "unknown";

  // AuthenticationServices also reports Apple's native "Sign Up Not
  // Completed" failure as a cancellation, so this event can represent either
  // a real dismissal or a service-side failure. Retain enough non-PII context
  // to identify an incident in Sentry without treating it as an unhandled
  // crash.
  Sentry.captureMessage("Apple sign-in request did not complete", {
    level: "warning",
    fingerprint: ["apple-auth-native-cancellation"],
    tags: {
      auth_provider: "apple",
      auth_stage: "native_authorization",
      apple_auth_error_code: code,
      apple_auth_result: "ambiguous_cancellation",
    },
    extra: {
      ios_version: String(Platform.Version),
      elapsed_ms: elapsedMs,
      native_error_name: error instanceof Error ? error.name : "unknown",
      handled: true,
    },
  });
}

// Returns null for Apple's cancellation response (which can be either a real
// dismissal or a native service failure); throws on other failures. The raw
// nonce goes to our server, its sha256 goes to Apple, so the identity token
// can't be replayed from another context.
export async function signInWithApple(): Promise<AppleSignInResult | null> {
  if (!appleAuthModule) {
    throw new Error("Sign in with Apple is not available on this device.");
  }

  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  let credential;
  const requestStartedAt = Date.now();
  try {
    credential = await appleAuthModule.signInAsync({
      requestedScopes: [
        appleAuthModule.AppleAuthenticationScope.FULL_NAME,
        appleAuthModule.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (error) {
    if (isCancellation(error)) {
      reportAmbiguousCancellation(error, Date.now() - requestStartedAt);
      return null;
    }
    throw error;
  }

  if (!credential.identityToken) {
    throw new Error("Apple did not return a sign-in token. Please try again.");
  }

  return {
    identityToken: credential.identityToken,
    rawNonce,
    fullName: credential.fullName
      ? {
          givenName: credential.fullName.givenName ?? null,
          familyName: credential.fullName.familyName ?? null,
        }
      : null,
  };
}

export function getAppleButtonComponent(): ComponentType<{
  buttonType: number;
  buttonStyle: number;
  cornerRadius: number;
  onPress: () => void;
  accessibilityLabel?: string;
  style?: object;
}> | null {
  return appleAuthModule?.AppleAuthenticationButton ?? null;
}

export function getAppleButtonProps() {
  if (!appleAuthModule) {
    return null;
  }
  return {
    buttonType: appleAuthModule.AppleAuthenticationButtonType.SIGN_IN,
    buttonStyle: appleAuthModule.AppleAuthenticationButtonStyle.WHITE,
  };
}

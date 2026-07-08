import { Platform } from "react-native";
import type { ComponentType } from "react";
import * as Crypto from "expo-crypto";

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

function isCancellation(error: unknown) {
  const code = (error as { code?: string })?.code;
  return code === "ERR_REQUEST_CANCELED" || code === "ERR_CANCELED";
}

// Returns null when the user dismisses the Apple sheet; throws on real
// failures. The raw nonce goes to our server, its sha256 goes to Apple, so
// the identity token can't be replayed from another context.
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

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

// Services ID for Sign in with Apple on the web (identifiers are public —
// they ride in the authorize URL). Must exist in the Apple Developer portal
// with the plotlist.app domains verified and /sign-in return URLs
// registered; the worker accepts it as a token audience via the
// APPLE_WEB_CLIENT_ID var in wrangler.jsonc.
export const APPLE_WEB_CLIENT_ID = "com.emckanna.Plotlist.web";

const APPLE_JS_SDK_URL =
  "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";

type AppleJsSignInResponse = {
  authorization: {
    id_token: string;
    code: string;
    state?: string;
  };
  // Only present on the account's very first authorization.
  user?: {
    name?: { firstName?: string; lastName?: string };
    email?: string;
  };
};

type AppleJsApi = {
  auth: {
    init: (config: {
      clientId: string;
      scope: string;
      redirectURI: string;
      usePopup: boolean;
      nonce?: string;
      state?: string;
    }) => void;
    signIn: () => Promise<AppleJsSignInResponse>;
  };
};

declare global {
  interface Window {
    AppleID?: AppleJsApi;
  }
}

let appleJsPromise: Promise<AppleJsApi> | null = null;

// Load Apple's Sign in with Apple JS on demand (script injection; the SDK
// attaches window.AppleID). Only ever called on web.
function loadAppleJs(): Promise<AppleJsApi> {
  if (appleJsPromise) {
    return appleJsPromise;
  }
  appleJsPromise = new Promise<AppleJsApi>((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Sign in with Apple needs a browser."));
      return;
    }
    if (window.AppleID) {
      resolve(window.AppleID);
      return;
    }
    const script = document.createElement("script");
    script.src = APPLE_JS_SDK_URL;
    script.async = true;
    script.onload = () => {
      if (window.AppleID) {
        resolve(window.AppleID);
      } else {
        reject(new Error("Sign in with Apple did not load. Please try again."));
      }
    };
    script.onerror = () => {
      appleJsPromise = null;
      reject(new Error("Sign in with Apple did not load. Please try again."));
    };
    document.head.appendChild(script);
  });
  return appleJsPromise;
}

function isWebCancellation(error: unknown) {
  const code = (error as { error?: string })?.error;
  return code === "popup_closed_by_user" || code === "user_cancelled_authorize";
}

// Web flow: Apple's JS SDK opens the auth popup and hands back the identity
// token, which then goes through the exact same server verification as the
// native flow — only the token audience differs (Services ID vs bundle ID).
async function signInWithAppleWeb(): Promise<AppleSignInResult | null> {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  const appleId = await loadAppleJs();
  appleId.auth.init({
    clientId: APPLE_WEB_CLIENT_ID,
    scope: "name email",
    redirectURI: `${window.location.origin}/sign-in`,
    usePopup: true,
    nonce: hashedNonce,
  });

  let response: AppleJsSignInResponse;
  try {
    response = await appleId.auth.signIn();
  } catch (error) {
    if (isWebCancellation(error)) {
      return null;
    }
    throw new Error("Apple sign-in didn't complete. Please try again.", {
      cause: error,
    });
  }

  if (!response?.authorization?.id_token) {
    throw new Error("Apple did not return a sign-in token. Please try again.");
  }

  return {
    identityToken: response.authorization.id_token,
    rawNonce,
    fullName: response.user?.name
      ? {
          givenName: response.user.name.firstName ?? null,
          familyName: response.user.name.lastName ?? null,
        }
      : null,
  };
}

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
  if (Platform.OS === "web") {
    // The SDK loads on first use; any modern browser can run the popup flow.
    return typeof window !== "undefined";
  }
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
  if (Platform.OS === "web") {
    return signInWithAppleWeb();
  }
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

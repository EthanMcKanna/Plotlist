// Shared RevenueCat types/constants, importable from any platform bundle —
// keep this file free of react-native-purchases runtime imports so the web
// build never pulls the native SDK in.

// Must match the entitlement identifier configured in the RevenueCat
// dashboard exactly.
export const PRO_ENTITLEMENT_ID = "Plotlist Pro";

// Store product identifiers attached to the Pro entitlement in RevenueCat.
export const PRO_PRODUCT_IDS = {
  monthly: "monthly",
  yearly: "yearly",
} as const;

export type ProStatus = {
  // False until the first CustomerInfo load resolves — gate UIs should
  // skeleton on !isReady instead of flashing the locked state.
  isReady: boolean;
  isPro: boolean;
  expirationDate: string | null;
  willRenew: boolean;
  managementURL: string | null;
};

export type PaywallOutcome =
  | "purchased"
  | "restored"
  | "dismissed"
  | "not_presented"
  | "unavailable"
  | "error";

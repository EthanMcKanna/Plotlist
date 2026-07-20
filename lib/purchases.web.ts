// Web stub — react-native-purchases has no web target, and Metro resolves
// this file for web bundles so the native SDK never enters them. Web stays
// on the free tier until web billing ships (Stripe / @revenuecat/purchases-js);
// entitlements bought on iOS/Android will then surface here via the backend.
import type { PurchasesPackage } from "react-native-purchases";

import type { PaywallOutcome, ProStatus } from "./purchasesTypes";

const WEB_STATUS: ProStatus = {
  isReady: true,
  isPro: false,
  expirationDate: null,
  willRenew: false,
  managementURL: null,
};

export const PURCHASES_SUPPORTED = false;

export function configurePurchases(): void {}

export async function syncPurchasesUser(_userId: string | null): Promise<void> {}

export function getProStatus(): ProStatus {
  return WEB_STATUS;
}

export function subscribeProStatus(_listener: () => void): () => void {
  return () => {};
}

export async function refreshProStatus(): Promise<ProStatus> {
  return WEB_STATUS;
}

export async function presentProPaywall(_options?: {
  onlyIfNeeded?: boolean;
}): Promise<PaywallOutcome> {
  return "unavailable";
}

export async function purchaseProPackage(
  _pkg: PurchasesPackage,
): Promise<"purchased" | "cancelled"> {
  throw new Error("Purchases are not available on web yet.");
}

export async function getProPackages(): Promise<PurchasesPackage[]> {
  return [];
}

export async function restoreProPurchases(): Promise<ProStatus> {
  return WEB_STATUS;
}

export async function showManageSubscriptions(): Promise<void> {}

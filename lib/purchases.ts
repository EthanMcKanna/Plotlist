import { Platform } from "react-native";
import type { CustomerInfo, PurchasesPackage } from "react-native-purchases";

import {
  PRO_ENTITLEMENT_ID,
  type PaywallOutcome,
  type ProStatus,
} from "./purchasesTypes";
import { Sentry } from "./sentry";

type PurchasesModule = typeof import("react-native-purchases");
type PurchasesUIModule = typeof import("react-native-purchases-ui");

// RevenueCat ships through this single guarded choke point (same rule as
// NativeGlass): the native module only exists in binaries built after the
// SDK was added, so lazy-require inside try/catch and degrade to a
// free-tier stub instead of crashing older dev clients. Web resolves
// purchases.web.ts and never touches this file.
let purchasesModule: PurchasesModule | null = null;
if (Platform.OS === "ios" || Platform.OS === "android") {
  try {
    purchasesModule = require("react-native-purchases");
  } catch {
    purchasesModule = null;
  }
}

export const PURCHASES_SUPPORTED = purchasesModule !== null;

// RevenueCat public SDK keys — safe to ship in the client. iOS uses the
// production App Store app key (real StoreKit products
// plotlist_pro_monthly/_yearly); Android still needs a Play app + goog_ key.
const REVENUECAT_API_KEY =
  Platform.OS === "ios"
    ? "appl_uLTAnWstoWuqRXONUZputToYhtK"
    : "test_OzFhOEsYeNEvClCCGqtVXKyynYm";

let status: ProStatus = {
  // When the SDK can't exist in this binary there is nothing to wait for.
  isReady: !PURCHASES_SUPPORTED,
  isPro: false,
  expirationDate: null,
  willRenew: false,
  managementURL: null,
};
const listeners = new Set<() => void>();
let configured = false;

function sameStatus(a: ProStatus, b: ProStatus) {
  return (
    a.isReady === b.isReady &&
    a.isPro === b.isPro &&
    a.expirationDate === b.expirationDate &&
    a.willRenew === b.willRenew &&
    a.managementURL === b.managementURL
  );
}

function toProStatus(info: CustomerInfo): ProStatus {
  const entitlement = info.entitlements.active[PRO_ENTITLEMENT_ID] ?? null;
  return {
    isReady: true,
    isPro: entitlement?.isActive === true,
    expirationDate: entitlement?.expirationDate ?? null,
    willRenew: entitlement?.willRenew ?? false,
    managementURL: info.managementURL ?? null,
  };
}

function setStatus(next: ProStatus) {
  if (sameStatus(status, next)) return;
  status = next;
  for (const listener of listeners) {
    listener();
  }
}

function applyCustomerInfo(info: CustomerInfo) {
  setStatus(toProStatus(info));
}

export function getProStatus(): ProStatus {
  return status;
}

export function subscribeProStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Idempotent; call once at startup (PurchasesBridge). Everything else in
// this module silently no-ops until this has run.
export function configurePurchases(): void {
  if (!purchasesModule || configured) return;
  configured = true;
  const { default: Purchases, LOG_LEVEL } = purchasesModule;
  try {
    if (__DEV__) {
      void Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }
    Purchases.configure({ apiKey: REVENUECAT_API_KEY });
    // Fires on purchases, restores, renewals, and identity changes — the
    // single source of truth for entitlement state.
    Purchases.addCustomerInfoUpdateListener(applyCustomerInfo);
    void Purchases.getCustomerInfo()
      .then(applyCustomerInfo)
      .catch(() => {
        // Offline first launch: report ready on the free tier rather than
        // holding gates in a loading state; the listener corrects us the
        // moment a fetch succeeds.
        setStatus({ ...status, isReady: true });
      });
  } catch (error) {
    configured = false;
    setStatus({ ...status, isReady: true });
    Sentry.captureException(error);
  }
}

// Aliases the RevenueCat identity to the Plotlist user id so entitlements
// survive reinstalls, follow the account across devices, and can be synced
// to the backend via RevenueCat webhooks later. Pass null on sign-out.
export async function syncPurchasesUser(userId: string | null): Promise<void> {
  if (!purchasesModule || !configured) return;
  const { default: Purchases } = purchasesModule;
  try {
    if (userId) {
      const current = await Purchases.getAppUserID();
      if (current !== userId) {
        const { customerInfo } = await Purchases.logIn(userId);
        applyCustomerInfo(customerInfo);
      }
    } else if (!(await Purchases.isAnonymous())) {
      applyCustomerInfo(await Purchases.logOut());
    }
  } catch (error) {
    Sentry.captureException(error);
  }
}

export async function refreshProStatus(): Promise<ProStatus> {
  if (purchasesModule && configured) {
    try {
      applyCustomerInfo(await purchasesModule.default.getCustomerInfo());
    } catch {
      // Keep the last known status; the update listener will catch us up.
    }
  }
  return status;
}

// Presents the RevenueCat-hosted paywall for the current offering.
// `onlyIfNeeded` skips presentation when the user already has Pro — use it
// as the one-line gate in front of Pro features:
//   if ((await presentProPaywall({ onlyIfNeeded: true })) === "not_presented") { …already Pro… }
export async function presentProPaywall(options?: {
  onlyIfNeeded?: boolean;
}): Promise<PaywallOutcome> {
  if (!purchasesModule || !configured) return "unavailable";
  let ui: PurchasesUIModule;
  try {
    ui = require("react-native-purchases-ui");
  } catch {
    return "unavailable";
  }
  const { default: RevenueCatUI, PAYWALL_RESULT } = ui;
  try {
    const result = options?.onlyIfNeeded
      ? await RevenueCatUI.presentPaywallIfNeeded({
          requiredEntitlementIdentifier: PRO_ENTITLEMENT_ID,
        })
      : await RevenueCatUI.presentPaywall({});
    await refreshProStatus();
    switch (result) {
      case PAYWALL_RESULT.PURCHASED:
        return "purchased";
      case PAYWALL_RESULT.RESTORED:
        return "restored";
      case PAYWALL_RESULT.NOT_PRESENTED:
        return "not_presented";
      case PAYWALL_RESULT.CANCELLED:
        return "dismissed";
      default:
        return "error";
    }
  } catch (error) {
    Sentry.captureException(error);
    return "error";
  }
}

// Throws on store errors (except user cancellation) so callers can show
// their own message; use this for future custom paywall UIs.
export async function purchaseProPackage(
  pkg: PurchasesPackage,
): Promise<"purchased" | "cancelled"> {
  if (!purchasesModule || !configured) {
    throw new Error("Purchases are not available in this build.");
  }
  try {
    const { customerInfo } = await purchasesModule.default.purchasePackage(pkg);
    applyCustomerInfo(customerInfo);
    return "purchased";
  } catch (error) {
    if ((error as { userCancelled?: boolean | null })?.userCancelled) {
      return "cancelled";
    }
    Sentry.captureException(error);
    throw error;
  }
}

// Packages of the current offering (monthly/yearly), for custom paywalls.
export async function getProPackages(): Promise<PurchasesPackage[]> {
  if (!purchasesModule || !configured) return [];
  try {
    const offerings = await purchasesModule.default.getOfferings();
    return offerings.current?.availablePackages ?? [];
  } catch (error) {
    Sentry.captureException(error);
    return [];
  }
}

// Throws so the caller can distinguish "restore ran but found nothing"
// (resolved status.isPro === false) from "restore failed".
export async function restoreProPurchases(): Promise<ProStatus> {
  if (!purchasesModule || !configured) return status;
  applyCustomerInfo(await purchasesModule.default.restorePurchases());
  return status;
}

export async function showManageSubscriptions(): Promise<void> {
  if (!purchasesModule || !configured) return;
  try {
    await purchasesModule.default.showManageSubscriptions();
  } catch (error) {
    Sentry.captureException(error);
  }
}

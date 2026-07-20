import {
  ErrorCode,
  Purchases,
  PurchasesError,
  type CustomerInfo,
  type Package,
} from "@revenuecat/purchases-js";

import {
  PRO_ENTITLEMENT_ID,
  type PaywallOutcome,
  type ProStatus,
} from "./purchasesTypes";
import { Sentry } from "./sentry";

// Web implementation on RevenueCat's purchases-js. The same public key works
// here: the Test Store simulates checkout in an in-page modal today, and the
// key swap to Web Billing (Stripe) later changes nothing in this file. The
// account identity is always the Plotlist user id, so entitlements bought on
// iOS surface here (and vice versa) via the shared RevenueCat customer +
// webhook → users.proUntil.

export const PURCHASES_SUPPORTED = true;

// Same key as lib/purchases.ts — public, safe to ship.
const REVENUECAT_API_KEY = "test_OzFhOEsYeNEvClCCGqtVXKyynYm";

let status: ProStatus = {
  isReady: false,
  isPro: false,
  expirationDate: null,
  willRenew: false,
  managementURL: null,
};
const listeners = new Set<() => void>();

function sameStatus(a: ProStatus, b: ProStatus) {
  return (
    a.isReady === b.isReady &&
    a.isPro === b.isPro &&
    a.expirationDate === b.expirationDate &&
    a.willRenew === b.willRenew &&
    a.managementURL === b.managementURL
  );
}

function setStatus(next: ProStatus) {
  if (sameStatus(status, next)) return;
  status = next;
  for (const listener of listeners) {
    listener();
  }
}

function applyCustomerInfo(info: CustomerInfo) {
  const entitlement = info.entitlements.active[PRO_ENTITLEMENT_ID] ?? null;
  setStatus({
    isReady: true,
    isPro: Boolean(entitlement),
    expirationDate: entitlement?.expirationDate?.toISOString() ?? null,
    willRenew: entitlement?.willRenew ?? false,
    managementURL: info.managementURL ?? null,
  });
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

// purchases-js requires an app user id at configure time, so real setup
// happens in syncPurchasesUser once auth resolves; this stays a no-op for
// API parity with the native module.
export function configurePurchases(): void {}

export async function syncPurchasesUser(userId: string | null): Promise<void> {
  try {
    if (!userId) {
      // Signed out: report the free tier; a fresh sign-in reconfigures.
      setStatus({ ...status, isReady: true, isPro: false });
      return;
    }
    if (!Purchases.isConfigured()) {
      Purchases.configure({ apiKey: REVENUECAT_API_KEY, appUserId: userId });
      applyCustomerInfo(await Purchases.getSharedInstance().getCustomerInfo());
      return;
    }
    const purchases = Purchases.getSharedInstance();
    if (purchases.getAppUserId() !== userId) {
      applyCustomerInfo(await purchases.changeUser(userId));
    } else {
      applyCustomerInfo(await purchases.getCustomerInfo());
    }
  } catch (error) {
    setStatus({ ...status, isReady: true });
    Sentry.captureException(error);
  }
}

export async function refreshProStatus(): Promise<ProStatus> {
  if (Purchases.isConfigured()) {
    try {
      applyCustomerInfo(await Purchases.getSharedInstance().getCustomerInfo());
    } catch {
      // Keep the last known status.
    }
  }
  return status;
}

export async function getProPackages(): Promise<Package[]> {
  if (!Purchases.isConfigured()) return [];
  try {
    const offerings = await Purchases.getSharedInstance().getOfferings();
    return offerings.current?.availablePackages ?? [];
  } catch (error) {
    Sentry.captureException(error);
    return [];
  }
}

export async function purchaseProPackage(
  pkg: Package,
): Promise<"purchased" | "cancelled"> {
  const { customerInfo } = await Purchases.getSharedInstance().purchase({
    rcPackage: pkg,
  });
  applyCustomerInfo(customerInfo);
  return "purchased";
}

const PACKAGE_LABELS: Record<string, string> = {
  $rc_monthly: "Monthly",
  $rc_annual: "Yearly",
};

function packagePriceLine(pkg: Package): string {
  const price = pkg.webBillingProduct?.currentPrice?.formattedPrice ?? "";
  const label = PACKAGE_LABELS[pkg.identifier] ?? pkg.webBillingProduct?.title ?? "Plan";
  const suffix = pkg.identifier === "$rc_annual" ? "/year" : "/month";
  return price ? `${label} — ${price}${suffix}` : label;
}

// Minimal dark-themed plan chooser, rendered with vanilla DOM so the
// imperative presentProPaywall contract works from any call site. The actual
// checkout after choosing is RevenueCat's own modal.
function chooseProPackage(packages: Package[]): Promise<Package | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Upgrade to Plotlist Pro");
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      background: "rgba(6,8,12,0.78)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "9999",
      padding: "20px",
    });

    const card = document.createElement("div");
    Object.assign(card.style, {
      background: "#11141B",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: "20px",
      padding: "28px 24px",
      width: "100%",
      maxWidth: "380px",
      fontFamily: "inherit",
      color: "#F1F3F7",
    });
    card.innerHTML = `
      <div style="font-size:22px;font-weight:800;margin-bottom:6px;">Plotlist Pro</div>
      <div style="font-size:13px;line-height:18px;color:#9BA1B0;margin-bottom:18px;">
        Unlimited vibe search, streaming arrival alerts, custom notifications,
        calendar sync, backdrops, and more.
      </div>
    `;

    const finish = (value: Package | null) => {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
      resolve(value);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish(null);
    };
    document.addEventListener("keydown", onKey);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) finish(null);
    });

    const ordered = [...packages].sort((a) =>
      a.identifier === "$rc_annual" ? -1 : 1,
    );
    for (const pkg of ordered) {
      const isAnnual = pkg.identifier === "$rc_annual";
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = packagePriceLine(pkg);
      Object.assign(button.style, {
        display: "block",
        width: "100%",
        padding: "13px 16px",
        marginBottom: "10px",
        borderRadius: "12px",
        fontSize: "15px",
        fontWeight: "700",
        cursor: "pointer",
        border: isAnnual ? "none" : "1px solid rgba(255,255,255,0.18)",
        background: isAnnual ? "#38BDF8" : "transparent",
        color: isAnnual ? "#06121C" : "#F1F3F7",
      });
      button.addEventListener("click", () => finish(pkg));
      card.appendChild(button);
    }

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Not now";
    Object.assign(cancel.style, {
      display: "block",
      width: "100%",
      padding: "10px",
      background: "transparent",
      border: "none",
      color: "#9BA1B0",
      fontSize: "13px",
      cursor: "pointer",
    });
    cancel.addEventListener("click", () => finish(null));
    card.appendChild(cancel);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
  });
}

export async function presentProPaywall(options?: {
  onlyIfNeeded?: boolean;
}): Promise<PaywallOutcome> {
  if (!Purchases.isConfigured()) return "unavailable";
  if (options?.onlyIfNeeded) {
    await refreshProStatus();
    if (status.isPro) return "not_presented";
  }
  const packages = await getProPackages();
  if (packages.length === 0) return "error";
  const chosen = await chooseProPackage(packages);
  if (!chosen) return "dismissed";
  try {
    await purchaseProPackage(chosen);
    return "purchased";
  } catch (error) {
    if (
      error instanceof PurchasesError &&
      error.errorCode === ErrorCode.UserCancelledError
    ) {
      return "dismissed";
    }
    Sentry.captureException(error);
    return "error";
  }
}

// Web has no store-level restore; entitlements follow the signed-in account.
export async function restoreProPurchases(): Promise<ProStatus> {
  return await refreshProStatus();
}

export async function showManageSubscriptions(): Promise<void> {
  await refreshProStatus();
  if (status.managementURL) {
    window.open(status.managementURL, "_blank", "noopener");
  }
}

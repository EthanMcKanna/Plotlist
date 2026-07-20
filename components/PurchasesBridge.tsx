import { useEffect } from "react";

import { api } from "../lib/plotlist/api";
import { useAuth } from "../lib/plotlist/auth";
import { useQuery } from "../lib/plotlist/react";
import { configurePurchases, syncPurchasesUser } from "../lib/purchases";

// Headless bridge (mirrors NotificationsBridge): configures RevenueCat once
// at startup and keeps its identity aliased to the signed-in Plotlist user
// so entitlements survive reinstalls and follow the account across devices.
export function PurchasesBridge() {
  const { isAuthenticated, isLoading } = useAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const userId = me?._id ?? null;

  useEffect(() => {
    configurePurchases();
  }, []);

  useEffect(() => {
    // Never sync while the session or profile is still resolving — a
    // premature null here would log the persisted RevenueCat identity out
    // on every cold start.
    if (isLoading) return;
    if (isAuthenticated && !userId) return;
    void syncPurchasesUser(isAuthenticated ? userId : null);
  }, [isAuthenticated, isLoading, userId]);

  return null;
}

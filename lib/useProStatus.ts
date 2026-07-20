import { useSyncExternalStore } from "react";

import { getProStatus, subscribeProStatus } from "./purchases";
import type { ProStatus } from "./purchasesTypes";

// Live "does this user have Plotlist Pro" snapshot. Updates on purchases,
// restores, renewals, and sign-in/out. Gate UIs should skeleton while
// !isReady instead of flashing the locked state.
export function useProStatus(): ProStatus {
  return useSyncExternalStore(subscribeProStatus, getProStatus, getProStatus);
}

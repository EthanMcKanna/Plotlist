import { getContactsPermissionState, loadDeviceContacts } from "./deviceContacts";
import { getContactsAutoSyncedAt, setContactsAutoSyncedAt } from "./preferences";

export type ContactSyncResult = {
  totalCount: number;
  matchedCount: number;
  inviteCount?: number;
  invitedCount?: number;
};

export function getInviteReadyCount(result: ContactSyncResult) {
  return result.inviteCount ?? result.invitedCount ?? Math.max(0, result.totalCount - result.matchedCount);
}

export function getContactSyncAlertCopy(result: ContactSyncResult) {
  if (result.totalCount === 0) {
    return {
      title: "No contacts to sync",
      message:
        "We couldn't find any phone numbers in your address book. Add a contact with a phone number and try again.",
    };
  }

  if (result.matchedCount > 0) {
    return {
      title: "Contacts synced",
      message: `We found ${result.matchedCount} ${
        result.matchedCount === 1 ? "person" : "people"
      } already on Plotlist.`,
    };
  }

  const inviteReadyCount = getInviteReadyCount(result);
  return {
    title: "Contacts synced",
    message:
      inviteReadyCount > 0
        ? "No current matches yet, but you can still invite people from your contacts."
        : "No current matches yet. Try again after more friends join Plotlist.",
  };
}

// Matches also refresh server-side the moment a contact joins (they get
// linked and the owner is notified), so the silent resync only needs to pick
// up address-book edits — once a day is plenty.
export const CONTACT_AUTO_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function shouldAutoSyncContacts(
  lastAutoSyncedAt: number | null | undefined,
  now = Date.now(),
) {
  return !lastAutoSyncedAt || now - lastAutoSyncedAt >= CONTACT_AUTO_SYNC_INTERVAL_MS;
}

let autoSyncInFlight: Promise<ContactSyncResult | null> | null = null;

// Silently refreshes the server snapshot when the user has already granted
// contacts access and the last background attempt is over a day old. Never
// prompts, never alerts; failures wait for the next daily window instead of
// retrying on every mount. Multiple screens can call this concurrently (the
// search People tab and the Friends screen both do) — one sync runs.
export async function runContactAutoSync(options: {
  hasSyncedBefore: boolean;
  syncSnapshot: (args: { entries: Awaited<ReturnType<typeof loadDeviceContacts>> }) => Promise<ContactSyncResult>;
  now?: number;
}): Promise<ContactSyncResult | null> {
  if (autoSyncInFlight) {
    return await autoSyncInFlight;
  }

  autoSyncInFlight = (async () => {
    try {
      // Auto-sync only refreshes an existing opt-in; the first sync is
      // always an explicit user action.
      if (!options.hasSyncedBefore) {
        return null;
      }
      if ((await getContactsPermissionState()) !== "granted") {
        return null;
      }
      const now = options.now ?? Date.now();
      if (!shouldAutoSyncContacts(await getContactsAutoSyncedAt(), now)) {
        return null;
      }
      // Stamp before the attempt so a failing sync can't retry-storm.
      await setContactsAutoSyncedAt(now);

      const entries = await loadDeviceContacts({ requestPermission: false });
      return await options.syncSnapshot({ entries });
    } catch (error) {
      console.warn("[contacts] background contact sync failed", error);
      return null;
    } finally {
      autoSyncInFlight = null;
    }
  })();

  return await autoSyncInFlight;
}

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Linking, Platform, Share } from "react-native";

import { api } from "./plotlist/api";
import { notify, notifyError } from "./dialogs";
import { useAction, useMutation } from "./plotlist/react";
import { queryClient } from "./queryClient";
import { showWebToast } from "./webToast";
import {
  getContactSyncAlertCopy,
  runContactAutoSync,
  type ContactSyncResult,
} from "./contactSync";
import { getContactsPermissionState, loadDeviceContacts } from "./deviceContacts";
import { buildInviteMessage, buildSmsInviteUrl } from "./invite";
import { setContactsAutoSyncedAt, setContactsSyncDismissed } from "./preferences";

export type InviteCandidate = {
  entryId: string;
  sourceRecordId: string | null;
  displayName: string;
};

// Contact reads are queries ("plotlist-rpc","query",name,args); after a sync
// rewrites the snapshot, every contact-derived surface must refetch —
// including suggestions, which blend in contact matches.
const CONTACT_QUERY_NAMES = new Set([
  "contacts:getStatus",
  "contacts:getMatches",
  "contacts:getInviteCandidates",
  "contacts:searchInviteCandidates",
  "users:suggested",
]);

export function invalidateContactQueries() {
  void queryClient.invalidateQueries({
    predicate: (query) =>
      query.queryKey[0] === "plotlist-rpc" &&
      typeof query.queryKey[2] === "string" &&
      CONTACT_QUERY_NAMES.has(query.queryKey[2]),
  });
}

function showPermissionDeniedAlert() {
  Alert.alert(
    "Allow contacts access",
    "Plotlist needs contacts access to find friends already on the app. You can turn it on in Settings.",
    [
      { text: "Not now", style: "cancel" },
      { text: "Open Settings", onPress: () => void Linking.openSettings() },
    ],
  );
}

// One shared engine for every find-friends surface: interactive sync with
// permission recovery, a silent daily background resync, and the SMS invite
// flow. Screens render the state; this hook owns the choreography.
export function useContactSync(options: { enabled: boolean; hasSyncedBefore: boolean }) {
  const syncSnapshot = useAction(api.contacts.syncSnapshot);
  const sendInvite = useMutation(api.contacts.sendInvite);

  const [isSyncing, setIsSyncing] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  // Maps device sourceRecordIds to raw phone numbers so the invite flow can
  // open the SMS composer; the server intentionally only ever sees hashes.
  const phoneLookupRef = useRef<Record<string, string>>({});

  const rememberPhones = useCallback(
    (entries: Array<{ sourceRecordId: string; phone: string }>) => {
      const next: Record<string, string> = {};
      for (const entry of entries) {
        next[entry.sourceRecordId] = entry.phone;
      }
      phoneLookupRef.current = next;
    },
    [],
  );

  const syncNow = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}): Promise<ContactSyncResult | null> => {
      if (isSyncing) {
        return null;
      }
      setIsSyncing(true);
      try {
        if ((await getContactsPermissionState()) === "denied") {
          // The OS won't re-prompt once denied; a plain error here is a
          // dead end, so route the user to Settings instead.
          showPermissionDeniedAlert();
          return null;
        }
        const entries = await loadDeviceContacts();
        rememberPhones(entries);
        const result = (await syncSnapshot({ entries })) as ContactSyncResult;
        await setContactsAutoSyncedAt(Date.now());
        await setContactsSyncDismissed(false);
        invalidateContactQueries();
        if (!silent) {
          const copy = getContactSyncAlertCopy(result);
          notify(copy.title, copy.message);
        }
        return result;
      } catch (error) {
        if (!silent) {
          notifyError("Could not sync contacts", String(error));
        }
        return null;
      } finally {
        setIsSyncing(false);
      }
    },
    [isSyncing, rememberPhones, syncSnapshot],
  );

  // Keep matches fresh without asking: once the user has synced and granted
  // access, new address-book entries flow in on a daily cadence.
  const { enabled, hasSyncedBefore } = options;
  useEffect(() => {
    if (!enabled || !hasSyncedBefore) {
      return;
    }
    let active = true;
    void runContactAutoSync({
      hasSyncedBefore,
      syncSnapshot: (args) => syncSnapshot(args) as Promise<ContactSyncResult>,
    }).then((result) => {
      if (active && result) {
        invalidateContactQueries();
      }
    });
    return () => {
      active = false;
    };
  }, [enabled, hasSyncedBefore, syncSnapshot]);

  const invite = useCallback(
    async (candidate: InviteCandidate) => {
      const inviteKey = candidate.sourceRecordId ?? candidate.entryId;
      try {
        setInvitingId(inviteKey);
        let phone = candidate.sourceRecordId
          ? phoneLookupRef.current[candidate.sourceRecordId]
          : undefined;
        if (!phone) {
          // The lookup only lives for the session; rebuild it from the
          // device book when the candidate came from an earlier sync.
          const entries = await loadDeviceContacts();
          rememberPhones(entries);
          phone = candidate.sourceRecordId
            ? phoneLookupRef.current[candidate.sourceRecordId]
            : undefined;
        }
        if (!phone) {
          throw new Error("Resync contacts before inviting this person");
        }
        const smsUrl = buildSmsInviteUrl({
          phone,
          message: buildInviteMessage(),
          platform: Platform.OS,
        });
        if (!(await Linking.canOpenURL(smsUrl))) {
          throw new Error("SMS is not available on this device");
        }
        await Linking.openURL(smsUrl);
        await sendInvite({ entryId: candidate.entryId });
      } catch (error) {
        notifyError("Invite failed", String(error));
      } finally {
        setInvitingId(null);
      }
    },
    [rememberPhones, sendInvite],
  );

  const shareInvite = useCallback(async () => {
    if (Platform.OS === "web") {
      // RN Share rejects on desktop browsers; use the web share sheet where
      // it exists and fall back to the clipboard.
      const message = buildInviteMessage();
      try {
        if (typeof navigator !== "undefined" && navigator.share) {
          await navigator.share({ text: message });
          return;
        }
        await navigator.clipboard.writeText(message);
        showWebToast("Invite copied");
      } catch {
        // The user dismissing the share sheet is not an error worth surfacing.
      }
      return;
    }
    try {
      await Share.share({ message: buildInviteMessage() });
    } catch {
      // The user dismissing the share sheet is not an error worth surfacing.
    }
  }, []);

  return { isSyncing, invitingId, syncNow, invite, shareInvite };
}

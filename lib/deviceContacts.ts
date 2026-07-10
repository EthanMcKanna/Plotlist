import * as Contacts from "expo-contacts";

import { normalizePhoneNumber } from "./phone";

export type DeviceContactEntry = {
  sourceRecordId: string;
  displayName: string;
  phone: string;
};

export type DeviceContactRecord = {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  phoneNumbers?: Array<{ number?: string }>;
};

// The sync endpoint processes at most this many entries; capping here keeps
// huge address books from producing oversized request payloads that would be
// truncated server-side anyway.
export const DEVICE_CONTACTS_SYNC_LIMIT = 2000;

export type ContactsPermissionState = "granted" | "denied" | "undetermined";

// Checks without prompting — the silent auto-sync path must never surface a
// permission dialog the user didn't ask for.
export async function getContactsPermissionState(): Promise<ContactsPermissionState> {
  const permission = await Contacts.getPermissionsAsync();
  if (permission.granted) {
    return "granted";
  }
  return permission.canAskAgain === false ? "denied" : "undetermined";
}

export function getContactDisplayName(contact: DeviceContactRecord) {
  return (
    contact.name?.trim() ||
    [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
    "Unknown contact"
  );
}

// Pure so the dedupe/cap behavior is unit-testable without expo-contacts.
// Dedupe is by normalized number (the unit the server matches on); when the
// same number appears under several contacts, the named contact wins over an
// "Unknown contact" placeholder.
export function collectDeviceContactEntries(
  contacts: DeviceContactRecord[],
  limit = DEVICE_CONTACTS_SYNC_LIMIT,
): DeviceContactEntry[] {
  const deduped = new Map<string, DeviceContactEntry & { hasName: boolean }>();

  for (const contact of contacts) {
    const displayName = getContactDisplayName(contact);
    const hasName = displayName !== "Unknown contact";
    const phoneNumbers = contact.phoneNumbers ?? [];

    phoneNumbers.forEach((phoneNumber, index) => {
      const rawNumber = phoneNumber.number?.trim();
      if (!rawNumber) {
        return;
      }
      const normalizedPhone = normalizePhoneNumber(rawNumber);
      if (!normalizedPhone) {
        return;
      }
      const existing = deduped.get(normalizedPhone);
      if (existing && (existing.hasName || !hasName)) {
        return;
      }
      deduped.set(normalizedPhone, {
        sourceRecordId: `${contact.id ?? "contact"}:${index}`,
        displayName,
        phone: rawNumber,
        hasName,
      });
    });
  }

  // When an address book exceeds the sync cap, keep named contacts — the
  // ones a user could plausibly invite or recognize — over placeholders.
  const entries = Array.from(deduped.values());
  if (entries.length > limit) {
    entries.sort((left, right) => Number(right.hasName) - Number(left.hasName));
  }
  return entries.slice(0, limit).map(({ hasName: _hasName, ...entry }) => entry);
}

export async function loadDeviceContacts(
  options: { requestPermission?: boolean } = {},
) {
  const requestPermission = options.requestPermission ?? true;
  const permission = requestPermission
    ? await Contacts.requestPermissionsAsync()
    : await Contacts.getPermissionsAsync();
  if (permission.status !== "granted") {
    throw new Error("Contacts access was not granted");
  }

  const response = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers],
  });

  return collectDeviceContactEntries(response.data as DeviceContactRecord[]);
}

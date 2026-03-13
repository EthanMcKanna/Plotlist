import * as Contacts from "expo-contacts";

import { normalizePhoneNumber } from "./phone";

export type DeviceContactEntry = {
  sourceRecordId: string;
  displayName: string;
  phone: string;
};

export async function loadDeviceContacts() {
  const permission = await Contacts.requestPermissionsAsync();
  if (permission.status !== "granted") {
    throw new Error("Contacts access was not granted");
  }

  const response = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers],
  });

  const deduped = new Map<string, DeviceContactEntry>();
  for (const contact of response.data) {
    const displayName =
      contact.name?.trim() ||
      [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
      "Unknown contact";

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
      const dedupeKey = normalizedPhone;
      if (deduped.has(dedupeKey)) {
        return;
      }
      deduped.set(dedupeKey, {
        sourceRecordId: `${contact.id ?? "contact"}:${index}`,
        displayName,
        phone: rawNumber,
      });
    });
  }

  return Array.from(deduped.values());
}

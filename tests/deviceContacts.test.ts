import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import {
  collectDeviceContactEntries,
  getContactDisplayName,
} from "../lib/deviceContacts";

const mockContacts = {
  Fields: {
    PhoneNumbers: "phoneNumbers",
  },
  requestPermissionsAsync: jest.fn<
    () => Promise<{ status: string; granted?: boolean; canAskAgain?: boolean }>
  >(),
  getPermissionsAsync: jest.fn<
    () => Promise<{ status: string; granted: boolean; canAskAgain: boolean }>
  >(),
  getContactsAsync: jest.fn<
    () => Promise<{ data: Array<Record<string, unknown>> }>
  >(),
};

describe("collectDeviceContactEntries", () => {
  it("dedupes phone numbers and derives useful display names", () => {
    expect(
      collectDeviceContactEntries([
        {
          id: "1",
          name: " Ada Lovelace ",
          phoneNumbers: [{ number: "312 555 0182" }, { number: "(312) 555-0182" }],
        },
        {
          id: "2",
          firstName: "Grace",
          lastName: "Hopper",
          phoneNumbers: [{ number: "773 555 0123" }],
        },
        {
          id: "3",
          phoneNumbers: [{ number: "  " }, { number: "888 555 0101" }],
        },
        {
          id: "4",
          name: "Local Extension",
          phoneNumbers: [{ number: "555" }],
        },
      ]),
    ).toEqual([
      {
        sourceRecordId: "1:0",
        displayName: "Ada Lovelace",
        phone: "312 555 0182",
      },
      {
        sourceRecordId: "2:0",
        displayName: "Grace Hopper",
        phone: "773 555 0123",
      },
      {
        sourceRecordId: "3:1",
        displayName: "Unknown contact",
        phone: "888 555 0101",
      },
    ]);
  });

  it("prefers the named contact when a number appears under a placeholder too", () => {
    const entries = collectDeviceContactEntries([
      { id: "raw", phoneNumbers: [{ number: "312 555 0182" }] },
      { id: "named", name: "Ada", phoneNumbers: [{ number: "(312) 555-0182" }] },
    ]);

    expect(entries).toEqual([
      { sourceRecordId: "named:0", displayName: "Ada", phone: "(312) 555-0182" },
    ]);
  });

  it("keeps named contacts when the address book exceeds the sync cap", () => {
    const contacts = [
      { id: "u1", phoneNumbers: [{ number: "312 555 0001" }] },
      { id: "n1", name: "Named One", phoneNumbers: [{ number: "312 555 0002" }] },
      { id: "u2", phoneNumbers: [{ number: "312 555 0003" }] },
      { id: "n2", name: "Named Two", phoneNumbers: [{ number: "312 555 0004" }] },
    ];

    const entries = collectDeviceContactEntries(contacts, 2);
    expect(entries.map((entry) => entry.displayName)).toEqual([
      "Named One",
      "Named Two",
    ]);
  });

  it("keeps insertion order when under the cap", () => {
    const contacts = [
      { id: "u1", phoneNumbers: [{ number: "312 555 0001" }] },
      { id: "n1", name: "Named", phoneNumbers: [{ number: "312 555 0002" }] },
    ];

    expect(collectDeviceContactEntries(contacts).map((entry) => entry.sourceRecordId)).toEqual([
      "u1:0",
      "n1:0",
    ]);
  });
});

describe("getContactDisplayName", () => {
  it("prefers the composed name, then first/last, then a placeholder", () => {
    expect(getContactDisplayName({ name: " Ada Lovelace " })).toBe("Ada Lovelace");
    expect(getContactDisplayName({ firstName: "Grace", lastName: "Hopper" })).toBe(
      "Grace Hopper",
    );
    expect(getContactDisplayName({})).toBe("Unknown contact");
  });
});

describe("loadDeviceContacts", () => {
  beforeEach(() => {
    jest.resetModules();
    mockContacts.requestPermissionsAsync.mockReset();
    mockContacts.getPermissionsAsync.mockReset();
    mockContacts.getContactsAsync.mockReset();
    jest.doMock("expo-contacts", () => mockContacts);
  });

  it("throws when the user denies contacts access", async () => {
    mockContacts.requestPermissionsAsync.mockResolvedValue({ status: "denied" });
    const { loadDeviceContacts } = require("../lib/deviceContacts") as typeof import("../lib/deviceContacts");

    await expect(loadDeviceContacts()).rejects.toThrow(
      "Contacts access was not granted",
    );
    expect(mockContacts.getContactsAsync).not.toHaveBeenCalled();
  });

  it("reads without prompting when requestPermission is false", async () => {
    mockContacts.getPermissionsAsync.mockResolvedValue({
      status: "granted",
      granted: true,
      canAskAgain: true,
    });
    mockContacts.getContactsAsync.mockResolvedValue({
      data: [{ id: "1", name: "Ada", phoneNumbers: [{ number: "312 555 0182" }] }],
    });
    const { loadDeviceContacts } = require("../lib/deviceContacts") as typeof import("../lib/deviceContacts");

    await expect(loadDeviceContacts({ requestPermission: false })).resolves.toEqual([
      { sourceRecordId: "1:0", displayName: "Ada", phone: "312 555 0182" },
    ]);
    expect(mockContacts.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockContacts.getContactsAsync).toHaveBeenCalledWith({
      fields: ["phoneNumbers"],
    });
  });

  it("silent reads fail closed when permission was never granted", async () => {
    mockContacts.getPermissionsAsync.mockResolvedValue({
      status: "undetermined",
      granted: false,
      canAskAgain: true,
    });
    const { loadDeviceContacts } = require("../lib/deviceContacts") as typeof import("../lib/deviceContacts");

    await expect(loadDeviceContacts({ requestPermission: false })).rejects.toThrow(
      "Contacts access was not granted",
    );
    expect(mockContacts.getContactsAsync).not.toHaveBeenCalled();
  });
});

describe("getContactsPermissionState", () => {
  beforeEach(() => {
    jest.resetModules();
    mockContacts.getPermissionsAsync.mockReset();
    jest.doMock("expo-contacts", () => mockContacts);
  });

  it("maps granted / permanently denied / still askable states", async () => {
    const { getContactsPermissionState } = require("../lib/deviceContacts") as typeof import("../lib/deviceContacts");

    mockContacts.getPermissionsAsync.mockResolvedValue({
      status: "granted",
      granted: true,
      canAskAgain: true,
    });
    await expect(getContactsPermissionState()).resolves.toBe("granted");

    mockContacts.getPermissionsAsync.mockResolvedValue({
      status: "denied",
      granted: false,
      canAskAgain: false,
    });
    await expect(getContactsPermissionState()).resolves.toBe("denied");

    mockContacts.getPermissionsAsync.mockResolvedValue({
      status: "undetermined",
      granted: false,
      canAskAgain: true,
    });
    await expect(getContactsPermissionState()).resolves.toBe("undetermined");
  });
});

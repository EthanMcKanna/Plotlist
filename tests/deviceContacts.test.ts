import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockContacts = {
  Fields: {
    PhoneNumbers: "phoneNumbers",
  },
  requestPermissionsAsync: jest.fn<
    () => Promise<{ status: string }>
  >(),
  getContactsAsync: jest.fn<
    () => Promise<{ data: Array<Record<string, unknown>> }>
  >(),
};

describe("loadDeviceContacts", () => {
  beforeEach(() => {
    jest.resetModules();
    mockContacts.requestPermissionsAsync.mockReset();
    mockContacts.getContactsAsync.mockReset();
    jest.doMock("expo-contacts", () => mockContacts);
  });

  it("throws when the user denies contacts access", async () => {
    mockContacts.requestPermissionsAsync.mockResolvedValue({ status: "denied" });
    const { loadDeviceContacts } = require("../lib/deviceContacts") as typeof import("../lib/deviceContacts");

    await expect(loadDeviceContacts()).rejects.toThrow(
      "Contacts access was not granted"
    );
    expect(mockContacts.getContactsAsync).not.toHaveBeenCalled();
  });

  it("dedupes phone numbers and derives useful display names", async () => {
    mockContacts.requestPermissionsAsync.mockResolvedValue({ status: "granted" });
    mockContacts.getContactsAsync.mockResolvedValue({
      data: [
        {
          id: "1",
          name: " Ada Lovelace ",
          phoneNumbers: [{ number: "312 555 0182" }, { number: "312 555 0182" }],
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
      ],
    });
    const { loadDeviceContacts } = require("../lib/deviceContacts") as typeof import("../lib/deviceContacts");

    await expect(loadDeviceContacts()).resolves.toEqual([
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

    expect(mockContacts.getContactsAsync).toHaveBeenCalledWith({
      fields: ["phoneNumbers"],
    });
  });
});

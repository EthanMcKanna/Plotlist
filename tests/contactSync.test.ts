import { describe, expect, it } from "@jest/globals";

import { getContactSyncAlertCopy, getInviteReadyCount } from "../lib/contactSync";

describe("contact sync helpers", () => {
  it("treats a zero-entry sync as a no-op with actionable copy", () => {
    expect(
      getContactSyncAlertCopy({
        totalCount: 0,
        matchedCount: 0,
      }),
    ).toEqual({
      title: "No contacts to sync",
      message:
        "We couldn't find any phone numbers in your address book. Add a contact with a phone number and try again.",
    });
  });

  it("falls back to the legacy invitedCount field for invite-ready totals", () => {
    expect(
      getInviteReadyCount({
        totalCount: 5,
        matchedCount: 2,
        invitedCount: 3,
      }),
    ).toBe(3);
  });

  it("prefers the explicit inviteCount field when it is present", () => {
    expect(
      getInviteReadyCount({
        totalCount: 5,
        matchedCount: 2,
        inviteCount: 2,
        invitedCount: 99,
      }),
    ).toBe(2);
  });
});

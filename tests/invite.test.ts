import { describe, expect, it } from "@jest/globals";

import {
  INVITE_RESEND_COOLDOWN_MS,
  buildInviteMessage,
  buildSmsInviteUrl,
  isInviteCoolingDown,
  sanitizeSmsRecipient,
} from "../lib/invite";

describe("invite helpers", () => {
  it("sanitizes phone numbers for sms URLs", () => {
    expect(sanitizeSmsRecipient("+1 (555) 123-4567")).toBe("+15551234567");
  });

  it("builds an iOS SMS invite URL with the Plotlist link", () => {
    const url = buildSmsInviteUrl({
      phone: "+1 (555) 123-4567",
      platform: "ios",
    });

    expect(url).toBe(
      `sms:+15551234567&body=${encodeURIComponent(buildInviteMessage())}`,
    );
    expect(decodeURIComponent(url)).toContain("https://plotlist.app");
  });

  it("uses a query separator for Android SMS URLs", () => {
    expect(
      buildSmsInviteUrl({
        phone: "5551234567",
        message: "hello",
        platform: "android",
      }),
    ).toBe("sms:5551234567?body=hello");
  });

  it("detects invite cooldown windows", () => {
    const now = 2_000_000;

    expect(isInviteCoolingDown(now - 1_000, now)).toBe(true);
    expect(isInviteCoolingDown(now - INVITE_RESEND_COOLDOWN_MS - 1, now)).toBe(false);
    expect(isInviteCoolingDown(null, now)).toBe(false);
  });
});

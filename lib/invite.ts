export const PLOTLIST_INVITE_URL = "https://plotlist.app";
export const INVITE_RESEND_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function sanitizeSmsRecipient(phone: string) {
  return phone.trim().replace(/[^\d+]/g, "");
}

export function buildInviteMessage() {
  return `Join me on Plotlist. Track shows with friends: ${PLOTLIST_INVITE_URL}`;
}

export function buildSmsInviteUrl({
  phone,
  message = buildInviteMessage(),
  platform,
}: {
  phone: string;
  message?: string;
  platform: "ios" | "android" | "web" | "macos" | "windows";
}) {
  const recipient = sanitizeSmsRecipient(phone);
  const bodySeparator = platform === "ios" ? "&" : "?";
  return `sms:${recipient}${bodySeparator}body=${encodeURIComponent(message)}`;
}

export function isInviteCoolingDown(invitedAt: number | null | undefined, now = Date.now()) {
  return Boolean(invitedAt && invitedAt > now - INVITE_RESEND_COOLDOWN_MS);
}

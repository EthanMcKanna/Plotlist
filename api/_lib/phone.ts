import { createHmac } from "node:crypto";

import { getServerEnv } from "./env";

const US_COUNTRY_CODE = "1";
const APP_REVIEW_TEST_PHONE = "+15551234567";
const APP_REVIEW_TEST_CODE = "123456";

export function normalizePhoneNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
      return null;
    }
    return `+${digits}`;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+${US_COUNTRY_CODE}${digits}`;
  }
  if (digits.length === 11 && digits.startsWith(US_COUNTRY_CODE)) {
    return `+${digits}`;
  }
  return null;
}

export function isAppReviewBypassEnabled() {
  return getServerEnv().ALLOW_APP_REVIEW_OTP_BYPASS === "true";
}

export function getAppReviewPhone() {
  return getServerEnv().APP_REVIEW_TEST_PHONE ?? APP_REVIEW_TEST_PHONE;
}

export function getAppReviewCode() {
  return getServerEnv().APP_REVIEW_TEST_CODE ?? APP_REVIEW_TEST_CODE;
}

export function matchesAppReviewBypass(phoneNumber: string, code?: string) {
  if (!isAppReviewBypassEnabled()) {
    return false;
  }

  const normalizedBypassPhone = normalizePhoneNumber(getAppReviewPhone());
  if (!normalizedBypassPhone || normalizedBypassPhone !== phoneNumber) {
    return false;
  }

  if (code === undefined) {
    return true;
  }

  return code === getAppReviewCode();
}

export function hashPhoneNumber(phoneNumber: string) {
  const env = getServerEnv();
  const normalized = normalizePhoneNumber(phoneNumber);
  if (!normalized) {
    throw new Error("Invalid phone number");
  }

  return createHmac("sha256", env.CONTACT_HASH_SECRET)
    .update(normalized)
    .digest("hex");
}

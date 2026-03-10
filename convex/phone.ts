import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action } from "./_generated/server";

const US_COUNTRY_CODE = "1";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} env var`);
  }
  return value;
}

function encodeFormBody(values: Record<string, string>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    body.set(key, value);
  }
  return body.toString();
}

async function hmacSha256Hex(value: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function twilioAuthHeader() {
  const accountSid = requireEnv("TWILIO_ACCOUNT_SID");
  const authToken = requireEnv("TWILIO_AUTH_TOKEN");
  return `Basic ${btoa(`${accountSid}:${authToken}`)}`;
}

async function twilioRequest(url: string, body: Record<string, string>) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: twilioAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: encodeFormBody(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Twilio request failed: ${response.status} ${errorText}`);
  }

  return response;
}

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

export async function hashPhoneNumber(normalizedPhone: string) {
  const secret = requireEnv("CONTACT_HASH_SECRET");
  const sanitized = normalizePhoneNumber(normalizedPhone);
  if (!sanitized) {
    throw new Error("Invalid phone number");
  }
  return await hmacSha256Hex(sanitized, secret);
}

const APP_REVIEW_TEST_PHONE = "+15551234567";
const APP_REVIEW_TEST_CODE = "123456";

function isAppReviewBypassEnabled() {
  return process.env.ALLOW_APP_REVIEW_OTP_BYPASS === "true";
}

function getAppReviewPhone() {
  return process.env.APP_REVIEW_TEST_PHONE ?? APP_REVIEW_TEST_PHONE;
}

function getAppReviewCode() {
  return process.env.APP_REVIEW_TEST_CODE ?? APP_REVIEW_TEST_CODE;
}

function matchesAppReviewBypass(phoneNumber: string, code?: string) {
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

export async function sendPhoneVerificationCode(phoneNumber: string) {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) {
    throw new Error("Enter a valid phone number");
  }
  if (matchesAppReviewBypass(normalizedPhone)) {
    return;
  }
  const serviceSid = requireEnv("TWILIO_VERIFY_SERVICE_SID");
  await twilioRequest(
    `https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`,
    {
      To: normalizedPhone,
      Channel: "sms",
    },
  );
}

export async function verifyPhoneVerificationCode(
  phoneNumber: string,
  code: string,
) {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) {
    throw new Error("Enter a valid phone number");
  }

  const trimmedCode = code.trim();
  if (!trimmedCode) {
    throw new Error("Enter the verification code we sent you.");
  }

  if (matchesAppReviewBypass(normalizedPhone, trimmedCode)) {
    return true;
  }

  const serviceSid = requireEnv("TWILIO_VERIFY_SERVICE_SID");
  const response = await twilioRequest(
    `https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`,
    {
      To: normalizedPhone,
      Code: trimmedCode,
    },
  );
  const payload = (await response.json()) as { status?: string; valid?: boolean };
  return payload.valid === true || payload.status === "approved";
}

export const startVerification = action({
  args: {
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedPhone = normalizePhoneNumber(args.phone);
    if (!normalizedPhone) {
      throw new Error("Enter a valid phone number");
    }

    await ctx.runMutation(internal.rateLimit.enforce, {
      key: `phone-verification:${normalizedPhone}`,
      limit: 5,
      windowMs: 10 * 60 * 1000,
    });

    await sendPhoneVerificationCode(normalizedPhone);
    return null;
  },
});

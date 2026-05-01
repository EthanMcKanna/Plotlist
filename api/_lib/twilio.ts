import { ApiError } from "./errors";
import { getServerEnv } from "./env";
import { matchesAppReviewBypass } from "./phone";

function encodeBasicAuth(accountSid: string, authToken: string) {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

async function twilioRequest(url: string, body: Record<string, string>) {
  const env = getServerEnv();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: encodeBasicAuth(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });

  if (!response.ok) {
    throw new ApiError(
      502,
      "twilio_request_failed",
      `Twilio request failed: ${response.status}`,
      await response.text(),
    );
  }

  return response;
}

export async function sendPhoneVerificationCode(phoneNumber: string) {
  if (matchesAppReviewBypass(phoneNumber)) {
    return;
  }

  const env = getServerEnv();
  await twilioRequest(
    `https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}/Verifications`,
    {
      To: phoneNumber,
      Channel: "sms",
    },
  );
}

export async function verifyPhoneVerificationCode(phoneNumber: string, code: string) {
  if (matchesAppReviewBypass(phoneNumber, code)) {
    return true;
  }

  const env = getServerEnv();
  const response = await twilioRequest(
    `https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`,
    {
      To: phoneNumber,
      Code: code.trim(),
    },
  );

  const payload = (await response.json()) as { status?: string; valid?: boolean };
  return payload.valid === true || payload.status === "approved";
}

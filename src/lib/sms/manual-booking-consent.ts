import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { buildConsentRequest } from "../../../supabase/functions/sms-automation-run/domain";

// v2: the platform texts the link to the booking phone. v1 links were shown to
// the owner and were retired by migration 20260927091100.
export const MANUAL_BOOKING_SMS_CONSENT_VERSION = "manual-sms-v2";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function createManualBookingConsentToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashManualBookingConsentToken(token)! };
}

export function hashManualBookingConsentToken(token: string) {
  if (!TOKEN_RE.test(token)) return null;
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * The consent SMS for the guest (the text lives in the Deno domain module, C18).
 * The link opens the Georgian page because the SMS is Georgian, and it needs an
 * absolute origin: a wrong link cannot be fixed once delivered, so no origin
 * means no SMS (null).
 */
export function manualBookingConsentSms(token: string) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (!origin || !/^https?:\/\//.test(origin)) return null;
  return buildConsentRequest(`${origin}/sms-consent/${token}`);
}

export function maskConsentPhone(phone: string | null) {
  if (!phone) return null;
  return `${phone.slice(0, 4)} ••• •• ${phone.slice(-2)}`;
}

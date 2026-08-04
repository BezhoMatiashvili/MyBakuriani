import "server-only";

import { createHash, randomBytes } from "node:crypto";

export const MANUAL_BOOKING_SMS_CONSENT_VERSION = "manual-sms-v1";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function createManualBookingConsentToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashManualBookingConsentToken(token)! };
}

export function hashManualBookingConsentToken(token: string) {
  if (!TOKEN_RE.test(token)) return null;
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function manualBookingConsentUrl(token: string, locale: string) {
  const origin = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://my-bakuriani.vercel.app"
  ).replace(/\/$/, "");
  const localePrefix = locale === "ka" ? "" : `/${locale}`;
  return `${origin}${localePrefix}/sms-consent/${token}`;
}

export function maskConsentPhone(phone: string | null) {
  if (!phone) return null;
  return `${phone.slice(0, 4)} ••• •• ${phone.slice(-2)}`;
}

// Resend webhook signature check (Svix scheme), C33. Only node:crypto, so
// scripts/unit can load it straight from src/.
//
//   signed content = `${svix-id}.${svix-timestamp}.${raw body}`
//   key            = base64-decode(secret without the "whsec_" prefix)
//   header         = space-separated "v1,<base64 HMAC-SHA256>" entries
//
// A timestamp more than 5 minutes from now is rejected (replay window).
import { createHmac, timingSafeEqual } from "node:crypto";

const TOLERANCE_SECONDS = 5 * 60;

export function verifySvixSignature(input: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  nowSeconds?: number;
}): boolean {
  const { secret, id, timestamp, signature, body } = input;
  if (!secret || !id || !timestamp || !signature) return false;
  if (!/^\d{1,12}$/.test(timestamp)) return false;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest();

  return signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",", 2);
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

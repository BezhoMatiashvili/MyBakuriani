import { createHash } from "node:crypto";

// The win-back opt-out link /sms-stop/<token> (owner's technical task 2026-10-25, C18).
// sms-automation-run/opt-out.ts mints the token (16 random bytes, base64url) and stores
// only this hash; the same test vector pins both sides.
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

export function hashSmsOptOutToken(token: string) {
  if (!TOKEN_RE.test(token)) return null;
  return createHash("sha256").update(token, "utf8").digest("hex");
}

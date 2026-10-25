// Win-back opt-out tokens (owner's technical task 2026-10-25). The token travels only in
// the SMS link /sms-stop/<token>; the database keeps its SHA-256 (sms_optout_tokens), which
// src/lib/sms/opt-out.ts recomputes from the URL. Same test vector on both sides.

/** 16 random bytes as base64url: 22 characters, 128 bits. */
export function optOutToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Lower-case hex SHA-256 of the token's UTF-8 bytes. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

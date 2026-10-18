/**
 * Reads a Keepz callback body without trusting it.
 *
 * Keepz documents the callback fields but not their encoding, so JSON and
 * form-encoded bodies are both accepted. An encrypted envelope is returned
 * as-is for the route to open with our private key. Whatever comes out is only
 * used to learn WHICH order to re-check with GET /order/status — never to move
 * money (C32).
 *
 * Pure module (no imports) so scripts/unit can load it.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseCallbackFields(
  raw: string,
  contentType: string,
): Record<string, unknown> | null {
  const text = raw.trim();
  if (!text) return null;

  const mediaType = contentType.split(";")[0].trim().toLowerCase();
  const looksLikeForm = !text.startsWith("{") && text.includes("=");
  if (mediaType === "application/x-www-form-urlencoded" || looksLikeForm) {
    const seen = new Set<string>();
    const entries: [string, string][] = [];
    for (const [key, value] of new URLSearchParams(text)) {
      if (seen.has(key)) continue; // first occurrence wins
      seen.add(key);
      // A sender that did not percent-encode base64 loses its "+" to the
      // form decoding ("+" means space); base64 never contains spaces.
      entries.push([
        key,
        key === "encryptedData" || key === "encryptedKeys"
          ? value.replaceAll(" ", "+")
          : value,
      ]);
    }
    // fromEntries defines own properties, so "__proto__" cannot pollute.
    return entries.length ? Object.fromEntries(entries) : null;
  }

  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** The order id the callback names, when it is a canonical UUID. */
export function callbackOrderId(
  fields: Record<string, unknown> | null,
): string | null {
  const value = fields?.integratorOrderId;
  return typeof value === "string" && UUID_RE.test(value)
    ? value.toLowerCase()
    : null;
}

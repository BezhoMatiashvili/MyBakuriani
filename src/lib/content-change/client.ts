import type { ContentChangeTarget } from "@/lib/content-change/fields";

export async function submitContentChange(
  targetType: ContentChangeTarget,
  targetId: string,
  proposedValues: Record<string, unknown>,
) {
  const response = await fetch("/api/content-change-requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ targetType, targetId, proposedValues }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    request?: { id: string };
  };
  if (!response.ok) throw new Error(payload.error ?? "failed");
  return payload.request;
}

// API error codes a user can act on. Anything else (a schema mismatch, a 500) is a
// bug rather than user input, so it maps to the generic message and is logged.
const USER_FACING_CODES = new Set([
  "target_locked",
  "no_changes",
  "forbidden_or_not_found",
  "unauthenticated",
]);

/** True when the rejection carries a user-actionable content-change code. */
export function isContentChangeError(cause: unknown): boolean {
  return cause instanceof Error && USER_FACING_CODES.has(cause.message);
}

/**
 * Maps a `submitContentChange` rejection to a `CreateShared.contentChange.*` key,
 * so callers render Georgian copy instead of the raw machine code.
 */
export function contentChangeErrorKey(cause: unknown): string {
  const code = cause instanceof Error ? cause.message : "";
  if (USER_FACING_CODES.has(code)) return `contentChange.${code}`;
  if (code) console.error("[content-change] unexpected error code:", code);
  return "contentChange.failed";
}

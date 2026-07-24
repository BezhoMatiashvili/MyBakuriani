/**
 * Turn an unknown thrown value into a user-facing message, and always log the
 * raw value to the console for diagnosis.
 *
 * supabase-js rejects with PostgrestError / StorageError / FunctionsError
 * objects that are NOT `Error` instances, so the common
 * `err instanceof Error ? err.message : fallback` pattern silently collapsed
 * every DB/RLS/trigger failure to a generic string (this is exactly why a
 * production 403 on listing publish was invisible to both users and devs).
 * This helper handles those object-shaped errors and guarantees the real error
 * is printed to the console every time.
 */
export function formatSupabaseError(err: unknown, fallback: string): string {
  console.error("[submit] operation failed:", err);
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

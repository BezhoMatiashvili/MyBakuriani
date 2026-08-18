import "server-only";
import { createClient as createJsClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { timeoutFetch } from "@/lib/with-timeout";

// Bumped from 8_000: live traffic showed some requests succeeding at ~6-8s and
// others timing out right at the old boundary, consistent with occasional
// cross-region connection-establishment latency to the Supabase project.
// Kept conservatively under a 10s serverless function execution cap.
const ADMIN_FETCH_TIMEOUT_MS = 9_500;

let cached: ReturnType<typeof createJsClient<Database>> | null = null;

/**
 * Service-role Supabase client for server-only use. Bypasses RLS — never expose
 * to the browser, never import from client components.
 *
 * Pass `actorId` (the acting admin's user id) from mutating admin routes: it is
 * sent as an `x-actor-id` header, which the audit_row_change() DB trigger records
 * as the actor of service-role writes (audit_logs.actor_source = 'admin').
 */
export function createServiceClient(actorId?: string) {
  if (!actorId && cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL missing in env. " +
        "Tip: if these variables are exported as empty in the shell, they will " +
        "shadow .env.local — `unset SUPABASE_SERVICE_ROLE_KEY` before `npm run dev`.",
    );
  }
  if (actorId) {
    // Per-request header → never cache this client.
    return createJsClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: timeoutFetch(ADMIN_FETCH_TIMEOUT_MS),
        headers: { "x-actor-id": actorId },
      },
    });
  }
  cached = createJsClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: timeoutFetch(ADMIN_FETCH_TIMEOUT_MS) },
  });
  return cached;
}

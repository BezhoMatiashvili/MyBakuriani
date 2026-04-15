import { createClient as createJsClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

let cached: ReturnType<typeof createJsClient<Database>> | null = null;

/**
 * Service-role Supabase client for server-only use. Bypasses RLS — never expose
 * to the browser, never import from client components.
 */
export function createServiceClient() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL missing in env. " +
        "Tip: if these variables are exported as empty in the shell, they will " +
        "shadow .env.local — `unset SUPABASE_SERVICE_ROLE_KEY` before `npm run dev`.",
    );
  }
  cached = createJsClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

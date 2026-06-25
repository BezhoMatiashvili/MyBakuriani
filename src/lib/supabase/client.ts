import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";
import { timeoutFetch } from "@/lib/with-timeout";

const BROWSER_FETCH_TIMEOUT_MS = 10_000;

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: timeoutFetch(BROWSER_FETCH_TIMEOUT_MS) } },
  );
}

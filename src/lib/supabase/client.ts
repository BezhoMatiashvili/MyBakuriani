import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";
import { timeoutFetch } from "@/lib/with-timeout";

const BROWSER_FETCH_TIMEOUT_MS = 10_000;

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: timeoutFetch(BROWSER_FETCH_TIMEOUT_MS) },
      cookieOptions: {
        // No domain attribute: sessions are host-only and cannot leak to a
        // sibling subdomain. The browser client needs readable refresh cookies.
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    },
  );
}

// Photo/file uploads stream multiple megabytes, which can legitimately take far
// longer than the aggressive 10s anti-hang budget tuned for reads. A separate
// client with a generous timeout keeps uploads from being aborted mid-flight
// (the cause of "submit" failures when photos were stored inline). Auth/session
// is shared via cookies, so Storage RLS (`auth.uid()`) still applies.
const UPLOAD_FETCH_TIMEOUT_MS = 60_000;

export function createUploadClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: timeoutFetch(UPLOAD_FETCH_TIMEOUT_MS) },
      cookieOptions: {
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    },
  );
}

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const email = process.env.ADMIN_TEST_EMAIL!;
  const password = process.env.ADMIN_TEST_PASSWORD!;
  const supa = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await supa.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    console.error(error);
    process.exit(1);
  }
  const s = data.session;
  const projectRef = new URL(url).hostname.split(".")[0];
  const payload = JSON.stringify({
    access_token: s.access_token,
    token_type: s.token_type,
    expires_in: s.expires_in,
    expires_at: s.expires_at,
    refresh_token: s.refresh_token,
    user: s.user,
  });
  const val = `base64-${Buffer.from(payload).toString("base64")}`;
  process.stdout.write(`sb-${projectRef}-auth-token=${val}`);
}
main();

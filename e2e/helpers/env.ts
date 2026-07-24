const PRODUCTION_HOSTS = new Set([
  "mybakuriani.ge",
  "www.mybakuriani.ge",
  "my-bakuriani.vercel.app",
]);
const PRODUCTION_PROJECT_REFS = new Set(["yuwyrmxccrpfjvidwhhg"]);

function requireTestEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `E2E requires ${name}; .env.local is intentionally never loaded`,
    );
  }
  return value;
}

function assertSafeTestUrl(value: string, name: string, supabase = false) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  const host = url.hostname.toLowerCase();
  if (PRODUCTION_HOSTS.has(host) || host.endsWith(".mybakuriani.ge")) {
    throw new Error(`${name} points at a production domain`);
  }
  if (supabase && PRODUCTION_PROJECT_REFS.has(host.split(".")[0])) {
    throw new Error(`${name} points at the production Supabase project`);
  }
}

/** Maps isolated TEST_* secrets into the names used by the app process. */
export function configureIsolatedE2E() {
  const supabaseUrl = requireTestEnv("TEST_SUPABASE_URL");
  const anonKey = requireTestEnv("TEST_SUPABASE_ANON_KEY");
  const serviceRoleKey = requireTestEnv("TEST_SUPABASE_SERVICE_ROLE_KEY");
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  assertSafeTestUrl(supabaseUrl, "TEST_SUPABASE_URL", true);
  assertSafeTestUrl(baseUrl, "E2E_BASE_URL");

  process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
  process.env.NEXT_PUBLIC_SITE_URL = baseUrl;
  return { baseUrl, supabaseUrl, anonKey, serviceRoleKey };
}

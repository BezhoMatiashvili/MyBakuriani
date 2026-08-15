# Production security release checklist

Source changes alone cannot configure Supabase Auth, Vercel, DNS, Cloudflare,
Upstash, or GitHub. Do not deploy the accompanying migration until every item
below has an owner and evidence recorded in the release ticket.

2026-08-15 status: the live database/storage migrations are applied and all 18
repository Edge Functions were redeployed with their explicit JWT settings and
shared-guard updates. The Next.js changes pass a full production build and
localhost browser smoke test and are included in the direct-to-main release.
The remaining
manual release gates are Supabase Auth leaked-password protection / authoritative
12-character minimum, CAPTCHA/Turnstile where desired, WAF/branch controls, and
an isolated non-production E2E project. See `SECURITY_AUDIT.md` for evidence and
the controlled Supabase-advisor exceptions.

- Snapshot the database schema, RLS policies, grants, functions, storage
  policies, Auth configuration, and pending payment rows. Apply
  `20260723000000_production_security_remediation.sql` to staging first, then
  run anonymous/user/admin-AAL1/admin-AAL2 adversarial checks.
- Keep `https://my-bakuriani.vercel.app` as the only canonical origin for this
  release. Do **not** add `mybakuriani.ge` or `www` to redirects, Supabase Auth,
  CSP, CORS, or `NEXT_PUBLIC_SITE_URL` until both certificates are valid. Run a
  separate cutover checklist for that domain after TLS, redirect, Auth URL, CSP,
  and CORS verification succeeds.
- Rotate the exposed Vercel credential, inspect its audit log for use, and
  record the incident decision in the release ticket. `.env.local` must remain
  owner-only (`0600`); `npm run security:secrets` is a required release gate.
- In Supabase Auth enable CAPTCHA (Turnstile), leaked-password protection,
  12-character passwords, generic auth responses, and mandatory TOTP AAL2 for
  administrators. Enforce AAL2 in every admin Edge function before deploying.
- In Vercel Production, set `ALLOWED_ORIGINS` to exact canonical, preview-test,
  and localhost origins (no wildcards, paths, or trailing slashes). Set
  `SMS_AUTOMATION_RUN_SECRET` and rotate no historical test key without a
  separately approved incident decision.
  For this release, the canonical entry is
  `https://my-bakuriani.vercel.app`; add a preview only as its full deployment
  origin and use `http://localhost:3000` locally. Do not use a Vercel wildcard.
- Distributed rate limiting is satisfied by the Postgres-backed limiter
  (`consume_rate_limit`), which is always available — the repository's in-memory
  limits remain a development-only fallback and are still not a production
  control. `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are an optional
  upgrade that moves the shared store to Redis with no code change.
  **Do not make these four variables required again**: that failed the
  production build, and the fail-closed handling behind them had already taken
  every rate-limited route (phone reveal, geocode, photo-upload intents, job
  applications, view/analytics beacons) offline in production.
- Turnstile server verification on anonymous contact reveals is enforced only
  when `TURNSTILE_SECRET_KEY` is present. Setting it (plus
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` for the widget) is an outstanding hardening
  item: until then reveals are IP-rate-limited but unchallenged, so a
  distributed scraper is only bounded per source address.
- Configure Vercel WAF.
- Create a fresh isolated E2E Supabase project and preview deployment. Provide
  only `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, and
  `TEST_SUPABASE_SERVICE_ROLE_KEY`; the suite rejects the known production ref
  and production domains. Retire and pause the old test project after proving
  it contains no production data.
- Protect `main` with PRs, approval, required build/security checks, no force
  pushes, CodeQL, Dependabot, secret scanning and push protection. Pin all
  GitHub Action revisions.
- Deploy the Cloud Run scanner (service-identity authentication, ClamAV and
  byte-signature validation) and prove every legacy asset has been rescanned
  before the final browser-Storage policy revocation. Upload intents must have
  an atomic pending → scanning → approved/rejected lifecycle; only approved
  derivatives may be public and CV downloads remain authorized/signed only.

The production audit currently has no high/critical findings. Three moderate
transitive findings remain in the optional `@google/genai` MCP stack; keep it
outside request paths or upgrade it once its upstream publishes a compatible
fix.

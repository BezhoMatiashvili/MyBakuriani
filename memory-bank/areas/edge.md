# Area: edge

Supabase Edge Functions (Deno) — money, booking, search, and scheduled jobs that
run outside Next.js.

## Roots (`supabase/functions/`)

- Money/booking: `booking-create`, `booking-manage`, `booking-finalize`,
  `balance-topup`, `purchase-vip`, `payment-create`, `payment-process`,
  `company-subscription`.
- Discovery: `search`, `smart-match`.
- Media/admin: `upload-photos`, `verify-listing`, `admin-stats`.
- Scheduled/SMS: `sms-dispatch`, `sms-automation-run`, `vip-lifecycle` (pg_cron via
  `net.http_post`, shared-secret gated, no client `invoke` caller; deploy
  `verify_jwt=false`). `road-condition-refresh` was retired on 2026-07-25 — the
  landing road badge now routes on OpenStreetMap inline from
  `src/lib/road-condition/server.ts`, no edge function, table or cron involved.
- `_shared/guards.ts` — `requireUser` (Bearer auth), `createServiceClient`,
  `buildCorsHeaders` (exact origin allow-list via `ALLOWED_ORIGINS`/`APP_ORIGIN`),
  `ApiError`.
- `_shared/secrets.ts` — SHA-256 + timing-safe equality for the four scheduled
  functions' Bearer secrets. Never replace it with ordinary string equality.
- `_shared/sanitize.ts` — input sanitizing.

## Responsibilities

- Enforce auth per request via `guards.requireUser` (Bearer token, **not** cookies).
- Run privileged writes with the service-role client; correctness backstopped by DB
  RPCs and RLS.

## Blast radius

- The function **directory name is the public deploy slug**. Renaming it breaks
  every `functions.invoke("<name>")` caller (**C4**) — grep the slug before
  renaming.
- Request/response body shape is untyped across the wire — change both sides
  together (**C4**).
- Functions call DB RPCs and read tables — subject to schema truth (**C3**).
- `upload-photos` writes the `property-photos` bucket (**C5**).
- `sms-automation-run/domain.ts` is also imported by the renter SMS Center so its win-back preview
  uses the production builder. Keep that module free of Deno-only globals and side effects; changes
  must pass both the Deno domain tests and the Next production build (**C18**).
- `booking-finalize`, `sms-automation-run`, `sms-dispatch`, and `vip-lifecycle`
  deploy `verify_jwt=false` because pg_cron authenticates with separate secrets.
  Deploy `_shared/secrets.ts` with each. Live versions on 2026-08-18 are v15,
  v18, v16, and v19 respectively; all corresponding cron jobs are active and
  their latest runs succeeded.
- Deployed separately from the app host (`npx supabase functions deploy <name>`);
  a code change here does **not** ship with a `git push` to main, whether the app
  is on DigitalOcean (current, since 2026-09-05) or the earlier Vercel setup.

## Contracts touching this area

C3 (RPCs/tables), C4 (invoke wire), C5 (bucket writes).

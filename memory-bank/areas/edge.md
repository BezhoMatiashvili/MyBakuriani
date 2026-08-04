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
  `buildCorsHeaders` (origin allow-list via `ALLOWED_ORIGINS` + hardcoded
  `*-bezhomatiashvilis-projects.vercel.app` suffix for Vercel deploy URLs),
  `ApiError`.
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
- Deployed separately from Vercel (`npx supabase functions deploy <name>`); a code
  change here does **not** ship with a `git push` to main.

## Contracts touching this area

C3 (RPCs/tables), C4 (invoke wire), C5 (bucket writes).

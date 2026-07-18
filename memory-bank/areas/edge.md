# Area: edge

Supabase Edge Functions (Deno) — money, booking, search, and scheduled jobs that
run outside Next.js.

## Roots (`supabase/functions/`)

- Money/booking: `booking-create`, `booking-manage`, `booking-finalize`,
  `balance-topup`, `purchase-vip`, `payment-create`, `payment-process`,
  `company-subscription`.
- Discovery: `search`, `smart-match`.
- Media/admin: `upload-photos`, `verify-listing`, `admin-stats`.
- Scheduled/SMS: `sms-dispatch`, `sms-automation-run`, `vip-lifecycle`.
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
- Deployed separately from Vercel (`npx supabase functions deploy <name>`); a code
  change here does **not** ship with a `git push` to main.

## Contracts touching this area

C3 (RPCs/tables), C4 (invoke wire), C5 (bucket writes).

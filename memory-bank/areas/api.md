# Area: api

Next.js route handlers and server actions — the in-app server backend (distinct
from Deno edge functions; see `edge.md`).

## Roots

- `src/app/api/**/route.ts` — ~45 handlers. Heavily `admin/*` (ads, banners, blog,
  broadcasts, clients, companies, finances, listings, logs, media, pricing,
  promocodes, reviews, search (global topbar entity search: profiles/properties/
  services/organizations, consumed by `AdminTopbar`), sms, stats, status-cards,
  verifications, zones). Public/
  utility: `banners`, `contact/track`, `geocode`, `menu/track`, `pricing-packages`,
  `sms/*`, `zones`.
- `src/app/actions/` — server actions (`revalidateListing.ts`).

## Responsibilities

- Server-side mutations and admin operations gated by `lib/auth` helpers.
- Excluded from the i18n middleware matcher (`(?!api|…)`), so these run without
  locale rewriting.
- Use `lib/supabase/server` or `admin` (service role) clients.

## Blast radius

- Admin handlers must gate with `src/lib/auth/require-admin.ts:requireAdmin`
  (**C8**); an
  unguarded handler is a privilege hole RLS may or may not backstop.
- Handlers query tables typed by `database.ts` (**C3**).
- `geocode`, `contact/track`, `menu/track` may hit external services → CSP
  `connect-src` (**C6**).

## Contracts touching this area

C3 (types), C6 (external calls), C8 (admin gating).

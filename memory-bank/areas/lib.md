# Area: lib

Shared client/server logic — the seam between UI and Supabase.

## Roots (`src/lib/`)

- `supabase/` — client factories: `client.ts` (browser, 10s + 60s upload timeout),
  `server.ts` (RSC, 9.5s), `admin.ts` (`createServiceClient`, service role),
  `middleware.ts` (`updateSession` — session refresh + login redirect).
- `types/database.ts` — **generated** DB types (do not hand-edit; see **C3**).
- `hooks/` — `useAuth`, `useProfile`, `useBalance`, `useBookings`, `useProperties`,
  `useNotifications`, `useRealtime`, `useSmartMatch`, `useFavorite`, `useStatsFilter`.
- `auth/` — `current-user` (`getCurrentUser`/`getCurrentProfile`),
  `verified-session-user` (signed-claim-only retry identity), `require-admin`,
  `is-admin-viewer`.
- `data/` — cached server fetchers (`getPropertyById`, `getServiceById`,
  `getCachedPublicListing`).
- `constants/`, `utils/`, plus domain modules: `smart-match/`, `zones/`, `sms/`,
  `payments/`, `notifications/`, `status-cards/`, `pricing-packages`, `banners`,
  `analytics/pageview`, `seo`, `rateLimit`, `with-timeout`.

## Responsibilities

- Own the Supabase client configuration (timeouts, cookie handling, `<Database>`
  typing) so callers never construct raw clients.
- Data-access helpers wrap queries with caching + `with-timeout`.
- `analytics/pageview.ts` is the shared public-route normalizer for page-view
  beacons; client and server must use the same allow-list (**C16**).

## Blast radius

- Every Supabase client is typed `createClient<Database>()` — a stale
  `database.ts` mis-types all of them (**C3**).
- `useRealtime` / `useNotifications` are the subscriber half of **C7**.
- Auth helpers are the server-side half of **C8**.
- `admin.ts`, `server.ts`, Gemini, Turnstile, weather, and SMS feature config are
  explicit `server-only` boundaries. Do not remove those imports: they are the
  compile-time tripwire against bundling service/provider secrets or QA ids.
- Changing a client timeout affects hang behavior app-wide (tuned to serverless
  execution caps — see comments in `server.ts`).

## Contracts touching this area

C3 (generated types + clients), C7 (realtime hooks), C8 (auth helpers), C16
(page-view normalization and rate limiting).

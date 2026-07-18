# Cross-cutting contracts

Invariants held together by **string keys, generated code, or wire shapes** — the
couplings a call-graph / "find references" tool cannot see. Each is a
_change-one-side → must-change-the-other_. Before editing any symbol below, read
its section and grep the symbol repo-wide.

Anchor grammar: `` `‹relpath›.‹ext›:‹symbol›` `` (a real one looks like
`src/i18n/routing.ts:routing`) — validated by
`python3 scripts/gen_code_map.py --check` (file exists AND symbol string present).
Keep anchors in this format so the check keeps working.

---

## C1 — i18n key parity & namespace scoping

**Invariant:** the three catalogs `messages/ka.json`, `messages/en.json`,
`messages/ru.json` must have identical key sets, and every message namespace
reachable from a **public client component** must be listed in
`PUBLIC_NAMESPACES`.

Participating symbols:

- `src/i18n/namespaces.ts:PUBLIC_NAMESPACES` — the allow-list shipped to public browsers
- `src/i18n/namespaces.ts:pickMessages` — trims the bundle to that list
- `messages/ka.json:Navbar` — default-locale catalog (top-level keys are namespaces)
- `scripts/i18n-scope.mjs:PUBLIC_NAMESPACES` — build guard (`--check`, wired as `prebuild`)
- `scripts/check-message-parity.mjs:flatten` — key-parity check across the 3 files

**Also check:** `src/app/[locale]/layout.tsx` (public provider) and any
`dashboard/**/layout.tsx` (full-bundle provider); a new user-facing string needs a
key in **all three** catalogs.

**Breaks silently when:** you add a key to `ka.json` only (other locales render the
key name), or a public client component starts using a namespace not in
`PUBLIC_NAMESPACES` (missing translations in prod; `prebuild` catches it locally).

---

## C2 — Locale set

**Invariant:** the supported-locale list lives in one place and is echoed by the
middleware prefix-strip loop, the per-locale message import, and the navigation
helpers. Adding/removing a locale touches all of them **plus** a matching catalog
file.

Participating symbols:

- `src/i18n/routing.ts:routing` — `locales`, `defaultLocale`, `localePrefix`
- `src/i18n/routing.ts:AppLocale` — derived union type used across the app
- `src/i18n/request.ts:getRequestConfig` — dynamic `import(messages/${locale}.json)`
- `src/middleware.ts:intlMiddleware` — strips `/${locale}` prefixes by reducing over `routing.locales`
- `src/i18n/navigation.ts` — locale-aware `Link`/`redirect`/`useRouter`

**Also check:** a `messages/<locale>.json` file must exist for every locale in
`routing.locales`.

**Breaks silently when:** you add a locale to `routing.locales` without adding
`messages/<locale>.json` → the dynamic import throws at request time only.

---

## C3 — DB schema ↔ generated types

**Invariant:** `supabase/migrations/*.sql` are the source of truth; every table,
column, enum, and RPC signature is mirrored in the **generated** file
`src/lib/types/database.ts`, which is consumed everywhere via the `Database`
generic. A migration that is not followed by a types regen is a silent type lie.

Participating symbols:

- `supabase/migrations/001_initial_schema.sql:user_role` — base schema + the 10-value role enum
- `src/lib/types/database.ts:Database` — generated type consumed by every Supabase client
- `src/lib/types/database.ts:user_role` — the role enum mirrored in TS (guest…admin)
- `src/lib/supabase/server.ts:createClient` / `src/lib/supabase/client.ts:createClient` — `createClient<Database>()`
- `src/lib/supabase/admin.ts:createServiceClient` — service-role client

**Regen command:** `npx supabase gen types typescript --project-id <id> > src/lib/types/database.ts`
(see `CLAUDE.md`).

**Also check:** RPC signatures called from edge functions (**C4**) and API routes;
every consumer of the `user_role` enum (**C8**). After regen, run `tsc` — new
required columns / changed arg lists surface as errors at call sites.

**Breaks silently when:** a migration adds/renames a column or changes an RPC arg
list but `database.ts` is stale → TS compiles against a schema that no longer
exists; failures surface only at query time.

---

## C4 — Client ↔ Edge Function wire contract

**Invariant:** `supabase.functions.invoke("<name>", { body })` couples a **bare
string** function name and an **untyped** body to a Deno handler under
`supabase/functions/<name>/`. Neither the name nor the body shape is type-checked.

Participating symbols (name → caller):

- `supabase/functions/purchase-vip/index.ts:serve` ← `src/app/[locale]/dashboard/seller/SellerDashboardClient.tsx` (+ renter/food dashboards)
- `supabase/functions/payment-process/index.ts:serve` ← `src/components/payments/CheckoutClient.tsx`
- `supabase/functions/company-subscription/index.ts:serve` ← `src/app/[locale]/dashboard/seller/organizations/[id]/page.tsx`
- `supabase/functions/_shared/guards.ts:requireUser` — every function auths the Bearer token here
- `supabase/functions/_shared/guards.ts:buildCorsHeaders` — origin allow-list (env `ALLOWED_ORIGINS`) **plus** a hardcoded Vercel-team suffix: any `https://*-bezhomatiashvilis-projects.vercel.app` origin is reflected (deployment/preview URLs have per-deploy hashes, so they can't be exact-listed)

**Also check:** renaming a function directory changes the deploy slug; the
`invoke("…")` string must change in lock-step. Edge functions in turn call DB RPCs
(subject to C3). `_shared/guards.ts` is **bundled at deploy time** — editing it
does nothing until every function that imports it is redeployed (14 of them;
`search` and `upload-photos` don't use `buildCorsHeaders`). Deployed functions
have per-function file layouts and `verify_jwt` flags — preserve both when
redeploying via MCP `deploy_edge_function`.

**Breaks silently when:** a body field is renamed on one side only → runtime 400 /
missing field, no compile error.

---

## C5 — Storage bucket names

**Invariant:** a storage bucket id is a string literal that must agree across the
upload code, the bucket-creation migration + its RLS, and the image/CSP allow-list.
Buckets in use: `property-photos`, `avatars`, `landing-media`, `restaurant-menus`.

Participating symbols:

- `src/components/forms/PhotoUploader.tsx:PhotoUploader` — client upload to `property-photos`
- `supabase/functions/upload-photos/index.ts:serve` — server-side write to `property-photos`
- `supabase/migrations/20260518120000_landing_media_bucket_and_video_columns.sql:storage` — bucket + policies for `landing-media`
- `supabase/migrations/20260528120000_restaurant_menus_bucket.sql:storage` — `restaurant-menus` bucket
- `supabase/migrations/20260424120100_avatars_bucket.sql:storage` — `avatars` bucket
- `next.config.ts:remotePatterns` — `<Image>` host allow-list (Supabase public objects)

**Also check:** `next.config.ts:CSP` `img-src`/`media-src` must include the object
host, and RLS on `storage.objects` must scope the new bucket.

**Breaks silently when:** a bucket is renamed in code but not in the
migration/RLS/remotePatterns → upload 403, or `<Image>` blocked, or CSP violation —
each surfaces independently at runtime.

---

## C6 — CSP & external origins

**Invariant:** every external host the app talks to (image, API/websocket, media,
map tiles) must be listed **both** in the CSP directive and, for images, in
`images.remotePatterns`. There is no build error for a missing host — only a
runtime block.

Participating symbols:

- `next.config.ts:CSP` — `img-src` / `connect-src` / `media-src` / `font-src` directives
- `next.config.ts:remotePatterns` — Next image optimizer host allow-list
- `next.config.ts:securityHeaders` — array that ships the CSP header

Current external hosts: `*.supabase.co` (+ `wss://`), `images.unsplash.com`,
`*.basemaps.cartocdn.com` (Leaflet/CARTO tiles).

**Also check:** put the host in the directive it's actually used from — `img-src`
for images, `connect-src` for fetch/websocket, `media-src` for video/audio,
`font-src` for web fonts — and (images only) mirror it in `remotePatterns`.

**Breaks silently when:** you add a new image CDN, analytics endpoint, or tile
provider and update only one of {CSP, remotePatterns} → images 404 through the
optimizer or the fetch is CSP-blocked, visible only in the browser console.

---

## C7 — Realtime publication coverage

**Invariant:** a client `postgres_changes` subscription (`supabase.channel(...)`)
only receives events if its table is a member of the `supabase_realtime`
publication. Dashboard subscriptions exist for bookings, notifications,
smart-match, messages, etc.

Participating symbols:

- `supabase/migrations/20260610120000_realtime_publication_coverage.sql:supabase_realtime` — `ALTER PUBLICATION … ADD TABLE` (guarded, additive)
- `src/lib/hooks/useRealtime.ts` — shared subscription hook
- `src/lib/hooks/useNotifications.ts:useNotifications` — a representative consumer

**Also check:** RLS on the subscribed table must permit `SELECT` for the
subscribing user, or rows are filtered out even when the publication is correct.

**Breaks silently when:** a new dashboard subscribes to a table not yet in
`supabase_realtime` → the channel connects but **no events ever arrive**; nothing
errors.

---

## C8 — Protected-route gating (roles)

**Invariant:** the `/create/*` and `/dashboard/*` route trees are auth-gated in the
middleware; server-side admin gating uses the auth helpers; the DB enforces the
same via RLS keyed on the `user_role` enum (see C3). A new protected surface must
be added on the side(s) that guard it.

Participating symbols:

- `src/middleware.ts:intlMiddleware` — `isProtected` = path starts with `/create` or `/dashboard`
- `src/lib/supabase/middleware.ts:updateSession` — session refresh + redirect to login
- `src/lib/auth/require-admin.ts:requireAdmin` — server-side admin gate for API routes / pages
- `src/lib/auth/is-admin-viewer.ts:isAdminViewer` — read-only admin check
- `supabase/functions/_shared/guards.ts:requireUser` — edge-side Bearer auth

**Also check:** a protected page still needs RLS on the tables it reads —
middleware gates the _route_, RLS gates the _data_. A gated page whose tables lack
RLS still leaks via a direct API/query call that never hits the middleware.

**Breaks silently when:** a new top-level protected segment (e.g. `/studio`) is
added but the middleware `isProtected` prefixes aren't updated → the page renders
for anonymous users; only RLS (if present) stops data access.

---

## C9 — Favorites dual-reference pattern

**Invariant:** `public.favorites` rows reference **either** a property **or** a
service — `property_id` and `service_id` are both nullable FKs, with exactly one
non-null enforced by the `favorites_exactly_one_ref` check constraint. Any code
that reads or writes `favorites` must handle both columns; there is no unified
`listings` table (same "properties + services, no listings table" model
documented for other tables — see the trigger-branching pattern in **C8**'s
neighbor migrations).

Participating symbols:

- `supabase/migrations/20260424120000_favorites.sql:favorites_exactly_one_ref` — the check constraint
- `src/lib/hooks/useFavorite.ts:useFavorite` — takes `{ propertyId }` or `{ serviceId }`, branches the column name once and reuses it for select/insert/delete
- `src/lib/favorites/store.ts:ensureFavoritesLoaded` — shared per-user store; selects both `property_id, service_id` and merges them into one id `Set` (properties and services generate independent UUIDs, so no collision risk)
- `src/app/[locale]/dashboard/guest/favorites/page.tsx` — reference consumer that already splits results into property vs. service favorites correctly
- `supabase/migrations/20260614000000_owner_dashboard_stats.sql` — DB-side reference for the same branching pattern (counts favorites via `f.property_id in (...) or f.service_id in (...)`)

**Also check:** the seller-scoped dashboard-stats RPC is intentionally
properties-only (it's scoped to property sellers, not service owners) — that is
not an instance of this bug, don't "fix" it to branch over services.

**Breaks silently when:** a new favorites read/write path is added that only
selects/writes `property_id` — exactly the bug this contract exists to prevent.
Any new service-favorite call site must copy `useFavorite`'s branching, not
`PropertyCard`'s pre-fix, property-only pattern.

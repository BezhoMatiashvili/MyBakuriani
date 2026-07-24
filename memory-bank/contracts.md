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

Not every function is client-invoked: the scheduled jobs (`vip-lifecycle`,
`sms-dispatch`, `booking-finalize`, `road-condition-refresh`) have **no `invoke`
caller** — they are triggered by pg_cron via `net.http_post` (see the
`supabase/migrations/*schedule*.sql` files) and gated by a per-function **shared
secret** (their own `requireSharedSecret` comparing the Bearer to
`<NAME>_SECRET`), deployed `verify_jwt=false`. `road-condition-refresh` also calls
the external `routes.googleapis.com` **server-side** (Deno), so it needs no CSP /
`remotePatterns` entry (**C6** governs only browser + Next-image-optimizer hosts).

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
- `supabase/migrations/20260518120000_landing_media_bucket_and_video_columns.sql:storage` — bucket + policies for `landing-media`; allowed mimes now also include `image/gif` (`20260721170000_landing_media_allow_gif.sql`) — the mime list is mirrored in `src/components/forms/MediaUploader.tsx:ACCEPT_TYPES` and `src/app/api/admin/media/sign-upload/route.ts:IMAGE_TYPES`, all three must agree
- `src/app/api/admin/media/sign-upload/route.ts:ALLOWED_KINDS` — upload subfolders of `landing-media`: `banner`, `blog`, `ads` (ads = admin B2B ad banners from the moderation page)
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

---

## C10 — Discount badge duration & expiry

**Invariant:** `properties.discount_percent` and `properties.discount_expires_at`
are written **only** by `purchase_package`'s `discount` tier branch (mirroring how
`is_vip`/`vip_expires_at` work), guarded against direct writes by
`prevent_listing_protected_field_change`, and cleared on expiry by `vip-lifecycle`
— the same three-sided pattern as VIP itself. The percentage itself is
**buyer-chosen at purchase time** (1-90, validated server-side in the RPC) via
`p_discount_percent`, passed from `VipPropertyPickerModal`'s percent stepper
through `purchase-vip`'s edge function to the RPC — it is no longer a hardcoded
`10`. Since `20260721110000_purchase_package_service_targets.sql`, the RPC takes
`p_service_id` too: a VIP-category package must target **exactly one** of an owned
property or an owned service, and the discount/VIP/super-VIP branches write the
same columns on whichever table was targeted (`discount_percent`/
`discount_expires_at` exist on both tables). `vip-lifecycle`'s
`clearExpiredDiscounts` sweep likewise iterates both listing tables, so
service-side discounts expire the same way property ones do. The discount is no longer
purely cosmetic: `create_booking` (`20260719130000_create_booking_apply_discount.sql`,
superseding `20260628120000_create_booking_inclusive_days.sql`'s pricing) now reads
`discount_percent`/`discount_expires_at` server-side to reduce the booking's
`total_price`, and `PropertyCard`/`SalePropertyCard`/`BookingSidebar`/
`SaleDetailClient` apply the same percentage to displayed prices client-side via
the new `isDiscountActive`/`applyDiscount` helpers in `src/lib/utils/pricing.ts`.

Participating symbols:

- `supabase/migrations/20260721110000_purchase_package_service_targets.sql:purchase_package` — CURRENT body: 6-arg signature with `p_service_id`; drops both prior overloads first (`CREATE OR REPLACE` only replaces an identical signature — adding a param creates a second overload, not a replacement; same trap the earlier `20260719095704_discount_percent_choice_drop_old_overload.sql` existed for). `discount` tier branch validates `p_discount_percent` is `[1,90]` and sets `discount_percent`/`discount_expires_at` on the targeted table (supersedes the property-only version in `20260719095438_discount_percent_choice.sql`)
- `supabase/migrations/20260719120000_fix_discount_badge_duration.sql:prevent_listing_protected_field_change` — guards `discount_expires_at` (alongside `discount_percent`) as writable only via the RPC/service role (current trigger BODY now lives in `20260719140000_org_auto_link_sale_listings.sql`, which re-declares it verbatim + an owner org-attach exception — see **C11**; discount-field guarding is unchanged)
- `supabase/functions/purchase-vip/index.ts:serve` — validates `discount_percent` from the request body ([1,90] or null) and forwards it as `p_discount_percent`
- `src/components/renter/VipPropertyPickerModal.tsx:VipPropertyPickerModal` — renders the percent stepper (only when `tier === "discount"`) and passes the chosen value through `onConfirm`; the percent can also be derived from a typed target price (second, synced "ახალი ფასი" field — shown only when the caller supplies `PickerProperty.price`, i.e. `is_for_sale ? sale_price : price_per_night`; rounds to nearest whole percent and snaps the price on blur). Client-side sugar only — the wire contract still carries just the integer percent
- `src/components/balance/PropertyBalanceClient.tsx:handleConfirmPurchase` — forwards `discountPercent` into the `purchase-vip` invoke body
- `supabase/functions/vip-lifecycle/index.ts:clearExpiredDiscounts` — per-table sweep over `properties` AND `services`: zeroes `discount_percent` + nulls `discount_expires_at` where `discount_expires_at < now`
- `src/components/cards/PropertyCard.tsx:discountPercent` — badge render prop, `> 0` shows the discount badge
- `src/app/[locale]/apartments/ApartmentsPageClient.tsx` — "discounted only" filter reads `discount_percent`
- `supabase/migrations/20260719130000_create_booking_apply_discount.sql:create_booking` — reduces the computed `total_price` by the property's active `discount_percent` before charging/inserting the booking, replacing the undiscounted pricing in `20260628120000_create_booking_inclusive_days.sql`
- `src/lib/utils/pricing.ts:isDiscountActive` — fail-open expiry check (`discount_expires_at IS NULL` counts as active, matching how `purchase_package` writes the columns; strict `>` mirrors `create_booking`'s own check) shared by every price-display and pricing call site
- `src/lib/utils/pricing.ts:applyDiscount` — applies the percentage to a price (no-op when `isDiscountActive` is false); used by `PropertyCard`, `SalePropertyCard`, `BookingSidebar`, and `SaleDetailClient` so displayed prices match what `create_booking` actually charges

**Also check:** `src/lib/types/database.ts` must carry `discount_expires_at` after
regen (**C3**); any new discount read/write path on `properties` must go through
the RPC, not a direct column update, or the trigger rejects it for non-admin
sessions.

**Breaks silently when:** a caller updates `discount_percent`/`discount_expires_at`
directly instead of via `purchase_package` (trigger blocks it for non-admin/non-
service-role, but silently no-ops under `service_role`); or a caller passes BOTH
`p_property_id` and `p_service_id` (or neither) for a VIP-category package — the
RPC rejects it with 22023, so an invoke body that sends both fields breaks at
runtime only; or a
future price-display or booking-price code path reads `discount_percent`/
`discount_expires_at` directly instead of calling `isDiscountActive`/
`applyDiscount` — it would silently regress back to showing (or charging) the
undiscounted price, since nothing else enforces that the percentage is actually
applied.

---

## C11 — Company (org) listing linkage & auto-link

**Invariant:** `properties.organization_id` is the sole link between a listing and
a company, and every write path to it is gated by TWO triggers on `properties`:
`enforce_org_listing_rules` (BEFORE INSERT OR UPDATE OF
`organization_id, owner_id, status` — approved membership + active
`organization_subscriptions` row + `listing_limit` cap) and
`prevent_listing_protected_field_change` (blocks `organization_id` changes from
non-admin client sessions, EXCEPT the row owner changing their own listing's org
without changing `owner_id`). The enforcement trigger fires whenever the UPDATE's
SET list mentions `organization_id` — **even if the value is unchanged** — so
client update payloads must include the column only when it actually changed, or
unrelated edits of an org listing whose subscription lapsed will be rejected.
Company tagging is **sale-only** (`is_for_sale = true`) by product decision;
rentals stay personal.

Participating symbols:

- `supabase/migrations/20260719140000_org_auto_link_sale_listings.sql:_auto_link_org_sale_listings` — links owner's untagged sale listings to an org, oldest first, capped at remaining `listing_limit` quota (uncapped would abort the purchase transaction via the enforcement trigger); also holds the CURRENT body of `prevent_listing_protected_field_change` (owner org-attach exception) and of `purchase_company_subscription` (calls the helper after the sub INSERT — order matters: the enforcement trigger's active-sub check needs the new row)
- `supabase/migrations/20260627090300_org_enforcement_trigger.sql:enforce_org_listing_rules` — membership/active-sub/cap gate; no-ops when `NEW.organization_id IS NULL` (detach is always allowed)
- `src/app/[locale]/create/sale/page.tsx:initialOrgIdRef` — edit flow hydrates the listing's org, renders the same "post as" picker as create, and spreads `organization_id` into the update payload ONLY when it differs from the hydrated value; active-sub pre-check likewise only on change
- `src/app/[locale]/dashboard/seller/organizations/[id]/page.tsx` — org stats read: `properties` where `organization_id = org AND status = 'active'`; apartments = `sum(units_total ?? 1)`
- `supabase/functions/company-subscription/index.ts:serve` — edge caller of `purchase_company_subscription` (name/body per **C4**; RPC signature unchanged, no redeploy needed for RPC-body changes)
- `supabase/migrations/20260721180000_org_member_read_access.sql:is_approved_org_member` — SECURITY DEFINER helper backing the agent-read policies on `organizations` + `organization_subscriptions`. An `organizations` policy must NEVER subquery `organization_members` inline: the members read policy itself subqueries `organizations`, so an inline subquery creates a 42P17 infinite-recursion cycle on every read of either table (same trap `is_admin_user` exists for)
- `src/lib/dashboard/orgScope.tsx:readStoredActiveOrgId` — the active dashboard scope persists to localStorage (`mb-active-org`); `create/sale` pre-selects the stored company in its "post as" picker (create mode only, validated against the user's own approved companies)
- `src/lib/data/getPropertyById.ts:PublicOrganization` — public detail fetchers (`getPropertyById`, `getCachedPublicProperty`) embed `organizations!properties_organization_id_fkey(...)`; `SaleDetailClient` renders the company (brand/logo/verified) as the seller when the embed is non-null, falling back to the owner profile (RLS nulls the embed for pending orgs viewed anonymously)
- `src/app/[locale]/sales/all/SalesGridClient.tsx` — public "developer vs individual" filter classifies developer = `organization_id != null OR developer` free-text non-empty (not `developer` text alone)

**Also check:** the seller dashboard splits personal vs company **exclusively**:
personal scope filters `owner_id = uid AND organization_id IS NULL`, org scope
filters `organization_id = org`. The personal-branch exclusion lives in six
client sites (`dashboard/seller/loadData.ts`, `dashboard/seller/listings/page.tsx`,
`SellerDashboardClient.tsx`, `dashboard/seller/analytics/page.tsx`,
`components/seller/SalesBoard.tsx`, `components/layout/DashboardShell.tsx`) and in
the stats RPCs (`20260721181000_stats_personal_scope_excludes_org.sql` +
`20260721182000_seller_stats_contact_events_exclude_org.sql`, which extends the
exclusion to the personal `contact_events` branches via a NOT EXISTS on the
event's property being org-linked). Realtime
`postgres_changes` filter strings stay coarse (`owner_id=eq.<uid>` — single-filter
limitation); exclusion is applied by the refetching fetchers, so org-row events
are harmless refetch triggers. `create_organization` always inserts the owner as
an approved member, which the auto-link helper relies on.

**Breaks silently when:** a client update payload unconditionally includes
`organization_id` (fires the enforcement trigger on every edit → 42501 once the
sub lapses); or a new attach path skips the quota check by writing under
`service_role` (both triggers pass, cap silently exceeded); or an org-listing
surface assumes rentals can be attached (`is_for_sale = false` rows are never
auto-linked and the edit picker is sale-only); or a new personal-scope dashboard
query filters only `owner_id` (org listings leak back into the personal view);
or a new `organizations`/`organization_members` policy reintroduces the inline
cross-subquery (42P17 on every read).

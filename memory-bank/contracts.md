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
(see `CLAUDE.md`). **The committed file is currently STALE vs. the live schema and
a full regen breaks the build**, so recent schema work hand-edits only the lines
it changed (the `property_type` enum for **C13**, `placement` on ads +
landing_banners for **C12**). Hand-editing is the deliberate exception, not the
rule — keep the edit to the affected lines so a future regen is a clean diff.

**Never run `supabase db push`.** This project's migrations are applied through MCP
`apply_migration`, which assigns its **own** ledger version at apply time, so the
`supabase_migrations.schema_migrations` versions do NOT correspond to the local
filenames (`001_initial_schema.sql` is recorded as `20260325120722`;
`20260724180000_content_change_requests.sql` as `20260724195934`). A `db push` compares
local prefixes against the ledger, would consider almost every file unapplied, and
would try to re-run the entire directory against a live schema. MCP `apply_migration`
is the only supported path from this repo. Filename prefixes are therefore just a
human-readable ordering; 9 pairs still share a prefix (`20260628120000` etc.), which is
untidy but inert given the above.

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
- `supabase/functions/_shared/guards.ts:buildCorsHeaders` — **exact-match** origin allow-list (env `ALLOWED_ORIGINS`, comma-separated). The Vercel-team suffix match and the `"*"` wildcard on the legacy `corsHeaders` export were both removed in `9828eba`; it now **fails closed** (emits no `Access-Control-Allow-Origin` at all when `ALLOWED_ORIGINS`/`APP_ORIGIN` is unset), so a preview deployment must be added to the env explicitly. Verified live: an allowed origin is echoed exactly, any other origin gets `allowed[0]` (which the browser then blocks). The legacy `corsHeaders` export is now dead — no function imports it

**Also check:** renaming a function directory changes the deploy slug; the
`invoke("…")` string must change in lock-step. Edge functions in turn call DB RPCs
(subject to C3). `_shared/guards.ts` is **bundled at deploy time** — editing it
does nothing until every function that imports it is redeployed. All 17 local
functions import it (only `search` also imports `_shared/sanitize.ts`), and every one
of them now runs the `9828eba` bundle: the 8 that still carried the pre-`9828eba`
copy (`search`, `vip-lifecycle`, `booking-create`, `booking-manage`,
`booking-finalize`, `sms-dispatch`, `sms-automation-run`, `road-condition-refresh`)
were redeployed and byte-verified on 2026-07-24.

**Redeploy recipe (MCP `deploy_edge_function`):** files
`[{name:"source/index.ts"},{name:"_shared/guards.ts"}]` with
`entrypoint_path:"source/index.ts"` — `index.ts` imports `../_shared/guards.ts`, so a
flat `index.ts` name makes `../` escape the bundle root and the function fails to boot.
Never echo back the `user_fn_<uuid>_<version>/…` names some deployed functions report:
they are per-deploy artifacts and re-sending them nests one layer deeper each time.
**`verify_jwt` must be read from the deployed function and preserved** — the deployed
value is the truth. `supabase/config.toml` was reconciled to match prod on 2026-07-25
(it had declared `false` for 8 functions live with `true`, and omitted two entirely,
which the CLI defaults to `true` — that direction is the dangerous one: it 401s the
pg_cron caller of `booking-finalize` / `road-condition-refresh` and the job stops
silently). Keep the two in lock-step: changing a `verify_jwt` in `config.toml` without
redeploying that function, or redeploying with a different flag than the file declares,
re-opens the drift. `ai-respond` and `webhook-facebook` are deployed but have **no
source in this repo**, so they are deliberately absent from `config.toml`.

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
Buckets in use: `property-photos`, `avatars`, `landing-media`, `restaurant-menus`,
`content-change-media` (private; created by the **C14** migration, currently has no
writer — its preview route exists but nothing uploads to it yet).

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

- `src/middleware.ts:Content-Security-Policy` — the live CSP: `img-src` / `connect-src` / `media-src` / `font-src` directives. **The CSP now ships from the middleware, not `next.config.ts`** (moved when the nonce approach was abandoned); the old `next.config.ts:CSP` / `:securityHeaders` anchors no longer exist
- `next.config.ts:remotePatterns` — Next image optimizer host allow-list

Current external hosts: `*.supabase.co` (+ `wss://`), `images.unsplash.com`,
`*.basemaps.cartocdn.com` (Leaflet/CARTO tiles). Note the two lists are **not**
symmetric: `img-src` allows unsplash but `media-src` does **not**, and
`remotePatterns` narrows supabase to `/storage/v1/object/public/**` while the CSP
allows the whole host. Code that picks a renderable URL must intersect all of
them — see `src/lib/banner-creative.ts:renderableImageUrl` (**C12**).

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

---

## C12 — Banner placement registry

**Invariant:** `src/lib/banner-placements.ts:BANNER_PLACEMENTS` is the single
source of truth for **where a banner can appear**. Its 11 ids are simultaneously
(a) a CHECK constraint on **two** tables, (b) the option list in **two** admin
forms, (c) the `placement` prop at every public mount site, and (d) the switch in
the renderer. Adding, renaming, or removing a placement touches all four — the
string is the only thing holding them together.

The two banner systems stay **separate tables, one renderer**: `landing_banners`
is editorial (tone colours, body copy, CTA, detail modal), `ads` is paid B2B
(single click-through, impression/click counters, advertising disclosure). Both
normalize into one `BannerCreative` before rendering.

Participating symbols:

- `src/lib/banner-placements.ts:BANNER_PLACEMENTS` — the 11-entry catalog (id, renderStyle, surface, aspect, legacyKind)
- `src/lib/banner-placements.ts:getPlacementSpec` — returns `null`, never throws, for an unmapped value. **Never replace with an index lookup** — that is exactly the shape that makes `BANNER_TONE_STYLES[tone]` crash on an off-union tone
- `supabase/migrations/20260724140000_banner_placements.sql:landing_banners_placement_check` — the CHECK on both tables; backfilled from `kind` / `position` BEFORE constraining
- `src/lib/banner-creative.ts:BannerCreative` — the normalized shape both tables adapt into (`landingBannerToCreative`, `adRowToCreative`)
- `src/lib/banner-creative.ts:renderableImageUrl` — intersection of CSP `img-src` and `remotePatterns` (**C6**). Deliberately **not** `safeStorageImageUrl`, which accepts `/object/sign/` URLs that `next/image` rejects. `renderableVideoUrl` is strictly narrower still (no unsplash in `media-src`)
- `src/lib/banner-creative.ts:isCreativeMediaUrl` — write-boundary guard; rejects a page URL saved as a creative (the bug that broke 3 live ad rows)
- `src/components/banners/BannerSlotView.tsx:BannerSlotView` — pure renderer, takes creatives as a prop, NEVER fetches
- `src/components/banners/BannerSlot.tsx:BannerSlot` — client wrapper; resolves creatives from the shared store
- `src/lib/banner-slots-client.ts:loadBannerCreatives` — module singleton: N slots on a page = ONE request, and a client-side navigation = zero
- `src/lib/banner-slots-server.ts:fetchSlotCreatives` — server read; explicit column lists (`ads` has `views_count`/`created_by` that must not reach anon), ad-side filter is `status='active'` AND in-window
- `src/app/api/banner-slots/route.ts:GET` — param-free public endpoint, `s-maxage=60`
- `src/components/admin/BannerLivePreview.tsx:BannerLivePreview` — renders the REAL `BannerSlotView` with `interactive={false}`; imports `BannerSlotView` (pure) and never `BannerSlot` (fetching), so the preview is structurally incapable of reading live data
- `supabase/migrations/20260724170000_ad_metrics_rpc.sql:increment_ad_metric` — SECURITY DEFINER counter bump; only for an active, in-window ad
- `src/app/api/banner-slots/track/route.ts:POST` — the beacon. Enforces the rate limit **only when a limiter is configured**, because `checkRateLimit` fails _closed_ and would otherwise pin every counter at zero — the exact bug the endpoint exists to fix

**Two style invariants inside `BannerSlotView`, both load-bearing:**

1. **No new i18n namespace.** It renders DB text plus `useLocale()` + a literal
   `SPONSORED_LABEL` map. Only `"Shared"` is used (already in
   `PUBLIC_NAMESPACES`, already pulled in by `BannerDetailModal`). Adding a
   namespace here means adding it to `PUBLIC_NAMESPACES` or `prebuild` fails
   (**C1**).
2. **Container queries, not viewport breakpoints.** Creative styling uses
   `@[640px]:` / `@[768px]:` — arbitrary widths, never the named `@md` (which is
   448px, not the site's 768px). This is what makes the admin's 390px preview
   frame truthful; a `md:` class would render the desktop layout inside a narrow
   box and lie. The `sticky` frame is the one exception: its bottom offsets
   depend on the real window (clearing `MobileStickyCTA` /
   `TransportContactFooter`), so viewport prefixes are correct there.

**Legacy columns kept on purpose:** `landing_banners.kind` and `ads.position` are
still NOT NULL and are still written (derived via `legacyKindForPlacement` /
`legacyPositionForPlacement`). **Nothing reads them.** They exist so a code
revert still renders every banner somewhere sane — that is what makes the
placement migration reversible. Do not "clean them up" without a migration that
drops them.

**Also check:** a new placement needs (1) an entry in `BANNER_PLACEMENTS`, (2) the
CHECK constraint widened on **both** tables, (3) `AdminShared.placements.<id>` in
**all three** catalogs (**C1**), and (4) an actual mount — a placement with no
`<BannerSlot>` anywhere is an option in the admin UI that silently renders
nowhere. Ad creatives live in `landing-media/ads/` (**C5**) and are now
user-visible, so that bucket's contents are public-facing, not just admin chrome.

**Breaks silently when:** a placement is added to the registry but not to the
CHECK (writes 23514 at runtime only); or added to the CHECK but never mounted
(admin can "publish" into a void); or a new mount hard-codes a placement string
instead of importing the union (typo renders nothing, no error); or a creative
read path is added that skips `renderableImageUrl` (passes validation, then CSP-
blocks or throws in `next/image` in the browser only); or the ad-side query drops
its `status='active'` filter (pause/resume silently stops working publicly,
because the service client bypasses the RLS policy that would have enforced it).

---

## C13 — `property_type` enum fan-out

**Invariant:** `public.property_type` is a 6-value Postgres enum
(`apartment`, `cottage`, `hotel`, `studio`, `villa`, `land`). Adding or renaming a
value touches **two compile-time tripwires and eight silent participants**. The
compiler catches only the first two; everything else fails invisibly at runtime.

This contract exists because it was already violated: `land` did not exist, so
`src/app/[locale]/create/sale/page.tsx` overloaded `villa` to mean "land plot" and
relabelled it in **one** i18n map. Every other surface kept rendering those rows
as "ვილა". Fixed by `20260724160000_property_type_add_land.sql` +
`20260724160100_land_backfill.sql`.

**Compile-time tripwires** (exhaustive `Record` over the enum — `tsc` fails until updated):

- `src/app/[locale]/sales/[id]/SaleDetailClient.tsx:PROPERTY_TYPE_LABEL_KEYS` — enum value → `SaleDetail.type*` key
- `src/lib/notifications/listing-labels.ts:PROPERTY_TYPE_LABEL_KA` — server-side Georgian labels for notification bodies (API routes can't use `useTranslations`)

**Silent participants** (no compile error; a forgotten one is invisible):

- `src/lib/types/database.ts:property_type` — the TS union **and** the `Constants` array (generated; hand-edited per **C3**)
- `src/app/[locale]/create/sale/page.tsx:PROPERTY_TYPES` — the sale form's own list; `isLandPlot` gates the land branch
- `src/app/[locale]/create/rental/page.tsx` — separate hardcoded list; land is deliberately absent (rentals only)
- `src/components/search/SaleSearchBox.tsx:PROPERTY_TYPES` — sale filter chips (`SaleSearchBox.type*` keys)
- `src/components/search/FilterPanel.tsx:PROPERTY_TYPE_KEYS` — shared rent/sale panel, no mode prop → a sale-only value is a dead chip in rent mode
- `src/components/admin/ListingAuditPanel.tsx:PROPERTY_TYPE_OPTIONS` **and** `src/app/api/admin/listings/update/route.ts:PROPERTY_TYPE_VALUES` — the admin dropdown and the server write allow-list must change **together** or the admin save 400s
- `src/lib/constants/listing-options.ts:salePropertyTypes` / `:propertyTypes` — legacy Georgian-label → code maps; two **different** vocabularies for the same enum (sale calls `hotel` "სასტუმრო ოთახი"). No live `optionKeyFor` consumer today, but a stale entry is how the overload got created
- `src/app/[locale]/apartments/page.tsx` — `.in("type", [...])` rental whitelist. Sale-only values must **not** be added here (it also filters `is_for_sale = false`)

**Land-specific rule — the null-set.** A land listing has no building, so
`rooms`, `bathrooms`, `capacity`, `construction_status`,
`construction_progress_percent`, `completion_year`, `renovation_status`,
`units_total`, `units_sold`, `units_reserved`, `roi_percent`, `roi_percent_max`,
`house_rules.handover_month` and `house_rules.management_service` are written as
**null/0** for land by `create/sale/page.tsx`'s payload and were cleared for the
two pre-existing rows by `20260724160100_land_backfill.sql`. **These two sets must
stay identical** — the whole card layer leans on it. (One benign shape difference:
the form writes `house_rules.handover_month`/`management_service` as present-but-null
keys, the backfill deleted the keys outright. Every read site treats both as absent.)

Some of the payload's nulls are indirect: `construction_progress_percent`,
`completion_year`, `units_*` and `handover_month` are derived from
`isUnderConstruction`, which is itself `!isLandPlot && …`, so they fall out
without an explicit land branch. `capacity` is the odd one — the sale form has no
capacity input at all, so it is spread in as `{ capacity: null }` **only** for
land, purely to clear the value an apartment→land conversion would otherwise keep
(`PropertyCard` would render "N სტუმარი" on a plot).

Because the data is null, most suppressions are free: `PropertyCard` needs **no**
land branch at all — its rooms/capacity tags and construction bar are all
truthiness-gated. Explicit `type === "land"` checks exist only where data cannot
express the difference (the `plotAreaSqm`/`plotAreaLabel` relabels, price-per-m²
suppression, and `src/app/[locale]/_landing/SaleLandingBody.tsx:estimatedRoi`,
which is synthetic — derived from the row id — and so immune to DB nulling) **and**
defensively on `sales/[id]`, `SalePropertyCard` and `InvestmentCard` for the
construction / renovation / management / ROI / rooms blocks. Those defensive gates
are deliberate, not redundant: an admin can retype a listing to land through
`ListingAuditPanel` without clearing any column, and that panel has no land
branch. Do not "simplify" them away.

**Also check:** `supabase/functions/search/index.ts` uses
`.eq("type", property_type)` and is value-agnostic — no edge redeploy needed
(**C4**). Adding a value needs **two separate transactions**: `ALTER TYPE … ADD
VALUE` cannot be _used_ in the xid that adds it (`55P04`), and PostgREST caches
enum labels, so the migration must end with `notify pgrst, 'reload schema'`.

**Breaks silently when:** a new value is added to the enum + the two `Record`s
(build goes green) but not to the sale form list (unselectable), the admin write
allow-list (400 on save), or the filter lists (unsearchable); or the form's
null-set and the backfill/edit null-set drift apart, at which point the
truthiness-gated card suppressions silently stop working for the drifted column
(the `capacity` case above is exactly that, caught in review).

**Known open follow-ups** (each independently reproducible, none fixed here):
land is still pooled into the building-oriented `₾/m²` zone average and the
`SaleSearchBox` appraisal (`src/app/[locale]/page.tsx` `aggregatePricePerSqm`), so
one 83 ₾/m² plot roughly halves the apartment price/m² shown for its zone; the
company cabinet counts `units_total ?? 1` and so reports plots as "სულ ბინები"
(`dashboard/seller/organizations/[id]/page.tsx`); the guest dashboard's
popular-listings section still renders `0 ₾ /ღამე` for any sale row
(`dashboard/guest/GuestDashboardClient.tsx`); and `SalesPage.title` /
`SalesGrid.title` still read "იყიდება ბინები ბაკურიანში" above a grid that now
contains plots.

---

## C14 — Editorial review gate for public content

**Invariant:** after `20260724180000_content_change_requests.sql`, a browser session can
no longer UPDATE the _public-content_ columns of `profiles`, `cleaner_profiles`,
`properties`, `services` or `organizations`. A BEFORE UPDATE trigger raises **42501**
for any non-admin, non-`service_role` session that changes a column in that table's
reviewable allow-list. Every such edit must instead be queued as a
`content_change_requests` row and applied by an admin. The allow-list is
**quadruplicated** — the same field set is written out in four places and nothing
enforces that they agree:

| #   | Location                                             | What a mismatch does                          |
| --- | ---------------------------------------------------- | --------------------------------------------- |
| A   | `src/lib/content-change/fields.ts:REVIEWABLE_FIELDS` | key missing → API 400s `non_reviewable_field` |
| B   | trigger `v_reviewable` CASE in the migration         | key missing → user may write it directly      |
| C   | `approve_content_change_request` `v_allowed` CASE    | key missing → approval silently drops it      |
| D   | the payload each form actually submits               | extra key → **every** save on that form 400s  |

Participating symbols:

- `supabase/migrations/20260724180000_content_change_requests.sql:prevent_unreviewed_public_content_update` — the BEFORE UPDATE trigger (B); early-returns when `auth.role()` IS NULL or `service_role`, or `is_admin_user()`
- `supabase/migrations/20260724180000_content_change_requests.sql:approve_content_change_request` — SECURITY DEFINER apply-on-approve (C). Its staleness check compares `before_snapshot` key-by-key against the live row; for a `profile` target the nested `cleaner_profile` object **must be projected onto the keys the API snapshotted** (`jsonb_object_agg` over `jsonb_object_keys(before_snapshot->'cleaner_profile')`) — comparing `to_jsonb(cp)` made every cleaner request auto-supersede, because jsonb object equality requires identical key sets
- `src/lib/content-change/fields.ts:REVIEWABLE_FIELDS` (A) + `:CLEANER_PROFILE_FIELDS` (the 6 nested keys) + `:hasOnlyReviewableValues` — **all-or-nothing**: one non-allow-listed key rejects the whole payload, which is why a MIXED payload cannot be submitted at all
- `src/app/api/content-change-requests/route.ts:POST` — validates against A, snapshots `before`, writes the row; maps 23505 → 409 `target_locked`
- `src/lib/content-change/client.ts:submitContentChange` — the only writer; `:contentChangeErrorKey` / `:isContentChangeError` map API codes onto `CreateShared.contentChange.*` (**C1**) so users never see a raw code
- `src/app/[locale]/dashboard/admin/verifications/page.tsx` — the ONLY approval surface (calls `/api/admin/content-change-requests`)
- `content_change_one_pending_target` — UNIQUE (target_type, target_id) WHERE status='pending': scoped to the **target**, not the requester, so one pending request blocks every later edit of that listing until an admin acts (the withdraw endpoint has no UI caller yet)

**Mixed payloads are the trap.** A write that touches both reviewable and
non-reviewable columns cannot go through the API (A is all-or-nothing) and cannot go
direct (B raises). It must be **split**, as
`src/components/seller/ConstructionManagementModal.tsx:handlePublish` now does:
`construction_stages` + `construction_progress_percent` via `submitContentChange`,
`progress_note` + `progress_note_updated_at` by direct UPDATE, and the
`project_updates` feed insert **before** the review submit so a rejected request
cannot swallow the seller's update history.

**Also check:** `role` is deliberately NOT reviewable, which is what lets
`auth/register`'s 23505 insert-conflict fallback re-apply `{ role }` only — updating the
whole profile payload there raises 42501 and turns a benign retry into a hard
registration failure. `progress_note` is publicly rendered but is in none of the four
lists (an intentional unreviewed channel — do not "fix" it without also giving it a
submit path). The `organization` target has no submitting surface yet.

**Breaks silently when:** a new form field is added to D without A/B/C (that form's every
save 400s — exactly the `roi_percent_max` bug); or a key is added to A but not C
(approval drops the value with no error); or a new edit surface writes a reviewable
column directly (42501, raw Postgres text in the UI unless it maps through
`contentChangeErrorKey`); or a handler calls `submitContentChange` without a catch and
without telling the user the change is pending — the write silently appears to do
nothing, because the row it renders from cannot change until approval.

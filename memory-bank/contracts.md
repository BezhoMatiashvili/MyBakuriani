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
landing_banners for **C12**, the whole `cleaner_manual_tasks` table block for
**C17**, and for **C18** the marketing/consent fan-out: `marketing_consent` +
`marketing_consent_at` on `bookings` AND `manual_bookings`,
`profiles.marketing_opt_out`, `properties.check_in_time`,
`sms_automation_rules.win_back_discount_{value,period}`,
`sms_outbound.{source_manual_booking_id,charged_at}` + `recipient_id` relaxed to
nullable, the five `sms_*` RPC signatures, and `p_marketing_consent` added to the
three manual-booking RPCs). The 2026-08-04 verified-consent pass additionally
mirrors `manual_bookings.deposit_{amount,paid_on}`, the complete
`manual_booking_sms_consents` table, `issue_manual_booking_sms_consent` /
`respond_manual_booking_sms_consent`, and the two trailing deposit arguments on
all three manual-booking RPCs (`create_guest_manual_booking` also gains `p_amount`).
The same pass **removed** the `road_conditions` block,
which had been a type lie since `20260725160000` dropped the table. The
2026-08-06 pass mirrors migration `20260806120000_blacklist_match_result.sql`:
`add_renter_guest_to_blacklist`'s return type changed from a bare
`renter_guests` row to `{ guest: renter_guests; was_already_blacklisted: boolean }`
(new composite type `public.renter_guest_blacklist_result`), so the
`SetofOptions` block that asserted a 1:1 `renter_guests` return no longer
applies and was dropped. Hand-editing
is the deliberate exception, not the rule — keep the edit to the affected lines so
a future regen is a clean diff.

**Verified 2026-07-25:** every hand-edit above was probed against the live schema
(column types, nullability, defaults, and `pg_get_functiondef` for each RPC) and
matches. The file is truthful for everything C17/C18 touch; it remains stale for
six unrelated tables a full regen would re-add — which is why the regen still
breaks the build.

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
does nothing until every function that imports it is redeployed. All 16 local
functions import it (only `search` also imports `_shared/sanitize.ts`), and every one
of them now runs the `9828eba` bundle: the 8 that still carried the pre-`9828eba`
copy (`search`, `vip-lifecycle`, `booking-create`, `booking-manage`,
`booking-finalize`, `sms-dispatch`, `sms-automation-run`, and the since-retired
`road-condition-refresh`) were redeployed and byte-verified on 2026-07-24.

**As of 2026-07-27 the 16 deliberately do NOT all bundle the same `guards.ts`, and
that split is intentional.** The 8 redeployed that day (`booking-create`,
`booking-manage`, `booking-finalize`, `company-subscription`, `payment-create`,
`payment-process`, `purchase-vip`, `vip-lifecycle`) carry guards.ts sha256
`1fc5804f…`; the other 8 still carry the previous copy. The only difference between
the two is one added member of the `ErrorCode` **type alias**
(`"SUBSCRIPTION_TIER_LOCKED"`), which TypeScript erases at runtime — so the two
bundles are behaviourally identical and the 8 stale ones did not need a redeploy.
A future byte-comparison WILL flag those 8; that is expected, not drift. Any change
to guards.ts with actual runtime effect still requires redeploying all 16.

**The two legitimate `guards.ts` hashes** (full-sweep verified 2026-07-28 — use these
to settle a parity check in one step instead of re-diffing 16 bundles):

| state             | sha256                                                             | bytes |
| ----------------- | ------------------------------------------------------------------ | ----- |
| current (those 8) | `1fc5804f7ea542ed1a46cff36ac4e85a2f8152e68efbdacea885e88c4348c01f` | 7445  |
| older, inert (8)  | `0169b82930c44c19134ca26bc264566a821c9ee4ecbe9bf93ac0c20fd025451f` | 7414  |

Anything else is real drift. Note the textual delta is **−2/+1 lines, not one**: dropping
`| "SUBSCRIPTION_TIER_LOCKED";` moves the terminating semicolon back onto `| "BAD_REQUEST"`.

**Also check the bundle MANIFEST, not just the hashes.** Every function must report
exactly `["source/index.ts", "_shared/guards.ts"]` (plus `_shared/sanitize.ts` for `search`
and `source/domain.ts` for `sms-automation-run`). `domain_test.ts` is test-only and must not deploy.
The `user_fn_<uuid>_<version>/…` nesting failure above is invisible to a content hash —
the file contents stay correct while the paths gain a level per redeploy. Verified clean
across all 16 on 2026-07-28.

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
pg_cron caller of `booking-finalize` and the job stops
silently). Keep the two in lock-step: changing a `verify_jwt` in `config.toml` without
redeploying that function, or redeploying with a different flag than the file declares,
re-opens the drift. `ai-respond` and `webhook-facebook` are deployed but have **no
source in this repo**, so they are deliberately absent from `config.toml`.

For `sms-automation-run`, include `{name:"source/domain.ts"}` as a third file in the
MCP deploy recipe because `source/index.ts` imports it. Omitting it prevents isolate boot.

Not every function is client-invoked: the would-be scheduled jobs
(`vip-lifecycle`, `sms-dispatch`, `sms-automation-run`, `booking-finalize`) have
**no `invoke` caller** — they are _designed_ to be driven by pg_cron via
`net.http_post` (see the `supabase/migrations/*schedule*.sql` files) and are gated
by a per-function **shared secret** (their own `requireSharedSecret` comparing the
Bearer to `<NAME>_SECRET`), deployed `verify_jwt=false`.

**None of them is actually scheduled, and none ever has been.** Verified live
2026-07-25: `select count(*) from cron.job` = **1**, and the single job is
`rate-limit-gc` (`23 * * * *`). `cron.job_run_details` holds 1676 rows across
jobids 1–7 and not one of them is a `vip-lifecycle-daily`,
`booking-finalize-daily`, `sms-dispatch-frequent` or `sms-automation-*` run. So
VIP/discount expiry (**C10**'s `clearExpiredDiscounts`) and booking finalization
have **never executed in production** — their scheduling migrations hit the
`IF EXISTS (pg_cron) AND EXISTS (pg_net)` guard's ELSE branch when applied and
swallowed it. This paragraph previously asserted the opposite; the `verify_jwt`
drift risk described above is real but downstream of a caller that does not exist.
Do not "fix" a silent scheduled job by redeploying the function — check `cron.job`
first.

**`sms-automation-run` (v8) and `sms-dispatch` (v7) were redeployed 2026-07-25**
and byte-verified equal to their working-tree sources (sha256 `f7a0f311…` and
`76e9ec0e…`), both carrying the post-`d162bd9` fail-open `guards.ts`
(`0169b829…`), both `verify_jwt=false` in lock-step with `config.toml`. Their
rewrite needs a third secret beyond the shared one: **`SITE_URL`** — `NEXT_PUBLIC_*`
is invisible inside Deno, and `sms-automation-run` refuses to run rather than emit
a relative link into an SMS.

`road-condition-refresh` was **retired on 2026-07-25**
(`20260725160000_retire_road_conditions.sql` dropped `public.road_conditions`,
unscheduled the `road-condition-30min` cron job, and the function directory +
`config.toml` stanza were deleted; the deployed function had to be deleted separately in
the dashboard, since MCP has no `delete_edge_function` — **that step is DONE**, verified
2026-07-26: `list_edge_functions` returns 18 functions and `road-condition-refresh` is not
among them, so the retirement is complete on both sides). It had never produced a live
value — `app.road_condition_url` was never set, so every run posted to a NULL url.
The landing road badge now fetches `routing.openstreetmap.de` (FOSSGIS OSRM, keyless)
**server-side from Node** in `src/lib/road-condition/server.ts`, so it needs no CSP
`connect-src` / `remotePatterns` entry (**C6** governs only browser + Next-image-optimizer
hosts) — moving that call into the browser or adding client polling **would** require one.
FOSSGIS's terms also require the ODbL credit + fix-the-map link rendered in
`src/components/layout/Footer.tsx`; removing those puts us out of compliance.

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

**A filtered subscription cannot see DELETEs.** Every table here has
`REPLICA IDENTITY DEFAULT` (verified live: `pg_class.relreplident = 'd'` for
`calendar_blocks`, `price_overrides`, `manual_bookings`), so a DELETE's WAL
`old_record` carries **only the primary key**. A subscription filtered on any other
column — e.g. `filter: property_id=eq.<id>` in
`src/app/[locale]/dashboard/renter/calendar/page.tsx` — therefore matches INSERT and
UPDATE but **never DELETE**. This is why the renter calendar's two DELETE-based
actions (bulk "whole month available" and the Unlock button) refreshed nothing while
the UPSERT-based ones eventually did. **A write path must never rely on realtime as
its own refresh mechanism** — refetch explicitly after the write and treat realtime
purely as cross-client convergence (that page now `await fetchBlocks()`es; the price
handlers always did `await fetchOverrides()`).

That page reads `calendar_blocks` **twice**, and a write must refresh both:
`fetchBlocks` (visible month only, feeds the grid) and `fetchOccupancy` (a fixed
−3/+24-month window via `src/lib/utils/availability.ts:occupancyWindow`, deliberately
month-independent). The second one feeds the `occupied` map that greys out and
disables booked/blocked nights in the check-in/check-out pickers of
`AddBookingModal`/`GuestFormModal`. Refresh only the first and the grid updates while
the pickers keep offering a night that was just taken or freed.

**`REPLICA IDENTITY FULL` is NOT an escape hatch here** — do not reach for it. Realtime
does not apply RLS to DELETEs (Postgres cannot check a policy against an already-deleted
row), so to avoid leaking rows the subscriber may not read, Realtime reduces a DELETE's
`old_record` to the **primary key alone on any RLS-enabled table, even under
`REPLICA IDENTITY FULL`**. Every table in this contract has RLS enabled, so setting FULL
would add WAL volume and still never deliver a `property_id`-filtered DELETE. Explicit
refetch is the only fix. (Dropping the filter and subscribing unfiltered would deliver
DELETEs — to every subscriber of the table, which is the leak the reduction prevents.)

**Breaks silently when:** a new dashboard subscribes to a table not yet in
`supabase_realtime` → the channel connects but **no events ever arrive**; nothing
errors. Or a mutation relies on its own realtime event to re-render — a DELETE under
a non-PK filter never arrives (above), so the UI silently keeps the pre-write state
and the action reads as a no-op even though the write committed.

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
`total_price`, and `PropertyCard`/`SalePropertyCard`/`InvestmentCard`/`ServiceCard`/
`BookingSidebar`/`SaleDetailClient`/`ServiceDetailClient`/`EntertainmentDetailClient`
apply the same percentage to displayed prices client-side via
the new `isDiscountActive`/`applyDiscount` helpers in `src/lib/utils/pricing.ts`.

**Every public card that can show a discount must gate on `isDiscountActive`, not
`discount_percent > 0`.** Two of them did not until 2026-07-26 and both failed the
same way: `InvestmentCard` (the ONLY card `/sales` renders) had no discount props at
all, so 4 live discounted sale listings showed full price with no badge; `ServiceCard`
had `discountPercent` but no `discountExpiresAt`, so a lapsed service discount would
badge forever while its price stayed undiscounted. A discount surface therefore needs
**both** halves — the expiry-aware gate AND `applyDiscount` on the rendered price —
plus the detail page behind the card, or the card and the detail page disagree.

Participating symbols:

- `supabase/migrations/20260721110000_purchase_package_service_targets.sql:purchase_package` — CURRENT body: 6-arg signature with `p_service_id`; drops both prior overloads first (`CREATE OR REPLACE` only replaces an identical signature — adding a param creates a second overload, not a replacement; same trap the earlier `20260719095704_discount_percent_choice_drop_old_overload.sql` existed for). `discount` tier branch validates `p_discount_percent` is `[1,90]` and sets `discount_percent`/`discount_expires_at` on the targeted table (supersedes the property-only version in `20260719095438_discount_percent_choice.sql`)
- `supabase/migrations/20260719120000_fix_discount_badge_duration.sql:prevent_listing_protected_field_change` — guards `discount_expires_at` (alongside `discount_percent`) as writable only via the RPC/service role (current trigger BODY now lives in `20260719140000_org_auto_link_sale_listings.sql`, which re-declares it verbatim + an owner org-attach exception — see **C11**; discount-field guarding is unchanged)
- `supabase/functions/purchase-vip/index.ts:serve` — validates `discount_percent` from the request body ([1,90] or null) and forwards it as `p_discount_percent`
- `src/components/renter/VipPropertyPickerModal.tsx:VipPropertyPickerModal` — renders the percent stepper (only when `tier === "discount"`) and passes the chosen value through `onConfirm`; the percent can also be derived from a typed target price (second, synced "ახალი ფასი" field — shown only when the caller supplies `PickerProperty.price`, i.e. `is_for_sale ? sale_price : price_per_night`; rounds to nearest whole percent and snaps the price on blur). Client-side sugar only — the wire contract still carries just the integer percent
- `src/components/balance/PropertyBalanceClient.tsx:handleConfirmPurchase` — forwards `discountPercent` into the `purchase-vip` invoke body
- `supabase/functions/vip-lifecycle/index.ts:clearExpiredDiscounts` — per-table sweep over `properties` AND `services`: zeroes `discount_percent` + nulls `discount_expires_at` where `discount_expires_at < now`
- `src/components/cards/PropertyCard.tsx:discountPercent` — badge render prop, `> 0` shows the discount badge
- `src/components/cards/InvestmentCard.tsx:discountActive` — the `/sales` grid card. Renders the badge as an inline pill at `top-14 left-4` (same geometry as its bespoke "იყიდება" pill, deliberately NOT `ListingBadge`, which this file uses none of), the struck original **nested inside** the existing `salePrice != null` guard, and derives `pricePerSqm` from the DISCOUNTED price. Prices render in `₾` via `formatPrice` — the old local `formatUsd` prefixed `$` to a raw GEL `sale_price`, contradicting `/sales/all` and `/sales/[id]`
- `src/components/cards/ServiceCard.tsx:discountActive` — service card. Gates the badge in the `overlay` and `photo` variants; the `photo` variant also renders the struck original **on the same baseline row** as the discounted price, because that card is `md:h-[420px] overflow-hidden` and a second line clips its button row. The `avatar` variant (used by `/services`) renders no price and no badge by design; `overlay` (used by `/food`) renders no price. The `isTransport` branch renders no price at all, so there is nothing to discount there. The NEW-badge condition is deliberately left on `discountPercent === 0`: flipping it to `!discountActive` would make an expired-discount listing newly claim to be NEW
- `src/app/[locale]/services/[id]/ServiceDetailClient.tsx:displayPrice` / `src/app/[locale]/entertainment/[id]/EntertainmentDetailClient.tsx:displayPrice` — the detail pages behind the two card surfaces that show a discounted price; both the sidebar and the `MobileStickyCTA` use the discounted value
- `src/app/[locale]/transport/[id]/TransportDetailClient.tsx:discounted` / `src/app/[locale]/food/[id]/FoodDetailClient.tsx:avgCheckLabel` — the two detail pages whose cards render a discount **badge but no price** (ServiceCard's `isTransport` branch and its `overlay` variant), so an active discount was advertised on the card and then contradicted by full prices on the page. Transport has TWO mutually exclusive price blocks — the `route_pricing` table and the legacy single-price card — and a listing renders only one, so **both** must apply the discount or the contradiction survives for whichever branch that listing takes. Food discounts only the `service.price` fallback: `avg_check` is typical spend per guest, not a price being discounted, and marking it down would be a lie
- `src/lib/constants/listing-options.ts:RoutePricing` — the supported `services.route_pricing` row contract is exactly `{ route, price, unit }`. The retired free-text `subtitle` may still exist in historical JSONB rows, but `parseRoutePricing` deliberately ignores unknown fields, the transport create/edit form never writes it, and the public detail page never renders it. Do not add the author-controlled subtitle back without a product decision and all three surfaces changing together
- `src/app/[locale]/apartments/ApartmentsPageClient.tsx` — "discounted only" filter reads `discount_percent`
- `src/app/[locale]/sales/SalesPageClient.tsx:discountOnly` — the same "discounted only" toggle on `/sales`. Two traps, both live-reviewed: the `paginatedProperties` memo must depend on `filteredProperties` (keeping `[properties, …]` makes the toggle a silent no-op, since the prop keeps its identity and lint only warns), and the toggle handler must `setCurrentPage(1)` itself — the existing clamp effect converges only AFTER a commit, so from page 3 it paints the empty state for a frame
- `supabase/migrations/20260719130000_create_booking_apply_discount.sql:create_booking` — reduces the computed `total_price` by the property's active `discount_percent` before charging/inserting the booking, replacing the undiscounted pricing in `20260628120000_create_booking_inclusive_days.sql`
- `src/lib/utils/pricing.ts:isDiscountActive` — fail-open expiry check (`discount_expires_at IS NULL` counts as active, matching how `purchase_package` writes the columns; strict `>` mirrors `create_booking`'s own check) shared by every price-display and pricing call site
- `src/lib/utils/pricing.ts:applyDiscount` — applies the percentage to a price (no-op when `isDiscountActive` is false); used by `PropertyCard`, `SalePropertyCard`, `InvestmentCard`, `ServiceCard`, `BookingSidebar`, `SaleDetailClient`, `ServiceDetailClient`, `EntertainmentDetailClient`, `TransportDetailClient` and `FoodDetailClient` so displayed prices match what `create_booking` actually charges. `SaleDetailClient`'s `MobileStickyCTA` was the last raw-price holdout on a page whose sidebar was already discounted — the two disagreed on the same screen

**Also check:** `src/lib/types/database.ts` must carry `discount_expires_at` after
regen (**C3**); any new discount read/write path on `properties` must go through
the RPC, not a direct column update, or the trigger rejects it for non-admin
sessions.

**`discount_percent` is not a general-purpose flag — never overload it.** Two surfaces
read it to mean something unrelated, and one of them was load-bearing:
`ServicesPageClient` derived `availabilityStatus` from `discount_percent > 0`, and
`ServiceCard`'s avatar variant turns `"busy"` into `phone={null}` on its
`WhatsAppButton` — so buying a discount **removed the only contact affordance** on
`/services` (and never expired, since that comparison ignored
`discount_expires_at`). Fixed 2026-07-26 by pinning `availabilityStatus="active"`;
nothing tracks real service availability yet, so re-deriving it from any listing
column is the bug, not the fix. The employment page's `deriveBadge` still maps
`discount_percent > 0` to an `"urgent"` badge — cosmetic, reported, unfixed.

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
- `src/components/banners/BannerSlotView.tsx:MediaCreative` — leaderboard/sidebar/in-grid all crop video with `object-cover`, so a video creative gets an **expand button** (sibling of `CreativeShell`, never a child: for a sponsored creative the shell is an `<a>`, and the title overlay is not `pointer-events-none`) that opens `BannerDetailModal`. That makes the modal reachable for `sponsored: true` creatives **for the first time** — it previously only ever saw editorial ones — which is why `BannerDetailModal` now renders the `sponsoredLabel` disclosure and hides the `startAt`/`endAt` row for ads (on an ad those are the campaign flight window, i.e. advertiser data). Expand deliberately does NOT call `reportClick`: the click counter is advertiser-facing. An expanded ad is a dead end by construction — `adRowToCreative` sets `ctaLabel: null`, so the modal has no click-through
- `src/components/banners/BannerSlot.tsx:BannerSlot` — client wrapper; resolves creatives from the shared store
- `src/lib/banner-slots-client.ts:loadBannerCreatives` — module singleton: N slots on a page = ONE request, and a client-side navigation = zero
- `src/lib/banner-slots-server.ts:fetchSlotCreatives` — server read; explicit column lists (`ads` has `views_count`/`created_by` that must not reach anon), ad-side filter is `status='active'` AND in-window
- `src/app/api/banner-slots/route.ts:GET` — param-free public endpoint, `s-maxage=60`
- `src/components/admin/BannerLivePreview.tsx:BannerLivePreview` — renders the REAL `BannerSlotView` with `interactive={false}`; imports `BannerSlotView` (pure) and never `BannerSlot` (fetching), so the preview is structurally incapable of reading live data
- `supabase/migrations/20260724170000_ad_metrics_rpc.sql:increment_ad_metric` — SECURITY DEFINER counter bump; only for an active, in-window ad
- `src/app/api/banner-slots/track/route.ts:POST` — the beacon. Rate-limited unconditionally (120/min per IP). It used to enforce the limit **only when Upstash was configured**, because `checkRateLimit` then failed _closed_ and would otherwise have pinned every counter at zero — the exact bug the endpoint exists to fix. That guard was removed once the limiter became Postgres-backed and fail-open (**C16**); restoring fail-closed anywhere would silently re-break this counter

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

**`check_in_time`, `marketing_consent` and `marketing_opt_out` are deliberately NOT
reviewable** either (see **C18**). They are operational, not public-content, fields:
`properties.check_in_time` remains a property operational setting (the SMS page does
not expose a timing editor), and the two consent fields are written by the owner
attesting consent on a manual booking and by the guest opting out. Adding any of them to allow-list A
would 42501 those writes and route a guest's opt-out through admin approval — which
is both wrong and, for opt-out, the wrong direction legally.

**Cleaner working hours are the narrow immediate-settings exception.**
`supabase/migrations/20260801120000_one_cleaner_247_service.sql:self_service_set_cleaner_working_hours`
is callable only by `service_role` through
`src/app/api/self-service/cleaner/services/[id]/working-hours/route.ts:PATCH`. It
may change only `schedule` and `operating_hours` on an owned cleaning service,
keeps those columns synchronized, and atomically transfers 24/7 availability from
the cleaner's former service. All other service content remains in the C14 review
flow. Pending legacy requests containing only those two hour fields are
superseded by the migration and their requesters are notified to save again.

**Breaks silently when:** a new form field is added to D without A/B/C (that form's every
save 400s — exactly the `roi_percent_max` bug); or a key is added to A but not C
(approval drops the value with no error); or a new edit surface writes a reviewable
column directly (42501, raw Postgres text in the UI unless it maps through
`contentChangeErrorKey`); or a handler calls `submitContentChange` without a catch and
without telling the user the change is pending — the write silently appears to do
nothing, because the row it renders from cannot change until approval.
---

## C15 — Smart Match "actionable" count (one definition, five surfaces)

**Invariant:** there is exactly ONE definition of "open Smart Match requests this
renter has not answered", and it lives in SQL. Every surface showing a Smart Match
number either calls it or reproduces it predicate-for-predicate.

Before `20260725120000_smart_match_actionable_count.sql` there were four
definitions and none agreed: the sidebar promo card read "2 ახალი მოთხოვნა" off
unread `notifications` while the inbox correctly read 0 incoming / 2 sent for the
same account, and the renter overview showed a third number.

**Why it cannot be bookkept.** `notifications` has no FK back to
`smart_match_requests`, so an inserted offer can never mark "its" notification
read; and a request going stale is _the clock passing_, not a write, so no trigger
can fire for it. Any stored flag drifts. The count must be computed at read time.

Participating symbols:

- `supabase/migrations/20260725120000_smart_match_actionable_count.sql:smart_match_actionable_count` — the definition. `LANGUAGE sql STABLE`, **SECURITY INVOKER** so RLS bounds it. Mirrors the inbox one-for-one: `status='active'` → `order by created_at desc limit 30` → `check_out is null or >= today (UTC)` → `not exists` an offer by `auth.uid()`. The renter gate is a leading `case when exists (properties … owner_id = auth.uid() and status='active' and is_for_sale=false)` — **not** a WHERE clause: it short-circuits the table for every non-renter, and without it a guest-only caller counts their OWN requests through the "Users see own requests" policy. The offer check must stay an `exists`, never a row count — the unique key is `(request_id, property_id)`, so one renter can legitimately hold N offers on one request
- `supabase/migrations/20260725120000_smart_match_actionable_count.sql:dashboard_layout_data` — exposes it as the jsonb key `smart_match_actionable`. The old `smart_match_unread` key (unread notification rows) is **gone**; a missing key reads as 0, which renders the promo card's neutral headline, so a non-atomic migrate/deploy degrades safely in either order — never to a wrong non-zero
- `supabase/migrations/20260725120000_smart_match_actionable_count.sql:idx_smart_match_requests_active_created` — partial index on `(created_at desc) where status='active'`. Required, not an optimisation: the count moved from "once per Smart Match page visit" to "once per dashboard route render, every role" (the layout is `force-dynamic` and awaits the RPC), and `smart_match_requests` had no index on status/created_at at all. If this RPC ever hits the statement timeout, `dashboard/layout.tsx` falls back to `{}`, `deriveAvailableCabinets` receives empty flags, and the whole sidebar collapses — far worse than a stale number
- `src/app/[locale]/dashboard/layout.tsx:LayoutData` — server seed; `data.smart_match_actionable ?? 0` → `DashboardShell`
- `src/components/layout/DashboardShell.tsx:recountSmartMatch` — debounced (400 ms) live recount via the RPC, gated on `availableCabinets.includes("renter")`. Fed by TWO realtime bindings: `notifications` INSERT of `type='smart_match_request'` (a request arrived — recount, never `+1`, because it may already be stale or answered in another tab) and **`smart_match_offers` INSERT filtered `renter_id=eq.<uid>`** (the renter answered). The second is load-bearing: answering notifies the GUEST, not the renter, so without it the badge can only ever go up
- `src/components/layout/RenterSidebar.tsx:smartMatchCount` — the only renderer; `> 0` shows "N ახალი მოთხოვნა", `0` falls back to `SmartMatchCard.guestRequests`. No new i18n key, so **C1** is untouched
- `src/app/[locale]/dashboard/renter/smart-match/page.tsx:actionableCount` — the TS twin, computed from rows the page already holds. **This is the parity reference the SQL mirrors** — if the two disagree, the SQL is what's wrong
- `src/app/[locale]/dashboard/renter/RenterDashboardClient.tsx:refreshMatches` — the overview "Smart Match დამთხვევები" stat, now just an RPC call. It used to apply `isCompatible` and NOT subtract answered requests; both were dropped deliberately (the inbox ranks zone mismatches lower, it never hides them, because property zones are often coord-derived guesses)
- `src/lib/smart-match/match.ts:isStale` — the TS half of the date predicate (`check_out < todayISO`, UTC from `toISOString()`). The SQL says `check_out is null or check_out >= (now() at time zone 'utc')::date`. Change one, change the other. Explicit UTC on both sides, not `current_date`, so a session TimeZone GUC can't desync them

**Three quirks are deliberate parity, not bugs.** (1) `.limit(30)` is applied
**before** the stale/answered filters on both sides — mirroring it is what keeps
the numbers equal past 30 open requests; note both are then equally wrong, since
requests 31+ are neither shown nor counted (a real, separate product gap: the
inbox needs pagination, and raising the cap on one side alone re-opens the
mismatch). (2) A `status='cancelled'` offer still counts as answered, because the
page builds `submittedRequestIds` from every offer row with no status filter.
(3) The caller's own requests (`guest_id = auth.uid()`) are **not** excluded,
because the page doesn't exclude them either.

**Also check:** `src/lib/types/database.ts` carries
`smart_match_actionable_count: { Args: never; Returns: number }` (hand-added, one
line — **C3**). PostgREST caches the function catalogue, so the migration ends with
`notify pgrst, 'reload schema'`. `smart_match_offers` is in the `supabase_realtime`
publication (**C7**), which is what makes the decrement binding deliver.

**Breaks silently when:** the SQL predicate and the page's TS filter drift apart
(badge and stat card disagree again — exactly the reported bug); or a new Smart
Match surface counts requests without the
`not exists (smart_match_offers … renter_id = auth.uid())` clause; or the
`case when exists (properties …)` gate is "simplified" into the WHERE clause
(guest-only callers start counting their own requests); or the
`smart_match_offers` INSERT binding is dropped from `DashboardShell` (the badge
rises but never falls); or someone re-derives the badge from `notifications`
again, which cannot express either "answered" or "expired".

---

## C16 — Rate-limit backend & fail-open contract

**Invariant:** `src/lib/rateLimit.ts:checkRateLimit` is the single limiter for
every Next.js route, its shared store is the app's own Postgres, and it **fails
open** when no store can be reached. "Unconfigured" must never mean "deny".

This contract exists because the opposite shipped. `checkRateLimit` was
Upstash-only and returned `false` whenever `UPSTASH_REDIS_REST_URL` /
`UPSTASH_REDIS_REST_TOKEN` were absent in production. They were never set in
Vercel, so from `9828eba` (2026-07-24) until `20260725140000_postgres_rate_limiter.sql`
**every** rate-limited route was dead in production — verified live: contact
reveal `429`, `/api/geocode` `429`, the view beacon returning `{counted:false}`.
Photo-upload intents, job applications and both analytics beacons were on the
same path. Only `/api/banner-slots/track` escaped, via an explicit
"skip the limit when unconfigured" guard.

Participating symbols:

- `supabase/migrations/20260725140000_postgres_rate_limiter.sql:consume_rate_limit` — the store. SECURITY DEFINER, `service_role`-only EXECUTE, atomic `INSERT … ON CONFLICT DO UPDATE` mirroring Upstash's `INCR` + `PEXPIRE … NX`: the window is stamped at bucket creation and **not** extended by later hits, so a caller cannot push its own reset forward by hammering. Verified live: 2 allowed then denied at `p_limit = 2`, `reset_at` unchanged across hits, count resets to 1 after rollover, null/zero args rejected
- `supabase/migrations/20260725140000_postgres_rate_limiter.sql:rate_limit_counters` — RLS enabled with **no policies**, and SELECT/INSERT/UPDATE/DELETE revoked from `PUBLIC`, `anon` and `authenticated`. That closes the browser; it does **not** close `service_role`, which keeps its default grants and is `BYPASSRLS` — so any server-side code holding the service key can read/write the table directly, and the definer function is the convention rather than a hard boundary. Swept nightly by the `rate-limit-gc` pg_cron job (buckets are never read after expiry, but the key space grows per (ip, endpoint, listing))
- `src/lib/rateLimit.ts:checkRateLimit` — Upstash when both env vars exist, else Postgres, else in-memory (dev) / **allow** (prod, logged). Because it imports `createServiceClient`, this module is **server-only** — importing it from a client component would pull the service-role client into the browser bundle. All 10 importers today are route handlers (`runtime = "nodejs"`) or the one `"use server"` action `src/app/actions/revalidateListing.ts`
- `supabase/functions/_shared/guards.ts:checkRateLimit` — the Deno twin of the above, same fallback order, same fail-open rule. Calls the same RPC through `createServiceClient()`
- `src/lib/rateLimit.ts:getClientIp` — trusts `x-forwarded-for`. Now load-bearing: the contact limit is keyed on the IP **alone**, so a host that does not overwrite that header at the edge lets a caller mint a fresh bucket per request. Vercel overwrites it
- `src/app/api/listings/[kind]/[id]/contact/route.ts` — **two** buckets per call, both keyed on `subject` = `user:<id>` when signed in, else `ip:<addr>`: `listing-contact:<subject>:<kind>:<id>` at 8/h and `listing-contact-all:<subject>` at 30/h. The per-listing bucket alone bounds nothing — with ~49 active listings a scraper stays inside it while taking the whole catalogue — so the cross-listing bucket is the one doing the work. Keying signed-in users on their own id is what stops anonymous traffic from a carrier NAT starving an authenticated user on the same egress. `device_id` is NOT in either key (client-supplied: rotating it minted a fresh budget per request, so the limit bound only honest clients) but is still written to `contact_reveal_events` for audit. This is friction, not prevention: only Turnstile stops a distributed scrape, and its secret is unset. Its listing lookup uses the explicit `properties_owner_id_fkey` / `services_owner_id_fkey` profile embeds; a lookup error is a `500 lookup_failed`, while only a successful lookup with no active row is `404`. Collapsing an ambiguous-relationship or database error into `404` hides outages as missing listings and breaks contact reveals silently
- `src/lib/turnstile.ts:isTurnstileConfigured` — call-site gate. `verifyTurnstile` must keep returning `false` without a secret; the _caller_ skips it. Making the helper itself return `true` when unconfigured would silently disarm bot protection for every future caller
- `src/app/api/banner-slots/track/route.ts` — its `limiterConfigured` workaround is **gone**; the limit now applies unconditionally, which is only correct because the limiter fails open
- `src/lib/types/database.ts:consume_rate_limit` — hand-added RPC signature (**C3**)
- `scripts/check-production-config.mjs:validateProductionConfig` — must **not** require the Turnstile/Upstash vars. It briefly did, and the Vercel Production build failed on exactly those four names (deploy of `7c915c9`)

**Why fail-open.** Every route behind the limiter enforces its own
authorization (RLS, ownership checks, service-role RPC constraints); the limit
is abuse mitigation, not an access control. Making a store round-trip a hard
dependency of photo upload and job applications converts a transient statement
timeout into "sellers cannot list" — the same shape of failure this contract
documents. The unreachable branch `console.warn`s rather than passing silently.
The accepted cost: an attacker who can induce store errors can bypass the limit.

**Both stores are bounded at 1.5s** (`STORE_TIMEOUT_MS`, and Upstash's
`AbortSignal.timeout`). Without a bound of its own the Postgres path would
inherit the service client's 9.5s fetch timeout and `service_role`'s 8s
`statement_timeout`, i.e. it would burn most of the serverless budget deciding
whether to allow a request that fail-open was going to allow anyway. Losing the
race counts as unreachable; the abandoned request may still increment the
bucket, so a slow call can over-count — the safe direction.

**Known residual risks, accepted rather than fixed:**

- Part of most keys is caller-supplied. `/api/listings/[kind]/[id]/view` spends
  its token **before** checking the listing exists, so any well-formed UUID mints
  a row with a 24h `reset_at`. The hourly `rate-limit-gc` bounds the
  minute-window routes but not that one. This is a property of the key shape,
  which predates this store (Upstash had the same unbounded key space).
- `service_role` can write `rate_limit_counters` directly, bypassing the RPC.
- The contact limits are friction against catalogue harvesting, not prevention.

**The Deno half is a second, separate implementation** —
`supabase/functions/_shared/guards.ts:checkRateLimit` — and it must be kept in
lock-step with the TS one. It had the identical fail-closed bug (`return false`
when `DENO_DEPLOYMENT_ID` is set and Upstash is absent, i.e. on every deployed
function), which took the **public `/search` page** down in production. That went
unnoticed because `src/app/[locale]/search/SearchPageClient.tsx` reaches the
function by **raw `fetch` to `/functions/v1/search`**, not
`supabase.functions.invoke` — so the usual "does anything `invoke` it?" grep
(**C4**) wrongly reads `search` as dead code. The only other raw-fetch caller is
`src/app/[locale]/dashboard/sms/SmsCenterClient.tsx` → `purchase-vip`. Grep for
`functions/v1/` as well as `invoke(` before concluding an edge function is
unused. Because `guards.ts` is bundled per function at deploy time, changing it
requires redeploying **all 17** functions (**C4**), even though only `search`
calls this limiter.

**Breaks silently when:** a caller re-adds a per-request-controllable component
(device id, a header, a body field) to a rate-limit key — the limit then binds
only honest clients; or `rateLimit.ts` is imported from a client component
(service-role key in the browser bundle); or the Turnstile call-site gate is
replaced by making `verifyTurnstile` return `true` when unconfigured; or the
four optional env vars become required again in `check-production-config.mjs`
(the production build fails, prod silently keeps serving the previous commit).

---

## C17 — A cleaner's work lives in TWO tables

**Invariant:** every surface that shows a cleaner their work must read **both**
`public.cleaning_tasks` (platform call-outs, created by a property owner via
`create_cleaning_task`) **and** `public.cleaner_manual_tasks` (off-platform jobs the
cleaner typed in themselves). Reading only the first silently under-reports — the
schedule looks empty and earnings look lower than they are. Same failure shape as
**C9**: two nullable-ish sources, one user-facing total, no compile error either way.

Participating symbols:

- `supabase/migrations/20260725170000_cleaner_manual_tasks.sql:cleaner_manual_tasks` — the table. RLS is ONE policy, `FOR ALL USING (cleaner_id = (select auth.uid()))`, and that is legitimate **only because a manual job has no counterparty**: the cleaner is its sole author, sole reader and sole subject, so there is no authority to derive server-side. The same policy on `cleaning_tasks` would be a security regression — `20260723000000:317-322` dropped its INSERT/UPDATE policies precisely because a platform job's cleaner and price must NOT come from a browser
- `src/lib/cleaner/tasks.ts:mergeCleanerTasks` — the only correct way to combine them; `fromPlatformTask` / `fromManualTask` normalize into `CleanerTaskItem`
- `src/app/[locale]/dashboard/cleaner/loadData.ts:loadCleanerTasks` + `CleanerDashboardClient.tsx` — the overview reads both sources; only platform `pending` rows are calls, while accepted/in-progress rows from both sources are scheduled work
- `src/app/[locale]/dashboard/cleaner/schedule/page.tsx` — reads both, merges, and renders the selected day's timeline
- `src/components/cleaner/CleanerMonthCalendar.tsx` — month-wide projection of that merged list; accepted/in-progress work marks an active day and completed work has a distinct marker
- `supabase/migrations/20260804190000_cleaner_manual_tasks_realtime.sql` — adds the
  manual table to Realtime with full replica identity; overview and schedule both
  subscribe using `cleaner_id`, including cross-device deletes
- `src/app/[locale]/dashboard/cleaner/earnings/page.tsx` — reads both, filtered to `status='completed'`
- `src/components/cleaner/ManualTaskModal.tsx` — the only writer; create + edit, direct table writes (no RPC)

**`status` starts at `'accepted'`, not `'pending'`.** The cleaner books the job
themselves so there is nobody to accept it from, and `'accepted'` is inside the set
the schedule page filters on — a `'pending'` row would be invisible on the very page
that created it. The CHECK deliberately omits `'pending'`, `'declined'` and
`'cancelled'` so that trap cannot be reintroduced.

Platform status changes still use `transition_cleaning_task` and must follow
`accepted → in_progress → completed`; manual rows are cleaner-owned direct updates.
Do not optimistically remove either source when its transition returns an error.

**Two deliberate omissions — do not "fix" without re-reading the migration comment:**

1. **No audit trigger.** `audit_row_change()` snapshots the whole row into
   `audit_logs.new_values`, which the admin log UI renders. These rows hold an
   off-platform third party's name and phone; that PII should not become
   admin-readable because a cleaner kept their own diary.
2. **Nothing about `cleaning_tasks` changed.** Its columns, RLS, triggers and RPCs
   are untouched, so `dashboard_layout_data.cleaning_tasks_count` (cabinet
   derivation), `get_cleaner_renter_counts` (public "renters served" stat) and the
   renter "my calls" list are all unaffected. Putting manual jobs in
   `cleaning_tasks` instead would have corrupted **all three**.

The original migration omitted Realtime; `20260804190000` deliberately reverses
only that choice because overview/schedule cross-device consistency is now required.

**Also check:** `src/lib/types/database.ts` carries the `cleaner_manual_tasks` block
(hand-added — **C3**), and the migration ends with `notify pgrst, 'reload schema'`
because PostgREST caches the table catalogue.

**Breaks silently when:** a new cleaner-facing surface queries only
`cleaning_tasks` (totals and calendars under-report, nothing errors); or a manual row
is written with `status='pending'` (invisible on the schedule); or someone "unifies"
the two tables by relaxing `cleaning_tasks.property_id`/`owner_id` to NULL — that
re-opens the browser write path the security remediation closed, fires the
owner-notification triggers back at the cleaner, and leaks manual rows into the renter
and cabinet-derivation queries listed above.

---

## C18 — Owner SMS automation: templates, links, and the three billing paths

**Invariant:** the automation pipeline is held together by seven couplings no call-graph tool can
see: (1) the message templates and their bracket placeholders exist ONLY in the Deno function's
pure `domain.ts`; (2) the public-listing URL logic and the phone-normalisation logic are
DUPLICATED into Deno because `src/` cannot be imported there; (3) `sms_outbound` carries THREE
mutually exclusive billing paths over one table; (4) `automation_kind` is NULL for broadcast and
contact rows, so every predicate over it must be `IS TRUE` / `IS NOT TRUE`; (5) queued automation
is a credit reservation but is charged only after provider success; and (6) the cron GUCs, edge
secrets, delivery kill switch, and `config.toml`'s `verify_jwt` must agree; and (7) the renter's
win-back preview calls the same pure message builder as the scheduled function, so that module must
remain browser-safe as well as Deno-safe.

Participating symbols:

- `supabase/functions/sms-automation-run/domain.ts:TEMPLATES` — the ONLY live templates. Four
  entries: the three spec texts plus `win_back_fallback`. Placeholders are the spec's own
  `[Bracket]` names. The fallback is used when EITHER win-back field is empty after trim, so a
  half-filled `([Discount_Period])` can never render
- `src/app/[locale]/dashboard/sms/SmsCenterClient.tsx:buildWinBackPreview` — the renter's read-only
  win-back bubble delegates to the pure domain module's `buildWinBack` with display-only guest/link
  placeholders and the in-flight discount fields. The surrounding message stays Georgian in every
  dashboard locale because that is the actual outbound language; only the placeholders and
  explanatory UI are localized
- `src/lib/utils/listingUrls.ts:propertyViewUrl` — the source of the 3-way sale/hotel/apartment
  logic duplicated into `supabase/functions/sms-automation-run/domain.ts:propertyViewPath`. The
  sale branch is unreachable while the scans are rental-only but is kept so the two match
- `supabase/functions/sms-automation-run/domain.ts:toCanonicalGePhone` and
  `supabase/migrations/20260801131000_sms_queue_hardening.sql:sms_canonical_ge_phone` accept only
  an exact 9-digit Georgian mobile or the same number prefixed by 995 after punctuation removal.
  Extra legacy digits are rejected, never truncated. The same definition is used for recipients,
  opt-out matching, and manual re-booking checks
- `supabase/migrations/20260801131000_sms_queue_hardening.sql:sms_enqueue_automation` — dedup
  lives in the DB. Both uniqueness guarantees are PARTIAL indexes, and ON CONFLICT will not infer
  a partial index as arbiter unless the statement repeats the predicate, which PostgREST's
  `on_conflict=` cannot supply (42P10). The body BRANCHES per source so each ON CONFLICT names its
  own partial index; a single OR-ed form cannot name two arbiters
- `supabase/migrations/20260801131000_sms_queue_hardening.sql:sms_claim_dispatch_batch` —
  token/lease-based atomic claiming, `IS TRUE` / `IS NOT TRUE`, and per-sender ranking against
  balance minus active claims. `sms_enqueue_automation` also serializes per sender and refuses
  to create more active automation rows than the current balance
- `supabase/migrations/20260801131000_sms_queue_hardening.sql:sms_mark_claim_sent` — finalizes
  only the matching claim token and charges exactly 1 credit, ONLY for automation kinds with
  `charged_at IS NULL`. **MUST NOT raise on insufficient
  credit:** the SMS is already delivered by then, and raising would leave the row `approved` for
  the next run to RE-SEND
- `supabase/migrations/20260726110000_sms_automation_rpcs.sql:sms_expire_stale_automation` — the
  per-kind expiry sweep (36h / 7d / 30d from `created_at`). Its ONLY caller is
  `supabase/functions/sms-dispatch/index.ts`, which calls it FIRST so `sms_dispatch_batch` needs
  no time predicate of its own
- `supabase/migrations/20260802120000_controlled_sms_and_price_drop.sql:sms_outbound_controlled_origin_check`
  — retires owner-authored broadcast/contact SMS, marks legacy free-text rows explicitly, revokes
  the old broadcast/audience/credit RPCs, and prevents any new NULL-`automation_kind` origin
- `supabase/migrations/20260611000100_notification_sms_helpers.sql:_enqueue_system_sms` — the
  free path (`vip_activation` / `vip_expiry` / `subscription`); never charged
- `supabase/functions/sms-dispatch/index.ts:sendSms` — the single provider integration point.
  Returns `skipped` unconditionally and includes `sms_outbound.id` as the provider idempotency
  key contract. `SMS_DELIVERY_ENABLED` must equal `true` before any row is even claimed; otherwise
  dispatch performs maintenance and fails closed with zero sends
- `supabase/migrations/20260726100000_sms_automation_schema.sql:check_in_time` — `properties`
  has `time NOT NULL DEFAULT '14:00'`; the SMS controls do not expose timing and the three trigger
  offsets are fixed by CHECK constraints at 24 hours / 24 hours / 90 days
- `supabase/migrations/20260726120000_manual_booking_consent.sql:create_guest_manual_booking` —
  its inner call to `create_manual_booking` is NAMED, not positional. A positional 12-arg call
  plus a defaulted 13th parameter silently records `false` for every booking made from the guests
  page
- `supabase/migrations/20260804140000_manual_booking_finance_verified_sms_consent.sql` — replaces
  owner-attested consent with one guest-token authority. The three legacy RPCs retain and ignore
  `p_marketing_consent`; only `respond_manual_booking_sms_consent` can opt a booking in. The audit
  table stores a SHA-256 token hash, never plaintext; issuing a new link revokes older links and
  clears any earlier positive consent while the replacement is pending, while
  a phone change or cancellation revokes the link and clears consent. Legacy checked rows become
  `legacy_unverified`, and only queued `review_request` / `win_back` rows are retired — `check_in`
  remains transactional. `src/app/api/renter/manual-bookings/[id]/sms-consent-link/route.ts` is the
  owner-authenticated issuer/status projection; `src/app/api/sms-consent/[token]/route.ts` hashes
  the URL token before every service-role read/write and accepts only accept/decline/revoke
- `src/app/api/sms/automation/route.ts:RULES_COLUMNS` exposes only the three toggles and two
  win-back parameters. PATCH calls `sms_set_automation_rules`, which takes the same advisory lock
  as dispatch and atomically cancels queued text built from changed configuration
- `src/lib/sms/sender-access.ts:canUseSmsCenter`, the dashboard nav, the page guard, the API guard,
  and the rules SELECT policy all require an owned rental listing. Seller/sale-only listings do
  not receive this module; their separate price-drop SMS belongs to the sales domain
- `supabase/migrations/20260801132000_schedule_sms_pipeline.sql` replaces the unapplied legacy
  scheduler and creates booking-finalize at 05:50 UTC, automation at 06:00 UTC (10:00 Tbilisi),
  and dispatch every 10 minutes. It refuses to apply unless all six URL/secret values exist in
  Supabase Vault. Hosted Supabase does not permit the project `postgres` role to persist custom
  `ALTER DATABASE ... SET app.*` GUCs, so the cron commands read `vault.decrypted_secrets` at runtime
- `src/lib/content-change/fields.ts:REVIEWABLE_FIELDS` — `check_in_time`, `marketing_consent` and
  `marketing_opt_out` are deliberately ABSENT. Manual-booking consent is nevertheless guarded:
  owner RPC arguments are ignored and the guest token response is its only opt-in writer

**Also check:** **T1 is pinned to `check_in = today + 1`** in Tbilisi because the template hardcodes "ხვალ"
(tomorrow), and `sms_expire_stale_automation`'s 36-hour `check_in` window depends on that pinning
— change one and the other MUST change. The legacy timing columns remain only for schema compatibility
and are fixed by constraints. **Effective consent lives on the two booking tables; manual-booking
proof and lifecycle live in `manual_booking_sms_consents`**. Online bookings are different: the guest
submits their own checkbox to `booking-create`, whose seven-argument `create_booking` RPC writes
`bookings.marketing_consent`; an owner-created manual booking can never use that authority.
**T2 (review request) queues zero rows by construction** and that is
correct: its link requires a `bookings` row whose `guest_id` matches the logged-in user, which an
offline guest can never have (follow-up `sms-f10`). Both SMS functions are `verify_jwt = false` in
`supabase/config.toml` and in the deployment; the pg_cron caller sends a shared Bearer secret, not a
JWT, so flipping either side to `true` silently 401s the job.

**Breaks silently when:** someone reintroduces owner-authored templates or moderation routes around
the controlled-origin constraint; or a new predicate over `automation_kind` uses a bare `IN`
(NULL is not FALSE, so explicit legacy rows disappear from maintenance queries); or a second
charge path is added without checking `charged_at` (double-billing, since three billing paths share
one table); or `propertyViewUrl` / the canonical-phone contract changes without both Deno and SQL
copies changing (links point at the wrong route, or opt-out and re-booking checks stop matching); or a Vault value
is set to a different value than its edge secret (the cron job reports SUCCESS while the function
401s and `sms_outbound` never gains a row — the hardest failure here to notice); or `sendSms` is
implemented without a provider idempotency key (the at-least-once retry duplicates a delivered
message — `sms-f2`).

---

## C19 — Notification `dashboard_scope` (one string, five layers)

**Invariant:** every dashboard notification carries a `dashboard_scope` naming the cabinet it belongs
to, and that string must agree across **five** layers that nothing type-checks together: the DB CHECK
constraint, the TS union, the writers (DB triggers + edge functions + admin API routes), the readers
(scoped bells/feeds), and the per-cabinet badge counts. `NULL` is reserved for global/account-wide
notices and is **deliberately invisible inside every cabinet feed** — it is not a safe default.

Participating symbols:

- `src/lib/notifications/scopes.ts:DASHBOARD_SCOPES` — the 10-value TS union; must equal the CHECK set
- `src/lib/notifications/scopes.ts:dashboardScopeFromRoute` — URL segment → scope, including the aliases
  that do **not** match their route (`sms` → `renter`, `service`/`handyman` → `services`)
- `src/lib/notifications/scopes.ts:serviceCategoryToDashboardScope` — the service-category mapping the DB
  trigger functions duplicate in SQL; both copies must move together
- `supabase/migrations/20260727160000_explicit_payment_notification_scope.sql:dashboard_scope_for_path`
  — SQL twin of `dashboardScopeForPath`, turns `payments.return_path` into a scope
- `supabase/migrations/20260727160000_explicit_payment_notification_scope.sql:dashboard_scope_for_listing`
  — owner-scoped listing → cabinet; **not STRICT**, and the owner predicate is required, not decorative
- `supabase/migrations/20260727180000_admin_queue_notifications.sql:_notify_admins`
  — the ONLY writer of `dashboard_scope='admin'`, and the repo's only admin _enumeration_
- `supabase/migrations/20260727130000_scoped_dashboard_notifications.sql:assign_notification_dashboard_scope`
  — BEFORE INSERT safety net; **since 20260727160000 it covers ONLY the seller branch**
- `src/lib/hooks/useNotifications.ts:useNotifications` — scoped bell/feed reader; also owns `markAllRead`
- `src/components/layout/DashboardShell.tsx:recountUnread` — live per-cabinet badge recount
- `src/app/[locale]/dashboard/layout.tsx:LayoutData` — reads the `unread_counts` jsonb key

**There is no longer ANY fallback for `payment_success`.** `20260727160000` deleted the trigger's
inference block, because it read "the user's most recent transaction with a non-null `reference_id`",
which is not a fact about the notification being inserted — and `topup_balance` writes no
`reference_id`, so a wallet top-up was attributed to the buyer's **previous listing purchase**. All
three writers (`topup_balance`, `purchase_vip`, `purchase_package`) now pass the scope explicitly.
The consequence to know: a NEW writer that forgets `_notify`'s sixth argument silently lands NULL
(global). That is deliberate — an honest gap beats a confident lie — but nothing will catch it for you.

**NULL means two different things, and only one of them is a bug.** NULL is the _correct_ value for a
genuinely account-level event (an admin wallet bonus, an SMS package, a profile-target content change):
those have no cabinet, and inventing one produces a notice rendered by no surface while still
incrementing a badge nothing can clear. NULL is a _defect_ when a cabinet-specific writer simply forgot
to pass it. Same value, opposite meanings — read the writer before "fixing" a NULL.

**`dashboard_scope_for_path` deliberately does NOT map `admin`, unlike its TS twin.** The TS helper
reads routes and needs it; the SQL one converts **client-supplied** `payments.return_path` into a
persisted scope, so mapping `admin` would let any user mint an admin-scoped notification for themselves
by posting `return_path: "/dashboard/admin"`. Keep the two divergent in that one direction only.

**`_notify` is now SIX arguments with the scope defaulted, and there is exactly ONE overload.** Two hard
Postgres rules force that shape, both verified empirically against this database:

1. A non-defaulted parameter may not follow a defaulted one — `42P13` at CREATE time.
2. Given the default, keeping a separate five-argument overload makes every existing five-argument call
   fail at RUNTIME with `42725 function public._notify(...) is not unique`.

So the five-argument form was **dropped**, not preserved (`pg_depend` showed zero hard dependencies).
Legacy five-argument callers bind to the six-argument function and default the scope to NULL. **Never
re-add a five-argument `_notify`** — it reintroduces the ambiguity for every caller at once.

**`dashboard_layout_data` returns `unread_counts` (jsonb object keyed by scope), NOT the old scalar
`unread_count`.** A missing key reads as `{}` → no badges, which is the safe degradation; nothing else
in the DB or `src/` reads the old key.

**Realtime must stay filtered on `user_id`, never on `dashboard_scope`.** Realtime supports one filter;
swapping it for `dashboard_scope=eq.<scope>` drops the per-user predicate, and the "Admins full access
notifications" RLS policy then delivers _other users'_ notifications into an admin's own feed. The scope
is applied client-side in the payload handler instead.

**Also check:** `src/lib/types/database.ts` must carry `dashboard_scope` on `notifications` (**C3**), and
the migration ends with `notify pgrst, 'reload schema'`.

**`admin` now HAS a writer.** Until `20260727180000` it was a cabinet nothing could write to — in the
CHECK, in the union, subscribed to by `AdminTopbar`, and produced by nothing, so the bell was
structurally empty. `_notify_admins` fills it from four queues (listing moderation, content-change
review, SMS approvals, company verification), each fanned out to every admin **except the actor**.
Two behaviours are deliberate and will look like bugs if you don't know them: (1) the fan-out is
**coalesced** on `(recipient, type, still unread)`, so while a notice is unread later arrivals in that
same queue are silent and the message names the item that armed the signal rather than the backlog —
the exact count lives in the polled sidebar badge; (2) marking read **re-arms** the queue.

**Breaks silently when:** a value is added to `DASHBOARD_SCOPES` but not the CHECK (23514 at runtime
only) or vice-versa (a cabinet nothing can ever write to); or a new notification writer omits the scope
(it lands NULL and is invisible in every cabinet, visible only in the global `/notifications` inbox —
and since `20260727160000` there is no `payment_success` fallback to catch it); or the realtime filter
is "simplified" back onto the scope column; or a bulk read-write loses its `user_id` predicate — the
"Admins full access notifications" policy is `FOR ALL`, so for an admin viewer that marks **every**
user's rows read. That predicate lives in `useNotifications:markAllRead`; the bell must not re-implement
the write itself.

---

## C20 — Manual booking cancellation is reversible state, not deletion

**Invariant:** a renter-calendar cancellation updates `manual_bookings.status` to `cancelled`; browser
clients never delete the row. `cancel_manual_booking` and `restore_manual_booking` serialize first with
the SMS dispatch advisory lock and then the property advisory lock, so queue eligibility and inclusive
`calendar_blocks` cannot drift from the booking. Both RPCs are owner-scoped and idempotent.

Participating symbols:

- `supabase/migrations/20260804130000_manual_booking_cancellation_history.sql` — cancellation columns,
  state CHECK, both RPCs, restore-with-edits in `update_manual_booking`, history index, review-token and
  SMS revalidation guards
- `supabase/migrations/20260804131000_manual_booking_write_hardening.sql` — removes authenticated direct
  INSERT/UPDATE/DELETE after the web RPC rollout; SELECT remains owner-RLS protected
- `public.audit_logs` / `public.audit_manual_booking_change` — canonical immutable activity source;
  it stores complete before/after booking snapshots and actor attribution. Renter access stays behind
  the sanitized server endpoint, never a broad audit RLS policy
- `src/app/api/renter/calendar/history/route.ts` — verifies property ownership with the service client,
  keyset-paginates audit rows, and whitelists booking/actor fields rather than returning raw snapshots
- `src/app/[locale]/dashboard/renter/calendar/page.tsx` and
  `src/components/renter/BookingHistoryDrawer.tsx` — active calendar excludes cancelled rows; history can
  restore them, and an occupied original range opens the existing edit form for restore-with-new-dates

Cancelled manual stays must also be absent from renter guest visit projections, SMS candidate and
re-booking queries, and review-token use. Safe unclaimed queued SMS are failed and detached from the
source uniqueness key on cancellation; claimed/submitted/sent rows are not rewritten. A later restore
may therefore enqueue fresh future automation without resending a retired message.

Legacy `DELETE` audit events remain visible as `legacy_deleted` but are never restorable because the
source row and its foreign-key state no longer exist. There is no cancellation reason, restore expiry,
or team permission expansion in this contract.

---

## C21 — Restaurant discounts are review-gated and charged on approval

**Invariant:** submitting a restaurant discount creates or refreshes one pending
`content_change_requests.request_kind='food_discount'` row. Submission quotes price and duration from
the selected enabled pricing package but does not change the service or balance. Only
`approve_food_discount_request` may approve it; that RPC locks the request, restaurant, and balance,
then charges once and activates the discount in one transaction.

Participating symbols:

- `supabase/migrations/20260804180000_food_discount_admin_review.sql` — request metadata, specialized
  submit/approve RPCs, transition guard, legacy proposal conversion, and `public_services.has_active_discount`
- `src/app/api/food/discount-requests/route.ts` — owner-authenticated submit/status endpoint
- `src/app/api/admin/content-change-requests/[id]/route.ts` — dispatches food approvals to the specialized
  RPC; the general content RPC cannot approve this request kind
- `src/components/dashboard/FoodDiscountRequestModal.tsx` and the food dashboard/order/balance surfaces —
  collect percent/quantity and show pending or payment-required state
- `src/app/[locale]/page.tsx`, `src/app/[locale]/food/page.tsx`, and
  `src/lib/data/getCachedPublicListing.ts` — order currently active discounts before VIP and recency

The quote is fixed when submitted. If the balance becomes insufficient before review, approval returns
`payment_required`, keeps the request pending, records `payment_error`, and creates at most one payment
notification until the request is refreshed. A later retry can approve it. Approved requests are
terminal; `transactions.reference_id=request.id` provides the exactly-once billing identity.

Legacy pending `menu.promotions` proposals are converted only when a valid percent can be parsed; other
legacy proposals are superseded and their original payload remains in request metadata. A discount is
publicly active only when percent is positive and expiry is in the future.

**Breaks silently when:** a UI calls `purchase_package` directly for a restaurant discount (bypasses
review); general content approval is allowed to transition `food_discount` rows (can activate without a
charge); a public query orders raw `discount_percent` instead of `has_active_discount` (expired offers
stay promoted); or submit-time and approval-time prices are recomputed independently (reviewed amount and
charged amount diverge).

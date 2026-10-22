# Cross-cutting Contracts

Invariants held by **string keys, generated code, or wire shapes**: couplings invisible to call-graph tools (change one side → change the other). Before editing a symbol, read its section and grep it repo-wide. Anchors: `path:symbol`.

Condensed 2026-10-17 from ~318K characters: invariants, anchors, **Breaks** and **Prod order** stay; incident notes, measurements and ledger ids are in `docs/contracts-history.md` (frozen, not loaded) and git. "(staging)" = not on prod yet. A section's checks: grep its `Cnn` in `scripts/check-contracts.mjs` and `check-db-contracts.mjs`; tests are in `scripts/unit/` and `e2e/`.

---

## C1 — i18n key parity & namespace scoping

**Invariant:** `messages/{ka,en,ru}.json` have identical keys; each namespace a public component uses is in `src/i18n/namespaces.ts:PUBLIC_NAMESPACES` (also `DASHBOARD_`/`CREATE_`/`AUTH_NAMESPACES`). Guard: `scripts/check-message-parity.mjs`. **Breaks:** key in one catalog; unlisted namespace.

## C2 — Locale set

**Invariant:** `src/i18n/routing.ts:routing.locales` is echoed in middleware, message import, navigation; `localeCookie: false` is load-bearing (CDN caching). **Breaks:** locale without `messages/<locale>.json`; `localeCookie` on (Cloudflare BYPASS).

## C3 — DB schema ↔ generated types

**Invariant:** migrations are the source; `src/lib/types/database.generated.ts` is generated (`npm run types:gen`, `types:check`; never hand-edit), overrides go in `database.ts`. Regenerate after every migration; it carries staging-only objects, so not from prod before staging's schema ships (C24). **Breaks:** regen missed; generated file edited.

## C4 — Client ↔ Edge Function wire contract and cron

**Invariant:** `supabase.functions.invoke("<name>", { body })` couples name and body (untyped; validated at runtime); functions are in `config.toml`; `_shared/guards.ts` is bundled per function (redeploy all 16); the limiter fails open; CORS is exact-match; pg_cron uses a bearer token (`verify_jwt=false`).

**Key:** `auth-send-sms` is called by the Auth Send SMS hook (C48): redeploy it with `_shared/ubill.ts` and `sms-automation-run/domain.ts`. Every pg_cron HTTP job sets `timeout_milliseconds`; `check-db-contracts` C4 expects 12 active jobs (SQL-only jobs need no timeout). `payment_failed` only via `_shared/payment-failure.ts:isPaymentFailure`. The purge job needs Vault `app.ownership_purge_url` + `app.ownership_purge_secret` and DO secret `OWNERSHIP_PURGE_SECRET_SHA256`. Search availability (`20261016120000`, STAGING): `search_blocked_property_ids(p_from,p_to)` (INVOKER, `search_path ''`, service_role only), called once by `search` (`check-contracts` C4/search).

**Prod order:** purge route + Vault + env var before its migration; `20261016120000` BEFORE redeploying `search`. **Breaks:** a renamed function/field; a missing CORS origin or cron secret; a schedule outside the C4 list; an HTTP job without timeout; `search` before its migration.

## C5 — Storage buckets

**Invariant:** the bucket id agrees in upload code, migration + RLS and CSP/`remotePatterns` (C6). Buckets: `property-photos`, `avatars`, `landing-media`, `restaurant-menus`, `content-change-media`, `media-quarantine`; private `ownership-documents` (C39), `finance-documents` (C42).

**Key:**

- `property-photos` client INSERT only at `<auth.uid()>/<file>`; uploads are `upsert:false`, never move/copy/update; client UPDATE policies only `avatars owner update`, `landing-media admin update` (unpinned ones OR across buckets).
- Menu PDFs: judged by bytes via `src/lib/menu-pdf.ts:readMenuPdf`, never `file.type`; `MAX_MENU_PDF_BYTES` = bucket limit (10 MiB); each `.from("restaurant-menus").upload(` stores `X.bytes` of `readMenuPdf` (`check-contracts` C5).
- Private buckets: NO `storage.objects` policy; service-role routes write; 60 s signed URLs without `download`; `src/lib/ownership/purge.ts` is the only ownership deleter; finance documents are voided, never deleted.
- Public buckets have no bucket-wide SELECT; `public buckets: own objects readable` and `landing-media admin read` are load-bearing (avatar upsert, `remove()`).
- Triggers `enforce_storage_upload_budget` (per owner per 24 h; `owner_id` NULL and admins exempt) and `enforce_storage_object_mime` (only under role anon/authenticated: signed-upload test inserts run as service_role); `check-db-contracts` C5 asserts both and an empty anonymous listing.

**Breaks:** a bucket renamed in code only; unpinned upsert/move; trusting `file.type`; a policy naming a private bucket, or bucket-only SELECT/ALL on a public one; owner SELECT dropped; a client INSERT policy without the folder pin; the mime trigger checking every role (breaks signed uploads).

## C6 — CSP & external origins

**Invariant:** every external host is in BOTH the middleware CSP and `next.config.ts` `remotePatterns`. Supabase hosts come only from `src/lib/media-hosts.ts:SUPABASE_MEDIA_HOSTS` (also `src/lib/banner-creative.ts`), never `*.supabase.co`; prod = `PROD_SUPABASE_HOST` (eu-central-1), Tokyo = `LEGACY_PROD_SUPABASE_HOST` until its rows are rewritten and it is deleted; `NEXT_PUBLIC_SUPABASE_URL` is RUN_AND_BUILD_TIME. Mapbox GL needs `worker-src 'self' blob:`; `api.mapbox.com` is in `img-src` + `remotePatterns` for `staticMapUrl.ts` (plain `<img>`). `images.qualities: [75]`. **Breaks:** host on one side; hard-coded Supabase host; URL env BUILD_TIME only (every photo 400s).

## C7 — Realtime publication coverage

**Invariant:** a `postgres_changes` sub receives only if the table is in `supabase_realtime` and RLS allows SELECT; filtered subs never see DELETEs, so refetch after delete/cancel. The bell total is INSERT +1, a debounced head-count after UPDATE and on mount; a deleting path must recount. **Breaks:** table not in the publication; relying on realtime for your own write.

## C8 — Protected-route gating (roles)

**Invariant:** `/create/*` and `/dashboard/*` are gated in middleware; server admin via `requireAdmin`; RLS in the DB; all in sync. Middleware and `getCurrentUser` share the transient-auth predicate (`src/lib/with-timeout.ts`, `GET_USER_TIMEOUT_MS`).

**Key:** a layout `redirect()` does not keep its page's payload out of the response, so a page reading with the service role calls `isAdminViewer()` first (`check-contracts` C8). The matcher skips only a dot in the LAST segment and `_next(?:/|$)`; `/api/:path*` always runs; both protected-route tests read `decodedPathname`. A 429 `AuthApiError` is transient; `refusalAwareFetch` + `dropsDeletion` keep the cookie. Login `next` goes through `stripLocalePrefix(next, routing.locales)` (`src/lib/security.ts`), then `safeNextPath`; `/auth/callback` and `/auth/confirm` carry no `next` (Google sign-in lands unprefixed for en/ru, not fixed). `scripts/unit/role-routing.test.mjs` pins one role→dashboard map (`roleHomePath`), the wizard's no-role-UPDATE rule and profile-less → `/auth/register`.

**Breaks:** a prefix forgotten; gates drifting; a page trusting its layout; a prefix or dotted-anywhere matcher test; raw-pathname tests; a cookie-reading client without `refusalAwareFetch`; `next` unstripped (en/ru 404) or unvalidated (open redirect).

## C9 — Favorites dual reference

**Invariant:** `public.favorites` has exactly one of `property_id`/`service_id` (CHECK); no `listings` table. **Breaks:** reading only `property_id`.

## C10 — Discount badge duration & expiry

**Invariant:** `discount_percent` + `discount_expires_at` are written only by `purchase_package`'s discount tier (trigger-guarded, 1–90 %) and `admin_change_listing_promotions` (C44; NULL expiry = permanent), cleared by cron. Active = `discount_percent > 0 AND discount_expires_at > now()`: use `isDiscountActive` + `applyDiscount`. Food: C21. **Breaks:** direct update (42501); checking percent alone.

## C11 — Company listing linkage

**Invariant:** `properties.organization_id` is the sole listing-org link (sales only), gated by enforcement (active plan + quota) and prevent-change; personal = `owner_id = uid AND organization_id IS NULL`. `enforce_org_listing_rules()` counts under `pg_advisory_xact_lock(hashtextextended('org-listing-limit:' || organization_id, 0))`. `admin_change_company_plans` (C44) grants only to an `active` org without a plan, then `_auto_link_org_sale_listings`. **Breaks:** a payload always carrying `organization_id`; a rental on an org; the function re-created from an older body.

## C12 — Banner placement registry

**Invariant:** `src/lib/banner-placements.ts:BANNER_PLACEMENTS` (12 ids incl. `mobile_strip`) is the sole source: the same string in CHECK, admin forms, mounts, renderer. Whether a creative shows is ONE rule, `selectLiveCreatives`, replayed by `fetchSlotCreatives` and the admin pages. Ads are whole Tbilisi days (`tbilisiDayStart/End`, never `new Date("YYYY-MM-DD")`); banner POST/PATCH answer 400 `media_required` for media-first placements; media URLs = CSP ∩ `remotePatterns` (C6). **Breaks:** an id missing from the CHECK (23514), unmounted or hard-coded; a second "is it live" rule.

## C13 — `property_type` enum fan-out

**Invariant:** 8 values (apartment, cottage, hotel, studio, villa, land, flat, house). Tripwires `PROPERTY_TYPE_LABEL_KEYS`, `PROPERTY_TYPE_LABEL_KA`. Silent participants: `database.ts`, sale `PROPERTY_TYPES`/`typeOptions`, rental `propertyTypeOptions` (no land), `FilterPanel`, `SaleSearchBox`, `/apartments` `.in("type")`, `search/page.tsx`, admin dropdown + route allow-list, `SEARCH_PROPERTY_TYPES` (`src/lib/support/actions.ts`), `listing-options.ts`, `FACT_TYPES`, `parseRentSearchParams` (`SEARCH_TYPE_VALUES`, else 22P02). Create forms no longer offer `studio`. **Prod order:** `20261006190000` before the app. **Breaks:** one list missed; form/route allow-lists drifting.

## C14 — Editorial review gate for public content

**Invariant:** the browser cannot UPDATE public-content columns (trigger 42501); it queues `content_change_requests`. The reviewable list lives in four places that must agree: `fields.ts`, the trigger, the approve function, `content_review_gate_column_drift`. Self-service exceptions: `marketing_*` consents, `terms/privacy_accepted`, `check_in_time`, profile identity fields. Approval is bound to the loaded version: the page sends `expectedUpdatedAt: item.updated_at`; the `[id]` route compares `pending.updated_at !== body.expectedUpdatedAt` (strings) before any approve RPC. **Breaks:** a field in one list; a direct write; a `Date.parse` comparison.

## C15 — Smart Match actionable count

**Invariant:** one definition, `smart_match_actionable_count()` (status='active', check_out ≥ today, no offer by the caller); surfaces and the trigger `enforce_smart_match_request_rules` (≤ 5 open, 10 per 24 h; client rows `active`, only → `cancelled`; `zone` NULL or an existing `zones.name_ka`; 22023) repeat it predicate for predicate. CHECKs `smart_match_requests_dates_range` (2020..2100) and `smart_match_requests_budget_range` (`20261016140000`, STAGING; `check-contracts` C15/ranges). **Prod order:** `20261016140000` first (refuses 55000 on bad rows). **Breaks:** predicate drift; CHECKs dropped; zone renamed.

## C16 — Rate-limit backend & fail-open contract

**Invariant:** `src/lib/rateLimit.ts:checkRateLimit` is the only limiter and fails OPEN. Client IP = `src/lib/client-ip.ts:getClientIp`: LAST `X-Forwarded-For` hop; a peer in `CLOUDFLARE_IPV4_RANGES`/`CLOUDFLARE_IPV6_RANGES` (re-sync from cloudflare.com/ips) → `CF-Connecting-IP`; never the first hop or `DO-Connecting-IP` (the Deno twin `_shared/guards.ts` still reads the first). `ipv6Net64` + `checkNet64RateLimit` add a `<scope>:net64:<prefix>` bucket (8×) after the per-address check on job-application, signed-out support, anonymous reveal, geocode and media finalize. `finalize` claims `pending → scanning` first and every failure exit releases it. **Breaks:** a fail-closed limiter; first-hop trust; stale ranges; /64 before per-address; a finalize exit without the release.

## C17 — A cleaner's work lives in TWO tables

**Invariant:** cleaner surfaces read `cleaning_tasks` (platform) AND `cleaner_manual_tasks` (self-entered, 'accepted' on create); realtime on both; 30-minute slot conflict on both (advisory lock per cleaner); the platform half's apartment/owner come from `get_my_cleaning_task_owner_details()` (C24) as `mergeCleanerTasks`'s third argument (`src/lib/cleaner/tasks.ts`). **Breaks:** reading one table; pending manual row; skipping the 30-minute check.

## C18 — Owner SMS automation: templates, links, billing

**Invariant:** templates live only in `supabase/functions/sms-automation-run/domain.ts:TEMPLATES` (Node- and Deno-safe; the app imports it); URL/phone logic is duplicated (TS + Deno), `sms_canonical_ge_phone` in trigger AND Deno. Credit is taken when uBill accepts a message and returned only on a failure report.

**Key:**

- **Billing** (`20261007150000`): check_in, review_request, win_back, price_drop, consent_request debit in `sms_mark_claim_submitted` (`charged_at`); `sms_mark_provider_undelivered` refunds only on `report_status` 2/4; the delivery charge keeps its `charged_at is null` branch. The kind list must match in `sms_claim_dispatch_batch` (x2), `sms_mark_provider_delivered`, `sms_mark_claim_submitted`, the consent credit check and `sms_expire_stale_automation`.
- **Mirror** (`20261001130000`–`130200`): kind `'notification'` is FREE, in no charged list; trigger `notifications_enqueue_sms`; only `sms_notification_types()` ⊆ `email_notification_types()` (never `smart_match_request`, `broadcast`, `admin_*`, `vip_*`); text `MyBakuriani: ` + title ≤ 57 chars; caps by try-lock only; `source_notification_id` unique; `@e2e.mybakuriani.test` never texted. Number = `profiles.phone`; `cleaning_task_new` only, if empty (e-mail sign-ups) the newest active cleaning listing's `services.phone` (`20261022140000`), before the caps (`check-contracts` C18/call-out number). A purchase texts once (`payment_success` first, then `_enqueue_system_sms` removes that mirror row). `POST /api/admin/listings/moderate` notifies only on a real status change.
- `notify_cleaner_of_new_task` (`20261007120000`) rewords its mirror row (link host Vault `app.site_url`). `request_manual_booking_sms_consent` (service_role) is the only `manual-sms-v2` token issuer and returns no token, link or message; `/api/sms/history` masks `/sms-consent/` links.
- The price-drop text is SQL and `fixedTemplate` (`messages/*.json`) repeats it; typed text goes through `plainText` / `public._notice_text` (C33).
- **Pin/build** (`20261016130000`, STAGING): finite pins, CHECKs `properties_location_{lat,lng}_range` + `organizations_location_{lat,lng}_range`, `enqueue` takes a thunk, a 42501 from `sms_create_manual_review_token` skips the booking (`check-contracts` C18/pin). Price-drop cap: trigger `sale_price_alert_subscriber_cap` = `MAX_SUBSCRIBERS_PER_LISTING` (50) under an advisory lock (P0001 `subscriber_limit_reached` → 409). A new `automation_kind` also goes into `sms_finance_category` + `SMS_KIND_KEYS` (C50); codes (C48) never use `sms_outbound`.
- **No SMS in the food and transport dashboards** (2026-10-17, UI only; `check-contracts` C18/cabinets): `src/lib/dashboard/cabinetSms.ts:showsSms` (`CABINETS_WITHOUT_SMS` = food, transport) hides the top-bar `N SMS` chip, the wallet SMS balance, the SMS packages and the "SMS" wording (transport's tile is `DashboardShared.stats.spentVip`). Food's own files carry no SMS; transport shares `ServiceTopbar` (`DashboardShell` passes `showSms`), `service/balance`, `ServiceDashboardClient` and `service/parameters` with entertainment, employment and services, which keep SMS. The backend still sells SMS (the wallet and `balances.sms_remaining` are account-wide); the public header chip and `/dashboard/account` are unchanged.
- **Consent follows the number, per host** (`20261022150000`, STAGING; `check-contracts` C18/consent): one standing answer per owner + canonical number. `manual_sms_consent_inherit` is its ONE definition (a link-issued `accepted` row, not v1, not inherited, on another live booking of the host with the number, no later `declined_at`): it gives a booking an `accepted` row `manual-sms-v2-inherited` (random hash nobody holds, `accepted_at` = the guest's) + its `marketing_consent`, from `manual_bookings` triggers `…_follow_ins/_upd/_del` (grant best effort) and from `respond_manual_booking_sms_consent` on accept (`manual_sms_consent_cover`: open bookings with no row for the number). The review/win-back texts have no opt-out, so the guest's link is the only withdrawal: when the last link-issued source is cancelled, re-phoned or deleted, `manual_sms_consent_reconcile` withdraws the inherited rows (revoked WITHOUT `accepted_at`, else the route reads a guest withdrawal), and a guest decline/revoke withdraws every accepted row of that host + number; both clear flags and fail queued review/win-back. The panel and `request_…` still read the booking's own latest row.

**Prod order:** mirror after the pending batch; `20261007120000` after C24, with Vault `app.site_url`; `20261016130000` (refuses 55000), then redeploy `sms-automation-run` + `auth-send-sms`; `20261022140000` (refuses 55000) after the mirror; `20261022150000` (refuses 55000) after `20260927091100`. **Breaks:** template/phone logic on one side; the kind in a charged list; a purchase texting before `payment_success`; typed text skipping `plainText`/`_notice_text`; `enqueue` given a built string; SMS back on food/transport, or lost from the other service cabinets; no call-out SMS for a cleaner without a profile phone; a second inheritance rule; `respond` re-created without the cover/withdraw blocks; a v1 or inherited row as a source (consent outliving the guest's link); an inherited row without a hash (escapes the revoke paths); a system withdrawal that keeps `accepted_at`.

## C19 — Notification `dashboard_scope`

**Invariant:** every notification has a `dashboard_scope` (10 cabinets, or NULL = global: in every header bell, in no cabinet badge), spelled in six places: CHECK, TS union, writers, readers, badges, `email_outbound.dashboard_scope` (copied by `email_enqueue_notification`). Realtime stays filtered on `user_id`; `_notify` has six args (scope default NULL). The header bell is the all-roles inbox (`useNotifications()` without scope); audiences use `loadAudienceUserIds` (`deriveAvailableCabinets`, `src/lib/cabinets.ts`); bare `/dashboard` links resolve via `resolveNotificationPath`. **Breaks:** a scope in the CHECK not the union (23514); a writer without scope; a scope passed to the header bell; a realtime filter on scope (leaks); a scope missing from `email_outbound`'s CHECK.

## C20 — Manual booking cancellation is reversible

**Invariant:** cancel sets `status='cancelled'` (never delete); `cancel_/restore_/update_manual_booking` check ownership lock-free (P0002) before the `sms_dispatch_claim` lock; `manual_bookings` has no client table writes (C34); stays over 731 nights are refused. **Breaks:** delete instead of cancel; an SMS query including cancelled.

## C21 — Restaurants make no discounts

**Invariant:** `services.category='food'` has no discount: CHECK `service_menu_items_no_discount`, trigger `services_refuse_food_discount` (AFTER; 23514 HINT `invalid_target`); `purchase_package`'s discount tier, the admin editor and legacy `approve_*_discount_request` RPCs are refused (purchase-vip 400 `invalid_target`). UI: `hideDiscount` on food home; the balance page drops the discount package. **Prod order:** `20261011120000` with `20261011130000` (refuses 55000 while a discount exists). **Breaks:** a UI path back; the trigger made BEFORE; a HINT that is not a purchase-vip reason.

## C22 — Per-listing analytics: three event-backed metrics

**Invariant:** owner analytics = views, reveals, favorites only (never "impressions"). `POST /api/listings/[kind]/[id]/view`: active check → owner skip → history upsert (C35) → dedup 1/24 h (`listing-view:user:<id>:…` / `…:ip:<ip>:…`, id lower-cased) → `record_listing_view`; answers carry live `views` (C28). `views_count`/`menu_views_count` are service_role/admin-only (`prevent_listing_protected_field_change`, `force_listing_moderation_state`). IP/device/account columns are NULLed after 90 days (C37); **Breaks:** a metric without an event source; a service-role view route; a path skipping dedup; a shared edge IP key; owner views counted; writable counters; a limiter key from a raw path id.

## C23 — Standard & SUPER VIP mutually exclusive

**Invariant:** an active SUPER VIP blocks standard VIP (23P01 / `vip_tier_conflict`); activation clears `is_vip`; a stale expiry allows standard. **Breaks:** trigger dropped; raw `is_super_vip` checks.

## C24 — Cleaner call-out terms & consent-based cancel

**Invariant:** pending → accepted|declined (cleaner) → cancelled | in_progress → completed; cancelling an accepted call-out needs the cleaner's consent. `CALL_STATUSES` (`dashboard/renter/cleaners/page.tsx`), `STATUS_BADGE_CLASSES`, `callProgress`, `RenterCleaners.status.*` equal `cleaning_tasks_status_check`.

**Key:** a cleaner gets apartment/owner/number only from `get_my_cleaning_task_owner_details()` (DEFINER, `task.cleaner_id = auth.uid()`, authenticated only, 16 columns = `CleaningTaskOwnerDetails`, each `CASE WHEN live`) via `mergeCleanerTasks`, never an embed (RLS hides those rows); `detailsLoaded` false keeps Confirm disabled. `anon`/`authenticated` have SELECT only on `cleaning_tasks`; writers are DEFINER `create_cleaning_task` and `transition_cleaning_task`. **Cleaning category only by choice:** `src/lib/service-spheres.ts:SERVICE_SPHERES` (value → category + label) is the one table; `/create/service` starts with NO sphere; `?category=cleaning|handyman` limit it via `createServiceHref`; a sphere needs `ListingOptions.serviceSpheres` + a `listing-options.ts` lookup (`scripts/unit/service-spheres.test.mjs`).

**Prod order:** `20261001090000`, `093000`, `093100`, `093200`, app. **Breaks:** an embed in a cleaner query; a status missing from the RPC list or `CALL_STATUSES`; a widened projection; client DML re-granted; an entry link skipping `createServiceHref`.

## C25 — `profiles` grants narrower than the table grant

**Invariant:** `anon` has column-level SELECT on a safe subset only (never phone, personal_id, role, notification_prefs, marketing_opt_out). Writes are column-level (S1): authenticated INSERT (id, phone, display_name, bio, avatar_url, role) / UPDATE (role); anon none; `profiles_lock_role` refuses role changes from a session (the wizard reads the saved role back on 23505; the UPDATE(role) grant is now unused). `renter_guests_resolve_profile()` resolves by phone only when `auth.role()` is NULL/service_role. `contact_events`: authenticated SELECT excludes `visitor_phone` (`check-contracts` C25). **Breaks:** a table GRANT or broad policy for anon; `select("*")` of `contact_events`; the guest trigger's role test dropped.

## C26 — Admin numbers have one source

**Invariant:** each admin number has ONE SQL definition (metrics from `manual_bookings` only; revenue = `platform_revenue()`); `bookings` is dead. **Breaks:** querying `bookings`; summing transactions (counts top-ups); client-side recomputation.

## C27 — Production site lock (`SITE_LOCKED`)

**Invariant:** `SITE_LOCKED="true"` gates page views behind a password (never `NEXT_PUBLIC_`; fail-closed; `/api/*` not gated). Cookie `mb_gate` has two writers with identical attributes: the bypass link `/<password>` and `/site-locked` → `POST /api/site-lock/unlock`. **Breaks:** a `NEXT_PUBLIC_` prefix; Cache-Control dropped; the `request.url` origin on DO (use `NEXT_PUBLIC_SITE_URL`).

## C28 — Public detail routes are ISR + cookie-free

**Invariant:** the 8 detail routes are ISR (`revalidate=60`, no cookies/auth/headers); owner preview lives only under force-dynamic `/preview` twins (rewrite on `?preview=1` + auth cookie); a static→dynamic flip is a hard 500. `htmlLimitedBots:/.*/` keeps og:* in `<head>`. `next.config.ts:headers()` owns page Cache-Control: baseline → detail/blog/home/faq `s-maxage=60, stale-while-revalidate=300` → LAST an `rsc` header without `_rsc` → `private, no-store`; key spelled `Cache-Control` everywhere; middleware sets it only on the signed-in `/preview` rewrite, site-lock and consent responses. **Breaks:** auth/cookie in a detail route; a kind without a `/preview` twin; Cache-Control set in middleware for pages; the RSC rule not last.

## C29 — Executable contract checks

**Invariant:** every string coupling is checked mechanically, in the same session it is added: `scripts/check-contracts.mjs` (repo-only, in `prebuild`), `scripts/check-db-contracts.mjs` (live project from `.env.local`; a missing `*_contract_snapshot`/`security_posture_snapshot` RPC fails naming its migration), manual `check-http-hardening.mjs`. `scripts/unit/*.test.mjs` (`npm test`) import pure modules, which must not gain runtime `@/` imports. **Breaks:** a coupling without a check; a check run at prod before its migration.

## C30 — User consent: authored column + derived mirror

**Invariant:** `profiles.marketing_sms_consent` (nullable tri-state) is authored; `marketing_opt_out := NOT COALESCE(marketing_sms_consent, false)` is trigger-derived, never written; senders use `marketingChannelAllowed`. **Breaks:** writing `marketing_opt_out`; derivation dropped.

## C31 — Seasonal membership gate and visibility (staging)

**Invariant:** posting a rental needs an active, started membership (trigger `enforce_private_rental_membership`, 42501; service-role INSERT exempt). `public_properties` shows a rental only while the owner's membership is `status='active' AND starts_at <= now() AND expires_at > now()` (= `plans.ts:isMembershipActiveAt`; `20261004120000`); the contact route checks the view. Trigger `trg_enforce_smart_match_offer_public_listing` refuses offers on listings outside `public_properties` (22023 `smart_match_listing_not_public`); guest loaders read `public_properties`/`public_services`, never base tables. `user_subscriptions_status_check` = pending_approval|active|rejected|revoked; `admin_change_memberships` is the only admin writer (C44). **Prod order:** with the membership batch only. **Breaks:** the view re-created from an older text; the predicate changed in one place; a service-role reader of base `properties`.

## C32 — Keepz card payments (staging; only real-money path)

**Invariant:** money arrives via Keepz only, credited 1:1 to the wallet only on verified SUCCESS of the status WE requested (`syncPaymentWithKeepz`; FOR UPDATE, `credited_at IS NULL`); never callback, return URL or browser. UNIQUE `transactions(reference_id) WHERE type='topup'`; `balances.amount`/`sms_remaining` CHECK ≥ 0; `payments.user_id`/`payment_refunds.user_id` nullable ON DELETE SET NULL under `payments_user_id_fkey`/`payment_refunds_user_id_fkey` (admin payments embed it), orphans never credited. `createOrder` sends no redirect/callback URIs (Keepz 6036 → `provider_rejected`); the payer returns via the registered static URL (`src/lib/payments/keepz/PENDING.md`). `CardPayButton`/`CardTopUpLauncher` call `openCheckoutTab()` synchronously in the click. **Breaks:** credit from callback/browser; skipped sync; a refund retried after refusal; redirect fields added; `openCheckoutTab` after an await; `keepz_apply_payment_status` redefined from other than its live body.

## C33 — Email: everything through Resend (staging)

**Invariant:** all email goes via Resend; transactional mail copies in-app notifications; the dispatcher fails closed without `EMAIL_DELIVERY_ENABLED=true`; idempotency key `email_outbound.id`; `email_outbound.dashboard_scope` is copied by `email_enqueue_notification` and returned LAST by `email_claim_batch`.

**Key:** `email_notification_priority(text)`: class 1 = payments, company_subscription, membership_*, admin_payment_review; class 3 = user-triggerable types, capped 3 per (recipient,type,scope) per 24 h under `pg_advisory_xact_lock('email-class3:…')`; `'broadcast'`/`'service_broadcast'` = 4 and OUT of `email_notification_types()`. Email broadcasts (`POST /api/admin/broadcasts`) answer 503 `email_not_configured` unless the delivery switches and an allow-list are set; recipients via `admin_broadcast_email_recipients(uuid[])`. The nine DEFINER notification writers pass typed text through `public._notice_text` (`check-contracts` C33).

**Prod order:** `20261009100000`, `20261009120000`, app. **Breaks:** a type missing from the allow-list; a user-triggerable type in class 1; `broadcast` in the trigger list; the enqueue function re-created from an older body; a writer skipping `_notice_text`.

## C34 — Explicit grants; `public_*` views are read-only

**Invariant:** anon/authenticated may only SELECT the six `public_*` views (owned by postgres: a write grant writes into `profiles`/`organizations`). Defaults grant nothing and new functions get no PUBLIC EXECUTE: every new table/view/sequence/RPC states its GRANTs in its own migration (RPC → `REVOKE ALL … FROM PUBLIC, anon` + `GRANT EXECUTE … TO authenticated`).

**Key:** client writes are column-level, asserted by `check-db-contracts.mjs:EXPECTED_CLIENT_WRITES` via `security_posture_snapshot()->client_write_grants` (profiles, properties, services, `smart_match_requests`, `reviews`; `manual_bookings` none): a new key in a form payload needs a GRANT and an entry there; an invoker function writing these tables 42501s (make it DEFINER). Hygiene (`20261013150000`): no client TRUNCATE/TRIGGER/REFERENCES/MAINTAIN, anon no INSERT, no client writes on `balances`, `transactions`, `user_subscriptions`, `blog_posts`, `service_menu_items`; `client_privilege_hygiene` and the reviewed `authenticated` DEFINER list (`AUTH_DEFINER_ALLOW`, `ANON_DEFINER_ALLOW`) are asserted. Service-role only: `cleaning_tasks` writes, `ownership_*`, analytics, `user_groups*`.

**Breaks:** a table/RPC without GRANTs (42501); ALL re-granted on a view; a DEFINER function open to anon/PUBLIC outside the allow-list; a table-wide GRANT on the write tables.

## C35 — Recently viewed history

**Invariant:** `public.recently_viewed_listings` is written ONLY by `POST /api/listings/[kind]/[id]/view` (service role; signed-in non-owners of ACTIVE listings; before the 24 h dedup) and read ONLY by `loadGuestData`/`loadRecentListings` under the user's JWT, in two steps on `public_properties`/`public_services`. Non-partial UNIQUE `(user_id,property_id)`/`(user_id,service_id)` are load-bearing for `onConflict`. **Breaks:** upsert after the dedup; embedding base tables; a partial unique index; client writes.

## C36 — Sign-up email confirmation link

**Invariant:** the hosted "Confirm signup" template links `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`; `src/app/[locale]/auth/confirm/page.tsx` (client page, no `route.ts`) accepts `CONFIRM_OTP_TYPES` email|signup (+ PKCE `?code`), verifies ONLY on a button click and always as `verifyOtp({type:"signup"})`; login's `CONFIRM_REDIRECT_URL` (`${NEXT_PUBLIC_SITE_URL}/auth/confirm`) is the `emailRedirectTo` of signUp/resend; `?error=invalid_link` is shared; landing via `postAuthRedirectPath`. Order: deploy → template → `mailer_autoconfirm=false`. **Breaks:** path/type renamed on one side; verify on load (scanners confirm); the URL's type passed through; signUp retried.

## C37 — Personal-data retention and cron history

**Invariant (staging):** `apply_pii_retention(p_days default 90)` (DEFINER, service_role/pg_cron; job `pii-retention-daily`) is the only retention path: NULLs `listing_view_events.client_ip`, `contact_reveal_events.{client_ip,device_id,account_id}`, `page_views.user_id`, `analytics_events.user_id` (rows stay: counts use them), drops `audit_logs` values (exempt: manual_bookings, balances, transactions, payment_refunds, pricing_packages, promocodes), deletes final `email_outbound` rows. **Breaks:** a new PII column not added; a PII table in the exempt list; scrubbing turned into deleting where counts use rows; EXECUTE to client roles.

## C38 — Geolocation consent, road card, listing-map link

**Invariant:** cookie `mb_cookie_consent` = `v2|analytics=<0|1>|location=<0|1>` (`src/lib/consent/cookies.ts`; legacy v1 = `location: null`, never asked). `CookieConsentBanner` asks cookies, then location, ONE question per card; it opens on load only while analytics is unanswered (a null location never reopens it) and every answer or location outcome closes it from local state, never by re-reading the cookie. Only `src/lib/geolocation/useUserLocation.ts` calls `navigator.geolocation`; coordinates are never stored; only PERMISSION_DENIED (`code === 1`, not `instanceof`) records a decline; `writeLocationConsent()` stays a no-op when unchanged (else an endless loop). `road-condition/shared.ts` is shared but `server.ts` and `personalized.ts` keep their OWN plausibility bounds; `directions.ts:fetchDrivingRoute` is the one client route fetch. Listing maps show ONE "Google Maps-ში გახსნა" link (`googleMapsDirectionsUrl`, no origin) at `bottom-10` bottom-left, keeping the Mapbox logo visible; food/entertainment maps need an owner pin (`parseServiceCoords`). **Breaks:** the link on the logo; a consent field without extending `parseCookieConsent`; server bounds reused for arbitrary origins; any geolocation error recorded as a decline; a banner that stays open after a tap, needs the cookie to close, or disables "არა, გმადლობთ" (`e2e/mobile/cookie-banner.spec.ts`).

## C39 — Ownership verification (staging)

**Invariant:** the badge is `public_properties.ownership_verified` (last column; also `public_services`) = an `approved` `ownership_verifications` row of the listing's CURRENT owner. Basis triggers `ownership_close_on_property_basis_change` (owner, cadastral code, address, lat/lng) and `ownership_close_on_service_basis_change` close a live request only when a VALUE changes (WHEN compares values; edit forms send basis columns back as loaded). Properties only: `POST /api/ownership-verifications` answers 400 `invalid_input` for services.

**Key:** `ownership_verifications` (browser reads own rows via column grant `OWNER_VERIFICATION_COLUMNS`, never `*`) and `ownership_verification_documents` (service_role only); RPCs `submit_ownership_verifications`, `review_ownership_verification` (refuses self-review: `OWNERSHIP_REVIEW_SELF` → 403 `self_review`), `discard_ownership_document`, `claim_ownership_documents_for_purge`, `ownership_contract_snapshot`, all service_role only. `purge.ts` is the only deleter; admins view files via a 302 to a 60 s signed URL without `download`. Notices: type `verification`, generic titles (the SMS mirror texts them, C18).

**Prod order:** runbook batch → `20261001120000`, `130000`–`130200` → `20261001200000`, `200100`, `200150` → app + `search` → purge schedule. **Breaks:** a basis trigger without the value WHEN; a second deleter; `download` on the signed URL; `select("*")` from the browser; a title naming the listing; `ownership_verified` selected before `20261001200100`; a decision path around the review RPC.

## C40 — SEO surface

**Invariant:** only `CANONICAL_HOST` (`src/lib/seo/site.ts` = `mybakuriani.ge`) is indexable (`IS_INDEXABLE` from `NEXT_PUBLIC_SITE_URL`); other hosts answer `X-Robots-Tag: noindex, nofollow`, `Allow: /` robots and an empty sitemap; `check-production-config.mjs` fails a prod build on another host. One canonical + hreflang set per URL from `src/lib/seo/alternates.ts:buildAlternates` (`alternateLinks: false`) via `buildPageMetadata`/`buildListingMetadata`; `src/lib/seo/*` is pure (no `@/`).

**Key:** robots `NON_INDEXABLE_PREFIXES` × locales = middleware's protected prefixes (C8). `src/app/sitemap.ts` (ISR 3600) = `STATIC_PATHS` + `GUIDE_PATHS` + active listings via `propertyViewUrl`/`serviceViewUrl` + blog by slug; image URLs `/_next/image?w=1200&q=75` need `SEO_IMAGE_WIDTH`/`SEO_IMAGE_QUALITY` allowed in `next.config.ts`; `lastmod` only for blog. Wrong-kind listing URLs 308 (`redirectToCanonicalListing`). JSON-LD only via `components/seo/JsonLd.tsx` (`serializeJsonLd`), only for facts the page shows. Public ISR pages: no `loading.tsx`, no cookies (C28). Crawl paths: `FooterLanguageLinks.tsx`, `CategoryIntro` `listings`; `RelatedListings.tsx` and the home rows follow each category page's scope (`LANDING_SERVICE_CATEGORIES`). Guide: `GUIDE_PATHS` = dirs of `src/app/[locale]/bakuriani/**` = `richLinks` hrefs; facts trace to `GUIDE_SOURCES`; admin overrides in `site_settings` `guide_content` via `getGuideTranslator`; `[zone]` must NOT set `dynamicParams = false`. FAQ: `/faq` copy (title, subtitle, Q&A, 3 locales) = `site_settings` `faq_content` (whole set; else catalog `FAQ`) via `loadFaqContent` only (`src/lib/faq.ts`), plain props; `revalidate = 60` + `/faq` in C28's edge rule.

**Breaks:** a page missing from `STATIC_PATHS` (or listed without a page); metadata helpers skipped; a private prefix missing from `NON_INDEXABLE_PREFIXES`; `alternateLinks` on; a sitemap image size not allowed in `next.config.ts`; `lastmod` from `updated_at`; hand-written JSON-LD; the host changed in `site.ts` only; `loading.tsx`/cookies on a public ISR route; another `Guide` translator; `dynamicParams = false` on the zone page; a `/faq` read outside `loadFaqContent`.

## C41 — Admin sign-up links (staging)

**Invariant:** `public.signup_links` (code, label, destination, active; service role only, audited) sends registrants to a chosen page. The destination is re-read from the code on the server (`src/lib/signup-links.ts:validateSignupLinkDestination`); the code travels in cookie `mb_signup_link` (set by `join/[code]/route.ts`) and in `user_metadata.signup_link` (email and phone sign-up `options.data`); `POST /api/signup-links/resolve` reads metadata first, then the cookie. `SIGNUP_LINK_PRESETS` must be real pages; codes have no dot and match `signup_links_code_check`. **Prod order:** `20261005090000` before the app. **Breaks:** a renamed preset; sign-up without `options.data`; a client read of the table; a destination trusted from the browser.

## C42 — Finance & tax reporting (staging)

**Invariant:** every finance number has ONE SQL definition: `finance_ledger_v` (cash basis), `finance_monthly_totals()`, `finance_tax_year()`, `finance_vat_window()`; registers `finance_payments_v`, `finance_refunds_v`, `finance_invoices_v`. Append-only (`finance_forbid_delete` + per-table `*_guard` triggers; mistakes are reversed by mirror rows). Finance tables (`finance_settings`, `finance_entries`, `finance_expenses`, `finance_documents`, `invoices`, `invoice_counters`, `invoice_templates`) are written only under `src/app/api/admin/finance/` and `src/lib/finance/server/` via `createServiceClient(adminId)`. Invoices carry VAT only while `vat_registered` (`FINANCE_INVOICE_VAT_MISMATCH`); exports reuse the registers' `*Ops` filters. **Prod order:** after C32: `20261005120000`, `120100`, `120200`, app. **Breaks:** a number computed outside the SQL; attempts or wallet spend counted as revenue; a client grant; a delete/update path on issued rows.

## C43 — Support assistant ("ბაკუ" / Baku) on every page

**Invariant:** `OPENROUTER_API_KEY` is server-only (`src/lib/support/openrouter.ts`, `server-only`, never `NEXT_PUBLIC_`; RUN_TIME-only scope = public pages get no widget). Only Gemini Flash models and `typesafe/jev-router` are called. `POST /api/support`: `ask` (forced tool `reply`; NO link field; `parseReply`), `plan` (`PLAN_MODEL`, forced `show_steps` with the browser's element-id enum; backup `JEV_MODEL` with `JEV_GEMINI_FLASH` excluding other makers; `parseJevPlan` re-checks ids), `feedback`. No `response_format`; every call sends `provider: { data_collection: "deny" }`.

**Key:** `scan.ts:scanPage` sends kinds, labels and same-site paths, never values (`maskPersonalData`); the widget is `data-jev-ignore`; inside `[data-jev-private]` and on every `/dashboard/admin` page (`isPrivatePath`) elements go as `[item N]`; `maskIds` turns UUIDs and capability tokens into `:id`/`:token`; no person's name in alerts, toasts or disable-able buttons. Buttons: ids from `actions.ts:ACTIONS` with typed params (`normalizeAction`); the route builds every `href` (`isSafeActionHref`); a button only opens a page or prefilled form, never sends, pays or publishes. Deep links `?smartMatch=new`, `?topup=`, `?membership=1` use `parseSmartMatchPrefill`/`parseTopUpParam`; `ORDERS` and `hasOrdersPage` agree. `account.ts:loadAccountFacts` runs under the user's own session, statuses/counts only. `knowledge.ts` follows flow/label changes (restaurants and transport have no SMS, C18). Mounted three times behind `isSupportConfigured()` (`[locale]/layout.tsx`, `dashboard/layout.tsx`, `create/layout.tsx`); namespace `Support` in all three scopes (C1). UI name "ბაკუ" (ka) / "Baku" (en, ru), never "Jev" or a model name; `clearSupportChat()` at every sign-out.

**Guards:** `scripts/support-eval/run.mjs` (manual; re-run after prompt, knowledge or button changes). **Breaks:** the key in client code; a model outside Gemini Flash/the router; steps without the id enum; the scanner sending `.value`; `data_collection` dropped; a link field or browser-built link; a button whose page or param is gone; account facts from the service role; other people's data outside `data-jev-private`.

## C44 — Admin status management (staging)

**Invariant:** admins change memberships, VIP/SUPER VIP, discounts and company plans only through DEFINER RPCs `admin_change_memberships`, `admin_change_listing_promotions`, `admin_change_company_plans` (`20261006120000`; service_role; called only from `/api/admin/statuses/**`; ≤ 200 targets). A preview is the same call with `p_dry_run` (default) raising `MBDRY`; apply resends it with `dryRun:false`; a failed apply drops the preview (never re-send ±days). Memberships take lock `renter-membership:<uid>` and never create overlaps; promotions SET only the six promotion columns (keeps SMS-lock/org/ownership triggers quiet); food is refused (C21). Notices `membership_admin_update`, `promotion_admin_update`, `company_plan_admin_update` are bell-only. Views `admin_membership_overview_v`, `admin_listing_promotions_v`, `admin_company_plans_v`. Gifts: `admin_gift_sms_credits` (service_role; writes no `transactions` row; notice `sms_credit_admin_update`). **Prod order:** after C31: `20261006120000`, `20261006200000`, app. **Breaks:** a vocabulary on one side; a writer outside the RPCs; a reader treating any non-`rejected` membership as live; extra columns SET; an `*_admin_update` type in the SMS/e-mail lists; a gift writing `transactions`.

## C45 — Hotel rooms and amenities (staging)

**Invariant:** `properties.hotel_rooms` (jsonb NOT NULL DEFAULT `[]`) is validated in the DB: CHECK `properties_hotel_rooms_valid` = `hotel_rooms_valid()`, whose limits equal `src/lib/hotel-rooms.ts`; `hotel_stars` CHECK 1–5. Owner-written (INSERT grant, C34; edits via the review gate, C14); read only through `parseHotelRooms`; `public_properties` exposes `hotel_rooms` as its LAST column. Amenities (`20261016150000`, STAGING): `jsonb_string_array_valid()` + CHECK `properties_amenities_string_array` (`check-contracts` C45/amenities). **Prod order:** after C31: `20261006100000`, app; `20261016150000` before the next prod build. **Breaks:** a limit on one side; `hotel_rooms` missing from a review-gate list; the view re-created without the column; a writer role without EXECUTE on `hotel_rooms_valid`; the amenities CHECK dropped.

## C46 — Ad & banner analytics (staging)

**Invariant:** every creative of both systems (`ads`, `landing_banners`) is counted the same way: the renderer batches events to `POST /api/banner-slots/track` → `record_banner_events` (definer, service_role only; counts only live creatives) into `banner_metrics_daily` and `banner_slot_daily`. Admin numbers come from `admin_banner_analytics` through the one loader `src/lib/banner-analytics-server.ts` (C49's `server.ts` is the only other caller), behind `requireAdmin`. No IP/user/device id is stored; a browser where the admin dashboard was opened sends nothing (C47). **Prod order:** `20261006180000`, `20261006210000`, app. **Breaks:** an interactive element skipping `reportBannerEvent`; counting in preview or an admin browser; a second RPC reader; a client grant.

## C47 — Ad campaigns: share of voice, priority, cap (staging)

**Invariant:** which creative a page view shows is decided ONLY by `src/lib/banner-slots-client.ts:useSlotRotation` over pure `src/lib/ad-rotation.ts` (`pickAd` has one caller), after mount (ISR + CDN forbid a render-time draw); the DB refuses a placement over 100 % SOV: trigger `ads_enforce_slot_capacity` (`MBSOV`; routes 409 `slot_full`; `listing_grid` exempt). Fields `ads.sov_percent` (25|50|100), `priority` (1–10), `frequency_cap_per_day` (1–50|NULL) via `parseCampaignFields` in both admin ads routes; the cap lives in localStorage `mybakuriani:ad_frequency`. `interleaveSponsored` mounts `<BannerSlot placement="listing_grid" position={i}>` after every 8th card (`SPONSORED_EVERY`) on all 11 grids; `mobile_strip` is mounted only in `LocaleShell`. Admin browser: localStorage `mybakuriani:staff_browser` (`src/lib/staff-browser.ts`) = no cap, no events; every sign-out calls `clearStaffBrowser()` next to `clearSupportChat()`. Preview: `GET /api/admin/ads/[id]/preview` (`requireAdmin`) → `#mb-ad-preview=<id>`; `previewSlot` adds no second draw site. **Prod order:** `20261006180000`, `20261006210000`, app (an app ahead renders no ads). **Breaks:** a render-time draw; a booking path skipping the trigger; a `listing_grid` mount outside `interleaveSponsored`; tiers/ranges on one side; a beacon or cap path without `isStaffBrowser()`; a sign-out without `clearStaffBrowser()`; the preview route without `requireAdmin`.

## C48 — Phone sign-in via the Auth Send SMS hook (staging)

**Invariant:** a Georgian mobile signs in or up: `signInWithOtp({phone:"+9955XXXXXXXX"})` → `verifyOtp({type:"sms"})`; `/dashboard/account` attaches one via `updateUser({phone})` + `phone_change`. Auth generates and verifies codes; its Send SMS hook calls `auth-send-sms`, which sends through `_shared/ubill.ts:ubillSend` (the ONLY POST to uBill `/send`; `otp: true`, `stopList: false`). The function always answers HTTP 200 (429/503 make Auth retry and text twice); refusals carry `AUTH_SMS_ERRORS` tokens (`phone_not_supported`, `sms_limit_number`, `sms_limit_ip`, `sms_unavailable`, `sms_send_failed`), equal in `src/lib/auth/phone.ts` and Deno. Target = `sms.phone`, not `user.phone`. Signature is checked first (no `SEND_SMS_HOOK_SECRET` → refuse); switches `SMS_DELIVERY_ENABLED`, `SMS_PROVIDER_API_KEY`, `SMS_PROVIDER_BRAND_ID`; caps in `auth_sms_code_reserve` under `pg_advisory_xact_lock(hashtextextended('auth-sms-code-caps', 0))`, then `auth_sms_code_settle`. Codes never enter `sms_outbound` (C18); text `TEMPLATES.auth_code`; `auth_sms_code_log` is service_role only. Flag `NEXT_PUBLIC_PHONE_AUTH_ENABLED="true"` (build time) shows the tab, account card and support lines.

**Prod order:** uBill on prod, `20261006230000`, deploy `auth-send-sms` (+ `sms-dispatch`, `sms-delivery-report`), secrets, hosted settings, then build with the flag. **Breaks:** 429/503 or non-200 refusals; target from `user.phone`; signature check after reading the payload; a second `/send` caller; token lists drifting; hook URL/name/secret changed on one side; the flag on without Phone + hook.

## C49 — Admin analytics on `/dashboard/admin` (staging)

**Invariant:** every number comes from one SQL definition read with the service role through `src/lib/analytics/server.ts:loadAnalyticsBlock` behind `requireAdmin`; page, data route and exports parse the same query (`model.ts:parseAnalyticsQuery`/`analyticsQueryToParams`). Visitor data is first-party and consent-gated (`analytics=1`, C38): `page_views`, `analytics_events`, cookies `mb_vid` and `mb_sid` (one writer; session rule only `continuesSession`); only derived categories are stored, never a UA, referrer URL or IP. `PageviewTracker` (in `LocaleShell`) posts to `/api/track/{view,ping,event}`. `geoip.ts` reads DB-IP Lite (`data/geoip/dbip-lite.bin.gz`): keep the attribution. `MAX_RANGE_DAYS` (366) = `analytics_check_range` = C46's cap; `admin_analytics_*` are service_role only. **Prod order:** after C42, C46 + C47, C16: `20261006240000`, app (an app ahead loses every page view). **Breaks:** a vocabulary on one side; a writer skipping the consent check; storing UA/referrer/IP; an RPC call outside `server.ts`; a number computed in TypeScript.

## C50 — SMS financial control (staging)

**Invariant:** every SMS number on `/dashboard/admin/finances/sms`, in its exports and the low-balance warning comes from one SQL definition over `sms_usage_ledger` and `sms_provider_purchases`: readers `admin_sms_finance_summary`, `admin_sms_finance_ledger`, `admin_sms_finance_purchases`; writers `finance_record_sms_purchase`, `finance_void_sms_purchase`, `finance_set_sms_low_balance`; all service_role only, called only by routes under `src/app/api/admin/finance/sms/` (`requireAdmin`). Billed parts are computed from the text (`sms_billing_units`), not counted as messages; codes are priced from the SQL copy of `TEMPLATES.auth_code`. Categories: `sms_finance_category` ↔ `SMS_KIND_KEYS` ↔ `src/lib/finance/sms.ts:SMS_CATEGORIES`. `sms_finance_sync()` runs on read and hourly (`sms-finance-hourly`); the BEFORE DELETE trigger `sms_outbound_keep_ledger` keeps history. A purchase is also a Finances expense (supplier `uBill`, category `communications`) in one transaction; a void inserts the C42 reversal. **Prod order:** after C42, C18 "Billing" and C48: `20261007200000`, Vault `app.site_url`, app, then enter the packages already bought. **Breaks:** counting messages instead of `units`; a sender bypassing `sms_outbound`/`auth_sms_code_log`; `TEMPLATES.auth_code` changed without the SQL copy; a purchase without its expense; a client grant.

## C51 — Password reset and change (staging; hosted template pending)

**Invariant:** signed out: `/auth/forgot-password` → GoTrue `/recover` (one call, never retried) → `/auth/reset-password`, which also takes `?token_hash=…&type=recovery` and calls `verifyOtp({type:"recovery"})` only on submit; a 429 `over_email_send_rate_limit` with seconds is the SENT state (`resetRequestOutcome`). Signed in: `ChangePasswordCard` → `useAuth().changePassword(email, current, next)` signs in with the current password, then `updateUser({password})` once. `/auth/confirm` keeps refusing `recovery` (C36). **Switch order:** deploy, then set the hosted Reset template to `{{ .SiteURL }}/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery`. **Breaks:** `withRetry` on `/recover` or the update; verify on load; `updateUser` without the sign-in; the template switched before the code ships.

## C52 — Admin Verified Users and payer groups (staging)

**Invariant:** "verified" stays `profiles.is_verified` + `verified_at`; groups only annotate it. `user_groups`, `user_group_members` (role payer|member; partial unique `user_group_members_one_payer_idx`) and RPC `admin_save_user_group(p_admin_id, p_name, p_payer_id, p_member_ids, p_group_id, p_note)` (DEFINER, `search_path ''`, service_role only; RLS on, no policy; `trg_audit_row`) are written ONLY by that RPC and the group DELETE route. Every handler under `/api/admin/verified-users/**` starts with `requireAdmin()` and writes with `createServiceClient(guard.admin.userId)` (admin id from the session, never the body); errors are `{error: UserGroupErrorCode}` worded in `AdminVerifiedUsers.errors.*` (RPC tokens map through `groupRpcErrorCode`); an edit demotes the old payer before promoting the new one. `POST /api/admin/clients/[id]/verified` writes `verificationPatch` only on a real transition. No person's name in alerts or disable-able controls (C43). **Prod order:** `20261016100000` (refuses 55000 without `audit_row_change()` and `set_updated_at()`), app. **Breaks:** a second writer; a client grant/policy or RLS off; the role list on one side; an RPC token without a mapping; `is_verified` written outside the toggle and moderate routes; `select("*")`; a payer promoted before the old one is demoted (23505).

## C53 — Admin free periods (staging)

**Invariant:** a standing rule = registration window (Tbilisi days) + roles + ONE benefit (`membership` | `vip` | `super_vip` = `free_periods_benefit_check` = `FREE_PERIOD_BENEFITS`) + end date; paused, never deleted. `free_periods`, `free_period_grants` (unique per period+user / period+listing) and every `free_period*` function are service_role only (RLS on, no policy, `search_path ''`), reached only by `/api/admin/free-periods/**` (`requireAdmin()`, `createServiceClient(adminId)`, limiter) through `free_period_apply` (≤200 rows, single-flight; each row isolated by `WHEN OTHERS`: a bad row is skipped, never aborts the chunk) and cron `free-period-apply-5min` (SQL-only). Membership is also granted by the `AFTER INSERT` trigger on `profiles` (swallows every error); VIP only by the sweep (no trigger on listings). Grants are ordinary rows (`package_id` NULL, `amount_paid` 0; `vip_expires_at`), never a `transactions` row; notices reuse the bell-only `membership_admin_update` / `promotion_admin_update`. An edit re-dates only live, unchanged grants and revokes nothing. `FREE_PERIOD_*` tokens map through `FREE_PERIOD_DB_ERRORS` to `AdminFreePeriods.errors.*`. **Prod order:** after C44: `20261020120000`, app. **Breaks:** a client grant/policy; a trigger on listings; a money row; an unmapped token; a second writer; a row failure aborting a sweep chunk.

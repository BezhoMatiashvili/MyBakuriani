# Cross-cutting Contracts

Invariants held by **string keys, generated code, or wire shapes**—couplings invisible to call-graph tools. Each is _change-one-side → must-change-the-other_. Before editing, read the section and grep repo-wide.

**Anchor:** `` `path:symbol` `` (e.g. `src/i18n/routing.ts:routing`).

---

## C1 — i18n key parity & namespace scoping

**Invariant:** `messages/{ka,en,ru}.json` have identical key sets; every public-component namespace is in `PUBLIC_NAMESPACES`.

**Symbols:** `src/i18n/namespaces.ts:PUBLIC_NAMESPACES`, `scripts/check-message-parity.mjs`.

**Breaks:** Key in one catalog only (untranslated); public component uses unlisted namespace.

---

## C2 — Locale set

**Invariant:** `routing.locales` echoed everywhere: middleware, message import, navigation. `localeCookie: false` is load-bearing (CDN caching).

**Breaks:** Add locale without `messages/<locale>.json` (import throws); re-enable `localeCookie` (Cloudflare BYPASS).

---

## C3 — DB schema ↔ generated types

**Invariant:** Migrations are source of truth. `src/lib/types/database.ts` mirrors schema (generated + hand-edit rules for views/RPC-args). Regen after migration or type lies.

**Breaks:** Regen missed (stale types); hand-edit generated file (reverts on regen).

**S2/S3 (2026-09-27, staging):** after `20260927091000` the generated types lose `properties_photos_backup` / `services_photos_backup`; `payments.user_id`, `payment_refunds.user_id`, `listing_view_events.client_ip` and `contact_reveal_events.client_ip` become nullable; `apply_pii_retention` appears. Regenerate before code reads them.

---

## C4 — Client ↔ Edge Function wire contract

**Invariant:** `supabase.functions.invoke("<name>", { body })` couples function name and body shape (untyped). Functions in `config.toml`, bodies validated at runtime only.

**Key:** `_shared/guards.ts` bundled per-function (redeploy all 16 for changes). Rate-limiter fail-open. Exact-match CORS. Bearer token for pg_cron (`verify_jwt=false`).

**Breaks:** Function renamed (invoke string doesn't update); body field renamed (runtime 400); missing CORS origin (browser blocks); missing shared secret (cron 401s silently).

**S2/S3 (2026-09-27, staging):** every pg_cron HTTP job passes an explicit `timeout_milliseconds` (30 s; 60 s for `sms-dispatch-frequent`). `20260927090300` rebuilt the four older commands from their live text, so a new HTTP job must set its own. `check-db-contracts` C4 expects 9 active jobs (adds `keepz-reconcile-10min`, `email-dispatch-5min`, `cron-history-gc`, `pii-retention-daily`) and a missing one now FAILS. `purchase-vip` and `company-subscription` insert `payment_failed` only when `_shared/payment-failure.ts:isPaymentFailure` says the charge really failed (insufficient balance, `vip_tier_conflict`, server or network error), never on 22/23/42/P0/PGRST validation errors. **Breaks:** a schedule added without the C4 list (never checked); an HTTP job without a timeout (every run over 5 s logged as timed out); a `payment_failed` insert on a validation path (a retry loop floods the email queue).

**Ownership purge (C39, 2026-10-02):** `ownership-document-purge-hourly` (`20261001200200`, 17 * * * *, 30 s timeout) is live on STAGING since 2026-10-02 and in the C4 expected list (`check-db-contracts` now expects 10 active jobs). Vault `app.ownership_purge_url` = `https://staging.mybakuriani.ge/api/ownership-verifications/purge`; `app.ownership_purge_secret` was generated inside the database and only its SHA-256 left it, as the DO secret `OWNERSHIP_PURGE_SECRET_SHA256` (RUN_TIME). Prod: deploy the route, create both Vault entries and the env var, then apply (the migration refuses with 22023 while a Vault entry is missing; without the env var the route answers 503 and every run fails).

---

## C5 — Storage bucket names

**Invariant:** Bucket id in upload code, migration+RLS, and image/CSP allow-list. Buckets: `property-photos`, `avatars`, `landing-media`, `restaurant-menus`, `content-change-media`.

**Breaks:** Bucket renamed in code only (upload 403 or Image blocked); RLS missing on new bucket.

**S2 (2026-09-27, `20260927090200`):** `property-photos` client INSERT only at `<auth.uid()>/<file>` (exactly one folder level). There is no client UPDATE policy: uploads stay `upsert:false` and never move, copy-overwrite or `update()`. DELETE is owner-only; service-role writers bypass RLS. **Breaks:** an uploader writes into a subfolder or a listing-id folder (42501, shown as `uploadFailed`); an upsert/move/update call without a new UPDATE policy pinned to folder AND bucket (UPDATE policies OR across buckets, so a loose one re-opens cross-bucket moves).

**Menu PDFs (2026-10-01):** `restaurant-menus` takes only `application/pdf` up to 10 MiB (`file_size_limit` 10485760) and the bucket checks nothing else. The food form (`create/food/page.tsx`) judges a menu by its bytes through `src/lib/menu-pdf.ts:readMenuPdf`, never by `file.type` (Chrome derives it from the extension): non-empty, `%PDF-` inside the first 1 KiB, a `%%EOF`/`startxref` trailer in the last 4 KiB (or anywhere in the file unless it is linearized), at most `MAX_MENU_PDF_BYTES`. `onPickMenuFile` runs it for early feedback beside the field (the footer error is below the fold on desktop). `uploadMenuPdf` is the gate: it reads the input's own current file first (Chrome fires no `change` when the same path is picked again after a re-save, which leaves the React-held `File` stale), checks again and uploads the bytes it just checked, never the live `File`. A gate refusal empties the input when it still holds the refused file (so the same path can be picked again; a newer pick survives) but keeps the tile, so a plain second Publish is refused again instead of quietly dropping the menu (in edit mode: a saved one). `MAX_MENU_PDF_BYTES` must equal the bucket limit; `scripts/unit/menu-pdf.test.mjs` compares it with the bucket migration. `check-contracts.mjs` C5 fails any `src` file whose literal `.from("restaurant-menus").upload(` does not store the bytes of a `readMenuPdf` result: it wants `const X = await readMenuPdf(…)` within 700 characters of code before the call and `X.bytes` written inside the call's arguments (a pick-time call nearby, a dropped result, the live `File`, a helper doing the upload and a body built before `.upload(` all fail; comments don't count, strings do; uploads through a constant, `.update()` or a signed URL are not seen). **Known limits:** the check is structural, so mid-file damage, zero-page and password-protected PDFs pass, and so does a cut-short copy that mentions `startxref`/`%%EOF` in its body; a complete linearized PDF with 4092 or more bytes after its last `%%EOF` is refused; in edit mode a good pick followed by a rejected one leaves neither file nor link, so Publish queues `menu_url: null` for admin review (C14); a pick, X or typed link made while Publish is in flight is ignored (the file read at Publish is the one stored, and the gate's read widens that window by up to 10 MiB of reading); there is no server-side byte check, so an API client can still store any object up to 10 MiB declared as `application/pdf`; no committed test covers the form's refusal behaviour (tile kept, input read first, conditional clear), so change it only with a browser check. **Breaks:** an uploader that trusts `file.type` or sends the live handle stores a 0-byte or cut-short object that `services.menu_url` then points at (staging 2026-10-01: Chrome showed "Failed to load PDF document"); the cap changed on one side only.

**ownership-documents (C39, 2026-10-02, `20261001200000`):** private, 10 MiB, pdf/jpeg/png/webp, and NO `storage.objects` policy at all — browsers never read or write it. Only the service-role upload route writes it (`upsert:false`, server-chosen type, `cacheControl: "60"`), admins view a file through a 60 s signed URL without `download`, and only `src/lib/ownership/purge.ts` deletes from it. **Breaks:** any storage policy naming the bucket (ID cards become client-readable); a second deleter.

---

## C6 — CSP & external origins

**Invariant:** Every external host in both CSP directive AND `remotePatterns`. No build error—only runtime block.

**Key CSP moved to middleware.** Mapbox GL needs `worker-src 'self' blob:`. Supabase, unsplash, Mapbox, Turnstile, rtsp.me allowed. Supabase hosts come from one list, `src/lib/media-hosts.ts:SUPABASE_MEDIA_HOSTS` (configured project + prod media host), used by middleware `img-src`/`media-src`/`connect-src` (https; `wss://` for the configured project only), `next.config.ts` `remotePatterns` (`/storage/v1/object/public/**`), and `src/lib/banner-creative.ts` (C12) — never `*.supabase.co`. `NEXT_PUBLIC_SUPABASE_URL` must be RUN_AND_BUILD_TIME: middleware inlines it at build, and `next start` re-reads next.config.ts at runtime (unset = prod host only). `images.qualities: [75]` (any other `<Image quality>` → 400) and `imgOptMaxInputPixels` 50 MP (larger sources served unoptimized) bound the optimizer. `check-contracts.mjs` C6 enforces the shared list (and fails on any other `supabase.co` host test under `src/`); `check-http-hardening.mjs` is a manual, localhost-only check. `api.mapbox.com` in `img-src` + `remotePatterns` (`/styles/v1/mapbox/**`) = `BakurianiMap`'s phone preview (`src/lib/maps/staticMapUrl.ts`, Static Images API) loaded by plain `<img>`, never `/_next/image` (token URL restrictions check the browser Referer). Dropping the host silently reverts phones to the placeholder.

**Breaks:** Add CDN without CSP (image 404, fetch blocked); add to CSP only (Image blocked); a hard-coded or wildcard Supabase host; a new Supabase origin (custom domain, `<ref>.storage.supabase.co`) not added to media-hosts.ts; the URL env var scoped BUILD_TIME only (the optimizer 400s every photo).

---

## C7 — Realtime publication coverage

**Invariant:** Client `postgres_changes` subs only receive if table in `supabase_realtime` publication. RLS must permit SELECT on subscribed table.

**Key:** Filtered subscriptions cannot see DELETEs (only PK in old_record). Explicit refetch required after delete/cancel.

**Breaks:** New table sub without publication (connects, receives nothing); mutation relies on realtime for refresh (DELETE never arrives).

**Notifications total (2026-10-01):** the header bell's all-scope total is exact only through INSERT +1, a debounced `user_id`-only head-count after any UPDATE, a head-count on mount and a recount after the sidebar-entry bulk read. DELETEs are unobserved, so any future notification-deleting path must recount explicitly.

---

## C8 — Protected-route gating (roles)

**Invariant:** `/create/*` and `/dashboard/*` auth-gated in middleware. Server-side admin via `requireAdmin`. DB enforces RLS. Both gates stay in sync.

**Key:** Transient auth predicate in `withTimeout.ts` (5s race); both middleware + `getCurrentUser` use same predicate.

**Breaks:** Forget protected-route prefix (renders for anon); gates drift (middleware allows, layout redirects); `GET_USER_TIMEOUT_MS` lengthened (dashboards hang).

---

## C9 — Favorites dual-reference pattern

**Invariant:** `public.favorites` references **either** property OR service (exactly one non-null via CHECK). No `listings` table.

**Breaks:** New path reads only `property_id` (service favs disappear); branch logic removed.

---

## C10 — Discount badge duration & expiry

**Invariant:** `discount_percent` + `discount_expires_at` written **only** by `purchase_package` discount tier (guarded by trigger), cleared by cron. Percentage buyer-chosen [1,90].

**Key:** Active = `discount_percent > 0 AND discount_expires_at > now()`. Every card/detail uses `isDiscountActive` + `applyDiscount` or shows wrong price/badge.

**Breaks:** Update columns directly (trigger blocks non-admin); price checks only percent (expired stay highlighted).

---

## C11 — Company (org) listing linkage & auto-link

**Invariant:** `properties.organization_id` is sole listing-org link. Sales-only. Every write gated: enforcement (active sub + quota) + prevent-change (owner can attach).

**Key:** Personal = `owner_id = uid AND organization_id IS NULL`. Org = `organization_id = org`. Both exclude each other.

**Breaks:** Update payload unconditionally includes `organization_id` (fires trigger on every edit, 42501 when sub lapses); rental attached to org.

---

## C12 — Banner placement registry

**Invariant:** `src/lib/banner-placements.ts:BANNER_PLACEMENTS` sole source for where banners appear (11 ids). Same string in CHECK, admin forms, mount sites, renderer.

**Key:** Two systems (editorial + paid ads) normalize to one renderer. `renderableImageUrl`/`renderableVideoUrl`/`isCreativeMediaUrl` must equal CSP ∩ `remotePatterns`, with Supabase via `SUPABASE_MEDIA_HOSTS` (C6). No placement without migration+CHECK+mount+localization.

**Breaks:** Added to registry but not CHECK (23514); added to CHECK but never mounted (admin can "publish" to void); hard-coded string at mount.

---

## C13 — `property_type` enum fan-out

**Invariant:** 6-value enum (apartment, cottage, hotel, studio, villa, land). Adding touches **compile-time tripwires AND eight silent participants**.

**Compile checks:** `PROPERTY_TYPE_LABEL_KEYS`, `PROPERTY_TYPE_LABEL_KA`.

**Silent:** `database.ts`, sale form `PROPERTY_TYPES`, rental form (land excluded), search filters, admin dropdown + route allow-list (must sync).

**Breaks:** Add value, forget one list (invisible in filter); form/route allow-lists drift (400 on save); land null-set drifts.

---

## C14 — Editorial review gate for public content

**Invariant:** Browser cannot UPDATE public-content columns. Trigger raises 42501; must queue `content_change_requests` for admin. Reviewable list **quadruplicated** (A–D must agree).

**Key exceptions:** `marketing_email/sms/consent`, `terms/privacy_accepted`, `check_in_time`, `profile identity fields` (self-service only).

**Breaks:** Add field to one list only (400 or approval drops it); write directly (42501); form forgets error mapping (raw SQL shown).

---

## C15 — Smart Match actionable count

**Invariant:** One SQL definition: open requests + not answered + not stale. Every surface calls it or reproduces predicate-for-predicate.

**Definition:** `smart_match_actionable_count()` RPC (status='active', check_out >= today, NOT EXISTS offer by caller).

**Breaks:** SQL+TS predicates drift; wrong realtime table; new surface counts wrong predicate.

**S2 (2026-09-27, `20260927090000`):** trigger `enforce_smart_match_request_rules` copies this predicate word for word (`status='active' AND (check_out IS NULL OR check_out >= UTC today)`) to cap a guest at 5 open requests and 10 creations per rolling 24 h. Client rows must be created `active`, may only move to `cancelled`, and take `zone` only as NULL or an existing `zones.name_ka` (NewRequestModal via /api/zones, `src/lib/zones/types.ts:FALLBACK_ZONES`). Errors are 22023; service_role is exempt. **Breaks:** the predicate changes here but not in the trigger; a zone renamed (stale clients get 22023).

---

## C16 — Rate-limit backend & fail-open contract

**Invariant:** `src/lib/rateLimit.ts:checkRateLimit` is single limiter. Postgres backend (fail-open). Fails open when unreachable (deny wrong for abuse mitigation).

**Key:** Upstash → Postgres → in-memory (dev) / allow (prod, logged). 1.5s store timeout. Client IP = `src/lib/client-ip.ts:getClientIp` (re-exported by `rateLimit.ts`, unit-tested): peer = **last** `X-Forwarded-For` hop (DO ingress appends it). App Platform's own edge is Cloudflare, so a peer inside `CLOUDFLARE_IPV4_RANGES`/`CLOUDFLARE_IPV6_RANGES` → `CF-Connecting-IP`, else the hop before the peer; any other peer is the client. Never the first hop, never `DO-Connecting-IP`. Ranges = cloudflare.com/ips-v4 + ips-v6 (re-sync on change). Deno twin `_shared/guards.ts` still reads the first hop (s-sec-harden D8).

**Breaks:** Re-add env-var requirement to check-production-config (prod build fails); limiter fail-closed (every route 429'd); trust the first hop (spoof bypass, 2026-09-08); key on the raw last hop behind Cloudflare (one bucket per edge — the 2026-09-09→09-26 view undercount); stale range list (retired range trusts its next holder).

---

## C17 — A cleaner's work lives in TWO tables

**Invariant:** Cleaner surfaces read **both** `cleaning_tasks` (platform) AND `cleaner_manual_tasks` (self-entered). Reading one only silently under-reports.

**Key:** Manual status='accepted' on create. Realtime on both. 30-min slot conflict on both (advisory lock per cleaner).

**Breaks:** Query only platform tasks (manual invisible); pending manual row (invisible on schedule); manual bypass 30-min check.

**Cleaner's view (2026-10-01):** the platform half's apartment and owner come from `get_my_cleaning_task_owner_details()` (C24), never from an embed. `src/lib/cleaner/tasks.ts:mergeCleanerTasks` takes the details as its third argument.

---

## C18 — Owner SMS automation: templates, links, billing

**Invariant:** Templates in Deno `domain.ts` **only**. URL/phone logic **duplicated** (TS + Deno). Three billing paths on one table. Queued but charged only on provider success.

**Key:** `marketing_opt_out` now trigger-derived (C30 handles writes). `sms_canonical_ge_phone` in BOTH trigger + Deno.

**Breaks:** Template/placeholder added one side only; phone normalization drifts; billing path split (double/skip charge).

**Notification mirror (2026-10-01, `20261001130000`, `20261001130100`, staging):** kind `'notification'` is a FREE system kind (platform pays, never debits `sms_remaining`, no marketing consent: a service message, C30). AFTER INSERT trigger `notifications_enqueue_sms` on `public.notifications` is scope-blind and keyed on `user_id`, so a multi-role user is texted for every cabinet. Only types in `sms_notification_types()` (payment_success/failed/refund, cleaning_task_new/status/cancelled/cancellation_requested, smart_match_offer, listing_moderation, verification, job_application) qualify; every one must also be in `email_notification_types()` (`check-contracts` C18 enforces the subset and that `smart_match_request`, `broadcast`, `admin_*` and `vip_*` never appear). Phone = `profiles.phone` via `sms_canonical_ge_phone` (null/invalid: skipped quietly; staging 2026-10-01: 17 of 30 profiles have none). Text = `MyBakuriani: ` + the notification TITLE (70 chars in total, one UCS-2 segment: the 13-character prefix + a title of at most 57; never the body). Caps over rows with status <> 'failed': 3 per (user, type, scope), 8 per user, and 8 per canonical recipient number across ALL accounts (try-locks, never blocking: a statement timeout would escape `WHEN OTHERS` and fail the notification INSERT). `profiles.phone` is self-entered and unverified (phone OTP is gone), so the per-number cap is the abuse brake. `sms_outbound.source_notification_id` (unique FK, SET NULL) links each row to its notification: it makes the mirror idempotent and the type/scope caps countable. `expires_at` is 6 h and `sms_expire_stale_automation` lists the kind. The kind stays OUT of every charged-kind list (`sms_claim_dispatch_batch` x2, `sms_mark_provider_delivered`, `sms_mark_claim_sent`, the consent credit check). E2E accounts (auth email ending `@e2e.mybakuriani.test`, what `createTestUser` gives the fixtures) are never texted (`20261001130200`): their seeded numbers are real-format Georgian mobiles and staging has no recipient allow-list, so every seed run used to text them. A buyer with a phone gets two texts for a package/VIP purchase (`subscription`/`vip_activation` + `payment_success`). **Breaks:** the kind added to a charged list; `smart_match_request`/`admin_*`/`vip_*` added to the allow-list (fan-out cost); a cap keyed on `user_id` only; a blocking advisory lock; an allow-listed type missing from the email list.

**S2 (2026-09-27, `20260927090000`):** `sms_mark_provider_delivered` writes the delivery-charge description `SMS მიწოდებულია (price_drop)` without the recipient's number for price_drop (the owner's own-contact kinds keep `: <phone>`). Every later redefinition must keep that case.

**S3 / S07 (2026-09-27, `20260927091100`, staging):** the manual-booking consent link reaches the guest only by a platform SMS. `request_manual_booking_sms_consent` (service_role only; called by `src/app/api/renter/manual-bookings/[id]/sms-consent-link/route.ts` for the signed-in owner) is the only path that issues a `manual-sms-v2` token. It checks that the link token in the message hashes to `p_token_hash`, and refuses before any write: cancelled booking, invalid phone, already accepted, `consent_declined` (the guest declined or withdrew for this booking and number), one SMS per number per 24 h (any sender), 20 per owner per 24 h, no free credit. A repeat within 24 h is idempotent, and it never returns the token, link or message. `consent_request` is a CHARGED kind: the list must be identical in `sms_claim_dispatch_batch` (twice), `sms_mark_provider_delivered`, the RPC's credit check and `sms_expire_stale_automation` (2-day window). `update_manual_booking` keeps a queued consent request unless the canonical phone changes (same comparison as the phone-invalidation trigger). The text is `supabase/functions/sms-automation-run/domain.ts:TEMPLATES.consent_request`, imported by `src/lib/sms/manual-booking-consent.ts`, so domain.ts must stay Node- and Deno-safe. v1 (owner-shared) tokens were revoked and their acceptances withdrawn. The route's GET `guestDeclined` mirrors the RPC's `consent_declined` predicate. **Breaks:** the route or RPC returns or logs the token, link or message (owner-forged consent is back); `/api/sms/history` lists `consent_request` without masking `/sms-consent/` links; a charged kind added to only one list; app code calls `issue_manual_booking_sms_consent` directly again; the GET mirror and the RPC predicate drift.

**Length (2026-10-03, `20261003090000`, local + staging DB check only):** every SMS text is written to one UCS-2 segment where it can be (70 UTF-16 units; 67 per segment once split; `MyBakuriani_SMS_Optimization_Spec-2.md`). `domain.ts` clamps the guest name to 20, the property name to 25 and a non-Georgian host number to 20, writes a Georgian host number as `+995…`, keeps map pins to 5 decimals, and the check-in carries no listing link (no site URL or listing status is passed in). The check-in, review, win-back and consent texts ship with the `sms-automation-run` function AND the app (the consent text and the dashboard win-back preview are built from the same `domain.ts`); the price-drop, membership-pending and notification-mirror texts live in SQL and ship with `20261003090000`, which patches the live bodies and raises when an anchor is missing; `messages/*.json` `fixedTemplate` (the seller's price-drop preview) repeats the price-drop text. Links decide the real length (a manual review link is about 94 characters, a consent or listing link 66-80, and there is no short-link service), so every text that carries one is 2-3 segments whatever its wording; `domain_test.ts` pins the check-in lengths and bounds the others. **Breaks:** a text lengthened without re-running those pins; the migration deployed without the app (the preview shows the old price-drop text) or the app without the function (preview and SMS disagree); `fixedTemplate` left out of date.

---

## C19 — Notification `dashboard_scope`

**Invariant:** Every notification carries `dashboard_scope` naming its cabinet. One string in **six** unchecked places: CHECK, TS union, writers, readers, badges, and `email_outbound.dashboard_scope` (copied by `email_enqueue_notification` for routing, the label and the cap; its CHECK list must equal this one).

**Union:** 10 cabinet names + NULL (global: shown in EVERY header bell and in `/notifications`, in no cabinet's sidebar badge or inbox page).

**Key:** Realtime filter stays on `user_id` (scope applied client-side). `_notify` RPC (six-arg with default=NULL).

**Breaks:** Value in CHECK but not union (23514); new writer omits scope (lands NULL: shown in every bell, in no cabinet); realtime filter moved to scope (leaks rows to admins).

**Multi-role bell (2026-10-01):** a user holds several cabinets (`src/lib/cabinets.ts:deriveAvailableCabinets`; `profiles.role` is only the home one), so the HEADER bell on every dashboard and on `/dashboard/account` is the unified all-roles inbox: `useNotifications()` with no scope = every row of the user, NULL included, a small cabinet label per row (`Navbar.scopeLabels.*`, C1), "view all" → `/notifications`. `dashboard_scope` now only drives the per-cabinet sidebar badges, the per-cabinet inbox pages (`/dashboard/<cabinet>/notifications`, which stay scoped) and the label. `DashboardShell` keeps two numbers: `unreadCounts[scope]` (sidebar) and `totalUnread` (all scopes + NULL; seeded from the layout RPC's per-scope sum, which excludes NULL, then made exact by a `user_id`-only head-count on mount, +1 on every INSERT, a debounced recount after every UPDATE and after the sidebar-entry bulk read). The feed handed to bells (`DashboardNotificationsFeedProvider`, wrapping EVERY shell branch) exposes `unreadCount` = total, `adjustUnreadCount(delta, rowScope?)` (total always, bucket only for a non-null scope) and `resetUnreadCount()` (zeroes everything). Each topbar mounts the bell hook ONCE. A bare `/dashboard` `action_url` resolves by scope through `src/lib/notifications/scopes.ts:resolveNotificationPath` (bell modal, email link). `DASHBOARD_SCOPE_LABEL_KA` serves non-next-intl surfaces (email). Mark-all in the bell clears every scope, `severity='critical'` rows included (as the public Navbar bell always did).
**Audience:** notices not aimed at one user (admin broadcasts, subscription-package notices) resolve role audiences with `src/lib/notifications/audience.ts:loadAudienceUserIds`: a user matches when `profiles.role` is targeted OR they derive that cabinet from owned data (`src/lib/cabinets.ts:resolveAudience` reuses `deriveAvailableCabinets`, so audience and switcher cannot drift; `guest`, `admin` and unknown roles stay role-only). Bulk inserts go through `insertNotificationsChunked` (500 per statement; a partial failure records the delivered count). `channel:"email"` broadcasts still insert nothing.
**Breaks (multi-role):** a scope passed to the header bell hook (a cabinet's notices vanish from the others' headers); the bell hook mounted twice per topbar (duplicate `notifications` channel); `useNotifications(scope)` inside the shell reading the all-scope feed; `deriveAvailableCabinets` inputs changed without `AudienceRows`/`loadAudienceUserIds`; an unpaged audience query (PostgREST 1000-row cap truncates recipients); a new scope in the notifications CHECK but not in `email_outbound`'s (the enqueue insert fails inside its exception handler: no email).

**Ownership (C39, 2026-10-02):** owner notices reuse type `verification` with `action_url` `/dashboard/account/ownership` and an explicit `dashboard_scope_for_listing(...)` scope; `admin_ownership_pending` goes through `_notify_admins` (scope `admin`, bell only, coalesced while unread).

---

## C20 — Manual booking cancellation is reversible, not deletion

**Invariant:** Cancellation updates `status` to 'cancelled' (never delete). Both RPCs serialize with SMS lock + property lock. Owner-scoped, idempotent.

**Key:** Cancelled absent from occupancy/SMS/re-booking. Unclaimed SMS failed; sent SMS not rewritten.

**Breaks:** Delete instead of marking (history lost); SMS query includes cancelled (double-send risk).

**S2 (2026-09-27, `20260927090000`):** `cancel_manual_booking`, `restore_manual_booking` and `update_manual_booking` check ownership lock-free (same P0002 `ჯავშანი ვერ მოიძებნა`) before taking the `sms_dispatch_claim` lock, so a stranger's id cannot stall the dispatcher; the lock order after that is unchanged. `manual_bookings` has no table-level client writes (owner RPCs only, C34).

---

## C21 — Restaurant discounts: per-item self-service

**Invariant:** Food discounts moved from whole-listing (retired admin-review) to **per-item self-service** (instant charge). `self_service_activate_menu_item_discount` validates + charges atomically.

**Key:** Card/detail reads `best_active_menu_item_discount_percent` for food (not `discount_percent`). `pricePerSqm` from **discounted** price.

**Breaks:** Call `purchase_package` for discount (bypasses validation); card reads raw `discount_percent` for food (wrong); reopens admin-review path.

---

## C22 — Per-listing analytics: only three metrics, all event-backed

**Invariant:** Owner "analytics" shows views/reveals/favorites **only** (real event logs). NO "impressions" (never tracked, never fabricate).

**Symbols:** `listing_view_events`, `record_listing_view` RPC (counter + row), `listing_analytics` RPC (ownership read, daily buckets Tbilisi), `POST /api/listings/[kind]/[id]/view`.

**Key:** Beacon order: active check (404) → owner skip `{counted:false, reason:"self"}` (incl. `?preview=1`) → history upsert (C35) → dedup 1/24h per viewer (`listing-view:user:<id>:…` signed in, `listing-view:ip:<C16 ip>:…` anon) → `record_listing_view`. Every answer carries the live `views` (C28). `views_count`/`menu_views_count` are service_role/admin-only: `prevent_listing_protected_field_change` raises 42501 on user UPDATE, `force_listing_moderation_state` zeroes them on user INSERT (audit ignores counters, so these triggers are the only guard). `seller_dashboard_stats`: sale listings only; `views_total` = events in `[p_from,p_to)` (lifetime counter only when both bounds NULL; events exist since 2026-08-08). `owner_dashboard_stats`/`listing_analytics` totals stay lifetime `views_count`; food dashboard KPIs are scoped to the displayed restaurant.

**Breaks:** Add metric without event source (fabricates); route uses service-role (every owner 403s); new path skips dedup (over-counts); dedup keyed on a shared edge IP (under-counts); owner views counted; counters writable by owners (fake popularity, no audit row); ranged funnel mixed with lifetime views.

**S3 (2026-09-27, C37):** after 90 days `listing_view_events.client_ip` and `contact_reveal_events.{client_ip, device_id, account_id}` are set to NULL. Rows stay, because `listing_analytics`, `seller_dashboard_stats` and lifetime reveals count rows. The 24 h view dedup lives in `rate_limit_counters` and is unaffected.

---

## C23 — Standard & SUPER VIP mutually exclusive

**Invariant:** Active SUPER VIP blocks standard VIP (22P01 / `vip_tier_conflict`). Activation clears `is_vip`. Stale expiry allows standard.

**Breaks:** Trigger dropped (mutual exclusive lost); check raw `is_super_vip` (expired disabled); picker omits disabled guard.

---

## C24 — Cleaner call-out terms & consent-based cancel

**Invariant:** Call-out is durable agreement. Renter sees cleaner + terms, can withdraw pending, accepted needs cleaner consent to cancel. Cancellation reserves slot.

**State:** pending → accepted|declined (cleaner) → cancelled | in_progress → completed.

**Breaks:** Delete instead of cancel (history lost); cancellation_requested hidden (unanswered disappears); omit scope (invisible in cabinet).

**S2 (2026-09-27, `20260927090300`):** `cleaning_tasks.status` is NOT NULL and `cleaning_tasks_status_check` is VALIDATED. Adding a status value means replacing the CHECK, which now validates every row.

**Cleaner's view (2026-10-01, `20261001090000` → `20261001093200`, staging):** RLS lets only the owner read the call-out's `properties` and `profiles` rows, so a cleaner's own task query can never embed them: both came back null ("—" for the apartment and the owner, no number), and same-account tests hid it. A cleaner gets them only from `get_my_cleaning_task_owner_details()` (`src/lib/cleaner/tasks.ts:loadCleaningTaskOwnerDetails`; both loaders retry it once after 500 ms, and only for a failure that comes back fast and may clear: no response or a gateway page, connection/serialization/resource SQLSTATEs, PostgREST's connection errors; `src/lib/with-timeout.ts:isRetryableDbError` never retries a timeout (a `timeoutFetch` abort, statement timeout 57014, pool wait PGRST003: the server render is held to about 10 s, so a second 9.5 s try would double it) or a definitive answer such as a missing function or a denied request): definer, `task.cleaner_id = auth.uid()`, REVOKE FROM PUBLIC, anon + GRANT authenticated. It returns the owner's name and avatar, the number (`COALESCE(properties.phone, profiles.phone)`), WhatsApp, and the listing's id/title/location/pin/type/area/rooms/bathrooms/for-sale/active flag, **every field only while the call-out is live** (pending, accepted, cancellation_requested, in_progress, completed); a declined or cancelled call-out returns its row with nothing in it. That withholds the number, WhatsApp, owner name and photo, pin and facts; what the call-out itself carries stays with the cleaner: the apartment's title in the bell and the emailed copy, and in the `cleaning_tasks` row (the participants' SELECT policy) the time, the address, the owner's note, the price, the service title and the ids (the call-out modal tells owners the cleaner sees address, note and number as soon as they send it, even if the cleaner declines). For an active listing the apartment fields are what `public_properties` already shows everyone; for a draft or blocked one they are the owner's own act of sending this cleaner there, `property_is_active` (= `status = 'active'`; the view also needs an active organization when `organization_id` is set, which only sale listings have) is false, and the UI offers no link (the public pages serve active listings only). The number shows from `pending` on, unlike the renter-side accepted-only `get_my_cleaning_task_cleaner_details`: the owner chose this cleaner and the cleaner needs it to decide; the call-out modal and the card's confirm hint say who sees what. The owner's time field is labelled "Start time" (`RenterCleaners.callModal.startTime`): `scheduled_at` is a start (the slot rule is ±30 minutes around it) and the cleaner reads it as "Starts at"; switching the apartment in the modal drops an address typed for the previous one. `tel:`/wa.me links come only from `normalizeE164Phone`, and no contact-reveal event is written. The cards (`CleanerDashboardClient`, `dashboard/cleaner/schedule`) render `src/components/cleaner/CleanerTaskDetails.tsx`; a call-out with no details row (the RPC failed or lost a race) says the details could not be loaded and never that the owner gave no number (`CleanerTaskItem.detailsLoaded`), and its Confirm stays disabled (declining does not, and the reason is printed right above the buttons and tied to Confirm with `aria-describedby`): a cleaner must not accept a job they cannot read. A refetch whose lookup failed does not undo what a card already had: `src/lib/cleaner/tasks.ts:keepLoadedDetails` (both pages' refetches) carries the apartment and the owner over for a call-out that had them, while its status, time, price and notes come from the new row, so one aborted request on a weak signal cannot take the owner's number off a job the cleaner is standing at; a call-out that never had details stays unreadable. `TaskAreaOnlyHint` ("only the zone is given") shows while the job is still ahead, not once it is in progress or completed, and does not tell the cleaner to call when the owner left no number. `notify_cleaner_of_new_task` formats `scheduled_at` in `Asia/Tbilisi` (the database clock is UTC) and appends the address (80 characters), flattening whitespace, control, zero-width and bidi characters (not the joiners U+200C/U+200D, so a family emoji or a Persian word stays whole) in the owner-typed title and address so a typed line break cannot fake a second line, nor an override reorder the time, in the bell or the emailed copy. The class is one explicit list of code points written as a PostgreSQL `U&'...'` escape (never a `\s`/POSIX class, whose coverage depends on the database's locale and regex flavor), defined by the last migration that re-creates the function, `20261001093200`. `create_cleaning_task` (`20261001093100`) rejects a non-finite `scheduled_at` or one over two years out with 22023 (an `infinity` row made the cleaner's dashboard throw on every render). `anon` and `authenticated` hold SELECT only on `cleaning_tasks` (`20261001093000` revoked INSERT/UPDATE/DELETE/TRUNCATE; the PG17 `MAINTAIN` privilege that Supabase's default grants give them on every public table is still there, covers no row access and no command PostgREST can issue): the RPC trusts the row's owner/property/cleaner link, which only `create_cleaning_task` writes, so grants and RLS now hold it together. **Known limits:** the RPC returns one row per call-out of the cleaner, whatever its age, and has no ORDER BY, so a PostgREST row cap (the hosted API's 'Max rows', 1000 by default; `supabase/config.toml` configures only the local stack) would cut an undefined set of rows (on staging's plan the newest, the live requests: their cards would say the details could not be loaded and Confirm would stay disabled; no cleaner is near it, and an ORDER BY or a status/date filter in the RPC is the fix if it ever matters); carried-over details are as old as the last lookup that worked (a listing's number or pin the owner changed meanwhile shows only after the next successful one); the owner-typed title and address are plain text in the bell and in the emailed copy (C33: an escaped copy of the notification), so a mail client may turn a typed URL into a link, as it would for any other user-typed notification text; the card times use the viewer's own device time zone (the bell's use Tbilisi); a cleaner keeps the number of a listing an admin has since blocked for as long as the call-out is live. **Rollout (staging only so far):** apply `20261001090000` (if the project lacks it), `20261001093000`, `20261001093100` and `20261001093200` in that order, then deploy (`src/lib/types/database.generated.ts` already carries the RPC's 16 columns, generated from staging: do not regenerate it from prod before staging's other schema ships, or the staging-only types the merged code reads disappear); a read-only look at prod's `cleaning_tasks` grants and `get_my_cleaning_task_owner_details` first. **Guards:** `check-contracts.mjs` C24 (the RPC's live-status list = the status CHECK minus the statuses that end a call-out, `WITHHELD` in the check; the query ends in `WHERE <alias>.cleaner_id = auth.uid()` (or `(SELECT auth.uid())`, optionally an ORDER BY) with no OR and no set operation, and every column but `task_id` is `CASE WHEN <gate>.live`; the NET `EXECUTE` after replaying every GRANT/REVOKE/DROP/CREATE in migration order is authenticated only (a `CREATE OR REPLACE` keeps the ACL it finds, so it need not restate it; a fresh create must); nothing later drops, renames, moves or SECURITY INVOKER-s it; `CleaningTaskOwnerDetails` = the RPC's columns; no embed in cleaner queries; both loaders hand the RPC rows to `mergeCleanerTasks` as its third argument; no `cleaning_tasks` writer in `src/`; the net client DML after the same replay is none; the bell time is in Tbilisi and flattened with the explicit class, in any letter case; each function is found by its CREATE, so a later GRANT, ALTER, COMMENT or trigger re-wire is not mistaken for its definition; comments and COMMENT ON strings are not statements; the CHECK may read `IN (...)` or `= ANY (ARRAY[...])` and is read up to its own closing parenthesis; a body `$$` or `$function$`; a file that holds the service-role client is not a user session). It is a static text check with limits: a function patched by `replace(pg_get_functiondef(...))`, a writer reached through a cast or a table-name constant, a cleaner query outside the dashboard directory, and RLS switched off are invisible to it (the live `check-db-contracts` C34 sees the last). A function is its whole name plus an empty argument list (`name`, `name()`, `public."name"()`): another schema's, a longer name such as a `_v2` and an overload `name(uuid)` are other functions, so they neither trip the check nor are checked by it; a quoted `"public"` schema counts for functions, for the `cleaning_tasks` table and for `ALL ... IN SCHEMA` targets. `check-db-contracts.mjs` C24 (the RPC exists on the live project with those columns), e2e `cross-role/cleaner-call-out-details.spec.ts`. **Breaks:** an embed of `properties`/`profiles` in a cleaner query (null for everyone but the owner); a new status in the CHECK left out of the RPC's list (the details vanish; the C24 check fails); dropping the status gate or widening the projection (a declined cleaner keeps the owner's number and apartment); a re-GRANT of client DML or a write policy on `cleaning_tasks` (a cleaner could re-point a call-out at any owner and read that owner's number); formatting a notification time without a zone (the bell says 10:00 for a 14:00 job); a Confirm that stays enabled for a request whose details were never read, or a refetch that blanks details a card already had; a deploy ahead of its migration (cards say the details could not be loaded and Confirm is disabled; `check-db-contracts` against that project fails, but nothing gates a prod deploy on it, so apply the migrations first).

---

## C25 — `profiles` column grants narrower than table grant

**Invariant:** `anon` has column-level SELECT only (safe subset). Not: phone, personal_id, role, notification_prefs, marketing_opt_out.

**Fix:** `REVOKE SELECT ON profiles FROM anon` + `GRANT SELECT (safe) TO anon`. Column grants additive—cannot carve out exception.

**S1:** writes are column-level too — authenticated INSERT (id, phone, display_name, bio, avatar_url, role) / UPDATE (role only, for the register 23505 retry); anon none (C34). Every other profile write is service-role (`/api/self-service/profile`, `/api/consent`, admin routes). A browser PATCH of any other column returns 403 42501 even when the value is unchanged.

**Breaks:** Table `GRANT` to anon (re-opens PII leak); add broad policy to anon+authenticated (same leak).

---

## C26 — Admin numbers have exactly one source; never `bookings`

**Invariant:** Every admin-surface number has **one SQL definition** called everywhere. (1) Metrics from `manual_bookings` only. (2) Revenue = one `platform_revenue()` RPC.

**Why:** `bookings` is dead—nothing inserts. Any metric without one definition silently disagrees.

**Breaks:** Query `bookings` directly (stale rows); re-derive revenue by summing transactions (includes topup); compute client-side from other fields.

**S3 (2026-09-27, C37):** `page_views.user_id` is set to NULL after 90 days, so `registered_visitors` counts signed-in visitors seen in the last 90 days. Total, unique and 7-day visits are unchanged (`visitor_id` is kept).

---

## C27 — Production site lock (`SITE_LOCKED`) gates page views

**Invariant:** Middleware gates page views behind password when `SITE_LOCKED="true"` (no NEXT_PUBLIC_—password never reaches client). `/api/*` NOT gated.

**Key:** Two writers of one cookie: the bypass link `/<password>` (middleware) and the `/site-locked` form → `POST /api/site-lock/unlock` (10/h/IP). `mb_gate` = password (not hashed), httpOnly, lax, path `/`, 30 days — both writers keep identical attributes. Constant-time compare (middleware `constantTimeEqual`, route `timingSafeEqual`). `secure` = request https OR `NEXT_PUBLIC_SITE_URL` https; Next honours `X-Forwarded-Proto`. Fail-closes without password. Password is in public git history — rotate.

**Breaks:** Use NEXT_PUBLIC prefix (ships password); drop Cache-Control (edge serves stale); use request.url origin (fails on DO—use NEXT_PUBLIC_SITE_URL).

---

## C28 — Public detail routes are ISR + cookie-free

**Invariant:** 8 detail routes are ISR-on-demand (`revalidate=60`, no cookies/auth/headers). Owner preview **only** under force-dynamic `/preview` twins (rewrite on `?preview=1` + auth cookie).

**Key:** Static→dynamic flip = hard 500 (E132). `htmlLimitedBots:/.*/` makes every UA get blocking metadata in `<head>` (without it Next streams og:*/canonical into `<body>` for browsers and Cloudflare cached that for WhatsApp). Live/personal data only after hydration: detail clients take the live view count from the view beacon's `views` (`src/lib/hooks/useListingViewCount.ts`); per-user history is written by that POST route, never read by the page.

**Edge cache (S1):** `next.config.ts:headers()` owns page Cache-Control, in order: baseline → detail/blog `s-maxage=60, stale-while-revalidate=300` (8 kinds + `/blog/:slug`, any locale, `missing: preview`; also matches `/sales/all`, every method, case-insensitive) → **last:** an `rsc` header with no/empty `_rsc` → `private, no-store` (S01). Next 15.5.25 runs header rules before middleware, a later rule overwrites the same key, and middleware wins. Keep the key spelled exactly `Cache-Control` in every rule. Middleware can't see `rsc`/`_rsc`, so it sets Cache-Control only on the signed-in `/preview` rewrite, site-lock and consent responses. An empty query value counts as absent (anon bare `?preview` gets the edge header; bare/empty `?_rsc` counts as missing). `_rsc` is not validated, so `?_rsc=`-keyed Flight/5xx responses stay cacheable. Known gap: `/en|/ru` `?preview=1` never reaches the `/preview` route. Relies on Cloudflare honouring origin Cache-Control.

**Breaks:** Add auth/cookie to detail (500); add new kind without `/preview` twin (404); drop Cache-Control (BYPASS Cloudflare); render personalized server-side; set Cache-Control for pages in middleware (overrides the RSC rule); moving the RSC rule off last place; mixed-case `cache-control` keys across rules (insertion order then decides, not rule order).

---

## C29 — Executable contract checks

**Invariant:** Every string coupling **is** checked mechanically. New coupling → add to script same session or enforcement lapses.

**Scripts:** `check-contracts.mjs` (invokes, verify_jwt, CSP, media-types, property-types, no src/ imports of generated). `check-db-contracts.mjs` (enums, scopes, placements, review-gate, realtime, cron, tiers, membership, payment status, consent). `check-contracts.mjs` C6 shared Supabase hosts; `check-db-contracts.mjs` C34 `EXPECTED_CLIENT_WRITES`; `check-http-hardening.mjs` is a manual live check, not in prebuild or CI.

**Breaks:** New coupling added without script (drift); script at prod before migration (404); pure helper gains runtime import (test fails).

**S2/S3 (2026-09-27):** `check-db-contracts` reports a missing `schema_contract_snapshot` / `content_review_gate_column_drift` / `security_posture_snapshot` RPC as a failure naming the migration that adds it, and skips the checks that need it (a verdict, not a crash, against a project behind the batch). C4 expects 9 jobs; C34 covers seven client tables. `check-contracts` gains C36 (the confirm page verifies on click only, for email|signup; login's signUp and resend redirect to /auth/confirm). C24 (2026-10-01): `check-contracts` pins the cleaner's call-out view (RPC statuses = CHECK, columns = TS type, no embeds, writers or re-grants, bell zone) and `check-db-contracts` checks the RPC exists with its columns.

**C39 (2026-10-02):** `check-db-contracts` reads `ownership_contract_snapshot()` (a missing RPC is a failure naming `20261001200000`; the dependent checks are skipped); `check-contracts` checks that `OWNERSHIP_ORIGINLESS_POST_PATHS` route files exist and the middleware uses the list.

**C40 (2026-10-03):** `check-contracts` pins the SEO surface (robots prefixes vs middleware's protected prefixes, sitemap vs the page directories, the resort guide's directories vs `GUIDE_PATHS`, metadata helpers on every public page, the canonical host in three files, sitemap image sizes vs `next.config.ts`, the single hreflang source, the one JSON-LD writer); `scripts/unit/seo-{foundation,sitemap,jsonld,guide}.test.mjs` cover the pure modules and the guide copy (message keys, tags, title lengths). Also pinned: the breadcrumb/related-listings column (`DETAIL_WIDTH`) against each detail client's root container, and no `backgroundImage` in `src/app` other than `HERO_NOISE_BACKGROUND`. `e2e/public/seo.spec.ts` reads robots.txt, the sitemap and the pages over HTTP (canonical/hreflang/h1/JSON-LD per page and locale, one URL per listing, 404s, `llms.txt`); it passes in both indexing modes, and its indexable branch runs only against a build made with `NEXT_PUBLIC_SITE_URL=https://mybakuriani.ge` (`E2E_BASE_URL` pointing at it), since e2e refuses the production host.

---

## C30 — User consent: authored column + derived mirror

**Invariant:** `profiles.marketing_sms_consent` (nullable tri-state) is authored truth. `marketing_opt_out` is trigger-DERIVED mirror—**never write** (overwrites).

**Derivation:** `marketing_opt_out := NOT COALESCE(marketing_sms_consent, false)`.

**Breaks:** Write `marketing_opt_out` directly (trigger overwrites); derivation dropped (new users revert to consented); sender reads column directly (not via `marketingChannelAllowed`).

---

## C31 — Paid services: 2026 price list + seasonal membership gate

**Invariant (staging only):** Rental posting requires active, started seasonal renter membership. Database is authority.

**Gate:** Trigger `enforce_private_rental_membership` on rental inserts. Raises 42501 for non-member. Service-role exempt INSERT only.

**Breaks:** Gate dropped (posting ungated); membership check skipped (overlap allowed).

---

## C32 — Keepz card payments (only real-money path)

**Invariant (staging only):** Real money via **Keepz only**, as wallet credit 1:1. **Only authority = Keepz status we requested** (TLS, encrypted, order matched).

**Key:** Credit on verified SUCCESS only (FOR UPDATE, credited_at IS NULL). No callback/return-URL/browser trust.

**Breaks:** Credit from callback/browser (trust misplaced); skip `syncPaymentWithKeepz`; refund retried after Keepz refuses (double refund); status CHECK drifts.

**S2/S3 (2026-09-27, staging; `20260927090300`, `20260927091000`):** UNIQUE `transactions(reference_id) WHERE type='topup' AND reference_id IS NOT NULL`, so a second credit for one Keepz payment is a 23505, not a silent double credit. There is no unique key on `payments.provider_transaction_id` (Keepz returns ids, possibly a shared "0", for declined orders). `balances.amount` / `sms_remaining` are NOT NULL DEFAULT 0 with CHECK >= 0: every debit locks the row and refuses below cost before subtracting. `payments.user_id` / `payment_refunds.user_id` are nullable with ON DELETE SET NULL under the load-bearing names `payments_user_id_fkey` / `payment_refunds_user_id_fkey` (`/api/admin/payments` embeds `profiles!payments_user_id_fkey`). A payment whose payer was deleted is never credited (SUCCESS becomes cancelled + review flag `unverified_order` + `last_error='payer_account_deleted'` + admin notice); `keepz_open_payment` matches the payer NULL-safely. **Breaks:** FK back to CASCADE (deleting a profile erases the money trail); FK renamed (admin payments embed fails); code assuming a non-null payer; a new credit path reusing a payment id as a topup reference (23505); a debit RPC without the balance guard (23514 instead of a clean refusal); redefining `keepz_apply_payment_status` from anything but the live body (drops the orphan branch).

---

## C33 — Email: everything through Resend

**Invariant (staging only):** All email via **Resend** (one team/domain mybakuriani.ge, eu-west-1). Transactional = copy of in-app notifications. Auth SMTP via Resend. Contacts' `unsubscribed` = `profiles.marketing_email_consent`.

**Key:** Dispatcher fails closed without `EMAIL_DELIVERY_ENABLED=true`. Idempotency key = email_outbound.id.

**Breaks:** Add notification type without allow-list (no email); drop Cache-Control (stale redirects); unsubscribe webhook re-triggers (loop).

**Per-role (2026-10-01, `20261001120000`, staging):** `email_outbound.dashboard_scope` (nullable, CHECK = the C19 list) is copied from the notification by `email_enqueue_notification`; `email_claim_batch` returns it as its LAST column (grants re-applied: service_role only). The dispatcher rewrites a bare `/dashboard` `action_url` to `/dashboard/<scope>` (`resolveNotificationPath`) and `renderNotificationEmail` adds a `კაბინეტი: <label>` line (HTML-escaped; none for NULL), so a multi-role user knows which role an email is about. The class-3 cap is per (recipient, type, scope) (`IS NOT DISTINCT FROM`, so NULL is its own bucket) and counts only `queued`/`sending`/`sent` rows, so one role's events or never-delivered rows cannot starve another's. `verification` is emailed (class 2). A claim from a database without the column falls back to the old link and no label (deploy order: migration first). **Breaks:** a scope added to the notifications CHECK but not to `email_outbound`'s; the cap keyed on (user, type) only; a cabinet-less `/dashboard` link in a new writer (resolves by scope, but only if the scope is set).

**S2 (2026-09-27, `20260927090100`):** `email_notification_priority(text)` classes every emailed type. Class 1: payment_success, payment_refund, company_subscription, membership_pending/approved/rejected, admin_payment_review. Class 3 (anyone can trigger at will): payment_failed, job_application, smart_match_request/offer, org_membership_request/response, cleaning_task_new/status/cancelled/cancellation_requested, admin_listing_pending, admin_content_change_pending, admin_company_pending, admin_sms_pending. Class 2: the rest. `email_claim_batch(p_limit, p_claim_token, p_shared_limit)` claims class 1, then 2, then 3 (oldest first within a class) and at most `p_shared_limit` rows of classes 2-3; the dispatcher (`src/lib/email/budget.ts:claimRoom`) keeps the last ceil(cap/4) of `EMAIL_DAILY_CAP` for class 1. Enqueue sends at most 3 class-3 emails per (recipient, type) per rolling 24 h; the in-app notification always lands. Final-state `email_outbound` rows older than 90 days are deleted (C37). **Breaks:** a new emailed type left unclassified (class 2, uncapped); a user-triggerable type put in class 1 (spends the reserve); the dispatcher deployed before the migration (`claim_failed`, nothing sent).

---

## C34 — Explicit grants; public_* views are read-only

**Invariant:** anon/authenticated may only SELECT the six `public_*` views (they are owned by postgres, which bypasses RLS, so a write grant on an auto-updatable one writes straight into `profiles`/`organizations`). Default privileges for `postgres` grant anon/authenticated nothing in `public`, and new functions get no PUBLIC EXECUTE — every new table/view/sequence/function states its GRANTs in its own migration.

**Symbols:** `supabase/migrations/20260926170000_s0_revoke_public_view_writes_default_privileges.sql`, `public.security_posture_snapshot()` (`20260926170100`), `scripts/check-db-contracts.mjs` (C34 block, allow-list `ANON_DEFINER_ALLOW`).

**Key:** new RPC → `REVOKE ALL … FROM PUBLIC, anon` + `GRANT EXECUTE … TO authenticated` (anon only if public). New table → GRANTs matching its RLS policies. `supabase_admin`-owned objects keep Supabase's defaults (postgres cannot alter them). Extensions installed by postgres need explicit grants for the API roles.

**Breaks:** a migration creates a table/RPC without GRANTs (client gets 42501 permission denied, not an empty RLS result); someone re-grants ALL on a view (anon DELETE through it); a SECURITY DEFINER fn executable by anon/PUBLIC outside the allow-list.

**Client write grants (S1, 2026-09-26, `20260926190500`):** `authenticated` INSERT/UPDATE only the exact JSON keys the browser sends — profiles INSERT (6) / UPDATE `(role)`; properties INSERT (35) / UPDATE `(cadastral_code_public, organization_id)`; services INSERT (51) / UPDATE `(status)` — `anon` writes none of the four tables, and nobody but service_role writes `bookings` (no client writer exists; the two client write policies were dropped). `scripts/check-db-contracts.mjs:EXPECTED_CLIENT_WRITES` asserts it via `security_posture_snapshot()->client_write_grants`. `prevent_listing_protected_field_change()` also blocks a non-admin owner moving a SERVICE out of `blocked` (admin takedown, S06); owners keep active↔draft and active→blocked. **Breaks:** a new key in a create-form / register payload without a GRANT migration (the form fails with 401/403 42501 — add the column to the GRANT and to `EXPECTED_CLIENT_WRITES` in the same change); a table-level `GRANT INSERT/UPDATE` (re-opens trust, billing and counter columns); redefining that trigger from anything but the live definition. Staging ledger version `20260926185555`. Apply after `20260926171100` (the trigger body embeds its counters guard). DELETE stays table-level (RLS). "Admins full access bookings" is SELECT-only in effect — admin writes go through the service role. An invoker function/trigger that writes these tables in its own statement 42501s — make it DEFINER; BEFORE-trigger `NEW.col :=` is fine. `client_write_grants` reports direct and PUBLIC grants only. A 42501 test must not include unrelated ungranted columns (e.g. `id` on services).

**S2/S23 (2026-09-27, `20260927090000`, `20260927092000`):** `smart_match_requests`: authenticated INSERT (guest_id, check_in, check_out, guests_count, budget_min, budget_max, zone, status) and UPDATE (status), no DELETE. `manual_bookings`: no table writes for anon or authenticated (owner RPCs only). `reviews`: authenticated INSERT/UPDATE (table-level, RLS-scoped), anon none, nobody DELETE/TRUNCATE. `security_posture_snapshot()->client_write_grants` now reports all seven tables and `EXPECTED_CLIENT_WRITES` asserts them. The new definer `apply_pii_retention(integer)` is service_role/pg_cron only. **Breaks:** a new key in the smart-match request payload without a GRANT (42501).

**cleaning_tasks (2026-10-01, `20261001093000`):** `anon` and `authenticated` hold SELECT only (RLS: participants; the project-wide PG17 `MAINTAIN` privilege aside, see C24); the two writers are the definer RPCs `create_cleaning_task` and `transition_cleaning_task`. The table is not in `security_posture_snapshot()`, so the static C24 check in `check-contracts.mjs` guards it by replaying every GRANT/REVOKE in migration order (the net client DML after all migrations must be none; a blanket `ON ALL TABLES IN SCHEMA public`, an unqualified table name, a column-level UPDATE and a later re-GRANT all count; no `src/` writer outside service-role files). A project restored without the migrations' REVOKE, a write policy added by hand and RLS switched off are invisible to it (C34's live checks see the last): the live denial is asserted by the e2e test `no browser session can write cleaning_tasks`. **Breaks:** a client INSERT/UPDATE/DELETE grant or policy there (C24: the details RPC would become a phone-number lookup).

**Ownership (C39, 2026-10-02, `20261001200000`):** `ownership_verification_documents` is service_role only; `ownership_verifications` gives `authenticated` SELECT through a COLUMN grant (own rows by RLS; never `reviewed_by` or the document ids, so the browser selects `OWNER_VERIFICATION_COLUMNS`, never `*`) and no client writes; the five ownership RPCs are service_role only and every trigger/helper function is revoked from PUBLIC, anon and authenticated. `ownership_contract_snapshot()` reports both tables' client grants (direct, column-level and PUBLIC).

---

## C35 — Recently viewed history (guest dashboard)

**Invariant:** `public.recently_viewed_listings` (user_id → profiles CASCADE; property_id XOR service_id per C9, CASCADE) is written **only** by `POST /api/listings/[kind]/[id]/view` (service role, `viewed_at`=now, signed-in non-owners of ACTIVE listings, **before** the 24h view dedup) and read **only** by `loadGuestData` under the user's JWT (RLS own rows; authenticated = SELECT only), two-step `.in("id")` on `public_properties`/`public_services`.

**Symbols:** `supabase/migrations/20260926171000_recently_viewed_listings.sql`, `src/app/api/listings/[kind]/[id]/view/route.ts`, `src/app/[locale]/dashboard/guest/loadData.ts:loadRecentListings`, `GuestDashboardClient.tsx:RecentListingCard`.

**Key:** Non-partial `UNIQUE(user_id,property_id)`/`UNIQUE(user_id,service_id)` are load-bearing (PostgREST `onConflict` cannot target partial indexes). Explicit GRANTs (C34). No audit trigger, no realtime, no backfill (starts empty), no prune (bounded by distinct listings). Cards link via `propertyViewUrl`/`serviceViewUrl`.

**Breaks:** upsert after the dedup gate (same-day revisits never re-sort); reading base tables or embedding views (RLS hides other owners' rows); partial unique index (upsert 42P10); client-side writes (no INSERT grant); hand-rolled hrefs (hotels open /apartments, food /services).

---

## C36 — Sign-up email confirmation link

**Invariant (staging code; hosted switch pending):** four places agree on one path and link type. (1) The hosted "Confirm signup" template links to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. (2) `src/app/[locale]/auth/confirm/page.tsx` is a client page (no `route.ts` in the segment) that accepts only `CONFIRM_OTP_TYPES` = email|signup (plus a PKCE `?code` fallback) and verifies **only on a button click** (`verifyOtp` in the browser): a mail scanner's prefetch must not confirm an address, and `/verify` must count against the user's IP. (3) `src/app/[locale]/auth/login/page.tsx:CONFIRM_REDIRECT_URL` (`${NEXT_PUBLIC_SITE_URL}/auth/confirm`) is the `emailRedirectTo` of signUp and resend. (4) `?error=invalid_link` on /auth/login is the shared expired-link flag.

**Key:** landing after the session is set lives only in `src/app/[locale]/auth/post-auth-redirect.ts:postAuthRedirectPath` (callback and confirm); no profile → /auth/register (the wizard is the only profiles INSERT). The resend cooldown (60 s) mirrors `smtp_max_frequency`. Order: deploy → template → `mailer_autoconfirm=false`. Auto-confirm lets anyone register someone else's address and have it auto-linked later (S18). `check-contracts` C36 enforces the repo side; the hosted template is outside the repo.

**Breaks:** template path or type renamed on one side (every confirmation → invalid_link); an effect verifies on load (scanners confirm addresses); confirmation switched on before the page ships (404); default template kept (fragment tokens the page never sees); wrong `site_url` (links to the wrong host); prod switched on with the built-in SMTP (only team members receive mail).

---

## C37 — Personal-data retention and cron history

**Invariant (staging):** `public.apply_pii_retention(p_days default 90)` (`20260927091000`, SECURITY DEFINER, service_role/pg_cron only) is the only retention path; job `pii-retention-daily` (41 2 * * *) runs it. After p_days: `listing_view_events.client_ip`, `contact_reveal_events.{client_ip, device_id, account_id}` and `page_views.user_id` are NULL (rows kept: C22/C26 count rows); `audit_logs` values are dropped (UPDATE rows keep which fields changed, as `[omitted]`) except for manual_bookings, balances, transactions, payment_refunds, pricing_packages and promocodes; final-state `email_outbound` rows are deleted (queued/sending never). Notifications are kept (users see their whole inbox). `cron-history-gc` (17 3 * * *) keeps 14 days of `cron.job_run_details`. Both jobs are SQL-only (no Vault, no HTTP).

**Breaks:** a new PII column in these tables not added to the function; a PII table added to the audit exempt list; a reader that needs raw IPs or user ids older than 90 days; scrubbing switched to deleting where analytics count rows; EXECUTE granted to anon/authenticated; the migration applied to a project without C33's `email_outbound` (apply the Resend batch first).

**Ownership documents (C39, 2026-10-02):** ID cards and registry extracts are deleted after the admin decides (claim under the owner lock → Storage `remove` → `purged_at`), discarded and failed uploads soon after, unsubmitted ones within 25 h once `ownership-document-purge-hourly` runs; ownerless ones (deleted account) at the next purge. `ownership_verifications` rows (decision, reason, dates) stay; their audit values are scrubbed after 90 days like other tables. **Breaks:** a reader that needs a document after the decision; a purge that deletes rows instead of stamping `purged_at`.

---

## C38 — Geolocation consent, personalized road card, in-page routing

**Invariant:** `mb_cookie_consent` (`src/lib/consent/cookies.ts`) is `v2|analytics=<0|1>|location=<0|1>`; `location` is independent of `analytics` (neither write gates the other) and a legacy `v1|analytics=<0|1>` cookie still parses, with `location: null` ("never asked" — never treated as consent). The only code that calls `navigator.geolocation` is `src/lib/geolocation/useUserLocation.ts`; it never persists coordinates anywhere (not the cookie, not storage), only the yes/no outcome. `src/lib/road-condition/shared.ts` holds the plausibility-check/classification/formatting logic BOTH road-status paths use: `server.ts` (server-only, secret `MAPBOX_ACCESS_TOKEN`, fixed Tbilisi→Bakuriani, `withLiveRoad`) and `personalized.ts` (client, public `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`, arbitrary visitor origin, `withPersonalizedRoad`) — but each keeps its OWN plausibility bounds (server.ts's 100 km/1 h minimums would wrongly reject a visitor already near Bakuriani). `src/lib/maps/directions.ts:fetchDrivingRoute` (client, Mapbox Directions `driving-traffic`, public token) is the one route-geometry fetch shared by the personalized road card's map (`RoadRouteMap.tsx`) and every listing map's "show me the route" button (`BakurianiMap.tsx`'s `showRouteButton`/`route` props). The props stay on `BakurianiMap.tsx`, but since the 2026-09-27 mapbox-gl split (C6) the route line layer and its origin marker are drawn in `src/components/maps/MapboxCanvas.tsx`, and `RoadRouteMap.tsx` waits for `canvasReady` like every other `dynamic()` import of the map. `src/lib/maps/googleMapsUrl.ts:googleMapsDirectionsUrl` builds the "open in Google Maps" deep link; without an `origin` it still works (Google Maps falls back to the device's own location), which is the fallback shown when a visitor declined. Reverse geocoding (coords → place name, for the personalized card's label) is an additive `lat`/`lng` branch on `/api/geocode` (Photon, same provider as that route's existing forward search) — unlike the forward path, NOT filtered to Georgia.

**Key:** `showRouteButton` only makes sense with a single known destination — `BakurianiMap.tsx` derives it from `center` OR (falling back) a sole `properties[0]` entry; wired on the 3 exact-location detail pages (apartments/hotels/sales `[id]`), never on multi-pin listing/zone maps. The personalized road card's title stays the fixed phrase `{ka: "გზა თქვენი მდებარეობიდან", ...}` rather than inflecting an arbitrary Georgian place name (e.g. "მცხეთიდან" is not simply "მცხეთა" + "-დან") — the resolved place name is its own item row instead. `useUserLocation()` listens for `CONSENT_CHANGE_EVENT` (dispatched by both the cookie banner's direct `requestUserLocation()` call and by its own `request()`) so a grant made elsewhere on an already-mounted page — e.g. the road card's own hook instance, separate from the banner's — updates without a reload. This can't loop only because `writeLocationConsent()` is a no-op (no cookie write, no dispatch) when the new value equals the already-stored one — a successful `request()` re-records the same `true` it already read as its trigger, which fires no further event; every mounted hook's own `request()` still runs once per genuine change, never per event it caused itself. `requestUserLocation()` records a decline (`location:false`) only on `GeolocationPositionError.PERMISSION_DENIED` — a transient TIMEOUT/POSITION_UNAVAILABLE leaves consent as `null` ("never asked") rather than looking like a year-long opt-out.

**Breaks:** a new consent field appended to the cookie without extending `parseCookieConsent`'s field-collection loop (it now reads ALL recognized `key=value` pairs, not just the first — restoring first-match-wins silently drops later fields); a road-status caller reusing `server.ts`'s Tbilisi-only bounds for an arbitrary origin (rejects a visitor near Bakuriani); code building Georgian "from <place>" text by string-concatenating the reverse-geocoded name; `fetchDrivingRoute`/`useUserLocation` used from a server component (both are client-only, browser `fetch`/`navigator` respectively); `writeLocationConsent()` dispatching unconditionally again (even when the value is unchanged) — every mounted `useUserLocation()` instance's consent-change listener would then re-trigger itself via its own write, an infinite `getCurrentPosition` loop that crashed the tab in testing; recording any geolocation error as a decline (not just PERMISSION_DENIED) — a transient failure would then permanently look like "no" for a year.

---

## C39 — Ownership verification ("მესაკუთრეობის დადასტურება", staging)

**Invariant:** the public badge ("დადასტურებული მესაკუთრე") is `public_properties.ownership_verified` / `public_services.ownership_verified` (`20261001200100`, last column) = an `approved` `ownership_verifications` row of the listing's CURRENT owner. The stored `status` is the whole rule: the basis triggers `ownership_close_on_property_basis_change` (owner, cadastral code, address, lat/lng) and `ownership_close_on_service_basis_change` (owner, title, provider name, category) turn a live request into `revoked` (was approved) or `rejected` (was pending) with `მონაცემები შეიცვალა` the moment one of those VALUES changes, and tell the owner. Their WHEN clauses compare values because content-change approval and `/api/admin/listings/update` rewrite every reviewable column; photo, description and price edits keep the badge.

**Symbols:** `supabase/migrations/20261001200000_ownership_verification.sql` (tables `ownership_verification_documents`, `ownership_verifications`; bucket `ownership-documents`; RPCs `submit_ownership_verifications`, `review_ownership_verification`, `discard_ownership_document`, `claim_ownership_documents_for_purge`, `ownership_contract_snapshot`), `src/lib/ownership/{document-file,types,purge,upload-guard,server-paths,store}.ts`, `POST /api/ownership-verifications`, `POST /api/ownership-verifications/documents`, `POST /api/ownership-verifications/purge` (cron), `GET|POST /api/admin/ownership-verifications`, `GET /api/admin/ownership-verifications/documents/[id]`, `src/components/shared/OwnershipVerifiedBadge.tsx`, owner page `/dashboard/account/ownership`, admin tab `/dashboard/admin/verifications?tab=ownership`.

**Key:**
- One live (pending/approved) row per listing (partial unique indexes). One ID per submission (1–50 listings); one extract per PROPERTY item, never shared and never reused; service items may share one extract. `submit` refuses (`OWNERSHIP_LISTING_NOT_FOUND` also for "not yours", `OWNERSHIP_DOCUMENT_INVALID`, `OWNERSHIP_EXTRACT_SHARED`, `OWNERSHIP_REQUEST_EXISTS`); `review` locks only the verification row, is idempotent for the same admin decision, and answers `OWNERSHIP_ALREADY_DECIDED` for a row a trigger closed and `OWNERSHIP_DOCUMENT_MISSING` when approving without both files.
- Lock order is listing → verification row everywhere: a listing UPDATE holds the listing row when its trigger closes requests, submit locks its listings `FOR SHARE` (id order) before inserting, review never locks the listing. Uploads, submits, discards and purge claims of one owner share the advisory key `'ownership-owner:' || owner_id`.
- Documents: submit accepts a file only under 23 h old and unused by any decided request; the purge claims only files no pending request needs that are decided-only, discarded, failed > 15 min ago, > 24 h old or ownerless — "submittable" and "purgeable" never overlap, and the claim (under the owner lock) settles the last race. `purge.ts` is the ONLY deleter (claim → Storage `remove` → stamp `purged_at` on every claimed id; a claim left unstamped is retaken after 10 min). The routes call it best-effort after every upload, submit and decision; the hourly job (C4) bounds abandoned uploads.
- Upload route: a row first (the trigger caps 60 unpurged files per owner — the limiter fails open, C16), the object second; a failed or timed-out upload keeps its row with `upload_failed_at` (never deleted: the write may still land, and the purge removes it either way). An in-process guard (1 per user, 3 per process) is taken before `formData()`; it bounds the route's own copies of the body, not Next's 11 MB middleware buffer. 60 uploads / h / user.
- Admins open a file through a 302 to a 60 s signed URL WITHOUT `download` (`Cache-Control: no-store`). The route asks for `Referrer-Policy: no-referrer`, but on `/api/*` the middleware's app-wide `strict-origin-when-cross-origin` replaces it (the same happens to the CV, manual-review and SMS-consent routes); the storage host still gets no path, and the panel opens the link with `rel="noopener noreferrer"`.
- Notices: owner = type `verification`, `action_url` `/dashboard/account/ownership`, explicit scope (C19), generic titles because the SMS mirror texts only the title (C18), skipped while an identical notice is unread; admin = one coalesced `admin_ownership_pending` (bell only). E-mail and SMS for `verification` exist only through `20261001120000` and `20261001130000`–`130200` (C18, C33); without them owner notices are bell-only.
- Browser reads: own rows only, through a column grant — select `OWNER_VERIFICATION_COLUMNS`, never `*`. No client writes anywhere.
- Separation of duties (`20261001200150`): `review_ownership_verification` refuses every decision (approve, reject, revoke) on the reviewing admin's OWN request (`OWNERSHIP_REVIEW_SELF`, 42501 → 403 `self_review`, worded in the panel). With a single admin, that admin's own listings cannot be verified; another admin decides.
- Freshness: `ownership_verifications` is in no realtime publication. The owner store (`src/lib/ownership/store.ts`) re-reads a snapshot older than 60 s on mount, `/dashboard/account/ownership` re-reads on every mount, and a failed or unanswered submit re-reads (an earlier attempt may have been stored).
- Edit forms send basis columns back as loaded. The transport form keeps the stored title unless the driver name itself changes (the title is the driver name, but older rows differ); a form that rebuilds a basis column revokes the badge on any edit, a price change included.
- The search toggle `verified_only` (`search/page.tsx`, `SearchPageClient.tsx`, `supabase/functions/search`, staging v15) filters on `ownership_verified`, not on the old profile-wide `profile_is_verified`; its visible label is `SearchBox.verifiedOnly` ("მხოლოდ დადასტურებული მესაკუთრეები"; `FilterPanel` renders no such switch).

**Breaks:** a basis trigger without the value-comparing WHEN (the badge is lost on every edit); a second deleter, or a claim outside the owner lock (a pending request's file deleted mid-submit); deleting the document row after a failed upload (an ID scan orphaned for good); `download` on the signed URL (IDs land in admin Downloads); `select("*")` on `ownership_verifications` from the browser (permission denied); a notice title naming the listing or the reason (it reaches SMS); code selecting `ownership_verified` deployed before `20261001200100` (every list page answers 400); the cron applied before the route exists (hourly 404s); an edit form that rebuilds a basis column instead of sending back the loaded value (a price edit revokes the badge); a decision path around `review_ownership_verification` (the only place that refuses self-review).

**Prod order:** the pending runbook batch (incl. `20260925132000`) → `20261001120000`, `20261001130000`–`130200` (or accept bell-only owner notices) → `20261001200000`, `20261001200100`, `20261001200150` → app + `search` edge function → the purge schedule per C4.

**Guards:** `check-db-contracts.mjs` C39 (via `ownership_contract_snapshot()`: CHECK lists = the TS constants, no client write grant incl. PUBLIC, RLS on, bucket private with its limit and MIME list, no `storage.objects` policy that mentions the bucket or lacks a `bucket_id` test, the three triggers enabled, and through `basis_trigger_defs` (`20261001200150`) each basis trigger's table, `UPDATE OF` column list and value-comparing WHEN), `check-contracts.mjs` (originless path list), `scripts/unit/ownership-document.test.mjs`, e2e `cross-role/ownership-verification.spec.ts`.


---

## C40 — SEO surface: indexing policy, one URL per page, structured data, resort guide

**Invariant:** only `CANONICAL_HOST` (`src/lib/seo/site.ts`, = `mybakuriani.ge`) is indexable. Every public URL has one canonical and one hreflang set, both from `src/lib/seo/alternates.ts:buildAlternates`, and the sitemap names byte-identical URLs. Structured data states only what the page shows. The `src/lib/seo/*` modules are pure (no `@/`, C29) so `scripts/unit/seo-*.test.mjs` import them.

**Symbols:** `src/lib/seo/{site,alternates,robots,sitemap,image-url,jsonld,description}.ts`, `src/lib/seo.ts:{buildPageMetadata,buildListingMetadata,redirectToCanonicalListing}`, `src/app/{robots,sitemap}.ts`, `src/components/seo/*` (`JsonLd`, `Breadcrumbs`, `ListingBreadcrumbs`, `ListingJsonLd`, `RelatedListings`, `CategoryIntro`, `HomeAbout`, `FaqList`, `richLinks`), `src/lib/guide.ts`, `src/components/guide/*`, `src/app/[locale]/bakuriani/**`, message namespaces `CategoryIntro`, `HomeAbout`, `Breadcrumbs`, `Seo`, `Guide` and `RelatedListings` (the last two server-only).

**Key:**

- **Indexing:** `IS_INDEXABLE` comes from the host of `NEXT_PUBLIC_SITE_URL` (inlined at build, middleware included). Any other host (staging, preview, local, a mistyped env var) answers `X-Robots-Tag: noindex, nofollow` on every non-API response, the site-lock redirects and `/site-locked` included, plus a robots meta; its `robots.txt` stays `Allow: /` (a `Disallow` would hide the noindex) and its sitemap is empty. `check-production-config.mjs` fails a `DEPLOY_ENV=production` build whose host is not canonical. `SITE_LOCKED` (C27) stays the owner's launch gate: while it is on, Google gets a 307 to a noindex page. While it is on the sitemap is also empty (`src/lib/seo/site.ts:isSiteLocked`, the same exact-`"true"` test as the middleware, read by the sitemap's hourly rebuild), so a locked canonical host lists no listing URL; `robots.txt` and the robots meta stay as they are on purpose (they are baked at build, and a stale noindex after launch would be silent).
- **robots.txt:** `NON_INDEXABLE_PREFIXES` x `routing.locales`, written without a trailing slash (`/create` too); `/api/` disallowed, `/api/og/` allowed. `check-contracts` C40 pins it to middleware's protected prefixes (C8).
- **Sitemap** (`src/app/sitemap.ts`, ISR 3600): `STATIC_PATHS` + `GUIDE_PATHS` + active properties and services through `propertyViewUrl`/`serviceViewUrl` + published blog posts by slug, each with `alternates.languages`. Cover images go through same-origin `/_next/image?url=…&w=1200&q=75`, so `SEO_IMAGE_WIDTH`/`SEO_IMAGE_QUALITY` must be in `images.deviceSizes`/`images.qualities` (any other pair is a 400). No `lastmod` except a blog post's `published_at` (`updated_at` moves on every view through `record_listing_view`). QA and e2e seed ids (`facade00-`, `aae2ff00-`) are excluded. Next 15.5.25 does not XML-escape sitemap values; `xmlEscape` in `src/lib/seo/sitemap.ts` does. The home entry carries no trailing slash (`https://mybakuriani.ge`), because Next prints the page's canonical and hreflang that way; `e2e/public/seo.spec.ts` compares each sitemap URL with the page's own canonical byte for byte.
- **One URL per page:** a listing lives under the route of its kind (`propertyViewUrl`/`serviceViewUrl`); a request on the wrong kind 308s (`redirectToCanonicalListing`). Blog posts are addressed by slug and a uuid 308s with a percent-encoded `Location` (a raw Georgian one made Node throw and the route answer 500). Mock ids 404 in production. `/appartments` is a `next.config.ts` redirect.
- **hreflang** has one source: `alternateLinks: false` in `src/i18n/routing.ts`; the HTTP `Link` header carries font preloads only; `x-default` is the unprefixed (ka) URL.
- **Metadata:** every public page builds it with `buildPageMetadata`/`buildListingMetadata` (`check-contracts` C40); a page's `openGraph` replaces the root layout's, so the locale is set there. A detail page uses the owner's text as its description only from `MIN_USEFUL_DESCRIPTION` (40) characters (`pickDescription`; staging median is 15), clamped to 155. An employment page's `<title>` follows its H1 (the position).
- **Structured data** goes only through `components/seo/JsonLd.tsx` (`serializeJsonLd` escapes `<`, U+2028 and U+2029): Organization + WebSite (home), BreadcrumbList (the same array as the visible trail), Hotel, Restaurant, BlogPosting (`inLanguage: "ka"`, posts are Georgian) and TouristDestination (guide hub). Left out on purpose: FAQPage and SearchAction (retired by Google), JobPosting (Georgia is not in Google Jobs), VacationRental (invitation-only), AggregateRating (no rating is displayed; rental reviews are hidden), listing telephones (behind the reveal button), a restaurant's geo (its page draws no pin).
- **Public pages are ISR without `loading.tsx`** (C28): the root loader used to park the real page in `<div hidden id="S:n">` and unknown ids answered 200 + noindex.
- **Crawl paths (2026-10-03):** a link-graph crawl of the production build (GET with a Googlebot UA, only `<a href>` in the server HTML, from `/`) reached the Georgian site but found `/en` and `/ru` linked from nowhere (the header `LanguageSelector` is a popover of buttons, so only hreflang and the sitemap led there, which Bing, Yandex and AI crawlers do not rely on) and 7 listing pages (6 sales, 1 apartment) reachable only through the grid's JS pagination or the sitemap. Two fixes: `src/components/layout/FooterLanguageLinks.tsx` (a plain `<a hreflang>` to this page in each other language, href from `src/lib/seo/alternates.ts:pathForLocale` so it equals the hreflang alternate; endonyms; outside any `ul` so the footer link-group count stays 18; next-intl's `Link` with an explicit `locale` is NOT used because it keeps the default locale's prefix, `/ka/...`, which redirects) and `src/components/seo/CategoryIntro.tsx`'s `listings` prop (every listing the category page loaded, as `/<topic>/<id>` links in a collapsed native `<details>`, seed ids skipped; each of the 8 category pages passes its rows, message `CategoryIntro.allListings`). The index is as long as the page's query (`.limit(100)` / `MAX_LISTINGS`): inventory past that cap needs real crawlable pagination. `check-contracts` C40 checks both wirings; `e2e/public/seo.spec.ts` checks that every sitemap listing is linked from its category page and that the footer links the other locales.
- **Resort guide:** `GUIDE_PATHS` = the dirs of `src/app/[locale]/bakuriani/**` (`check-contracts` C40) = the `/bakuriani…` hrefs of `richLinks` (unit-tested). `GUIDE_ZONE_SLUGS` are the four seeded zones, whose names and one-line descriptions are the site's own `Zones.*`. Every fact traces to `GUIDE_SOURCES` (`GUIDE_PAGE_SOURCES` lists them per page); figures the sources disagree on (slope km, lift counts, difficulty by zone, season end date, the year the railway stopped) and all prices are left out; seasonal facts are worded as announcements; `GUIDE_FACTS_CHECKED` is bumped only after re-reading the sources. The Georgian, English and Russian copy needs native review.
- **Performance coupling (CWV):** detail heroes and galleries carry no opacity animation (a hero starting at `opacity: 0` is not the LCP until the fade ends, and a busy main thread after hydration delays that: food 7.3 s against 2.85 s without); the below-the-fold map mounts through `LazyOnVisible` so mapbox-gl (~480 KB gzip) is not fetched at hydration. Hero overlays use the inline `HERO_NOISE_BACKGROUND` (`src/lib/utils/heroTexture.ts`): a remote photo at 3-4% opacity still counts as a paint, so it was the LCP element of `/apartments`, `/hotels` and `/sales` (mobile emulation: 2.2 s, 2.1 s and 4.6 s). The h1 of the home, `/apartments`, `/hotels`, `/sales`, `/food`, `/services` and `/faq` heroes is not wrapped in `ScrollReveal` (its 0.5 s fade is 0.5 s of LCP). **Known limit:** where the LCP is the first card's image (`/entertainment`, `/transport`, `/employment`, `/blog`, the `/sales` rails) that card still reveals over 0.5 s, so those pages sit at 1.9-2.0 s in the same emulation (under the 2.5 s bar), and the `/sales` rail image is `loading="lazy"`. Measured with CPU 4x and a 1.6 Mbps/150 ms network, medians of 5: food and apartment detail LCP 2.08/2.03 s -> 1.46/1.38 s; on desktop an apartment page loads 525 KB of script instead of 1013 KB until its map scrolls near.
- **`public/llms.txt`:** Markdown with one H1 and absolute canonical-host links, because Lighthouse's Agentic Browsing category audits it (no ranking effect on Google). `e2e/public/seo.spec.ts` checks the H1 and that every link resolves; a new top-level page should be added to it. The English cookie-banner link reads "Cookie policy" (`CookieConsent.learnMore`; "Learn more" failed Lighthouse's link-text audit; the ka and ru texts pass it).
- **Outside the repo:** Cloudflare caches pages by the origin's Cache-Control (static pages are one day, `revalidate = 86400`); purge after a deploy that changes metadata or copy, and once more when prod is unlocked. Search Console (domain property) and Bing need the sitemap submitted; there is no `www` DNS record for any of the three domains yet.

**Breaks:** a new public page left out of `STATIC_PATHS` (never indexed) or listed there without a page (404 in the sitemap); a public `generateMetadata` that skips the helpers (no canonical or hreflang); a private area added to middleware's protected prefixes but not to `NON_INDEXABLE_PREFIXES`; `alternateLinks` switched back on (two hreflang sources); a sitemap image width or quality that `next.config.ts` does not allow (every image URL 400s); `lastmod` taken from `updated_at` (changes on every view, so Google learns to ignore it); a hand-written `<script type="application/ld+json">` (an unescaped `<` ends the tag) or markup for a fact the page does not show (a manual action); the canonical host changed in `site.ts` only (prod builds noindex, or staging indexable); a guide fact without a source, a price in the guide, or a bumped `GUIDE_FACTS_CHECKED` nobody re-checked; a `loading.tsx` or a cookie/header read on a public ISR route (the hidden-swap shell, or a hard 500 on the first dynamic render); a fade on a detail hero (LCP regresses to hydration); a remote background image under a hero (`check-contracts` C40 fails any `backgroundImage` in `src/app` that is not `HERO_NOISE_BACKGROUND`), or an opacity animation on the h1 of the heroes listed above; a category page that stops passing `listings` (listings past the first grid page are then found only through the sitemap); the footer language links removed or turned into buttons (/en and /ru are then discoverable only through hreflang); the language links rebuilt on `Link locale="ka"` (a redirecting `/ka/...` link on every en/ru page).

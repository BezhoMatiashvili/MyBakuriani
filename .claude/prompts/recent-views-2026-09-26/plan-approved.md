# Fix guest "recently viewed" + listing view counts

## Context

Two user-reported bugs on staging (`staging.mybakuriani.ge/dashboard/guest`, profile "ygukgjg"):

1. **"ბოლოს ნანახი განცხადებები" shows the wrong listings.** `loadGuestData`
   (`src/app/[locale]/dashboard/guest/loadData.ts:47-51`) loads
   `public_properties ORDER BY views_count DESC LIMIT 12`: the **global most-viewed** list, the
   same for every account. Staging's top 3 (სახლუკა 1 / სასწრაფოოდ / სუპერ კ9ტეჯი) match the
   screenshot exactly. No per-user view history exists anywhere: `listing_view_events` has only
   `client_ip`.
2. **View counts are wrong.** Since 6fb6d62 (2026-09-08), `getClientIp`
   (`src/lib/rateLimit.ts:173-185`) returns the last `X-Forwarded-For` hop. That hop is **App
   Platform's own Cloudflare edge** (every deployed view event since 2026-09-09 is
   `162.158.x.x`), so the "1 view per IP / listing / 24h" dedup merges every visitor on an edge.
   For example, two accounts opened "მაგარი ბინა" and it shows "1 ნახვა". Also:
   - detail pages show a count minutes stale (ISR + `unstable_cache` + Cloudflare), never
     including your own view, and the 5 service pages show no count at all;
   - owner self-views are counted;
   - en/ru labels read "1 views" / "2 просмотров";
   - seller analytics mixes rentals and all-time views into a date-ranged funnel;
   - the food header and tile disagree (3 vs 4);
   - owners can set their own `views_count`/`menu_views_count` directly by UPDATE or INSERT.

**User decisions:** core + **all** extras (service-page counts, seller/food totals, counter
guard). Verify the IP fix **after an approved staging push**. Contract notes go in the
**condensed working-tree `docs/contracts.md`**.

**Caveats to repeat to the user:**

- History starts **empty**; no per-user data ever existed.
- Past counts can't be repaired; real IPs were never stored.
- Staging counts stay partly inflated by localhost `::1` dev/e2e traffic.

Full step-by-step detail (exact code, SQL, i18n strings, test bodies) is in the planner output:
`/tmp/claude-1000/-home-bezhomatiashvili-Desktop-Projects-MyBakuriani/86e32474-1719-4ebb-9854-d565fa4fb250/scratchpad/plan.md`.
Evidence reports sit alongside it in `writePath.md`, `display.md` and `design.md`.

## Coordination (before any edit)

- Register `coordination/sessions/s-recent-views-0926.md` and claim the files below.
- Locks on `messages/*.json`, `database.generated.ts` and `docs/contracts.md` are stale
  (s-keepz-payments-0925). Make additive hunks only.
- **s-sec-harden-0926 is active.** It has **A10** (this Cloudflare-IP bug, diagnosed, not
  implemented), **D5** (owner-writable counts, not started) and **D8** (Deno first hop). It
  claims migrations `20260926170000+`. Post to `coordination/messages.md` before editing:
  - I take A10 (`src/lib/client-ip.ts`) and the **counter** part of D5.
  - My migration slots are announced.
  - It must regenerate `prevent_listing_protected_field_change` /
    `force_listing_moderation_state` from the **live** def if it touches them later.
  - D8 stays with it.
- **Migration filenames sort after the newest applied migration** (currently
  `20260926170100_security_posture_snapshot.sql`). Pick the next free slots at write time and
  announce them.
- Leave other sessions' uncommitted files (balance pages, `vip-purchase.spec.ts`,
  `SmsBalanceStat.tsx`, sec-harden prompts) untouched. There is no overlap with my files.
- DB preflight (read-only): `md5(prosrc)` of the 3 functions I redefine must still equal
  `beef6334…` (`prevent_listing_protected_field_change`), `51764586…`
  (`force_listing_moderation_state`) and `1f13880e…` (`seller_dashboard_stats`). On a
  mismatch, regenerate from the live def (anchor-asserting script, memory
  generate-migrations-dont-retype-them).

## Implementation

**S1. Real client IP (C16)**, a shared fix for every IP-keyed limiter

- New alias-free `src/lib/client-ip.ts`:
  - `getClientIp` + `isCloudflareIp` + `CLOUDFLARE_IPV4_RANGES` (15) / `CLOUDFLARE_IPV6_RANGES`
    (7), synced from cloudflare.com/ips-v4|v6 2026-09-26, matched with `node:net`
    `BlockList`/`isIP`.
  - Rule: peer = **last** XFF hop (DO ingress appends it). If the peer is a Cloudflare edge,
    use `cf-connecting-ip` if it is a valid IP, else the hop before the peer. Otherwise the peer
    is the client. `::ffff:` is canonicalised. With no XFF, use `x-real-ip`, then `"unknown"`.
  - Never the first hop; `do-connecting-ip` is never trusted.
- `rateLimit.ts`: delete the old body/docblock (:159-185) and add
  `export { getClientIp } from "@/lib/client-ip"`, so all 15 importers are unchanged.
- All 15 importers are Node-runtime rate-limit keys: Keepz callback, site-lock unlock, geocode,
  reveal and the rest. None uses the IP as an allowlist.
- New `scripts/unit/client-ip.test.mjs`, a matrix covering: spoofed XFF, CF peer ± cf header,
  non-CF peer + forged cf header, IPv6 edge, IPv4-mapped, `::1`, empty/garbage values, range
  edges (104.27.255.255 ✓ / 104.28.0.0 ✗), and table sizes.

**S2. Migration: `recently_viewed_listings`** (new contract C34, C9 pattern). Apply to staging via
MCP, then `npm run types:gen`.

- Columns: `id`; `user_id → profiles ON DELETE CASCADE`; `property_id`/`service_id`
  `ON DELETE CASCADE` with an exactly-one CHECK; `viewed_at`.
- **Non-partial** `UNIQUE(user_id,property_id)` and `UNIQUE(user_id,service_id)`, because
  PostgREST upsert can't target partial indexes.
- Indexes `(user_id, viewed_at DESC)` plus the FK-side indexes.
- RLS: `REVOKE ALL FROM PUBLIC, anon, authenticated`; `GRANT SELECT TO authenticated`; explicit
  service_role grant. Explicit grants are required because the S0 default ACLs no longer grant
  anyone. One own-row SELECT policy.
- No audit trigger, realtime, backfill or prune.
- The generated-types diff must show only this table.

**S3. View beacon route** (`src/app/api/listings/[kind]/[id]/view/route.ts`, C22). New order:

1. Validate.
2. Service-client select `id, owner_id, views_count` where `status='active'`; 404 if none. This
   now runs before the limiter.
3. `getCurrentUser()` **only if** `hasSupabaseAuthCookie(req)`.
4. Owner → `{counted:false, reason:"self", views}`.
5. Signed-in viewer → awaited, best-effort upsert of history **before** the dedup.
6. Dedup `listing-view:{user:<id> | ip:<getClientIp>}:{kind}:{id}` 1/24h →
   `{counted:false, reason:"duplicate", views}`.
7. `record_listing_view` (unchanged) → `{counted:true, views: views+1}`; on error, 503.

**S4. Live counts on all 8 detail pages** (C28-safe; pages stay ISR and cookie-free)

- New `src/lib/hooks/useListingViewCount.ts` (kind, id, initial, enabled):
  - The initial value comes from props, so there is no hydration mismatch.
  - It POSTs the beacon and sets `Math.max(current, body.views)`.
  - It has no translation hooks, and none in comments either (the i18n-scope guard scans
    comments).
- The 8 duplicated beacon effects are replaced by this hook. Unused `useEffect` imports go.
- Apartment/Hotel: render `views`.
- Sale: replace the bare null-hidden number (:477-482) with the same Eye +
  `tDetail("views")` span.
- The 5 service clients (Food / Transport / Services / Entertainment / Employment) get a new
  Eye + `tShared("views", {count})` line. `tShared` already exists in all 5, and `Shared` is in
  `PUBLIC_NAMESPACES`. Placements (from the plan file):
  - Food: subtitle row, now always rendered.
  - Transport: driver header.
  - Services / Entertainment: the meta row, like apartments.
  - Employment: after the applications span.
- Mock ids pass `enabled=false`.

**S5. Guest dashboard** (`dashboard/guest/loadData.ts`, `GuestDashboardClient.tsx`)

- Loader: `loadRecentListings()` joins the existing `Promise.all`.
  - Own history `ORDER BY viewed_at DESC LIMIT 24` (over-fetch).
  - Then `.in('id')` on `public_properties` / `public_services` (never base tables or embeds).
  - Merge in history order, drop listings that are no longer public, slice 12.
  - `GuestData.recent` becomes `RecentListing = {kind:'property',listing}|{kind:'service',listing}`.
- A local `RecentListingCard` keeps the current markup:
  - Hrefs via `propertyViewUrl`/`serviceViewUrl` (hotel → /hotels, food → /food…).
  - Sale `$`+`formatNumber`; C10 discount with strikethrough via
    `isDiscountActive`/`applyDiscount`, never for food (C21).
  - Service unit via `priceUnitPathFor`.
  - VIP / SUPER VIP from the expiry-aware view flags; `data-testid="recent-listing"`.
- Empty state `GuestDashboard.recentEmpty` in the myRequests.empty style. The 3 → 12 toggle is
  kept.

**S6. i18n** (ka/en/ru parity, C1)

- New keys:
  - `GuestDashboard.recentEmpty` = "ჯერ არ გინახავთ განცხადებები. რასაც გახსნით, აქ
    გამოჩნდება." / "You haven't viewed any listings yet. The ones you open will show up
    here." / "Вы ещё не просматривали объявления. Открытые вами объявления появятся здесь."
  - `Shared.views` (ka `{count} ნახვა`; en/ru ICU plurals copied from `PropertyDetail.views`).
- en/ru plural fixes (ka unchanged): `GuestDashboard.views`, `RenterDashboard.views`,
  `DashboardShared.views`, `AdminShared.viewsMeta` (keep `{meta}`/`{location}`).

**S7. Migration: counter guard** (the user-chosen extra; the counter part of D5). Generated from
the live defs.

- `prevent_listing_protected_field_change` raises 42501 when a non-privileged UPDATE changes
  `views_count` (both tables) or `menu_views_count` (**services branch only**,
  `TG_TABLE_NAME`).
- `force_listing_moderation_state` zeroes both counters on a non-privileged INSERT (the INSERT
  hole found by the planner).
- The service_role/admin/NULL-role bypass is kept, so `record_listing_view` and
  `increment_service_menu_views` keep working.
- Audit result: no owner/admin write path carries the counters, so raising is safe.

**S8. Migration: `seller_dashboard_stats`** (generated from the live def; `CREATE OR REPLACE`
keeps the grant) + page

- `owned` covers sale listings only.
- `views_total` = `listing_view_events` in `[p_from,p_to)`; the lifetime sum only when both
  bounds are NULL.
- Personal-scope contact metrics are restricted to owned sale listings (flagged extension:
  rentals were leaking into the sale funnel).
- `seller/analytics/page.tsx:166-175`: average = views ÷ sale listings in scope
  (`listingIds.length || listingOptions.length`), not `funnel.length`.
- The 4 `owner_dashboard_stats` callers are unchanged.
- Expected for seller 67630fe2 at 30 days: 31 → 3 views; avg 6 → 2.

**S9. Food dashboard** (`dashboard/food/loadData.ts:53`): `owner_dashboard_stats('food',
p_listing_ids: [restaurant.id])`, so every tile describes the one restaurant the screen shows.
Header = tile (3 = 3).

**S10. Contracts + memory**

- Condensed `docs/contracts.md`, additive:
  - **C16**: the client-IP rule and new Breaks lines.
  - **C22**: beacon order, per-viewer dedup, owner skip, counter guards, seller ranged views.
  - **C28**: live count via `useListingViewCount`.
  - New **C34**: recently-viewed history.
- Memory: update `guest-recent-section-is-most-viewed.md`, and add a Cloudflare-edge-IP memory.

## Verification

- **Static:** `npm test` (incl. the new client-ip unit matrix), `npx tsc --noEmit`,
  `npm run lint`, `npm run check:contracts`, `npm run check:db-contracts -- --strict`,
  `node scripts/check-message-parity.mjs`, `node scripts/i18n-scope.mjs --check`.
- **DB (staging, rollback-wrapped role simulation):**
  - New table: grants, one policy, constraints, `ON CONFLICT` inference, and user-A-can't-see-B.
  - An owner UPDATE/INSERT of counters → 42501 / zeroed; legit owner edits pass.
  - `record_listing_view` and `increment_service_menu_views` still work.
  - Seller 67630fe2's numbers as expected.
  - Post-apply `md5(prosrc)` = file body.
- **Local build + e2e:**
  - Isolated copy `~/.cache/mb-recent-views`, `build`, then
    `ALLOWED_ORIGINS=http://localhost:3160 next start -p 3160`. Leave tnlu on :3000.
  - Announce the shared seed first, then run `npx playwright test --project=guest`.
  - New serial describe in `e2e/dashboards/guest.spec.ts`, which deletes its own
    `listing-view:user:*` keys and history rows:
    1. Empty state; then hotel + food (`STRESS_IDS.foodMax`) views update the live count, and
       the dashboard shows food then hotel with /food and /hotels hrefs.
    2. Renter (the owner) gets `reason:"self"` and no history row.
    3. The guest and the seller (own browser context), on the same `::1`, **both** count; a
       guest reload gets `duplicate`.
  - Manual browser pass: the 5 service pages show the count; sale shows Eye + label; en/ru
    plurals are right; the seller analytics and food numbers match SQL.
- **Cannot be proven locally:** the Cloudflare header chain, since everything is `::1`.
  **Post-deploy, only after you approve commit + push:**
  - Read-only SQL: events since `ACTIVE_AT` classify as client, never Cloudflare, and new
    limiter keys are only `user:`/`ip:<client>`.
  - Forged `X-Forwarded-For`/`CF-Connecting-IP`/`X-Real-IP` probes **with an `Origin` header**
    against `staging.mybakuriani.ge` and `*.ondigitalocean.app` return JSON. `rate_limit_counters`
    has no `203.0.113.*`, and the event `client_ip` is the real egress IP.
  - If edge IPs persist, log header **names** once and revisit S1 (never trust
    `do-connecting-ip` blindly).
- **No commit or push without asking.** Prod is untouched: the migrations and code go to the
  s-sec-harden prod runbook.

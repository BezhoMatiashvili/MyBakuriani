# Handoff: recently-viewed + listing view counts (branch `fix/recent-views-view-counts`)

Read this first, then `plan-approved.md` (the user-approved plan) and `plan-detail.md` (the exact per-step
code, SQL, i18n strings and test bodies; its `/tmp/...` paths are from the local session and are not
available to you).

## The two user-reported bugs

1. Guest dashboard section **"ბოლოს ნანახი განცხადებები"** showed the platform-wide most-viewed
   listings (`public_properties ORDER BY views_count DESC`), not what this user opened. The fix is a
   real per-user history table written by the view beacon and read by `loadGuestData`.
2. **Listing view counts were wrong.**
   - Root cause: `getClientIp` returned the last `X-Forwarded-For` hop, which on DigitalOcean App
     Platform is its own **Cloudflare edge IP** (every deployed view since 2026-09-09 came from
     `162.158.x.x`). The "1 view / IP / listing / 24h" dedup therefore merged every visitor behind an
     edge.
   - Secondary: counts on the ISR detail pages were minutes stale and never included your own view;
     service pages showed no count; owner self-views were counted.
   - Also: en/ru plurals were wrong; seller analytics was inconsistent; food header and tile
     disagreed; owners could write the counters directly.

The user chose **core + all extras** (see `plan-approved.md`).

## Already DONE by the local session (do not redo)

- **Staging DB** (Supabase project `laxwtegxpemuuyxluqsi`): all 3 migrations were applied and
  verified (post-apply `md5(prosrc)` equals the file body; triggers attached; grants, policy and
  constraints checked; ledger rows present):
  - `supabase/migrations/20260926171000_recently_viewed_listings.sql`
  - `supabase/migrations/20260926171100_listing_view_counters_owner_guard.sql` (generated from the
    live definitions)
  - `supabase/migrations/20260926171200_seller_stats_sale_scope_ranged_views.sql` (generated from the
    live definition)
- `src/lib/types/database.generated.ts` was regenerated from staging and contains only the new
  table. **Never hand-edit it** (contract C3).
- Code slices implemented by parallel agents (see the commit): S1 client-ip, S3 view route,
  S4/S5 `useListingViewCount` + 8 detail clients, S6 guest dashboard, S7 i18n, S9 seller analytics
  page, S10 food loader, and the e2e describe in `e2e/dashboards/guest.spec.ts`.

## YOUR job (cloud agent)

You have no access to the Supabase MCP, `.env.local`, the staging DB or the DigitalOcean app.
Do only repo work.

1. `npm ci`, then run and make green:
   - `npx tsc --noEmit`
   - `npm run lint`
   - `npm test` (includes the new `scripts/unit/client-ip.test.mjs`)
   - `npm run check:contracts`
   - `node scripts/check-message-parity.mjs`
   - `node scripts/i18n-scope.mjs --check`

   Try `npm run build`. If it fails **only** because env vars/secrets are missing, record that and
   move on; do not stub secrets.

2. Review every changed file against `plan-approved.md` / `plan-detail.md`. Fix real defects with
   minimal, surgical edits that match the surrounding style. Key invariants to check:
   - **C28:** the 8 public detail pages stay ISR and cookie-free. No `cookies()`, `headers()` or auth
     in the pages or their loaders; live data only via the client hook after hydration.
   - **C16:** `getClientIp` never returns the first XFF hop and never trusts `do-connecting-ip`. It
     trusts `cf-connecting-ip` (or the hop before the peer) **only** when the last hop is a
     Cloudflare edge. The 15 importers still import it from `@/lib/rateLimit`.
   - **View route order:** active check → owner skip (`reason:"self"`) → history upsert (signed-in,
     **before** the dedup) → dedup key `listing-view:{user:<id>|ip:<ip>}:{kind}:{id}` →
     `record_listing_view`. Every response carries a numeric `views`.
   - **Guest dashboard:** reads `recently_viewed_listings` (own rows), then `.in('id')` on
     `public_properties` / `public_services` (never base tables or embeds). Hrefs come from
     `propertyViewUrl` / `serviceViewUrl`. Sale prices are `$`; C10 discounts apply (never to food,
     C21). Empty state uses `GuestDashboard.recentEmpty`.
   - **i18n:** ka/en/ru key parity (C1). `Shared.views` is used by the 5 service clients. The en/ru
     ICU plurals are correct.
   - Files that were not prettier-clean before this work (`src/app/[locale]/food/[id]/FoodDetailClient.tsx`,
     `e2e/dashboards/guest.spec.ts`): don't reformat unrelated lines.
3. Commit fixes to **this branch only** and push. **Do not** push to `staging` or `main`, merge,
   open a PR, touch the DB, or edit `docs/contracts.md` (its working-tree copy lives only on the
   local machine).
4. Final report: what you verified, what you fixed (file:line), and what you could not verify.

## Still needs the local machine / the user (not for the cloud agent)

- **Staging DB role-simulation checks**, rollback-wrapped (see `plan-detail.md` migration
  POST-APPLY sections):
  - owner UPDATE of `views_count`/`menu_views_count` → 42501, and INSERT → zeroed;
  - legit owner edits still pass;
  - `record_listing_view` / `increment_service_menu_views` still work;
  - RLS isolation on `recently_viewed_listings`;
  - seller 67630fe2 → 30-day `views_total` = its sale-listing events.
- **e2e:** `npx playwright test --project=guest` against a local `build && start` (needs `.env.local` +
  `TEST_SUPABASE_*`).
- **Post-deploy Cloudflare-IP proof** (only after the user approves merging this branch into
  `staging`), per plan S13:
  - new `listing_view_events.client_ip` values are real ISP addresses, not `162.158.*`;
  - forged-header probes don't reach `rate_limit_counters`.
- **Contracts** (condensed working-tree `docs/contracts.md`): C16, C22, C28 updates and a new C34.
  The text is in `plan-detail.md` STEP S11.
- **Coordination:** session `s-recent-views-0926` in the local `coordination/` (git-ignored). Session
  `s-sec-harden-0926` was told this work owns ledger item A10 (getClientIp) and the counter part of
  D5.

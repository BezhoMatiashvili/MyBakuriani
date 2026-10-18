# summary
Plan for (1) a real per-user "ბოლოს ნანახი განცხადებები" and (2) correct listing view counts. Each decision was checked against the code at HEAD 915f3f8 and the live STAGING schema (read-only).

Validated as designed, with details filled in:
- D1: history table. Details below.
- D2: view-route reorder, now with an owner skip and user-keyed dedup.
- D3: alias-free getClientIp, unit-tested.
- D4: live counts. The beacon fires from one new hook, `useListingViewCount`, instead of 8 copied effects. Services show the count through a new `Shared.views` key; Shared is already public and already used by all 5 service clients as `tShared`.
- D5: guest-dashboard two-step read.
- D6: i18n plural fixes.
- D9: food KPIs scoped to the displayed restaurant via `p_listing_ids`.
- D10: contract updates, including a new C34.

Concrete defects found in the decisions, with evidence:

(a) D7 was UPDATE-only. authenticated also holds INSERT on `views_count` / `menu_views_count`, and the live `force_listing_moderation_state` resets VIP and discount fields but not the counters. An owner can therefore create a listing with `views_count=99999`, and it survives approval. Fix: the same migration zeroes both counters there.

(b) D8. Narrowing `owned` to sale listings is not enough. In personal scope, the contact_events subqueries (`new_interest`, `contact_reach`, `sms_views`) filter on `ce.owner_id` only, so rental and service contacts still enter the funnel. Fix: filter on `ce.property_id IN owned`. This is flagged, not silent.

(c) Staging's default ACLs for role postgres no longer grant anon/authenticated anything, so D1's `GRANT SELECT TO authenticated` is mandatory. `service_role` must be granted explicitly as well.

(d) Parallel-run interference in the planned e2e tests:
- The e2e fixtures share one cookie jar per test, so the second viewer needs its own browser context.
- The favorites tests flip `TEST_IDS.foodService` to pending in parallel, so the food case uses `STRESS_IDS.foodMax`.
- The public spec views the hotel fixture concurrently, so count assertions are `>=`.

(e) The active session s-sec-harden-0926 overlaps this work:
- Its A10 is the getClientIp fix.
- Its D5 ("owner-writable counts") touches the same trigger.
- It claims migrations `20260926170000_*` and later.

  This must be coordinated before any edit.

D7 audit result: no owner, member or admin write path can carry a stale `views_count`, so raising 42501 is safe.

Topology is verified: `mybakuriani.ge` NS is at DigitalOcean. `staging.mybakuriani.ge` is a CNAME to `mybakuriani-staging-fra-cnnsy.ondigitalocean.app`, which resolves to Cloudflare anycast. The Cloudflare hop is App Platform's own edge, and both hostnames share it, so D3's CF-aware logic is right for both.

## STEP S0: Coordination + preflight (before ANY edit)
files: coordination/sessions/s-recent-views-0926.md (new, git-ignored), coordination/messages.md (append-only via printf >>)
contracts: C1, C3, C16, C29

1) Create coordination/sessions/s-recent-views-0926.md (README template). Working on: per-user recently-viewed + view-count fixes (staging only). Claimed files:
- src/lib/client-ip.ts (new), src/lib/rateLimit.ts, scripts/unit/client-ip.test.mjs (new)
- src/lib/hooks/useListingViewCount.ts (new), src/app/api/listings/[kind]/[id]/view/route.ts
- the 8 detail clients
- src/app/[locale]/dashboard/guest/{loadData.ts,GuestDashboardClient.tsx}, dashboard/seller/analytics/page.tsx, dashboard/food/loadData.ts
- e2e/dashboards/guest.spec.ts
- messages/{ka,en,ru}.json: Shared.views, GuestDashboard.recentEmpty + 4 en/ru value changes
- src/lib/types/database.generated.ts (regen only)
- docs/contracts.md (additive hunks in C16/C22/C28 + new C34 only)
- supabase/migrations/20260926165000_*, 165100_*, 165200_*
- DB objects: public.recently_viewed_listings, prevent_listing_protected_field_change(), force_listing_moderation_state(), seller_dashboard_stats(...)

2) Check for collisions:
- grep coordination/sessions/*.md and locks/*.
- The messages/*.json, docs/contracts.md and database.generated.ts locks are the stale s-keepz-payments-0925 ones. Edit those files additively only; do not touch other sessions' hunks.
- docs/contracts.md carries an unattributed uncommitted condensation. Edit that working-tree version and never revert it.

3) Append these messages to messages.md with printf '\n- [%s] s-recent-views-0926: ...\n' "$(date -u +%FT%TZ)" >> coordination/messages.md:
(a) To s-sec-harden-0926:
- This session takes your ledger A10 (getClientIp behind Cloudflare → CF-aware logic in the new src/lib/client-ip.ts, re-exported by rateLimit.ts).
- It also takes views_count/menu_views_count for your D5: they are added to prevent_listing_protected_field_change and zeroed in force_listing_moderation_state. Regenerate those two functions from the LIVE def (pg_get_functiondef) after mine lands.
- I take migration slots 20260926165000/165100/165200, below your 170000+ range, and will apply them immediately after writing.
- The new table carries explicit GRANTs (your S0 default ACLs are already live).
- The Deno _shared/guards.ts first-hop issue stays yours (your D8).
- My uncommitted hunks will show up in any rsync'd ~/.cache/mb-sec-after build.
(b) Before e2e: announce the shared aae2ff00 seed/teardown via `--project=guest`, and confirm no other session is running e2e.

4) DB preflight, read-only on STAGING:
- `SELECT oid::regprocedure, md5(prosrc) FROM pg_proc WHERE proname IN ('prevent_listing_protected_field_change','force_listing_moderation_state','seller_dashboard_stats')`
- Baselines: beef6334c617a5a2d2d1650898cc58d0, 517645867cabbfd79cd9334dcd0d8140, 1f13880e1df0f2da01abee919d1badac.
- On any mismatch, regenerate that migration from the new live def: use a script that asserts each insertion anchor occurs exactly once (memory generate-migrations-dont-retype-them). Pick a filename after the migration that changed it and announce the slot.
- Also run `ls supabase/migrations | tail` and mcp list_migrations. If any file ≥ 20260926165000 exists, move the slots after it.

RISKS: s-sec-harden-0926 is active and edits the same areas:
- Skipping the message risks a second getClientIp rewrite, or a later static redefinition of the trigger that silently drops views_count.
- Filename order must equal apply order for migrations that redefine the same function. Otherwise a fresh replay (prod runbook) loses the later change.

## STEP S1: client-ip module (D3) + rateLimit re-export + unit tests
files: src/lib/client-ip.ts (new), src/lib/rateLimit.ts:159-185, scripts/unit/client-ip.test.mjs (new)
contracts: C16, C29

NEW src/lib/client-ip.ts. Pure, no '@/' imports; node:net keeps it out of client bundles. All 15 importers are nodejs-runtime route handlers or server actions, verified by grep.

Header docblock: move and update the history from rateLimit.ts:159-172:
- The 2026-09-08 first-hop spoof bypass.
- The 2026-09-09 edge-IP undercount.
- Topology: DO App Platform's edge is Cloudflare.
- The peer rule: last hop → if Cloudflare use CF-Connecting-IP, else the hop before it, else the peer. Never the first hop. do-connecting-ip is not trusted.

Code:
import { BlockList, isIP } from "node:net";
// Cloudflare edge ranges — refresh from https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6 (synced 2026-09-26). A stale list only makes an unlisted edge be keyed as a client (today's behaviour); it can never make a client header trusted.
export const CLOUDFLARE_IPV4_RANGES = ["173.245.48.0/20","103.21.244.0/22","103.22.200.0/22","103.31.4.0/22","141.101.64.0/18","108.162.192.0/18","190.93.240.0/20","188.114.96.0/20","197.234.240.0/22","198.41.128.0/17","162.158.0.0/15","104.16.0.0/13","104.24.0.0/14","172.64.0.0/13","131.0.72.0/22"] as const;
export const CLOUDFLARE_IPV6_RANGES = ["2400:cb00::/32","2606:4700::/32","2803:f800::/32","2405:b500::/32","2405:8100::/32","2a06:98c0::/29","2c0f:f248::/32"] as const;
const cloudflare = new BlockList();
for (const cidr of CLOUDFLARE_IPV4_RANGES) { const [network, prefix] = cidr.split("/"); cloudflare.addSubnet(network, Number(prefix), "ipv4"); }
for (const cidr of CLOUDFLARE_IPV6_RANGES) { const [network, prefix] = cidr.split("/"); cloudflare.addSubnet(network, Number(prefix), "ipv6"); }
/** Cloudflare edge address? IPv4-mapped IPv6 (::ffff:a.b.c.d) is matched too (BlockList does this natively; verified on Node 22). */
export function isCloudflareIp(ip: string): boolean { const family = isIP(ip); if (family === 4) return cloudflare.check(ip, "ipv4"); if (family === 6) return cloudflare.check(ip, "ipv6"); return false; }
// One client, one key: "::ffff:203.0.113.5" and "203.0.113.5" are the same host.
function canonical(ip: string): string { const mapped = /^::ffff:([\d.]+)$/i.exec(ip); return mapped && isIP(mapped[1]) === 4 ? mapped[1] : ip; }
export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  const hops = (req.headers.get("x-forwarded-for") ?? "").split(",").map((hop) => hop.trim()).filter(Boolean);
  if (hops.length > 0) {
    const peer = hops[hops.length - 1]; // appended by DO's ingress: not client-controlled
    if (!isCloudflareIp(peer)) return canonical(peer);
    const connecting = req.headers.get("cf-connecting-ip")?.trim(); // overwritten by Cloudflare
    if (connecting && isIP(connecting)) return canonical(connecting);
    const appended = hops[hops.length - 2]; // what Cloudflare appended
    if (appended && isIP(appended)) return canonical(appended);
    return canonical(peer);
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

IPv4-mapped decision:
- Classify natively; BlockList.check('::ffff:162.158.x','ipv6') is true against the v4 subnets.
- Strip ::ffff: from any dotted-quad value returned, so one client gets one key on every path.
- No other normalisation: ports and brackets make isIP 0, so the value is treated as a non-CF peer and returned raw, as today.

src/lib/rateLimit.ts:
- Delete lines 159-185 (the docblock and getClientIp).
- Append: `/** Trusted client address — see src/lib/client-ip.ts (alias-free, unit-tested) and contract C16. Re-exported so the 15 existing importers keep importing it from here. */ export { getClientIp } from "@/lib/client-ip";`
- checkRateLimit is untouched.

NEW scripts/unit/client-ip.test.mjs. node:test + assert/strict. Import from "../../src/lib/client-ip.ts". Helper: `const req = (h) => ({ headers: new Headers(h) })`. Constants: CF = "162.158.151.148" (a real staging edge), CLIENT = "203.0.113.50". Matrix:
(1) No headers → "unknown"; x-real-ip only → that value.
(2) Non-CF peer, spoofed XFF:
- "198.51.100.9" → itself.
- "6.6.6.6, 198.51.100.9" → "198.51.100.9" (first hop never returned).
- The same plus a forged cf-connecting-ip "6.6.6.6" → still "198.51.100.9".
(3) CF peer plus cf-connecting-ip:
- `${CLIENT}, ${CF}` with cf=CLIENT → CLIENT.
- "6.6.6.6, CLIENT, CF" with cf=CLIENT → CLIENT.
(4) CF peer without a valid cf header:
- "CLIENT, CF" → CLIENT.
- The same with cf="not-an-ip" → CLIENT.
- "CF" alone → CF (degrades to the old behaviour).
- "garbage, CF" → CF.
(5) IPv6 and IPv4-mapped:
- "2001:db8::1, 2400:cb00:2049::1" with cf="2001:db8::1" → "2001:db8::1".
- "CLIENT, ::ffff:CF" with cf=CLIENT → CLIENT.
- "::ffff:198.51.100.9" → "198.51.100.9".
- cf="::ffff:"+CLIENT → CLIENT.
(6) Loopback and garbage:
- "::1" → "::1".
- " 203.0.113.7 , , 198.51.100.9 " → "198.51.100.9".
- XFF " , " plus x-real-ip → the x-real-ip value.
- "garbage" → "garbage".
(7) isCloudflareIp:
- true for 162.158.0.0, 162.159.255.255, 172.66.0.96, 104.27.255.255, 131.0.72.1, 2606:4700::1, 2a06:98c7:ffff::1, 2400:CB00::1, ::ffff:162.158.1.1.
- false for 162.160.0.0, 104.28.0.0, 203.0.113.50, ::1, 127.0.0.1, 2a06:98c8::1, "", "unknown", "162.158.1.1:443".
(8) Table sizes: 15 v4, 7 v6.

Run: npm run test:unit.

RISKS: The header chain after DO is inferred, not captured. If DO strips cf-connecting-ip and appends only the edge, the logic degrades to today's behaviour (no regression); the post-deploy SQL (S13) is the proof. All ~18 limiters change key semantics at once, from one bucket per edge to one per client; that is intended. The Deno twin is untouched.

Cross-zone Cloudflare Worker traffic arrives with a CF-Connecting-IP of 2a06:98c0:3600::103 (inside CF ranges), so it collapses to one key. This is conservative.

The range list must be refreshed manually when Cloudflare publishes changes.

## STEP S2: Migration A: recently_viewed_listings (D1), apply to STAGING, regenerate types
files: supabase/migrations/20260926165000_recently_viewed_listings.sql (new), src/lib/types/database.generated.ts (npm run types:gen only)
contracts: C3, C9, C34 (new)

1) Write the migration (full SQL in migrations[0]) and apply it with mcp__supabase-staging__apply_migration (name recently_viewed_listings). Never call mcp__supabase__*.
2) Run the postApplyChecks.
3) Run npm run types:gen. It regenerates from the live staging schema.
4) Review the diff. Expect the new table Row/Insert/Update/Relationships. Anything else is another session's staging change: note it in messages.md and do not revert it.
5) Never hand-edit the generated file (C3). src/lib/types/database.ts needs no change: it is a table, not a view, so _ViewParity is unaffected.

RISKS: The table must exist in the generated types before S3 compiles.

The staging types:gen output can include unrelated objects. Its database.generated.ts lock is stale (s-keepz-payments-0925); regeneration is the normal path.

## STEP S3: View beacon route: order, owner skip, history upsert, per-viewer dedup, live count (D2)
files: src/app/api/listings/[kind]/[id]/view/route.ts:1-49
contracts: C16, C22, C28, C34 (new)

Replace the handler. hasSupabaseAuthCookie(request: NextRequest) at src/lib/supabase/auth-cookies.ts:22 accepts the route's `req: NextRequest` directly.

import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createServiceClient } from "@/lib/supabase/admin";
import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-cookies";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isUuid } from "@/lib/utils/uuid";
export const runtime = "nodejs";
/** Bounded, server-only analytics write; no browser RPC grant is required. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (!isUuid(id) || (kind !== "property" && kind !== "service")) return Response.json({ error: "not_found" }, { status: 404 });
  const db = createServiceClient();
  const table = kind === "property" ? "properties" : "services";
  // Checked BEFORE the daily slot is spent: a pending preview or a dead id must not burn a real viewer's 24h window.
  const { data: listing } = await db.from(table).select("id, owner_id, views_count").eq("id", id).eq("status", "active").maybeSingle();
  if (!listing) return Response.json({ error: "not_found" }, { status: 404 });
  const views = listing.views_count ?? 0;
  // Only requests carrying a Supabase auth cookie pay for the auth round-trip. Reading the session is fine here: this is a route handler, not the ISR detail page (C28).
  let userId: string | null = null;
  if (hasSupabaseAuthCookie(req)) { try { userId = (await getCurrentUser())?.id ?? null; } catch { /* identity is optional for this metric; fall back to the IP key */ } }
  // Owners (incl. their ?preview=1 visits) neither count nor fill their own history — same rule as /api/menu/track.
  if (userId && userId === listing.owner_id) return Response.json({ counted: false, reason: "self", views });
  // History is recency, not a metric: refresh it on EVERY signed-in view, before the 24h dedup, or a same-day revisit never re-sorts (C34). Best-effort; awaited, because an un-awaited supabase builder never fires.
  if (userId) {
    const viewedAt = new Date().toISOString();
    const { error: historyError } = await db.from("recently_viewed_listings").upsert(kind === "property" ? { user_id: userId, property_id: id, viewed_at: viewedAt } : { user_id: userId, service_id: id, viewed_at: viewedAt }, { onConflict: kind === "property" ? "user_id,property_id" : "user_id,service_id" });
    if (historyError) console.error("[listing-view] history upsert failed", historyError.code);
  }
  // At most one counted view per viewer/listing/day: the account when signed in, else the trusted client IP (C16). Conservative analytics signal, not a billing primitive.
  const ip = getClientIp(req);
  const viewer = userId ? `user:${userId}` : `ip:${ip}`;
  if (!(await checkRateLimit(`listing-view:${viewer}:${kind}:${id}`, 1, 86_400_000))) return Response.json({ counted: false, reason: "duplicate", views });
  // (keep the existing record_listing_view comment from lines 37-41)
  const { error } = await db.rpc("record_listing_view", { p_listing_type: kind, p_listing_id: id, p_client_ip: ip });
  if (error) return Response.json({ counted: false, views }, { status: 503 });
  return Response.json({ counted: true, views: views + 1 });
}

Response contract (the clients read only a numeric `views`; the status code is informational):
- 404 {error:"not_found"}: bad kind or uuid, or listing not active.
- 403 {error:"invalid_origin"}: from the middleware.
- 200 {counted:false, reason:"self", views}
- 200 {counted:false, reason:"duplicate", views}
- 503 {counted:false, views}
- 200 {counted:true, views:views+1}

`reason` is additive (the menu/track convention) and makes the owner/dedup e2e tests deterministic. record_listing_view's signature and return type are unchanged (void). The old IP-only keys `listing-view:<ip>:...` stop being read and are cleared by the hourly GC.

RISKS: If TS rejects the union-typed `db.from(table).select("id, owner_id, views_count")`, split it into explicit properties/services branches, like src/app/api/listings/[kind]/[id]/contact/route.ts:72-90.

The route now runs a PK select (and, for signed-in viewers, an auth call) before the limiter. A garbage-uuid flood now costs one select instead of one limiter RPC, and no longer creates rate_limit_counters rows. An optional coarse per-IP limiter could run first.

Multi-account inflation: N accounts from one IP now count N views per day. This is acceptable for an analytics signal.

Org co-members' and admins' views still count; only owner_id is excluded.

A transient getCurrentUser failure for an owner counts the view under the IP key (rare).

## STEP S4: useListingViewCount hook + 3 property detail clients (D4)
files: src/lib/hooks/useListingViewCount.ts (new), src/app/[locale]/apartments/[id]/ApartmentDetailClient.tsx:3,105-109,206, src/app/[locale]/hotels/[id]/HotelDetailClient.tsx:3,107-111,233, src/app/[locale]/sales/[id]/SaleDetailClient.tsx:197-201,477-482
contracts: C22, C28

NEW src/lib/hooks/useListingViewCount.ts
- It must contain no translation hooks. Do not write the literal hook-name-plus-paren in comments either: the i18n-scope guard scans comments.

"use client";
import { useEffect, useState } from "react";
/** Records one detail-page view and returns the listing's live view count. The 8 public detail routes are ISR + edge-cached and cookie-free (C28), so the count baked into their HTML lags by minutes and never includes this visit; the beacon answers with the current one (C22). Mock/demo listings pass enabled=false. */
export function useListingViewCount(kind: "property" | "service", id: string, initial: number | null | undefined, enabled = true): number {
  const [views, setViews] = useState(initial ?? 0);
  useEffect(() => {
    if (!enabled) return;
    fetch(`/api/listings/${kind}/${id}/view`, { method: "POST" })
      .then((res) => res.json())
      .then((body: { views?: unknown }) => {
        if (typeof body.views !== "number") return; // 404 (pending preview) / 403 carry no count
        const live = body.views;
        // Counts only grow; a late reply (StrictMode double effect, two tabs) must not move it back.
        setViews((current) => Math.max(current, live));
      })
      .catch(() => {});
  }, [kind, id, enabled]);
  return views;
}

No reset-on-id-change is needed. Next 15.5.25 keys each segment subtree by createRouterCacheKey(segment) (node_modules/next/dist/client/components/layout-router.js:424,509), so a new [id] remounts.

ApartmentDetailClient:
- Line 3: `import { useState } from "react";` (useEffect has no other use).
- Replace lines 105-109 with `const views = useListingViewCount("property", property.id, property.views_count);`
- Line 206: `{tDetail("views", { count: views })}`
- Add import `{ useListingViewCount } from "@/lib/hooks/useListingViewCount"`.

HotelDetailClient: identical edits at lines 3, 107-111 and 233.

SaleDetailClient:
- Keep the line-3 import; useEffect is still used at line 203.
- Replace lines 197-201 with the hook call.
- Replace lines 477-482 (bare, null-hidden number) with `<span className="flex items-center gap-1.5 font-medium"><Eye className="h-4 w-4" />{tDetail("views", { count: views })}</span>`. tDetail = PropertyDetail is already at line 185. This fixes the only unlabeled count; if a bare number is preferred, render `{views}`.

The property clients have no isMock guard. Mock ids are not UUIDs, so they get a 404 and keep the prop value (247). This is unchanged behaviour. The /preview twins render these same clients: a pending listing gets a 404 and keeps its prop; an owner's active listing gets its fresh count.

RISKS: The Math.max guard assumes counts never decrease. A manual admin decrement would show the higher cached value until the next render.

An unused `useEffect` import after the edits would trip the no-unused-vars warning, so remove it where noted.

## STEP S5: 5 service detail clients: live count + visible eye/count line (D4 + user extra a)
files: src/app/[locale]/food/[id]/FoodDetailClient.tsx:3,6,66-70,175-183, src/app/[locale]/transport/[id]/TransportDetailClient.tsx:3,7-15,111-114,197-202, src/app/[locale]/services/[id]/ServiceDetailClient.tsx:3,7-15,99-103,141-170, src/app/[locale]/entertainment/[id]/EntertainmentDetailClient.tsx:3,7-16,88-92,151-167, src/app/[locale]/employment/[id]/EmploymentDetailClient.tsx:12-28,250-253,479-496, messages/{ka,en,ru}.json Shared (block at :1214, last key bannerExpand :1227)
contracts: C1, C22, C28

i18n choice: add Shared.views (see i18n).
- All 5 clients already call useTranslations("Shared") as tShared: Food :49, Transport :59, Services :60, Entertainment :61, Employment :188.
- Shared is already in PUBLIC_NAMESPACES (src/i18n/namespaces.ts), so namespaces.ts does not change and `scripts/i18n-scope.mjs --check` stays green.
- Rejected alternative: reusing PropertyDetail.views would add a property-specific namespace hook to service pages.

In each client:
- Delete the beacon effect and call `const views = useListingViewCount("service", service.id, service.views_count, !isMock);` at the same spot. This keeps the mock skip.
- Add `Eye` to the lucide-react import.
- Remove `useEffect` from the react import where it has no other use: Food, Transport, Services, Entertainment. Employment keeps it for :246-248.
- In Services and Entertainment, the eslint-disable comment goes away with the effect.

Placement mirrors the apartments meta row (ApartmentDetailClient.tsx:204-207). Line format for all five: `<Eye className="h-4 w-4" />{tShared("views", { count: views })}`.

- Food: the subtitle row :175-183 currently renders only when zone||hours. Render it always. Keep zone • hours. Append `{(subtitleZone || subtitleHours) && <span className="text-[#CBD5E1]">•</span>}` then `<span className="flex items-center gap-1.5 font-medium"><Eye …/>…</span>`.
- Transport: in the driver header `<div className="pb-1">`, after the ZoneLocationLink block (:197-202), add `<p className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-[#64748B]"><Eye className="h-4 w-4" />…</p>`.
- Services: inside the title meta row :141 (`mt-3 flex flex-wrap items-center gap-4 text-[14px] text-[#64748B]`), after the service_field pill (:165-169), add `<span className="flex items-center gap-1.5 font-medium">…</span>`. This is identical to the apartments markup.
- Entertainment: inside the meta row :151, after the location (:161-166), add the same span.
- Employment: in the meta row :479-496, after the applications span, add `<span className="text-[#CBD5E1]">·</span><span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#64748B]"><Eye className="h-4 w-4" />…</span>`. This mirrors the applications styling.

RISKS: Food listings with neither zone nor hours now show a subtitle row containing only the count; this is intended.

The detail pages stay ISR (no cookies, headers or auth added), so the static→dynamic 500 (E132) is avoided.

The new key duplicates the PropertyDetail.views text under a second key.

## STEP S6: Guest dashboard: own history, two-step public-view read, mixed cards (D5)
files: src/app/[locale]/dashboard/guest/loadData.ts:5-7,23-29,44-51,156-162, src/app/[locale]/dashboard/guest/GuestDashboardClient.tsx:3-27,50,364-455, messages/{ka,en,ru}.json GuestDashboard (recentSubtitle :2749)
contracts: C9, C10, C21, C23, C34 (new)

loadData.ts:
- Keep RECENT_LIMIT = 12. Update its doc: the viewer's own history, newest first.
- Add:
export type RecentListing = | { kind: "property"; listing: Tables<"public_properties"> } | { kind: "service"; listing: Tables<"public_services"> };
- Change GuestData.recent to RecentListing[].
- Replace the propsRes element of the Promise.all (:47-51) with `loadRecentListings(supabase, userId)`, so the two-step chain runs in parallel with the other 4 queries. Return `recent` directly.

async function loadRecentListings(supabase: SupabaseClient<Database>, userId: string): Promise<RecentListing[]> {
  // Over-fetch: history rows whose listing is no longer public are dropped below.
  const { data: history } = await supabase.from("recently_viewed_listings").select("property_id, service_id").eq("user_id", userId).order("viewed_at", { ascending: false }).limit(RECENT_LIMIT * 2);
  if (!history?.length) return [];
  const propertyIds = history.flatMap((h) => (h.property_id ? [h.property_id] : []));
  const serviceIds = history.flatMap((h) => (h.service_id ? [h.service_id] : []));
  // Public views only — base tables are RLS-hidden from non-owners, and views carry no relationships to embed (favorites pattern).
  const [propsRes, servicesRes] = await Promise.all([
    propertyIds.length ? supabase.from("public_properties").select("*").in("id", propertyIds) : Promise.resolve({ data: [] as Tables<"public_properties">[] }),
    serviceIds.length ? supabase.from("public_services").select("*").in("id", serviceIds) : Promise.resolve({ data: [] as Tables<"public_services">[] }),
  ]);
  const properties = new Map((propsRes.data ?? []).map((p) => [p.id, p]));
  const services = new Map((servicesRes.data ?? []).map((s) => [s.id, s]));
  const recent: RecentListing[] = [];
  for (const h of history) {
    const property = h.property_id ? properties.get(h.property_id) : undefined;
    if (property) { recent.push({ kind: "property", listing: property }); continue; }
    const service = h.service_id ? services.get(h.service_id) : undefined;
    if (service) recent.push({ kind: "service", listing: service });
  }
  return recent.slice(0, RECENT_LIMIT);
}

If the union of thenables confuses TS, cast as favorites/page.tsx:70-75 does. The same loader runs on the server (page.tsx) and in the browser (realtime reload at :144/:187); both are covered by the authenticated SELECT grant and the own-row policy.

GuestDashboardClient.tsx:
- Drop `type Property` (:24). Import `type RecentListing` from ./loadData, and add `formatNumber` (format), `applyDiscount, isDiscountActive` (pricing), `priceUnitPathFor` (listing-options), `propertyViewUrl, serviceViewUrl` (listingUrls), `sanitizePhotos` (utils/photos).
- :50 becomes `useState<RecentListing[]>(initial.recent)`. COLLAPSED_COUNT, canExpandRecent, visibleRecent, the toggle and the header are unchanged.
- Section body (:394-454): when `!loading && recent.length === 0`, render `<p className="mt-4 rounded-[20px] border border-[#EEF1F4] bg-[#FAFBFC] px-5 py-8 text-center text-[13px] font-medium text-[#94A3B8]">{t("recentEmpty")}</p>` (myRequests.empty style, :294). Otherwise render the existing grid, mapping `visibleRecent.map((entry) => <RecentListingCard key={`${entry.kind}:${entry.listing.id}`} entry={entry} />)`.

Local component below the default export (favorites/page.tsx pattern), keeping the current card markup:
function RecentListingCard({ entry }: { entry: RecentListing }) {
  const t = useTranslations("GuestDashboard");
  const tOpts = useTranslations("ListingOptions");
  const l = entry.listing;
  const href = entry.kind === "property" ? propertyViewUrl(entry.listing) : serviceViewUrl(entry.listing); // hotel→/hotels, sale→/sales, food→/food …
  const photo = sanitizePhotos(l.photos)[0];
  const isSale = entry.kind === "property" && Boolean(entry.listing.is_for_sale);
  const base = entry.kind === "property" ? Number((isSale ? entry.listing.sale_price : entry.listing.price_per_night) ?? 0) : entry.listing.price != null ? Number(entry.listing.price) : null;
  // C10 via the shared helpers (sales too, as SalePropertyCard does); C21: a food listing's own discount is never applied — food discounts live per menu item.
  const discounted = !(entry.kind === "service" && entry.listing.category === "food") && isDiscountActive(l.discount_percent, l.discount_expires_at);
  const price = base != null && discounted ? applyDiscount(base, l.discount_percent, l.discount_expires_at) : base;
  const money = (n: number) => (isSale ? `$${formatNumber(n)}` : formatPrice(n)); // sales are USD (favorites/page.tsx:274-277)
  const unitPath = entry.kind === "service" ? priceUnitPathFor(entry.listing.price_unit) : null;
  const unit = entry.kind === "property" ? (isSale ? null : t("perNight")) : entry.listing.price_unit ? `/${unitPath ? tOpts(unitPath) : entry.listing.price_unit}` : null;
  return (<Link href={href} data-testid="recent-listing" className={existing :409 classes}>
    <div className="relative h-[150px] w-full overflow-hidden bg-[#F1F5F9]">{photo && <Image src={photo} alt={l.title} fill sizes="400px" className="object-cover transition-transform duration-300 group-hover:scale-105" />}
      {(l.is_super_vip || l.is_vip) && <span className="absolute left-3 top-3 rounded-md bg-[#F97316] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">{l.is_super_vip ? "SUPER VIP" : "VIP"}</span>}</div>
    <div className="flex flex-1 flex-col gap-1.5 p-4"><h3 className="truncate text-[14px] font-extrabold text-[#0F172A]">{l.title}</h3>
      <p className="flex items-center gap-1 text-[12px] text-[#94A3B8]"><Eye className="h-3 w-3" />{t("views", { count: l.views_count ?? 0 })}</p>
      {price != null && (<div className="mt-auto flex items-baseline gap-1 pt-2">{discounted && base != null && <span className="text-[11px] font-medium text-[#94A3B8] line-through">{money(base)}</span>}<span className="text-[16px] font-black text-[#0F172A]">{money(price)}</span>{unit && <span className="text-[11px] font-medium text-[#94A3B8]">{unit}</span>}</div>)}</div></Link>);
}

is_vip and is_super_vip come from the public views and are already expiry-aware (20260925132000_public_views_hide_expired_vip.sql). Verified: every field used exists in both the live views and database.ts:36-47.

RISKS: The section starts empty for everyone because there is no backfill. The previous popular-listings content disappears, so the empty state is expected at first.

There is no clear-history UI and no consent gating. Rows cascade on profile or listing delete.

The loader is reused by the realtime offers reload, which also refreshes history; this is harmless.

## STEP S7: i18n: new keys + en/ru plural fixes (D6)
files: messages/ka.json, messages/en.json, messages/ru.json
contracts: C1

Apply the i18n entries exactly. Line anchors are identical in all three catalogs:
- RenterDashboard.views :681
- Shared block :1214 (append `views` after bannerExpand :1227)
- GuestDashboard: recentEmpty goes after recentSubtitle :2749; views :2752
- DashboardShared.views :3124
- AdminShared.viewsMeta :3965

ka values are unchanged apart from the new keys: Georgian does not pluralise after numerals.

All call sites pass a number:
- GuestDashboardClient :433 and the new card
- renter/listings/page.tsx:253
- FoodDashboardClient.tsx:126
- admin/listings/page.tsx:371-375 (views: row.views_count ?? 0)

The strings were verified with the installed intl-messageformat. en: 1 view / 2 views / 1,234 views. ru: 1 просмотр, 2 просмотра, 5 просмотров, 21 просмотр, 22 просмотра, 1 234 просмотра.

Then run node scripts/check-message-parity.mjs and node scripts/i18n-scope.mjs --check.

RISKS: `#` inside a plural gets locale digit grouping in en/ru, while ka `{count}` stays ungrouped. This is a pre-existing cosmetic inconsistency.

The messages lock is stale (s-keepz-payments-0925). Keep hunks additive or confined to these value changes.

## STEP S8: Migration B: owner tamper guard for view counters (D7 + INSERT extension)
files: supabase/migrations/20260926165100_listing_view_counters_owner_guard.sql (new)
contracts: C10, C11, C22

Full SQL is in migrations[1]. It was generated from the live pg_get_functiondef of both functions; only the lines tagged [counters] are new.

Decision: RAISE 42501 on UPDATE, the trigger's existing contract, and silently zero on INSERT, force_listing_moderation_state's existing contract.

Audit of every non-privileged UPDATE on properties/services:
- create/sale/page.tsx:739-743 updates {cadastral_code_public, organization_id?} only.
- FoodDashboardClient.tsx:93-97 {status} and ServiceDashboardClient.tsx:95 {status} only.
- All create-form edits call submitContentChange → /api/content-change-requests. route.ts:144-150 rejects any key outside REVIEWABLE_FIELDS (src/lib/content-change/fields.ts, which has no counters).
- The create-form inserts do not include views_count or menu_views_count (grep src/app/[locale]/create = 0 hits).
- SECURITY DEFINER RPCs such as purchase_package and self_service_* never SET the counters. For unlisted columns NEW equals OLD.

Privileged paths bypass the guard (service_role, admin, or NULL role):
- record_listing_view and increment_service_menu_views: EXECUTE is service_role/postgres only; they are called by the service client in view/route.ts and menu/track/route.ts:51.
- Admin routes with allow-listed payloads: api/admin/listings/route.ts:117-125 {status, is_new}; listings/update/route.ts cleanPatch (PROPERTY_FIELDS/SERVICE_FIELDS contain no counters); listings/moderate {status, admin_notes}; verifications/moderate {status}.
- vip-lifecycle (service role).

No code matches on the exception text (grep).

Apply with mcp__supabase-staging__apply_migration only after the S0 md5 preflight. Then run the postApplyChecks.

RISKS: Overlap with s-sec-harden-0926 D5: whoever redefines these functions later must regenerate from the live def.

audit_row_change still treats the counters as noise; that is fine now that owners cannot change them.

Pre-2026-08-08 counters cannot be proven untampered, because no audit rows exist for them.

## STEP S9: Migration C + seller analytics page (D8, flagged extension on contact scope)
files: supabase/migrations/20260926165200_seller_stats_sale_scope_ranged_views.sql (new), src/app/[locale]/dashboard/seller/analytics/page.tsx:166-175
contracts: C11, C22

All callers were enumerated:
- seller_dashboard_stats has exactly one caller, analytics/page.tsx:88-96. It always passes range.from/range.to from useStatsFilter (default last 30 days; there is no all-time preset).
- owner_dashboard_stats has four callers, all left unchanged:
  - food/loadData.ts:53 ('food'; see S10)
  - renter/loadOverview.ts:63 ('rental', lifetime)
  - SellerDashboardClient.tsx:137 ('sale' + range; the tile carries a 'total' badge, so lifetime is honest)
  - service/loadData.ts:39 ('service' + p_listing_ids; KPI = sum of rows)

Migration (full SQL in migrations[2]), CREATE OR REPLACE only, never DROP (preserves the EXECUTE grant). Three changes:
(1) owned: `AND coalesce(p.is_for_sale, false)`.
(2) views_total: when both bounds are NULL, the lifetime sum(views_count); otherwise count(*) of listing_view_events (listing_type='property', listing_id IN owned, created_at in [p_from,p_to)). Uses index listing_view_events_listing_idx.
(3) FLAGGED extension. In personal scope, new_interest, contact_reach and sms_views used `ce.owner_id = uid AND NOT EXISTS(org property)`, which counts rental and service contacts in the sale funnel. They now use `ce.owner_id = me.uid AND ce.property_id IN (SELECT id FROM owned)`; owned already excludes org properties. Drop (3) only if the parent rejects it; the funnel then stays inconsistent at stage 3.

Page :166-175: add `const listingCount = listingIds.length || listingOptions.length;`. The avg metric becomes `views ? Math.round(views / Math.max(1, listingCount)).toString() : "0"`, with the comment `// per SALE listing in scope (the picker lists sale listings only), not per funnel stage`.

Expected on staging for seller 67630fe2-5613-4fc2-b453-ffad4e7b9040, 30-day range at 2026-09-26 ~14:00Z: views_total 31 → 3 (sale events in the last 30 days); avg round(31/5)=6 → round(3/2)=2.

RISKS: Any range before 2026-08-08 shows 0 views, because event logging began then; this is noted in C22. Events since 2026-09-09 are under-counted until the S1 fix deploys.

The analytics page's favorites stage changes too, from rentals included to sale-only. This is intended and consistent.

new_leads and sold (leads table) are unchanged.

## STEP S10: Food dashboard: header count and KPI tiles describe the same restaurant (D9)
files: src/app/[locale]/dashboard/food/loadData.ts:53
contracts: C22

Change the rpc call to:
supabase.rpc("owner_dashboard_stats", { p_scope: "food", /* The whole screen describes `restaurant` (newest food listing: header, hours, price, actions, one-item picker), so scope the tiles to it — its header count and the Views tile can no longer disagree for owners with several food listings. */ p_listing_ids: restaurant ? [restaurant.id] : undefined })

- restaurant is already resolved before the Promise.all, so there is no added latency.
- With no restaurant, the scope is unchanged (all zero).
- The header :102/:126 stays `restaurant.views_count`, which now equals kpis.views_total.
- The Menu views, Favorites and Calls tiles become that restaurant's too.

Staging example: owner 67630fe2 sees header 3 and tile 3 (was 4).

RISKS: Owners with more than one food listing no longer see the other listings' metrics anywhere on this dashboard. The screen was already single-restaurant (.limit(1)).

## STEP S11: Contracts (working-tree condensed docs/contracts.md, additive hunks)
files: docs/contracts.md:153-159 (C16), docs/contracts.md:215-221 (C22), docs/contracts.md:273-279 (C28), docs/contracts.md:329+ (new C34)
contracts: C16, C22, C28, C34 (new)

C16:
- Replace the Key line with: "Upstash → Postgres → in-memory (dev) / allow (prod, logged). 1.5s store timeout. Client IP = `src/lib/client-ip.ts:getClientIp` (re-exported by rateLimit.ts): peer = **last** `X-Forwarded-For` hop (DO ingress appends it). DO App Platform's edge is Cloudflare (`*.ondigitalocean.app` → Cloudflare anycast), so a peer inside `CLOUDFLARE_IPV4_RANGES`/`CLOUDFLARE_IPV6_RANGES` → `CF-Connecting-IP`, else the hop before the peer; any other peer is the client. Never the first hop, never `DO-Connecting-IP`. Ranges = cloudflare.com/ips-v4 + ips-v6 (re-sync on change). Deno twin `_shared/guards.ts` still reads the first hop (open follow-up)."
- Append to Breaks: "trust the first hop (spoof bypass, 2026-09-08); key on the raw last hop behind Cloudflare (one bucket per edge — 2026-09-09 view undercount); stale range list (new edges keyed as clients)."

C22:
- Add `POST /api/listings/[kind]/[id]/view` to Symbols.
- Add a Key line: "Beacon order: active check (404) → owner skip `{counted:false, reason:\"self\"}` (incl. `?preview=1`) → history upsert (C34) → dedup 1/24h per viewer (`listing-view:user:<id>:…` signed in, `listing-view:ip:<C16 ip>:…` anon) → `record_listing_view`. Every answer carries the live `views` (C28). `views_count`/`menu_views_count` are service_role/admin-only: `prevent_listing_protected_field_change` raises 42501 on user UPDATE, `force_listing_moderation_state` zeroes them on user INSERT (audit_row_change ignores counters, so these triggers are the only guard). `seller_dashboard_stats`: sale listings only; `views_total` = events in [p_from,p_to) (lifetime counter only when both bounds NULL; events exist since 2026-08-08). `owner_dashboard_stats`/`listing_analytics` totals stay lifetime `views_count`."
- Append to Breaks: "dedup keyed on a shared edge IP (under-counts); owner views counted; counters writable by owners (fake popularity, no audit row); ranged funnel mixed with lifetime views."

C28: add a Key line: "Live/personal data only after hydration: detail clients take the live count from the view beacon's `views` (`src/lib/hooks/useListingViewCount.ts`); per-user history is written by that POST route, never read by the page."

New section after C33:
"## C34 — Recently viewed history (guest dashboard)"

**Invariant:** `public.recently_viewed_listings` (user_id → profiles CASCADE; property_id XOR service_id per C9, CASCADE) is written **only** by `POST /api/listings/[kind]/[id]/view`. That route upserts through the service role, with `viewed_at`=now, for signed-in non-owners of ACTIVE listings, **before** the 24h view dedup. The table is read **only** by `loadGuestData` under the user's JWT: RLS limits it to own rows, and authenticated holds SELECT only. Reads are two-step `.in(\"id\")` on `public_properties`/`public_services`.

**Key:** The non-partial `UNIQUE(user_id,property_id)`/`UNIQUE(user_id,service_id)` constraints are load-bearing: PostgREST `onConflict` cannot target partial indexes. Grants are explicit, because default ACLs no longer give anon/authenticated anything. No audit trigger, no realtime, no backfill, no prune (bounded by distinct listings). Cards link via `propertyViewUrl`/`serviceViewUrl`.

**Breaks:**
- Upsert after the dedup gate: same-day revisits never re-sort.
- Reading base tables or embedding views: RLS hides other owners' rows.
- A partial unique index: upsert fails with 42P10.
- Client-side writes: there is no INSERT/UPDATE grant.
- Hand-rolled hrefs: hotels open in /apartments, food in /services.

RISKS: The condensation is unattributed and uncommitted, and the HEAD long version is not updated. Stage only your own hunks (git add -p) if asked to commit.

The docs/contracts.md lock is stale.

## STEP S12: Local verification (unit, static checks, isolated build, e2e)
files: e2e/dashboards/guest.spec.ts (append describe), scripts/unit/client-ip.test.mjs
contracts: C16, C22, C28, C29, C34 (new)

1) Static checks, all green: npm test (test:unit + production-config + security-auth), npx tsc --noEmit, npm run lint, npm run check:contracts, npm run check:db-contracts -- --strict.

2) Isolated build (memory shared-next-dir-build-collisions; never the shared .next):
- `rsync -a --delete --exclude node_modules --exclude .next --exclude .git --exclude coordination ./ ~/.cache/mb-recent-views/`
- Symlink node_modules; copy .env.local (it points at STAGING).
- `TMPDIR=~/.cache/tmp NODE_OPTIONS=--dns-result-order=ipv4first npm run build`. prebuild runs the i18n-scope, parity and contract checks.
- `ALLOWED_ORIGINS=http://localhost:3160 npx next start -p 3160`. Without it the middleware 403s the POST beacon: .env.local allows only :3000.
- Leave tnlu.service on :3000 alone. To kill a server, use its PID from `ss -ltnp`, never `pkill -f` with the port in your own command line.

3) e2e, after announcing the seed/teardown in messages.md: from the repo root, export TEST_SUPABASE_URL/ANON/SERVICE_ROLE_KEY (staging) and run `E2E_BASE_URL=http://localhost:3160 npx playwright test --project=guest`. It runs setup (seed) → guest → teardown.

Append to e2e/dashboards/guest.spec.ts:

Imports: `STRESS_IDS` from "../helpers/fixture-manifest.mjs", `TEST_IDS` from "../helpers/seed", `authenticateAsRole` from "../helpers/auth", `loadTestUsers` from "../helpers/fixtures".

test.describe("Guest recently viewed + live view counts", () => {
- `test.describe.configure({ mode: "serial" })`
- `const FOOD = STRESS_IDS.foodMax;`. TEST_IDS.foodService is flipped to pending by the parallel favorites tests (guest.spec.ts:190-199, fullyParallel at playwright.config.ts:10); foodMax is active with price 95 "პირზე", a local photo, and VIP.
- `keys(ids)`:
  - `listing-view:user:${ids.guest}:property:${ids.hotel}`
  - `…${ids.seller}:property:${ids.hotel}`
  - `…${ids.renter}:property:${ids.hotel}`
  - `…${ids.guest}:service:${FOOD}`
- `reset(ids)`: `supabaseAdmin.from("rate_limit_counters").delete().in("key", keys(ids))` plus `supabaseAdmin.from("recently_viewed_listings").delete().in("user_id", [ids.guest, ids.seller, ids.renter])`; expect no errors.
- `beacon(page, kind, id)`: `page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith(`/api/listings/${kind}/${id}/view`))`
- beforeEach: reset(testIds).
- afterAll: reset(TEST_IDS), plus `supabaseAdmin.from("listing_view_events").delete().in("listing_id", [TEST_IDS.hotel, FOOD])` (mirrors vip-fixtures.ts:432).

Test 1, "records the viewer's own history newest-first with canonical links" (guestPage):
1. goto /dashboard/guest → expect text "ჯერ არ გინახავთ განცხადებები" visible (empty state).
2. goto `/hotels/${testIds.hotel}` → body = await (await beacon).json() → expect counted true and typeof views "number" → expect `getByText(`${body.views} ნახვა`, { exact: true })` visible (live count replaced the ISR one).
3. goto `/food/${FOOD}` → service beacon counted true and the same visible-count assertion (service pages now show a count).
4. goto /dashboard/guest → `cards = getByTestId("recent-listing")` → toHaveCount(2) → nth(0) href `/food/${FOOD}` → nth(1) href `/hotels/${testIds.hotel}`.

Test 2, "an owner's own view is neither counted nor recorded" (renterPage; renter owns the hotel):
- beacon status 200 and JSON toMatchObject({ counted: false, reason: "self" }).
- recently_viewed_listings count for renter === 0.

Test 3, "each signed-in viewer counts once, even from the same IP" (guestPage, browser):
1. before = hotel views_count via supabaseAdmin.
2. Guest beacon counted true (first).
3. Seller in its OWN context: `browser.newContext({ baseURL: test.info().project.use.baseURL })`, because fixture pages share one cookie jar (e2e/helpers/auth.ts: page.context().addCookies). `authenticateAsRole(loadTestUsers().seller, page)` → beacon counted true with views >= first.views + 1 (the old ::1 bucket would have denied it). Close the context in finally.
4. guestPage.reload() → toMatchObject({ counted: false, reason: "duplicate" }).
5. after >= before + 2 (use >= because public/pages.spec.ts:332 views the hotel concurrently).
});

RISKS: The shared staging DB and fixture seed are also used by other sessions, so announce first.

If the Postgres limiter store is unreachable, the in-memory fallback ignores the key deletes, and restarting the server clears it.

A local run writes ::1 events into staging; this is a known pre-existing hygiene issue.

## STEP S13: Post-deploy verification (ONLY after the user approves a staging push)
files: (no repo files) STAGING SQL + curl
contracts: C16, C22, C27

Deploy watch: name the app explicitly, mybakuriani-staging-fra (ab57bc5c-d42b-420d-bd7e-191225677b8b); wait for ACTIVE with source_commit_hash = the pushed commit, and note ACTIVE_AT.

(1) New events carry client IPs, not edges (read-only). Run:
WITH cf(r) AS (SELECT unnest(ARRAY['173.245.48.0/20','103.21.244.0/22','103.22.200.0/22','103.31.4.0/22','141.101.64.0/18','108.162.192.0/18','190.93.240.0/20','188.114.96.0/20','197.234.240.0/22','198.41.128.0/17','162.158.0.0/15','104.16.0.0/13','104.24.0.0/14','172.64.0.0/13','131.0.72.0/22','2400:cb00::/32','2606:4700::/32','2803:f800::/32','2405:b500::/32','2405:8100::/32','2a06:98c0::/29','2c0f:f248::/32']::cidr[])), ev AS (SELECT client_ip, created_at, CASE WHEN client_ip ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' OR (client_ip ~ '^[0-9A-Fa-f:.]+$' AND client_ip LIKE '%:%') THEN client_ip::inet END AS addr FROM public.listing_view_events WHERE created_at >= '<ACTIVE_AT>') SELECT CASE WHEN addr IS NULL THEN 'non-ip' WHEN addr <<= '::1/128' OR addr <<= '127.0.0.0/8' THEN 'loopback' WHEN EXISTS (SELECT 1 FROM cf WHERE addr <<= r) THEN 'cloudflare' ELSE 'client' END AS class, count(*), count(DISTINCT client_ip), min(created_at), max(created_at) FROM ev GROUP BY 1;
Expect 0 'cloudflare' rows. A lone 2a06:98c0:3600::103 would be cross-zone Worker traffic.

Then check new limiter keys: `SELECT split_part(key,':',2) AS subject, count(*) FROM public.rate_limit_counters WHERE key LIKE 'listing-view:%' AND reset_at > '<ACTIVE_AT>'::timestamptz + interval '24 hours' GROUP BY 1;`
Expect only 'user' and 'ip', and no `listing-view:ip:162.15[89].*` or `172.6x/104.x` edge keys.

(2) Forged-header probes. Pick an ACTIVE staging property L owned by a QA account (facade00-*); each probe adds at most 1 view to it. Get the workstation egress with `curl -4 -s https://www.cloudflare.com/cdn-cgi/trace | grep ^ip=`. Then:
for host in https://staging.mybakuriani.ge https://mybakuriani-staging-fra-cnnsy.ondigitalocean.app; do curl -4 -sS -X POST "$host/api/listings/property/$L/view" -H 'Origin: https://staging.mybakuriani.ge' -H 'X-Forwarded-For: 203.0.113.77' -H 'CF-Connecting-IP: 203.0.113.78' -H 'X-Real-IP: 203.0.113.79' -H 'True-Client-IP: 203.0.113.80'; echo; done

The Origin header is mandatory: without it the middleware returns 403 before the route and the SQL below would pass vacuously. Require JSON bodies: the first is {counted:true,…}, the second {counted:false,reason:"duplicate",…}.

If Cloudflare itself rejects the forged CF-Connecting-IP with a non-JSON 4xx, record that, repeat with only X-Forwarded-For/X-Real-IP forged, and still require JSON.

Then run:
- `SELECT key, count FROM public.rate_limit_counters WHERE key LIKE '%203.0.113.%';` → 0 rows.
- `SELECT key, count FROM public.rate_limit_counters WHERE key LIKE 'listing-view:ip:%:property:<L>';` → exactly one key, containing the egress IP, count 2 (both hosts resolved the same real IP).
- `SELECT client_ip, created_at FROM public.listing_view_events WHERE listing_id = '<L>' AND created_at > now() - interval '15 minutes';` → the egress IP, never 203.0.113.x or 162.158.x.

(3) Manual browser check on staging as a QA guest:
- Open a hotel and a food listing: counts render on both.
- The /dashboard/guest section lists them newest-first with /hotels and /food links.
- en/ru labels read "1 view" / "1 просмотр".
- Seller analytics shows sale-only, ranged views.
- The food header equals the Views tile.

(4) If (1) still shows edge IPs: temporarily log the header NAMES only (no values) on staging for one request, and revisit S1 before touching do-connecting-ip.

RISKS: The probes write one view and two limiter rows on staging. Use a QA listing and note it in messages.md.

Production is untouched. It runs the same topology (mybakuriani-prod is also on DO App Platform) and is SITE_LOCKED (C27). The three migrations must be added to the s-sec-harden-0926 prod runbook.

## MIGRATION supabase/migrations/20260926165000_recently_viewed_listings.sql
D1: per-user recently-viewed history. Written only by the service role from the view beacon route; read only by the owner (the viewer) under RLS. Explicit grants are needed because staging's pg_default_acl for role postgres now grants new tables to postgres and service_role only.
```sql
-- Per-user "recently viewed" history for the guest dashboard section
-- "ბოლოს ნანახი განცხადებები" (contract C34). Written ONLY by the view beacon
-- route (POST /api/listings/[kind]/[id]/view) through the service role, for
-- signed-in viewers who do not own the listing; read ONLY by the viewer's own
-- dashboard under RLS. Not a metric source: views_count / listing_view_events
-- stay the analytics truth (C22). Starts empty - no backfill.

CREATE TABLE public.recently_viewed_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  -- C9: exactly one listing reference (no listings table).
  CONSTRAINT recently_viewed_listings_exactly_one_ref CHECK (
    (property_id IS NOT NULL)::int + (service_id IS NOT NULL)::int = 1
  ),
  -- Non-partial on purpose: PostgREST's upsert (on_conflict=user_id,property_id)
  -- cannot target a partial unique index. NULLs are distinct, so service rows
  -- never collide on the property constraint and vice versa.
  CONSTRAINT recently_viewed_listings_user_property_key UNIQUE (user_id, property_id),
  CONSTRAINT recently_viewed_listings_user_service_key UNIQUE (user_id, service_id)
);

-- Dashboard read: WHERE user_id = ? ORDER BY viewed_at DESC LIMIT n.
CREATE INDEX recently_viewed_listings_user_viewed_idx
  ON public.recently_viewed_listings (user_id, viewed_at DESC);
-- FK-side indexes so deleting a listing cascades without a sequential scan.
CREATE INDEX recently_viewed_listings_property_idx
  ON public.recently_viewed_listings (property_id) WHERE property_id IS NOT NULL;
CREATE INDEX recently_viewed_listings_service_idx
  ON public.recently_viewed_listings (service_id) WHERE service_id IS NOT NULL;

ALTER TABLE public.recently_viewed_listings ENABLE ROW LEVEL SECURITY;

-- State the posture explicitly instead of inheriting default ACLs (which differ
-- between roles and are being hardened). TRUNCATE is not governed by RLS, so
-- client-facing roles must never hold it.
REVOKE ALL ON public.recently_viewed_listings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.recently_viewed_listings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recently_viewed_listings TO service_role;

CREATE POLICY "users read own recently viewed"
  ON public.recently_viewed_listings FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

NOTIFY pgrst, 'reload schema';

```
POST-APPLY: 1) Grants: `SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='recently_viewed_listings' GROUP BY 1;`
Expect:
- authenticated = SELECT
- service_role = DELETE,INSERT,SELECT,UPDATE
- postgres = owner
- no anon row

2) `SELECT policyname, cmd, roles, qual FROM pg_policies WHERE tablename='recently_viewed_listings';` → exactly 1 SELECT policy for {authenticated}.

3) `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.recently_viewed_listings'::regclass;` → pkey, 3 FKs (CASCADE), exactly_one_ref, and the 2 UNIQUE constraints.

4) Upsert inference, then RLS isolation. Run in one query string with rollback, using a real staging profile U, another profile V, and an active property P:
BEGIN;
INSERT INTO public.recently_viewed_listings (user_id, property_id) VALUES ('<U>','<P>') ON CONFLICT (user_id, property_id) DO UPDATE SET viewed_at = EXCLUDED.viewed_at;
INSERT INTO public.recently_viewed_listings (user_id, property_id) VALUES ('<U>','<P>') ON CONFLICT (user_id, property_id) DO UPDATE SET viewed_at = EXCLUDED.viewed_at;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','<V>','role','authenticated')::text, true);
SELECT count(*) FROM public.recently_viewed_listings;  -- expect 0 for V
ROLLBACK;
Both inserts must succeed and leave 1 row.

5) Repeat 4) with U's claims → count 1. Then `INSERT ... ` as authenticated → ERROR 42501 permission denied. Then ROLLBACK.

6) mcp get_advisors (security + performance): no new lint for this table.

7) Run npm run types:gen, then `npm run types:gen -- --check` → matches.

## MIGRATION supabase/migrations/20260926165100_listing_view_counters_owner_guard.sql
D7 + INSERT extension. Owners hold INSERT and UPDATE on views_count/menu_views_count (column privileges verified on staging) plus owner RLS, and audit_row_change ignores those columns. The trigger now raises 42501 on non-privileged UPDATEs of the counters, and the moderation trigger zeroes them on non-privileged INSERTs. Both bodies were generated from the live staging pg_get_functiondef; only [counters] lines are new. Pre-apply md5(prosrc) baselines: prevent_listing_protected_field_change beef6334c617a5a2d2d1650898cc58d0 (len 2084), force_listing_moderation_state 517645867cabbfd79cd9334dcd0d8140 (len 690).
```sql
-- Listing view counters are analytics, not owner content (C22): views_count is
-- written only by record_listing_view and menu_views_count only by
-- increment_service_menu_views, both via the service role. Owners held UPDATE
-- and INSERT on both columns (table grants + owner RLS) and audit_row_change
-- treats them as noise, so a PATCH or an INSERT could fake popularity with no
-- trace. Bodies regenerated from the live definitions; only the lines tagged
-- [counters] are new. service_role / admin / NULL-role callers still bypass.

CREATE OR REPLACE FUNCTION public.prevent_listing_protected_field_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  caller_role text;
  status_changed boolean;
  status_locked boolean;
  org_changed boolean := false;
  counters_changed boolean;
BEGIN
  status_changed := NEW.status::text IS DISTINCT FROM OLD.status::text;
  -- [counters] views_count is written only by record_listing_view (service
  -- role, C22); an owner PATCH must not be able to fake popularity.
  counters_changed := NEW.views_count IS DISTINCT FROM OLD.views_count;

  IF TG_TABLE_NAME = 'services' THEN
    -- Only block leaving 'pending' (the self-approval bypass); owners can
    -- freely toggle active/draft/blocked on an already-moderated listing.
    status_locked := status_changed AND OLD.status::text = 'pending';
    -- [counters] menu_views_count exists only on `services`; keep the
    -- reference inside this branch so it is never resolved against `properties`.
    counters_changed := counters_changed
      OR NEW.menu_views_count IS DISTINCT FROM OLD.menu_views_count;
  ELSE
    status_locked := status_changed;
  END IF;

  -- organization_id exists only on `properties`. Keep the reference inside this
  -- branch so it is never resolved against the `services` rowtype.
  IF TG_TABLE_NAME = 'properties' THEN
    org_changed := NEW.organization_id IS DISTINCT FROM OLD.organization_id;
    -- The row owner may attach/detach their own listing to/from a company;
    -- enforce_org_listing_rules still validates approved membership + active
    -- subscription + listing cap on every attach.
    IF org_changed
       AND OLD.owner_id = auth.uid()
       AND NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id THEN
      org_changed := false;
    END IF;
  END IF;

  IF NOT status_locked
     AND NEW.is_vip IS NOT DISTINCT FROM OLD.is_vip
     AND NEW.is_super_vip IS NOT DISTINCT FROM OLD.is_super_vip
     AND NEW.discount_percent IS NOT DISTINCT FROM OLD.discount_percent
     AND NEW.vip_expires_at IS NOT DISTINCT FROM OLD.vip_expires_at
     AND NEW.discount_expires_at IS NOT DISTINCT FROM OLD.discount_expires_at
     AND NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id
     AND NOT org_changed
     AND NOT counters_changed
  THEN
    RETURN NEW;
  END IF;

  BEGIN
    caller_role := auth.role();
  EXCEPTION WHEN OTHERS THEN
    caller_role := NULL;
  END;

  IF caller_role IS NULL OR caller_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF public.is_admin_user() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Changing status/is_vip/is_super_vip/discount_percent/vip_expires_at/discount_expires_at/owner_id/organization_id/views_count/menu_views_count is not permitted from a non-admin user session'
    USING ERRCODE = '42501';
END;
$function$;

CREATE OR REPLACE FUNCTION public.force_listing_moderation_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() IS NULL OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF public.is_admin_user() THEN
    RETURN NEW;
  END IF;

  NEW.status := 'pending';
  NEW.is_vip := false;
  -- services has is_super_vip too. Resetting it only for properties let an
  -- owner insert a service that became a permanent (NULL-expiry) SUPER VIP
  -- once approved, since every reader treats a NULL expiry as active.
  NEW.is_super_vip := false;
  NEW.discount_percent := 0;
  NEW.discount_expires_at := NULL;
  NEW.vip_expires_at := NULL;
  NEW.vip_expiry_notified_at := NULL;
  -- [counters] a new listing starts unviewed; an owner cannot seed its
  -- counters (views_count on both tables, menu_views_count on services).
  NEW.views_count := 0;
  IF TG_TABLE_NAME = 'properties' THEN
    NEW.organization_id := NULL;
  END IF;
  -- [counters]
  IF TG_TABLE_NAME = 'services' THEN
    NEW.menu_views_count := 0;
  END IF;
  RETURN NEW;
END;
$function$;

```
POST-APPLY: 0) PRE-apply: md5(prosrc) must still equal the baselines in purpose. If not, regenerate from the live def with an anchor-asserting script; do not reuse this text.

1) POST-apply: md5(prosrc) of each function must equal the md5 of the file text strictly between its $function$ markers (apply_migration preserves bodies exactly). Also confirm the triggers are still attached: `SELECT tgname FROM pg_trigger WHERE tgfoid IN ('public.prevent_listing_protected_field_change()'::regprocedure,'public.force_listing_moderation_state()'::regprocedure);` → properties_/services_lock_protected_fields and properties_/services_force_moderation_on_insert. Also check that EXECUTE ACLs are unchanged (CREATE OR REPLACE keeps them).

2) Owner tamper blocked. Use an owner O of an active property P and of a food service F:
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','<O>','role','authenticated')::text, true);
UPDATE public.properties SET views_count = views_count + 1000 WHERE id='<P>';
ROLLBACK;
Expect ERROR 42501. Repeat for services views_count and menu_views_count on F → 42501 each.

3) Legit owner edits still pass: in the same simulation, `UPDATE public.properties SET cadastral_code_public = cadastral_code_public WHERE id='<P>'` → UPDATE 1; `UPDATE public.services SET status = status WHERE id='<F>'` → UPDATE 1. ROLLBACK.

4) Privileged writers still work:
BEGIN;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT public.record_listing_view('property','<P>','203.0.113.1');
SELECT public.increment_service_menu_views('<F>');
ROLLBACK;
No error, and views_count+1 is visible before the rollback.

5) INSERT zeroing: as O (authenticated simulation), `INSERT INTO public.services (owner_id, category, title, views_count, menu_views_count) VALUES ('<O>','food','tamper-probe',99999,99999) RETURNING status, views_count, menu_views_count;` → pending, 0, 0. ROLLBACK.

## MIGRATION supabase/migrations/20260926165200_seller_stats_sale_scope_ranged_views.sql
D8. seller_dashboard_stats (sole caller: dashboard/seller/analytics/page.tsx:88) changes in three ways:
- `owned` covers sale listings only.
- views_total is range-bounded from listing_view_events, falling back to the lifetime counter only when both bounds are NULL.
- FLAGGED extension: personal-scope contact metrics are restricted to owned sale listings. Before, they counted rental and service contacts too; the only staging contact_event is a rental one.

Generated from the live def; md5(prosrc) baseline is 1f13880e1df0f2da01abee919d1badac (len 3762). CREATE OR REPLACE keeps the EXECUTE grant to authenticated.
```sql
-- Seller analytics funnel consistency (C22):
--  * [sale-scope] seller analytics is about sale listings; rentals have their
--    own dashboard (owner_dashboard_stats 'rental'). `owned` was every personal
--    property, and personal-scope contact metrics were any non-org contact of
--    the owner, so rental/service activity leaked into the sale funnel.
--  * [ranged-views] views_total ignored p_from/p_to while every other metric
--    here is range-bounded; it now counts listing_view_events in the range
--    (event log exists since 2026-08-08; no backfill may be fabricated).
-- Body regenerated from the live definition; tagged lines are the changes.

CREATE OR REPLACE FUNCTION public.seller_dashboard_stats(p_from timestamp with time zone, p_to timestamp with time zone, p_property_ids uuid[] DEFAULT NULL::uuid[], p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(new_interest bigint, new_leads bigint, sold bigint, favorites bigint, views_total bigint, contact_reach bigint, sms_views bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_organization_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = p_organization_id
      AND m.user_id = auth.uid()
      AND m.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'თქვენ არ ხართ ამ კომპანიის დადასტურებული წევრი' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH me AS (
    SELECT auth.uid() AS uid
  ),
  owned AS (
    SELECT p.id
    FROM public.properties p, me
    WHERE (
        (p_organization_id IS NULL AND p.owner_id = me.uid AND p.organization_id IS NULL)
        OR (p_organization_id IS NOT NULL AND p.organization_id = p_organization_id)
      )
      -- [sale-scope]
      AND coalesce(p.is_for_sale, false)
      AND (p_property_ids IS NULL OR p.id = ANY (p_property_ids))
  )
  SELECT
    (
      SELECT count(*)
      FROM public.contact_events ce, me
      WHERE (
          -- [sale-scope] owned already excludes org-linked properties.
          (p_organization_id IS NULL AND ce.owner_id = me.uid
            AND ce.property_id IN (SELECT id FROM owned))
          OR (p_organization_id IS NOT NULL AND ce.property_id IN (SELECT id FROM owned))
        )
        AND (p_property_ids IS NULL OR ce.property_id = ANY (p_property_ids))
        AND ce.created_at >= p_from
        AND ce.created_at < p_to
    )::bigint AS new_interest,
    (
      SELECT count(*)
      FROM public.leads l, me
      WHERE (
          (p_organization_id IS NULL AND l.owner_id = me.uid AND l.organization_id IS NULL)
          OR (p_organization_id IS NOT NULL AND l.organization_id = p_organization_id)
        )
        AND (p_property_ids IS NULL OR l.property_id = ANY (p_property_ids))
        AND l.created_at >= p_from
        AND l.created_at < p_to
    )::bigint AS new_leads,
    (
      SELECT count(*)
      FROM public.leads l, me
      WHERE (
          (p_organization_id IS NULL AND l.owner_id = me.uid AND l.organization_id IS NULL)
          OR (p_organization_id IS NOT NULL AND l.organization_id = p_organization_id)
        )
        AND l.stage = 'closed'
        AND (p_property_ids IS NULL OR l.property_id = ANY (p_property_ids))
        AND l.created_at >= p_from
        AND l.created_at < p_to
    )::bigint AS sold,
    (
      SELECT count(*)
      FROM public.favorites f
      WHERE f.property_id IN (SELECT id FROM owned)
        AND f.created_at >= p_from
        AND f.created_at < p_to
    )::bigint AS favorites,
    (
      -- [ranged-views] events in [p_from, p_to); lifetime counter only when
      -- no bound is given at all.
      CASE
        WHEN p_from IS NULL AND p_to IS NULL THEN (
          SELECT coalesce(sum(p.views_count), 0)
          FROM public.properties p
          WHERE p.id IN (SELECT id FROM owned)
        )
        ELSE (
          SELECT count(*)
          FROM public.listing_view_events e
          WHERE e.listing_type = 'property'
            AND e.listing_id IN (SELECT id FROM owned)
            AND (p_from IS NULL OR e.created_at >= p_from)
            AND (p_to IS NULL OR e.created_at < p_to)
        )
      END
    )::bigint AS views_total,
    (
      SELECT count(DISTINCT ce.visitor_id)
      FROM public.contact_events ce, me
      WHERE (
          -- [sale-scope]
          (p_organization_id IS NULL AND ce.owner_id = me.uid
            AND ce.property_id IN (SELECT id FROM owned))
          OR (p_organization_id IS NOT NULL AND ce.property_id IN (SELECT id FROM owned))
        )
        AND (p_property_ids IS NULL OR ce.property_id = ANY (p_property_ids))
        AND ce.created_at >= p_from
        AND ce.created_at < p_to
    )::bigint AS contact_reach,
    (
      SELECT coalesce(sum(ce.sms_sent_count), 0)
      FROM public.contact_events ce, me
      WHERE (
          -- [sale-scope]
          (p_organization_id IS NULL AND ce.owner_id = me.uid
            AND ce.property_id IN (SELECT id FROM owned))
          OR (p_organization_id IS NOT NULL AND ce.property_id IN (SELECT id FROM owned))
        )
        AND (p_property_ids IS NULL OR ce.property_id = ANY (p_property_ids))
        AND ce.created_at >= p_from
        AND ce.created_at < p_to
    )::bigint AS sms_views;
END;
$function$;

```
POST-APPLY: 0) PRE-apply: md5(prosrc) = 1f13880e1df0f2da01abee919d1badac. On mismatch, regenerate from the live def.

1) POST-apply:
- md5(prosrc) = md5 of the file body between the $function$ markers.
- `SELECT has_function_privilege('authenticated','public.seller_dashboard_stats(timestamptz,timestamptz,uuid[],uuid)','EXECUTE')` → true.
- pg_get_function_result is unchanged.

2) Seller 67630fe2-5613-4fc2-b453-ffad4e7b9040, with rollback:
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','67630fe2-5613-4fc2-b453-ffad4e7b9040','role','authenticated')::text, true);
SELECT views_total, favorites, contact_reach FROM public.seller_dashboard_stats(now() - interval '30 days', now());
SELECT views_total FROM public.seller_dashboard_stats(NULL, NULL);
ROLLBACK;
Expect:
- The ranged views_total = that seller's sale-listing listing_view_events in the last 30 days (3 at 2026-09-26 ~14:00Z; was 31).
- NULL/NULL → 6, the lifetime sale counter.
- favorites = only on sale listings (0).

3) Org scope: a non-member passing p_organization_id still gets 42501.

## I18N
- GuestDashboard.recentEmpty
  ka: ჯერ არ გინახავთ განცხადებები. რასაც გახსნით, აქ გამოჩნდება.
  en: You haven't viewed any listings yet. The ones you open will show up here.
  ru: Вы ещё не просматривали объявления. Открытые вами объявления появятся здесь.
  note: NEW. Insert after GuestDashboard.recentSubtitle (line 2749 in all three catalogs). The ka form matches the sibling empty states' polite '-ათ/-იათ' register (myRequests.empty 'ჯერ არ გაგიგზავნიათ მოთხოვნა', offersModal.emptyTitle 'ჯერ არ მიგიღიათ შეთავაზებები'). Rendered in the myRequests.empty style.
- Shared.views
  ka: {count} ნახვა
  en: {count, plural, one {# view} other {# views}}
  ru: {count, plural, one {# просмотр} few {# просмотра} many {# просмотров} other {# просмотра}}
  note: NEW. Append after Shared.bannerExpand (line 1227). The forms copy PropertyDetail.views (line 1389). It is used by the 5 service detail clients through their existing tShared. Shared is already in PUBLIC_NAMESPACES, so namespaces.ts is unchanged.
- GuestDashboard.views
  ka: {count} ნახვა
  en: {count, plural, one {# view} other {# views}}
  ru: {count, plural, one {# просмотр} few {# просмотра} many {# просмотров} other {# просмотра}}
  note: CHANGED en/ru only (line 2752); ka unchanged. Was '{count} views' / '{count} просмотров', which rendered '1 views' and '2 просмотров'.
- RenterDashboard.views
  ka: {count} ნახვა
  en: {count, plural, one {# view} other {# views}}
  ru: {count, plural, one {# просмотр} few {# просмотра} many {# просмотров} other {# просмотра}}
  note: CHANGED en/ru only (line 681); ka unchanged. Caller: dashboard/renter/listings/page.tsx:253 (count is a number).
- DashboardShared.views
  ka: {count} ნახვა
  en: {count, plural, one {# view} other {# views}}
  ru: {count, plural, one {# просмотр} few {# просмотра} many {# просмотров} other {# просмотра}}
  note: CHANGED en/ru only (line 3124; not DashboardShared.stats.views at 3076); ka unchanged. Caller: FoodDashboardClient.tsx:126.
- AdminShared.viewsMeta
  ka: {meta} • {views} ნახვა • {location}
  en: {meta} • {views, plural, one {# view} other {# views}} • {location}
  ru: {meta} • {views, plural, one {# просмотр} few {# просмотра} many {# просмотров} other {# просмотра}} • {location}
  note: CHANGED en/ru only (line 3965); meta and location are kept. Caller: admin/listings/page.tsx:371-375 passes views as a number. Verified: 'hotel • 1 view • Kokhta' / 'hotel • 3 просмотра • Кохта'.

## TESTS
- [unit] scripts/unit/client-ip.test.mjs: The getClientIp/isCloudflareIp matrix from S1:
- No headers or x-real-ip only.
- Non-CF peer with a spoofed XFF and a forged cf-connecting-ip: the first hop is never returned.
- CF peer plus cf-connecting-ip.
- CF peer without a cf header: the hop before the peer; CF alone or 'garbage, CF' fall back to the peer.
- IPv6 CF peer.
- IPv4-mapped peer and value normalisation.
- ::1.
- Whitespace and empty hops.
- 'garbage'.
- Range edges: 104.27.255.255 true, 104.28.0.0 false, 162.160.0.0 false, 2a06:98c7:ffff::1 true, 2a06:98c8::1 false.
- Table sizes 15 and 7.

Run with npm run test:unit (node --experimental-strip-types).
- [e2e] e2e/dashboards/guest.spec.ts: New serial describe 'Guest recently viewed + live view counts' (the guest project):
(1) Empty state, then hotel (TEST_IDS.hotel) and food (STRESS_IDS.foodMax) views: both beacons return counted:true and a numeric views; the page shows '<views> ნახვა' on the hotel and on the food page. The dashboard shows 2 [data-testid=recent-listing] cards: nth(0) href /food/<foodMax>, nth(1) href /hotels/<hotel>.
(2) renterPage (the hotel's owner) gets {counted:false, reason:'self'} and has no history row.
(3) The guest is counted; the seller, in a separate browser context, is counted with views >= guest+1 from the same ::1. A guest reload returns {counted:false, reason:'duplicate'}. DB views_count >= before+2.

beforeEach and afterAll delete the listing-view:user:* keys and the history rows; afterAll also deletes the listing_view_events on the two fixtures.
- [sql] supabase/migrations/20260926165000_recently_viewed_listings.sql: postApplyChecks: grants, the single SELECT policy, constraints, ON CONFLICT inference for both unique constraints, RLS isolation between two users, no INSERT for authenticated, and advisors clean.
- [sql] supabase/migrations/20260926165100_listing_view_counters_owner_guard.sql: md5 pre/post checks.

Role simulation in BEGIN…ROLLBACK:
- Owner UPDATE of views_count/menu_views_count → 42501.
- A legit owner UPDATE (cadastral_code_public, status) → 1 row.
- service_role record_listing_view and increment_service_menu_views → ok.
- An owner INSERT with views_count=99999 → returns 0/0/pending.
- [sql] supabase/migrations/20260926165200_seller_stats_sale_scope_ranged_views.sql: md5 pre/post checks and the EXECUTE grant is preserved.

Seller 67630fe2 simulation: the 30-day views_total equals the sale-listing events in range (3, was 31); NULL/NULL gives the lifetime sale counter (6); favorites are sale-only; a non-member org scope gets 42501.
- [manual-browser] src/app/[locale]/dashboard/guest/GuestDashboardClient.tsx: On the local isolated build (:3160, ALLOWED_ORIGINS set) and then on deployed staging, as a QA guest:
- The five service detail pages show the eye+count line in their layouts.
- Apartment, hotel and sale counts update after load.
- The guest dashboard lists own views newest-first, with hotel→/hotels and food→/food links, sale prices in $, and discounts and SUPER VIP handled.
- The empty state appears for a fresh account.
- en/ru plural labels are correct on the guest, renter-listings, food-header and admin-listings screens.
- Seller analytics shows sale-only ranged views and avg per listing.
- The food header count equals the Views tile.
- [post-deploy] (staging SQL + curl, see S13): After the user-approved push and deploy ACTIVE:
- Events created since ACTIVE_AT classify as 'client' or 'loopback', never 'cloudflare'.
- New listing-view keys are only user:/ip:<client>.
- Forged XFF/CF-Connecting-IP/X-Real-IP/True-Client-IP probes WITH an Origin header go to both staging.mybakuriani.ge and mybakuriani-staging-fra-cnnsy.ondigitalocean.app, and must return JSON. Then:
  - no rate_limit_counters key contains 203.0.113.x;
  - exactly one listing-view:ip:<egress>:property:<L> key has count 2;
  - the listing_view_events client_ip is the egress IP.

## VERIFIED FACTS
- The view route reads no identity and spends the 24h slot before the active check: src/app/api/listings/[kind]/[id]/view/route.ts:17-36. It returns only {counted} (:48). It already takes NextRequest (:9-12). hasSupabaseAuthCookie(request: NextRequest) is at src/lib/supabase/auth-cookies.ts:22, and getCurrentUser (src/lib/auth/current-user.ts:31-63) is used by other route handlers (menu/track:22, contact/track:24).
- getClientIp returns hops[hops.length-1] (src/lib/rateLimit.ts:173-185). It has 15 importers, all API route handlers or server actions: 13 declare runtime nodejs; site-lock/unlock and actions/revalidateListing.ts use the default Node runtime. No middleware or edge importer exists, so node:net is safe.
- Topology, verified via dig/curl on 2026-09-26: mybakuriani.ge NS = ns1-3.digitalocean.com. staging.mybakuriani.ge CNAMEs to mybakuriani-staging-fra-cnnsy.ondigitalocean.app, which resolves to 162.159.140.98 and 172.66.0.96 (Cloudflare ranges). /api/health returns server: cloudflare and cf-ray ...-TBS. Cloudflare is DO App Platform's own edge, and both hostnames go through it. Staging ALLOWED_ORIGINS = https://staging.mybakuriani.ge (DO app spec ab57bc5c-...).
- Cloudflare's published ranges fetched 2026-09-26: 15 IPv4 and 7 IPv6 CIDRs (listed in S1). In Node 22.23.1, BlockList.check matches ::ffff:162.158.151.148 (type ipv6) against a v4 subnet and returns false (not a throw) for garbage. isIP rejects 'ip:port', '[v6]' and ' ip'. 104.27.255.255 is inside the ranges and 104.28.0.0 is not.
- Next 15.5.25 keys each segment subtree by createRouterCacheKey(segment) (node_modules/next/dist/client/components/layout-router.js:424 and :509), so navigating to another [id] remounts the detail client and useState(initial) needs no reset.
- All 5 service clients already use useTranslations('Shared') as tShared: Food :49, Transport :59, Services :60, Entertainment :61, Employment :188. Shared and PropertyDetail are both in PUBLIC_NAMESPACES (src/i18n/namespaces.ts). None of the 5 imports Eye today. useEffect is used only by the beacon in Food, Transport, Services, Entertainment, Apartment and Hotel.
- Staging pg_default_acl for role postgres, object type r, grants only postgres and service_role (anon and authenticated are absent), so new tables need an explicit GRANT to authenticated. rate_limit_counters grants service_role DELETE, so e2e cleanup via supabaseAdmin works.
- authenticated (and anon) hold column-level INSERT and UPDATE on properties.views_count, services.views_count and services.menu_views_count (information_schema.column_privileges). Live force_listing_moderation_state (md5 517645867cabbfd79cd9334dcd0d8140) resets VIP and discount fields on insert but not the counters. Live prevent_listing_protected_field_change (md5 beef6334c617a5a2d2d1650898cc58d0) does not compare the counters. Both run BEFORE row triggers on both tables.
- No non-privileged write path carries the counters:
- content-change payloads are limited to REVIEWABLE_FIELDS (src/app/api/content-change-requests/route.ts:144-150; src/lib/content-change/fields.ts);
- direct owner updates touch only status (FoodDashboardClient.tsx:96, ServiceDashboardClient.tsx:95) or {cadastral_code_public, organization_id} (create/sale/page.tsx:739-743);
- the admin routes use allow-lists without counters (api/admin/listings/route.ts:117-125, listings/update/route.ts cleanPatch, listings/moderate);
- no create form mentions views_count (grep);
- no code matches on the trigger's exception text.
- seller_dashboard_stats (md5 1f13880e1df0f2da01abee919d1badac):
- p_from and p_to have no defaults;
- `owned` has no is_for_sale filter;
- views_total = lifetime sum(views_count);
- the personal-scope contact metrics filter on ce.owner_id only, not on owned.

Its single caller is analytics/page.tsx:88-96, which always passes the range; the page divides the average by funnel.length (:172). Seller 67630fe2-5613-4fc2-b453-ffad4e7b9040 has 2 sale and 5 rental listings; lifetime all = 31, lifetime sale = 6, sale events in the last 30 days = 3.
- owner_dashboard_stats has 4 callers: food/loadData.ts:53, renter/loadOverview.ts:63, SellerDashboardClient.tsx:137 and service/loadData.ts:39. The food dashboard shows a single restaurant (loadData.ts:24-32 .limit(1)) but its KPIs aggregate all food services.
- The public_properties and public_services views expose every column the new cards use: category, price, price_unit, discount_percent, discount_expires_at, is_vip, is_super_vip, views_count, photos, best_active_menu_item_discount_percent (live information_schema). database.ts:36-47 types them as Row<'properties'|'services'> & extras.
- Food listings never apply the listing-level discount (FoodDetailClient.tsx:99-110; the C21 cards use best_active_menu_item_discount_percent). Sale prices are USD and rendered as '$'+formatNumber (favorites/page.tsx:274-277; SalePropertyCard applies applyDiscount).
- The ICU strings in the i18n entries render correctly with the installed intl-messageformat: en '1 view', '2 views', '1,234 views'; ru '1 просмотр', '2 просмотра', '5 просмотров', '21 просмотр'. check-message-parity.mjs checks key sets only.
- E2E facts:
- Fixtures share one browser context, since authenticateAsRole writes page.context() cookies (e2e/helpers/auth.ts:286-327).
- fullyParallel is true (playwright.config.ts:10).
- The favorites tests flip TEST_IDS.foodService to pending (guest.spec.ts:190-199).
- public/pages.spec.ts:332 visits the hotel fixture.
- STRESS_IDS.foodMax (active, price 95, local photo, operating_hours stored as a text column) is seeded by the standard setup (seed.ts:649).
- The hotel owner is TEST_IDS.renter (seed.ts:236-237).
- Coordination: s-sec-harden-0926 is active (started 2026-09-26T13:43Z). It claims supabase/migrations/20260926170000_*+ and has ledger items A10 (Cloudflare-IP rate-limit key), D5 (owner-writable counts) and D8 (Deno first hop). The locks on messages/*.json, docs/contracts.md and database.generated.ts belong to s-keepz-payments-0925, which is done and whose locks are treated as stale. The newest migration file is 20260926160000_membership_fb_profile_url.sql.

## OPEN RISKS
- s-sec-harden-0926 overlaps directly: A10 (getClientIp), D5 (counter guard in the same trigger function), the migration range 170000+, the shared e2e seed, and rsync'd 'after' builds that will pick up these uncommitted hunks. Coordinate through messages.md before editing. Every function migration must be generated from the live def at apply time, with filename order equal to apply order.
- The DO header chain is inferred, not captured. If App Platform strips CF-Connecting-IP and XFF lacks the Cloudflare-appended hop, getClientIp degrades to today's edge-IP keys (no regression, fix not effective). S13's SQL is the proof; do-connecting-ip stays untrusted until verified.
- Per-account dedup means N signed-in accounts from one IP now yield N views per day, and anonymous rotating IPs each count once. Org co-members' and admins' views still count; only owner_id is excluded.
- Local dev and e2e runs (::1) keep writing view events and counter bumps into staging (.env.local points at staging). This is pre-existing and out of scope.
- Historical counts cannot be repaired: real client IPs were never stored between 2026-09-09 and the deploy. Seller analytics ranges before 2026-08-08 show 0 views, because the event log starts then.
- The history table starts empty, so every user sees the empty state until they browse. It has no clear-history UI and no consent gate: the privacy policy lists listing views as processed data, and rows cascade with the profile. Production erasure depends on the profiles/auth FKs, which are absent on staging.
- Food dashboard KPIs now describe only the newest food listing. An owner with several restaurants no longer sees the others' metrics on that screen.
- D8 extension (flagged): the seller analytics contact stage becomes sale-only. Declining it leaves the funnel inconsistent at stage 3.
- The route now runs a DB select (and an auth call for signed-in users) before the limiter. An optional coarse per-IP burst limiter could restore cheap flood rejection.
- types:gen regenerates from live staging and may include other sessions' schema objects. Review the diff and do not hand-edit.
- The docs/contracts.md working-tree condensation is unattributed and uncommitted, and HEAD's long version is not updated by this plan. Stage only your own hunks if asked to commit.
- Production is untouched and SITE_LOCKED (C27). The three migrations and the code must go through the prod rollout runbook (s-sec-harden-0926), and the prod topology (DO sgp app) must be re-verified there.
- The Cloudflare range list is static and must be refreshed when Cloudflare publishes changes. The Deno twin in supabase/functions/_shared/guards.ts still keys on the first XFF hop (owned by s-sec-harden D8).

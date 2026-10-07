import { NextRequest, after } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { recordAnalyticsEvent } from "@/lib/analytics/events";
import { createServiceClient } from "@/lib/supabase/admin";
import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-cookies";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isUuid } from "@/lib/utils/uuid";

export const runtime = "nodejs";

/** Bounded, server-only analytics write; no browser RPC grant is required. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;
  if (!isUuid(id) || (kind !== "property" && kind !== "service")) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const db = createServiceClient();
  const table = kind === "property" ? "properties" : "services";
  // Checked BEFORE the daily slot is spent: a pending preview or a dead id must
  // not burn a real viewer's 24h window.
  const { data: listing } = await db
    .from(table)
    .select("id, owner_id, views_count")
    .eq("id", id)
    .eq("status", "active")
    .maybeSingle();
  if (!listing) return Response.json({ error: "not_found" }, { status: 404 });
  const views = listing.views_count ?? 0;
  // Only requests carrying a Supabase auth cookie pay for the auth round-trip.
  // Reading the session is fine here: this is a route handler, not the ISR
  // detail page (C28).
  let userId: string | null = null;
  if (hasSupabaseAuthCookie(req)) {
    try {
      userId = (await getCurrentUser())?.id ?? null;
    } catch {
      // Identity is optional for this metric; fall back to the IP key.
    }
  }
  // Owners (incl. their ?preview=1 visits) neither count nor fill their own
  // history: same rule as /api/menu/track.
  if (userId && userId === listing.owner_id) {
    return Response.json({ counted: false, reason: "self", views });
  }
  // History is recency, not a metric: refresh it on EVERY signed-in view,
  // before the 24h dedup, or a same-day revisit never re-sorts (C35).
  // Best-effort, but awaited: an un-awaited Supabase builder never fires.
  if (userId) {
    const viewedAt = new Date().toISOString();
    const { error: historyError } = await db
      .from("recently_viewed_listings")
      .upsert(
        kind === "property"
          ? { user_id: userId, property_id: id, viewed_at: viewedAt }
          : { user_id: userId, service_id: id, viewed_at: viewedAt },
        {
          onConflict:
            kind === "property" ? "user_id,property_id" : "user_id,service_id",
        },
      );
    if (historyError) {
      console.error("[listing-view] history upsert failed", historyError.code);
    }
  }
  // At most one counted view per viewer/listing/day: the account when signed
  // in, else the trusted client IP (C16). This is a deliberately conservative
  // analytics signal, not a billing primitive.
  const ip = getClientIp(req);
  const viewer = userId ? `user:${userId}` : `ip:${ip}`;
  if (
    !(await checkRateLimit(
      `listing-view:${viewer}:${kind}:${id}`,
      1,
      86_400_000,
    ))
  ) {
    return Response.json({ counted: false, reason: "duplicate", views });
  }
  // record_listing_view bumps views_count AND logs a listing_view_events row in
  // one atomic call, which is what makes the owner-facing daily views trend
  // (src/app/api/listings/[kind]/[id]/analytics/route.ts) possible. It replaces
  // the old increment_views/increment_service_views calls; those RPCs are left
  // in place (nothing else calls them) rather than dropped.
  const { error } = await db.rpc("record_listing_view", {
    p_listing_type: kind,
    p_listing_id: id,
    p_client_ip: ip,
  });
  if (error) return Response.json({ counted: false, views }, { status: 503 });
  // The same counted view, tagged with the visitor's analytics session for
  // the admin dashboard's filters (C49; consenting visitors only).
  after(() =>
    recordAnalyticsEvent(req, {
      name: "listing_view",
      entityType: kind,
      entityId: id,
      userId,
    }),
  );
  return Response.json({ counted: true, views: views + 1 });
}

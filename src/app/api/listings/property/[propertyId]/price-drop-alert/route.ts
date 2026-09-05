import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isSmsFeatureEnabled } from "@/lib/sms/feature-flags";
import { toCanonicalGePhone } from "@/lib/sms/phone";

export const runtime = "nodejs";

// Each active subscriber costs the LISTING OWNER one SMS credit per price
// drop (sms_materialize_due_price_drop_events charges the owner, not the
// subscriber). With no cap, mass-creating phone-verified accounts and
// subscribing them to a stranger's listing could drain that owner's balance
// or stall/expire their own legitimate notification once oversubscribed past
// it. Bound the blast radius to a fixed constant regardless of how many
// accounts an attacker controls.
const MAX_SUBSCRIBERS_PER_LISTING = 50;

async function context(propertyId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return { ok: false as const, status: 401, error: "unauthenticated" };
  if (!isSmsFeatureEnabled("SMS_PRICE_DROP_MODE", user.id)) {
    return { ok: false as const, status: 404, error: "feature_unavailable" };
  }
  const db = createServiceClient();
  const { data: property } = await db
    .from("properties")
    .select("id,owner_id,status,is_for_sale,organization_id")
    .eq("id", propertyId)
    .maybeSingle();
  if (
    !property ||
    property.status !== "active" ||
    property.is_for_sale !== true ||
    property.organization_id !== null
  ) {
    return { ok: false as const, status: 404, error: "listing_unavailable" };
  }
  if (property.owner_id === user.id)
    return { ok: false as const, status: 403, error: "self_subscription" };
  return { ok: true as const, user, db, property };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  const { propertyId } = await params;
  const ctx = await context(propertyId);
  if (!ctx.ok)
    return Response.json({ error: ctx.error }, { status: ctx.status });
  const { data } = await ctx.db
    .from("sale_price_alert_subscriptions")
    .select("active")
    .eq("property_id", propertyId)
    .eq("subscriber_id", ctx.user.id)
    .maybeSingle();
  return Response.json({ subscribed: data?.active === true });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  const { propertyId } = await params;
  const ctx = await context(propertyId);
  if (!ctx.ok)
    return Response.json({ error: ctx.error }, { status: ctx.status });
  const body = (await request.json().catch(() => null)) as {
    enabled?: unknown;
  } | null;
  if (
    !body ||
    typeof body.enabled !== "boolean" ||
    Object.keys(body).some((key) => key !== "enabled")
  ) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  if (body.enabled) {
    const phone = toCanonicalGePhone(ctx.user.phone);
    if (!phone || !ctx.user.phone_confirmed_at) {
      return Response.json(
        { error: "verified_phone_required" },
        { status: 409 },
      );
    }
    const { data: profile } = await ctx.db
      .from("profiles")
      .select("marketing_opt_out")
      .eq("id", ctx.user.id)
      .maybeSingle();
    if (profile?.marketing_opt_out)
      return Response.json({ error: "marketing_opted_out" }, { status: 409 });

    const { count } = await ctx.db
      .from("sale_price_alert_subscriptions")
      .select("subscriber_id", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .eq("active", true)
      .neq("subscriber_id", ctx.user.id);
    if ((count ?? 0) >= MAX_SUBSCRIBERS_PER_LISTING) {
      return Response.json(
        { error: "subscriber_limit_reached" },
        { status: 409 },
      );
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await ctx.db
    .from("sale_price_alert_subscriptions")
    .upsert(
      {
        property_id: propertyId,
        subscriber_id: ctx.user.id,
        active: body.enabled,
        subscribed_at: body.enabled ? now : undefined,
        unsubscribed_at: body.enabled ? null : now,
        consent_version: "price-drop-v1",
        updated_at: now,
      },
      { onConflict: "property_id,subscriber_id" },
    )
    .select("active")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ subscribed: data.active });
}

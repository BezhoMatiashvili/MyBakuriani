import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isSmsFeatureEnabled } from "@/lib/sms/feature-flags";

export const runtime = "nodejs";

export type SellerPriceAlertListing = {
  id: string;
  title: string;
  sale_price: number | null;
  currency: string | null;
  status: string | null;
  enabled: boolean;
  subscriber_count: number;
  recent_event: {
    status: string;
    baseline_price: number;
    latest_price: number;
    send_after: string;
  } | null;
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });
  if (!isSmsFeatureEnabled("SMS_PRICE_DROP_MODE", user.id)) {
    return Response.json({ error: "feature_unavailable" }, { status: 404 });
  }

  const db = createServiceClient();
  const [balanceRes, propertiesRes] = await Promise.all([
    db.from("balances").select("sms_remaining").eq("user_id", user.id).maybeSingle(),
    db.from("properties").select("id,title,sale_price,currency,status").eq("owner_id", user.id).eq("is_for_sale", true).is("organization_id", null).order("created_at", { ascending: false }),
  ]);
  if (propertiesRes.error) return Response.json({ error: propertiesRes.error.message }, { status: 500 });

  const propertyIds = (propertiesRes.data ?? []).map((property) => property.id);
  if (propertyIds.length === 0) {
    return Response.json({ sms_remaining: Number(balanceRes.data?.sms_remaining ?? 0), listings: [] });
  }

  const [rulesRes, subscriptionsRes, eventsRes] = await Promise.all([
    db.from("sale_price_alert_rules").select("property_id,enabled").in("property_id", propertyIds),
    db.from("sale_price_alert_subscriptions").select("property_id").in("property_id", propertyIds).eq("active", true),
    db.from("sale_price_drop_events").select("property_id,status,baseline_price,latest_price,send_after").in("property_id", propertyIds).order("created_at", { ascending: false }),
  ]);
  const error = rulesRes.error ?? subscriptionsRes.error ?? eventsRes.error;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const enabledByProperty = new Map((rulesRes.data ?? []).map((rule) => [rule.property_id, rule.enabled]));
  const subscriberCount = new Map<string, number>();
  for (const subscription of subscriptionsRes.data ?? []) {
    subscriberCount.set(subscription.property_id, (subscriberCount.get(subscription.property_id) ?? 0) + 1);
  }
  const recentEvent = new Map<string, SellerPriceAlertListing["recent_event"]>();
  for (const event of eventsRes.data ?? []) {
    if (!recentEvent.has(event.property_id)) {
      recentEvent.set(event.property_id, {
        status: event.status,
        baseline_price: Number(event.baseline_price),
        latest_price: Number(event.latest_price),
        send_after: event.send_after,
      });
    }
  }

  const listings: SellerPriceAlertListing[] = (propertiesRes.data ?? []).map((property) => ({
    ...property,
    sale_price: property.sale_price == null ? null : Number(property.sale_price),
    enabled: enabledByProperty.get(property.id) ?? false,
    subscriber_count: subscriberCount.get(property.id) ?? 0,
    recent_event: recentEvent.get(property.id) ?? null,
  }));

  return Response.json({ sms_remaining: Number(balanceRes.data?.sms_remaining ?? 0), listings });
}

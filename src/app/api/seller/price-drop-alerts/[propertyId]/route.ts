import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isSmsFeatureEnabled } from "@/lib/sms/feature-flags";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });
  if (!isSmsFeatureEnabled("SMS_PRICE_DROP_MODE", user.id)) {
    return Response.json({ error: "feature_unavailable" }, { status: 404 });
  }
  const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
  if (!body || typeof body.enabled !== "boolean" || Object.keys(body).some((key) => key !== "enabled")) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const { propertyId } = await params;
  const db = createServiceClient();
  const { data, error } = await db.rpc("sms_set_price_drop_rule", {
    p_owner_id: user.id,
    p_property_id: propertyId,
    p_enabled: body.enabled,
  });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 500;
    return Response.json({ error: error.message }, { status });
  }
  return Response.json({ rule: data });
}

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

type Body = {
  service_id?: string | null;
};

export async function POST(req: NextRequest) {
  if (!checkRateLimit(`menu-track:${getClientIp(req)}`, 30, 60_000)) {
    return Response.json(
      { tracked: false, reason: "rate_limited" },
      {
        status: 429,
      },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.service_id) {
    return Response.json(
      { tracked: false, reason: "missing_params" },
      { status: 400 },
    );
  }

  const db = createServiceClient();

  const { data: service } = await db
    .from("services")
    .select("owner_id")
    .eq("id", body.service_id)
    .maybeSingle();

  if (!service?.owner_id) {
    return Response.json(
      { tracked: false, reason: "listing_not_found" },
      { status: 404 },
    );
  }

  if (user && service.owner_id === user.id) {
    return Response.json({ tracked: false, reason: "self" }, { status: 200 });
  }

  const { error } = await db.rpc("increment_service_menu_views", {
    p_service_id: body.service_id,
  });

  if (error) {
    return Response.json(
      { tracked: false, reason: error.message },
      { status: 400 },
    );
  }

  return Response.json({ tracked: true });
}

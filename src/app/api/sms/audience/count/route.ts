import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  SENDER_ROLES,
  isValidAudienceForRole,
  type SenderRole,
} from "@/lib/sms/audience";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.role || !SENDER_ROLES.has(profile.role as SenderRole)) {
    return Response.json({ error: "role_not_allowed" }, { status: 403 });
  }

  const audience = req.nextUrl.searchParams.get("audience");
  if (!audience || !isValidAudienceForRole(audience, profile.role)) {
    return Response.json({ error: "invalid_audience" }, { status: 400 });
  }

  const db = createServiceClient();
  const { data, error } = await db.rpc("sms_audience_count", {
    p_sender_id: user.id,
    p_audience: audience,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ count: Number(data ?? 0) });
}

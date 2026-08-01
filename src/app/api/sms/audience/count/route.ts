import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isValidAudienceForRole } from "@/lib/sms/audience";
import { canUseSmsCenter } from "@/lib/sms/sender-access";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!(await canUseSmsCenter(supabase, user.id))) {
    return Response.json({ error: "role_not_allowed" }, { status: 403 });
  }

  const audience = req.nextUrl.searchParams.get("audience");
  // Effective sender role is always "renter" — SMS Center is the renter
  // cabinet's tool regardless of the user's primary profile role.
  if (!audience || !isValidAudienceForRole(audience, "renter")) {
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

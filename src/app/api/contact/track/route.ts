import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Body = {
  property_id?: string | null;
  service_id?: string | null;
  channel?: "call" | "whatsapp";
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ tracked: false, reason: "unauth" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.channel || (!body.property_id && !body.service_id)) {
    return Response.json(
      { tracked: false, reason: "missing_params" },
      { status: 400 },
    );
  }

  if (body.channel !== "call" && body.channel !== "whatsapp") {
    return Response.json(
      { tracked: false, reason: "bad_channel" },
      { status: 400 },
    );
  }

  const db = createServiceClient();

  // Resolve the listing owner server-side so the client doesn't have to pass
  // it (and can't spoof it).
  let ownerId: string | null = null;
  if (body.property_id) {
    const { data } = await db
      .from("properties")
      .select("owner_id")
      .eq("id", body.property_id)
      .maybeSingle();
    ownerId = data?.owner_id ?? null;
  } else if (body.service_id) {
    const { data } = await db
      .from("services")
      .select("owner_id")
      .eq("id", body.service_id)
      .maybeSingle();
    ownerId = data?.owner_id ?? null;
  }

  if (!ownerId) {
    return Response.json(
      { tracked: false, reason: "listing_not_found" },
      { status: 404 },
    );
  }

  if (ownerId === user.id) {
    return Response.json({ tracked: false, reason: "self" }, { status: 200 });
  }

  // record_contact_event accepts NULL for whichever listing id is unused
  // (validated above and inside the function). Generated types incorrectly
  // mark both as non-nullable, so we cast through unknown.
  const { data: eventId, error } = await db.rpc("record_contact_event", {
    p_visitor_id: user.id,
    p_owner_id: ownerId,
    p_property_id: (body.property_id ?? null) as unknown as string,
    p_service_id: (body.service_id ?? null) as unknown as string,
    p_channel: body.channel,
  });

  if (error) {
    return Response.json(
      { tracked: false, reason: error.message },
      { status: 400 },
    );
  }

  return Response.json({ tracked: Boolean(eventId), event_id: eventId });
}

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { canUseSmsCenter } from "@/lib/sms/sender-access";
import type { Tables } from "@/lib/types/database";

export const runtime = "nodejs";

const MAX_PER_EVENT = 3;

export type SmsContact = {
  event_id: string;
  visitor_id: string;
  display_name: string | null;
  visitor_phone: string;
  channel: Tables<"contact_events">["channel"];
  property_id: string | null;
  service_id: string | null;
  created_at: string;
  expires_at: string;
  sms_sent_count: number;
  remaining: number;
};

export async function GET() {
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

  const db = createServiceClient();
  const { data: events, error } = await db
    .from("contact_events")
    .select(
      "id, visitor_id, visitor_phone, channel, property_id, service_id, created_at, expires_at, sms_sent_count",
    )
    .eq("owner_id", user.id)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const visitorIds = Array.from(
    new Set((events ?? []).map((e) => e.visitor_id)),
  );
  let nameById = new Map<string, string | null>();
  if (visitorIds.length > 0) {
    const { data: profiles } = await db
      .from("profiles")
      .select("id, display_name")
      .in("id", visitorIds);
    nameById = new Map(
      (profiles ?? []).map((p) => [p.id, p.display_name ?? null]),
    );
  }

  const contacts: SmsContact[] = (events ?? [])
    .filter((e) => e.visitor_phone)
    .map((e) => ({
      event_id: e.id,
      visitor_id: e.visitor_id,
      display_name: nameById.get(e.visitor_id) ?? null,
      visitor_phone: e.visitor_phone as string,
      channel: e.channel,
      property_id: e.property_id,
      service_id: e.service_id,
      created_at: e.created_at,
      expires_at: e.expires_at,
      sms_sent_count: e.sms_sent_count,
      remaining: Math.max(0, MAX_PER_EVENT - e.sms_sent_count),
    }));

  return Response.json({ contacts });
}

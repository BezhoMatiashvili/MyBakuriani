import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const SENDER_ROLES = new Set([
  "renter",
  "seller",
  "cleaner",
  "food",
  "entertainment",
  "transport",
  "employment",
  "handyman",
]);

const MAX_PER_EVENT = 3;
const MAX_MESSAGE_LEN = 320;

type Body = {
  recipient_id?: string;
  message?: string;
};

export async function POST(req: NextRequest) {
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

  if (!profile?.role || !SENDER_ROLES.has(profile.role)) {
    return Response.json({ error: "role_not_allowed" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.recipient_id || !body.message) {
    return Response.json({ error: "missing_params" }, { status: 400 });
  }

  const message = body.message.trim();
  if (message.length < 1 || message.length > MAX_MESSAGE_LEN) {
    return Response.json({ error: "message_length" }, { status: 400 });
  }

  const db = createServiceClient();

  // Find the most recent active contact event from this recipient to this owner
  // that still has SMS quota remaining.
  const { data: event, error: eventError } = await db
    .from("contact_events")
    .select("id, sms_sent_count, expires_at, visitor_phone")
    .eq("visitor_id", body.recipient_id)
    .eq("owner_id", user.id)
    .gt("expires_at", new Date().toISOString())
    .lt("sms_sent_count", MAX_PER_EVENT)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (eventError) {
    return Response.json({ error: eventError.message }, { status: 500 });
  }

  if (!event || !event.visitor_phone) {
    return Response.json({ error: "no_active_contact" }, { status: 403 });
  }

  // Verify sender has at least 1 SMS credit. Decrement happens on admin
  // approval, but soft-check here so we can fail fast.
  const { data: balance } = await db
    .from("balances")
    .select("sms_remaining")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!balance || (balance.sms_remaining ?? 0) < 1) {
    return Response.json({ error: "no_credit" }, { status: 402 });
  }

  const { data: inserted, error: insertError } = await db
    .from("sms_outbound")
    .insert({
      sender_id: user.id,
      recipient_id: body.recipient_id,
      recipient_phone: event.visitor_phone,
      contact_event_id: event.id,
      message,
      status: "pending",
    })
    .select("id, created_at, status")
    .single();

  if (insertError) {
    return Response.json({ error: insertError.message }, { status: 500 });
  }

  return Response.json({ ok: true, draft: inserted }, { status: 201 });
}

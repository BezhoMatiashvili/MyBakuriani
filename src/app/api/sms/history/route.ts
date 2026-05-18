import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { SENDER_ROLES, type SenderRole } from "@/lib/sms/audience";

export const runtime = "nodejs";

export type SmsHistoryItem = {
  id: string;
  kind: "broadcast" | "automation" | "contact";
  audience: string | null;
  automation_kind: string | null;
  recipient_count: number;
  message: string;
  status: string;
  created_at: string;
};

export async function GET() {
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

  const db = createServiceClient();

  const [broadcastsRes, contactsRes] = await Promise.all([
    db
      .from("sms_broadcasts")
      .select("id, audience, recipient_count, message, status, created_at")
      .eq("sender_id", user.id)
      .order("created_at", { ascending: false })
      .limit(25),
    db
      .from("sms_outbound")
      .select(
        "id, automation_kind, message, status, created_at, broadcast_id, recipient_phone",
      )
      .eq("sender_id", user.id)
      .is("broadcast_id", null)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  if (broadcastsRes.error) {
    return Response.json(
      { error: broadcastsRes.error.message },
      { status: 500 },
    );
  }
  if (contactsRes.error) {
    return Response.json({ error: contactsRes.error.message }, { status: 500 });
  }

  const items: SmsHistoryItem[] = [
    ...(broadcastsRes.data ?? []).map((b) => ({
      id: b.id,
      kind: "broadcast" as const,
      audience: b.audience,
      automation_kind: null,
      recipient_count: b.recipient_count,
      message: b.message,
      status: b.status,
      created_at: b.created_at,
    })),
    ...(contactsRes.data ?? []).map((o) => ({
      id: o.id,
      kind: o.automation_kind ? ("automation" as const) : ("contact" as const),
      audience: null,
      automation_kind: o.automation_kind,
      recipient_count: 1,
      message: o.message,
      status: o.status,
      created_at: o.created_at,
    })),
  ]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 30);

  return Response.json({ items });
}

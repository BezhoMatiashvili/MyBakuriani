import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { canUseSmsCenter } from "@/lib/sms/sender-access";
import type { Tables } from "@/lib/types/database";

export const runtime = "nodejs";

export type SmsOutboxRow = Pick<
  Tables<"sms_outbound">,
  | "id"
  | "recipient_id"
  | "recipient_phone"
  | "message"
  | "status"
  | "admin_notes"
  | "reviewed_at"
  | "sent_at"
  | "created_at"
> & {
  recipient_name: string | null;
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

  if (!(await canUseSmsCenter(supabase, user.id, profile?.role))) {
    return Response.json({ error: "role_not_allowed" }, { status: 403 });
  }

  const db = createServiceClient();
  const { data: rows, error } = await db
    .from("sms_outbound")
    .select(
      "id, recipient_id, recipient_phone, message, status, admin_notes, reviewed_at, sent_at, created_at",
    )
    .eq("sender_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const recipientIds = Array.from(
    new Set(
      (rows ?? []).map((r) => r.recipient_id).filter(Boolean) as string[],
    ),
  );
  let nameById = new Map<string, string | null>();
  if (recipientIds.length > 0) {
    const { data: profiles } = await db
      .from("profiles")
      .select("id, display_name")
      .in("id", recipientIds);
    nameById = new Map(
      (profiles ?? []).map((p) => [p.id, p.display_name ?? null]),
    );
  }

  const outbox: SmsOutboxRow[] = (rows ?? []).map((r) => ({
    ...r,
    recipient_name: r.recipient_id
      ? (nameById.get(r.recipient_id) ?? null)
      : null,
  }));

  return Response.json({ outbox });
}

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { canUseSmsCenter } from "@/lib/sms/sender-access";
import { isSmsFeatureEnabled } from "@/lib/sms/feature-flags";

export const runtime = "nodejs";

export type SmsHistoryItem = {
  id: string;
  kind: "automation";
  automation_kind: string | null;
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

  if (
    !isSmsFeatureEnabled("SMS_RENTAL_MODE", user.id) ||
    !(await canUseSmsCenter(supabase, user.id))
  ) {
    return Response.json({ error: "role_not_allowed" }, { status: 403 });
  }

  const db = createServiceClient();

  const historyRes = await db
    .from("sms_outbound")
    .select("id, automation_kind, message, status, created_at")
    .eq("sender_id", user.id)
    .in("automation_kind", ["check_in", "review_request", "win_back"])
    .order("created_at", { ascending: false })
    .limit(30);

  if (historyRes.error) {
    return Response.json({ error: historyRes.error.message }, { status: 500 });
  }

  const items: SmsHistoryItem[] = (historyRes.data ?? []).map((row) => ({
    id: row.id,
    kind: "automation",
    automation_kind: row.automation_kind,
    message: row.message.replace(/https?:\/\/\S+\/review\/\S+/gu, "[secure review link]"),
    status: row.status,
    created_at: row.created_at,
  }));

  return Response.json({ items });
}

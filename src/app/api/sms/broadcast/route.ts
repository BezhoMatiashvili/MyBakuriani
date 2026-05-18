import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  SENDER_ROLES,
  isValidAudienceForRole,
  type SenderRole,
} from "@/lib/sms/audience";

export const runtime = "nodejs";

type Body = {
  audience?: string;
  message?: string;
};

const ERROR_MAP: Record<string, { status: number; key: string }> = {
  "empty audience": { status: 400, key: "empty_audience" },
  "invalid message length": { status: 400, key: "message_length" },
  "insufficient credit": { status: 402, key: "no_credit" },
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
    .select("role, display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.role || !SENDER_ROLES.has(profile.role as SenderRole)) {
    return Response.json({ error: "role_not_allowed" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.audience || !body.message) {
    return Response.json({ error: "missing_params" }, { status: 400 });
  }
  if (!isValidAudienceForRole(body.audience, profile.role)) {
    return Response.json({ error: "invalid_audience" }, { status: 400 });
  }

  const message = body.message.trim();
  if (message.length < 1 || message.length > 320) {
    return Response.json({ error: "message_length" }, { status: 400 });
  }

  const db = createServiceClient();
  const { data, error } = await db.rpc("sms_send_broadcast", {
    p_sender_id: user.id,
    p_audience: body.audience,
    p_message: message,
  });

  if (error) {
    const mapped = Object.entries(ERROR_MAP).find(([needle]) =>
      error.message.includes(needle),
    );
    if (mapped) {
      return Response.json(
        { error: mapped[1].key },
        { status: mapped[1].status },
      );
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  const result = data as { broadcast_id: string; recipient_count: number };

  await db.from("notifications").insert({
    user_id: user.id,
    type: "sms_broadcast_pending",
    title: "SMS დაგზავნა მოლოდინში",
    message: `${result.recipient_count} SMS ექვემდებარება ადმინისტრატორის შემოწმებას`,
    action_url: "/dashboard/sms",
  });

  return Response.json({ ok: true, ...result });
}

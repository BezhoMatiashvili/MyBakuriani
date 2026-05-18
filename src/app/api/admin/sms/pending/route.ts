import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/types/database";

export const runtime = "nodejs";

export type AdminPendingSms = Pick<
  Tables<"sms_outbound">,
  | "id"
  | "sender_id"
  | "recipient_id"
  | "recipient_phone"
  | "message"
  | "status"
  | "created_at"
> & {
  sender_name: string | null;
  sender_role: Tables<"profiles">["role"] | null;
  recipient_name: string | null;
  channel: Tables<"contact_events">["channel"] | null;
  contact_event_created_at: string | null;
};

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const status = req.nextUrl.searchParams.get("status") ?? "pending";
  if (!["pending", "approved", "rejected", "sent", "failed"].includes(status)) {
    return Response.json({ error: "bad_status" }, { status: 400 });
  }

  const db = createServiceClient();
  const { data: rows, error } = await db
    .from("sms_outbound")
    .select(
      "id, sender_id, recipient_id, recipient_phone, message, status, created_at, contact_event_id",
    )
    .eq("status", status as Tables<"sms_outbound">["status"])
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const userIds = Array.from(
    new Set(
      (rows ?? []).flatMap(
        (r) => [r.sender_id, r.recipient_id].filter(Boolean) as string[],
      ),
    ),
  );
  const eventIds = Array.from(
    new Set(
      (rows ?? [])
        .map((r) => r.contact_event_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  );

  const [{ data: profiles }, { data: events }] = await Promise.all([
    userIds.length > 0
      ? db.from("profiles").select("id, display_name, role").in("id", userIds)
      : Promise.resolve({ data: [] }),
    eventIds.length > 0
      ? db
          .from("contact_events")
          .select("id, channel, created_at")
          .in("id", eventIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const eventById = new Map((events ?? []).map((e) => [e.id, e]));

  const enriched: AdminPendingSms[] = (rows ?? []).map((r) => {
    const sender = profileById.get(r.sender_id);
    const recipient = r.recipient_id ? profileById.get(r.recipient_id) : null;
    const event = r.contact_event_id ? eventById.get(r.contact_event_id) : null;
    return {
      id: r.id,
      sender_id: r.sender_id,
      sender_name: sender?.display_name ?? null,
      sender_role: sender?.role ?? null,
      recipient_id: r.recipient_id,
      recipient_name: recipient?.display_name ?? null,
      recipient_phone: r.recipient_phone,
      message: r.message,
      status: r.status,
      created_at: r.created_at,
      channel: event?.channel ?? null,
      contact_event_created_at: event?.created_at ?? null,
    };
  });

  return Response.json({ rows: enriched });
}

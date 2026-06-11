import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Body = {
  sms_id?: string;
  broadcast_id?: string;
  action?: "approve" | "reject";
  admin_notes?: string | null;
};

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.action || (!body.sms_id && !body.broadcast_id)) {
    return Response.json({ error: "missing_params" }, { status: 400 });
  }

  if (body.action !== "approve" && body.action !== "reject") {
    return Response.json({ error: "bad_action" }, { status: 400 });
  }

  const db = createServiceClient(guard.admin.userId);

  if (body.broadcast_id) {
    return moderateBroadcast(db, guard.admin.userId, body);
  }

  if (!body.sms_id) {
    return Response.json({ error: "missing_sms_id" }, { status: 400 });
  }

  const { data: sms, error: fetchError } = await db
    .from("sms_outbound")
    .select(
      "id, sender_id, recipient_id, recipient_phone, message, status, contact_event_id",
    )
    .eq("id", body.sms_id)
    .maybeSingle();

  if (fetchError) {
    return Response.json({ error: fetchError.message }, { status: 500 });
  }
  if (!sms) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (sms.status !== "pending") {
    return Response.json({ error: "already_reviewed" }, { status: 409 });
  }

  const reviewedAt = new Date().toISOString();

  if (body.action === "reject") {
    const { error } = await db
      .from("sms_outbound")
      .update({
        status: "rejected",
        admin_notes: body.admin_notes ?? null,
        reviewed_by: guard.admin.userId,
        reviewed_at: reviewedAt,
      })
      .eq("id", sms.id)
      .eq("status", "pending");

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Notify the sender that their SMS was rejected.
    await db.from("notifications").insert({
      user_id: sms.sender_id,
      type: "sms_rejected",
      title: "SMS უარყოფილია",
      message: body.admin_notes
        ? `SMS გაგზავნა უარყოფილია: ${body.admin_notes}`
        : "SMS გაგზავნა უარყოფილია ადმინისტრატორის მიერ.",
      action_url: "/dashboard/sms",
    });

    return Response.json({ ok: true, status: "rejected" });
  }

  // approve path: decrement credit + bump event counter inside the RPC
  const { error: consumeError } = await db.rpc("sms_consume_credit", {
    p_sender_id: sms.sender_id,
    p_sms_id: sms.id,
  });

  if (consumeError) {
    return Response.json(
      { error: consumeError.message, code: "consume_failed" },
      { status: 400 },
    );
  }

  const { error: updateError } = await db
    .from("sms_outbound")
    .update({
      status: "approved",
      admin_notes: body.admin_notes ?? null,
      reviewed_by: guard.admin.userId,
      reviewed_at: reviewedAt,
    })
    .eq("id", sms.id);

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  await db.from("notifications").insert({
    user_id: sms.sender_id,
    type: "sms_approved",
    title: "SMS დადასტურდა",
    message: `SMS გაიგზავნება მიმღებთან ${sms.recipient_phone}.`,
    action_url: "/dashboard/sms",
  });

  return Response.json({ ok: true, status: "approved" });
}

type ServiceClient = ReturnType<typeof createServiceClient>;

async function moderateBroadcast(
  db: ServiceClient,
  adminId: string,
  body: Body,
): Promise<Response> {
  const broadcastId = body.broadcast_id!;
  const { data: broadcast, error: fetchError } = await db
    .from("sms_broadcasts")
    .select("id, sender_id, recipient_count, status")
    .eq("id", broadcastId)
    .maybeSingle();

  if (fetchError) {
    return Response.json({ error: fetchError.message }, { status: 500 });
  }
  if (!broadcast) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (broadcast.status !== "pending") {
    return Response.json({ error: "already_reviewed" }, { status: 409 });
  }

  const reviewedAt = new Date().toISOString();

  if (body.action === "reject") {
    const { error: updErr } = await db
      .from("sms_outbound")
      .update({
        status: "rejected",
        admin_notes: body.admin_notes ?? null,
        reviewed_by: adminId,
        reviewed_at: reviewedAt,
      })
      .eq("broadcast_id", broadcastId)
      .eq("status", "pending");

    if (updErr) {
      return Response.json({ error: updErr.message }, { status: 500 });
    }

    await db
      .from("sms_broadcasts")
      .update({
        status: "rejected",
        admin_notes: body.admin_notes ?? null,
        reviewed_by: adminId,
        reviewed_at: reviewedAt,
      })
      .eq("id", broadcastId);

    await db.from("notifications").insert({
      user_id: broadcast.sender_id,
      type: "sms_broadcast_rejected",
      title: "SMS დაგზავნა უარყოფილია",
      message: body.admin_notes
        ? `მიზეზი: ${body.admin_notes}`
        : "ადმინისტრატორმა უარყო თქვენი SMS დაგზავნა.",
      action_url: "/dashboard/sms",
    });

    return Response.json({ ok: true, status: "rejected" });
  }

  // approve: gather pending child rows, consume credits in bulk, flip statuses
  const { data: pendingRows, error: pendingErr } = await db
    .from("sms_outbound")
    .select("id")
    .eq("broadcast_id", broadcastId)
    .eq("status", "pending");

  if (pendingErr) {
    return Response.json({ error: pendingErr.message }, { status: 500 });
  }
  if (!pendingRows || pendingRows.length === 0) {
    return Response.json({ error: "no_pending_rows" }, { status: 409 });
  }

  const ids = pendingRows.map((r) => r.id);

  const { error: consumeErr } = await db.rpc("sms_consume_credits_bulk", {
    p_sender_id: broadcast.sender_id,
    p_sms_ids: ids,
  });

  if (consumeErr) {
    return Response.json(
      { error: consumeErr.message, code: "consume_failed" },
      { status: 400 },
    );
  }

  const { error: flipErr } = await db
    .from("sms_outbound")
    .update({
      status: "approved",
      admin_notes: body.admin_notes ?? null,
      reviewed_by: adminId,
      reviewed_at: reviewedAt,
    })
    .in("id", ids);

  if (flipErr) {
    return Response.json({ error: flipErr.message }, { status: 500 });
  }

  await db
    .from("sms_broadcasts")
    .update({
      status: "approved",
      admin_notes: body.admin_notes ?? null,
      reviewed_by: adminId,
      reviewed_at: reviewedAt,
    })
    .eq("id", broadcastId);

  await db.from("notifications").insert({
    user_id: broadcast.sender_id,
    type: "sms_broadcast_approved",
    title: "SMS დაგზავნა დადასტურდა",
    message: `${ids.length} SMS გადაიგზავნება მიმღებებთან.`,
    action_url: "/dashboard/sms",
  });

  return Response.json({
    ok: true,
    status: "approved",
    approved_count: ids.length,
  });
}

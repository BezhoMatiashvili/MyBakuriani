import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Body = {
  kind?: "property" | "service";
  id?: string;
  action?: "approve" | "reject";
  notes?: string;
};

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.id || !body.kind || !body.action) {
    return Response.json(
      { error: "kind + id + action required" },
      { status: 400 },
    );
  }
  if (body.kind !== "property" && body.kind !== "service") {
    return Response.json({ error: "invalid kind" }, { status: 400 });
  }

  const db = createServiceClient(guard.admin.userId);
  const table = body.kind === "property" ? "properties" : "services";
  const newStatus = body.action === "approve" ? "active" : "blocked";

  const { data: existing, error: lookupErr } = await db
    .from(table)
    .select("id, owner_id, title")
    .eq("id", body.id)
    .maybeSingle();
  if (lookupErr) {
    return Response.json({ error: lookupErr.message }, { status: 500 });
  }
  if (!existing) {
    return Response.json({ error: "listing not found" }, { status: 404 });
  }

  const update: { status: typeof newStatus; admin_notes?: string | null } = {
    status: newStatus,
  };
  if (body.action === "reject") {
    update.admin_notes = body.notes?.trim() || null;
  } else if (body.notes?.trim()) {
    update.admin_notes = body.notes.trim();
  }

  const { error: updateErr } = await db
    .from(table)
    .update(update)
    .eq("id", body.id);
  if (updateErr) {
    return Response.json({ error: updateErr.message }, { status: 500 });
  }

  const { error: notifyErr } = await db.from("notifications").insert({
    user_id: existing.owner_id,
    type: "listing_moderation",
    title:
      body.action === "approve"
        ? "თქვენი განცხადება დამტკიცდა"
        : "თქვენი განცხადება უარყოფილია",
    message: body.notes?.trim() || null,
    action_url: "/dashboard",
  });
  if (notifyErr) {
    console.error("moderate: notification insert failed", notifyErr);
  }

  return Response.json({ ok: true, status: newStatus });
}

import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Body = {
  id?: string;
  action?: "approve" | "reject";
  notes?: string;
};

// Admin verification of a company's identification code (ს/კ). Approving sets
// the org 'active' (its listings become publicly visible); rejecting records the
// reason. Mirrors /api/admin/listings/moderate (service-role + audit actor id +
// Georgian owner notification).
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.id || !body.action) {
    return Response.json({ error: "id + action required" }, { status: 400 });
  }
  if (body.action !== "approve" && body.action !== "reject") {
    return Response.json({ error: "invalid action" }, { status: 400 });
  }

  const db = createServiceClient(guard.admin.userId);

  const { data: existing, error: lookupErr } = await db
    .from("organizations")
    .select("id, owner_id, brand_name")
    .eq("id", body.id)
    .maybeSingle<{
      id: string;
      owner_id: string;
      brand_name: string | null;
    }>();
  if (lookupErr) {
    return Response.json({ error: lookupErr.message }, { status: 500 });
  }
  if (!existing) {
    return Response.json({ error: "company not found" }, { status: 404 });
  }

  const newStatus = body.action === "approve" ? "active" : "rejected";
  const update: {
    status: string;
    verified_at?: string | null;
    admin_notes?: string | null;
  } = { status: newStatus };
  if (body.action === "approve") {
    update.verified_at = new Date().toISOString();
  } else {
    update.admin_notes = body.notes?.trim() || null;
  }

  const { error: updateErr } = await db
    .from("organizations")
    .update(update)
    .eq("id", body.id);
  if (updateErr) {
    return Response.json({ error: updateErr.message }, { status: 500 });
  }

  const name = existing.brand_name?.trim() || "კომპანია";
  const notes = body.notes?.trim();
  const message =
    body.action === "approve"
      ? `კომპანია „${name}" დადასტურდა. თქვენი ობიექტები გამოქვეყნდება საჯაროდ.`
      : `კომპანია „${name}" უარყოფილია.${notes ? ` მიზეზი: ${notes}` : ""}`;

  const { error: notifyErr } = await db.from("notifications").insert({
    user_id: existing.owner_id,
    type: "company_moderation",
    title:
      body.action === "approve" ? "კომპანია დადასტურდა" : "კომპანია უარყოფილია",
    message,
    action_url: `/dashboard/seller/organizations/${body.id}`,
  });
  if (notifyErr) {
    console.error("company moderate: notification insert failed", notifyErr);
  }

  return Response.json({ ok: true, status: newStatus });
}

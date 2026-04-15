import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    action?: "approve" | "reject";
    notes?: string;
  } | null;
  if (!body?.id || !body.action) {
    return Response.json({ error: "id + action required" }, { status: 400 });
  }

  const status = body.action === "approve" ? "approved" : "rejected";
  const db = createServiceClient();

  const { data: verification, error: vErr } = await db
    .from("verifications")
    .select("id, user_id, property_id")
    .eq("id", body.id)
    .single();
  if (vErr || !verification) {
    return Response.json({ error: "verification not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { error } = await db
    .from("verifications")
    .update({
      status,
      admin_notes: body.notes ?? null,
      reviewed_by: guard.admin.userId,
      reviewed_at: now,
    })
    .eq("id", body.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // When approving, also mark the profile verified and unblock the property.
  if (body.action === "approve") {
    await db
      .from("profiles")
      .update({ is_verified: true, verified_at: now })
      .eq("id", verification.user_id);
    if (verification.property_id) {
      await db
        .from("properties")
        .update({ status: "active" })
        .eq("id", verification.property_id);
    }
  }

  // Notify owner.
  await db.from("notifications").insert({
    user_id: verification.user_id,
    type: "verification",
    title:
      body.action === "approve"
        ? "თქვენი ვერიფიკაცია დამტკიცდა"
        : "თქვენი ვერიფიკაცია უარყოფილია",
    message: body.notes ?? null,
    action_url: "/dashboard/renter",
  });

  return Response.json({ ok: true, status });
}

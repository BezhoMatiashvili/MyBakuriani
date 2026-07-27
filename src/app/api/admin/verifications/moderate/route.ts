import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { propertyTypeLabelKa } from "@/lib/notifications/listing-labels";
import { propertyViewUrl } from "@/lib/utils/listingUrls";

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
  const db = createServiceClient(guard.admin.userId);

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

  // Look up the verified property (if any) so the notification names it.
  let property: {
    title: string | null;
    type: string | null;
    is_for_sale: boolean | null;
  } | null = null;
  if (verification.property_id) {
    const { data } = await db
      .from("properties")
      .select("title, type, is_for_sale")
      .eq("id", verification.property_id)
      .maybeSingle();
    property = data;
  }

  const notes = body.notes?.trim();
  const approved = body.action === "approve";
  let message: string;
  let action_url = "/dashboard";
  if (property) {
    const name = property.title?.trim() || propertyTypeLabelKa(property.type);
    message = approved
      ? `თქვენი ობიექტი „${name}" ვერიფიცირებულია.`
      : `ობიექტის „${name}" ვერიფიკაცია უარყოფილია.${
          notes ? ` მიზეზი: ${notes}` : ""
        }`;
    if (approved && verification.property_id) {
      action_url = propertyViewUrl({
        id: verification.property_id,
        type: property.type,
        is_for_sale: property.is_for_sale,
      });
    }
  } else {
    message = approved
      ? "თქვენი ვერიფიკაცია წარმატებით დასრულდა."
      : `თქვენი ვერიფიკაცია უარყოფილია.${notes ? ` მიზეზი: ${notes}` : ""}`;
  }

  // Notify owner.
  await db.from("notifications").insert({
    user_id: verification.user_id,
    type: "verification",
    title: approved
      ? "თქვენი ვერიფიკაცია დამტკიცდა"
      : "თქვენი ვერიფიკაცია უარყოფილია",
    message,
    action_url,
    dashboard_scope: property
      ? property.is_for_sale
        ? "seller"
        : "renter"
      : null,
  });

  return Response.json({ ok: true, status });
}

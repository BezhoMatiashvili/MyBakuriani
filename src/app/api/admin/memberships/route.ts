import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export type PendingMembership = {
  id: string;
  user_id: string;
  package_id: string | null;
  amount_paid: number | null;
  created_at: string;
  expires_at: string;
  profile: {
    display_name: string | null;
    phone: string | null;
    role: string;
  } | null;
  package: {
    name: string;
    label: string | null;
  } | null;
};

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const db = createServiceClient();
  const { data, error } = await db
    .from("user_subscriptions")
    .select(
      "id, user_id, package_id, amount_paid, created_at, expires_at, profile:profiles!user_subscriptions_user_id_fkey(display_name, phone, role), package:pricing_packages!user_subscriptions_package_id_fkey(name, label)",
    )
    .eq("status", "pending_approval")
    .order("created_at", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ memberships: (data ?? []) as PendingMembership[] });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as {
    id?: string;
    action?: "approve" | "reject";
    note?: string;
  } | null;
  if (!body?.id || !body.action || !["approve", "reject"].includes(body.action)) {
    return Response.json({ error: "id + valid action required" }, { status: 400 });
  }

  const db = createServiceClient(guard.admin.userId);
  const { data, error } = await db.rpc("review_renter_membership", {
    p_subscription_id: body.id,
    p_admin_id: guard.admin.userId,
    p_action: body.action,
    p_note: body.note?.trim() || undefined,
  });

  if (error) {
    const conflict =
      error.message.includes("MEMBERSHIP_ALREADY_REVIEWED") ||
      error.message.includes("MEMBERSHIP_ALREADY_ACTIVE");
    const missing = error.message.includes("MEMBERSHIP_REQUEST_NOT_FOUND");
    return Response.json(
      { error: error.message },
      { status: missing ? 404 : conflict ? 409 : 500 },
    );
  }

  return Response.json({ result: data });
}

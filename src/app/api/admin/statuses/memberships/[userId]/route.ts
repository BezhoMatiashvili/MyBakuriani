import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/admin-statuses";
import { errorResponse, json } from "@/lib/admin-statuses-server";

// One user's membership periods (every status) for the admin drawer (C44).
// `refundable` is computed exactly as admin_change_memberships' revoke does:
// amount_paid minus the membership_refund transactions of that row.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { userId } = await params;
  if (!isUuid(userId)) return errorResponse("invalid_request");

  const db = createServiceClient();
  const [overview, subs] = await Promise.all([
    db
      .from("admin_membership_overview_v")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("user_subscriptions")
      .select(
        "id, status, starts_at, expires_at, amount_paid, created_at, reviewed_at, review_note, fb_profile_url, package:pricing_packages!user_subscriptions_package_id_fkey(code, name, label, meta)",
      )
      .eq("user_id", userId)
      .order("starts_at", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  if (overview.error || subs.error) {
    console.error(
      "[admin-statuses] membership detail failed",
      overview.error ?? subs.error,
    );
    return errorResponse("server_error");
  }
  if (!overview.data) return json({ error: "user_not_found" }, 404);

  const ids = (subs.data ?? []).map((row) => row.id);
  const refunded = new Map<string, number>();
  if (ids.length > 0) {
    const { data, error } = await db
      .from("transactions")
      .select("reference_id, amount")
      .eq("type", "membership_refund")
      .in("reference_id", ids);
    if (error) {
      console.error("[admin-statuses] refund lookup failed", error);
      return errorResponse("server_error");
    }
    for (const row of data ?? []) {
      if (!row.reference_id) continue;
      refunded.set(
        row.reference_id,
        (refunded.get(row.reference_id) ?? 0) + Number(row.amount ?? 0),
      );
    }
  }

  const periods = (subs.data ?? []).map((row) => {
    const paid = Number(row.amount_paid ?? 0);
    const back = refunded.get(row.id) ?? 0;
    return {
      ...row,
      refunded: back,
      // Same rounding as numeric in SQL: tetri.
      refundable: Math.max(0, Math.round((paid - back) * 100) / 100),
    };
  });
  return json({ user: overview.data, periods });
}

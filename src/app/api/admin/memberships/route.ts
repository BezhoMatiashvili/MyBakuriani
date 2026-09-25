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
  starts_at: string;
  expires_at: string;
  profile: {
    display_name: string | null;
    phone: string | null;
    role: string;
  } | null;
  package: {
    name: string;
    label: string | null;
    /** season / price_tier (2026 price list: fb_group_vip is self-declared). */
    meta: { season?: string; price_tier?: string } | null;
  } | null;
};

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const db = createServiceClient();
  const { data, error } = await db
    .from("user_subscriptions")
    .select(
      "id, user_id, package_id, amount_paid, created_at, starts_at, expires_at, profile:profiles!user_subscriptions_user_id_fkey(display_name, phone, role), package:pricing_packages!user_subscriptions_package_id_fkey(name, label, meta)",
    )
    .eq("status", "pending_approval")
    .order("created_at", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Narrow the package meta (Json) to the two keys the review page reads.
  const memberships: PendingMembership[] = (data ?? []).map((row) => {
    const meta = row.package?.meta;
    const record =
      meta && typeof meta === "object" && !Array.isArray(meta) ? meta : null;
    return {
      ...row,
      package: row.package
        ? {
            name: row.package.name,
            label: row.package.label,
            meta: record
              ? {
                  season:
                    typeof record.season === "string" ? record.season : undefined,
                  price_tier:
                    typeof record.price_tier === "string"
                      ? record.price_tier
                      : undefined,
                }
              : null,
          }
        : null,
    };
  });
  return Response.json({ memberships });
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
    // Stable tokens raised by review_renter_membership; the page localizes them.
    const code = [
      "MEMBERSHIP_ALREADY_REVIEWED",
      "MEMBERSHIP_ALREADY_ACTIVE",
      "MEMBERSHIP_SEASON_ENDED",
      "MEMBERSHIP_REQUEST_NOT_FOUND",
    ].find((token) => error.message.includes(token));
    const status =
      code === "MEMBERSHIP_REQUEST_NOT_FOUND" ? 404 : code ? 409 : 500;
    return Response.json({ error: error.message, code }, { status });
  }

  return Response.json({ result: data });
}

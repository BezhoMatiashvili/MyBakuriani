import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { listingTag } from "@/lib/data/getCachedPublicListing";
import { revalidateListingLists } from "@/lib/data/revalidateListings";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const body = await request.json().catch(() => null) as { action?: "approve" | "reject"; reason?: string } | null;
  if (!body?.action || !["approve", "reject"].includes(body.action)) return Response.json({ error: "invalid_action" }, { status: 400 });
  if (body.action === "reject" && !body.reason?.trim()) return Response.json({ error: "rejection_reason_required" }, { status: 400 });
  const rejectionReason = body.reason?.trim();
  const db = createServiceClient(guard.admin.userId);
  if (body.action === "approve") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any).rpc("approve_content_change_request", { p_request_id: id, p_admin_id: guard.admin.userId });
    if (error) return Response.json({ error: error.message }, { status: error.code === "P0001" ? 409 : 500 });
    const result = data as { status?: string; target_type?: string; target_id?: string };
    if (result.status === "approved" && result.target_id && (result.target_type === "property" || result.target_type === "service")) {
      revalidateTag(listingTag(result.target_type, result.target_id));
      revalidateListingLists(result.target_type);
    }
    return Response.json({ result });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pending, error: lookupError } = await (db as any).from("content_change_requests").select("requester_id").eq("id", id).eq("status", "pending").maybeSingle();
  if (lookupError) return Response.json({ error: lookupError.message }, { status: 500 });
  if (!pending) return Response.json({ error: "request_not_pending" }, { status: 409 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from("content_change_requests").update({ status: "rejected", rejection_reason: rejectionReason, reviewed_by: guard.admin.userId, reviewed_at: new Date().toISOString() }).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from("notifications").insert({ user_id: pending.requester_id, type: "content_change_rejected", title: "ცვლილება უარყოფილია", message: rejectionReason, action_url: "/dashboard" });
  return Response.json({ result: { status: "rejected" } });
}

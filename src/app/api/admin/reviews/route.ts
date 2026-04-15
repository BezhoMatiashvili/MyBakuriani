import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const status = req.nextUrl.searchParams.get("status");
  const db = createServiceClient();
  let query = db
    .from("reviews")
    .select(
      "*, guest:profiles!reviews_guest_id_fkey(display_name, phone), property:properties!reviews_property_id_fkey(title)",
    )
    .order("created_at", { ascending: false });

  if (status && ["pending", "approved", "hidden", "removed"].includes(status)) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ reviews: data ?? [] });
}

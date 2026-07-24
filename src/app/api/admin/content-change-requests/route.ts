import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const status = new URL(request.url).searchParams.get("status") ?? "pending";
  const db = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (db as any).from("content_change_requests").select("*").order("created_at", { ascending: false });
  if (status !== "all") query = query.eq("status", status);
  const { data: items, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const requesterIds = [...new Set((items ?? []).map((item: { requester_id: string }) => item.requester_id))];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: requesters } = requesterIds.length ? await (db as any).from("profiles").select("id, display_name, role, phone, avatar_url").in("id", requesterIds) : { data: [] };
  const byId = Object.fromEntries((requesters ?? []).map((profile: { id: string }) => [profile.id, profile]));
  return Response.json({ items: (items ?? []).map((item: { requester_id: string }) => ({ ...item, requester: byId[item.requester_id] ?? null })) });
}

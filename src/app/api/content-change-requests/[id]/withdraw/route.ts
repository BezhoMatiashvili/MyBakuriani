import { getCurrentUser } from "@/lib/auth/current-user";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  const db = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from("content_change_requests")
    .update({ status: "withdrawn", withdrawn_at: new Date().toISOString() })
    .eq("id", id).eq("requester_id", user.id).eq("status", "pending")
    .select("id, status").maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "request_not_pending" }, { status: 409 });
  return Response.json({ request: data });
}

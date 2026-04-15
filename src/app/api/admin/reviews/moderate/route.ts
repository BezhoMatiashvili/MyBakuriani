import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Action = "approve" | "hide" | "remove";

const STATUS_MAP: Record<Action, string> = {
  approve: "approved",
  hide: "hidden",
  remove: "removed",
};

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as {
    id?: string;
    action?: Action;
    notes?: string;
  } | null;

  if (!body?.id || !body.action || !(body.action in STATUS_MAP)) {
    return Response.json(
      { error: "id + action (approve|hide|remove) required" },
      { status: 400 },
    );
  }

  const db = createServiceClient();
  const { error } = await db
    .from("reviews")
    .update({
      status: STATUS_MAP[body.action],
      moderation_notes: body.notes ?? null,
      moderated_by: guard.admin.userId,
      moderated_at: new Date().toISOString(),
    })
    .eq("id", body.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, status: STATUS_MAP[body.action] });
}

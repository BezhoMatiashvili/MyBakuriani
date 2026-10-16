import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { json } from "@/lib/admin-statuses-server";
import { isUuid, parseGroupInput } from "@/lib/user-groups";
import { dbFailure, errorResponse } from "@/lib/user-groups-server";

// One group: edit (PATCH, the full desired state) and delete (C52).

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!isUuid(id)) return errorResponse("invalid_id");
  const parsed = parseGroupInput(await req.json().catch(() => null));
  if (!parsed.ok) return errorResponse(parsed.error);
  const { name, note, payerId, memberIds } = parsed.value;

  const db = createServiceClient(guard.admin.userId);
  const { data, error, status } = await db.rpc("admin_save_user_group", {
    p_admin_id: guard.admin.userId,
    p_group_id: id,
    p_name: name,
    p_note: note,
    p_payer_id: payerId,
    p_member_ids: memberIds,
  });
  if (error) return dbFailure(error, "group edit", status);
  const saved = (data as { id?: string } | null)?.id;
  if (!saved) return dbFailure({ message: "no id returned" }, "group edit");
  return json({ id: saved });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!isUuid(id)) return errorResponse("invalid_id");

  // The members go with the group (ON DELETE CASCADE); nobody's verification
  // changes. `.select("id")` returns the deleted rows, so none = unknown id.
  const db = createServiceClient(guard.admin.userId);
  const { data, error, status } = await db
    .from("user_groups")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return dbFailure(error, "group delete", status);
  if (!data?.length) return errorResponse("not_found");
  return json({ ok: true });
}

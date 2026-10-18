import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  financeErrorResponse,
  isUuidValue,
  jsonError,
} from "@/lib/finance/server/http";

export const runtime = "nodejs";

// DELETE /api/admin/finance/invoice-templates/[id] — a preset, not a record.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!isUuidValue(id)) return jsonError("not_found", 404);
  const { data, error } = await createServiceClient(guard.admin.userId)
    .from("invoice_templates")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return financeErrorResponse(error, "template delete");
  if (!data?.length) return jsonError("not_found", 404);
  return Response.json({ ok: true });
}

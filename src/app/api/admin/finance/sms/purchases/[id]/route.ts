import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  financeErrorResponse,
  isUuidValue,
  jsonError,
  readJsonObject,
  readOneOf,
  requireText,
} from "@/lib/finance/server/http";

export const runtime = "nodejs";

// POST /api/admin/finance/sms/purchases/[id] {action: "void", reason} — a
// package entered by mistake stops counting: its Finances expense is reversed
// (or an existing reversal linked) by finance_void_sms_purchase (C50, C42).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!isUuidValue(id)) return jsonError("FINANCE_ENTRY_NOT_FOUND", 404);
  const body = await readJsonObject(request);
  if (!body) return jsonError("invalid_request", 400);

  try {
    readOneOf(body.action, ["void"] as const, "action");
    const { data, error } = await createServiceClient(guard.admin.userId).rpc(
      "finance_void_sms_purchase",
      {
        p_actor: guard.admin.userId,
        p_id: id,
        p_reason: requireText(body.reason, "reason", 1000),
      },
    );
    if (error) throw error;
    return Response.json(data);
  } catch (error) {
    return financeErrorResponse(error, `sms purchase ${id}`);
  }
}

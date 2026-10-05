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

// POST /api/admin/finance/expenses/[id] {action: "reverse", note} — a
// reversal row that mirrors the expense (finance_expenses_guard copies every
// field); expenses are never edited or deleted (C42, spec §14).
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
  const db = createServiceClient(guard.admin.userId);

  try {
    readOneOf(body.action, ["reverse"] as const, "action");
    const note = requireText(body.note, "note", 1000);
    const { data: original, error } = await db
      .from("finance_expenses")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!original) return jsonError("FINANCE_ENTRY_NOT_FOUND", 404);
    const { data, error: insertError } = await db
      .from("finance_expenses")
      .insert({
        kind: "reversal",
        reverses_id: original.id,
        expense_date: original.expense_date,
        supplier_name: original.supplier_name,
        category: original.category,
        amount: original.amount,
        payment_method: original.payment_method,
        note,
        created_by: guard.admin.userId,
      })
      .select("id, expense_no")
      .single();
    if (insertError) throw insertError;
    return Response.json(data, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, `expense ${id}`);
  }
}

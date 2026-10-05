import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  EXPENSE_CATEGORIES,
  MAX_ENTRY_AMOUNT,
  PAYMENT_METHODS,
} from "@/lib/finance/constants";
import { parseFinanceFilters } from "@/lib/finance/filters";
import { listExpenses } from "@/lib/finance/server/data";
import {
  FinanceInputError,
  financeErrorResponse,
  jsonError,
  readDate,
  readJsonObject,
  readMoney,
  readOneOf,
  readText,
  requireText,
} from "@/lib/finance/server/http";
import { FILTER_LISTS } from "@/lib/finance/server/reports";

export const runtime = "nodejs";

// The expenses register (spec §11, C42). Rows are append-only; a mistake is
// corrected with POST /api/admin/finance/expenses/[id] {action: "reverse"}.

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const params = new URL(request.url).searchParams;
  try {
    const filters = parseFinanceFilters(params, FILTER_LISTS.expenses);
    return Response.json(await listExpenses(createServiceClient(), filters));
  } catch (error) {
    return financeErrorResponse(error, "expenses list");
  }
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const body = await readJsonObject(request);
  if (!body) return jsonError("invalid_request", 400);

  try {
    const amount = readMoney(body.amount, "amount", {
      min: 0.01,
      max: MAX_ENTRY_AMOUNT,
    });
    const vat =
      body.vat_amount === null ||
      body.vat_amount === undefined ||
      body.vat_amount === ""
        ? 0
        : readMoney(body.vat_amount, "vat", { max: amount });
    if (vat > amount) throw new FinanceInputError("invalid_vat");
    const { data, error } = await createServiceClient(guard.admin.userId)
      .from("finance_expenses")
      .insert({
        expense_date: readDate(body.expense_date, "date"),
        supplier_name: requireText(body.supplier_name, "supplier", 200),
        supplier_tax_id: readText(body.supplier_tax_id, "tax_id", 50),
        category: readOneOf(body.category, EXPENSE_CATEGORIES, "category"),
        document_number: readText(body.document_number, "document_number", 100),
        amount,
        vat_amount: vat,
        payment_method: readOneOf(
          body.payment_method,
          PAYMENT_METHODS,
          "method",
        ),
        note: readText(body.note, "note", 1000),
        created_by: guard.admin.userId,
      })
      .select("id, expense_no")
      .single();
    if (error) throw error;
    return Response.json(data, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "expense create");
  }
}

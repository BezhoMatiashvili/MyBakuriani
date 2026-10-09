import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { MAX_ENTRY_AMOUNT, PAYMENT_METHODS } from "@/lib/finance/constants";
import { MAX_SMS_UNITS } from "@/lib/finance/sms";
import {
  FinanceInputError,
  financeErrorResponse,
  jsonError,
  readDate,
  readJsonObject,
  readMoney,
  readOneOf,
  readText,
} from "@/lib/finance/server/http";
import { loadSmsPurchases } from "@/lib/finance/server/sms";

export const runtime = "nodejs";

// The uBill packages bought by hand (C50, spec §3: no uBill integration).
// GET lists them with how much of each FIFO has used; POST records one and
// books it as a Finances expense in the same transaction
// (finance_record_sms_purchase). A wrong one is voided, never edited.

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    return Response.json(
      { rows: await loadSmsPurchases(createServiceClient()) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return financeErrorResponse(error, "sms purchases");
  }
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const body = await readJsonObject(request);
  if (!body) return jsonError("invalid_request", 400);

  try {
    const units = Number(body.units);
    if (!Number.isInteger(units) || units < 1 || units > MAX_SMS_UNITS) {
      throw new FinanceInputError("invalid_units");
    }
    const { data, error } = await createServiceClient(guard.admin.userId).rpc(
      "finance_record_sms_purchase",
      {
        p_actor: guard.admin.userId,
        p_date: readDate(body.purchased_on, "date"),
        p_units: units,
        p_amount: readMoney(body.amount, "amount", {
          min: 0.01,
          max: MAX_ENTRY_AMOUNT,
        }),
        p_invoice_ref:
          readText(body.invoice_ref, "document_number", 100) ?? undefined,
        p_comment: readText(body.comment, "note", 1000) ?? undefined,
        p_payment_method: readOneOf(
          body.payment_method ?? "bank_transfer",
          PAYMENT_METHODS,
          "method",
        ),
      },
    );
    if (error) throw error;
    return Response.json(data, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "sms purchase");
  }
}

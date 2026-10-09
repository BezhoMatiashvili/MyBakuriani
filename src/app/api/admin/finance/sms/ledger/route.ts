import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { SMS_LEDGER_PAGE_SIZE, parseSmsFilters } from "@/lib/finance/sms";
import { financeErrorResponse, jsonError } from "@/lib/finance/server/http";
import { loadSmsLedger } from "@/lib/finance/server/sms";

export const runtime = "nodejs";

// GET /api/admin/finance/sms/ledger?from&to&type&status&page — every SMS
// MyBakuriani sent, newest first, with its billed units, FIFO cost and
// revenue (C50, spec §4). 50 per page.
export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const params = new URL(request.url).searchParams;
  const parsed = parseSmsFilters(params);
  if (!parsed.ok) return jsonError(parsed.error, 400);
  const page = Math.max(1, Math.min(10_000, Number(params.get("page")) || 1));
  try {
    const result = await loadSmsLedger(
      createServiceClient(),
      parsed.filters,
      SMS_LEDGER_PAGE_SIZE,
      (page - 1) * SMS_LEDGER_PAGE_SIZE,
    );
    return Response.json(
      { ...result, page, pageSize: SMS_LEDGER_PAGE_SIZE },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return financeErrorResponse(error, "sms ledger");
  }
}

import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { parseSmsFilters } from "@/lib/finance/sms";
import { financeErrorResponse, jsonError } from "@/lib/finance/server/http";
import { loadSmsSummary } from "@/lib/finance/server/sms";

export const runtime = "nodejs";

// GET /api/admin/finance/sms?from&to&type&status — the SMS control page's
// KPIs, type table and balance (C50, spec §5-§7). One SQL definition:
// admin_sms_finance_summary(), which first syncs the SMS ledger.
export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const parsed = parseSmsFilters(new URL(request.url).searchParams);
  if (!parsed.ok) return jsonError(parsed.error, 400);
  try {
    const summary = await loadSmsSummary(createServiceClient(), parsed.filters);
    return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return financeErrorResponse(error, "sms summary");
  }
}

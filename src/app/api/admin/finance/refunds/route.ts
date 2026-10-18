import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { parseFinanceFilters } from "@/lib/finance/filters";
import { listRefunds } from "@/lib/finance/server/data";
import { financeErrorResponse } from "@/lib/finance/server/http";
import { FILTER_LISTS } from "@/lib/finance/server/reports";

export const runtime = "nodejs";

// GET /api/admin/finance/refunds?<filters>&page= — the refunds register
// (spec §5) from finance_refunds_v: Keepz refunds, manual refunds and
// payments refunded on Keepz's side (C42).
export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const params = new URL(request.url).searchParams;
  try {
    const filters = parseFinanceFilters(params, FILTER_LISTS.refunds);
    return Response.json(await listRefunds(createServiceClient(), filters));
  } catch (error) {
    return financeErrorResponse(error, "refunds list");
  }
}

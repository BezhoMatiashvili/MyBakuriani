import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { parseFinanceFilters } from "@/lib/finance/filters";
import { listPayments } from "@/lib/finance/server/data";
import { financeErrorResponse } from "@/lib/finance/server/http";
import { FILTER_LISTS } from "@/lib/finance/server/reports";

export const runtime = "nodejs";

// GET /api/admin/finance/payments?view=journal|registry&<filters>&page=
// The revenue journal (spec §2: money received) or the payments register
// (spec §4: every attempt), both from finance_payments_v (C42).
export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const params = new URL(request.url).searchParams;
  const view = params.get("view") === "registry" ? "registry" : "journal";
  try {
    const filters = parseFinanceFilters(params, FILTER_LISTS.payments);
    return Response.json(
      await listPayments(createServiceClient(), filters, view),
    );
  } catch (error) {
    return financeErrorResponse(error, "payments list");
  }
}

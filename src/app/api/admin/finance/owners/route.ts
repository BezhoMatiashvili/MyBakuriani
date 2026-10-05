import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { financeErrorResponse } from "@/lib/finance/server/http";

export const runtime = "nodejs";

// GET /api/admin/finance/owners — third-party money per owner (spec §6):
// collected, refunded, paid out and still owed, from
// finance_owner_payables() (C42). Payouts are listed by
// /api/admin/finance/entries?kind=owner_payout.
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { data, error } = await createServiceClient().rpc(
    "finance_owner_payables",
  );
  if (error) return financeErrorResponse(error, "owner payables");
  const rows = [...(data ?? [])].sort((a, b) => b.outstanding - a.outstanding);
  return Response.json({ rows });
}

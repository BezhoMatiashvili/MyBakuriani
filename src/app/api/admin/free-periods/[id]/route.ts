import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/admin-statuses";
import {
  parseFreePeriodPatch,
  tbilisiToday,
  type FreePeriodRow,
} from "@/lib/free-periods";
import {
  FREE_PERIOD_SELECT,
  applyPeriod,
  dbErrorResponse,
  errorResponse,
  json,
  loadViews,
  withinRateLimit,
} from "@/lib/free-periods-server";

// Edit one free period (C53): name, registration window, end date, roles,
// max listings, paused or not. The benefit never changes and an ended period
// keeps its end date (also enforced by the free_periods_guard trigger). Saving a
// running period re-runs its sweep: a new end date re-dates the live grants, a
// wider window or role list grants the people who now qualify. Nothing is revoked.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const adminId = guard.admin.userId;
  if (!(await withinRateLimit(adminId))) return errorResponse("rate_limited");
  const { id } = await ctx.params;
  if (!isUuid(id)) return errorResponse("invalid_id");

  const db = createServiceClient(adminId);
  const { data: current, error: readError } = await db
    .from("free_periods")
    .select(FREE_PERIOD_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (readError) return dbErrorResponse(readError, "read");
  if (!current) return errorResponse("not_found");
  const row = current as unknown as FreePeriodRow;

  const parsed = parseFreePeriodPatch(
    await req.json().catch(() => null),
    tbilisiToday(),
    row,
  );
  if (!parsed.ok) return errorResponse(parsed.error);

  const { error } = await db
    .from("free_periods")
    .update(parsed.args)
    .eq("id", id);
  if (error) return dbErrorResponse(error, "update");

  // The edit is saved either way; if this sweep fails the cron runs it.
  let apply = null;
  if (parsed.args.is_active ?? row.is_active) {
    const applied = await applyPeriod(adminId, id);
    if ("result" in applied) apply = applied.result;
  }

  const loaded = await loadViews(adminId);
  if ("response" in loaded) return loaded.response;
  return json({
    period: loaded.views.find((view) => view.id === id) ?? null,
    apply,
  });
}

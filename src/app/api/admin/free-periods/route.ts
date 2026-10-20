import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  parseFreePeriodCreate,
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

// Admin free periods (C53): list with counters, and create. Creating an active
// period runs its first sweep at once (people who already registered inside the
// window get the benefit now; the 5-minute cron and the registration trigger
// cover everyone after that).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const loaded = await loadViews(guard.admin.userId);
  if ("response" in loaded) return loaded.response;
  return json({ periods: loaded.views });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const adminId = guard.admin.userId;
  if (!(await withinRateLimit(adminId))) return errorResponse("rate_limited");

  const parsed = parseFreePeriodCreate(
    await req.json().catch(() => null),
    tbilisiToday(),
  );
  if (!parsed.ok) return errorResponse(parsed.error);

  const { data, error } = await createServiceClient(adminId)
    .from("free_periods")
    .insert({ ...parsed.args, created_by: adminId })
    .select(FREE_PERIOD_SELECT)
    .single();
  if (error) return dbErrorResponse(error, "create");
  const row = data as unknown as FreePeriodRow;

  // The period is saved either way; if this first sweep fails the cron runs it.
  let apply = null;
  if (row.is_active) {
    const applied = await applyPeriod(adminId, row.id);
    if ("result" in applied) apply = applied.result;
  }

  const loaded = await loadViews(adminId);
  if ("response" in loaded) return loaded.response;
  return json(
    { period: loaded.views.find((view) => view.id === row.id) ?? null, apply },
    201,
  );
}

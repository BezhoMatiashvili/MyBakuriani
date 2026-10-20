import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isUuid } from "@/lib/admin-statuses";
import {
  applyPeriod,
  errorResponse,
  json,
  loadViews,
  withinRateLimit,
} from "@/lib/free-periods-server";

// "Apply now" (C53): runs the period's sweep immediately instead of waiting for
// the 5-minute cron. Idempotent; a paused or ended period answers with its state.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: RouteContext) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const adminId = guard.admin.userId;
  if (!(await withinRateLimit(adminId))) return errorResponse("rate_limited");
  const { id } = await ctx.params;
  if (!isUuid(id)) return errorResponse("invalid_id");

  const applied = await applyPeriod(adminId, id);
  if ("response" in applied) return applied.response;

  const loaded = await loadViews(adminId);
  if ("response" in loaded) return loaded.response;
  return json({
    period: loaded.views.find((view) => view.id === id) ?? null,
    apply: applied.result,
  });
}

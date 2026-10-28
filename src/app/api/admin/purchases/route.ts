import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  PURCHASE_PERIODS,
  PURCHASE_SERVICES,
  type PurchasePeriod,
} from "@/lib/admin-purchases";
import { isOneOf } from "@/lib/analytics/model";
import {
  addDays,
  dayEndExclusive,
  dayStart,
  monthStart,
  tbilisiToday,
} from "@/lib/finance/filters";
import { checkRateLimit } from "@/lib/rateLimit";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Admin purchases (C42): which customer bought which paid service from the
 * balance. Every number comes from admin_purchases_report(); the period is a
 * range of Tbilisi days ending today, as on the finance summary.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  if (
    !(await checkRateLimit(
      `admin-purchases:${guard.admin.userId}`,
      120,
      60_000,
    ))
  ) {
    return json({ error: "rate_limited" }, 429);
  }

  const params = req.nextUrl.searchParams;
  const requested = params.get("period");
  const period: PurchasePeriod = isOneOf(PURCHASE_PERIODS, requested)
    ? requested
    : "month";
  const service = params.get("service");
  const search = (params.get("q") ?? "").trim().slice(0, 100);
  const page = Math.min(
    Math.max(Math.trunc(Number(params.get("page"))) || 0, 0),
    1000,
  );
  const today = tbilisiToday();
  const from = {
    month: monthStart(today),
    last30: addDays(today, -29),
    last90: addDays(today, -89),
    year: `${today.slice(0, 4)}-01-01`,
    all: null,
  }[period];

  const { data, error } = await createServiceClient().rpc(
    "admin_purchases_report",
    {
      ...(from ? { p_from: dayStart(from) } : {}),
      p_to: dayEndExclusive(today),
      ...(isOneOf(PURCHASE_SERVICES, service) ? { p_service: service } : {}),
      ...(search ? { p_search: search } : {}),
      p_page: page,
    },
  );
  if (error) {
    console.error("GET /api/admin/purchases failed", error.code, error.message);
    return json({ error: "load_failed" }, 500);
  }
  return json({ period, report: data });
}

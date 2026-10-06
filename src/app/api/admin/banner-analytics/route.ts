import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { addDays, isIsoDate, tbilisiToday } from "@/lib/admin-statuses";
import { isBannerPlacement } from "@/lib/banner-placements";
import { isUuid } from "@/lib/utils/uuid";
import {
  BANNER_ANALYTICS_DEFAULT_DAYS,
  BANNER_ANALYTICS_MAX_DAYS,
  isBannerSource,
  type BannerAnalytics,
} from "@/lib/banner-analytics";

export const runtime = "nodejs";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Ad & banner analytics for the admin (contract C46).
 *
 * ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive Tbilisi days; default: the last
 * 30 days), optional &source=ad|banner, &placement=<BANNER_PLACEMENTS id> and
 * &creative=<row id> (with source: one creative's own report).
 * Every number comes from the one SQL definition, admin_banner_analytics.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const params = req.nextUrl.searchParams;
  const today = tbilisiToday();
  const to = params.get("to") ?? today;
  const from =
    params.get("from") ?? addDays(to, -(BANNER_ANALYTICS_DEFAULT_DAYS - 1));
  const source = params.get("source") || null;
  const placement = params.get("placement") || null;
  const creative = params.get("creative") || null;

  if (
    !isIsoDate(from) ||
    !isIsoDate(to) ||
    from > to ||
    addDays(from, BANNER_ANALYTICS_MAX_DAYS - 1) < to
  ) {
    return json({ error: "invalid_range" }, 400);
  }
  if (source !== null && !isBannerSource(source)) {
    return json({ error: "invalid_source" }, 400);
  }
  if (placement !== null && !isBannerPlacement(placement)) {
    return json({ error: "invalid_placement" }, 400);
  }
  if (creative !== null && (!isUuid(creative) || source === null)) {
    return json({ error: "invalid_creative" }, 400);
  }

  const db = createServiceClient();
  const { data, error } = await db.rpc("admin_banner_analytics", {
    p_from: from,
    p_to: to,
    ...(source ? { p_source: source } : {}),
    ...(placement ? { p_placement: placement } : {}),
    ...(creative ? { p_creative: creative } : {}),
  });
  if (error || !data) {
    console.error("GET /api/admin/banner-analytics failed", error);
    return json({ error: "server_error" }, 500);
  }
  return json({ analytics: data as unknown as BannerAnalytics });
}

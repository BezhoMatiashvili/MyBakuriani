import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  loadBannerAnalytics,
  parseBannerAnalyticsQuery,
} from "@/lib/banner-analytics-server";

export const runtime = "nodejs";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Ad & banner analytics for the admin (contract C46).
 *
 * ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive Tbilisi days; default: the last
 * 30 days), optional &source=ad|banner, &placement=<BANNER_PLACEMENTS id> and
 * &creative=<row id> (with source: one creative's own report).
 * Every number comes from the one SQL definition, admin_banner_analytics,
 * read through the same loader as the exports (./export).
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = parseBannerAnalyticsQuery(req.nextUrl.searchParams);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  try {
    const analytics = await loadBannerAnalytics(
      createServiceClient(),
      parsed.query,
    );
    return json({ analytics });
  } catch (error) {
    console.error(
      "GET /api/admin/banner-analytics failed",
      error instanceof Error ? error.message : error,
    );
    return json({ error: "server_error" }, 500);
  }
}

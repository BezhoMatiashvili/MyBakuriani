import { NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { rotationModeFor } from "@/lib/ad-rotation";
import {
  EXPORT_FORMATS,
  EXPORT_SCOPES,
  isOneOf,
  tbilisiDateTime,
} from "@/lib/analytics/model";
import { reportFileResponse } from "@/lib/analytics/report-file";
import {
  BANNER_EXPORT_BLOCKS,
  buildBannerReport,
  isBannerSortKey,
} from "@/lib/banner-analytics";
import {
  loadBannerAnalytics,
  parseBannerAnalyticsQuery,
} from "@/lib/banner-analytics-server";
import { checkRateLimit } from "@/lib/rateLimit";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

// GET /api/admin/banner-analytics/export?block=<BANNER_EXPORT_BLOCKS>
//   &scope=filtered|full&format=xlsx|csv|pdf&sort=<BANNER_SORT_KEYS>
//   &<the page's query: from, to, source, placement, creative>
// One card of /dashboard/admin/ad-analytics (or the whole page) as Excel, CSV
// or PDF: filtered as on screen, or the same period without the type,
// placement and creative filters. Same parser and loader as the page's own
// route (C46). Always Georgian, like the other admin exports (C42, C49).
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const params = req.nextUrl.searchParams;
  const block = params.get("block");
  const scope = params.get("scope");
  const format = params.get("format");
  const sort = params.get("sort") ?? "impressions";
  if (
    !isOneOf(BANNER_EXPORT_BLOCKS, block) ||
    !isOneOf(EXPORT_SCOPES, scope) ||
    !isOneOf(EXPORT_FORMATS, format) ||
    !isBannerSortKey(sort)
  ) {
    return json({ error: "invalid_request" }, 400);
  }
  const parsed = parseBannerAnalyticsQuery(params);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  if (
    !(await checkRateLimit(
      `admin-banner-analytics-export:${guard.admin.userId}`,
      60,
      600_000,
    ))
  ) {
    return json({ error: "rate_limited" }, 429);
  }

  const query =
    scope === "full"
      ? { ...parsed.query, source: null, placement: null, creative: null }
      : parsed.query;

  try {
    const data = await loadBannerAnalytics(createServiceClient(), query);
    const t = await getTranslations({
      locale: "ka",
      namespace: "AdminAdAnalytics",
    });
    const tShared = await getTranslations({
      locale: "ka",
      namespace: "AdminShared",
    });
    const report = buildBannerReport(
      data,
      {
        block,
        scope,
        filters: {
          source: query.source,
          placement: query.placement,
          creative: query.creative,
        },
        sort,
        generatedAt: tbilisiDateTime(),
      },
      {
        t: (key, values) => t(key as never, values as never),
        placement: (id) =>
          tShared.has(`placements.${id}` as never)
            ? tShared(`placements.${id}` as never)
            : id,
        placementHeader: tShared("placement"),
        isRotation: (placement) => rotationModeFor(placement) === "rotation",
      },
    );
    return await reportFileResponse(report, format, (page, pages) =>
      t("export.page", { page, pages }),
    );
  } catch (error) {
    console.error(
      `GET /api/admin/banner-analytics/export ${block}.${format} failed`,
      error instanceof Error ? error.message : error,
    );
    return json({ error: "server_error" }, 500);
  }
}

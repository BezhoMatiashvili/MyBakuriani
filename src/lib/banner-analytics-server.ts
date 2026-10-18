import "server-only";
import { addDays, isIsoDate, tbilisiToday } from "@/lib/admin-statuses";
import { isBannerPlacement } from "@/lib/banner-placements";
import {
  BANNER_ANALYTICS_DEFAULT_DAYS,
  BANNER_ANALYTICS_MAX_DAYS,
  isBannerSource,
  type BannerAnalytics,
  type BannerSource,
} from "@/lib/banner-analytics";
import type { createServiceClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils/uuid";

// Ad & banner analytics (C46): the one reader of admin_banner_analytics for
// the admin page (GET /api/admin/banner-analytics) and its exports
// (GET /api/admin/banner-analytics/export), so a file holds what the page
// shows. Both routes check requireAdmin() before calling it.

type Db = ReturnType<typeof createServiceClient>;

export type BannerAnalyticsQuery = {
  /** Inclusive Tbilisi days, YYYY-MM-DD. */
  from: string;
  to: string;
  source: BannerSource | null;
  placement: string | null;
  /** One creative's own report; only together with `source`. */
  creative: string | null;
};

export type BannerAnalyticsQueryError =
  "invalid_range" | "invalid_source" | "invalid_placement" | "invalid_creative";

/**
 * ?from=YYYY-MM-DD&to=YYYY-MM-DD (default: the last 30 days), optional
 * &source=ad|banner, &placement=<BANNER_PLACEMENTS id> and &creative=<row id>
 * (with source).
 */
export function parseBannerAnalyticsQuery(
  params: URLSearchParams,
):
  | { ok: true; query: BannerAnalyticsQuery }
  | { ok: false; error: BannerAnalyticsQueryError } {
  const to = params.get("to") ?? tbilisiToday();
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
    return { ok: false, error: "invalid_range" };
  }
  if (source !== null && !isBannerSource(source)) {
    return { ok: false, error: "invalid_source" };
  }
  if (placement !== null && !isBannerPlacement(placement)) {
    return { ok: false, error: "invalid_placement" };
  }
  if (creative !== null && (!isUuid(creative) || source === null)) {
    return { ok: false, error: "invalid_creative" };
  }
  return { ok: true, query: { from, to, source, placement, creative } };
}

/** Every number from the one SQL definition; throws when the call fails. */
export async function loadBannerAnalytics(
  db: Db,
  query: BannerAnalyticsQuery,
): Promise<BannerAnalytics> {
  const { data, error } = await db.rpc("admin_banner_analytics", {
    p_from: query.from,
    p_to: query.to,
    ...(query.source ? { p_source: query.source } : {}),
    ...(query.placement ? { p_placement: query.placement } : {}),
    ...(query.creative ? { p_creative: query.creative } : {}),
  });
  if (error || !data) {
    throw new Error(
      `admin_banner_analytics failed: ${error?.message ?? "no data"}`,
    );
  }
  return data as unknown as BannerAnalytics;
}

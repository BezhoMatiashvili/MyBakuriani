/**
 * Ad & banner analytics (contract C46): the vocabulary shared by the public
 * beacon, the track route, the admin read route and the admin pages.
 *
 * Pure on purpose (no `@/` imports) so scripts/unit/banner-analytics.test.mjs
 * can import it and compare these lists with the migration's RPCs.
 *
 * What the numbers mean (same for paid ads and editorial banners):
 *   view  — at least half the creative was on screen for 1 s
 *   open  — the visitor opened its detail window
 *   click — the visitor followed its link (the ad itself, a CTA button, or the
 *           CTA inside the detail window)
 * Each is counted once per browser tab session per creative, so a view is
 * "a session that saw it", not every render.
 *
 * The media plan's report (C47, §6) adds, from the same beacon:
 *   impressions — every viewable display (a view is the first of them in a
 *                 tab session)
 *   reach       — the first viewable display of that creative on a device
 *                 ("unique users"; summed over creatives it double-counts)
 *   slot_impressions — every viewable display of the placement's ad position,
 *                 filled or not: the denominator of an ad's actual SOV
 * CTR = clicks / impressions.
 */

import type {
  AnalyticsReport,
  ReportCell,
  ReportColumn,
  ReportSection,
} from "./analytics/report";

export const BANNER_EVENTS = ["view", "open", "click"] as const;
export type BannerEvent = (typeof BANNER_EVENTS)[number];

/**
 * The batched beacon's event types (record_banner_events): `imp` an
 * impression (flags s = first in session, r = first on device, slot = it is
 * the placement's ad position), `open`, `click`, and `empty` (an ad position
 * seen with nothing drawn into it).
 */
export const BANNER_BATCH_TYPES = ["imp", "open", "click", "empty"] as const;
export type BannerBatchType = (typeof BANNER_BATCH_TYPES)[number];
/** record_banner_events refuses a longer batch (22023). */
export const BANNER_BATCH_MAX = 50;

export const BANNER_SOURCES = ["ad", "banner"] as const;
export type BannerSource = (typeof BANNER_SOURCES)[number];

/** Day presets on the admin page; a custom range is also accepted. */
export const BANNER_ANALYTICS_PRESETS = [7, 30, 90] as const;
export const BANNER_ANALYTICS_DEFAULT_DAYS = 30;
/** `admin_banner_analytics` refuses p_to - p_from > 365 (366 days inclusive). */
export const BANNER_ANALYTICS_MAX_DAYS = 366;

export type BannerCreativeStatus =
  "live" | "scheduled" | "paused" | "off" | "expired" | "deleted";

export type BannerCounts = {
  views: number;
  opens: number;
  clicks: number;
  impressions: number;
};

export type BannerAnalyticsCreative = BannerCounts & {
  source: BannerSource;
  id: string;
  /** null once the creative row was deleted. */
  title: string | null;
  placement: string | null;
  status: BannerCreativeStatus;
  start_at: string | null;
  end_at: string | null;
  /** Ads only: lifetime counters that predate the daily rollup. */
  all_time_views: number | null;
  all_time_clicks: number | null;
  reach: number;
  /** Ads only (C47): the booked share, priority and daily cap. */
  sov_percent: number | null;
  priority: number | null;
  frequency_cap: number | null;
  /** The placement's ad-position displays on the days this creative ran. */
  slot_impressions: number;
};

export type BannerAnalyticsPlacement = BannerCounts & {
  placement: string;
  creatives: number;
  reach: number;
  slot_impressions: number;
};

/** The `admin_banner_analytics` payload, as GET /api/admin/banner-analytics returns it. */
export type BannerAnalytics = {
  from: string;
  to: string;
  /** First day anything was counted at all (null before the first event). */
  tracked_since: string | null;
  /** Creatives live right now under the same filters, whatever the range. */
  live_now: number;
  totals: BannerCounts & { reach: number };
  daily: (BannerCounts & { day: string })[];
  by_placement: BannerAnalyticsPlacement[];
  creatives: BannerAnalyticsCreative[];
};

export function isBannerEvent(value: unknown): value is BannerEvent {
  return (
    typeof value === "string" &&
    (BANNER_EVENTS as readonly string[]).includes(value)
  );
}

export function isBannerSource(value: unknown): value is BannerSource {
  return (
    typeof value === "string" &&
    (BANNER_SOURCES as readonly string[]).includes(value)
  );
}

export function isBannerBatchType(value: unknown): value is BannerBatchType {
  return (
    typeof value === "string" &&
    (BANNER_BATCH_TYPES as readonly string[]).includes(value)
  );
}

/** Clicks per 100 impressions (or views), one decimal; null when nothing was seen. */
export function ctrPercent(clicks: number, views: number): number | null {
  if (!Number.isFinite(views) || views <= 0) return null;
  return Math.round((clicks / views) * 1000) / 10;
}

/**
 * Actual share of voice (§6 "Planned vs Actual SOV"): this creative's
 * impressions out of every display of its placement's ad position while it
 * ran, one decimal; null before the slot was seen at all.
 */
export function actualSovPercent(
  impressions: number,
  slotImpressions: number,
): number | null {
  if (!Number.isFinite(slotImpressions) || slotImpressions <= 0) return null;
  return Math.min(
    100,
    Math.round((Math.max(0, impressions) / slotImpressions) * 1000) / 10,
  );
}

// ------------------------------------------------------------------ exports
//
// Every card of /dashboard/admin/ad-analytics (and the whole page) exports as
// Excel, CSV or PDF through GET /api/admin/banner-analytics/export, which
// reads the same admin_banner_analytics call as the page (C46). The tables
// are built here, so the file holds what the cards show: the same CTR, actual
// SOV, creative names and row order.

/** Sort orders of the by-creative table (page and export). */
export const BANNER_SORT_KEYS = [
  "impressions",
  "reach",
  "clicks",
  "ctr",
] as const;
export type BannerSortKey = (typeof BANNER_SORT_KEYS)[number];

export function isBannerSortKey(value: unknown): value is BannerSortKey {
  return (
    typeof value === "string" &&
    (BANNER_SORT_KEYS as readonly string[]).includes(value)
  );
}

/** Highest first; ties keep the RPC's order (Array.prototype.sort is stable). */
export function sortBannerCreatives<T extends BannerAnalyticsCreative>(
  rows: readonly T[],
  key: BannerSortKey,
): T[] {
  const score = (c: T) =>
    key === "ctr" ? (ctrPercent(c.clicks, c.impressions) ?? -1) : c[key];
  return [...rows].sort((a, b) => score(b) - score(a));
}

/** One export per card, and `all` for the whole page. */
export const BANNER_EXPORT_BLOCKS = [
  "kpis",
  "daily",
  "placements",
  "creatives",
  "all",
] as const;
export type BannerExportBlock = (typeof BANNER_EXPORT_BLOCKS)[number];

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

/** A creative's title, or "<type> (deleted)" once its row is gone. */
export function bannerCreativeName(
  c: Pick<BannerAnalyticsCreative, "title" | "source">,
  t: Translate,
): string {
  return c.title ?? t("deletedTitle", { source: t(`sources.${c.source}`) });
}

/**
 * The calendar day in Tbilisi (UTC+4, no DST) of a stored timestamp. An ad's
 * start is 00:00 Tbilisi = 20:00Z the day before, so the UTC date is wrong.
 */
export function tbilisiDayOf(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** "start – end" in Tbilisi days, "…" for an open end; null without dates. */
export function campaignPeriodText(
  c: Pick<BannerAnalyticsCreative, "start_at" | "end_at">,
): string | null {
  if (!c.start_at && !c.end_at) return null;
  return `${tbilisiDayOf(c.start_at) ?? "…"} – ${tbilisiDayOf(c.end_at) ?? "…"}`;
}

export type BannerReportLabels = {
  /** The AdminAdAnalytics messages. */
  t: Translate;
  /** AdminShared.placements.<id>, the raw id for an unknown one. */
  placement: (id: string) => string;
  /** AdminShared.placement (the column header). */
  placementHeader: string;
  /** True where the placement is sold by rotation (listing_grid, C47). */
  isRotation: (placement: string) => boolean;
};

export type BannerReportInput = {
  block: BannerExportBlock;
  scope: "filtered" | "full";
  /** The filters the data was read with (all null for the full scope). */
  filters: {
    source: BannerSource | null;
    placement: string | null;
    creative: string | null;
  };
  sort: BannerSortKey;
  /** "YYYY-MM-DD HH:MM", Tbilisi. */
  generatedAt: string;
};

/** The C49 AnalyticsReport shape, so one serializer writes both exports. */
export type BannerReport = AnalyticsReport;

/** Planned SOV as the page shows it: a number, "rotation", or nothing. */
function plannedSovCell(
  c: BannerAnalyticsCreative,
  labels: BannerReportLabels,
): ReportCell {
  if (c.source !== "ad" || c.sov_percent === null) return null;
  return c.placement && labels.isRotation(c.placement)
    ? labels.t("sovRotation")
    : c.sov_percent;
}

export function buildBannerReport(
  data: BannerAnalytics,
  input: BannerReportInput,
  labels: BannerReportLabels,
): BannerReport {
  const { t } = labels;
  const { block, filters } = input;
  const want = (b: BannerExportBlock) => block === b || block === "all";
  const num = (header: string, weight?: number): ReportColumn => ({
    header,
    kind: "number",
    ...(weight ? { weight } : {}),
  });
  const text = (header: string, weight?: number): ReportColumn => ({
    header,
    kind: "text",
    ...(weight ? { weight } : {}),
  });
  const pct = (key: string) => `${t(key)} (%)`;
  const focused = filters.creative
    ? (data.creatives.find((c) => c.id === filters.creative) ?? null)
    : null;

  const sections: ReportSection[] = [];
  if (want("kpis")) {
    const { totals } = data;
    const rows: ReportCell[][] = [
      [t("metrics.impressions"), totals.impressions],
      [t("metrics.reach"), totals.reach],
      [t("metrics.clicks"), totals.clicks],
      [pct("metrics.ctr"), ctrPercent(totals.clicks, totals.impressions)],
      [t("metrics.opens"), totals.opens],
      [t("metrics.live"), data.live_now],
    ];
    if (focused) {
      rows.push(
        [t("columns.period"), campaignPeriodText(focused)],
        [pct("metrics.sovPlanned"), plannedSovCell(focused, labels)],
        [
          pct("metrics.sovActual"),
          actualSovPercent(focused.impressions, focused.slot_impressions),
        ],
      );
    }
    sections.push({
      title: t("export.blocks.kpis"),
      columns: [text(t("export.metric")), num(t("export.value"))],
      rows,
      notes: [t("export.liveNote")],
    });
  }
  if (want("daily")) {
    sections.push({
      title: t("chartTitle"),
      columns: [
        text(t("export.day")),
        num(t("metrics.impressions")),
        num(t("metrics.opens")),
        num(t("metrics.clicks")),
      ],
      rows: data.daily.map((d) => [d.day, d.impressions, d.opens, d.clicks]),
      notes: [],
    });
  }
  // The page hides this card while one creative's report is open.
  if (want("placements") && (block === "placements" || !filters.creative)) {
    sections.push({
      title: t("byPlacementTitle"),
      columns: [
        text(labels.placementHeader, 3),
        num(t("columns.creatives")),
        num(t("metrics.impressions")),
        num(t("metrics.opens")),
        num(t("metrics.clicks")),
        num(t("metrics.reach")),
        num(pct("metrics.ctr")),
      ],
      rows: data.by_placement.map((p) => [
        labels.placement(p.placement),
        p.creatives,
        p.impressions,
        p.opens,
        p.clicks,
        p.reach,
        ctrPercent(p.clicks, p.impressions),
      ]),
      notes: data.by_placement.length === 0 ? [t("empty")] : [],
    });
  }
  if (want("creatives")) {
    const rows = sortBannerCreatives(data.creatives, input.sort);
    sections.push({
      title: t("byCreativeTitle"),
      // PDF widths in tens of points (the landscape table is 786 pt): each
      // Georgian header's longest word fits its column at 7.5 pt, the title
      // takes what is left.
      columns: [
        text(t("source"), 4.4),
        text(t("columns.title"), 9),
        text(labels.placementHeader, 6.2),
        text(t("columns.period"), 5.8),
        text(t("columns.status"), 6.2),
        num(t("metrics.impressions"), 5.2),
        num(t("metrics.opens"), 4.7),
        num(t("metrics.clicks"), 4.6),
        num(t("metrics.reach"), 7.8),
        num(pct("metrics.ctr"), 3.6),
        num(pct("metrics.sovPlanned"), 5.8),
        num(pct("metrics.sovActual"), 6.3),
        num(t("export.allTimeViews"), 4.4),
        num(t("export.allTimeClicks"), 4.6),
      ],
      rows: rows.map((c) => [
        t(`sources.${c.source}`),
        bannerCreativeName(c, t),
        c.placement ? labels.placement(c.placement) : null,
        campaignPeriodText(c),
        t(`status.${c.status}`),
        c.impressions,
        c.opens,
        c.clicks,
        c.reach,
        ctrPercent(c.clicks, c.impressions),
        plannedSovCell(c, labels),
        actualSovPercent(c.impressions, c.slot_impressions),
        c.all_time_views,
        c.all_time_clicks,
      ]),
      notes: rows.length === 0 ? [t("noCreatives")] : [t("export.allTimeNote")],
    });
  }

  const active = [
    filters.source
      ? `${t("source")}: ${t(`sources.${filters.source}Plural`)}`
      : null,
    filters.placement
      ? `${labels.placementHeader}: ${labels.placement(filters.placement)}`
      : null,
    filters.creative
      ? t("creativeReport", {
          title: focused ? bannerCreativeName(focused, t) : filters.creative,
        })
      : null,
  ].filter((line): line is string => line !== null);

  const period = t("export.period", { from: data.from, to: data.to });
  const generated = t("export.generated", { date: input.generatedAt });
  const meta = [
    period,
    t(input.scope === "full" ? "export.scopeFull" : "export.scopeFiltered"),
    active.length > 0
      ? t("export.filters", { list: active.join("; ") })
      : t("export.noFilters"),
  ];
  if (want("creatives")) {
    meta.push(`${t("sortBy")} ${t(`metrics.${input.sort}`)}`);
  }
  meta.push(
    data.tracked_since
      ? t("trackedSince", { date: data.tracked_since })
      : t("notTrackedYet"),
    generated,
    t("definitions"),
  );

  return {
    title: `${t("export.title")}: ${t(`export.blocks.${block}`)}`,
    meta,
    sections,
    fileStem: [
      "mybakuriani-ad-analytics",
      block,
      `${data.from}_${data.to}`,
      filters.creative ? filters.creative.slice(0, 8) : null,
      input.scope === "full" ? "full" : null,
    ]
      .filter(Boolean)
      .join("-"),
    // Printed beside the page number on every PDF page: the bare dates, so
    // the line still fits after the longest card title.
    stamp: `${t("export.periodShort", { from: data.from, to: data.to })} · ${generated}`,
  };
}

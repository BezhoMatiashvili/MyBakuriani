// Admin analytics (C49): the JSON the SQL functions return, and the tables an
// export is built from — one dashboard block or the whole page, the same
// sections for CSV, Excel and PDF. Pure (type imports only) so scripts/unit
// can load it: DIMENSION_ORDER and KEY_ACTION_ORDER repeat model.ts's
// DIMENSION_KEYS and LEAD_EVENTS, and ctrValue repeats banner-analytics.ts's
// ctrPercent (scripts/unit/analytics-report.test.mjs keeps them equal).

import type {
  AnalyticsQuery,
  DateRange,
  Device,
  DimensionKey,
  Dimensions,
  ExportBlock,
  ExportScope,
  Granularity,
  ListingKind,
  PageType,
  TrafficSource,
} from "./model";

// ---------------------------------------------------------------- payloads

export type TrafficKpis = {
  unique_users: number;
  active_users: number;
  new_users: number;
  returning_users: number;
  sessions: number;
  pageviews: number;
  engaged_sessions: number;
  /** engaged sessions ÷ sessions (0..1); null without sessions. */
  engagement_rate: number | null;
  key_actions: number;
  key_actions_by_name: Partial<Record<string, number>>;
};

export type TrafficPoint = {
  /** First day of the day/week/month bucket, YYYY-MM-DD. */
  bucket: string;
  unique_users: number;
  active_users: number;
  sessions: number;
  pageviews: number;
  new_users: number;
  returning_users: number;
};

export type SourceRow = {
  /** "unknown": sessions recorded before sources were (old page views). */
  source: TrafficSource | "unknown";
  users: number;
  sessions: number;
  engaged_sessions: number;
  engagement_rate: number | null;
};

export type TrafficData = {
  from: string;
  to: string;
  granularity: Granularity;
  kpis: TrafficKpis;
  series: TrafficPoint[];
  sources: SourceRow[];
  /** Countries and cities seen in the period (the filter choices). */
  options: {
    countries: string[];
    cities: { country: string; city: string }[];
  };
  tracked_since: string | null;
  /** First page view that carries device/source/location. */
  dimensions_since: string | null;
};

export type ListingTotals = {
  active: number;
  new: number;
  views: number;
  saves: number;
  calls: number;
  messages: number;
  /** Contact reveals from before calls and messages were told apart. */
  unsplit_contacts: number;
  smart_match_requests: number;
};

export type ListingKindRow = Omit<ListingTotals, "smart_match_requests"> & {
  kind: ListingKind;
};

export type ListingsData = {
  /** True when a dimension filter is on: actions of tracked visitors only. */
  filtered: boolean;
  totals: ListingTotals;
  by_kind: ListingKindRow[];
};

export type SmartMatchData = {
  filtered: boolean;
  requests: number;
  requests_with_offer: number;
  match_rate: number | null;
  matching_listings: number;
  responses: number;
  leads: number;
};

export type AdsCounts = {
  impressions: number;
  reach: number;
  clicks: number;
  views: number;
  opens: number;
};

export type AdsPlacementRow = AdsCounts & {
  placement: string;
  creatives: number;
};

export type AdsData = {
  /** Live right now, whatever the period. */
  active_ads: number;
  active_advertisers: number;
  ads_without_advertiser: number;
  /** Advertising revenue in the period (finance ledger, net of owner share). */
  revenue: number;
  totals: AdsCounts;
  by_placement: AdsPlacementRow[];
  tracked_since: string | null;
};

export type LiveRow = {
  path: string;
  page_type: PageType;
  device: Device | null;
  country: string | null;
  city: string | null;
  source: TrafficSource | null;
  seen_at: string;
};

export type LiveData = {
  at: string;
  window_minutes: number;
  visitors: number;
  pages: { path: string; page_type: PageType; visitors: number }[];
  rows: LiveRow[];
};

/** One block as GET /api/admin/analytics returns it. */
export type BlockPayload<T> = {
  current: T;
  /** The same block for the preceding period ("compare"); null when off. */
  previous: T | null;
  previousRange: DateRange | null;
};

// ------------------------------------------------------------- numbers

const DIMENSION_ORDER = [
  "device",
  "country",
  "city",
  "source",
  "page",
] as const;
const KEY_ACTION_ORDER = [
  "call",
  "message",
  "smart_match_request",
  "job_application",
] as const;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** A 0..1 rate as a percentage with one decimal. */
export function percentValue(rate: number | null | undefined): number | null {
  return typeof rate === "number" && Number.isFinite(rate)
    ? round1(rate * 100)
    : null;
}

/** Relative change in percent, one decimal; null with nothing to compare. */
export function changePercent(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (
    typeof current !== "number" ||
    typeof previous !== "number" ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    previous === 0
  ) {
    return null;
  }
  return round1(((current - previous) / previous) * 100);
}

/** CTR = clicks ÷ impressions in percent (C46/C47); null before any. */
export function ctrValue(clicks: number, impressions: number): number | null {
  if (!Number.isFinite(impressions) || impressions <= 0) return null;
  return Math.round((clicks / impressions) * 1000) / 10;
}

/** "YYYY-MM-DD HH:MM" in Tbilisi (UTC+4) for a stored timestamp. */
export function tbilisiStamp(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms + 4 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
}

// -------------------------------------------------------------- labels

export type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export type ReportLabels = {
  /** The AdminAnalytics messages. */
  t: Translate;
  /** AdminShared.placements.<id>. */
  placement: (id: string) => string;
  /** ISO 3166 code → country name. */
  country: (code: string) => string;
  /** Stored (DB-IP) city name → display name. */
  city: (name: string) => string;
};

/** The dimension filters that are on, in the order the chain shows them. */
export function activeFilters(
  dims: Dimensions,
): { key: DimensionKey; value: string }[] {
  return DIMENSION_ORDER.flatMap((key) => {
    const value = dims[key];
    return value === null ? [] : [{ key, value }];
  });
}

export function dimensionValueLabel(
  key: DimensionKey,
  value: string,
  labels: ReportLabels,
): string {
  switch (key) {
    case "device":
      return labels.t(`devices.${value}`);
    case "country":
      return labels.country(value);
    case "city":
      return labels.city(value);
    case "source":
      return labels.t(`sources.${value}`);
    case "page":
      return labels.t(`pageTypes.${value}`);
  }
}

// ------------------------------------------------------------ sections

export type ReportCellKind = "text" | "number" | "money";
export type ReportCell = string | number | null;
export type ReportColumn = {
  header: string;
  kind: ReportCellKind;
  /** PDF width share (text 2, numbers 1 by default). */
  weight?: number;
};

export type ReportSection = {
  title: string;
  columns: ReportColumn[];
  rows: ReportCell[][];
  /** Definitions and caveats printed with the table. */
  notes: string[];
};

export type AnalyticsReport = {
  title: string;
  /** Period, comparison, scope, filters, generated at, sources. */
  meta: string[];
  sections: ReportSection[];
  /** ASCII file name without the extension. */
  fileStem: string;
  /** Period and generation date, printed on every PDF page (spec §11). */
  stamp: string;
};

export type ReportInput = {
  block: ExportBlock;
  scope: ExportScope;
  /** Already without filters for the "full" scope. */
  query: AnalyticsQuery;
  previousRange: DateRange | null;
  /** "YYYY-MM-DD HH:MM", Tbilisi. */
  generatedAt: string;
  traffic?: BlockPayload<TrafficData>;
  listings?: BlockPayload<ListingsData>;
  smartmatch?: BlockPayload<SmartMatchData>;
  ads?: BlockPayload<AdsData>;
  live?: LiveData;
};

type MetricRow = {
  label: string;
  value: number | null;
  previous?: number | null;
  /** False for "right now" facts: the previous period has no value. */
  comparable?: boolean;
};

function metricSection(
  title: string,
  rows: MetricRow[],
  compare: boolean,
  t: Translate,
  notes: string[] = [],
): ReportSection {
  const columns: ReportColumn[] = [
    { header: t("export.metric"), kind: "text" },
    { header: t("export.value"), kind: "number" },
  ];
  if (compare) {
    columns.push(
      { header: t("export.previous"), kind: "number" },
      { header: t("export.change"), kind: "number" },
    );
  }
  return {
    title,
    columns,
    notes,
    rows: rows.map((row) => {
      const cells: ReportCell[] = [row.label, row.value];
      if (!compare) return cells;
      const previous = row.comparable === false ? null : (row.previous ?? null);
      return [...cells, previous, changePercent(row.value, previous)];
    }),
  };
}

/** A table, plus the same table for the previous period when comparing. */
function tableSections(
  title: string,
  columns: ReportColumn[],
  current: ReportCell[][],
  previous: ReportCell[][] | null,
  previousRange: DateRange | null,
  t: Translate,
  notes: string[] = [],
): ReportSection[] {
  const sections: ReportSection[] = [{ title, columns, rows: current, notes }];
  if (previous && previousRange) {
    sections.push({
      title: t("export.previousSection", {
        title,
        from: previousRange.from,
        to: previousRange.to,
      }),
      columns,
      rows: previous,
      notes: [],
    });
  }
  return sections;
}

const num = (header: string): ReportColumn => ({ header, kind: "number" });
const text = (header: string): ReportColumn => ({ header, kind: "text" });

function kpiSection(
  data: BlockPayload<TrafficData>,
  compare: boolean,
  t: Translate,
): ReportSection {
  const current = data.current.kpis;
  const previous = data.previous?.kpis ?? null;
  const row = (
    label: string,
    pick: (k: TrafficKpis) => number | null,
  ): MetricRow => ({
    label,
    value: pick(current),
    previous: previous ? pick(previous) : null,
  });
  return metricSection(
    t("blocks.kpis"),
    [
      row(t("kpis.uniqueUsers"), (k) => k.unique_users),
      row(t("kpis.activeUsers"), (k) => k.active_users),
      row(t("kpis.newUsers"), (k) => k.new_users),
      row(t("kpis.returningUsers"), (k) => k.returning_users),
      row(t("kpis.sessions"), (k) => k.sessions),
      row(t("kpis.engagedSessions"), (k) => k.engaged_sessions),
      row(t("kpis.pageviews"), (k) => k.pageviews),
      row(`${t("kpis.engagementRate")} (%)`, (k) =>
        percentValue(k.engagement_rate),
      ),
      row(t("kpis.keyActions"), (k) => k.key_actions),
      ...KEY_ACTION_ORDER.map((name) =>
        row(
          `— ${t(`keyActionNames.${name}`)}`,
          (k) => k.key_actions_by_name[name] ?? 0,
        ),
      ),
    ],
    compare,
    t,
    [t("kpis.definitions"), t("kpis.keyActionsNote")],
  );
}

function bucketLabel(bucket: string, granularity: Granularity): string {
  const day = bucket.slice(0, 10);
  return granularity === "month" ? day.slice(0, 7) : day;
}

function chartSections(
  data: BlockPayload<TrafficData>,
  granularity: Granularity,
  t: Translate,
): ReportSection[] {
  const columns = [
    text(t(`export.bucket.${granularity}`)),
    num(t("kpis.uniqueUsers")),
    num(t("kpis.activeUsers")),
    num(t("kpis.sessions")),
    num(t("kpis.pageviews")),
    num(t("kpis.newUsers")),
    num(t("kpis.returningUsers")),
  ];
  const rows = (d: TrafficData): ReportCell[][] =>
    d.series.map((point) => [
      bucketLabel(point.bucket, granularity),
      point.unique_users,
      point.active_users,
      point.sessions,
      point.pageviews,
      point.new_users,
      point.returning_users,
    ]);
  return tableSections(
    `${t("blocks.chart")} (${t(`granularity.${granularity}`)})`,
    columns,
    rows(data.current),
    data.previous ? rows(data.previous) : null,
    data.previousRange,
    t,
    [t("chart.note")],
  );
}

function sourceSections(
  data: BlockPayload<TrafficData>,
  t: Translate,
): ReportSection[] {
  const columns = [
    text(t("sources.column")),
    num(t("sources.users")),
    num(t("kpis.sessions")),
    num(t("kpis.engagedSessions")),
    num(`${t("sources.engagement")} (%)`),
  ];
  const rows = (d: TrafficData): ReportCell[][] =>
    d.sources.map((s) => [
      t(`sources.${s.source}`),
      s.users,
      s.sessions,
      s.engaged_sessions,
      percentValue(s.engagement_rate),
    ]);
  return tableSections(
    t("blocks.sources"),
    columns,
    rows(data.current),
    data.previous ? rows(data.previous) : null,
    data.previousRange,
    t,
    [t("sources.note")],
  );
}

function listingSections(
  data: BlockPayload<ListingsData>,
  compare: boolean,
  t: Translate,
): ReportSection[] {
  const current = data.current.totals;
  const previous = data.previous?.totals ?? null;
  const row = (
    key: string,
    pick: (x: ListingTotals) => number,
    comparable = true,
  ): MetricRow => ({
    label: t(`listings.${key}`),
    value: pick(current),
    previous: previous ? pick(previous) : null,
    comparable,
  });
  const notes = [t("listings.inventoryNote"), t("listings.unsplitNote")];
  if (data.current.filtered) notes.unshift(t("listings.filteredNote"));
  const totals = metricSection(
    t("blocks.listings"),
    [
      row("active", (x) => x.active, false),
      row("new", (x) => x.new),
      row("views", (x) => x.views),
      row("saves", (x) => x.saves),
      row("calls", (x) => x.calls),
      row("messages", (x) => x.messages),
      row("unsplit", (x) => x.unsplit_contacts),
      row("smartMatch", (x) => x.smart_match_requests),
    ],
    compare,
    t,
    notes,
  );
  const columns = [
    text(t("listings.kind")),
    num(t("listings.active")),
    num(t("listings.new")),
    num(t("listings.views")),
    num(t("listings.saves")),
    num(t("listings.calls")),
    num(t("listings.messages")),
    num(t("listings.unsplit")),
  ];
  const rows = (d: ListingsData): ReportCell[][] =>
    d.by_kind.map((k) => [
      t(`kinds.${k.kind}`),
      k.active,
      k.new,
      k.views,
      k.saves,
      k.calls,
      k.messages,
      k.unsplit_contacts,
    ]);
  return [
    totals,
    ...tableSections(
      t("listings.byKind"),
      columns,
      rows(data.current),
      data.previous ? rows(data.previous) : null,
      data.previousRange,
      t,
    ),
  ];
}

function smartMatchSection(
  data: BlockPayload<SmartMatchData>,
  compare: boolean,
  t: Translate,
): ReportSection {
  const current = data.current;
  const previous = data.previous;
  const row = (
    label: string,
    pick: (x: SmartMatchData) => number | null,
  ): MetricRow => ({
    label,
    value: pick(current),
    previous: previous ? pick(previous) : null,
  });
  const notes = [t("smartmatch.definitions")];
  if (current.filtered) notes.unshift(t("smartmatch.filteredNote"));
  return metricSection(
    t("blocks.smartmatch"),
    [
      row(t("smartmatch.requests"), (x) => x.requests),
      row(t("smartmatch.requestsWithOffer"), (x) => x.requests_with_offer),
      row(`${t("smartmatch.matchRate")} (%)`, (x) =>
        percentValue(x.match_rate),
      ),
      row(t("smartmatch.matching"), (x) => x.matching_listings),
      row(t("smartmatch.responses"), (x) => x.responses),
      row(t("smartmatch.leads"), (x) => x.leads),
    ],
    compare,
    t,
    notes,
  );
}

function adsSections(
  data: BlockPayload<AdsData>,
  compare: boolean,
  labels: ReportLabels,
  withFilters: boolean,
): ReportSection[] {
  const { t } = labels;
  const current = data.current;
  const previous = data.previous;
  const row = (
    label: string,
    pick: (x: AdsData) => number | null,
    comparable = true,
  ): MetricRow => ({
    label,
    value: pick(current),
    previous: previous ? pick(previous) : null,
    comparable,
  });
  const notes = [t("ads.reachNote"), t("ads.nowNote")];
  if (withFilters) notes.unshift(t("export.filtersNotApplicable"));
  const totals = metricSection(
    t("blocks.ads"),
    [
      row(t("ads.impressions"), (x) => x.totals.impressions),
      row(t("ads.reach"), (x) => x.totals.reach),
      row(t("ads.clicks"), (x) => x.totals.clicks),
      row(`${t("ads.ctr")} (%)`, (x) =>
        ctrValue(x.totals.clicks, x.totals.impressions),
      ),
      row(t("ads.activeAds"), (x) => x.active_ads, false),
      row(t("ads.advertisers"), (x) => x.active_advertisers, false),
      row(t("ads.withoutAdvertiser"), (x) => x.ads_without_advertiser, false),
      row(`${t("ads.revenue")} (₾)`, (x) => x.revenue),
    ],
    compare,
    t,
    notes,
  );
  const columns = [
    text(t("ads.placement")),
    num(t("ads.impressions")),
    num(t("ads.reach")),
    num(t("ads.clicks")),
    num(`${t("ads.ctr")} (%)`),
    num(t("ads.creatives")),
  ];
  const rows = (d: AdsData): ReportCell[][] =>
    d.by_placement.map((p) => [
      labels.placement(p.placement),
      p.impressions,
      p.reach,
      p.clicks,
      ctrValue(p.clicks, p.impressions),
      p.creatives,
    ]);
  return [
    totals,
    ...tableSections(
      t("ads.byPlacement"),
      columns,
      rows(current),
      previous ? rows(previous) : null,
      data.previousRange,
      t,
    ),
  ];
}

function liveSections(data: LiveData, labels: ReportLabels): ReportSection[] {
  const { t } = labels;
  const optional = (
    value: string | null,
    label: (v: string) => string,
  ): string => (value === null ? t("notRecorded") : label(value));
  return [
    metricSection(
      t("blocks.live"),
      [{ label: t("live.visitors"), value: data.visitors }],
      false,
      t,
      [t("live.window", { minutes: data.window_minutes })],
    ),
    {
      title: t("live.pages"),
      columns: [
        text(t("live.page")),
        text(t("filters.page")),
        num(t("live.pageVisitors")),
      ],
      rows: data.pages.map((p) => [
        p.path,
        t(`pageTypes.${p.page_type}`),
        p.visitors,
      ]),
      notes: [],
    },
    {
      title: t("live.visitorsList"),
      columns: [
        text(t("live.page")),
        text(t("filters.page")),
        text(t("filters.device")),
        text(t("filters.country")),
        text(t("filters.city")),
        text(t("filters.source")),
        text(t("live.lastSeen")),
      ],
      rows: data.rows.map((r) => [
        r.path,
        t(`pageTypes.${r.page_type}`),
        optional(r.device, (v) => t(`devices.${v}`)),
        optional(r.country, labels.country),
        optional(r.city, labels.city),
        optional(r.source, (v) => t(`sources.${v}`)),
        tbilisiStamp(r.seen_at),
      ]),
      notes: [],
    },
  ];
}

/** The data's period; none for "live", which is a snapshot. */
function periodLine(input: ReportInput, labels: ReportLabels): string | null {
  if (input.block === "live") return null;
  const { query } = input;
  return labels.t("export.period", {
    from: query.range.from,
    to: query.range.to,
    label: labels.t(`period.${query.period}`),
  });
}

function buildMeta(input: ReportInput, labels: ReportLabels): string[] {
  const { t } = labels;
  const { block, query } = input;
  const lines: string[] = [];
  const period = periodLine(input, labels);
  if (period) {
    lines.push(
      period,
      query.compare && input.previousRange
        ? t("export.comparison", {
            from: input.previousRange.from,
            to: input.previousRange.to,
          })
        : t("export.noComparison"),
    );
  }
  lines.push(
    t(input.scope === "full" ? "export.scopeFull" : "export.scopeFiltered"),
  );
  if (block === "ads") {
    lines.push(t("export.filtersNotApplicable"));
  } else {
    const filters = activeFilters(query.dims);
    lines.push(
      filters.length > 0
        ? t("export.filters", {
            list: filters
              .map(
                (f) =>
                  `${t(`filters.${f.key}`)}: ${dimensionValueLabel(f.key, f.value, labels)}`,
              )
              .join("; "),
          })
        : t("export.noFilters"),
    );
  }
  if (block === "chart" || block === "all") {
    lines.push(
      t("export.granularity", {
        value: t(`granularity.${query.granularity}`),
      }),
    );
  }
  if ((block === "live" || block === "all") && input.live) {
    lines.push(
      t("export.liveSnapshot", { minutes: input.live.window_minutes }),
    );
  }
  lines.push(t("export.generated", { date: input.generatedAt }));
  if (block !== "ads") lines.push(t("export.consent"));
  lines.push(t("export.geo"));
  return lines;
}

/** Every section of one block (or of the whole page, `all`). */
export function buildAnalyticsReport(
  input: ReportInput,
  labels: ReportLabels,
): AnalyticsReport {
  const { t } = labels;
  const { block, query } = input;
  const compare = query.compare;
  const want = (b: ExportBlock) => block === b || block === "all";
  const sections: ReportSection[] = [];
  if (want("kpis") && input.traffic) {
    sections.push(kpiSection(input.traffic, compare, t));
  }
  if (want("chart") && input.traffic) {
    sections.push(...chartSections(input.traffic, query.granularity, t));
  }
  if (want("sources") && input.traffic) {
    sections.push(...sourceSections(input.traffic, t));
  }
  if (want("listings") && input.listings) {
    sections.push(...listingSections(input.listings, compare, t));
  }
  if (want("smartmatch") && input.smartmatch) {
    sections.push(smartMatchSection(input.smartmatch, compare, t));
  }
  if (want("ads") && input.ads) {
    sections.push(
      ...adsSections(
        input.ads,
        compare,
        labels,
        block === "all" && activeFilters(query.dims).length > 0,
      ),
    );
  }
  if (want("live") && input.live) {
    sections.push(...liveSections(input.live, labels));
  }
  const range =
    block === "live" ? "" : `-${query.range.from}_${query.range.to}`;
  return {
    title: `${t("export.title")}: ${t(`blocks.${block}`)}`,
    meta: buildMeta(input, labels),
    sections,
    fileStem: `mybakuriani-analytics-${block}${range}${
      input.scope === "full" ? "-full" : ""
    }`,
    stamp: [
      periodLine(input, labels),
      t("export.generated", { date: input.generatedAt }),
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

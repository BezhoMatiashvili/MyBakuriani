// Admin analytics (C49): what every export holds (spec §11): the meta lines
// (period, comparison, scope, filters, generated), the sections of each block,
// and the lists report.ts repeats from model.ts and banner-analytics.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeFilters,
  buildAnalyticsReport,
  changePercent,
  ctrValue,
  percentValue,
  tbilisiStamp,
} from "../../src/lib/analytics/report.ts";
import {
  DIMENSION_KEYS,
  EMPTY_DIMENSIONS,
  LEAD_EVENTS,
} from "../../src/lib/analytics/model.ts";
import { ctrPercent } from "../../src/lib/banner-analytics.ts";

// Keys come back as text, with their values, so the tests read what was asked.
const t = (key, values) => (values ? `${key}${JSON.stringify(values)}` : key);
const labels = {
  t,
  placement: (id) => `P:${id}`,
  country: (code) => `C:${code}`,
  city: (name) => `T:${name}`,
};

const range = { from: "2026-09-30", to: "2026-10-06" };
const previousRange = { from: "2026-09-23", to: "2026-09-29" };
const allDims = {
  device: "mobile",
  country: "GE",
  city: "Tbilisi",
  source: "google",
  page: "apartments",
};
const query = (patch = {}) => ({
  period: "last7",
  range,
  compare: false,
  granularity: "day",
  dims: EMPTY_DIMENSIONS,
  ...patch,
});

const kpis = (n) => ({
  unique_users: n,
  active_users: n - 1,
  new_users: 2,
  returning_users: n - 2,
  sessions: n + 3,
  pageviews: n * 4,
  engaged_sessions: n,
  engagement_rate: n / (n + 3),
  key_actions: 4,
  key_actions_by_name: {
    call: 1,
    message: 1,
    smart_match_request: 1,
    job_application: 1,
  },
});
const traffic = (n) => ({
  from: range.from,
  to: range.to,
  granularity: "day",
  kpis: kpis(n),
  series: [
    {
      bucket: "2026-09-30",
      unique_users: n,
      active_users: n,
      sessions: n,
      pageviews: n,
      new_users: 1,
      returning_users: n - 1,
    },
  ],
  sources: [
    {
      source: "google",
      users: n,
      sessions: n,
      engaged_sessions: 1,
      engagement_rate: 0.5,
    },
  ],
  options: { countries: ["GE"], cities: [{ country: "GE", city: "Tbilisi" }] },
  tracked_since: "2026-06-09T00:00:00Z",
  dimensions_since: "2026-10-06T13:25:00Z",
});
const ads = (n) => ({
  active_ads: 3,
  active_advertisers: 2,
  ads_without_advertiser: 1,
  revenue: 150,
  totals: {
    impressions: 1000 * n,
    reach: 300,
    clicks: 10 * n,
    views: 0,
    opens: 0,
  },
  by_placement: [
    {
      placement: "home_hero",
      impressions: 1000 * n,
      reach: 300,
      clicks: 10 * n,
      views: 0,
      opens: 0,
      creatives: 2,
    },
  ],
  tracked_since: null,
});
const live = {
  at: "2026-10-06T14:00:00Z",
  window_minutes: 5,
  visitors: 1,
  pages: [{ path: "/apartments", page_type: "apartments", visitors: 1 }],
  rows: [
    {
      path: "/apartments",
      page_type: "apartments",
      device: "mobile",
      country: "GE",
      city: "Tbilisi",
      source: null,
      seen_at: "2026-10-06T13:59:00Z",
    },
  ],
};

test("helpers: percent, change, CTR (= C46's ctrPercent), Tbilisi stamps", () => {
  assert.equal(percentValue(0.12345), 12.3);
  assert.equal(percentValue(null), null);
  assert.equal(changePercent(150, 100), 50);
  assert.equal(changePercent(2, 3), -33.3);
  assert.equal(changePercent(0, 5), -100);
  assert.equal(changePercent(5, 0), null);
  assert.equal(changePercent(null, 5), null);
  assert.equal(changePercent(5, undefined), null);
  for (const impressions of [0, 1, 2, 3, 7, 8, 333, 2000, 4096]) {
    for (const clicks of [0, 1, 2, 5, 37]) {
      assert.equal(
        ctrValue(clicks, impressions),
        ctrPercent(clicks, impressions),
        `${clicks}/${impressions}`,
      );
    }
  }
  assert.equal(tbilisiStamp("2026-10-06T20:30:00Z"), "2026-10-07 00:30");
  assert.equal(tbilisiStamp("garbage"), "garbage");
});

test("filters read in DIMENSION_KEYS order; key actions in LEAD_EVENTS order", () => {
  assert.deepEqual(
    activeFilters(allDims).map((f) => f.key),
    [...DIMENSION_KEYS],
  );
  assert.deepEqual(activeFilters(EMPTY_DIMENSIONS), []);
  const report = buildAnalyticsReport(
    {
      block: "kpis",
      scope: "filtered",
      query: query(),
      previousRange: null,
      generatedAt: "2026-10-06 18:00",
      traffic: { current: traffic(10), previous: null, previousRange: null },
    },
    labels,
  );
  const names = report.sections[0].rows
    .map((row) => row[0])
    .filter((label) => label.startsWith("— "))
    .map((label) => label.slice("— keyActionNames.".length));
  assert.deepEqual(names, [...LEAD_EVENTS]);
});

test("the whole-page export: meta lines, every block, comparison twins", () => {
  const report = buildAnalyticsReport(
    {
      block: "all",
      scope: "filtered",
      query: query({ compare: true, dims: allDims }),
      previousRange,
      generatedAt: "2026-10-06 18:00",
      traffic: {
        current: traffic(10),
        previous: traffic(5),
        previousRange,
      },
      ads: { current: ads(2), previous: ads(1), previousRange },
      live,
    },
    labels,
  );
  assert.equal(report.title, "export.title: blocks.all");
  assert.equal(
    report.fileStem,
    "mybakuriani-analytics-all-2026-09-30_2026-10-06",
  );
  assert.deepEqual(report.meta, [
    'export.period{"from":"2026-09-30","to":"2026-10-06","label":"period.last7"}',
    'export.comparison{"from":"2026-09-23","to":"2026-09-29"}',
    "export.scopeFiltered",
    'export.filters{"list":"filters.device: devices.mobile; filters.country: C:GE; filters.city: T:Tbilisi; filters.source: sources.google; filters.page: pageTypes.apartments"}',
    'export.granularity{"value":"granularity.day"}',
    'export.liveSnapshot{"minutes":5}',
    'export.generated{"date":"2026-10-06 18:00"}',
    "export.consent",
    "export.geo",
  ]);
  // Spec §11: the period and generation date on every PDF page too.
  assert.equal(
    report.stamp,
    'export.period{"from":"2026-09-30","to":"2026-10-06","label":"period.last7"} · export.generated{"date":"2026-10-06 18:00"}',
  );

  const titles = report.sections.map((s) => s.title);
  assert.deepEqual(titles, [
    "blocks.kpis",
    "blocks.chart (granularity.day)",
    'export.previousSection{"title":"blocks.chart (granularity.day)","from":"2026-09-23","to":"2026-09-29"}',
    "blocks.sources",
    'export.previousSection{"title":"blocks.sources","from":"2026-09-23","to":"2026-09-29"}',
    "blocks.ads",
    "ads.byPlacement",
    'export.previousSection{"title":"ads.byPlacement","from":"2026-09-23","to":"2026-09-29"}',
    "blocks.live",
    "live.pages",
    "live.visitorsList",
  ]);

  // Comparing adds "previous" and "change" columns; right-now facts get none.
  const kpi = report.sections[0];
  assert.deepEqual(
    kpi.columns.map((c) => c.header),
    ["export.metric", "export.value", "export.previous", "export.change"],
  );
  assert.deepEqual(kpi.rows[0], ["kpis.uniqueUsers", 10, 5, 100]);
  const adsTotals = report.sections[5];
  const byLabel = Object.fromEntries(adsTotals.rows.map((r) => [r[0], r]));
  assert.deepEqual(byLabel["ads.impressions"], [
    "ads.impressions",
    2000,
    1000,
    100,
  ]);
  assert.deepEqual(byLabel["ads.ctr (%)"], ["ads.ctr (%)", 1, 1, 0]);
  assert.deepEqual(byLabel["ads.activeAds"], ["ads.activeAds", 3, null, null]);
  assert.deepEqual(byLabel["ads.advertisers"], [
    "ads.advertisers",
    2,
    null,
    null,
  ]);
  // Filters do not reach the ads (C46 holds no visitor data): said in the file.
  assert.equal(adsTotals.notes[0], "export.filtersNotApplicable");
  assert.deepEqual(report.sections[6].rows[0], [
    "P:home_hero",
    2000,
    300,
    20,
    1,
    2,
  ]);
  assert.deepEqual(report.sections[10].rows[0], [
    "/apartments",
    "pageTypes.apartments",
    "devices.mobile",
    "C:GE",
    "T:Tbilisi",
    "notRecorded",
    "2026-10-06 17:59",
  ]);
});

test("single blocks: ads say filters do not apply, live has no period, full scope", () => {
  const adsOnly = buildAnalyticsReport(
    {
      block: "ads",
      scope: "full",
      query: query(),
      previousRange: null,
      generatedAt: "2026-10-06 18:00",
      ads: { current: ads(1), previous: null, previousRange: null },
    },
    labels,
  );
  assert.equal(
    adsOnly.fileStem,
    "mybakuriani-analytics-ads-2026-09-30_2026-10-06-full",
  );
  assert.ok(adsOnly.meta.includes("export.filtersNotApplicable"));
  assert.ok(adsOnly.meta.includes("export.noComparison"));
  assert.ok(adsOnly.meta.includes("export.scopeFull"));
  assert.ok(!adsOnly.meta.includes("export.consent"));
  assert.equal(adsOnly.sections[0].columns.length, 2);

  const liveOnly = buildAnalyticsReport(
    {
      block: "live",
      scope: "filtered",
      query: query({ dims: { ...EMPTY_DIMENSIONS, device: "desktop" } }),
      previousRange: null,
      generatedAt: "2026-10-06 18:00",
      live,
    },
    labels,
  );
  assert.equal(liveOnly.fileStem, "mybakuriani-analytics-live");
  assert.ok(!liveOnly.meta.some((line) => line.startsWith("export.period")));
  assert.ok(
    liveOnly.meta.includes(
      'export.filters{"list":"filters.device: devices.desktop"}',
    ),
  );
  assert.ok(liveOnly.meta.includes('export.liveSnapshot{"minutes":5}'));
  assert.equal(liveOnly.stamp, 'export.generated{"date":"2026-10-06 18:00"}');

  const empty = buildAnalyticsReport(
    {
      block: "listings",
      scope: "filtered",
      query: query(),
      previousRange: null,
      generatedAt: "2026-10-06 18:00",
    },
    labels,
  );
  assert.deepEqual(empty.sections, []);
  assert.ok(empty.meta.includes("export.noFilters"));
});

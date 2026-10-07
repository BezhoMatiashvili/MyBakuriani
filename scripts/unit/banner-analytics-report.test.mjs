// Ad analytics exports (C46): every card of /dashboard/admin/ad-analytics as a
// file. The tables must hold what the cards show: the same order, CTR, SOV,
// names and Tbilisi dates, the all-time counters kept apart, and only message
// keys that exist in every catalog.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BANNER_EXPORT_BLOCKS,
  BANNER_SORT_KEYS,
  buildBannerReport,
  campaignPeriodText,
  sortBannerCreatives,
  tbilisiDayOf,
} from "../../src/lib/banner-analytics.ts";

const catalogs = Object.fromEntries(
  ["ka", "en", "ru"].map((l) => [
    l,
    JSON.parse(
      readFileSync(
        new URL(`../../messages/${l}.json`, import.meta.url),
        "utf8",
      ),
    ),
  ]),
);

// Keys come back as text, with their values, so the tests read what was asked.
const asked = new Set();
const t = (key, values) => {
  asked.add(key);
  return values ? `${key}${JSON.stringify(values)}` : key;
};
const labels = {
  t,
  placement: (id) => `P:${id}`,
  placementHeader: "PLACEMENT",
  isRotation: (placement) => placement === "listing_grid",
};

const creative = (patch) => ({
  source: "ad",
  id: "11111111-1111-4111-8111-111111111111",
  title: "Ad",
  placement: "home_hero",
  status: "live",
  start_at: null,
  end_at: null,
  views: 0,
  opens: 0,
  clicks: 0,
  impressions: 0,
  reach: 0,
  all_time_views: null,
  all_time_clicks: null,
  sov_percent: null,
  priority: null,
  frequency_cap: null,
  slot_impressions: 0,
  ...patch,
});

// The staging banner of the screenshot (2026-10-07), plus an ad, a rotation
// ad and a deleted creative.
const banner = creative({
  source: "banner",
  id: "415ff11c-2d8f-44d6-be57-83c6a7840887",
  title: "რრროოდის",
  placement: "sticky_bottom",
  start_at: "2026-10-05T20:00:00+00:00",
  views: 30,
  opens: 1,
  impressions: 25,
  reach: 17,
});
const ad = creative({
  id: "22222222-2222-4222-8222-222222222222",
  title: "=HYPERLINK(1)",
  start_at: "2026-10-01T20:00:00+00:00",
  end_at: "2026-10-31T19:59:59.999+00:00",
  impressions: 40,
  clicks: 2,
  reach: 30,
  sov_percent: 50,
  slot_impressions: 80,
  all_time_views: 142,
  all_time_clicks: 2,
});
const grid = creative({
  id: "33333333-3333-4333-8333-333333333333",
  title: "Grid",
  placement: "listing_grid",
  status: "scheduled",
  impressions: 10,
  clicks: 1,
  reach: 9,
  sov_percent: 25,
});
const deleted = creative({
  id: "44444444-4444-4444-8444-444444444444",
  title: null,
  placement: null,
  status: "deleted",
});

const data = (patch = {}) => ({
  from: "2026-09-08",
  to: "2026-10-07",
  tracked_since: "2026-10-06",
  live_now: 1,
  totals: { views: 30, opens: 1, clicks: 3, impressions: 75, reach: 56 },
  daily: [
    { day: "2026-10-06", views: 18, opens: 1, clicks: 0, impressions: 19 },
    { day: "2026-10-07", views: 12, opens: 0, clicks: 3, impressions: 56 },
  ],
  by_placement: [
    {
      placement: "sticky_bottom",
      creatives: 1,
      views: 30,
      opens: 1,
      clicks: 0,
      impressions: 25,
      reach: 17,
      slot_impressions: 0,
    },
  ],
  creatives: [deleted, grid, banner, ad],
  ...patch,
});

const input = (patch = {}) => ({
  block: "all",
  scope: "filtered",
  filters: { source: null, placement: null, creative: null },
  sort: "impressions",
  generatedAt: "2026-10-07 20:15",
  ...patch,
});

const section = (report, titleKey) =>
  report.sections.find((s) => s.title === titleKey);

test("Tbilisi days: an ad's 00:00 start is 20:00Z the day before", () => {
  assert.equal(tbilisiDayOf("2026-10-05T20:00:00+00:00"), "2026-10-06");
  assert.equal(tbilisiDayOf("2026-10-31T19:59:59.999+00:00"), "2026-10-31");
  assert.equal(tbilisiDayOf(null), null);
  assert.equal(tbilisiDayOf("not a date"), null);
  assert.equal(campaignPeriodText(banner), "2026-10-06 – …");
  assert.equal(campaignPeriodText(ad), "2026-10-02 – 2026-10-31");
  assert.equal(campaignPeriodText(deleted), null);
});

test("creatives sort like the page: highest first, no-CTR last, stable ties", () => {
  const rows = [deleted, grid, banner, ad];
  const ids = (key) => sortBannerCreatives(rows, key).map((c) => c.id);
  assert.deepEqual(ids("impressions"), [ad.id, banner.id, grid.id, deleted.id]);
  assert.deepEqual(ids("reach"), [ad.id, banner.id, grid.id, deleted.id]);
  assert.deepEqual(ids("clicks"), [ad.id, grid.id, deleted.id, banner.id]);
  // CTR: grid 10.0, ad 5.0, banner 0.0, deleted none.
  assert.deepEqual(ids("ctr"), [grid.id, ad.id, banner.id, deleted.id]);
  assert.deepEqual(
    rows.map((c) => c.id),
    [deleted.id, grid.id, banner.id, ad.id],
  );
  assert.deepEqual(
    [...BANNER_SORT_KEYS],
    ["impressions", "reach", "clicks", "ctr"],
  );
});

test("the whole page: every card, in page order", () => {
  const report = buildBannerReport(data(), input(), labels);
  assert.deepEqual(
    report.sections.map((s) => s.title),
    ["export.blocks.kpis", "chartTitle", "byPlacementTitle", "byCreativeTitle"],
  );
  assert.equal(report.title, "export.title: export.blocks.all");
  assert.equal(
    report.fileStem,
    "mybakuriani-ad-analytics-all-2026-09-08_2026-10-07",
  );
  assert.match(report.fileStem, /^[\x20-\x7e]+$/);
  assert.equal(
    report.stamp,
    'export.periodShort{"from":"2026-09-08","to":"2026-10-07"} · export.generated{"date":"2026-10-07 20:15"}',
  );
  assert.deepEqual(report.meta, [
    'export.period{"from":"2026-09-08","to":"2026-10-07"}',
    "export.scopeFiltered",
    "export.noFilters",
    "sortBy metrics.impressions",
    'trackedSince{"date":"2026-10-06"}',
    'export.generated{"date":"2026-10-07 20:15"}',
    "definitions",
  ]);
});

test("KPI card: the tiles, CTR in percent, live now; null CTR without impressions", () => {
  const kpis = section(
    buildBannerReport(data(), input({ block: "kpis" }), labels),
    "export.blocks.kpis",
  );
  assert.deepEqual(kpis.rows, [
    ["metrics.impressions", 75],
    ["metrics.reach", 56],
    ["metrics.clicks", 3],
    ["metrics.ctr (%)", 4],
    ["metrics.opens", 1],
    ["metrics.live", 1],
  ]);
  assert.deepEqual(kpis.notes, ["export.liveNote"]);
  const empty = section(
    buildBannerReport(
      data({
        totals: { views: 0, opens: 0, clicks: 0, impressions: 0, reach: 0 },
      }),
      input({ block: "kpis" }),
      labels,
    ),
    "export.blocks.kpis",
  );
  assert.equal(empty.rows[3][1], null);
});

test("one creative's report: period and SOV tiles, no placement card in the page export", () => {
  const filters = { source: "ad", placement: null, creative: ad.id };
  const report = buildBannerReport(data(), input({ filters }), labels);
  assert.deepEqual(
    report.sections.map((s) => s.title),
    ["export.blocks.kpis", "chartTitle", "byCreativeTitle"],
  );
  assert.deepEqual(section(report, "export.blocks.kpis").rows.slice(6), [
    ["columns.period", "2026-10-02 – 2026-10-31"],
    ["metrics.sovPlanned (%)", 50],
    ["metrics.sovActual (%)", 50],
  ]);
  assert.equal(
    report.meta[2],
    'export.filters{"list":"source: sources.adPlural; creativeReport{\\"title\\":\\"=HYPERLINK(1)\\"}"}',
  );
  assert.equal(
    report.fileStem,
    "mybakuriani-ad-analytics-all-2026-09-08_2026-10-07-22222222",
  );
  // Asked for on its own, the placement table is still given.
  const placements = buildBannerReport(
    data(),
    input({ block: "placements", filters }),
    labels,
  );
  assert.deepEqual(
    placements.sections.map((s) => s.title),
    ["byPlacementTitle"],
  );
});

test("daily and placement cards", () => {
  const report = buildBannerReport(data(), input(), labels);
  assert.deepEqual(section(report, "chartTitle").rows, [
    ["2026-10-06", 19, 1, 0],
    ["2026-10-07", 56, 0, 3],
  ]);
  const placements = section(report, "byPlacementTitle");
  assert.deepEqual(
    placements.columns.map((c) => c.header),
    [
      "PLACEMENT",
      "columns.creatives",
      "metrics.impressions",
      "metrics.opens",
      "metrics.clicks",
      "metrics.reach",
      "metrics.ctr (%)",
    ],
  );
  assert.deepEqual(placements.rows, [["P:sticky_bottom", 1, 25, 1, 0, 17, 0]]);
  const none = section(
    buildBannerReport(data({ by_placement: [] }), input(), labels),
    "byPlacementTitle",
  );
  assert.deepEqual([none.rows, none.notes], [[], ["empty"]]);
});

test("creatives card: names, SOV, Tbilisi dates; all-time counters kept apart", () => {
  const report = buildBannerReport(
    data(),
    input({ block: "creatives", sort: "ctr" }),
    labels,
  );
  assert.deepEqual(report.meta[3], "sortBy metrics.ctr");
  const table = section(report, "byCreativeTitle");
  assert.equal(table.columns.length, 14);
  assert.ok(table.columns.slice(5).every((c) => c.kind === "number"));
  // prettier-ignore
  assert.deepEqual(table.rows, [
    ["sources.ad", "Grid", "P:listing_grid", null, "status.scheduled", 10, 0, 1, 9, 10, "sovRotation", null, null, null],
    ["sources.ad", "=HYPERLINK(1)", "P:home_hero", "2026-10-02 – 2026-10-31", "status.live", 40, 0, 2, 30, 5, 50, 50, 142, 2],
    ["sources.banner", "რრროოდის", "P:sticky_bottom", "2026-10-06 – …", "status.live", 25, 1, 0, 17, 0, null, null, null, null],
    ["sources.ad", 'deletedTitle{"source":"sources.ad"}', null, null, "status.deleted", 0, 0, 0, 0, null, null, null, null, null],
  ]);
  assert.deepEqual(table.notes, ["export.allTimeNote"]);
  const empty = section(
    buildBannerReport(
      data({ creatives: [] }),
      input({ block: "creatives" }),
      labels,
    ),
    "byCreativeTitle",
  );
  assert.deepEqual([empty.rows, empty.notes], [[], ["noCreatives"]]);
});

test("full scope and filter lines", () => {
  const full = buildBannerReport(data(), input({ scope: "full" }), labels);
  assert.equal(full.meta[1], "export.scopeFull");
  assert.match(full.fileStem, /-full$/);
  const filtered = buildBannerReport(
    data({ tracked_since: null }),
    input({
      block: "daily",
      filters: { source: "banner", placement: "home_hero", creative: null },
    }),
    labels,
  );
  assert.deepEqual(filtered.meta.slice(2, 4), [
    'export.filters{"list":"source: sources.bannerPlural; PLACEMENT: P:home_hero"}',
    "notTrackedYet",
  ]);
});

test("every key an export asks for exists in ka, en and ru", () => {
  const statuses = ["live", "scheduled", "paused", "off", "expired", "deleted"];
  const all = statuses.flatMap((status, i) => [
    creative({
      id: `0000000${i}-0000-4000-8000-000000000000`,
      status,
      title: null,
    }),
    creative({
      id: `1000000${i}-0000-4000-8000-000000000000`,
      status,
      source: "banner",
      title: null,
    }),
  ]);
  for (const block of BANNER_EXPORT_BLOCKS) {
    for (const scope of ["filtered", "full"]) {
      for (const sort of BANNER_SORT_KEYS) {
        for (const filters of [
          { source: null, placement: null, creative: null },
          { source: "ad", placement: "home_hero", creative: all[0].id },
          { source: "banner", placement: null, creative: null },
        ]) {
          buildBannerReport(
            data({ creatives: all }),
            input({ block, scope, sort, filters }),
            labels,
          );
          buildBannerReport(
            data({ creatives: [], by_placement: [], tracked_since: null }),
            input({ block, scope, sort, filters }),
            labels,
          );
        }
      }
    }
  }
  const get = (obj, path) =>
    path
      .split(".")
      .reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
  const problems = [];
  for (const [lang, messages] of Object.entries(catalogs)) {
    for (const key of [
      ...asked,
      "export.page",
      "export.menuLabel",
      "export.pageButton",
    ]) {
      const value = get(messages.AdminAdAnalytics, key);
      if (typeof value !== "string" || !value.trim()) {
        problems.push(`${lang}: ${key}`);
      }
    }
    for (const key of [
      "failed",
      "rateLimited",
      "button",
      "filtered",
      "full",
      "xlsx",
      "csv",
      "pdf",
    ]) {
      if (typeof messages.AdminAnalytics.export[key] !== "string") {
        problems.push(`${lang}: AdminAnalytics.export.${key}`);
      }
    }
  }
  assert.deepEqual(problems, []);
  assert.ok(asked.size > 30);
});

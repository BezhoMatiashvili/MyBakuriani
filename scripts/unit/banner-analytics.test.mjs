import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  BANNER_ANALYTICS_DEFAULT_DAYS,
  BANNER_ANALYTICS_MAX_DAYS,
  BANNER_ANALYTICS_PRESETS,
  BANNER_EVENTS,
  BANNER_SOURCES,
  ctrPercent,
  isBannerEvent,
  isBannerSource,
} from "../../src/lib/banner-analytics.ts";

// C46: the beacon vocabulary must equal what the SQL accepts, or a new event
// or source is refused (22023, the beacon answers 500) on one side only.
const dir = new URL("../../supabase/migrations/", import.meta.url);

/** Body of the newest migration that defines `public.<name>(`. */
function newestDefinition(name) {
  const re = new RegExp(`create or replace function public\\.${name}\\(`, "i");
  const file = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => re.test(readFileSync(new URL(f, dir), "utf8")))
    .at(-1);
  assert.ok(file, `no migration defines ${name}`);
  const sql = readFileSync(new URL(file, dir), "utf8");
  const start = sql.search(re);
  return sql.slice(start, sql.indexOf("$$;", start));
}

const quoted = (list) => [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

test("record_banner_event accepts exactly BANNER_EVENTS", () => {
  const body = newestDefinition("record_banner_event");
  const m = body.match(/p_event not in \(([^)]*)\)/);
  assert.ok(m, "event list not found");
  assert.deepEqual(quoted(m[1]).sort(), [...BANNER_EVENTS].sort());
});

test("record_banner_event branches on exactly BANNER_SOURCES", () => {
  const body = newestDefinition("record_banner_event");
  const sources = [...body.matchAll(/p_source = '([a-z_]+)'/g)].map(
    (m) => m[1],
  );
  assert.deepEqual([...new Set(sources)].sort(), [...BANNER_SOURCES].sort());
});

test("the table CHECK and the read RPC agree on BANNER_SOURCES", () => {
  const sql = readFileSync(
    new URL("20261006180000_banner_analytics.sql", dir),
    "utf8",
  );
  const check = sql.match(
    /source text not null check \(source in \(([^)]*)\)\)/,
  );
  assert.ok(check, "banner_metrics_daily.source CHECK not found");
  assert.deepEqual(quoted(check[1]).sort(), [...BANNER_SOURCES].sort());

  const read = newestDefinition("admin_banner_analytics");
  const m = read.match(/p_source not in \(([^)]*)\)/);
  assert.ok(m, "read RPC source list not found");
  assert.deepEqual(quoted(m[1]).sort(), [...BANNER_SOURCES].sort());
});

test("the read RPC range limit equals BANNER_ANALYTICS_MAX_DAYS", () => {
  const read = newestDefinition("admin_banner_analytics");
  const m = read.match(/p_to - p_from > (\d+)/);
  assert.ok(m, "range limit not found");
  // p_to - p_from counts gaps; the limit is inclusive days.
  assert.equal(Number(m[1]) + 1, BANNER_ANALYTICS_MAX_DAYS);
});

test("presets fit the range limit and include the default", () => {
  assert.ok(BANNER_ANALYTICS_PRESETS.includes(BANNER_ANALYTICS_DEFAULT_DAYS));
  for (const days of BANNER_ANALYTICS_PRESETS) {
    assert.ok(days >= 1 && days <= BANNER_ANALYTICS_MAX_DAYS);
  }
});

test("ctrPercent", () => {
  assert.equal(ctrPercent(0, 0), null);
  assert.equal(ctrPercent(3, 0), null);
  assert.equal(ctrPercent(1, 3), 33.3);
  assert.equal(ctrPercent(2, 176), 1.1);
  assert.equal(ctrPercent(0, 50), 0);
  assert.equal(ctrPercent(5, 5), 100);
});

test("isBannerEvent / isBannerSource", () => {
  for (const e of BANNER_EVENTS) assert.ok(isBannerEvent(e));
  for (const s of BANNER_SOURCES) assert.ok(isBannerSource(s));
  for (const bad of ["", "View", "impression", null, undefined, 1, {}]) {
    assert.equal(isBannerEvent(bad), false);
    assert.equal(isBannerSource(bad), false);
  }
  // A source is not an event and vice versa.
  assert.equal(isBannerEvent("ad"), false);
  assert.equal(isBannerSource("click"), false);
});

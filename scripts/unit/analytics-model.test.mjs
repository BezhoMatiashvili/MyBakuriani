// Admin analytics (C49): vocabularies against the migration, periods, the URL
// query every surface parses, the session cookie and the small cleaners.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  ADVERTISER_MAX_LENGTH,
  CLIENT_EVENTS,
  DEVICES,
  DIMENSION_KEYS,
  ENGAGED_SESSION_MS,
  EVENT_NAMES,
  LEAD_EVENTS,
  LISTING_KINDS,
  LIVE_WINDOW_MINUTES,
  MAX_PING_MS,
  MAX_RANGE_DAYS,
  PAGE_TYPES,
  SESSION_IDLE_SECONDS,
  TRAFFIC_SOURCES,
  addDays,
  analyticsQueryToParams,
  clampPingMs,
  cleanCity,
  cleanCountry,
  cleanUtm,
  continuesSession,
  formatSessionCookie,
  hasDimensionFilter,
  isIsoDate,
  parseAdvertiser,
  parseAnalyticsQuery,
  parseSessionCookie,
  presetRange,
  previousRange,
  rangeDays,
  tbilisiDateTime,
  tbilisiToday,
  withoutDimensions,
} from "../../src/lib/analytics/model.ts";
import { BANNER_ANALYTICS_MAX_DAYS } from "../../src/lib/banner-analytics.ts";

const root = new URL("../../", import.meta.url);
const migration = readdirSync(new URL("supabase/migrations/", root))
  .filter((f) => f.endsWith("_admin_analytics.sql"))
  .sort()
  .map((f) =>
    readFileSync(new URL(`supabase/migrations/${f}`, root), "utf8").replace(
      /--[^\n]*/g,
      "",
    ),
  )
  .join("\n");
const literals = (text) => [...text.matchAll(/'([^']+)'/g)].map((m) => m[1]);
const fnBody = (name) => {
  const m = migration.match(
    new RegExp(
      `function public\\.${name}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`,
    ),
  );
  assert.ok(m, `function ${name} in the migration`);
  return m[1];
};
const sorted = (xs) => [...new Set(xs)].sort();

test("vocabularies equal the migration's CHECK lists and function outputs", () => {
  for (const [, list] of migration.matchAll(/\bsource in \(([^)]*)\)/g)) {
    assert.deepEqual(sorted(literals(list)), sorted(TRAFFIC_SOURCES));
  }
  for (const [, list] of migration.matchAll(/\bdevice in \(([^)]*)\)/g)) {
    assert.deepEqual(sorted(literals(list)), sorted(DEVICES));
  }
  const dims = fnBody("analytics_check_dims");
  assert.deepEqual(
    sorted(literals(dims.match(/p_page_type not in \(([^)]*)\)/)[1])),
    sorted(PAGE_TYPES),
  );
  assert.deepEqual(
    sorted(
      [
        ...fnBody("analytics_page_type").matchAll(/(?:then|else) '([^']+)'/g),
      ].map((m) => m[1]),
    ),
    sorted(PAGE_TYPES),
  );
  assert.deepEqual(
    literals(
      fnBody("admin_analytics_listings").match(
        /unnest\(array\[([^\]]*)\]\) with ordinality/,
      )[1],
    ),
    [...LISTING_KINDS],
  );
  assert.deepEqual(
    literals(
      migration.match(/name text not null check \(name in \(([^)]*)\)/)[1],
    ),
    [...EVENT_NAMES],
  );
  const keyActions = [
    ...fnBody("admin_analytics_traffic").matchAll(/\.name in \(([^)]*)\)/g),
  ];
  assert.ok(keyActions.length > 0);
  for (const [, list] of keyActions) {
    assert.deepEqual(literals(list), [...LEAD_EVENTS]);
  }
  for (const name of [...LEAD_EVENTS, ...CLIENT_EVENTS]) {
    assert.ok(EVENT_NAMES.includes(name), name);
  }
});

test("limits equal the SQL and the banner analytics cap", () => {
  assert.equal(MAX_RANGE_DAYS, BANNER_ANALYTICS_MAX_DAYS);
  const range = fnBody("analytics_check_range").match(/p_to - p_from > (\d+)/);
  assert.equal(Number(range[1]) + 1, MAX_RANGE_DAYS);
  assert.match(
    migration,
    new RegExp(
      `char_length\\(advertiser\\) between 1 and ${ADVERTISER_MAX_LENGTH}\\b`,
    ),
  );
  assert.match(
    fnBody("analytics_ping"),
    new RegExp(`p_ms > ${MAX_PING_MS}\\b`),
  );
  assert.match(
    migration,
    new RegExp(`p_minutes integer default ${LIVE_WINDOW_MINUTES}\\b`),
  );
  assert.equal(SESSION_IDLE_SECONDS, 30 * 60);
  assert.match(migration, /interval '30 minutes'/);
  assert.match(
    fnBody("admin_analytics_traffic"),
    new RegExp(`>= ${ENGAGED_SESSION_MS}\\b`),
  );
});

test("dates are Tbilisi calendar days", () => {
  assert.equal(tbilisiToday(new Date("2026-10-06T19:59:00Z")), "2026-10-06");
  assert.equal(tbilisiToday(new Date("2026-10-06T20:00:00Z")), "2026-10-07");
  assert.equal(
    tbilisiDateTime(new Date("2026-10-06T20:30:00Z")),
    "2026-10-07 00:30",
  );
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(rangeDays({ from: "2026-10-01", to: "2026-10-01" }), 1);
  assert.equal(rangeDays({ from: "2026-03-01", to: "2026-03-31" }), 31);
  assert.ok(isIsoDate("2026-02-28"));
  assert.ok(!isIsoDate("2026-02-30"));
  assert.ok(!isIsoDate("2026-2-3"));
  assert.ok(!isIsoDate("1999-01-01"));
});

test("period presets and the comparison period", () => {
  const today = "2026-10-06";
  assert.deepEqual(presetRange("today", today), { from: today, to: today });
  assert.deepEqual(presetRange("yesterday", today), {
    from: "2026-10-05",
    to: "2026-10-05",
  });
  assert.deepEqual(presetRange("last7", today), {
    from: "2026-09-30",
    to: today,
  });
  assert.deepEqual(presetRange("last30", today), {
    from: "2026-09-07",
    to: today,
  });
  assert.deepEqual(presetRange("thisMonth", today), {
    from: "2026-10-01",
    to: today,
  });
  assert.deepEqual(presetRange("thisMonth", "2026-03-01"), {
    from: "2026-03-01",
    to: "2026-03-01",
  });
  assert.equal(presetRange("custom", today), null);
  assert.deepEqual(previousRange({ from: "2026-09-30", to: today }), {
    from: "2026-09-23",
    to: "2026-09-29",
  });
  assert.deepEqual(previousRange({ from: today, to: today }), {
    from: "2026-10-05",
    to: "2026-10-05",
  });
  assert.equal(rangeDays(previousRange({ from: "2026-09-07", to: today })), 30);
});

test("the dashboard query parses, defaults and round-trips", () => {
  const today = "2026-10-06";
  const parse = (qs) => parseAnalyticsQuery(new URLSearchParams(qs), today);

  const fallback = parse("");
  assert.equal(fallback.period, "last30");
  assert.deepEqual(fallback.range, { from: "2026-09-07", to: today });
  assert.equal(fallback.compare, false);
  assert.equal(fallback.granularity, "day");
  assert.ok(!hasDimensionFilter(fallback.dims));

  const full = parse(
    "period=custom&from=2026-01-01&to=2026-06-30&compare=1&gran=week&device=mobile&country=ge&city=Tbilisi&source=google&page=apartments",
  );
  assert.equal(full.period, "custom");
  assert.deepEqual(full.range, { from: "2026-01-01", to: "2026-06-30" });
  assert.equal(full.compare, true);
  assert.equal(full.granularity, "week");
  assert.deepEqual(full.dims, {
    device: "mobile",
    country: "GE",
    city: "Tbilisi",
    source: "google",
    page: "apartments",
  });
  assert.deepEqual(parse(analyticsQueryToParams(full).toString()), full);
  assert.deepEqual(
    [...analyticsQueryToParams(full).keys()].filter((k) =>
      DIMENSION_KEYS.includes(k),
    ),
    [...DIMENSION_KEYS],
  );

  for (const bad of [
    "period=custom&from=2026-06-30&to=2026-01-01",
    "period=custom&from=2026-10-01&to=2026-10-07",
    "period=custom&from=2025-10-05&to=2026-10-06",
    "period=custom&from=2026-02-30&to=2026-03-01",
    "period=custom",
  ]) {
    assert.equal(parse(bad).period, "last30", bad);
  }
  assert.equal(
    parse("period=custom&from=2025-10-06&to=2026-10-06").period,
    "custom",
  );

  const junk = parse(
    "period=forever&gran=year&device=tv&source=tiktok&page=admin&country=Georgia&city=Tbilisi",
  );
  assert.equal(junk.period, "last30");
  assert.equal(junk.granularity, "day");
  assert.ok(!hasDimensionFilter(junk.dims));
  assert.equal(parse("city=Tbilisi").dims.city, null);
  assert.equal(parse("country=GE&city=%3Cb%3E").dims.city, null);

  const stripped = withoutDimensions(full);
  assert.ok(!hasDimensionFilter(stripped.dims));
  assert.deepEqual(stripped.range, full.range);
  assert.equal(stripped.compare, true);
  assert.equal(stripped.granularity, "week");
  assert.ok(hasDimensionFilter(full.dims), "withoutDimensions copies");
});

test("the session cookie and the GA session rule", () => {
  const session = {
    id: "0f8fad5b-d9cb-469f-a165-70867728950e",
    source: "google",
    device: "mobile",
  };
  const raw = formatSessionCookie(session);
  assert.equal(raw, "0f8fad5b-d9cb-469f-a165-70867728950e.google.mobile");
  assert.deepEqual(parseSessionCookie(raw), session);
  assert.deepEqual(
    parseSessionCookie(`${session.id.toUpperCase()}.google.mobile`),
    session,
  );
  for (const bad of [
    null,
    "",
    "nope",
    `${raw}.extra`,
    raw.replace("google", "tiktok"),
    raw.replace("mobile", "tv"),
    `x${raw}`,
  ]) {
    assert.equal(parseSessionCookie(bad), null, String(bad));
  }

  assert.equal(continuesSession(null, false, "direct"), false);
  assert.equal(continuesSession(session, false, "direct"), true);
  assert.equal(continuesSession(session, true, "google"), true);
  assert.equal(continuesSession(session, true, "facebook"), false);
});

test("cleaners", () => {
  assert.equal(cleanUtm("  Facebook "), "facebook");
  assert.equal(cleanUtm(""), null);
  assert.equal(cleanUtm(42), null);
  assert.equal(cleanUtm("a".repeat(150)).length, 100);
  assert.equal(cleanUtm(`x${String.fromCharCode(10)}y`), null);

  assert.equal(clampPingMs(1500.4), 1500);
  assert.equal(clampPingMs(-5), 0);
  assert.equal(clampPingMs("abc"), 0);
  assert.equal(clampPingMs(Number.POSITIVE_INFINITY), 0);
  assert.equal(clampPingMs(10 * 60 * 1000), MAX_PING_MS);

  assert.equal(cleanCountry(" ge "), "GE");
  assert.equal(cleanCountry("GEO"), null);
  assert.equal(cleanCity("Tbilisi"), "Tbilisi");
  assert.equal(cleanCity("x".repeat(81)), null);
  assert.equal(cleanCity(""), null);

  assert.equal(parseAdvertiser(undefined), null);
  assert.equal(parseAdvertiser(null), null);
  assert.equal(parseAdvertiser("   "), null);
  assert.equal(
    parseAdvertiser(`  Acme   Ltd${String.fromCharCode(10)} `),
    "Acme Ltd",
  );
  assert.equal(
    parseAdvertiser("ა".repeat(ADVERTISER_MAX_LENGTH)),
    "ა".repeat(ADVERTISER_MAX_LENGTH),
  );
  assert.equal(
    parseAdvertiser("a".repeat(ADVERTISER_MAX_LENGTH + 1)),
    undefined,
  );
  assert.equal(parseAdvertiser(7), undefined);
});

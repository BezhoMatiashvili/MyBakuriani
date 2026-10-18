// Admin analytics (C49) message keys. The blocks and the exports build many
// keys from data (`devices.${device}`), which typecheck cannot see and
// next-intl does not reject: a missing key prints its own path into a file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import {
  DEVICES,
  DIMENSION_KEYS,
  EXPORT_BLOCKS,
  EXPORT_FORMATS,
  EXPORT_SCOPES,
  GRANULARITIES,
  LEAD_EVENTS,
  LISTING_KINDS,
  PAGE_TYPES,
  PERIOD_PRESETS,
  TRAFFIC_SOURCES,
} from "../../src/lib/analytics/model.ts";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const catalogs = Object.fromEntries(
  ["ka", "en", "ru"].map((l) => [l, JSON.parse(read(`messages/${l}.json`))]),
);

function get(obj, path) {
  return path
    .split(".")
    .reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
}

function missingKeys(namespace, keys) {
  const problems = [];
  for (const [lang, messages] of Object.entries(catalogs)) {
    for (const key of keys) {
      const value = get(messages[namespace], key);
      if (typeof value !== "string" || !value.trim()) {
        problems.push(`${lang}: ${namespace}.${key}`);
      }
    }
  }
  return problems;
}

const KPI_TILES = [
  "uniqueUsers",
  "activeUsers",
  "newUsers",
  "returningUsers",
  "sessions",
  "pageviews",
  "engagementRate",
  "keyActions",
];

test("every key built from data has a label in every locale", () => {
  const groups = {
    devices: DEVICES,
    sources: [...TRAFFIC_SOURCES, "unknown"],
    pageTypes: PAGE_TYPES,
    kinds: LISTING_KINDS,
    period: PERIOD_PRESETS,
    granularity: GRANULARITIES,
    blocks: EXPORT_BLOCKS,
    keyActionNames: LEAD_EVENTS,
    "export.bucket": GRANULARITIES,
    filters: DIMENSION_KEYS,
    export: [...EXPORT_SCOPES, ...EXPORT_FORMATS],
    kpis: KPI_TILES,
    "kpis.hint": KPI_TILES,
    listings: [
      "active",
      "new",
      "views",
      "saves",
      "calls",
      "messages",
      "smartMatch",
      "unsplit",
    ],
    smartmatch: [
      "requests",
      "requestsWithOffer",
      "matchRate",
      "matching",
      "responses",
      "leads",
    ],
    ads: [
      "impressions",
      "reach",
      "clicks",
      "ctr",
      "activeAds",
      "advertisers",
      "revenue",
      "creatives",
    ],
  };
  const keys = Object.entries(groups).flatMap(([group, values]) =>
    values.map((v) => `${group}.${v}`),
  );
  assert.deepEqual(missingKeys("AdminAnalytics", keys), []);
  assert.deepEqual(
    missingKeys("AdminModeration", [
      "advertiser",
      "advertiserPlaceholder",
      "advertiserHint",
      "advertiserNone",
    ]),
    [],
  );
});

// Translator variables whose namespace is not declared in the file itself.
const PARAMETER_TRANSLATORS = {
  "src/lib/analytics/report.ts": { t: "AdminAnalytics" },
};

function* sourceFiles(path) {
  if (statSync(new URL(path, root)).isFile()) {
    yield path;
    return;
  }
  for (const name of readdirSync(new URL(path, root))) {
    const child = `${path}/${name}`;
    if (statSync(new URL(child, root)).isDirectory()) yield* sourceFiles(child);
    else if (/\.(ts|tsx)$/.test(name)) yield child;
  }
}

test("every literal key the analytics code uses exists in all locales", () => {
  const paths = [
    "src/lib/analytics",
    "src/components/admin/analytics",
    "src/app/api/admin/analytics",
    "src/app/[locale]/dashboard/admin/AdminDashboardClient.tsx",
  ];
  const problems = [];
  let checked = 0;
  for (const path of paths) {
    for (const file of sourceFiles(path)) {
      const source = read(file);
      const translators = { ...(PARAMETER_TRANSLATORS[file] ?? {}) };
      for (const m of source.matchAll(
        /\bconst\s+(\w+)\s*=\s*useTranslations\(\s*"(\w+)"\s*\)/g,
      )) {
        translators[m[1]] = m[2];
      }
      for (const m of source.matchAll(
        /\bconst\s+(\w+)\s*=\s*await\s+getTranslations\(\{[^}]*namespace:\s*"(\w+)"[^}]*\}\)/g,
      )) {
        translators[m[1]] = m[2];
      }
      for (const [name, namespace] of Object.entries(translators)) {
        const call = new RegExp(`\\b${name}\\(\\s*"([A-Za-z0-9_.]+)"`, "g");
        for (const m of source.matchAll(call)) {
          checked += 1;
          for (const problem of missingKeys(namespace, [m[1]])) {
            problems.push(`${file}: ${problem}`);
          }
        }
      }
      // Chart series carry their label key as data: t(series.label).
      if (file.endsWith("TrafficBlocks.tsx")) {
        for (const m of source.matchAll(/\blabel: "([A-Za-z0-9_.]+)"/g)) {
          checked += 1;
          problems.push(
            ...missingKeys("AdminAnalytics", [m[1]]).map(
              (p) => `${file}: ${p}`,
            ),
          );
        }
      }
    }
  }
  assert.ok(checked > 100, `only ${checked} keys checked`);
  assert.deepEqual(problems, []);
});

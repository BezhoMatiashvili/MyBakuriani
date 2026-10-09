// SMS financial control (C50). The filter parser shared by the page, its API
// and its exports; the unit cost shown before a package is saved; the kind
// list against the migrations (a kind the page cannot word prints its key);
// and every AdminSmsControl key the page and the exports build, in ka/en/ru.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  MAX_SMS_UNITS,
  NO_SMS_FILTERS,
  SMS_CATEGORIES,
  SMS_EXPORT_BLOCKS,
  SMS_KIND_KEYS,
  SMS_LEDGER_STATUSES,
  parseSmsFilters,
  smsFiltersToQuery,
  smsKindKey,
  smsUnitCost,
} from "../../src/lib/finance/sms.ts";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const catalogs = Object.fromEntries(
  ["ka", "en", "ru"].map((l) => [l, JSON.parse(read(`messages/${l}.json`))]),
);
const migrationNames = readdirSync(new URL("supabase/migrations/", root))
  .filter((f) => f.endsWith(".sql"))
  .sort();
const migrations = migrationNames.map((f) => read(`supabase/migrations/${f}`));
const smsMigration = read(
  "supabase/migrations/20261007200000_finance_sms_control.sql",
);

const parse = (query) => parseSmsFilters(new URLSearchParams(query));

function get(obj, path) {
  return path
    .split(".")
    .reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
}

function missing(keys) {
  const out = [];
  for (const [lang, messages] of Object.entries(catalogs)) {
    for (const key of keys) {
      const value = get(messages.AdminSmsControl, key);
      if (typeof value !== "string" || !value.trim())
        out.push(`${lang}: ${key}`);
    }
  }
  return out;
}

test("no filter is the whole history", () => {
  assert.deepEqual(parse(""), { ok: true, filters: NO_SMS_FILTERS });
  assert.deepEqual(parse("from=&to=&type=&status="), {
    ok: true,
    filters: NO_SMS_FILTERS,
  });
});

test("filters parse and round-trip through the query string", () => {
  const result = parse(
    "from=2026-09-01&to=2026-09-30&type=otp&status=delivered",
  );
  assert.deepEqual(result, {
    ok: true,
    filters: {
      from: "2026-09-01",
      to: "2026-09-30",
      category: "otp",
      status: "delivered",
    },
  });
  assert.deepEqual(parse(smsFiltersToQuery(result.filters)), result);
  assert.equal(smsFiltersToQuery(NO_SMS_FILTERS), "");
  assert.equal(
    smsFiltersToQuery({ ...NO_SMS_FILTERS, category: "marketing" }),
    "type=marketing",
  );
});

test("malformed filters are refused, never dropped", () => {
  assert.deepEqual(parse("from=2026-02-30"), {
    ok: false,
    error: "invalid_date",
  });
  assert.deepEqual(parse("from=26-09-01"), {
    ok: false,
    error: "invalid_date",
  });
  assert.deepEqual(parse("to=2026-13-01"), { ok: false, error: "invalid_to" });
  assert.deepEqual(parse("from=2026-09-02&to=2026-09-01"), {
    ok: false,
    error: "invalid_to",
  });
  assert.deepEqual(parse("type=promo"), {
    ok: false,
    error: "invalid_request",
  });
  assert.deepEqual(parse("status=queued"), {
    ok: false,
    error: "invalid_request",
  });
  // One day is a valid range.
  assert.equal(parse("from=2026-09-01&to=2026-09-01").ok, true);
});

test("unit cost = amount / SMS count, 6 decimals like the generated column", () => {
  assert.equal(smsUnitCost(50, 1000), 0.05);
  assert.equal(smsUnitCost(10, 3), 3.333333);
  assert.equal(smsUnitCost(0.12, 4), 0.03);
  assert.equal(smsUnitCost(100, 0), null);
  assert.equal(smsUnitCost(100, 2.5), null);
  assert.equal(smsUnitCost(Number.NaN, 10), null);
  assert.match(
    smsMigration,
    /unit_cost numeric\(14, ?6\) GENERATED ALWAYS AS \(round\(amount_gel \/ nullif\(units, 0\), 6\)\) STORED/,
  );
});

test("the SMS count limit equals both CHECKs", () => {
  const bound = (name) =>
    Number(
      smsMigration.match(
        new RegExp(`${name}[\\s\\S]{0,80}?BETWEEN (\\d+) AND (\\d+)`),
      )?.[2],
    );
  assert.equal(bound("sms_provider_purchases_units_check"), MAX_SMS_UNITS);
  assert.equal(bound("sms_low_balance_units"), MAX_SMS_UNITS);
});

test("the six types and three statuses are the spec's, in its order", () => {
  assert.deepEqual(
    [...SMS_CATEGORIES],
    ["otp", "smart_match", "listing", "marketing", "admin", "other"],
  );
  assert.deepEqual([...SMS_LEDGER_STATUSES], ["sent", "delivered", "failed"]);
  // The summary lists the types in the same order.
  assert.match(
    smsMigration,
    /'otp', 'smart_match', 'listing', 'marketing', 'admin', 'other'/,
  );
});

test("SMS_KIND_KEYS = every automation kind + legacy + both code kinds + every texted notification", () => {
  const newest = (pattern) =>
    [...migrations].reverse().find((sql) => pattern.test(sql));
  const kindCheck = newest(/constraint sms_outbound_automation_kind_check/i);
  const kinds = [
    ...kindCheck
      .slice(
        kindCheck.search(/add constraint sms_outbound_automation_kind_check/i),
      )
      .match(/array\[([\s\S]*?)\]/i)[1]
      .matchAll(/'([^']+)'/g),
  ].map((m) => m[1]);
  const typesSql = newest(/function public\.sms_notification_types\(\)/i);
  const typesBody = typesSql.slice(
    typesSql.search(/function public\.sms_notification_types\(\)/i),
  );
  const types = [
    ...typesBody
      .slice(
        typesBody.indexOf("array["),
        typesBody.indexOf("]", typesBody.indexOf("array[")),
      )
      .replace(/--[^\n]*/g, "")
      .matchAll(/'([^']+)'/g),
  ].map((m) => m[1]);
  assert.ok(
    kinds.length >= 9 && types.length >= 11,
    `read ${kinds.length} kinds, ${types.length} types`,
  );
  const authKinds = [
    ...read("supabase/migrations/20261006230000_auth_sms_code_log.sql")
      .match(/kind text NOT NULL CHECK \(kind IN \(([^)]*)\)\)/)[1]
      .matchAll(/'([^']+)'/g),
  ].map((m) => m[1]);
  const expected = new Set([
    ...kinds,
    "legacy",
    ...authKinds,
    ...types.map((t) => `notification_${t}`),
  ]);
  assert.deepEqual(new Set(SMS_KIND_KEYS), expected);
  assert.equal(
    smsKindKey("notification:smart_match_offer"),
    "notification_smart_match_offer",
  );
  assert.equal(smsKindKey("check_in"), "check_in");
});

test("every AdminSmsControl key the page and the exports use exists in ka, en and ru", () => {
  const sources = [
    "src/app/[locale]/dashboard/admin/finances/sms/page.tsx",
    "src/lib/finance/server/sms.ts",
    "src/app/api/admin/finance/sms/export/route.ts",
  ].map(read);
  const literal = new Set();
  for (const text of sources) {
    for (const m of text.matchAll(/\bt\(\s*"([^"]+)"/g)) literal.add(m[1]);
  }
  assert.ok(literal.size > 80, `found ${literal.size} literal keys`);
  const built = [
    ...SMS_CATEGORIES.map((c) => `categories.${c}`),
    ...SMS_LEDGER_STATUSES.map((s) => `statuses.${s}`),
    ...SMS_KIND_KEYS.map((k) => `kinds.${k}`),
    ...SMS_EXPORT_BLOCKS.map((b) => `export.aria_${b}`),
    ...["filtered", "full"].map((s) => `export.scope_${s}`),
    "errors.invalid_units",
    "errors.invalid_threshold",
  ];
  assert.deepEqual(missing([...literal, ...built]), []);
});

test("the three catalogs hold the same AdminSmsControl keys and the nav labels", () => {
  const keys = (obj, prefix = "") =>
    Object.entries(obj).flatMap(([k, v]) =>
      v && typeof v === "object"
        ? keys(v, `${prefix}${k}.`)
        : [`${prefix}${k}`],
    );
  const [ka, en, ru] = ["ka", "en", "ru"].map((l) =>
    keys(catalogs[l].AdminSmsControl).sort(),
  );
  assert.deepEqual(en, ka);
  assert.deepEqual(ru, ka);
  for (const [lang, messages] of Object.entries(catalogs)) {
    assert.ok(
      messages.DashboardSidebar.nav.smsControl,
      `${lang}: DashboardSidebar.nav.smsControl`,
    );
    assert.ok(messages.AdminFinances.nav.sms, `${lang}: AdminFinances.nav.sms`);
  }
  // The owner's wording for the add button (§3).
  assert.equal(
    catalogs.ka.AdminSmsControl.purchases.add,
    "SMS პაკეტის დამატება",
  );
});

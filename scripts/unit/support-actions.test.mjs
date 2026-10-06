import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  ACTION_IDS,
  BROWSE_CATEGORIES,
  CREATE_KINDS,
  SEARCH_PROPERTY_TYPES,
  VERIFICATION_TABS,
  isSafeActionHref,
  MAX_TOPUP_GEL,
  SMART_MATCH_PARAM,
  SMART_MATCH_VALUE,
  actionHref,
  actionPagePaths,
  availableActionIds,
  isActionAvailable,
  normalizeAction,
  parseSmartMatchPrefill,
  parseTopUpParam,
} from "../../src/lib/support/actions.ts";
import { SUPPORT_CABINETS } from "../../src/lib/support/plan.ts";
import { parseRentSearchParams } from "../../src/lib/search/rentSearchQuery.ts";
import {
  SMART_MATCH_NEW_PARAM,
  SMART_MATCH_NEW_VALUE,
} from "../../src/lib/signup-links.ts";
import { MAX_CARD_TOPUP_TETRI } from "../../src/lib/payments/keepz/amount.ts";

const ZONES = [
  "დიდველი / კრისტალი",
  "ცენტრი / პარკი",
  "კოხტა / მიტარბი",
  "25-იანები",
];
const RLO = String.fromCharCode(0x202e);
const ctx = (cabinet, signedIn, extra = {}) => ({
  cabinet,
  signedIn,
  today: "2026-12-01",
  zones: ZONES,
  ...extra,
});

test("buttons are offered only where they make sense", () => {
  const visitor = availableActionIds(ctx("public", false));
  assert.ok(visitor.includes("sign_in"));
  assert.ok(visitor.includes("search_rent"));
  assert.ok(!visitor.includes("my_dashboard"));
  assert.ok(!visitor.some((id) => id.startsWith("admin_")));
  assert.ok(!visitor.includes("topup"));

  const guest = availableActionIds(ctx("guest", true));
  assert.ok(!guest.includes("sign_in"));
  assert.ok(guest.includes("smart_match"));
  assert.ok(!guest.includes("topup"));
  assert.ok(!guest.includes("calendar"));

  const renter = availableActionIds(ctx("renter", true));
  assert.ok(renter.includes("topup"));
  assert.ok(renter.includes("calendar"));
  assert.ok(!renter.includes("admin_clients"));

  assert.ok(isActionAvailable("admin_clients", ctx("admin", true)));
  assert.equal(isActionAvailable("nope", ctx("admin", true)), false);
  assert.equal(isActionAvailable("__proto__", ctx("admin", true)), false);
  assert.equal(isActionAvailable("toString", ctx("admin", true)), false);
});

test("normalizeAction keeps only valid params of that action", () => {
  assert.deepEqual(
    normalizeAction(
      "search_rent",
      {
        zone: "დიდველი",
        check_in: "2026-12-20",
        check_out: "2026-12-25",
        guests: "4",
        rooms: 99,
        price_max: 300,
        types: ["apartment", "castle", "apartment"],
        amount: 50,
        href: "https://evil.example",
      },
      ctx("public", false),
    ),
    {
      id: "search_rent",
      params: {
        zone: "დიდველი / კრისტალი",
        check_in: "2026-12-20",
        check_out: "2026-12-25",
        guests: 4,
        price_max: 300,
        types: ["apartment"],
      },
    },
  );
  // Dates in the past or impossible ones, unknown zones: dropped.
  assert.deepEqual(
    normalizeAction(
      "search_rent",
      { check_in: "2026-11-30", check_out: "2026-02-31", zone: "Paris" },
      ctx("public", false),
    ),
    { id: "search_rent" },
  );
  // Check-out before check-in: check-out dropped.
  assert.deepEqual(
    normalizeAction(
      "search_rent",
      { check_in: "2026-12-20", check_out: "2026-12-19" },
      ctx("public", false),
    ),
    { id: "search_rent", params: { check_in: "2026-12-20" } },
  );
  // A budget "from" above "up to" is dropped.
  assert.deepEqual(
    normalizeAction(
      "smart_match",
      { budget_min: 500, budget_max: 200 },
      ctx("guest", true),
    ),
    { id: "smart_match", params: { budget_max: 200 } },
  );
  assert.equal(normalizeAction("browse", {}, ctx("public", false)), null);
  assert.equal(
    normalizeAction("browse", { category: "admin" }, ctx("public", false)),
    null,
  );
  assert.equal(normalizeAction("topup", {}, ctx("guest", true)), null);
  assert.deepEqual(
    normalizeAction("topup", { amount: 99999 }, ctx("renter", true)),
    { id: "topup" },
  );
  assert.deepEqual(
    normalizeAction(
      "admin_clients",
      { query: `  ნინო${RLO}  ` },
      ctx("admin", true),
    ),
    { id: "admin_clients", params: { query: "ნინო" } },
  );
});

test("a search button lands on /search with filters the page reads back", () => {
  const href = actionHref(
    {
      id: "search_rent",
      params: {
        zone: "ცენტრი / პარკი",
        check_in: "2026-12-30",
        check_out: "2027-01-03",
        guests: 5,
        rooms: 2,
        price_max: 250,
      },
    },
    ctx("public", false),
  );
  const url = new URL(href, "https://mybakuriani.ge");
  assert.equal(url.pathname, "/search");
  const { values, mode } = parseRentSearchParams(url.searchParams);
  assert.equal(mode, "rent");
  assert.equal(values.location, "ცენტრი / პარკი");
  assert.equal(values.checkIn, "2026-12-30");
  assert.equal(values.checkOut, "2027-01-03");
  assert.equal(values.guests, 5);
  assert.equal(values.advancedFilters.bedrooms, 2);
  assert.equal(values.advancedFilters.priceMax, 250);
});

test("account-only buttons send visitors to sign in and on", () => {
  const href = actionHref(
    { id: "smart_match", params: { guests: 2 } },
    ctx("public", false),
  );
  assert.ok(href.startsWith("/auth/login?next="));
  const next = decodeURIComponent(href.slice("/auth/login?next=".length));
  assert.equal(next, "/dashboard/guest?smartMatch=new&guests=2");
  assert.equal(
    actionHref({ id: "smart_match" }, ctx("guest", true)),
    "/dashboard/guest?smartMatch=new",
  );
  // A tampered saved button is re-checked: not offered here, no link.
  assert.equal(actionHref({ id: "admin_clients" }, ctx("guest", true)), null);
});

test("contact buttons need the site's own contact details", () => {
  assert.equal(actionHref({ id: "call_support" }, ctx("guest", true)), null);
  const withContact = ctx("guest", true, {
    contact: { phone: "+995555000000", email: "info@mybakuriani.ge" },
  });
  assert.equal(
    actionHref({ id: "call_support" }, withContact),
    "tel:+995555000000",
  );
  assert.equal(
    actionHref({ id: "email_support" }, withContact),
    "mailto:info@mybakuriani.ge",
  );
});

test("the Smart Match link round-trips into the form's values", () => {
  const href = actionHref(
    {
      id: "smart_match",
      params: {
        zone: "კოხტა / მიტარბი",
        check_in: "2027-01-05",
        check_out: "2027-01-09",
        guests: 3,
        budget_min: 100,
        budget_max: 200,
      },
    },
    ctx("guest", true),
  );
  const url = new URL(href, "https://mybakuriani.ge");
  assert.equal(url.searchParams.get(SMART_MATCH_PARAM), SMART_MATCH_VALUE);
  assert.deepEqual(
    parseSmartMatchPrefill((key) => url.searchParams.get(key), "2026-12-01"),
    {
      zone: "კოხტა / მიტარბი",
      checkIn: "2027-01-05",
      checkOut: "2027-01-09",
      guestsCount: 3,
      budgetMin: 100,
      budgetMax: 200,
    },
  );
  // Hand-edited links: bad values are dropped, never passed on.
  const bad = new URLSearchParams(
    "smartMatch=new&check_in=2020-01-01&guests=900&budget_min=x&budget_max=50",
  );
  assert.deepEqual(
    parseSmartMatchPrefill((key) => bad.get(key), "2026-12-01"),
    { budgetMax: 50 },
  );
});

test("the top-up link opens the window, with an amount only when valid", () => {
  const renter = ctx("renter", true);
  assert.equal(
    actionHref({ id: "topup", params: { amount: 50 } }, renter),
    "/dashboard/renter/balance?topup=50",
  );
  const open = new URL(
    actionHref({ id: "topup" }, renter),
    "https://mybakuriani.ge",
  ).searchParams.get("topup");
  assert.equal(parseTopUpParam(open), null);
  assert.equal(parseTopUpParam("50"), 50);
  assert.equal(parseTopUpParam("1"), 1);
  assert.equal(parseTopUpParam("2001"), null);
  assert.equal(parseTopUpParam("-5"), null);
  assert.equal(parseTopUpParam(null), undefined);
  assert.equal(MAX_TOPUP_GEL, MAX_CARD_TOPUP_TETRI / 100);
});

test("deep-link names equal the C41 sign-up link's", () => {
  assert.equal(SMART_MATCH_PARAM, SMART_MATCH_NEW_PARAM);
  assert.equal(SMART_MATCH_VALUE, SMART_MATCH_NEW_VALUE);
});

test("every page a button opens exists", () => {
  const paths = actionPagePaths(SUPPORT_CABINETS);
  assert.ok(paths.length > 30);
  const missing = paths.filter(
    (path) => !existsSync(`src/app/[locale]${path}/page.tsx`),
  );
  assert.deepEqual(missing, []);
  assert.ok(ACTION_IDS.length >= 40);
});

test("the browser guard passes only same-site paths and the site's own contacts", () => {
  const contact = { phone: "+995551261111", email: "info@example.ge" };
  for (const good of [
    "/search?location=x&guests=4",
    "/dashboard/renter/balance?topup=open",
    "/auth/login?next=%2Fdashboard%2Fguest%3FsmartMatch%3Dnew",
    "tel:+995551261111",
    "mailto:info@example.ge",
  ])
    assert.equal(isSafeActionHref(good, contact), true, good);
  for (const bad of [
    "//evil.example/x",
    "/\\evil.example",
    "https://evil.example",
    "javascript:alert(1)",
    "/api/support",
    "/api?x",
    "tel:+995000000000",
    "mailto:someone@else.ge",
    `/search${String.fromCharCode(10)}x`,
    "search",
    7,
    null,
    `/${"a".repeat(700)}`,
  ])
    assert.equal(isSafeActionHref(bad, contact), false, String(bad));
});

test("every button, category, type and tab has a label in ka, en and ru", () => {
  for (const locale of ["ka", "en", "ru"]) {
    const support = JSON.parse(
      readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url)),
    ).Support;
    const missing = [];
    const need = (group, keys) => {
      for (const key of keys)
        if (typeof support[group]?.[key] !== "string")
          missing.push(`${group}.${key}`);
    };
    need("actions", [...ACTION_IDS, "cvs"]);
    need("browse", BROWSE_CATEGORIES);
    need("create", CREATE_KINDS);
    need("types", SEARCH_PROPERTY_TYPES);
    need("tabs", VERIFICATION_TABS);
    need("params", [
      "from",
      "guests",
      "rooms",
      "priceMax",
      "budget",
      "budgetFrom",
      "amount",
    ]);
    assert.deepEqual(missing, [], locale);
  }
});

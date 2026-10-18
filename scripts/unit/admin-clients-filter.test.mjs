import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BALANCE_FILTERS,
  CLIENT_FILTER_KEYS,
  SEEN_FILTERS,
  SIGN_IN_METHODS,
  VERIFIED_FILTERS,
  activeFilterCount,
  countWithOption,
  matchesClientFilters,
  parseClientFilters,
} from "../../src/lib/admin-clients-filter.ts";
import {
  COMPANY_STATES,
  MEMBERSHIP_STATES,
  VIP_TIERS,
} from "../../src/lib/admin-statuses.ts";

// The options the page builds (src/app/[locale]/dashboard/admin/clients).
const OPTIONS = {
  role: ["guest", "renter", "seller", "admin"],
  membership: MEMBERSHIP_STATES,
  vip: ["any", ...VIP_TIERS, "none"],
  company: ["any", ...COMPANY_STATES],
  seen: SEEN_FILTERS,
  method: SIGN_IN_METHODS,
  balance: BALANCE_FILTERS,
  verified: VERIFIED_FILTERS,
};

const NOW = Date.parse("2026-10-07T12:00:00Z");
const DAY = 86_400_000;
const ago = (days) => new Date(NOW - days * DAY).toISOString();

const base = {
  role: "guest",
  is_verified: false,
  balance_amount: 0,
  registered_on: "2026-09-15",
  last_sign_in_at: ago(1),
  sign_in_methods: ["email"],
  membership_state: "none",
  vip_tier: null,
  company_state: null,
};
const row = (over) => ({ ...base, ...over });
const params = (q) => (key) => new URLSearchParams(q).get(key);

test("parse keeps known values and real dates only", () => {
  assert.deepEqual(
    parseClientFilters(
      params(
        "membership=active&vip=gold&seen=over30&method=google&from=2026-02-30&to=2026-10-01&role=renter&q=x",
      ),
      OPTIONS,
    ),
    {
      role: "renter",
      membership: "active",
      seen: "over30",
      method: "google",
      to: "2026-10-01",
    },
  );
  assert.deepEqual(parseClientFilters(params(""), OPTIONS), {});
});

test("every key the module knows is a URL key the page offers", () => {
  for (const key of CLIENT_FILTER_KEYS) {
    if (key === "from" || key === "to") continue;
    assert.ok(OPTIONS[key]?.length, key);
  }
});

test("the date range counts as one filter", () => {
  assert.equal(activeFilterCount({ from: "2026-01-01", to: "2026-02-01" }), 1);
  assert.equal(activeFilterCount({ to: "2026-02-01", vip: "any" }), 2);
  assert.equal(activeFilterCount({}), 0);
});

test("membership: a missing state is 'none'", () => {
  const match = (state, value) =>
    matchesClientFilters(
      row({ membership_state: state }),
      { membership: value },
      NOW,
    );
  assert.ok(match(null, "none"));
  assert.ok(match("active", "active"));
  assert.ok(!match("upcoming", "active"));
});

test("vip: any, none and one tier", () => {
  const match = (tier, value) =>
    matchesClientFilters(row({ vip_tier: tier }), { vip: value }, NOW);
  assert.ok(match("super", "any"));
  assert.ok(!match(null, "any"));
  assert.ok(match(null, "none"));
  assert.ok(!match("super", "none"));
  assert.ok(match("super", "super"));
  assert.ok(!match("super", "vip"));
});

test("company: 'any' = owns a company; a state never matches a non-owner", () => {
  const match = (state, value) =>
    matchesClientFilters(
      row({ company_state: state }),
      { company: value },
      NOW,
    );
  assert.ok(match("none", "any"));
  assert.ok(!match(null, "any"));
  assert.ok(!match(null, "none"));
  assert.ok(match("expired", "expired"));
});

test("last sign-in windows", () => {
  const seen = (days, value) =>
    matchesClientFilters(
      row({ last_sign_in_at: days === null ? null : ago(days) }),
      { seen: value },
      NOW,
    );
  assert.ok(seen(6.9, "7"));
  assert.ok(!seen(7, "7"));
  assert.ok(seen(29, "30"));
  assert.ok(seen(30, "over30"));
  assert.ok(!seen(29.9, "over30"));
  assert.ok(seen(120, "over90"));
  assert.ok(!seen(null, "over90"));
  assert.ok(seen(null, "never"));
  assert.ok(!seen(1, "never"));
});

test("registration range is inclusive and in Tbilisi days", () => {
  const r = row({ registered_on: "2026-09-15" });
  assert.ok(
    matchesClientFilters(r, { from: "2026-09-15", to: "2026-09-15" }, NOW),
  );
  assert.ok(!matchesClientFilters(r, { from: "2026-09-16" }, NOW));
  assert.ok(!matchesClientFilters(r, { to: "2026-09-14" }, NOW));
  assert.ok(
    !matchesClientFilters(
      row({ registered_on: null }),
      { from: "2026-01-01" },
      NOW,
    ),
  );
});

test("method, balance, verified and role", () => {
  const r = row({
    role: "renter",
    sign_in_methods: ["email", "google"],
    balance_amount: 10,
    is_verified: true,
  });
  assert.ok(
    matchesClientFilters(
      r,
      {
        method: "google",
        balance: "positive",
        verified: "yes",
        role: "renter",
      },
      NOW,
    ),
  );
  assert.ok(!matchesClientFilters(r, { method: "phone" }, NOW));
  assert.ok(!matchesClientFilters(r, { balance: "zero" }, NOW));
  assert.ok(!matchesClientFilters(r, { verified: "no" }, NOW));
  assert.ok(
    matchesClientFilters(row({ is_verified: null }), { verified: "no" }, NOW),
  );
  assert.ok(!matchesClientFilters(r, { role: "guest" }, NOW));
});

test("option counts keep the other filters and replace their own key", () => {
  const rows = [
    row({ membership_state: "active", vip_tier: "vip" }),
    row({ membership_state: "active" }),
    row({ membership_state: "expired", vip_tier: "super" }),
  ];
  const filters = { vip: "any", membership: "expired" };
  assert.equal(countWithOption(rows, filters, "membership", "active", NOW), 1);
  assert.equal(countWithOption(rows, filters, "vip", "none", NOW), 0);
  assert.equal(
    countWithOption(rows, { membership: "active" }, "vip", "none", NOW),
    1,
  );
});

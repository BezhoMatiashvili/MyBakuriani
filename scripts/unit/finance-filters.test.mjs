import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  dayEndExclusive,
  dayStart,
  filtersToQuery,
  isIsoDate,
  monthStart,
  parseFinanceFilters,
  parseYear,
  tbilisiDate,
  tbilisiDateTime,
  tbilisiToday,
} from "../../src/lib/finance/filters.ts";

test("isIsoDate accepts real calendar days only", () => {
  assert.equal(isIsoDate("2026-10-05"), true);
  assert.equal(isIsoDate("2028-02-29"), true);
  assert.equal(isIsoDate("2026-02-29"), false);
  assert.equal(isIsoDate("2026-13-01"), false);
  assert.equal(isIsoDate("2019-12-31"), false);
  assert.equal(isIsoDate("2026-1-5"), false);
  assert.equal(isIsoDate(null), false);
});

test("Tbilisi days are UTC+4", () => {
  // 20:30 UTC on 4 October is 00:30 on 5 October in Tbilisi.
  assert.equal(tbilisiToday(new Date("2026-10-04T20:30:00Z")), "2026-10-05");
  assert.equal(tbilisiToday(new Date("2026-10-04T19:59:59Z")), "2026-10-04");
  assert.equal(tbilisiDate("2026-12-31T20:00:00Z"), "2027-01-01");
  assert.equal(dayStart("2026-10-05"), "2026-10-05T00:00:00+04:00");
  assert.equal(dayEndExclusive("2026-12-31"), "2027-01-01T00:00:00+04:00");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(monthStart("2026-10-05"), "2026-10-01");
  assert.equal(tbilisiDateTime("2026-10-04T20:30:00Z"), "2026-10-05 00:30");
  assert.equal(tbilisiDateTime(null), "");
  assert.equal(tbilisiDateTime("nope"), "");
});

test("parseYear falls back outside 2020-2100", () => {
  assert.equal(parseYear("2026", 2000), 2026);
  assert.equal(parseYear("1999", 2026), 2026);
  assert.equal(parseYear("2026.5", 2026), 2026);
  assert.equal(parseYear(null, 2026), 2026);
});

test("parseFinanceFilters keeps only allowed, well-formed values", () => {
  const filters = parseFinanceFilters(
    new URLSearchParams({
      from: "2026-10-05",
      to: "2026-01-01",
      type: "advertising",
      method: "crypto",
      status: "completed",
      payer: "AAE2FF00-0000-4000-8000-000000000001",
      owner: "not-a-uuid",
      q: "  MB-2026-0001  ",
      page: "3",
    }),
    {
      revenueTypes: ["advertising"],
      methods: ["card", "cash"],
      statuses: ["completed"],
    },
  );
  assert.equal(filters.from, "2026-01-01", "swapped into order");
  assert.equal(filters.to, "2026-10-05");
  assert.equal(filters.revenueType, "advertising");
  assert.equal(filters.method, null, "not in the list");
  assert.equal(filters.status, "completed");
  assert.equal(filters.category, null, "no list given");
  assert.equal(filters.payer, "aae2ff00-0000-4000-8000-000000000001");
  assert.equal(filters.owner, null);
  assert.equal(filters.q, "MB-2026-0001");
  assert.equal(filters.page, 3);

  const empty = parseFinanceFilters(new URLSearchParams("page=-1&from=x"));
  assert.equal(empty.page, 1);
  assert.equal(empty.from, null);
  assert.equal(empty.q, "");
});

test("filtersToQuery round-trips and leaves out empty values", () => {
  const query = filtersToQuery(
    { from: "2026-01-01", to: null, status: "pending", q: "", page: 1 },
    { report: "journal", format: "xlsx", year: undefined },
  );
  assert.equal(
    query,
    "from=2026-01-01&status=pending&report=journal&format=xlsx",
  );
  const parsed = parseFinanceFilters(new URLSearchParams(query), {
    statuses: ["pending"],
  });
  assert.equal(parsed.from, "2026-01-01");
  assert.equal(parsed.status, "pending");
  assert.equal(filtersToQuery({ page: 2 }), "page=2");
});

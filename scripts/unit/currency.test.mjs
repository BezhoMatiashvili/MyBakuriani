import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RATE_MAX_AGE_DAYS,
  convertAmount,
  convertedPriceText,
  formatConvertedAmount,
  formatGelPerUsd,
  formatRateDay,
  isCurrencyCode,
  isUsableRate,
  parseNbgUsdRate,
  parseUsdRate,
  tbilisiDay,
} from "../../src/lib/currency/money.ts";

// C55 (2026-10-26): the header's currency pick converts prices at the
// National Bank of Georgia's official rate, and never through a constant.

// NBG's answer to ?currencies=USD&date=2026-10-26 on 2026-10-26 (Monday): the
// fix published on Friday 23 October, valid from Saturday 24 October.
const NBG_BODY = [
  {
    date: "2026-10-24T00:00:00.000Z",
    currencies: [
      {
        code: "USD",
        quantity: 1,
        rateFormated: "2.5971",
        diffFormated: "0.0002",
        rate: 2.5971,
        name: "US Dollar",
        diff: -0.0002,
        date: "2026-10-23T17:01:01.965Z",
        validFromDate: "2026-10-24T00:00:00.000Z",
      },
    ],
  },
];
const RATE = { gelPerUsd: 2.5971, date: "2026-10-26", validFrom: "2026-10-24" };

function withUsd(row) {
  return [
    {
      date: "2026-10-24T00:00:00.000Z",
      currencies: [{ ...NBG_BODY[0].currencies[0], ...row }],
    },
  ];
}

test("NBG's body gives lari per dollar for the asked Tbilisi day", () => {
  assert.deepEqual(parseNbgUsdRate(NBG_BODY, "2026-10-26"), RATE);
  // Several currencies in one answer: the USD row is picked.
  const mixed = [
    {
      currencies: [
        {
          code: "EUR",
          quantity: 1,
          rate: 2.909,
          validFromDate: "2026-10-24T00:00:00.000Z",
        },
        NBG_BODY[0].currencies[0],
      ],
    },
  ];
  assert.deepEqual(parseNbgUsdRate(mixed, "2026-10-26"), RATE);
  // A rate quoted per 100 units is divided by its quantity.
  const per100 = parseNbgUsdRate(
    withUsd({ quantity: 100, rate: 259.71 }),
    "2026-10-26",
  ).gelPerUsd;
  assert.ok(Math.abs(per100 - 2.5971) < 1e-9, String(per100));
});

test("anything that is not a usable NBG answer gives no rate", () => {
  for (const body of [
    null,
    undefined,
    "<html>challenge</html>",
    {},
    [],
    [{}],
    [{ currencies: [] }],
    [{ currencies: "USD" }],
  ]) {
    assert.equal(
      parseNbgUsdRate(body, "2026-10-26"),
      null,
      JSON.stringify(body),
    );
  }
  for (const row of [
    { code: "EUR" },
    { quantity: 0 },
    { quantity: -1 },
    { quantity: "1" },
    { quantity: Number.NaN },
    { rate: "2.5971" },
    { rate: Number.NaN },
    { rate: 0.5 },
    { rate: 25 },
    { validFromDate: null },
    { validFromDate: "soon" },
    // A fix that is not yet in force on the asked day.
    { validFromDate: "2026-10-27T00:00:00.000Z" },
  ]) {
    assert.equal(
      parseNbgUsdRate(withUsd(row), "2026-10-26"),
      null,
      JSON.stringify(row),
    );
  }
  assert.equal(parseNbgUsdRate(NBG_BODY, "26.10.2026"), null);
});

test("the API body and the stored copy are checked again", () => {
  assert.deepEqual(parseUsdRate(RATE), RATE);
  assert.deepEqual(parseUsdRate({ ...RATE, fetchedAt: 1 }), RATE);
  for (const bad of [
    null,
    "2.5971",
    {},
    { ...RATE, gelPerUsd: "2.5971" },
    { ...RATE, gelPerUsd: 0 },
    { ...RATE, date: "today" },
    { ...RATE, validFrom: undefined },
  ]) {
    assert.equal(parseUsdRate(bad), null, JSON.stringify(bad));
  }
});

test("Tbilisi's day turns at 20:00 UTC (UTC+4, no DST)", () => {
  assert.equal(tbilisiDay(new Date("2026-10-26T19:59:59Z")), "2026-10-26");
  assert.equal(tbilisiDay(new Date("2026-10-26T20:00:00Z")), "2026-10-27");
  assert.equal(tbilisiDay(new Date("2026-07-01T00:00:00Z")), "2026-07-01");
});

test(`a rate converts for ${RATE_MAX_AGE_DAYS} days around its day, then not at all`, () => {
  assert.equal(isUsableRate(RATE, "2026-10-26"), true);
  assert.equal(isUsableRate(RATE, "2026-10-29"), true);
  assert.equal(isUsableRate(RATE, "2026-10-30"), false);
  // A browser clock a day behind still converts.
  assert.equal(isUsableRate(RATE, "2026-10-25"), true);
  assert.equal(isUsableRate(null, "2026-10-26"), false);
  assert.equal(isUsableRate({ ...RATE, gelPerUsd: 27 }, "2026-10-26"), false);
  assert.equal(isUsableRate(RATE, "not a day"), false);
});

test("conversion direction: dollars times the rate, lari divided by it", () => {
  assert.equal(convertAmount(55000, "USD", "GEL", 2.5971), 55000 * 2.5971);
  assert.equal(convertAmount(120, "GEL", "USD", 2.5971), 120 / 2.5971);
  assert.equal(convertAmount(120, "GEL", "GEL", 2.5971), 120);
  assert.equal(convertAmount(55000, "USD", "USD", 2.5971), 55000);
});

test("converted text: whole units grouped by a plain space, cents below 10", () => {
  assert.equal(formatConvertedAmount(120 / 2.5971, "USD"), "$46");
  assert.equal(formatConvertedAmount(55000 * 2.5971, "GEL"), "142 841 ₾");
  assert.equal(formatConvertedAmount(1234567, "USD"), "$1 234 567");
  assert.equal(formatConvertedAmount(2.5 / 2.5971, "USD"), "$0.96");
  assert.equal(formatConvertedAmount(25 / 2.5971, "USD"), "$9.63");
  assert.equal(formatConvertedAmount(26 / 2.5971, "USD"), "$10");
  // Rounded to cents before the cents test: 9.996 is "$10", not "$10.00".
  assert.equal(formatConvertedAmount(9.996, "USD"), "$10");
  assert.equal(formatConvertedAmount(9.994, "USD"), "$9.99");
  // Same grouping character as formatNumber (ASCII space), so a converted
  // "$55 000" is byte-identical to formatSalePrice's.
  assert.equal(
    formatConvertedAmount(55000, "USD"),
    "$55" + String.fromCharCode(32) + "000",
  );
});

test("a price converts only once a currency is picked and a usable rate is known", () => {
  const day = "2026-10-26";
  assert.equal(convertedPriceText(120, "GEL", null, RATE, day), null);
  assert.equal(convertedPriceText(120, "GEL", "GEL", RATE, day), null);
  assert.equal(convertedPriceText(55000, "USD", "USD", RATE, day), null);
  assert.equal(convertedPriceText(120, "GEL", "USD", null, day), null);
  assert.equal(convertedPriceText(120, "GEL", "USD", RATE, "2026-11-05"), null);
  assert.equal(convertedPriceText(Number.NaN, "GEL", "USD", RATE, day), null);
  // No price ("?? 0" fallbacks print "0 ₾" today) keeps its own text.
  assert.equal(convertedPriceText(0, "GEL", "USD", RATE, day), null);
  assert.equal(convertedPriceText(-5, "GEL", "USD", RATE, day), null);
  // Bucket edges: whole units even under 10.
  assert.equal(convertedPriceText(10, "GEL", "USD", RATE, day), "$3.85");
  assert.equal(convertedPriceText(10, "GEL", "USD", RATE, day, true), "$4");
  // Too small to show in the other currency ("$0.00", "$0"): own text.
  assert.equal(convertedPriceText(0.01, "GEL", "USD", RATE, day), null);
  assert.equal(convertedPriceText(1, "GEL", "USD", RATE, day, true), null);
  assert.equal(convertedPriceText(0.02, "GEL", "USD", RATE, day), "$0.01");
  assert.equal(convertedPriceText(120, "GEL", "USD", RATE, day), "$46");
  assert.equal(convertedPriceText(55000, "USD", "GEL", RATE, day), "142 841 ₾");
});

test("rate line pieces and the pick's values", () => {
  assert.equal(formatGelPerUsd(2.5971), "2.5971");
  assert.equal(formatGelPerUsd(2.6), "2.6000");
  assert.equal(formatRateDay("2026-10-26"), "26.10.2026");
  assert.equal(isCurrencyCode("GEL"), true);
  assert.equal(isCurrencyCode("USD"), true);
  for (const bad of ["gel", "EUR", "", null, undefined, "₾"])
    assert.equal(isCurrencyCode(bad), false);
});

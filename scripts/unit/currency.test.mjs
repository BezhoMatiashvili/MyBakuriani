import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import {
  CURRENCY_CODES,
  RATE_MAX_AGE_DAYS,
  SALE_PAIR_BAND,
  convertAmount,
  convertSaleAmount,
  convertedPriceText,
  formatConvertedAmount,
  formatGelPerUsd,
  formatRateDay,
  isCurrencyCode,
  isUsableRate,
  parseNbgUsdRate,
  parseUsdRate,
  salePrice,
  salePriceShown,
  salePriceToSave,
  tbilisiDay,
} from "../../src/lib/currency/money.ts";
import { clampNumericString } from "../../src/lib/utils/number.ts";

// src/lib/utils/format.ts imports its siblings without an extension (as Next
// and Playwright resolve them): retry such a relative import with ".ts".
register(
  "data:text/javascript," +
    encodeURIComponent(
      "export async function resolve(specifier, context, next) {" +
        " try { return await next(specifier, context); } catch (error) {" +
        " if (/^\\.{1,2}\\//.test(specifier) && !/\\.[cm]?[jt]sx?$/.test(specifier))" +
        " return next(specifier + '.ts', context);" +
        " throw error; } }",
    ),
);
const {
  formatInCurrency,
  formatPrice,
  formatSaleOwnPrice,
  formatSalePrice,
  saleOwnPrice,
} = await import("../../src/lib/utils/format.ts");

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
  assert.deepEqual([...CURRENCY_CODES], ["GEL", "USD"]);
});

// C54 (2026-10-28): a sale price is stored in the currency its seller typed,
// with the other one converted once at the sale form's NBG rate.
const GEL_ROW = {
  sale_price: 57757,
  sale_price_gel: 150000,
  sale_price_currency: "GEL",
};
const USD_ROW = {
  sale_price: 55000,
  sale_price_gel: 142841,
  sale_price_currency: "USD",
};
const LEGACY_ROW = {
  sale_price: 55000,
  sale_price_gel: null,
  sale_price_currency: "USD",
};

test("a sale's stored pair; its own currency is GEL only with lari", () => {
  assert.deepEqual(salePrice(GEL_ROW), { usd: 57757, gel: 150000, own: "GEL" });
  assert.deepEqual(salePrice(USD_ROW), { usd: 55000, gel: 142841, own: "USD" });
  assert.deepEqual(salePrice(LEGACY_ROW), {
    usd: 55000,
    gel: null,
    own: "USD",
  });
  // 'GEL' without lari (the CHECK refuses it) reads as dollars.
  assert.deepEqual(salePrice({ ...LEGACY_ROW, sale_price_currency: "GEL" }), {
    usd: 55000,
    gel: null,
    own: "USD",
  });
  // No dollar price: no price ("price on request").
  for (const sale_price of [null, 0, -1, Number.NaN])
    assert.equal(salePrice({ ...GEL_ROW, sale_price }), null);
});

test("a pick shows the other stored number, never a conversion", () => {
  const gel = salePrice(GEL_ROW);
  assert.deepEqual(salePriceShown(gel, null), {
    amount: 150000,
    currency: "GEL",
    live: false,
  });
  assert.deepEqual(salePriceShown(gel, "GEL"), salePriceShown(gel, null));
  assert.deepEqual(salePriceShown(gel, "USD"), {
    amount: 57757,
    currency: "USD",
    live: false,
  });
  const usd = salePrice(USD_ROW);
  assert.deepEqual(salePriceShown(usd, null), {
    amount: 55000,
    currency: "USD",
    live: false,
  });
  assert.deepEqual(salePriceShown(usd, "GEL"), {
    amount: 142841,
    currency: "GEL",
    live: false,
  });
  // A legacy row shows its dollars; under a ₾ pick the caller converts them.
  const legacy = salePrice(LEGACY_ROW);
  const dollars = { amount: 55000, currency: "USD", live: false };
  assert.deepEqual(salePriceShown(legacy, null), dollars);
  assert.deepEqual(salePriceShown(legacy, "USD"), dollars);
  assert.deepEqual(salePriceShown(legacy, "GEL"), { ...dollars, live: true });
  const gelWithoutLari = salePrice({
    ...LEGACY_ROW,
    sale_price_currency: "GEL",
  });
  assert.deepEqual(salePriceShown(gelWithoutLari, null), dollars);
});

test("a sale amount converts in whole units (cents per m²), not at an implausible rate", () => {
  assert.equal(convertSaleAmount(150000, "GEL", 2.5971), 57757);
  assert.equal(convertSaleAmount(55000, "USD", 2.5971), 142841);
  assert.equal(convertSaleAmount(1170.21, "USD", 2.5971, 2), 3039.15);
  for (const rate of [0, 1.4, 4.6, 27, Number.NaN, Number.POSITIVE_INFINITY])
    assert.equal(convertSaleAmount(55000, "USD", rate), null, String(rate));
  for (const amount of [0, -5, Number.NaN])
    assert.equal(convertSaleAmount(amount, "USD", 2.5971), null);
  // The band's edges are rates.
  assert.equal(convertSaleAmount(100, "USD", SALE_PAIR_BAND.min), 150);
  assert.equal(convertSaleAmount(100, "USD", SALE_PAIR_BAND.max), 450);
});

test("a new sale keeps the typed number exactly and converts the other", () => {
  assert.deepEqual(
    salePriceToSave({ usd: null, gel: 150000 }, "GEL", 2.5971, null),
    GEL_ROW,
  );
  assert.deepEqual(
    salePriceToSave({ usd: 55000, gel: null }, "USD", 2.5971, null),
    USD_ROW,
  );
  assert.deepEqual(
    salePriceToSave({ usd: 55000.5, gel: null }, "USD", 2.5971, null),
    { sale_price: 55000.5, sale_price_gel: 142842, sale_price_currency: "USD" },
  );
});

test("without a usable rate dollars are saved alone and lari are refused", () => {
  for (const rate of [null, 27, 0.5, Number.NaN]) {
    assert.deepEqual(
      salePriceToSave({ usd: 55000, gel: null }, "USD", rate, null),
      LEGACY_ROW,
      String(rate),
    );
    assert.deepEqual(
      salePriceToSave({ usd: null, gel: 150000 }, "GEL", rate, null),
      { error: "no_rate" },
      String(rate),
    );
  }
});

test("an edit sends the loaded pair back as loaded, so a tap never changes a price", () => {
  // An untouched ₾ edit, at another rate or with none: the loaded triple.
  for (const rate of [2.5971, 2.7, null])
    assert.deepEqual(
      salePriceToSave({ usd: 57757, gel: 150000 }, "GEL", rate, GEL_ROW),
      GEL_ROW,
      String(rate),
    );
  // An untouched legacy row: the lari stay NULL.
  assert.deepEqual(
    salePriceToSave({ usd: 55000, gel: null }, "USD", 2.5971, LEGACY_ROW),
    LEGACY_ROW,
  );
  // Tap, then save: only the currency changes.
  assert.deepEqual(
    salePriceToSave({ usd: 57757, gel: 150000 }, "USD", 2.7, GEL_ROW),
    { ...GEL_ROW, sale_price_currency: "USD" },
  );
  // A legacy tap (lari converted once at the shown rate): the dollars stay exact.
  const legacyCents = { ...LEGACY_ROW, sale_price: 55000.5 };
  const tapped = convertSaleAmount(55000.5, "USD", 2.5971);
  assert.deepEqual(
    salePriceToSave({ usd: 55000.5, gel: tapped }, "GEL", 2.5971, legacyCents),
    { sale_price: 55000.5, sale_price_gel: 142842, sale_price_currency: "GEL" },
  );
  // A legacy row saved under ₾ without that tap converts once, or needs a rate.
  assert.deepEqual(
    salePriceToSave({ usd: 55000, gel: null }, "GEL", 2.5971, LEGACY_ROW),
    { ...USD_ROW, sale_price_currency: "GEL" },
  );
  assert.deepEqual(
    salePriceToSave({ usd: 55000, gel: null }, "GEL", null, LEGACY_ROW),
    { error: "no_rate" },
  );
  // A retyped 140 000 ₾ converts the dollars again.
  assert.deepEqual(
    salePriceToSave({ usd: null, gel: 140000 }, "GEL", 2.5971, GEL_ROW),
    { sale_price: 53906, sale_price_gel: 140000, sale_price_currency: "GEL" },
  );
  // A retyped $56 000 (its lari dropped) converts the lari again.
  assert.deepEqual(
    salePriceToSave({ usd: 56000, gel: null }, "USD", 2.7, GEL_ROW),
    { sale_price: 56000, sale_price_gel: 151200, sale_price_currency: "USD" },
  );
});

test("a price typed back as loaded brings its stored counterpart", () => {
  // The loaded lari typed back (the form dropped the dollars), at another rate
  // or with none: the loaded triple. A re-conversion would change the dollars
  // with the lari unchanged, which the pair trigger turns into a $ listing.
  for (const rate of [2.5971, 2.7, null])
    assert.deepEqual(
      salePriceToSave({ usd: null, gel: 150000 }, "GEL", rate, GEL_ROW),
      GEL_ROW,
      String(rate),
    );
  // A $ listing's stored lari typed under ₾: only the currency changes.
  assert.deepEqual(
    salePriceToSave({ usd: null, gel: 142841 }, "GEL", 2.6, USD_ROW),
    { ...USD_ROW, sale_price_currency: "GEL" },
  );
  // The loaded dollars typed back: the loaded lari, not a 150 001 re-conversion.
  assert.deepEqual(
    salePriceToSave({ usd: 57757, gel: null }, "USD", 2.5971, GEL_ROW),
    { ...GEL_ROW, sale_price_currency: "USD" },
  );
  for (const rate of [2.6, null])
    assert.deepEqual(
      salePriceToSave({ usd: 55000, gel: null }, "USD", rate, USD_ROW),
      USD_ROW,
      String(rate),
    );
  // Typed lari never come back with changed dollars and the loaded lari.
  for (const loaded of [GEL_ROW, USD_ROW])
    for (const rate of [null, 1.5, 2.5971, 2.6, 2.7, 4.5])
      for (let step = -3; step <= 3; step += 1) {
        const gel = loaded.sale_price_gel + step;
        const saved = salePriceToSave({ usd: null, gel }, "GEL", rate, loaded);
        if ("error" in saved) continue;
        assert.ok(
          saved.sale_price === loaded.sale_price ||
            saved.sale_price_gel !== loaded.sale_price_gel,
          `${gel} ₾ @${rate}: ${JSON.stringify(saved)}`,
        );
      }
  // Accepted (C54): a NEW dollar price whose lari rounds to the loaded lari
  // keeps them here; the pair trigger then stores it without lari.
  assert.deepEqual(
    salePriceToSave({ usd: 57756.9, gel: null }, "USD", 2.5971, GEL_ROW),
    { sale_price: 57756.9, sale_price_gel: 150000, sale_price_currency: "USD" },
  );
});

test("an implausible pair or no price is refused; what is saved passes the band", () => {
  for (const pair of [
    { usd: 1000, gel: 150000 },
    { usd: 55000, gel: 55000 },
    { usd: null, gel: null },
    { usd: 0, gel: null },
  ])
    assert.deepEqual(
      salePriceToSave(pair, "GEL", 2.5971, null),
      { error: "invalid" },
      JSON.stringify(pair),
    );
  // The band's edges are plausible.
  for (const gel of [150, 450])
    assert.deepEqual(salePriceToSave({ usd: 100, gel }, "GEL", null, null), {
      sale_price: 100,
      sale_price_gel: gel,
      sale_price_currency: "GEL",
    });
  for (const rate of [1.5, 2.5971, 3.9, 4.5])
    for (const typed of [1, 3, 999, 55000, 10_000_000]) {
      for (const [pair, currency] of [
        [{ usd: typed, gel: null }, "USD"],
        [{ usd: null, gel: typed }, "GEL"],
      ]) {
        const saved = salePriceToSave(pair, currency, rate, null);
        if ("error" in saved) continue;
        const ratio = saved.sale_price_gel / saved.sale_price;
        assert.ok(
          ratio >= SALE_PAIR_BAND.min && ratio <= SALE_PAIR_BAND.max,
          `${JSON.stringify(pair)} @${rate}: ${JSON.stringify(saved)}`,
        );
      }
    }
});

test("a sale's own text is byte-identical to formatPrice / formatSalePrice", () => {
  assert.equal(formatInCurrency(150000, "GEL"), formatPrice(150000));
  assert.equal(formatInCurrency(55000.5, "USD"), formatSalePrice(55000.5));
  assert.equal(formatSaleOwnPrice(GEL_ROW), formatPrice(150000));
  assert.equal(formatSaleOwnPrice(GEL_ROW), "150 000 ₾");
  assert.equal(formatSaleOwnPrice(USD_ROW), formatSalePrice(55000));
  assert.equal(formatSaleOwnPrice(LEGACY_ROW), "$55 000");
  assert.equal(formatSaleOwnPrice({ ...LEGACY_ROW, sale_price: null }), null);
  assert.deepEqual(saleOwnPrice(GEL_ROW), { amount: 150000, currency: "GEL" });
  assert.deepEqual(saleOwnPrice(LEGACY_ROW), {
    amount: 55000,
    currency: "USD",
  });
  // A legacy price converted live reads like a stored one.
  assert.equal(
    formatConvertedAmount(55000 * 2.5971, "GEL"),
    formatPrice(142841),
  );
  assert.equal(formatConvertedAmount(57757, "USD"), formatSalePrice(57757));
});

test("a price per m² keeps its cents on blur (decimals 2)", () => {
  assert.equal(
    clampNumericString("1170.21", { min: 0, max: 1000000, decimals: 2 }),
    "1170.21",
  );
  // The integer field rounded it (55 000 / 47 m² → 1170 → a 54 990 total).
  assert.equal(
    clampNumericString("1170.21", { min: 0, max: 1000000, integer: true }),
    "1170",
  );
});

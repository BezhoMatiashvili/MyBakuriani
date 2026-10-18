import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateTax,
  formatMoney,
  formatPercent,
  parseMoney,
  priceInvoice,
  roundMoney,
  thresholdStatus,
} from "../../src/lib/finance/money.ts";

test("roundMoney rounds half away from zero like Postgres numeric", () => {
  assert.equal(roundMoney(2.675), 2.68); // 2.67499… as a binary float
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(roundMoney(-2.675), -2.68);
  assert.equal(roundMoney(0.125), 0.13);
  assert.equal(roundMoney(10), 10);
  assert.ok(Object.is(roundMoney(-0.001), 0), "no negative zero");
  assert.ok(Number.isNaN(roundMoney(Number.POSITIVE_INFINITY)));
});

test("parseMoney accepts dot or comma decimals with at most 2 places", () => {
  assert.equal(parseMoney("1 234,50"), 1234.5);
  assert.equal(parseMoney("1234.5"), 1234.5);
  assert.equal(parseMoney(" 0 "), 0);
  assert.equal(parseMoney(12.34), 12.34);
  assert.equal(parseMoney("12.345"), null);
  assert.equal(parseMoney("-5"), null);
  assert.equal(parseMoney("-5", { allowNegative: true }), -5);
  assert.equal(parseMoney("1e3"), null);
  assert.equal(parseMoney(1e21), null);
  assert.equal(parseMoney(Number.NaN), null);
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney("1234567890"), null, "10 integer digits");
  assert.equal(parseMoney(null), null);
});

test("formatMoney groups thousands and always shows 2 decimals", () => {
  assert.equal(formatMoney(1234.5), "1 234.50 ₾");
  assert.equal(formatMoney(1000000), "1 000 000.00 ₾");
  assert.equal(formatMoney(-0.5), "-0.50 ₾");
  assert.equal(formatMoney(0), "0.00 ₾");
  assert.equal(formatMoney(null), "—");
  assert.equal(formatPercent(1), "1%");
  assert.equal(formatPercent(80.456), "80.46%");
});

test("priceInvoice matches invoices_guard (the staging draft test)", () => {
  // Same draft the migration was checked with: 199 / 34.20 / 224.20.
  const priced = priceInvoice(
    [{ description: "VIP", quantity: 2, unit_price: 99.5 }],
    9,
    18,
  );
  assert.equal(priced.subtotal, 199);
  assert.equal(priced.discount, 9);
  assert.equal(priced.vat, 34.2);
  assert.equal(priced.total, 224.2);
  assert.equal(priced.items[0].amount, 199);
});

test("priceInvoice rounds each line and the VAT half up in exact units", () => {
  const priced = priceInvoice(
    [
      { description: "a", quantity: 1.5, unit_price: 0.03 }, // 0.045 -> 0.05
      { description: "b", quantity: 0.333, unit_price: 10.01 }, // 3.33333 -> 3.33
    ],
    0,
    18,
  );
  assert.deepEqual(
    priced.items.map((item) => item.amount),
    [0.05, 3.33],
  );
  assert.equal(priced.subtotal, 3.38);
  assert.equal(priced.vat, 0.61); // 0.6084
  assert.equal(priced.total, 3.99);

  const tiny = priceInvoice(
    [{ description: "c", quantity: 1, unit_price: 0.05 }],
    0,
    18,
  );
  assert.equal(tiny.vat, 0.01); // 0.009 rounds up
});

test("priceInvoice without a VAT rate adds no VAT", () => {
  const priced = priceInvoice(
    [{ description: "a", quantity: 3, unit_price: 66.33 }],
    0.99,
    null,
  );
  assert.equal(priced.subtotal, 198.99);
  assert.equal(priced.vat, 0);
  assert.equal(priced.total, 198);
});

test("estimateTax and thresholdStatus", () => {
  assert.equal(estimateTax(500000, 1), 5000);
  assert.equal(estimateTax(1234.56, 3), 37.04);
  assert.deepEqual(thresholdStatus(400000, 500000, 80), {
    percent: 80,
    remaining: 100000,
    level: "warning",
  });
  assert.equal(thresholdStatus(100, 500000, 80).level, "ok");
  assert.deepEqual(thresholdStatus(500000.01, 500000, 80), {
    percent: 100,
    remaining: 0,
    level: "exceeded",
  });
  assert.equal(thresholdStatus(500000, 500000, 80).level, "warning");
});

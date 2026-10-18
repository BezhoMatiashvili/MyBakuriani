import { test } from "node:test";
import assert from "node:assert/strict";
import { sumNightlyPrice, isDiscountActive, applyDiscount, isSuperVipActive, daysRemaining, sortByPromotion, formatGelAmount } from "../../src/lib/utils/pricing.ts";

const d = (iso) => new Date(`${iso}T12:00:00`);

test("sumNightlyPrice bills every calendar day inclusive of check-out", () => {
  assert.equal(sumNightlyPrice(d("2026-06-28"), d("2026-06-30"), 100), 300);
  assert.equal(sumNightlyPrice(d("2026-06-28"), d("2026-06-28"), 100), 100);
});

test("sumNightlyPrice uses per-day overrides and returns 0 for an inverted range", () => {
  const overrides = [{ date: "2026-06-29", price: 250 }];
  assert.equal(sumNightlyPrice(d("2026-06-28"), d("2026-06-30"), 100, overrides), 450);
  assert.equal(sumNightlyPrice(d("2026-06-30"), d("2026-06-28"), 100), 0);
});

test("isDiscountActive is fail-open on a null expiry and strict on a past one", () => {
  assert.equal(isDiscountActive(10, null), true);
  assert.equal(isDiscountActive(10, "2000-01-01T00:00:00Z"), false);
  assert.equal(isDiscountActive(10, "2999-01-01T00:00:00Z"), true);
  assert.equal(isDiscountActive(0, null), false);
  assert.equal(isDiscountActive(null, null), false);
});

test("applyDiscount reduces only an active discount and never a non-positive price", () => {
  assert.equal(applyDiscount(200, 25, null), 150);
  assert.equal(applyDiscount(200, 25, "2000-01-01T00:00:00Z"), 200);
  assert.equal(applyDiscount(0, 25, null), 0);
});

test("isSuperVipActive respects the shared expiry", () => {
  const now = Date.parse("2026-09-21T00:00:00Z");
  assert.equal(isSuperVipActive(true, null, now), true);
  assert.equal(isSuperVipActive(true, "2026-09-22T00:00:00Z", now), true);
  assert.equal(isSuperVipActive(true, "2026-09-20T00:00:00Z", now), false);
  assert.equal(isSuperVipActive(false, "2999-01-01T00:00:00Z", now), false);
});

test("daysRemaining rounds up and hides expired or absent values", () => {
  assert.equal(daysRemaining(null), null);
  assert.equal(daysRemaining("2000-01-01T00:00:00Z"), null);
  const inTwentyThreeHours = new Date(Date.now() + 23 * 3600 * 1000).toISOString();
  assert.equal(daysRemaining(inTwentyThreeHours), 1);
});

test("sortByPromotion ranks SUPER VIP, then VIP, and keeps the incoming order within a tier", () => {
  const rows = [
    { id: "plain-1", is_vip: false, is_super_vip: false },
    { id: "vip-1", is_vip: true, is_super_vip: false },
    { id: "super-1", is_vip: false, is_super_vip: true },
    { id: "plain-2", is_vip: null, is_super_vip: null },
    { id: "vip-2", is_vip: true },
    { id: "super-2", is_super_vip: true },
  ];
  assert.deepEqual(
    sortByPromotion(rows).map((r) => r.id),
    ["super-1", "super-2", "vip-1", "vip-2", "plain-1", "plain-2"],
  );
  // Input is not mutated.
  assert.equal(rows[0].id, "plain-1");
  assert.deepEqual(sortByPromotion([]), []);
});

test("formatGelAmount prints package prices like the 2026 price list", () => {
  assert.equal(formatGelAmount(1.5), "1.50 ₾");
  assert.equal(formatGelAmount(2.5), "2.50 ₾");
  assert.equal(formatGelAmount(5), "5 ₾");
  assert.equal(formatGelAmount(30), "30 ₾");
  assert.equal(formatGelAmount(500), "500 ₾");
  assert.equal(formatGelAmount(Number("1.50")), "1.50 ₾");
  assert.equal(formatGelAmount(0.1 + 0.2), "0.30 ₾");
});

test("formatGelAmount keeps tetri, groups thousands and survives float noise", () => {
  assert.equal(formatGelAmount(1.5 * 3), "4.50 ₾");
  assert.equal(formatGelAmount(198.5), "198.50 ₾");
  assert.equal(formatGelAmount(4.999999), "5 ₾");
  assert.equal(formatGelAmount(1825), "1 825 ₾");
  assert.equal(formatGelAmount(12345.05), "12 345.05 ₾");
  assert.equal(formatGelAmount(0), "0 ₾");
  assert.equal(formatGelAmount(-1.5), "-1.50 ₾");
});

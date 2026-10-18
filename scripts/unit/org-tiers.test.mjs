import { test } from "node:test";
import assert from "node:assert/strict";
import { COMPANY_TIERS, COMPANY_TIER_RANK } from "../../src/lib/org-tiers.ts";

test("company tiers follow the 2026 price list order START < PRO < PREMIUM < PREMIUM+", () => {
  assert.deepEqual(
    [...COMPANY_TIERS],
    ["entry", "pro", "premium", "premium_plus"],
  );
  assert.equal(new Set(COMPANY_TIERS).size, COMPANY_TIERS.length);
});

test("COMPANY_TIER_RANK covers exactly the tier codes with strictly increasing ranks", () => {
  assert.deepEqual(
    Object.keys(COMPANY_TIER_RANK).sort(),
    [...COMPANY_TIERS].sort(),
  );
  const ranks = COMPANY_TIERS.map((tier) => COMPANY_TIER_RANK[tier]);
  for (let i = 1; i < ranks.length; i += 1) assert.ok(ranks[i] > ranks[i - 1]);
  assert.equal(COMPANY_TIER_RANK.premium_plus, Math.max(...ranks));
});

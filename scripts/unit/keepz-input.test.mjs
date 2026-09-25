import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cardShortfallTetri,
  gelToTetri,
  isValidCardTopupTetri,
  MAX_CARD_TOPUP_TETRI,
  MIN_CARD_TOPUP_TETRI,
  tetriToGel,
} from "../../src/lib/payments/keepz/amount.ts";
import {
  isUuidV4,
  parsePurchaseIntent,
} from "../../src/lib/payments/keepz/intent.ts";
import {
  isKeepzOrderStatus,
  isOpenPaymentStatus,
  KEEPZ_ORDER_STATUSES,
} from "../../src/lib/payments/keepz/status.ts";

const TIERS = ["entry", "pro", "premium", "premium_plus"];
const U1 = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const U2 = "90434fa9-46df-4c44-a4d1-da742ac815da";

test("GEL amounts become integer tetri; more than 2 decimals is rejected", () => {
  assert.equal(gelToTetri(12.5), 1250);
  assert.equal(gelToTetri(0.1 + 0.2), 30); // float noise tolerated
  assert.equal(gelToTetri(10.005), null); // real third decimal rejected
  assert.equal(gelToTetri(NaN), null);
  assert.equal(gelToTetri(Infinity), null);
  assert.equal(gelToTetri("12.5"), null);
  assert.equal(gelToTetri(null), null);
});

test("card top-ups are bounded to 1–2000 GEL, and 365 days of SUPER VIP fits", () => {
  assert.equal(MIN_CARD_TOPUP_TETRI, 100);
  assert.equal(MAX_CARD_TOPUP_TETRI, 200_000);
  assert.equal(isValidCardTopupTetri(100), true);
  assert.equal(isValidCardTopupTetri(99), false);
  assert.equal(isValidCardTopupTetri(200_000), true);
  assert.equal(isValidCardTopupTetri(200_001), false);
  assert.equal(isValidCardTopupTetri(150.5), false);
  assert.equal(isValidCardTopupTetri(365 * 500), true); // 1825 ₾
});

test("amounts sent to Keepz never carry more than 2 decimals", () => {
  for (const tetri of [100, 101, 105, 1999, 12345, 199_999]) {
    const gel = tetriToGel(tetri);
    assert.match(String(gel), /^\d+(\.\d{1,2})?$/);
    assert.equal(gelToTetri(gel), tetri);
  }
});

test("card shortfall covers the missing part, never below 1 GEL", () => {
  assert.equal(cardShortfallTetri(5, 10), 0); // wallet covers it
  assert.equal(cardShortfallTetri(10, 10), 0);
  assert.equal(cardShortfallTetri(12.5, 10), 250);
  assert.equal(cardShortfallTetri(10.3, 10), 100); // 0.30 rounds up to 1 ₾
  assert.equal(cardShortfallTetri(1825, 17.5), 180_750);
  assert.equal(cardShortfallTetri(0.1 + 0.2, 0), 100);
});

test("request ids must be UUID v4 (Keepz integratorOrderId format)", () => {
  assert.equal(isUuidV4(U1), true);
  assert.equal(isUuidV4("3fa85f64-5717-1562-b3fc-2c963f66afa6"), false); // v1
  assert.equal(isUuidV4("3fa85f64-5717-4562-73fc-2c963f66afa6"), false); // bad variant
  assert.equal(isUuidV4("not-a-uuid"), false);
  assert.equal(isUuidV4(42), false);
});

test("purchase-vip intents keep only known, bounded fields", () => {
  assert.deepEqual(
    parsePurchaseIntent(
      {
        kind: "purchase-vip",
        body: { package_id: U1, property_id: U2, quantity: 3 },
      },
      TIERS,
    ),
    {
      kind: "purchase-vip",
      body: { package_id: U1, property_id: U2, quantity: 3 },
    },
  );
  assert.deepEqual(
    parsePurchaseIntent(
      { kind: "purchase-vip", body: { package_id: U1 } },
      TIERS,
    ),
    { kind: "purchase-vip", body: { package_id: U1 } },
  );
  const bad = [
    { package_id: "x" },
    { package_id: U1, property_id: U2, service_id: U2 },
    { package_id: U1, quantity: 0 },
    { package_id: U1, quantity: 366 },
    { package_id: U1, quantity: 1.5 },
    { package_id: U1, discount_percent: 91 },
    { package_id: U1, amount: 0.01 }, // unknown key — never a price input
    { package_id: U1, property_id: "1" },
  ];
  for (const body of bad) {
    assert.equal(
      parsePurchaseIntent({ kind: "purchase-vip", body }, TIERS),
      null,
    );
  }
});

test("company-subscription and menu-item-discount intents are strict", () => {
  assert.deepEqual(
    parsePurchaseIntent(
      {
        kind: "company-subscription",
        body: { org_id: U1, tier: "premium_plus" },
      },
      TIERS,
    ),
    {
      kind: "company-subscription",
      body: { org_id: U1, tier: "premium_plus" },
    },
  );
  assert.equal(
    parsePurchaseIntent(
      { kind: "company-subscription", body: { org_id: U1, tier: "gold" } },
      TIERS,
    ),
    null,
  );
  const menu = {
    menuItemId: U1,
    packageId: U2,
    discountPercent: 20,
    quantity: 2,
  };
  assert.deepEqual(
    parsePurchaseIntent({ kind: "menu-item-discount", body: menu }, TIERS),
    { kind: "menu-item-discount", body: menu },
  );
  assert.equal(
    parsePurchaseIntent(
      { kind: "menu-item-discount", body: { ...menu, quantity: undefined } },
      TIERS,
    ),
    null,
  );
});

test("unknown kinds, extra keys and non-objects are rejected", () => {
  for (const raw of [
    null,
    [],
    "purchase-vip",
    { kind: "topup", body: {} },
    { kind: "purchase-vip" },
    { kind: "purchase-vip", body: { package_id: U1 }, extra: 1 },
    { kind: "purchase-vip", body: [U1] },
  ]) {
    assert.equal(parsePurchaseIntent(raw, TIERS), null);
  }
});

test("Keepz status vocabulary matches the docs and open statuses are pending/declined", () => {
  assert.equal(KEEPZ_ORDER_STATUSES.length, 12);
  assert.equal(isKeepzOrderStatus("SUCCESS"), true);
  assert.equal(isKeepzOrderStatus("success"), false);
  assert.equal(isKeepzOrderStatus("PAID"), false);
  assert.equal(isOpenPaymentStatus("pending"), true);
  assert.equal(isOpenPaymentStatus("declined"), true);
  for (const s of ["succeeded", "cancelled", "expired"]) {
    assert.equal(isOpenPaymentStatus(s), false);
  }
});

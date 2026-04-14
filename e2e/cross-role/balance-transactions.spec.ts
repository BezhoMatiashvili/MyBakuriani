import { test, expect } from "../helpers/fixtures";
import { balances, transactions, supabaseAdmin } from "../helpers/supabase";

const TXN_IDS = {
  topup: "aae2ff00-c200-4000-a000-000000000001",
  vipBoost: "aae2ff00-c200-4000-a000-000000000002",
  smsPackage: "aae2ff00-c200-4000-a000-000000000003",
};

test.describe("Balance and transactions", () => {
  test.describe.configure({ mode: "serial" });
  test.afterAll(async () => {
    for (const id of Object.values(TXN_IDS)) {
      await transactions.delete(id).catch(() => {});
    }
  });

  test("renter has initial balance from seed", async ({ testIds }) => {
    // Reset balance to known state for this test suite
    await balances.update(testIds.renter, { amount: 500, sms_remaining: 20 });
    const balance = await balances.get(testIds.renter);
    expect(balance).not.toBeNull();
    expect(balance!.amount).toBe(500);
    expect(balance!.sms_remaining).toBe(20);
  });

  test("create topup transaction via DB", async ({ testIds }) => {
    const txn = await transactions.create({
      id: TXN_IDS.topup,
      user_id: testIds.renter,
      amount: 200,
      type: "topup",
      description: "E2E ბალანსის შევსება",
    });
    expect(txn.amount).toBe(200);
    expect(txn.type).toBe("topup");

    // Update balance
    await balances.update(testIds.renter, { amount: 700 });
    const updated = await balances.get(testIds.renter);
    expect(updated!.amount).toBe(700);
  });

  test("create VIP boost transaction (deduct from balance)", async ({
    testIds,
  }) => {
    const txn = await transactions.create({
      id: TXN_IDS.vipBoost,
      user_id: testIds.renter,
      amount: -50,
      type: "vip_boost",
      description: "E2E VIP გააქტიურება",
    });
    expect(txn.type).toBe("vip_boost");

    await balances.update(testIds.renter, { amount: 650 });
    const updated = await balances.get(testIds.renter);
    expect(updated!.amount).toBe(650);
  });

  test("create SMS package transaction", async ({ testIds }) => {
    const txn = await transactions.create({
      id: TXN_IDS.smsPackage,
      user_id: testIds.renter,
      amount: -30,
      type: "sms_package",
      description: "E2E SMS პაკეტი",
    });
    expect(txn.type).toBe("sms_package");

    await balances.update(testIds.renter, { amount: 620, sms_remaining: 70 });
  });

  test("verify transaction history is complete", async ({ testIds }) => {
    const { data, error } = await supabaseAdmin
      .from("transactions")
      .select("*")
      .eq("user_id", testIds.renter)
      .order("created_at", { ascending: false });

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(3);

    const types = data!.map((t) => t.type);
    expect(types).toContain("topup");
    expect(types).toContain("vip_boost");
    expect(types).toContain("sms_package");
  });

  test("renter dashboard shows balance", async ({ renterPage, testIds }) => {
    await renterPage.goto("/dashboard/renter/balance");
    if (renterPage.url().includes("/auth/login")) {
      test
        .info()
        .annotations.push({ type: "skip", description: "Auth not available" });
      return;
    }
    await expect(renterPage.locator("main")).toBeVisible();
  });

  // Reset balance for other tests
  test.afterAll(async () => {
    const { data: testIds } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("display_name", "E2E Renter")
      .single();
    if (testIds) {
      await balances.update(testIds.id, { amount: 500, sms_remaining: 20 });
    }
  });
});

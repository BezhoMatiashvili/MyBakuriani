import { test, expect } from "../helpers/fixtures";
import { balances, supabaseAdmin, transactions } from "../helpers/supabase";
import { configureIsolatedE2E } from "../helpers/env";
import { loadTestUsers } from "../helpers/fixtures";

const enabled = process.env.E2E_TEST_PAYMENTS_ENABLED === "true";
const disabled = process.env.E2E_TEST_PAYMENTS_DISABLED === "true";
const { supabaseUrl, anonKey } = configureIsolatedE2E();

async function callPayment(
  name: "payment-create" | "payment-process",
  body: Record<string, unknown>,
  token?: string,
) {
  return fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function createTopUp(token: string, amount = 17) {
  const response = await callPayment(
    "payment-create",
    { amount, purpose: "topup", return_path: "/dashboard/renter/balance" },
    token,
  );
  expect(response.status).toBe(200);
  const payload = (await response.json()) as { data: { payment_id: string } };
  return payload.data.payment_id;
}

const approveBody = (paymentId: string) => ({
  payment_id: paymentId,
  card_number: "4242424242424242",
  exp_month: 12,
  exp_year: 30,
  cvc: "123",
});

test.describe("Sandbox payment entry points", () => {
  test("property, food and service balances expose the same top-up launcher", async ({
    renterPage,
    foodPage,
    transportPage,
  }) => {
    for (const [page, path] of [
      [renterPage, "/dashboard/renter/balance"],
      [foodPage, "/dashboard/food/balance"],
      [transportPage, "/dashboard/service/balance"],
    ] as const) {
      await page.goto(path);
      if (page.url().includes("/auth/login")) {
        test.info().annotations.push({ type: "skip", description: "Auth not available" });
        return;
      }
      await expect(page.getByTestId("sandbox-topup-launcher")).toBeVisible();
      await page.getByTestId("sandbox-topup-launcher").click();
      await expect(page.getByRole("dialog")).toBeVisible();
    }
  });
});

test.describe("Sandbox payment ledger", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!enabled, "Requires an isolated Edge deployment with TEST_PAYMENTS_ENABLED=true.");

  test("a successful test-card top-up credits the wallet and creates one transaction", async () => {
    const renter = loadTestUsers().renter;
    const before = await balances.get(renter.id);
    const beforeCount = (await supabaseAdmin.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", renter.id).eq("type", "topup")).count ?? 0;
    const paymentId = await createTopUp(renter.accessToken, 17);
    const response = await callPayment("payment-process", approveBody(paymentId), renter.accessToken);
    expect(response.status).toBe(200);
    expect((await response.json()).data.status).toBe("succeeded");
    await expect.poll(async () => (await balances.get(renter.id))?.amount).toBe((before?.amount ?? 0) + 17);
    const afterCount = (await supabaseAdmin.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", renter.id).eq("type", "topup")).count ?? 0;
    expect(afterCount).toBe(beforeCount + 1);
  });

  test("decline and insufficient-funds cards keep a session retryable", async () => {
    const renter = loadTestUsers().renter;
    const paymentId = await createTopUp(renter.accessToken);
    for (const [number, reason] of [["4000000000000002", "declined"], ["4000000000009995", "insufficient"]] as const) {
      const response = await callPayment("payment-process", { ...approveBody(paymentId), card_number: number }, renter.accessToken);
      expect(response.status).toBe(200);
      expect((await response.json()).data.reason).toBe(reason);
    }
    const retry = await callPayment("payment-process", approveBody(paymentId), renter.accessToken);
    expect((await retry.json()).data.status).toBe("succeeded");
  });

  test("cancellation, duplicate submission, cross-user access and unauthenticated requests are safe", async () => {
    const { renter, seller } = loadTestUsers();
    const cancelled = await createTopUp(renter.accessToken);
    const cancelResponse = await callPayment("payment-process", { payment_id: cancelled, cancel: true }, renter.accessToken);
    expect((await cancelResponse.json()).data.status).toBe("cancelled");
    const cancelledRow = await supabaseAdmin.from("payments").select("status").eq("id", cancelled).single();
    expect(cancelledRow.data?.status).toBe("cancelled");

    const paymentId = await createTopUp(renter.accessToken, 19);
    const [first, second] = await Promise.all([
      callPayment("payment-process", approveBody(paymentId), renter.accessToken),
      callPayment("payment-process", approveBody(paymentId), renter.accessToken),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const matchingTransactions = await transactions.getAll();
    expect(matchingTransactions.filter((transaction) => transaction.user_id === renter.id && transaction.type === "topup" && transaction.amount === 19)).toHaveLength(1);

    const foreign = await callPayment("payment-process", approveBody(paymentId), seller.accessToken);
    expect(foreign.status).toBe(404);
    const anonymous = await callPayment("payment-create", { amount: 10 });
    expect(anonymous.status).toBe(401);
  });
});

test("kill switch rejects payment creation", async () => {
  test.skip(!disabled, "Run against an isolated Edge deployment with TEST_PAYMENTS_ENABLED unset or false.");
  const renter = loadTestUsers().renter;
  const response = await callPayment("payment-create", { amount: 10 }, renter.accessToken);
  expect(response.status).toBe(503);
  expect((await response.json()).code).toBe("TEST_PAYMENTS_DISABLED");
});

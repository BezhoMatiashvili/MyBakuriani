import { randomUUID } from "node:crypto";
import { test, expect, loadTestUsers } from "../helpers/fixtures";
import { balances, supabaseAdmin } from "../helpers/supabase";
import { configureIsolatedE2E } from "../helpers/env";

const { baseUrl, supabaseUrl, anonKey } = configureIsolatedE2E();

// Cookie-authenticated API posts must carry an allowed Origin (middleware);
// the Keepz callback and reconcile routes are the only exemptions (C32).
const sameOrigin = { Origin: new URL(baseUrl).origin };

async function insertPendingKeepzPayment(userId: string) {
  const id = randomUUID();
  const { error } = await supabaseAdmin.from("payments").insert({
    id,
    user_id: userId,
    amount: 5,
    provider: "keepz",
    status: "pending",
    purpose: "topup",
    return_path: "/dashboard/renter/balance",
  });
  expect(error).toBeNull();
  return id;
}

test.describe("Keepz card payments (C32)", () => {
  test("every balance page offers the card top-up", async ({
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
        test
          .info()
          .annotations.push({
            type: "skip",
            description: "Auth not available",
          });
        return;
      }
      await expect(page.getByTestId("card-topup-launcher")).toBeVisible();
      await page.getByTestId("card-topup-launcher").click();
      await expect(page.getByRole("dialog")).toBeVisible();
    }
  });

  test("checkout needs a session and rejects out-of-range amounts", async ({
    request,
    renterPage,
  }) => {
    const body = {
      requestId: randomUUID(),
      amount: 10,
      returnPath: "/dashboard/renter/balance",
    };
    const anonymous = await request.post("/api/payments/keepz/checkout", {
      headers: sameOrigin,
      data: body,
    });
    expect(anonymous.status()).toBe(401);

    const tooLarge = await renterPage.request.post(
      "/api/payments/keepz/checkout",
      {
        headers: sameOrigin,
        data: { ...body, requestId: randomUUID(), amount: 5000 },
      },
    );
    // 400 when Keepz is configured; 503 (fail closed) when it is not.
    expect([400, 503]).toContain(tooLarge.status());
  });

  test("a forged SUCCESS callback never credits a wallet", async ({
    request,
  }) => {
    const renter = loadTestUsers().renter;
    const paymentId = await insertPendingKeepzPayment(renter.id);
    const before = (await balances.get(renter.id))?.amount ?? 0;
    try {
      // No Origin: this is how Keepz (or an attacker) reaches the callback.
      const response = await request.post("/api/payments/keepz/callback", {
        data: { integratorOrderId: paymentId, status: "SUCCESS", amount: 5 },
      });
      expect(response.status()).not.toBe(403);
      expect([200, 503]).toContain(response.status());

      const { data: row } = await supabaseAdmin
        .from("payments")
        .select("status, credited_at")
        .eq("id", paymentId)
        .single();
      expect(row?.credited_at).toBeNull();
      expect(row?.status).not.toBe("succeeded");
      expect((await balances.get(renter.id))?.amount ?? 0).toBe(before);
    } finally {
      await supabaseAdmin.from("payments").delete().eq("id", paymentId);
    }
  });

  test("a payer cannot read someone else's payment", async ({ guestPage }) => {
    const renter = loadTestUsers().renter;
    const paymentId = await insertPendingKeepzPayment(renter.id);
    try {
      const response = await guestPage.request.get(
        `/api/payments/keepz/orders/${paymentId}`,
      );
      expect(response.status()).toBe(404);
    } finally {
      await supabaseAdmin.from("payments").delete().eq("id", paymentId);
    }
  });

  test("the reconcile sweeper refuses callers without its secret", async ({
    request,
  }) => {
    const response = await request.post("/api/payments/keepz/reconcile", {
      headers: { Authorization: "Bearer not-the-secret" },
    });
    expect([401, 503]).toContain(response.status());
  });

  test("the retired sandbox edge functions answer 410", async () => {
    for (const name of ["payment-create", "payment-process"]) {
      const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      expect(response.status).toBe(410);
    }
  });
});

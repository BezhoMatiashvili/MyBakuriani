import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  authenticateAsRole,
  createTestUser,
  deleteTestUser,
  elevateTestUserToAal2,
  generateTotpCode,
} from "../helpers/auth";
import { supabaseAdmin } from "../helpers/supabase";
import { configureIsolatedE2E } from "../helpers/env";
import type { Database } from "../../src/lib/types/database";

async function createTemporaryUser(role: "admin" | "guest") {
  const id = randomUUID();
  const user = await createTestUser({
    id,
    phone: `+9955${Math.floor(Math.random() * 100_000_000)
      .toString()
      .padStart(8, "0")}`,
    displayName: `MFA ${role}`,
    role,
  });

  return {
    user,
    async cleanup() {
      await supabaseAdmin.from("balances").delete().eq("user_id", id);
      await supabaseAdmin.from("profiles").delete().eq("id", id);
      await deleteTestUser(id);
    },
  };
}

test.describe("Administrator MFA route protection", () => {
  test("an AAL1 admin reaches MFA from the public navbar, never login", async ({
    page,
  }) => {
    const temporary = await createTemporaryUser("admin");
    try {
      await authenticateAsRole(temporary.user, page);
      await page.goto("/");

      const profileLink = page.getByRole("link", {
        name: /profile|პროფილი|профиль/i,
      });
      await expect(profileLink).toBeVisible();
      await profileLink.click();

      await expect(page).toHaveURL(/\/auth\/mfa\?next=%2Fdashboard%2Fadmin/);
      await expect(
        page.getByRole("heading", { name: "Administrator verification" }),
      ).toBeVisible();
      await expect(page.locator("#mfa-code")).toBeVisible();
      await expect(page.locator("input[name='email']")).toHaveCount(0);
    } finally {
      await temporary.cleanup();
    }
  });

  test("an AAL1 admin completes MFA and returns to a localized deep link", async ({
    page,
  }) => {
    const temporary = await createTemporaryUser("admin");
    try {
      await authenticateAsRole(temporary.user, page);
      await page.goto("/en/dashboard/admin/verifications?tab=pending");

      await expect(page).toHaveURL(
        /\/auth\/mfa\?next=%2Fen%2Fdashboard%2Fadmin%2Fverifications%3Ftab%3Dpending/,
      );
      const manualKey = page.getByText(/Manual key:/);
      await expect(manualKey).toBeVisible();
      const secret = (await manualKey.textContent())
        ?.replace("Manual key:", "")
        .trim();
      if (!secret) throw new Error("MFA page did not expose an enrollment key");

      await page.locator("#mfa-code").fill(generateTotpCode(secret));
      await page.getByRole("button", { name: "Verify and continue" }).click();
      await expect(page).toHaveURL(
        /\/en\/dashboard\/admin\/verifications\?tab=pending$/,
      );
    } finally {
      await temporary.cleanup();
    }
  });

  test("anonymous and non-admin requests do not enter MFA", async ({ page }) => {
    await page.goto("/en/dashboard/admin/verifications?tab=pending");
    await expect(page).toHaveURL(
      /\/auth\/login\?next=%2Fen%2Fdashboard%2Fadmin%2Fverifications%3Ftab%3Dpending/,
    );

    const temporary = await createTemporaryUser("guest");
    try {
      await authenticateAsRole(temporary.user, page);
      await page.goto("/dashboard/admin");

      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page).not.toHaveURL(/\/auth\/mfa/);
    } finally {
      await temporary.cleanup();
    }
  });

  test("a real TOTP challenge yields AAL2 access to the original page", async ({
    page,
  }) => {
    const temporary = await createTemporaryUser("admin");
    try {
      const aal2User = await elevateTestUserToAal2(temporary.user);
      await authenticateAsRole(aal2User, page);
      await page.goto("/en/dashboard/admin/verifications?tab=pending");

      await expect(page).toHaveURL(
        /\/en\/dashboard\/admin\/verifications\?tab=pending$/,
      );
      await expect(page.locator("main")).toBeVisible();
    } finally {
      await temporary.cleanup();
    }
  });

  test("database admin policies reject AAL1 and accept AAL2", async () => {
    const temporary = await createTemporaryUser("admin");
    try {
      const { supabaseUrl, anonKey } = configureIsolatedE2E();
      const client = createClient<Database>(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await client.auth.setSession({
        access_token: temporary.user.accessToken,
        refresh_token: temporary.user.refreshToken,
      });
      const aal1 = await client.rpc("is_admin_user");
      expect(aal1.error).toBeNull();
      expect(aal1.data).toBe(false);

      const elevated = await elevateTestUserToAal2(temporary.user);
      await client.auth.setSession({
        access_token: elevated.accessToken,
        refresh_token: elevated.refreshToken,
      });
      const aal2 = await client.rpc("is_admin_user");
      expect(aal2.error).toBeNull();
      expect(aal2.data).toBe(true);
    } finally {
      await temporary.cleanup();
    }
  });
});

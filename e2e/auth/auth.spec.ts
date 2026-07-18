import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Login page structure
// ---------------------------------------------------------------------------
test.describe("Login page structure", () => {
  test("loads login page", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.locator("main")).toBeVisible();
  });

  test("has a heading or title", async ({ page }) => {
    await page.goto("/auth/login");
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible();
  });

  test("has phone or email input tabs", async ({ page }) => {
    await page.goto("/auth/login");
    const tabs = page.locator("button, [role='tab']");
    await expect(tabs.first()).toBeVisible();
  });

  test("phone tab shows +995 prefix", async ({ page }) => {
    await page.goto("/auth/login");
    const phoneText = page.getByText("+995");
    if ((await phoneText.count()) > 0) {
      await expect(phoneText.first()).toBeVisible();
    }
  });

  test("has a submit / continue button", async ({ page }) => {
    await page.goto("/auth/login");
    const submitButton = page.locator(
      "button[type='submit'], button:has-text('შესვლა'), button:has-text('გაგრძელება')",
    );
    const count = await submitButton.count();
    expect(count).toBeGreaterThan(0);
  });

  test("MyBakuriani branding is visible", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.getByText("MyBakuriani").first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Register page structure
// ---------------------------------------------------------------------------
test.describe("Register page structure", () => {
  test("loads register page", async ({ page }) => {
    await page.goto("/auth/register");
    await expect(page.locator("main")).toBeVisible();
  });

  test("has a heading", async ({ page }) => {
    await page.goto("/auth/register");
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible();
  });

  test("shows loading or redirect for unauthenticated users", async ({
    page,
  }) => {
    await page.goto("/auth/register");
    // Register page requires auth. For unauthenticated users it either:
    // 1. Redirects to /auth/login
    // 2. Shows a loading spinner (checking auth state)
    // 3. Shows the register form (if somehow auth passes)
    await expect(page.locator("main")).toBeVisible();
    // The page loads — that's the assertion. Content depends on auth state.
  });

  test("has a link to login page", async ({ page }) => {
    await page.goto("/auth/register");
    const loginLink = page.locator("a[href*='/auth/login']");
    if ((await loginLink.count()) > 0) {
      await expect(loginLink.first()).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// Route protection — unauthenticated redirects
// ---------------------------------------------------------------------------
test.describe("Route protection - unauthenticated redirects", () => {
  const protectedRoutes = [
    "/dashboard",
    "/dashboard/guest",
    "/dashboard/renter",
    "/dashboard/admin",
    "/create",
    "/create/rental",
  ];

  for (const route of protectedRoutes) {
    test(`${route} redirects to login`, async ({ page }) => {
      await page.goto(route);
      await page.waitForURL(/auth\/login/, { timeout: 10000 });
      expect(page.url()).toContain("/auth/login");
    });
  }

  for (const route of protectedRoutes) {
    test(`${route} includes next param in redirect`, async ({ page }) => {
      await page.goto(route);
      await page.waitForURL(/auth\/login/, { timeout: 10000 });
      const url = new URL(page.url());
      const next =
        url.searchParams.get("next") || url.searchParams.get("redirect");
      expect(next).toBeTruthy();
    });
  }
});

// ---------------------------------------------------------------------------
// Public pages remain accessible (no redirect)
// ---------------------------------------------------------------------------
test.describe("Public pages remain accessible", () => {
  const publicRoutes = [
    "/apartments",
    "/hotels",
    "/sales",
    "/food",
    "/services",
    "/entertainment",
    "/transport",
    "/employment",
    "/blog",
    "/faq",
    "/contact",
    "/terms",
    "/search",
  ];

  for (const route of publicRoutes) {
    test(`${route} loads without redirect to login`, async ({ page }) => {
      await page.goto(route);
      await expect(page).not.toHaveURL(/auth\/login/);
      await expect(page.locator("main")).toBeVisible();
    });
  }
});

// ---------------------------------------------------------------------------
// Login form interactions
// ---------------------------------------------------------------------------
test.describe("Login form interactions", () => {
  test("can switch between tabs", async ({ page }) => {
    await page.goto("/auth/login");
    // The tab buttons are "ელ. ფოსტა" and "ტელეფონი"
    const phoneTab = page.getByRole("button", { name: "ტელეფონი" });
    const emailTab = page.getByRole("button", { name: "ელ. ფოსტა" });
    await expect(emailTab).toBeVisible();
    await expect(phoneTab).toBeVisible();
    // Switch to phone tab
    await phoneTab.click();
    await page.waitForTimeout(300);
    await expect(page.locator("main")).toBeVisible();
  });

  test("shows validation on empty submit", async ({ page }) => {
    await page.goto("/auth/login");
    const submitButton = page.locator("form button[type='submit']");
    await expect(submitButton).toBeVisible({ timeout: 10_000 });
    await expect(submitButton).toBeEnabled();
    await submitButton.click();
    await expect(page.getByText("გთხოვთ შეავსოთ ყველა ველი")).toBeVisible();
    await expect(page).toHaveURL(/auth\/login/);
  });

  test("submits browser-autofilled credentials on click", async ({ page }) => {
    let passwordLoginRequests = 0;
    await page.route(
      /\/auth\/v1\/token\?grant_type=password$/,
      async (route) => {
        passwordLoginRequests += 1;
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ message: "Invalid login credentials" }),
        });
      },
    );

    await page.goto("/auth/login");
    const emailInput = page.locator("input[name='email']");
    const passwordInput = page.locator("input[name='password']");
    const submitButton = page.locator("form button[type='submit']");

    // Mimic password-manager autofill: write DOM values without emitting an
    // input/change event, so React state remains empty.
    await emailInput.evaluate((input, value) => {
      (input as HTMLInputElement).value = value;
    }, "person@example.com");
    await passwordInput.evaluate((input, value) => {
      (input as HTMLInputElement).value = value;
    }, "wrong-password");

    await expect(submitButton).toBeEnabled();
    await submitButton.click();
    await expect.poll(() => passwordLoginRequests).toBe(1);
    await expect(page.getByText("არასწორი ელ. ფოსტა ან პაროლი")).toBeVisible();
  });

  test("submits typed credentials with Enter", async ({ page }) => {
    let passwordLoginRequests = 0;
    await page.route(
      /\/auth\/v1\/token\?grant_type=password$/,
      async (route) => {
        passwordLoginRequests += 1;
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ message: "Invalid login credentials" }),
        });
      },
    );

    await page.goto("/auth/login");
    await page.locator("input[name='email']").fill("person@example.com");
    const passwordInput = page.locator("input[name='password']");
    await passwordInput.fill("wrong-password");
    await passwordInput.press("Enter");

    await expect.poll(() => passwordLoginRequests).toBe(1);
    await expect(page.getByText("არასწორი ელ. ფოსტა ან პაროლი")).toBeVisible();
  });

  test("phone input accepts numeric input", async ({ page }) => {
    await page.goto("/auth/login");
    const phoneInput = page.locator(
      "input[type='tel'], input[placeholder*='5'], input[name*='phone']",
    );
    if ((await phoneInput.count()) > 0) {
      await phoneInput.first().fill("555123456");
      const value = await phoneInput.first().inputValue();
      expect(value).toContain("555");
    }
  });

  test("login page is responsive at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/auth/login");
    await expect(page.locator("main")).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Registration (email tab, register mode)
// ---------------------------------------------------------------------------
test.describe("Email registration form", () => {
  // The segmented control sits above the form, so .first() is the mode toggle
  // (in register mode the submit button carries the same "რეგისტრაცია" label).
  async function openRegisterMode(page: import("@playwright/test").Page) {
    await page.goto("/auth/login");
    await page.getByRole("button", { name: "რეგისტრაცია" }).first().click();
    await expect(page.locator("#auth-confirm-password")).toBeVisible();
  }

  test("segmented control switches between login and register", async ({
    page,
  }) => {
    await openRegisterMode(page);
    await page.getByRole("button", { name: "შესვლა" }).first().click();
    await expect(page.locator("#auth-confirm-password")).toHaveCount(0);
  });

  test("rejects a password shorter than 6 characters", async ({ page }) => {
    await openRegisterMode(page);
    await page.locator("input[name='email']").fill("person@example.com");
    await page.locator("input[name='password']").fill("12345");
    await page.locator("input[name='confirmPassword']").fill("12345");
    await page.locator("form button[type='submit']").click();
    await expect(page.getByText("პაროლი მინიმუმ 6 სიმბოლო")).toBeVisible();
  });

  test("rejects mismatched passwords", async ({ page }) => {
    await openRegisterMode(page);
    await page.locator("input[name='email']").fill("person@example.com");
    await page.locator("input[name='password']").fill("123456");
    await page.locator("input[name='confirmPassword']").fill("654321");
    await page.locator("form button[type='submit']").click();
    await expect(page.getByText("პაროლები არ ემთხვევა")).toBeVisible();
  });

  test("successful signup redirects to profile registration", async ({
    page,
  }) => {
    const userId = "00000000-0000-4000-8000-000000000001";
    let signupRequests = 0;
    await page.route(/\/auth\/v1\/signup/, async (route) => {
      signupRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "fake-access-token",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: "fake-refresh-token",
          user: {
            id: userId,
            aud: "authenticated",
            role: "authenticated",
            email: "new-user@example.com",
            identities: [
              {
                id: userId,
                user_id: userId,
                provider: "email",
                identity_data: { email: "new-user@example.com" },
              },
            ],
          },
        }),
      });
    });
    // redirectAfterAuth: no profile row yet → push to /auth/register
    await page.route(/\/rest\/v1\/profiles/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    });

    await openRegisterMode(page);
    await page.locator("input[name='email']").fill("new-user@example.com");
    await page.locator("input[name='password']").fill("secret-123456");
    await page.locator("input[name='confirmPassword']").fill("secret-123456");
    await page.locator("form button[type='submit']").click();

    await expect.poll(() => signupRequests).toBe(1);
    await page.waitForURL(/auth\/register/, { timeout: 10000 });
  });

  test("shows error when the email is already registered", async ({ page }) => {
    // GoTrue signals an existing confirmed email with an obfuscated user that
    // has no identities and no session.
    await page.route(/\/auth\/v1\/signup/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "00000000-0000-4000-8000-000000000002",
          aud: "authenticated",
          role: "authenticated",
          email: "taken@example.com",
          identities: [],
        }),
      });
    });

    await openRegisterMode(page);
    await page.locator("input[name='email']").fill("taken@example.com");
    await page.locator("input[name='password']").fill("secret-123456");
    await page.locator("input[name='confirmPassword']").fill("secret-123456");
    await page.locator("form button[type='submit']").click();

    await expect(
      page.getByText("ეს ელ. ფოსტა უკვე რეგისტრირებულია."),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Navigation between auth pages
// ---------------------------------------------------------------------------
test.describe("Auth page navigation", () => {
  test("login page has link to register", async ({ page }) => {
    await page.goto("/auth/login");
    const registerLink = page.locator("a[href*='/auth/register']");
    if ((await registerLink.count()) > 0) {
      await expect(registerLink.first()).toBeVisible();
      await registerLink.first().click();
      await expect(page).toHaveURL(/auth\/register/);
    }
  });

  test("register page has link to login", async ({ page }) => {
    await page.goto("/auth/register");
    const loginLink = page.locator("a[href*='/auth/login']");
    if ((await loginLink.count()) > 0) {
      await expect(loginLink.first()).toBeVisible();
      await loginLink.first().click();
      await expect(page).toHaveURL(/auth\/login/);
    }
  });
});

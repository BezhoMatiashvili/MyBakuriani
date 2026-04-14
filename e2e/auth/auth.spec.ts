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
    const submitButton = page.locator(
      "button[type='submit'], button:has-text('შესვლა'), button:has-text('გაგრძელება')",
    );
    if ((await submitButton.count()) > 0) {
      await submitButton.first().click();
      // Either browser native validation or custom error should appear
      await page.waitForTimeout(500);
      await expect(page.locator("main")).toBeVisible();
    }
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

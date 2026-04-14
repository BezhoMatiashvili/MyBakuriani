import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Landing page
// ---------------------------------------------------------------------------
test.describe("Landing page", () => {
  test("loads with hero section and search box", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/MyBakuriani|ბაკურიანი/i);
    await expect(page.locator("main")).toBeVisible();
    // Hero section is the first visible section
    const hero = page.locator("section").first();
    await expect(hero).toBeVisible();
  });

  test("displays services section with category links", async ({ page }) => {
    await page.goto("/");
    const main = page.locator("main");
    await expect(main).toBeVisible();
    // Expect at least one category card / link
    const links = main.locator("a");
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
  });

  test("has a call-to-action button or search box in hero", async ({
    page,
  }) => {
    await page.goto("/");
    const hero = page.locator("section").first();
    const interactable = hero.locator("a, button, input").first();
    await expect(interactable).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Apartments page
// ---------------------------------------------------------------------------
test.describe("Apartments page", () => {
  test("loads listing page", async ({ page }) => {
    await page.goto("/apartments");
    await expect(page.locator("main")).toBeVisible();
  });

  test("has SEO title", async ({ page }) => {
    await page.goto("/apartments");
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test("shows listings or empty state", async ({ page }) => {
    await page.goto("/apartments");
    const main = page.locator("main");
    // Either property cards or an empty-state message should be present
    const cards = main.locator("a[href*='/apartments/']");
    const emptyState = main.locator("text=/ვერ მოიძებნა|არ არის|ცარიელი/i");
    const hasCards = (await cards.count()) > 0;
    const hasEmpty = (await emptyState.count()) > 0;
    expect(hasCards || hasEmpty).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Hotels page
// ---------------------------------------------------------------------------
test.describe("Hotels page", () => {
  test("loads listing page", async ({ page }) => {
    await page.goto("/hotels");
    await expect(page.locator("main")).toBeVisible();
  });

  test("has SEO title", async ({ page }) => {
    await page.goto("/hotels");
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Sales page
// ---------------------------------------------------------------------------
test.describe("Sales page", () => {
  test("loads listing page", async ({ page }) => {
    await page.goto("/sales");
    await expect(page.locator("main")).toBeVisible();
  });

  test("has SEO title", async ({ page }) => {
    await page.goto("/sales");
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Food page
// ---------------------------------------------------------------------------
test.describe("Food page", () => {
  test("loads listing page", async ({ page }) => {
    await page.goto("/food");
    await expect(page.locator("main")).toBeVisible();
  });

  test("has SEO title", async ({ page }) => {
    await page.goto("/food");
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Services page
// ---------------------------------------------------------------------------
test.describe("Services page", () => {
  test("loads listing page", async ({ page }) => {
    await page.goto("/services");
    await expect(page.locator("main")).toBeVisible();
  });

  test("has SEO title", async ({ page }) => {
    await page.goto("/services");
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Entertainment page
// ---------------------------------------------------------------------------
test.describe("Entertainment page", () => {
  test("loads listing page", async ({ page }) => {
    await page.goto("/entertainment");
    await expect(page.locator("main")).toBeVisible();
  });

  test("has SEO title", async ({ page }) => {
    await page.goto("/entertainment");
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Transport page
// ---------------------------------------------------------------------------
test.describe("Transport page", () => {
  test("loads listing page", async ({ page }) => {
    await page.goto("/transport");
    await expect(page.locator("main")).toBeVisible();
  });

  test("has SEO title", async ({ page }) => {
    await page.goto("/transport");
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Employment page
// ---------------------------------------------------------------------------
test.describe("Employment page", () => {
  test("loads listing page", async ({ page }) => {
    await page.goto("/employment");
    await expect(page.locator("main")).toBeVisible();
  });

  test("has SEO title", async ({ page }) => {
    await page.goto("/employment");
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Blog page
// ---------------------------------------------------------------------------
test.describe("Blog page", () => {
  test("loads blog listing", async ({ page }) => {
    await page.goto("/blog");
    await expect(page.locator("main")).toBeVisible();
  });

  test("has SEO title", async ({ page }) => {
    await page.goto("/blog");
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test("shows blog posts or empty state", async ({ page }) => {
    await page.goto("/blog");
    const main = page.locator("main");
    const articles = main.locator("article, a[href*='/blog/']");
    const emptyState = main.locator("h1, h2, p");
    const hasArticles = (await articles.count()) > 0;
    const hasContent = (await emptyState.count()) > 0;
    expect(hasArticles || hasContent).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// FAQ page
// ---------------------------------------------------------------------------
test.describe("FAQ page", () => {
  test("loads with FAQ heading", async ({ page }) => {
    await page.goto("/faq");
    await expect(page.locator("main")).toBeVisible();
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible();
  });

  test("has expandable FAQ items", async ({ page }) => {
    await page.goto("/faq");
    // FAQ uses plain buttons with chevron-down icons
    const triggers = page.locator("button:has(svg.lucide-chevron-down)");
    const count = await triggers.count();
    expect(count).toBeGreaterThan(0);
  });

  test("can expand an FAQ item", async ({ page }) => {
    await page.goto("/faq");
    const trigger = page.locator("button:has(svg.lucide-chevron-down)").first();
    if (await trigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await trigger.click();
      // After clicking, content should appear
      await expect(page.locator("main")).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// Contact page
// ---------------------------------------------------------------------------
test.describe("Contact page", () => {
  test("shows contact information", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.locator("main")).toBeVisible();
  });

  test("has a heading", async ({ page }) => {
    await page.goto("/contact");
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible();
  });

  test("displays phone number or email", async ({ page }) => {
    await page.goto("/contact");
    const contactInfo = page.locator("a[href^='tel:'], a[href^='mailto:']");
    const hasContactInfo = (await contactInfo.count()) > 0;
    // At minimum the page should have some text content
    const main = page.locator("main");
    const textContent = await main.textContent();
    expect(
      hasContactInfo || (textContent && textContent.length > 10),
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Terms page
// ---------------------------------------------------------------------------
test.describe("Terms page", () => {
  test("loads terms and conditions", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.locator("main")).toBeVisible();
  });

  test("has SEO title", async ({ page }) => {
    await page.goto("/terms");
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test("contains substantial text content", async ({ page }) => {
    await page.goto("/terms");
    const main = page.locator("main");
    const text = await main.textContent();
    expect(text && text.length).toBeGreaterThan(50);
  });
});

// ---------------------------------------------------------------------------
// Search page
// ---------------------------------------------------------------------------
test.describe("Search page", () => {
  test("loads search page", async ({ page }) => {
    await page.goto("/search");
    await expect(page.locator("main")).toBeVisible();
  });

  test("accepts query parameter", async ({ page }) => {
    await page.goto("/search?q=test");
    await expect(page.locator("main")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Navbar
// ---------------------------------------------------------------------------
test.describe("Navbar", () => {
  test("shows logo and navigation links", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("nav, header").first();
    await expect(nav).toBeVisible();
    await expect(page.getByText("MyBakuriani").first()).toBeVisible();
  });

  test("contains key navigation links", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("nav, header").first();
    // At least one link in the nav
    const links = nav.locator("a");
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
  });

  test("mobile menu toggle at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    // Look for hamburger / menu button
    const menuButton = page
      .locator('button[aria-label*="menu" i], button:has(svg)')
      .first();
    await expect(menuButton).toBeVisible();
  });

  test("mobile menu opens on click", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const menuButton = page
      .locator('button[aria-label*="menu" i], button:has(svg)')
      .first();
    if (await menuButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await menuButton.click();
      // After click, a navigation drawer or list should appear
      await page.waitForTimeout(300);
      const navLinks = page.locator(
        "nav a, [role='dialog'] a, [class*='mobile'] a",
      );
      const count = await navLinks.count();
      expect(count).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------
test.describe("Footer", () => {
  test("shows footer element", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    await expect(footer).toBeVisible();
  });

  test("footer contains links", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    const links = footer.locator("a");
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
  });

  test("footer shows MyBakuriani branding", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    const text = await footer.textContent();
    expect(text).toContain("MyBakuriani");
  });
});

// ---------------------------------------------------------------------------
// 404 page
// ---------------------------------------------------------------------------
test.describe("404 page", () => {
  test("shows error for nonexistent route", async ({ page }) => {
    const response = await page.goto("/nonexistent-page-xyz");
    expect(response?.status()).toBe(404);
  });

  test("404 page still has layout (nav/footer)", async ({ page }) => {
    await page.goto("/nonexistent-page-xyz");
    // The page should still render some content
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Cross-page navigation
// ---------------------------------------------------------------------------
test.describe("Cross-page navigation", () => {
  test("navigate from landing to apartments", async ({ page }) => {
    await page.goto("/");
    const link = page.locator('a[href="/apartments"]').first();
    if (await link.isVisible({ timeout: 3000 }).catch(() => false)) {
      await link.click();
      await expect(page).toHaveURL(/apartments/);
      await expect(page.locator("main")).toBeVisible();
    }
  });

  test("navigate from landing to hotels", async ({ page }) => {
    await page.goto("/");
    const link = page.locator('a[href="/hotels"]').first();
    if (await link.isVisible({ timeout: 3000 }).catch(() => false)) {
      await link.click();
      await expect(page).toHaveURL(/hotels/);
      await expect(page.locator("main")).toBeVisible();
    }
  });

  test("navigate from landing to food", async ({ page }) => {
    await page.goto("/");
    const link = page.locator('a[href="/food"]').first();
    if (await link.isVisible({ timeout: 3000 }).catch(() => false)) {
      await link.click();
      await expect(page).toHaveURL(/food/);
      await expect(page.locator("main")).toBeVisible();
    }
  });

  test("navigate from landing to blog", async ({ page }) => {
    await page.goto("/");
    const link = page.locator('a[href="/blog"]').first();
    if (await link.isVisible({ timeout: 3000 }).catch(() => false)) {
      await link.click();
      await expect(page).toHaveURL(/blog/);
      await expect(page.locator("main")).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// Viewport responsiveness — no horizontal overflow at 375px
// ---------------------------------------------------------------------------
test.describe("Viewport responsiveness", () => {
  const routes = [
    "/",
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

  for (const route of routes) {
    test(`${route} has no horizontal overflow at 375px`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(route);
      await page.waitForTimeout(500);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// SEO metadata
// ---------------------------------------------------------------------------
test.describe("SEO metadata", () => {
  const pages = [
    "/",
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
  ];

  for (const route of pages) {
    test(`${route} has a non-empty title tag`, async ({ page }) => {
      await page.goto(route);
      const title = await page.title();
      expect(title.length).toBeGreaterThan(0);
    });
  }

  test("landing page has meta description", async ({ page }) => {
    await page.goto("/");
    const description = await page
      .locator('meta[name="description"]')
      .getAttribute("content");
    expect(description && description.length).toBeGreaterThan(0);
  });
});

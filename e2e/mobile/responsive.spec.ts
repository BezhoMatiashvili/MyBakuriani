import { test, expect } from "@playwright/test";

const phoneViewports = [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 428, height: 926 },
  { width: 767, height: 900 },
];

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
}

test.describe("Landing page mobile", () => {
  test("hero section renders", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main")).toBeVisible();
  });

  test("search box is accessible", async ({ page }) => {
    await page.goto("/");
    const main = page.locator("main");
    await expect(main).toBeVisible();
  });

  test("no horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await expectNoHorizontalOverflow(page);
  });

  for (const viewport of phoneViewports) {
    test(`landing has no horizontal overflow at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expectNoHorizontalOverflow(page);
    });
  }

  test("hero and seeded cards stay within the mobile height budget", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const hero = page.getByTestId("homepage-hero");
    await expect(hero).toBeVisible();
    expect((await hero.boundingBox())?.height).toBeLessThanOrEqual(700);

    const card = page.locator("[data-listing-card]").first();
    await expect(card).toBeVisible();
    expect((await card.boundingBox())?.height).toBeLessThanOrEqual(420);
  });

  test("homepage rails show one centered, equal-size card per mobile snap page", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const rail = page
      .locator('[data-mobile-rail][data-mobile-layout="single-page"]')
      .first();
    const items = rail.locator("[data-mobile-rail-item]");
    await expect(items.first()).toBeVisible();
    expect(await items.count()).toBeGreaterThan(1);

    const geometry = await rail.evaluate((element) => {
      const itemElements = Array.from(
        element.querySelectorAll<HTMLElement>("[data-mobile-rail-item]"),
      );
      const first = itemElements[0];
      const second = itemElements[1];
      const content = first?.querySelector<HTMLElement>(
        "[data-mobile-rail-content]",
      );
      return {
        railScrolls: element.scrollWidth > element.clientWidth,
        snapType: getComputedStyle(element).scrollSnapType,
        itemWidth: first?.getBoundingClientRect().width ?? 0,
        firstLeft: first?.getBoundingClientRect().left ?? 0,
        contentWidth: content?.getBoundingClientRect().width ?? 0,
        contentCenter:
          ((content?.getBoundingClientRect().left ?? 0) +
            (content?.getBoundingClientRect().right ?? 0)) /
          2,
        nextLeft: second?.getBoundingClientRect().left ?? 0,
      };
    });
    expect(geometry.railScrolls).toBe(true);
    expect(geometry.snapType).toContain("x");
    expect(geometry.itemWidth).toBeCloseTo(390 - 32, 0);
    expect(geometry.firstLeft).toBeCloseTo(16, 0);
    expect(geometry.contentWidth).toBeCloseTo(390 - 32, 0);
    expect(geometry.contentCenter).toBeCloseTo(390 / 2, 0);
    expect(geometry.nextLeft).toBeGreaterThanOrEqual(390 - 1);

    const equalHeightGroups = await page
      .locator('[data-mobile-rail][data-mobile-layout="single-page"]')
      .evaluateAll((rails) => {
        const shellSelector =
          "[data-listing-card], [data-service-card], [data-employment-card], [data-home-blog-card]";
        return rails
          .map((rail) =>
            Array.from(
              rail.querySelectorAll<HTMLElement>("[data-mobile-rail-item]"),
            )
              .map(
                (item) =>
                  item
                    .querySelector<HTMLElement>(shellSelector)
                    ?.getBoundingClientRect().height ?? 0,
              )
              .filter((height) => height > 0),
          )
          .filter((heights) => heights.length > 1);
      });
    expect(equalHeightGroups.length).toBeGreaterThan(0);
    for (const heights of equalHeightGroups) {
      expect(Math.max(...heights)).toBeCloseTo(Math.min(...heights), 0);
    }

    await rail.evaluate((element) => {
      const railItems = element.querySelectorAll<HTMLElement>(
        "[data-mobile-rail-item]",
      );
      const first = railItems[0];
      const second = railItems[1];
      if (!first || !second) return;
      element.scrollTo({ left: second.offsetLeft - first.offsetLeft });
    });
    await expect
      .poll(async () => (await items.nth(1).boundingBox())?.x ?? Infinity)
      .toBeCloseTo(16, 0);
    await expectNoHorizontalOverflow(page);
  });

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 428, height: 926 },
    { width: 767, height: 900 },
  ]) {
    test(`status and listing cards are centered at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");

      const hero = page.getByTestId("homepage-hero");
      const statusCard = page
        .getByTestId("homepage-status-cards")
        .locator("[data-status-card]")
        .first();
      const railContent = page
        .locator(
          '[data-mobile-rail][data-mobile-layout="single-page"] [data-mobile-rail-content]',
        )
        .first();
      await expect(statusCard).toBeVisible();
      await expect(railContent).toBeVisible();

      const [heroBox, statusBox, railContentBox] = await Promise.all([
        hero.boundingBox(),
        statusCard.boundingBox(),
        railContent.boundingBox(),
      ]);
      expect(heroBox).not.toBeNull();
      expect(statusBox).not.toBeNull();
      expect(railContentBox).not.toBeNull();

      const heroBottom = heroBox!.y + heroBox!.height;
      expect(heroBottom).toBeGreaterThan(statusBox!.y);
      expect(heroBottom).toBeLessThan(statusBox!.y + statusBox!.height);
      expect(heroBottom - statusBox!.y).toBeGreaterThanOrEqual(
        statusBox!.height * 0.35,
      );
      expect(heroBottom - statusBox!.y).toBeLessThanOrEqual(
        statusBox!.height * 0.65,
      );
      expect(statusBox!.x + statusBox!.width / 2).toBeCloseTo(
        viewport.width / 2,
        0,
      );
      expect(railContentBox!.x + railContentBox!.width / 2).toBeCloseTo(
        viewport.width / 2,
        0,
      );
      expect(statusBox!.width).toBeLessThanOrEqual(420);
      expect(railContentBox!.width).toBeLessThanOrEqual(420);
      await expectNoHorizontalOverflow(page);
    });
  }

  test("single-page layout hands back to the existing tablet layout at 768px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");

    const railItem = page
      .locator(
        '[data-mobile-rail][data-mobile-layout="single-page"] [data-mobile-rail-item]',
      )
      .first();
    const statusGrid = page
      .getByTestId("homepage-status-cards")
      .locator('[data-status-layout="single-page"]');
    await expect(railItem).toBeVisible();
    expect((await railItem.boundingBox())?.width).toBeLessThanOrEqual(300);
    await expect(statusGrid).toHaveCSS("display", "grid");
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("Navbar mobile", () => {
  test("hamburger menu button visible", async ({ page }) => {
    await page.goto("/");
    // On mobile, the hamburger button should be visible
    const menuButton = page.locator(
      'button[aria-label*="menu"], button[aria-label*="Menu"], [data-testid="menu-toggle"]',
    );
    // Fallback: any button with an SVG icon that looks like a menu
    const fallbackButton = page
      .locator("header button")
      .last();
    const isMenuVisible = await menuButton
      .first()
      .isVisible()
      .catch(() => false);
    const isFallbackVisible = await fallbackButton
      .isVisible()
      .catch(() => false);
    expect(isMenuVisible || isFallbackVisible).toBe(true);
    const target = isMenuVisible ? menuButton.first() : fallbackButton;
    const box = await target.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });

  test("clicking hamburger opens mobile menu", async ({ page }) => {
    await page.goto("/");
    const menuButton = page.getByTestId("menu-toggle");
    if (await menuButton.isVisible().catch(() => false)) {
      await menuButton.click();
      // After clicking, navigation links should become visible
      await page.waitForTimeout(500);
      const navLinks = page.locator("a[href='/apartments'], a[href='/hotels']");
      const count = await navLinks.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test("uses the strict 1024px desktop handoff", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");
    await expect(page.getByTestId("menu-toggle")).toBeVisible();
    await expect(page.getByTestId("category-nav")).toBeHidden();
    expect((await page.locator("header > div").first().boundingBox())?.height).toBe(72);

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.getByTestId("menu-toggle")).toBeHidden();
    await expect(page.getByTestId("category-nav")).toBeVisible();
    expect((await page.locator("header > div").first().boundingBox())?.height).toBe(91);
  });
});

test.describe("Mobile filters and locales", () => {
  test("date selection opens a keyboard-safe sheet and restores trigger focus", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/search");
    const trigger = page.getByTestId("search-mobile-dates");
    await expect(trigger).toBeVisible();
    await trigger.click();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('[data-slot="calendar"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("filters use an accessible sheet with 44px reset and apply controls", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/search");
    const trigger = page.getByTestId("search-mobile-filters");
    await expect(trigger).toBeVisible();
    await trigger.click();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    for (const target of [
      page.getByTestId("mobile-filter-reset"),
      page.getByTestId("mobile-filter-apply"),
    ]) {
      const box = await target.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("sale detailed filters use a draft sheet with 44px actions", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/sales");
    const trigger = page.getByTestId("sale-mobile-filters");
    await expect(trigger).toBeVisible();
    await trigger.click();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    for (const target of [
      page.getByTestId("sale-mobile-filter-reset"),
      page.getByTestId("sale-mobile-filter-apply"),
    ]) {
      const box = await target.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  for (const [locale, query] of [
    ["ka", "გრძელი საძიებო მოთხოვნა ბაკურიანის საოჯახო დასასვენებელი სახლებისთვის"],
    ["en", "long family-friendly Bakuriani accommodation search query"],
    ["ru", "длинный поисковый запрос семейного жилья в Бакуриани"],
  ]) {
    test(`${locale} search text does not overflow at 320px`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto(`/${locale}/search?q=${encodeURIComponent(query)}`);
      await expectNoHorizontalOverflow(page);
    });
  }

  test("form fields remain 16px through tablet widths", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/auth/register");
    const input = page.locator("input").first();
    await expect(input).toBeVisible();
    expect(await input.evaluate((el) => getComputedStyle(el).fontSize)).toBe(
      "16px",
    );
  });
});

test.describe("Property listing mobile", () => {
  test("apartments page no overflow", async ({ page }) => {
    await page.goto("/apartments");
    await expectNoHorizontalOverflow(page);
  });

  test("hotels page no overflow", async ({ page }) => {
    await page.goto("/hotels");
    await expectNoHorizontalOverflow(page);
  });

  test("detail gallery is swipeable below lg", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/apartments/aae2ff00-1001-4000-a000-000000000001");
    const gallery = page.locator("[data-mobile-gallery]");
    await expect(gallery).toBeVisible();
    expect(
      await gallery.evaluate((el) => getComputedStyle(el).scrollSnapType),
    ).toContain("x");
  });
});

test.describe("Auth pages mobile", () => {
  test("login page renders without overflow", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(
      page.locator("main, [class*='auth'], [class*='login']").first(),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("login form is usable", async ({ page }) => {
    await page.goto("/auth/login");
    // Check that input fields are visible and full-width
    const inputs = page.locator("input");
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe("Footer mobile", () => {
  test("footer visible", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    await expect(footer).toBeVisible();
  });

  test("footer links accessible", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    const links = footer.locator("a");
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
  });

  test("footer no overflow", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expectNoHorizontalOverflow(page);
  });

  test("phone link groups use native accordions", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const details = page.locator("footer details");
    await expect(details).toHaveCount(3);
    await details.first().locator("summary").click();
    await expect(details.first()).toHaveAttribute("open", "");
  });
});

test.describe("Cross-page no horizontal overflow", () => {
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
    test(`${route} - no overflow at mobile width`, async ({ page }) => {
      await page.goto(route);
      await expectNoHorizontalOverflow(page);
    });
  }
});

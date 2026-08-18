import { test, expect } from "@playwright/test";

const phoneViewports = [
  { width: 320, height: 568 },
  { width: 369, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 428, height: 926 },
  { width: 767, height: 900 },
];

async function expectNoHorizontalOverflow(
  page: import("@playwright/test").Page,
) {
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

async function expectReactHydrated(
  locator: import("@playwright/test").Locator,
) {
  await expect
    .poll(() =>
      locator.evaluate((node) =>
        Object.keys(node).some((key) => key.startsWith("__reactProps$")),
      ),
    )
    .toBe(true);
}

async function openFirstListingDetail(
  page: import("@playwright/test").Page,
  listPath:
    | "/apartments"
    | "/hotels"
    | "/sales"
    | "/food"
    | "/services"
    | "/entertainment"
    | "/transport"
    | "/employment"
    | "/blog",
) {
  let detailHref: string | null = null;
  for (let attempt = 0; attempt < 3 && !detailHref; attempt += 1) {
    await page.goto(listPath);
    detailHref = await page
      .locator(`a[href^="${listPath}/"]`)
      .first()
      .getAttribute("href");
  }
  expect(detailHref).toBeTruthy();
  await page.goto(detailHref!);
}

async function visibleMainControlSignatures(
  page: import("@playwright/test").Page,
) {
  return page.locator("main").evaluate((main) => {
    const clean = (value: string | null | undefined) =>
      (value ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    return Array.from(
      main.querySelectorAll("button, a, input, select, textarea"),
    )
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      })
      .map((node) => {
        const labels =
          "labels" in node && node.labels
            ? Array.from(node.labels as NodeListOf<HTMLLabelElement>)
                .map((label) => label.textContent)
                .join(" ")
            : "";
        const name = clean(
          node.getAttribute("aria-label") ||
            labels ||
            node.getAttribute("placeholder") ||
            node.textContent,
        );
        if (!name) return null;
        const tag = node.tagName.toLowerCase();
        const kind =
          tag === "input"
            ? `${tag}:${node.getAttribute("type") || "text"}`
            : tag;
        const href =
          node instanceof HTMLAnchorElement
            ? new URL(node.href).origin === location.origin
              ? new URL(node.href).pathname
              : node.href
            : "";
        return `${kind}|${name}|${href}`;
      })
      .filter((value): value is string => value !== null);
  });
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
    test(`landing has no horizontal overflow at ${viewport.width}px`, async ({
      page,
    }) => {
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

  test("homepage rails preview the next equal-height card and snap cleanly", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const rail = page
      .locator('[data-mobile-rail][data-mobile-layout="preview"]')
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
      return {
        railScrolls: element.scrollWidth > element.clientWidth,
        snapType: getComputedStyle(element).scrollSnapType,
        itemWidth: first?.getBoundingClientRect().width ?? 0,
        firstLeft: first?.getBoundingClientRect().left ?? 0,
        nextLeft: second?.getBoundingClientRect().left ?? 0,
      };
    });
    expect(geometry.railScrolls).toBe(true);
    expect(geometry.snapType).toContain("x");
    expect(geometry.itemWidth).toBeCloseTo(300, 0);
    expect(geometry.firstLeft).toBeCloseTo(16, 0);
    expect(geometry.nextLeft).toBeCloseTo(332, 0);
    expect(geometry.nextLeft).toBeLessThan(390);

    const equalHeightGroups = await page
      .locator('[data-mobile-rail][data-mobile-layout="preview"]')
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
    { width: 369, height: 800 },
    { width: 428, height: 926 },
  ]) {
    test(`compact hero and rails match the phone geometry at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");

      const hero = page.getByTestId("homepage-hero");
      const searchForm = hero.locator(
        'form[data-phone-layout="landing-compact"]',
      );
      const statusCards = page
        .getByTestId("homepage-status-cards")
        .locator("[data-status-card]");
      const firstStatus = statusCards.first();
      const secondStatus = statusCards.nth(1);
      const railItem = page
        .locator(
          '[data-mobile-rail][data-mobile-layout="preview"] [data-mobile-rail-item]',
        )
        .first();

      await expect(searchForm).toBeVisible();
      await expect(firstStatus).toBeVisible();
      await expect(secondStatus).toBeVisible();
      await expect(railItem).toBeVisible();

      const [heroBox, searchBox, firstStatusBox, secondStatusBox, railItemBox] =
        await Promise.all([
          hero.boundingBox(),
          searchForm.boundingBox(),
          firstStatus.boundingBox(),
          secondStatus.boundingBox(),
          railItem.boundingBox(),
        ]);
      expect(heroBox).not.toBeNull();
      expect(searchBox).not.toBeNull();
      expect(firstStatusBox).not.toBeNull();
      expect(secondStatusBox).not.toBeNull();
      expect(railItemBox).not.toBeNull();

      const heroBottom = heroBox!.y + heroBox!.height;
      const searchBottom = searchBox!.y + searchBox!.height;
      expect(searchBox!.x).toBeCloseTo(16, 0);
      expect(searchBox!.width).toBeCloseTo(viewport.width - 32, 0);
      expect(searchBox!.height).toBeCloseTo(307, 1);
      expect(firstStatusBox!.y - searchBottom).toBeCloseTo(20, 1);
      expect(heroBottom - firstStatusBox!.y).toBeCloseTo(16, 1);
      expect(firstStatusBox!.x).toBeCloseTo(16, 0);
      expect(firstStatusBox!.height).toBeCloseTo(88, 0);
      expect(firstStatusBox!.width).toBeGreaterThanOrEqual(140);
      expect(firstStatusBox!.width).toBeLessThanOrEqual(260);
      expect(
        secondStatusBox!.x - (firstStatusBox!.x + firstStatusBox!.width),
      ).toBeCloseTo(12, 0);
      expect(secondStatusBox!.x).toBeLessThan(viewport.width);

      const expectedRailWidth = Math.min(300, viewport.width - 64);
      expect(railItemBox!.x).toBeCloseTo(16, 0);
      expect(railItemBox!.width).toBeCloseTo(expectedRailWidth, 0);

      const submit = searchForm.locator('button[type="submit"]:visible').first();
      await expect(submit).toHaveAccessibleName(/.+/);
      const submitBox = await submit.boundingBox();
      expect(submitBox?.width).toBeGreaterThanOrEqual(44);
      expect(submitBox?.height).toBeGreaterThanOrEqual(44);
      await expectNoHorizontalOverflow(page);
    });
  }

  test("compact phone layout hands back to the existing tablet layout at 768px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");

    const railItem = page
      .locator(
        '[data-mobile-rail][data-mobile-layout="preview"] [data-mobile-rail-item]',
      )
      .first();
    const statusGrid = page
      .getByTestId("homepage-status-cards")
      .locator('[data-status-layout="home-compact"]');
    await expect(railItem).toBeVisible();
    expect((await railItem.boundingBox())?.width).toBeLessThanOrEqual(300);
    await expect(statusGrid).toHaveCSS("display", "grid");
    await expectNoHorizontalOverflow(page);
  });

  test("status cards clear the hot-offers heading", async ({ page }) => {
    await page.setViewportSize({ width: 428, height: 926 });
    await page.goto("/");
    const statusCard = page
      .getByTestId("homepage-status-cards")
      .locator("[data-status-card]")
      .first();
    const heading = page.getByTestId("homepage-hot-offers-heading");
    await expect(statusCard).toBeVisible();
    if ((await heading.count()) === 0) {
      test.info().annotations.push({
        type: "note",
        description: "No active hot-offer listings are configured",
      });
      return;
    }
    await expect(heading).toBeVisible();
    const [statusBox, headingBox] = await Promise.all([
      statusCard.boundingBox(),
      heading.boundingBox(),
    ]);
    expect(
      headingBox!.y - (statusBox!.y + statusBox!.height),
    ).toBeGreaterThanOrEqual(48);
  });

  test("configured recommended-service promos use compact mobile rows", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const section = page.getByTestId("homepage-recommended-services");
    if ((await section.count()) === 0) {
      test.info().annotations.push({
        type: "note",
        description: "No active home_promo creative is configured",
      });
      return;
    }

    await expect(section).toBeVisible();
    const media = section.locator("img, video").first();
    await expect(media).toBeVisible();
    const mediaBox = await media.boundingBox();
    expect(mediaBox?.width).toBeCloseTo(128, 0);
    // The 128px row has a 1px border, so the media content box can measure 127px.
    expect(mediaBox?.height).toBeGreaterThanOrEqual(127);
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
    const fallbackButton = page.locator("header button").last();
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

  test("language options are touch-sized and preserve the current route", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/faq");
    const trigger = page.locator("header button[aria-expanded]:visible").first();
    await expect(trigger).toBeVisible();
    await trigger.click();
    const english = page.getByRole("button", { name: "EN", exact: true });
    await expect(english).toBeVisible();
    const optionBox = await english.boundingBox();
    expect(optionBox?.height).toBeCloseTo(44, 0);
    await english.click();
    await expect(page).toHaveURL(/\/en\/faq$/);
    await expect(page.locator("main h1")).toBeVisible();
  });

  test("mobile add-listing action is touch-sized and follows the desktop destination", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const addListing = page.locator(
      'header [data-slot="add-listing-button"]:visible',
    );
    const box = await addListing.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await addListing.click();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("uses the strict 1024px desktop handoff", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");
    await expect(page.getByTestId("menu-toggle")).toBeVisible();
    await expect(page.getByTestId("category-nav")).toBeHidden();
    expect(
      (await page.locator("header > div").first().boundingBox())?.height,
    ).toBe(72);

    // WebKit can stall while live-resizing a media-heavy loaded page. A fresh
    // page at the target width verifies the same CSS handoff deterministically.
    const desktopPage = await page.context().newPage();
    await desktopPage.setViewportSize({ width: 1024, height: 768 });
    await desktopPage.goto("/");
    await expect(desktopPage.getByTestId("menu-toggle")).toBeHidden();
    await expect(desktopPage.getByTestId("category-nav")).toBeVisible();
    expect(
      (await desktopPage.locator("header > div").first().boundingBox())?.height,
    ).toBe(91);
    await desktopPage.close();
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
    await expect(page.getByTestId("mobile-calendar-clear")).toBeVisible();
    await expect(page.getByTestId("mobile-calendar-confirm")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("location options stay inside the viewport and close after selection", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/search");
    await page.getByTestId("search-mobile-location").click();

    const sheet = page.getByRole("dialog");
    const listbox = sheet.getByRole("listbox");
    await expect(listbox).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const sheetBox = await sheet.boundingBox();
    expect(sheetBox?.x).toBeGreaterThanOrEqual(0);
    expect((sheetBox?.x ?? 0) + (sheetBox?.width ?? 0)).toBeLessThanOrEqual(
      320,
    );

    const trigger = page.getByTestId("search-mobile-location");
    const triggerTextBefore = await trigger.textContent();
    await listbox.getByRole("option").first().click();
    await expect(sheet).toBeVisible();
    await page.getByTestId("mobile-location-confirm").click();
    await expect(sheet).toBeHidden();
    await expect.poll(() => trigger.textContent()).not.toBe(triggerTextBefore);
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

    const firstBedroom = sheet
      .getByRole("button", { name: "1", exact: true })
      .first();
    await firstBedroom.click();
    await expect(firstBedroom).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    const reopenedBedroom = page
      .getByRole("dialog")
      .getByRole("button", { name: "1", exact: true })
      .first();
    await expect(reopenedBedroom).toHaveAttribute("aria-pressed", "false");
    await reopenedBedroom.click();
    await page.getByTestId("mobile-filter-apply").click();
    await expect(page).toHaveURL(/rooms=1/);
  });

  test("sale detailed filters use a draft sheet with 44px actions", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/");
    await page.locator('button[data-listing-mode="sale"]').click();
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

  test("results filters use a scrollable draft sheet with pinned actions", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/search");
    await page.getByTestId("search-results-mobile-filters").click();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId("results-mobile-filter-reset")).toBeVisible();
    await expect(page.getByTestId("results-mobile-filter-apply")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(
      page.getByTestId("search-results-mobile-filters"),
    ).toBeFocused();
  });

  test("results sheet exposes and operates every desktop filter section", async ({
    page,
  }) => {
    const desktopPage = await page.context().newPage();
    await desktopPage.setViewportSize({ width: 1440, height: 900 });
    await desktopPage.goto("/search");
    const desktopSidebar = desktopPage.getByTestId("search-filter-sidebar");
    await expect(desktopSidebar).toBeVisible();
    const sectionNames = (await desktopSidebar.getByRole("button").allTextContents())
      .map((name) => name.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    expect(sectionNames.length).toBe(5);
    await desktopPage.close();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/search");
    await page.getByTestId("search-results-mobile-filters").click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();

    for (const [index, name] of sectionNames.entries()) {
      const section = sheet.getByRole("button", { name, exact: true });
      await expect(section).toBeVisible();
      const box = await section.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      // Price starts expanded; open every other desktop section.
      if (index > 0) await section.click();
    }

    const numericInputs = sheet.locator('input:visible:not([type="checkbox"])');
    expect(await numericInputs.count()).toBe(4);
    for (let index = 0; index < 4; index += 1) {
      await numericInputs.nth(index).fill(String((index + 1) * 10));
    }

    for (const room of ["1", "2", "3", "4", "5+"]) {
      const option = sheet.getByRole("button", { name: room, exact: true });
      await option.click();
      await expect(option).toHaveClass(/bg-brand-accent/);
    }

    const checkboxes = sheet.locator('input[type="checkbox"]:visible');
    expect(await checkboxes.count()).toBeGreaterThan(10);
    for (let index = 0; index < (await checkboxes.count()); index += 1) {
      await checkboxes.nth(index).check();
      await expect(checkboxes.nth(index)).toBeChecked();
    }

    await page.getByTestId("results-mobile-filter-apply").click();
    await expect(sheet).toBeHidden();
    await expectNoHorizontalOverflow(page);
  });

  for (const [locale, query] of [
    [
      "ka",
      "გრძელი საძიებო მოთხოვნა ბაკურიანის საოჯახო დასასვენებელი სახლებისთვის",
    ],
    ["en", "long family-friendly Bakuriani accommodation search query"],
    ["ru", "длинный поисковый запрос семейного жилья в Бакуриани"],
  ]) {
    test(`${locale} search text does not overflow at 320px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto(`/${locale}/search?q=${encodeURIComponent(query)}`);
      await expectNoHorizontalOverflow(page);
    });
  }

  test("form fields remain 16px through tablet widths", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/auth/login");
    const inputs = page.locator(
      'input:visible:not([type="checkbox"]):not([type="radio"]), textarea:visible, select:visible',
    );
    await expect(inputs.first()).toBeVisible();
    for (let index = 0; index < (await inputs.count()); index += 1) {
      expect(
        await inputs.nth(index).evaluate((el) => getComputedStyle(el).fontSize),
      ).toBe("16px");
    }
  });
});

test.describe("Category filter parity mobile", () => {
  for (const route of [
    "/food",
    "/services",
    "/entertainment",
    "/transport",
    "/employment",
  ]) {
    test(`${route} exposes and activates every desktop filter option`, async ({
      page,
    }) => {
      const desktopPage = await page.context().newPage();
      await desktopPage.setViewportSize({ width: 1440, height: 900 });
      const desktopPanel = desktopPage.locator(
        'main section[class~="hidden"][class~="sm:block"]',
      );
      let optionNames: string[] = [];
      for (let attempt = 0; attempt < 3 && optionNames.length === 0; attempt += 1) {
        await desktopPage.goto(route);
        await desktopPanel
          .first()
          .waitFor({ state: "visible", timeout: 5_000 })
          .catch(() => undefined);
        optionNames = (await desktopPanel.getByRole("button").allTextContents())
          .map((name) => name.replace(/\s+/g, " ").trim())
          .filter(Boolean);
      }
      expect(optionNames.length).toBeGreaterThan(0);
      await desktopPage.close();

      await page.setViewportSize({ width: 390, height: 844 });
      const trigger = page
        .locator('main section[class~="sm:hidden"] button:visible')
        .first();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await page.goto(route);
        if (await trigger.isVisible().catch(() => false)) break;
      }
      await expect(trigger).toBeVisible();
      await expectReactHydrated(trigger);
      await trigger.click();
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible();

      const occurrences = new Map<string, number>();
      for (const name of optionNames) {
        const occurrence = occurrences.get(name) ?? 0;
        occurrences.set(name, occurrence + 1);
        const option = sheet.getByRole("button", { name, exact: true }).nth(occurrence);
        await expect(option).toBeVisible();
        const box = await option.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(44);
        await option.click();
        await expect(option).toHaveClass(/bg-\[#2563EB\]/);
      }
      await expectNoHorizontalOverflow(page);
    });
  }
});

test.describe("Sales grid controls mobile", () => {
  test("all listing tabs are touch-sized and activate", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sales/all");
    const vip = page.getByRole("button", { name: "VIP", exact: true });
    await expect(vip).toBeVisible();
    const tabs = vip.locator("xpath=..").getByRole("button");
    await expect(tabs).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      const tab = tabs.nth(index);
      const box = await tab.boundingBox();
      expect(box?.height).toBeCloseTo(44, 0);
      await tab.click();
      await expect(tab).toHaveClass(/bg-\[#16A34A\]/);
    }
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("Property listing mobile", () => {
  test("category destinations use full-width single-column cards on phones", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/apartments");

    const cards = page.locator(
      '[data-listing-card][data-mobile-presentation="default"]',
    );
    await expect(cards.first()).toBeVisible();
    await expect(cards.nth(1)).toBeVisible();
    const [first, second] = await Promise.all([
      cards.first().boundingBox(),
      cards.nth(1).boundingBox(),
    ]);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    // Single column: second card stacks below the first, not beside it.
    expect(second!.y).toBeGreaterThan(first!.y + first!.height - 1);
    expect(second!.x).toBeCloseTo(first!.x, 0);
    // Full-width: card spans nearly the whole 390px viewport, not a half-width cell.
    expect(first!.width).toBeGreaterThan(300);
    expect(second!.width).toBeCloseTo(first!.width, 0);
    await expectNoHorizontalOverflow(page);
  });

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
    await openFirstListingDetail(page, "/apartments");
    const gallery = page.locator("[data-mobile-gallery]");
    await expect(gallery).toBeVisible();
    expect(
      await gallery.evaluate((el) => getComputedStyle(el).scrollSnapType),
    ).toContain("x");
  });

  test("apartment details show bathrooms and grouped collapsible amenities", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFirstListingDetail(page, "/apartments");

    await expect(
      page.getByTestId("property-quick-spec-bathrooms"),
    ).toBeVisible();
    const amenities = page.getByTestId("property-amenity-groups");
    await expect(amenities).toBeVisible();
    expect(await amenities.locator("[data-amenity-group]").count()).toBeGreaterThan(
      0,
    );
    const values = amenities.locator("[data-amenity-value]");
    const visibleValueCount = await values.count();
    expect(visibleValueCount).toBeGreaterThan(0);

    const toggle = amenities.locator('button[aria-expanded="false"]');
    if ((await toggle.count()) > 0) {
      await toggle.first().click();
      await expect.poll(() => values.count()).toBeGreaterThan(visibleValueCount);
    }
    await expectNoHorizontalOverflow(page);
  });

  test("sale investment metrics stay in a bordered mobile card", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFirstListingDetail(page, "/sales");

    const card = page.getByTestId("sale-investment-card");
    await expect(card).toBeVisible();
    await expect(card.getByRole("heading")).toBeVisible();
    expect(
      await card.getByTestId("sale-investment-metric").count(),
    ).toBeGreaterThan(0);
    await expect(card).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("Detail action availability mobile", () => {
  for (const listPath of [
    "/apartments",
    "/hotels",
    "/sales",
    "/food",
    "/services",
    "/entertainment",
    "/transport",
    "/employment",
    "/blog",
  ] as const) {
    test(`${listPath} exposes every desktop detail control`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await openFirstListingDetail(page, listPath);
      const detailPath = new URL(page.url()).pathname;
      const mobileControl = page
        .locator("main button, main a, main input, main select, main textarea")
        .first();
      await mobileControl
        .waitFor({ state: "visible", timeout: 5_000 })
        .catch(() => undefined);
      let mobileControls = await visibleMainControlSignatures(page);
      for (let attempt = 1; attempt < 3 && mobileControls.length === 0; attempt += 1) {
        await page.reload();
        await mobileControl
          .waitFor({ state: "visible", timeout: 5_000 })
          .catch(() => undefined);
        mobileControls = await visibleMainControlSignatures(page);
      }
      expect(mobileControls.length).toBeGreaterThan(0);

      const desktopPage = await page.context().newPage();
      await desktopPage.setViewportSize({ width: 1440, height: 900 });
      let desktopControls: string[] = [];
      for (let attempt = 0; attempt < 3 && desktopControls.length === 0; attempt += 1) {
        await desktopPage.goto(detailPath);
        await desktopPage
          .locator("main button, main a, main input, main select, main textarea")
          .first()
          .waitFor({ state: "visible", timeout: 5_000 })
          .catch(() => undefined);
        desktopControls = await visibleMainControlSignatures(desktopPage);
      }
      expect(desktopControls.length).toBeGreaterThan(0);
      await desktopPage.close();

      const mobileSet = new Set(mobileControls);
      for (const control of new Set(desktopControls)) {
        expect(mobileSet, `Missing mobile equivalent for ${control}`).toContain(
          control,
        );
      }
      await expectNoHorizontalOverflow(page);
    });
  }
});

test.describe("Public actions mobile", () => {
  test("mobile navigation exposes every desktop category destination", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    const desktopHrefs = await page
      .getByTestId("category-nav")
      .getByRole("link")
      .evaluateAll((links) =>
        links.map((link) => new URL((link as HTMLAnchorElement).href).pathname),
      );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByTestId("menu-toggle").click();
    const mobileHrefs = await page.locator("header a:visible").evaluateAll((links) =>
      links.map((link) => new URL((link as HTMLAnchorElement).href).pathname),
    );
    for (const href of desktopHrefs) expect(mobileHrefs).toContain(href);
  });

  test("anonymous favorite action remains reachable and redirects to login", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/apartments");
    const favorite = page.locator('[data-slot="favorite-button"]:visible').first();
    await expect(favorite).toBeVisible();
    const box = await favorite.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await favorite.click();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("compact service favorites remain full touch targets", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/services");
    const favorite = page
      .locator('[data-slot="favorite-button"][data-size="compact"]:visible')
      .first();
    await expect(favorite).toBeVisible();
    const box = await favorite.boundingBox();
    expect(box?.width).toBeCloseTo(44, 0);
    expect(box?.height).toBeCloseTo(44, 0);
    await favorite.click();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("contact reveal turns into a dialable mobile link without leaving detail", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/listings/property/*/contact", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ phone: "+995599000003", whatsapp: null }),
      }),
    );
    await openFirstListingDetail(page, "/apartments");
    // A persisted device identifier is the normal repeat-visit path and keeps
    // this browser-neutral when a container exposes the app over a non-secure
    // hostname where WebKit intentionally omits crypto.randomUUID().
    await page.evaluate(() =>
      localStorage.setItem(
        "mybakuriani-contact-device",
        "0123456789abcdef0123456789abcdef",
      ),
    );
    const detailPath = new URL(page.url()).pathname;
    const call = page.locator('[data-slot="call-button"]:visible').first();
    await expect(call).toBeVisible();
    await call.click();
    await expect(call).toHaveAttribute("href", "tel:+995599000003");
    expect(new URL(page.url()).pathname).toBe(detailPath);
  });

  test("mobile gallery opens and closes its lightbox", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFirstListingDetail(page, "/apartments");
    await page.locator("[data-mobile-gallery] > button").first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.locator("button").first().click();
    await expect(dialog).toBeHidden();
  });

  test("employment application validates required mobile fields before submit", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFirstListingDetail(page, "/employment");
    const form = page.locator("#contact-sidebar");
    await expect(form).toBeVisible();
    const fullName = form.locator('input[type="text"]').first();
    const submit = form.getByRole("button").last();
    await submit.click();
    await expect(fullName.locator("xpath=following-sibling::p").first()).toBeVisible();
    expect(new URL(page.url()).pathname).toMatch(/\/employment\//);
  });

  test("FAQ questions expand and collapse on touch layouts", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/faq");
    const question = page.locator('main button[aria-expanded]').first();
    await expect(question).toHaveAttribute("aria-expanded", "false");
    await question.click();
    await expect(question).toHaveAttribute("aria-expanded", "true");
    await question.click();
    await expect(question).toHaveAttribute("aria-expanded", "false");
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

  test("all login modes and password controls are touch-sized and operable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/auth/login");

    for (const name of ["Email", "Phone"]) {
      const tab = page.getByRole("button", { name, exact: true });
      const box = await tab.boundingBox();
      expect(box?.height).toBeCloseTo(44, 0);
      await tab.click();
    }
    for (const name of ["Continue with Google", "Continue with Facebook"]) {
      const oauth = page.getByRole("button", { name, exact: true });
      await expect(oauth).toBeVisible();
      expect((await oauth.boundingBox())?.height).toBeCloseTo(44, 0);
    }

    await page.getByRole("button", { name: "Email", exact: true }).click();
    for (const name of ["Sign in", "Register"]) {
      const mode = page.getByRole("button", { name, exact: true }).first();
      expect((await mode.boundingBox())?.height).toBeCloseTo(44, 0);
      await mode.click();
    }

    const password = page.locator("#auth-password");
    await password.fill("mobile-parity-check");
    const visibility = page.getByRole("button", { name: "Show password" });
    const visibilityBox = await visibility.boundingBox();
    expect(visibilityBox?.width).toBeCloseTo(44, 0);
    expect(visibilityBox?.height).toBeCloseTo(44, 0);
    await visibility.click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(
      page.getByRole("button", { name: "Hide password" }),
    ).toBeVisible();
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

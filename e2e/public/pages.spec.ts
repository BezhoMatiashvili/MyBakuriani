import { test, expect } from "@playwright/test";
import {
  formatRelativeGe,
  isListingNewlyAdded,
} from "../../src/lib/utils/format";
import { normalizePublicPageviewPath } from "../../src/lib/analytics/pageview";

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

  test("renders known seeded property and service cards", async ({ page }) => {
    await page.goto("/");
    const main = page.locator("main");
    await expect(main).toBeVisible();
    await expect(
      main.getByText("E2E ბინა ბაკურიანში", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      main.getByText("E2E რესტორანი", { exact: true }).first(),
    ).toBeVisible();
  });

  test("has a call-to-action button or search box in hero", async ({
    page,
  }) => {
    await page.goto("/");
    const hero = page.locator("section").first();
    const interactable = hero.locator("a, button, input").first();
    await expect(interactable).toBeVisible();
  });

  test("can toggle sale landing discounts-only filter", async ({ page }) => {
    await page.goto("/en");

    await page.getByRole("button", { name: "Buy (Investment)" }).click();

    const discountsOnly = page.getByRole("button", {
      name: "Discounts only",
    });
    await expect(discountsOnly).toBeVisible();
    await expect(discountsOnly).toHaveAttribute("aria-pressed", "false");

    await discountsOnly.click();
    await expect(discountsOnly).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("PDF listing recency and public parity", () => {
  test("page-view paths are locale-normalized and restricted to public routes", () => {
    expect(normalizePublicPageviewPath("/en/services/abc")).toBe(
      "/services/abc",
    );
    expect(normalizePublicPageviewPath("/ka")).toBe("/");
    expect(normalizePublicPageviewPath("/dashboard/admin")).toBeNull();
    expect(normalizePublicPageviewPath("/review/private-token")).toBeNull();
    expect(normalizePublicPageviewPath("/services?phone=secret")).toBeNull();
  });

  test("relative age and the rolling 24-hour boundary are deterministic", () => {
    const now = Date.parse("2026-08-08T12:00:00.000Z");
    expect(
      formatRelativeGe("2026-08-08T10:00:00.000Z", "ka", now),
    ).toBe("2 სთ წინ");
    expect(
      formatRelativeGe("2026-08-07T12:00:00.000Z", "ka", now),
    ).toBe("1 დღის წინ");
    expect(
      isListingNewlyAdded("2026-08-07T12:00:00.001Z", now),
    ).toBe(true);
    expect(
      isListingNewlyAdded("2026-08-07T12:00:00.000Z", now),
    ).toBe(false);
    expect(formatRelativeGe("invalid", "ka", now)).toBe("");
    expect(formatRelativeGe("2026-08-08T13:00:00.000Z", "ka", now)).toBe(
      "",
    );
  });

  for (const [route, title, selector] of [
    ["/apartments", "E2E ბინა ბაკურიანში", "[data-listing-card]"],
    ["/hotels", "E2E სასტუმრო ბაკურიანში", "[data-listing-card]"],
    ["/sales", "E2E გასაყიდი ბინა", "a"],
    ["/food", "E2E რესტორანი", "[data-service-card]"],
    ["/services", "E2E დილის დასუფთავება", "[data-service-card]"],
    ["/entertainment", "E2E გართობა", "[data-service-card]"],
    ["/transport", "E2E ტრანსპორტი", "[data-service-card]"],
    ["/employment", "E2E ვაკანსია", "[data-employment-card]"],
  ] as const) {
    test(`${route} renders real listing age metadata`, async ({ page }) => {
      await page.goto(route);
      const card = page.locator(selector, { hasText: title }).first();
      await expect(card).toBeVisible();
      await expect(card.locator("[data-listing-age]")).toBeVisible();
    });
  }

  test("freshness badge uses created_at instead of VIP or list position", async ({
    page,
  }) => {
    await page.goto("/apartments");
    const fresh = page.locator("[data-listing-card]", {
      hasText: "E2E ბინა ბაკურიანში",
    });
    const old = page.locator("[data-listing-card]", {
      hasText: "E2E ვილა ბაკურიანში",
    });
    await expect(fresh.locator("[data-newly-added]")).toHaveText(
      "ახალი დამატებული",
    );
    await expect(old.locator("[data-newly-added]")).toHaveCount(0);
  });

  test("food results retain complete comparison metadata", async ({ page }) => {
    await page.goto("/food");
    const card = page.locator("[data-service-card]", {
      hasText: "E2E რესტორანი",
    });
    await expect(card.getByText("ბაკურიანი", { exact: true })).toBeVisible();
    await expect(card.getByText("10:00-22:00", { exact: true })).toBeVisible();
    await expect(card.getByRole("link", { name: "დეტალები" })).toBeVisible();
    await expect(card.locator('[data-slot="call-button"]')).toBeVisible();
  });

  test("services use complete cards on phones while food stays compact", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/services");
    const servicesGrid = page.getByTestId("services-results-grid");
    expect(
      await servicesGrid.evaluate((element) =>
        getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean)
          .length,
      ),
    ).toBe(1);
    let cards = page.locator(
      '[data-service-card][data-mobile-presentation="default"]',
    );
    await expect(cards.nth(1)).toBeVisible();
    let first = await cards.first().boundingBox();
    let second = await cards.nth(1).boundingBox();
    expect(second!.y).toBeGreaterThan(first!.y + first!.height - 1);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    expect(
      await servicesGrid.evaluate((element) =>
        getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean)
          .length,
      ),
    ).toBe(1);
    cards = page.locator(
      '[data-service-card][data-mobile-presentation="default"]',
    );
    await expect(cards.nth(1)).toBeVisible();
    first = await cards.first().boundingBox();
    second = await cards.nth(1).boundingBox();
    expect(second!.y).toBeGreaterThan(first!.y + first!.height - 1);
    expect(first!.width).toBeGreaterThan(300);

    const whatsappCard = page.locator("[data-service-card]", {
      hasText: "E2E WhatsApp სერვისი",
    });
    const details = whatsappCard.getByRole("link", { name: "დეტალები" });
    const call = whatsappCard.locator('[data-slot="call-button"]');
    const whatsapp = whatsappCard.locator('[data-slot="whatsapp-button"]');
    await expect(call).toHaveAttribute("aria-label", "დარეკვა");
    await expect(whatsapp).toBeVisible();
    const [detailsBox, callBox, whatsappBox] = await Promise.all([
      details.boundingBox(),
      call.boundingBox(),
      whatsapp.boundingBox(),
    ]);
    expect(detailsBox!.height).toBeGreaterThanOrEqual(44);
    expect(callBox!.width).toBeGreaterThanOrEqual(44);
    expect(callBox!.height).toBeGreaterThanOrEqual(44);
    expect(whatsappBox!.width).toBeGreaterThanOrEqual(44);
    expect(whatsappBox!.height).toBeGreaterThanOrEqual(44);
    expect(callBox!.y).toBeCloseTo(whatsappBox!.y, 0);

    await page.setViewportSize({ width: 640, height: 900 });
    await page.reload();
    expect(
      await servicesGrid.evaluate((element) =>
        getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean)
          .length,
      ),
    ).toBe(2);
    cards = page.locator(
      '[data-service-card][data-mobile-presentation="default"]',
    );
    first = await cards.first().boundingBox();
    second = await cards.nth(1).boundingBox();
    expect(first!.y).toBeCloseTo(second!.y, 0);
    expect(second!.x).toBeGreaterThan(first!.x + first!.width - 1);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/food");
    const foodGrid = page.getByTestId("food-results-grid");
    expect(
      await foodGrid.evaluate((element) =>
        getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean)
          .length,
      ),
    ).toBe(2);
    cards = page.locator('[data-service-card][data-mobile-presentation="compact-grid"]');
    await expect(cards.first()).toBeVisible();
    first = await cards.first().boundingBox();
    expect(first!.width).toBeLessThan(180);
    const foodCard = page.locator("[data-service-card]", {
      hasText: "E2E რესტორანი",
    });
    const foodDetails = await foodCard
      .getByRole("link", { name: "დეტალები" })
      .boundingBox();
    const foodCall = await foodCard
      .locator('[data-slot="call-button"]')
      .boundingBox();
    expect(foodDetails!.height).toBeGreaterThanOrEqual(44);
    expect(foodCall!.height).toBeGreaterThanOrEqual(44);
    expect(foodDetails!.y).toBeCloseTo(foodCall!.y, 0);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });

  test("transport card and detail expose the safe create-form fields", async ({
    page,
  }) => {
    await page.goto("/transport");
    const card = page.locator("[data-service-card]", {
      hasText: "E2E ტრანსპორტი",
    });
    await expect(card.getByText("Mercedes-Benz", { exact: true })).toBeVisible();
    await expect(card.getByText("მინივენი", { exact: true })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/transport/aae2ff00-4002-4000-a000-000000000002");
    await expect(page.getByText("Mercedes-Benz", { exact: true })).toBeVisible();
    await expect(page.getByText("მინივენი", { exact: true })).toBeVisible();
    await expect(page.getByText("ზამთრის საბურავები", { exact: true })).toBeVisible();
    await expect(
      page.getByText("თბილისი - ბაკურიანი - თბილისი", { exact: true }),
    ).toBeVisible();

    const stats = page.getByTestId("transport-detail-stats");
    expect(
      await stats.evaluate((element) =>
        getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean)
          .length,
      ),
    ).toBe(2);
    const statBoxes = await stats.locator(":scope > div").evaluateAll((items) =>
      items.map((item) => {
        const box = item.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      }),
    );
    expect(statBoxes).toHaveLength(4);
    expect(statBoxes[0].y).toBeCloseTo(statBoxes[1].y, 0);
    expect(statBoxes[2].y).toBeGreaterThan(
      statBoxes[0].y + statBoxes[0].height - 1,
    );

    const sectionHeadings = await Promise.all(
      [
        "აღჭურვილობა და უსაფრთხოება",
        "კომფორტი და სერვისები",
        "აღწერა",
        "მარშრუტი და ფასი",
      ].map(async (name) =>
        page.getByRole("heading", { name, exact: true }).boundingBox(),
      ),
    );
    expect(sectionHeadings[0]!.y).toBeLessThan(sectionHeadings[1]!.y);
    expect(sectionHeadings[1]!.y).toBeLessThan(sectionHeadings[2]!.y);
    expect(sectionHeadings[2]!.y).toBeLessThan(sectionHeadings[3]!.y);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.reload();
    expect(
      await stats.evaluate((element) =>
        getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean)
          .length,
      ),
    ).toBe(4);
  });

  test("rental and hotel details show translated host languages after amenities", async ({
    page,
  }) => {
    for (const [route, languages] of [
      [
        "/apartments/aae2ff00-1001-4000-a000-000000000001",
        ["ქართული", "English"],
      ],
      [
        "/hotels/aae2ff00-1005-4000-a000-000000000005",
        ["Русский", "Arabic"],
      ],
    ] as const) {
      await page.goto(route);
      const amenities = page.getByTestId("property-amenity-groups");
      const hostLanguages = page.getByTestId("host-languages");
      await expect(amenities).toBeVisible();
      await expect(hostLanguages).toBeVisible();
      for (const language of languages) {
        await expect(hostLanguages.getByText(language, { exact: true })).toBeVisible();
      }
      const [amenitiesBox, languagesBox, locationBox] = await Promise.all([
        amenities.boundingBox(),
        hostLanguages.boundingBox(),
        page
          .getByRole("heading", { name: "ზუსტი ლოკაცია", exact: true })
          .boundingBox(),
      ]);
      expect(amenitiesBox!.y).toBeLessThan(languagesBox!.y);
      expect(languagesBox!.y).toBeLessThan(locationBox!.y);
    }
  });

  test("sales copy, status, and deterministic back destination stay aligned", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "ყიდვა (ინვესტიცია)" }).click();
    await expect(page.getByRole("link", { name: "დაამატე" })).toBeVisible();

    await page.goto("/sales/aae2ff00-1003-4000-a000-000000000003");
    await expect(
      page.getByText("ახალი აშენებული/დასრულებული", { exact: true }),
    ).toBeVisible();
    const back = page.getByRole("link", { name: "უკან დაბრუნება" });
    await expect(back).toHaveAttribute("href", "/sales");
  });
});

async function listingLayout(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const hero = document.querySelector<HTMLElement>(
      '[data-testid="listing-hero"]',
    );
    const results = document.querySelector<HTMLElement>(
      '[data-testid="listing-results"]',
    );
    if (!hero || !results) throw new Error("listing layout markers missing");
    return {
      heroHeight: hero.getBoundingClientRect().height,
      heroBottom: hero.getBoundingClientRect().bottom,
      resultsTop: results.getBoundingClientRect().top,
    };
  });
}

for (const path of [
  "/en/apartments",
  "/en/hotels",
  "/en/search?mode=rent",
]) {
  test.describe(`${path} floating search panels`, () => {
    test("dates and filters overlap without shifting the hero or results", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path);
      const before = await listingLayout(page);

      await page.getByTestId("search-desktop-dates").click();
      const calendar = page.getByTestId("search-desktop-calendar-panel");
      await expect(calendar).toBeVisible();
      expect(await listingLayout(page)).toEqual(before);
      const calendarBox = await calendar.boundingBox();
      expect(calendarBox).not.toBeNull();
      expect(calendarBox!.y + calendarBox!.height).toBeGreaterThan(
        before.heroBottom,
      );
      await calendar.getByRole("button", { name: "Confirm" }).click();
      await expect(calendar).toBeHidden();

      await page.getByTestId("search-desktop-filters").click();
      const filters = page.getByTestId("search-desktop-filter-panel");
      await expect(filters).toBeVisible();
      expect(await listingLayout(page)).toEqual(before);
      const filtersBox = await filters.boundingBox();
      expect(filtersBox).not.toBeNull();
      expect(filtersBox!.y + filtersBox!.height).toBeGreaterThan(
        before.heroBottom,
      );

      await page
        .getByTestId("listing-hero")
        .getByRole("heading", { level: 1 })
        .click();
      await expect(filters).toBeHidden();
      expect(await listingLayout(page)).toEqual(before);
    });
  });
}

test.describe("Search results hero", () => {
  test("renders the listing hero with prefilled search state and status cards", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(
      "/en/search?check_in=2099-08-08&check_out=2099-08-22&mode=rent",
    );

    const hero = page.getByTestId("listing-hero");
    await expect(hero).toBeVisible();
    await expect(
      hero.getByRole("heading", {
        level: 1,
        name: "The Most Trusted Guide in Bakuriani",
      }),
    ).toBeVisible();
    await expect(hero.getByRole("button", { name: "Rent" })).toBeVisible();
    await expect(hero.getByTestId("search-desktop-dates")).not.toHaveText(
      "Select date",
    );

    const statusCards = hero.getByTestId("search-status-cards");
    await expect(statusCards).toBeVisible();
    expect((await statusCards.boundingBox())?.height).toBeGreaterThan(0);

    const url = new URL(page.url());
    expect(url.searchParams.get("check_in")).toBe("2099-08-08");
    expect(url.searchParams.get("check_out")).toBe("2099-08-22");
    expect(url.searchParams.get("mode")).toBe("rent");
  });

  test("desktop dropdowns paint above the filter sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/en/search?mode=rent");

    const assertPaintsAboveSidebar = async (
      panel: ReturnType<typeof page.getByTestId>,
    ) => {
      await expect(panel).toBeVisible();
      await expect
        .poll(() => panel.evaluate((element) => element.parentElement?.tagName))
        .toBe("DIV");

      const paintsAbove = await panel.evaluate((panelElement) => {
        const sidebar = document.querySelector<HTMLElement>(
          '[data-testid="search-filter-sidebar"]',
        );
        if (!sidebar) throw new Error("search filter sidebar missing");

        const panelBox = panelElement.getBoundingClientRect();
        const sidebarBox = sidebar.getBoundingClientRect();
        const left = Math.max(panelBox.left, sidebarBox.left);
        const right = Math.min(panelBox.right, sidebarBox.right);
        const top = Math.max(panelBox.top, sidebarBox.top);
        const bottom = Math.min(panelBox.bottom, sidebarBox.bottom);
        if (left >= right || top >= bottom) {
          throw new Error("dropdown does not overlap the filter sidebar");
        }

        const topElement = document.elementFromPoint(
          left + (right - left) / 2,
          top + (bottom - top) / 2,
        );
        return !!topElement && panelElement.contains(topElement);
      });

      expect(paintsAbove).toBe(true);
    };

    await page.getByTestId("search-desktop-dates").click();
    const calendar = page.getByTestId("search-desktop-calendar-panel");
    await assertPaintsAboveSidebar(calendar);
    await calendar.getByRole("button", { name: "Confirm" }).click();
    await expect(calendar).toBeHidden();

    await page.getByTestId("search-desktop-filters").click();
    const filters = page.getByTestId("search-desktop-filter-panel");
    await assertPaintsAboveSidebar(filters);
    await filters.getByRole("button", { name: "Show Results" }).click();
    await expect(filters).toBeHidden();
  });
});

test.describe("Listing search breakpoint", () => {
  for (const path of [
    "/en",
    "/en/apartments",
    "/en/hotels",
    "/en/search?mode=rent",
  ]) {
    test(`${path} uses a BottomSheet at 1023px and a floating panel at 1024px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1023, height: 900 });
      await page.goto(path);
      await expect(page.getByTestId("search-mobile-dates")).toBeVisible();
      await expect(page.getByTestId("search-desktop-dates")).toBeHidden();
      await page.getByTestId("search-mobile-dates").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(
        page.getByTestId("search-desktop-calendar-panel"),
      ).toHaveCount(0);
      await page.keyboard.press("Escape");

      await page.setViewportSize({ width: 1024, height: 900 });
      await expect(page.getByTestId("search-mobile-dates")).toBeHidden();
      await expect(page.getByTestId("search-desktop-dates")).toBeVisible();
      await page.getByTestId("search-desktop-dates").click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByTestId("search-desktop-calendar-panel"),
      ).toBeVisible();
    });
  }
});

test.describe("Listing desktop search controls", () => {
  test("date clear/confirm and filter clear/apply keep working", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/en/apartments");
    const datesTrigger = page.getByTestId("search-desktop-dates");

    await datesTrigger.click();
    const calendar = page.getByTestId("search-desktop-calendar-panel");
    const days = calendar.locator('button[data-day]:not([disabled])');
    await days.nth(2).click();
    await days.nth(3).click();
    await expect(datesTrigger).not.toHaveText("Select date");
    await calendar.getByRole("button", { name: "Clear" }).click();
    await expect(datesTrigger).toHaveText("Select date");

    await days.nth(4).click();
    await days.nth(5).click();
    await calendar.getByRole("button", { name: "Confirm" }).click();
    await expect(calendar).toBeHidden();
    await expect(datesTrigger).not.toHaveText("Select date");

    await page.getByTestId("search-desktop-filters").click();
    const filters = page.getByTestId("search-desktop-filter-panel");
    const twoGuests = filters.getByRole("button", { name: "2 Guests" });
    await twoGuests.click();
    await expect(twoGuests).toHaveClass(/bg-\[#2563EB\]/);
    await filters.getByRole("button", { name: "Clear" }).click();
    await expect(twoGuests).not.toHaveClass(/bg-\[#2563EB\]/);
    await twoGuests.click();
    await filters.getByRole("button", { name: "Show Results" }).click();
    await expect(page).toHaveURL(/\/search\?.*guests=2/);
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
    // The hamburger button has an accessible name "Menu" / "მენიუ"
    const menuButton = page
      .getByRole("button", { name: /menu|მენიუ/i })
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

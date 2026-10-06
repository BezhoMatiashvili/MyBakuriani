import { test, expect, type Page } from "@playwright/test";
import { configureIsolatedE2E } from "../helpers/env";

/**
 * The 4 status cards (weather, lifts, road, cameras) hang below the hero on a
 * negative bottom margin. Whatever follows the hero must start clearly below
 * them, as its own section: the owner's PDF "გასასწორებელი (6ოქტ)" p.1 flagged
 * the home listings sitting 22px under the cards on desktop (6px at 640px, and
 * a VIP heading could even sit under them).
 *
 * "Content top" is the next block's box top plus its padding-top, so the
 * ScrollReveal entrance transform on the heading inside cannot skew it.
 */

const MIN_GAP = 32;

const PAGES = [
  { path: "/", hero: "homepage-hero" },
  { path: "/apartments", hero: "listing-hero" },
  { path: "/hotels", hero: "listing-hero" },
  { path: "/search", hero: "listing-hero" },
] as const;

const WIDTHS = [390, 640, 1024, 1440] as const;

async function measureGap(page: Page, heroTestId: string) {
  return page.evaluate((heroId) => {
    const hero = document.querySelector(`[data-testid="${heroId}"]`);
    if (!hero) return null;
    const cards = Array.from(hero.querySelectorAll("[data-status-card]"))
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0);
    if (cards.length === 0) return null;
    const cardsBottom = Math.max(...cards.map((r) => r.bottom));

    // The first rendered block after the hero, skipping the overhang spacer.
    let next = hero.nextElementSibling;
    while (
      next &&
      (next.getAttribute("aria-hidden") === "true" ||
        next.getBoundingClientRect().height === 0)
    ) {
      next = next.nextElementSibling;
    }
    if (!next) return null;
    const box = next.getBoundingClientRect();
    const paddingTop = parseFloat(getComputedStyle(next).paddingTop) || 0;
    return {
      gap: box.top + paddingTop - cardsBottom,
      next: `${next.tagName.toLowerCase()}${
        next.getAttribute("data-testid")
          ? `[data-testid=${next.getAttribute("data-testid")}]`
          : ""
      }`,
    };
  }, heroTestId);
}

test.beforeEach(async ({ page }) => {
  // The cookie + location panel would otherwise cover the lower half on phones.
  await page.context().addCookies([
    {
      name: "mb_cookie_consent",
      value: encodeURIComponent("v2|analytics=0|location=0"),
      url: configureIsolatedE2E().baseUrl,
    },
  ]);
});

for (const width of WIDTHS) {
  test.describe(`status-card spacing @${width}px`, () => {
    for (const { path, hero } of PAGES) {
      test(`${path}: the next section starts clear of the status cards`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await page
          .waitForLoadState("networkidle", { timeout: 8000 })
          .catch(() => {});
        await expect(
          page.getByTestId(hero).locator("[data-status-card]").first(),
        ).toBeVisible();

        const measured = await measureGap(page, hero);
        test.skip(!measured, "no status cards or nothing after the hero");
        expect(
          measured!.gap,
          `${path} @${width}px: ${measured!.next} starts ${measured!.gap.toFixed(1)}px below the cards`,
        ).toBeGreaterThanOrEqual(MIN_GAP - 0.5);
      });
    }
  });
}

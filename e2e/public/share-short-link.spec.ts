import { test, expect } from "@playwright/test";
import { configureIsolatedE2E } from "../helpers/env";
import { FIXTURE_IDS } from "../helpers/fixture-manifest.mjs";

// Owner request 2026-10-28: a listing shared to a Facebook group showed the
// long /apartments/<uuid> address. Listing pages now hand out
// /l/<first 12 hex digits of the id>, which 301s to the listing (C58).
const code = (id: string) => id.replace(/-/g, "").slice(0, 12);

test.describe("Short share links", () => {
  test("a listing page copies its short link, which opens the listing", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    // The cookie banner would sit over the page while the menu is used.
    await context.addCookies([
      {
        name: "mb_cookie_consent",
        value: encodeURIComponent("v2|analytics=0|location=0"),
        url: configureIsolatedE2E().baseUrl,
      },
    ]);
    const listing = `/apartments/${FIXTURE_IDS.apartment}`;
    await page.goto(listing);

    const trigger = page
      .getByRole("button", { name: "გაზიარება", exact: true }) // PhotoGallery.share
      .first();
    // A click before React attaches its handlers is lost.
    await expect
      .poll(() =>
        trigger.evaluate((node) =>
          Object.keys(node).some((key) => key.startsWith("__reactProps$")),
        ),
      )
      .toBe(true);
    await trigger.click();
    await page
      .getByRole("menuitem", { name: "კოპირება", exact: true }) // ShareListing.copyLink
      .click();
    const shortUrl = new URL(`/l/${code(FIXTURE_IDS.apartment)}`, page.url())
      .href;
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(shortUrl);

    await page.goto(shortUrl);
    await expect(page).toHaveURL(new URL(listing, shortUrl).href);
  });

  test("every kind's link answers 301 to its own page, keeping en", async ({
    request,
  }) => {
    const listings: [string, string][] = [
      [FIXTURE_IDS.apartment, "apartments"],
      [FIXTURE_IDS.hotel, "hotels"],
      [FIXTURE_IDS.sale, "sales"],
      [FIXTURE_IDS.foodService, "food"],
      [FIXTURE_IDS.transportService, "transport"],
      [FIXTURE_IDS.entertainmentService, "entertainment"],
      [FIXTURE_IDS.employmentService, "employment"],
      [FIXTURE_IDS.cleaningServicePrimary, "services"],
    ];
    for (const [id, kind] of listings) {
      for (const prefix of ["", "/en"]) {
        const path = `${prefix}/l/${code(id)}`;
        const response = await request.get(path, { maxRedirects: 0 });
        expect(response.status(), path).toBe(301);
        expect(new URL(response.headers().location).pathname, path).toBe(
          `${prefix}/${kind}/${id}`,
        );
      }
    }
    // Typed in capitals, and asked with HEAD (some unfurlers do).
    const upper = `/l/${code(FIXTURE_IDS.apartment).toUpperCase()}`;
    const head = await request.head(upper, { maxRedirects: 0 });
    expect(head.status(), upper).toBe(301);
    expect(new URL(head.headers().location).pathname).toBe(
      `/apartments/${FIXTURE_IDS.apartment}`,
    );
    // Facebook's click id and campaign tags reach the listing's page view;
    // the owner-preview switch never does.
    const tagged = await request.get(
      `/l/${code(FIXTURE_IDS.apartment)}?utm_source=fb_group&fbclid=IwAR0abc&preview=1`,
      { maxRedirects: 0 },
    );
    expect(tagged.status()).toBe(301);
    const target = new URL(tagged.headers().location);
    expect(target.pathname).toBe(`/apartments/${FIXTURE_IDS.apartment}`);
    expect(target.searchParams.get("utm_source")).toBe("fb_group");
    expect(target.searchParams.get("fbclid")).toBe("IwAR0abc");
    expect(target.searchParams.has("preview")).toBe(false);
  });

  test("an unknown or malformed code goes home, uncached", async ({
    request,
  }) => {
    for (const [path, home] of [
      ["/l/000000000000", "/"],
      ["/en/l/000000000000", "/en"],
      ["/l/not-a-listing", "/"],
      ["/ru/l/abc", "/ru"],
    ]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(307);
      expect(new URL(response.headers().location).pathname, path).toBe(home);
      expect(response.headers()["cache-control"], path).toContain("no-store");
    }
  });
});

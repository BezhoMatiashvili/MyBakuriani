import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../helpers/fixtures";
import { SERVICE_SPHERES } from "../../src/lib/service-spheres";

/**
 * /create/service decides the listing's category from the sphere the owner
 * picks (cleaning -> cleaner cabinet + cleaner directory, anything else ->
 * services cabinet). It used to pre-select "Cleaning", so a handyman or any
 * other provider who skipped the select was published as a cleaner.
 * The default locale is Georgian, where the sphere labels equal `dbLabel`.
 */

const ALL_LABELS = SERVICE_SPHERES.map((s) => s.dbLabel);
const CLEANING_LABEL = SERVICE_SPHERES[0].dbLabel;

function sphereTrigger(page: Page): Locator {
  return page.locator('[data-field="sphere"] button').first();
}

/** The form is SSR'd: clicks before hydration are lost, so wait for React. */
async function waitForHydration(trigger: Locator) {
  await expect(trigger).toBeVisible();
  await expect
    .poll(() =>
      trigger.evaluate((el) =>
        Object.keys(el).some((key) => key.startsWith("__reactProps$")),
      ),
    )
    .toBe(true);
}

/** The cookie notice is fixed to the bottom and covers the Publish button. */
async function answerCookieBanner(page: Page) {
  await page.context().addCookies([
    {
      name: "mb_cookie_consent",
      value: encodeURIComponent("v2|analytics=0|location=0"),
      url: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    },
  ]);
}

async function expectNothingSelected(trigger: Locator) {
  for (const label of ALL_LABELS) {
    await expect(trigger).not.toContainText(label);
  }
}

test.describe("Service form: the owner chooses the sphere", () => {
  test("the hub link preselects nothing and offers all six spheres", async ({
    guestPage,
  }) => {
    await guestPage.goto("/create/service");
    const trigger = sphereTrigger(guestPage);
    await waitForHydration(trigger);
    await expectNothingSelected(trigger);

    await trigger.click();
    await expect(guestPage.getByRole("option")).toHaveCount(6);
  });

  test("publishing without a sphere is refused and saves nothing", async ({
    guestPage,
  }) => {
    await answerCookieBanner(guestPage);
    let inserts = 0;
    await guestPage.route("**/rest/v1/services*", (route) => {
      if (route.request().method() === "POST") inserts += 1;
      return route.continue();
    });

    await guestPage.goto("/create/service");
    await waitForHydration(sphereTrigger(guestPage));
    await guestPage.locator('[data-field="name"] input').fill("E2E სახელი");
    await guestPage.locator('[data-field="experienceYears"] input').fill("3");
    await guestPage
      .getByRole("button", { name: "განცხადების გამოქვეყნება" })
      .click();

    // name and experience are filled, so the sphere is the first refusal
    await expect(
      guestPage.getByText("აირჩიეთ მომსახურების სფერო"),
    ).toBeVisible();
    await expectNothingSelected(sphereTrigger(guestPage));
    expect(inserts).toBe(0);
    await expect(guestPage).toHaveURL(/\/create\/service/);
  });

  test("the Services cabinet link leaves Cleaning out and preselects nothing", async ({
    guestPage,
  }) => {
    await guestPage.goto("/create/service?category=handyman");
    const trigger = sphereTrigger(guestPage);
    await waitForHydration(trigger);
    await expectNothingSelected(trigger);

    await trigger.click();
    const options = guestPage.getByRole("option");
    await expect(options).toHaveCount(5);
    await expect(options.filter({ hasText: CLEANING_LABEL })).toHaveCount(0);
  });

  test("the Cleaner cabinet link fixes the category to cleaning", async ({
    cleanerPage,
  }) => {
    await cleanerPage.goto("/create/service?category=cleaning");
    const trigger = sphereTrigger(cleanerPage);
    await waitForHydration(trigger);
    await expect(trigger).toContainText(CLEANING_LABEL);

    await trigger.click();
    await expect(cleanerPage.getByRole("option")).toHaveCount(1);
  });

  test("an unknown category hint is ignored", async ({ guestPage }) => {
    await guestPage.goto("/create/service?category=food");
    const trigger = sphereTrigger(guestPage);
    await waitForHydration(trigger);
    await expectNothingSelected(trigger);

    await trigger.click();
    await expect(guestPage.getByRole("option")).toHaveCount(6);
  });

  test("editing a cleaning listing offers only Cleaning and says why", async ({
    cleanerPage,
    testIds,
  }) => {
    await cleanerPage.goto(
      `/create/service?edit=${testIds.cleaningServicePrimary}`,
    );
    const trigger = sphereTrigger(cleanerPage);
    await waitForHydration(trigger);
    await expect(trigger).toContainText(CLEANING_LABEL);
    await expect(
      cleanerPage.getByText("კატეგორიის შეცვლა გამოქვეყნების შემდეგ"),
    ).toBeVisible();

    await trigger.click();
    await expect(cleanerPage.getByRole("option")).toHaveCount(1);
  });
});

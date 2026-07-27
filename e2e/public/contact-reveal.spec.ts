import { expect, test } from "../helpers/fixtures";
import { PHONES } from "../helpers/seed";

function apartmentPath(id: string) {
  return `/en/apartments/${id}`;
}

test.describe("public contact reveals", () => {
  test("an anonymous visitor reveals a redacted apartment phone without leaving the detail page", async ({
    page,
    testIds,
  }) => {
    const path = apartmentPath(testIds.apartment);
    const endpoint = `/api/listings/property/${testIds.apartment}/contact`;
    let revealRequests = 0;
    await page.route(`**${endpoint}`, async (route) => {
      revealRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ phone: PHONES.renter, whatsapp: null }),
      });
    });

    await page.goto(path);
    const callButton = page.locator('[data-slot="call-button"]');
    await expect(page.locator('[data-slot="whatsapp-button"]')).toHaveCount(0);
    await expect(callButton).toBeVisible();
    await expect(callButton).not.toHaveAttribute("href");

    await callButton.click();

    await expect(callButton).toHaveAttribute("href", `tel:${PHONES.renter}`);
    await expect(callButton).toContainText("+995 599 00 00 03");
    expect(revealRequests).toBe(1);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page).not.toHaveURL(/\/auth\/login/);
  });

  test("a WhatsApp-enabled property reveals only its dedicated WhatsApp target", async ({
    page,
    testIds,
  }) => {
    const path = apartmentPath(testIds.whatsappApartment);
    const endpoint = `/api/listings/property/${testIds.whatsappApartment}/contact`;
    await page.route(`**${endpoint}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          phone: PHONES.renter,
          whatsapp: "+995599000010",
        }),
      }),
    );

    await page.goto(path);
    const callButton = page.locator('[data-slot="call-button"]');
    const whatsappButton = page.locator('[data-slot="whatsapp-button"]');
    await expect(callButton).toBeVisible();
    await expect(whatsappButton).toBeVisible();
    await expect(whatsappButton).not.toHaveAttribute("href");

    await whatsappButton.click();
    await expect(whatsappButton).toHaveAttribute(
      "href",
      "https://wa.me/995599000010",
    );
    await expect(whatsappButton).not.toHaveAttribute(
      "href",
      `https://wa.me/${PHONES.renter.slice(1)}`,
    );
  });

  test("a WhatsApp-enabled service exposes both contact actions", async ({
    page,
    testIds,
  }) => {
    const path = `/en/services/${testIds.whatsappService}`;
    const endpoint = `/api/listings/service/${testIds.whatsappService}/contact`;
    await page.route(`**${endpoint}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          phone: PHONES.cleaner,
          whatsapp: "+995599000011",
        }),
      }),
    );

    await page.goto(path);
    const callButton = page.locator('[data-slot="call-button"]');
    const whatsappButton = page.locator('[data-slot="whatsapp-button"]');
    await expect(callButton).toBeVisible();
    await expect(whatsappButton).toBeVisible();

    await whatsappButton.click();
    await expect(whatsappButton).toHaveAttribute(
      "href",
      "https://wa.me/995599000011",
    );
  });

  test("a signed-in guest uses the real contact endpoint and receives a dialable link", async ({
    guestPage,
    testIds,
  }) => {
    const path = apartmentPath(testIds.apartment);
    await guestPage.goto(path);
    const callButton = guestPage.locator('[data-slot="call-button"]');
    await expect(callButton).toBeVisible();

    const contactResponse = guestPage.waitForResponse(
      (response) =>
        response.url().includes(`/api/listings/property/${testIds.apartment}/contact`) &&
        response.request().method() === "POST",
    );
    await callButton.click();
    await expect((await contactResponse).ok()).toBeTruthy();

    await expect(callButton).toHaveAttribute("href", `tel:${PHONES.renter}`);
    await expect(callButton).toContainText("+995 599 00 00 03");
    await expect(guestPage).toHaveURL(new RegExp(`${path}$`));
    await expect(guestPage).not.toHaveURL(/\/auth\/login/);
  });

  test("a rejected reveal stays on the listing and offers a retry", async ({
    page,
    testIds,
  }) => {
    const path = apartmentPath(testIds.apartment);
    const endpoint = `/api/listings/property/${testIds.apartment}/contact`;
    await page.route(`**${endpoint}`, (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "rate_limited" }),
      }),
    );

    await page.goto(path);
    const callButton = page.locator('[data-slot="call-button"]');
    await callButton.click();

    await expect(callButton).toHaveText(/Couldn’t reveal the number — try again/);
    await expect(callButton).not.toHaveAttribute("href");
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page).not.toHaveURL(/\/auth\/login/);
  });
});

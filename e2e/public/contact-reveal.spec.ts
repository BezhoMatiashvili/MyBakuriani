import { randomUUID } from "node:crypto";
import { expect, test } from "../helpers/fixtures";
import { PHONES } from "../helpers/seed";
import { services } from "../helpers/supabase";

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

  test("a landline number is revealed as a dialable tel: link, without WhatsApp", async ({
    page,
    testIds,
  }) => {
    const path = apartmentPath(testIds.apartment);
    await page.route(
      `**/api/listings/property/${testIds.apartment}/contact`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ phone: "+995322118047", whatsapp: null }),
        }),
    );

    await page.goto(path);
    const callButton = page.locator('[data-slot="call-button"]');
    await callButton.click();

    await expect(callButton).toHaveAttribute("href", "tel:+995322118047");
    await expect(callButton).toContainText("+995 32 211 80 47");
    await expect(page.locator('[data-slot="whatsapp-button"]')).toHaveCount(0);
  });

  test("the real contact endpoint reveals a listing's landline, not the owner's mobile", async ({
    guestPage,
    testIds,
  }) => {
    // Its own listing (C56): an entertainment provider no other spec counts,
    // dated in the past so it never tops the public lists; deleted at the end.
    const serviceId = randomUUID();
    await services.create({
      id: serviceId,
      owner_id: testIds.entertainment,
      category: "entertainment",
      title: `E2E ქალაქის ნომერი ${serviceId.slice(0, 6)}`,
      description: "Landline contact fixture",
      price: 50,
      location: "ბაკურიანი",
      phone: "+995322118047",
      whatsapp: null,
      status: "active",
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    try {
      const path = `/en/entertainment/${serviceId}`;
      await guestPage.goto(path);
      const sidebar = guestPage.locator("#contact-sidebar");
      const callButton = sidebar.locator('[data-slot="call-button"]');
      await expect(callButton).toBeVisible();
      await expect(
        sidebar.locator('[data-slot="whatsapp-button"]'),
      ).toHaveCount(0);

      const contactResponse = guestPage.waitForResponse(
        (response) =>
          response
            .url()
            .includes(`/api/listings/service/${serviceId}/contact`) &&
          response.request().method() === "POST",
      );
      await callButton.click();
      const response = await contactResponse;
      expect(response.ok()).toBeTruthy();
      expect(await response.json()).toEqual({
        phone: "+995322118047",
        whatsapp: null,
      });

      await expect(callButton).toHaveAttribute("href", "tel:+995322118047");
      await expect(callButton).toContainText("+995 32 211 80 47");
      await expect(guestPage).toHaveURL(new RegExp(`${path}$`));
    } finally {
      await services.delete(serviceId);
    }
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

  test("a long reveal state wraps inside the mobile contact column", async ({
    page,
    testIds,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const path = apartmentPath(testIds.apartment);
    await page.route(
      `**/api/listings/property/${testIds.apartment}/contact`,
      (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "lookup_failed" }),
        }),
    );

    await page.goto(path);
    const callButton = page.locator('[data-slot="call-button"]');
    await callButton.click();
    await expect(callButton).toHaveText(/Couldn’t reveal the number — try again/);
    const box = await callButton.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
});

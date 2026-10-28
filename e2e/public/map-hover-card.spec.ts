import { test, expect } from "@playwright/test";

// Every map pin is a Mapbox marker, and Mapbox transforms each marker, so each
// is its own stacking context: a pin's hover card (photo, title, price) can
// only rise with its own pin. Pins later in the DOM used to paint over it.
// The /apartments filter panel holds the narrow (280 px) map where it showed.

// Tall enough for the whole filter panel, so every pin is inside the viewport.
test.use({ viewport: { width: 1440, height: 1400 } });

test("a pin's hover card is drawn above every other pin", async ({
  page,
}, testInfo) => {
  await page.goto("/apartments");
  // The consent cards would sit over part of the map and take the probes
  // below. Closing the cookie card also proves hydration (a click before it
  // is lost), so the filters toggle below is clicked exactly once.
  const essentialOnly = page.getByRole("button", { name: "მხოლოდ აუცილებელი" });
  await expect(async () => {
    await essentialOnly.click({ timeout: 2_000 });
    await expect(essentialOnly).toBeHidden({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  const noLocation = page.getByRole("button", { name: "არა, გმადლობთ" });
  if (
    await noLocation.waitFor({ timeout: 3_000 }).then(
      () => true,
      () => false,
    )
  ) {
    await noLocation.click();
  }
  await page.getByTestId("search-desktop-filters").click();

  const pills = page.locator(".bk-price-marker > .bk-pill");
  // Two pins at least, or there is nothing to cover the card: fail, not skip.
  await expect(pills.nth(1)).toBeVisible({ timeout: 30_000 });
  // Pins move while the map fits them into view: wait until they stand still.
  let previous = "";
  await expect
    .poll(
      async () => {
        const now = (
          await pills.evaluateAll((els) =>
            els.map((el) => {
              const r = el.getBoundingClientRect();
              return `${Math.round(r.x)},${Math.round(r.y)}`;
            }),
          )
        ).join(" ");
        const settled = now === previous;
        previous = now;
        return settled;
      },
      { intervals: [500], timeout: 20_000 },
    )
    .toBe(true);

  // A pill no other pin covers, so the pointer reaches it.
  const index = await pills.evaluateAll((els) =>
    els.findIndex((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2,
      );
      return !!hit && el.contains(hit);
    }),
  );
  expect(index).toBeGreaterThanOrEqual(0);
  const pill = pills.nth(index);
  await pill.hover();

  const state = await pill.evaluate((el) => {
    const wrapper = el.parentElement as HTMLElement;
    const card = wrapper.lastElementChild as HTMLElement;
    const others = [
      ...document.querySelectorAll<HTMLElement>(".bk-price-marker"),
    ].filter((w) => w !== wrapper);
    // Hit-testing follows paint order. The card ignores the pointer, so let it
    // take hits for one synchronous probe per spot where it overlaps a pin.
    const c = card.getBoundingClientRect();
    card.style.pointerEvents = "auto";
    const onTop = others.flatMap((w) => {
      const p = (w.firstElementChild as HTMLElement).getBoundingClientRect();
      const left = Math.max(c.left, p.left);
      const right = Math.min(c.right, p.right);
      const top = Math.max(c.top, p.top);
      const bottom = Math.min(c.bottom, p.bottom);
      if (left >= right || top >= bottom) return [];
      const hit = document.elementFromPoint(
        (left + right) / 2,
        (top + bottom) / 2,
      );
      return [!!hit && card.contains(hit)];
    });
    card.style.pointerEvents = "";
    return {
      z: Number(wrapper.style.zIndex),
      maxOther: Math.max(...others.map((w) => Number(w.style.zIndex || 0))),
      cardShown: card.style.visibility === "visible",
      overlaps: onTop.length,
      covered: onTop.filter((ok) => !ok).length,
    };
  });
  testInfo.annotations.push({
    type: "overlaps",
    description: `card overlaps ${state.overlaps} other pin(s)`,
  });
  await testInfo.attach("hover-card", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  expect(state.cardShown).toBe(true);
  expect(state.z).toBeGreaterThan(state.maxOther);
  expect(state.covered).toBe(0);

  // Leaving the pin drops it back among the others.
  await page.mouse.move(5, 5);
  await expect
    .poll(() => pill.evaluate((el) => el.parentElement!.style.zIndex))
    .toBe("0");

  // A click still opens the listing.
  await pill.click();
  await expect(page).toHaveURL(/\/(apartments|hotels)\/[0-9a-f-]{36}$/);
});

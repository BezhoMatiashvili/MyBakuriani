import { randomUUID } from "node:crypto";
import { test, expect } from "../helpers/fixtures";
import { properties } from "../helpers/supabase";
import { TEST_IDS } from "../helpers/seed";
import { configureIsolatedE2E } from "../helpers/env";

// C57: a listing's cadastral code is private unless its owner turns on
// "კოდის საჯაროდ გამოჩენა". Fresh ids and codes per run, so neither the ISR
// cache nor the unique index carries anything over from another run.
const stamp = String(Date.now()).slice(-7);
const code = (n: number) =>
  `77.${stamp.slice(0, 2)}.${stamp.slice(2, 4)}.${stamp.slice(4)}.0${n}`;
const title = (key: string) => `E2E საკადასტრო ${key} ${stamp}`;
const rows = {
  hidden: { id: randomUUID(), code: code(1), shown: false },
  shown: { id: randomUUID(), code: code(2), shown: true },
  pending: { id: randomUUID(), code: code(3), shown: false },
  admin: { id: randomUUID(), code: code(4), shown: false },
};

test.beforeAll(async () => {
  for (const [key, row] of Object.entries(rows)) {
    await properties.create({
      id: row.id,
      owner_id: TEST_IDS.renter,
      type: "apartment",
      title: title(key),
      location: "ბაკურიანი, E2E ქუჩა",
      price_per_night: 120,
      currency: "GEL",
      photos: ["/placeholder-property.jpg"],
      cadastral_code: row.code,
      cadastral_code_public: row.shown,
      status: "active",
      is_for_sale: false,
    });
  }
  // Pending only after the insert: inserting a pending listing notifies every admin.
  await properties.update(rows.pending.id, { status: "pending" });
});

test.afterAll(async () => {
  for (const row of Object.values(rows)) await properties.delete(row.id);
});

test("a hidden code is nowhere in the public page, its data included", async ({
  request,
}) => {
  const res = await request.get(`/apartments/${rows.hidden.id}`);
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain(title("hidden"));
  expect(html).not.toContain(rows.hidden.code);
});

test("a code its owner shows is on the public page", async ({ request }) => {
  const res = await request.get(`/apartments/${rows.shown.id}`);
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain(title("shown"));
  expect(html).toContain(rows.shown.code);
});

test("the owner's preview hides a hidden code like the public page", async ({
  renterPage,
}) => {
  await renterPage.goto(`/apartments/${rows.pending.id}?preview=1`);
  await expect(renterPage.getByText(title("pending")).first()).toBeVisible();
  expect(await renterPage.content()).not.toContain(rows.pending.code);
});

test("the rental form's switch starts off and loads the stored choice", async ({
  renterPage,
}) => {
  const toggle = renterPage.getByRole("switch", {
    name: "კოდის საჯაროდ გამოჩენა",
  });
  await renterPage.goto("/create/rental");
  const input = renterPage.getByPlaceholder("XX.XX.XX.XXX.XXX");
  // The switch shows once a code is typed; typing before hydration is lost.
  await expect(async () => {
    await input.fill("77.11.22.333");
    await expect(toggle).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(toggle).not.toBeChecked();

  await renterPage.goto(`/create/rental?edit=${rows.shown.id}`);
  await expect(toggle).toBeChecked({ timeout: 30_000 });
});

test("an admin's NAPR checkbox shows the code on the public page and hides it again", async ({
  adminPage,
  request,
}) => {
  const row = rows.admin;
  const publicHtml = async () =>
    (await request.get(`/apartments/${row.id}`)).text();

  // The cookie banner covers the panel's sticky save bar and would take the
  // click (as in admin.spec.ts), so the admin has already answered it.
  await adminPage.context().addCookies([
    {
      name: "mb_cookie_consent",
      value: encodeURIComponent("v2|analytics=0|location=0"),
      url: configureIsolatedE2E().baseUrl,
    },
  ]);
  await adminPage.goto("/dashboard/admin/listings");
  const search = adminPage.getByPlaceholder("ძიება (ID, სახელი, მფლობელი)...");
  const listingRow = adminPage
    .locator('[role="button"][aria-expanded]')
    .filter({ hasText: title("admin") });
  // Typing before hydration is lost.
  await expect(async () => {
    await search.fill(row.id);
    await expect(listingRow).toHaveCount(1, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await listingRow.click();

  const box = adminPage.getByRole("checkbox", {
    name: /კოდის საჯაროდ გამოჩენა/,
  });
  const save = adminPage.getByRole("button", { name: "შენახვა", exact: true });

  await expect(box).not.toBeChecked({ timeout: 30_000 });
  await box.check();
  await save.click();
  await expect
    .poll(async () => (await properties.get(row.id))?.cadastral_code_public)
    .toBe(true);
  await expect.poll(publicHtml, { timeout: 30_000 }).toContain(row.code);

  // The panel reloads after a save and shows the stored choice.
  await expect(box).toBeChecked({ timeout: 30_000 });
  await box.uncheck();
  await save.click();
  await expect
    .poll(async () => (await properties.get(row.id))?.cadastral_code_public)
    .toBe(false);
  await expect.poll(publicHtml, { timeout: 30_000 }).not.toContain(row.code);
  // Hidden from the public, still there for the admin.
  expect((await properties.get(row.id))?.cadastral_code).toBe(row.code);
});

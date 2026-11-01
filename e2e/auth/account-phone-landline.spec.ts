import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import {
  authenticateAsRole,
  createTestUser,
  deleteTestUser,
} from "../helpers/auth";
import { properties, supabaseAdmin } from "../helpers/supabase";
import type { Database } from "../../src/lib/types/database";

type UserRole = Database["public"]["Enums"]["user_role"];

// C56: /dashboard/account's SMS sign-in number stays a mobile. A city number
// is refused before any request; an owner of a listing that may take one is
// told guests call the listing's number, with a link to that listing's
// cabinet (from the listings owned, not the role). Skips on a build without
// NEXT_PUBLIC_PHONE_AUTH_ENABLED=true.

const ADD = "ნომრის დამატება";
const GET_CODE = "SMS კოდის მიღება";
const LANDLINE =
  "ქალაქის ნომერზე SMS კოდს ვერ გავგზავნით: შესვლისთვის მობილური ნომერია საჭირო.";
const GUESTS_CALL =
  "სტუმრები იმ ნომერზე რეკავენ, რომელიც განცხადებაშია მითითებული — ქალაქის ნომერი იქ შეგიძლიათ მიუთითოთ.";
const MY_LISTINGS = "ჩემი განცხადებები";
const EMAIL_IDENTITY = "ელ. ფოსტა";

const createdIds: string[] = [];

test.afterAll(async () => {
  for (const id of createdIds) {
    await properties.deleteWhere("owner_id", id).catch(() => {});
    await deleteTestUser(id);
  }
  if (createdIds.length === 0) return;
  await supabaseAdmin.from("balances").delete().in("user_id", createdIds);
  await supabaseAdmin.from("profiles").delete().in("id", createdIds);
});

async function signIn(page: Page, role: UserRole, ownsRental: boolean) {
  const id = randomUUID();
  createdIds.push(id);
  const user = await createTestUser({
    id,
    phone: `+9955${Math.floor(Math.random() * 100_000_000)
      .toString()
      .padStart(8, "0")}`,
    displayName: "Landline host",
    role,
  });
  if (ownsRental) {
    // A draft: never public, and posting it needs no membership here.
    await properties.create({
      id: randomUUID(),
      owner_id: id,
      type: "apartment",
      title: "E2E landline",
      description: "E2E listing for the sign-in card's city-number hint",
      location: "ბაკურიანი",
      area_sqm: 30,
      rooms: 1,
      bathrooms: 1,
      capacity: 2,
      price_per_night: 100,
      currency: "GEL",
      amenities: [],
      photos: [],
      status: "draft",
      is_for_sale: false,
    });
  }
  await authenticateAsRole(user, page);
}

// Opens the phone card and asks for a code for a city number, once the owned
// listings have loaded; returns its form.
async function refuseCityNumber(page: Page) {
  const phoneChanges: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "PUT" &&
      /\/auth\/v1\/user(\?|$)/.test(request.url())
    ) {
      phoneChanges.push(request.url());
    }
  });
  const ownedListings = Promise.all(
    ["properties?select=is_for_sale&", "services?select=category&"].map(
      (query) =>
        page.waitForResponse(
          (r) => r.url().includes(`/rest/v1/${query}`) && r.ok(),
        ),
    ),
  );
  await page.goto("/dashboard/account");
  await ownedListings;
  expect(new URL(page.url()).pathname).toBe("/dashboard/account");
  // The phone card renders once the identities have loaded.
  await expect(page.getByText(EMAIL_IDENTITY, { exact: true })).toBeVisible();
  const add = page.getByRole("button", { name: ADD });
  test.skip((await add.count()) === 0, "phone sign-in is off in this build");
  await add.click();

  const field = page.locator("#account-phone");
  const form = page.locator("form").filter({ has: field });
  await field.fill("032 2 12 34 56");
  await expect(field).toHaveValue("32 212 34 56");
  await form.getByRole("button", { name: GET_CODE }).click();
  await expect(form.getByText(LANDLINE)).toBeVisible();
  return { form, field, phoneChanges };
}

test("a guest-role host with a rental is pointed to its listing's phone", async ({
  page,
}) => {
  await signIn(page, "guest", true);
  const { form, field, phoneChanges } = await refuseCityNumber(page);
  await expect(form.getByText(GUESTS_CALL)).toBeVisible();
  await expect(form.getByRole("link", { name: MY_LISTINGS })).toHaveAttribute(
    "href",
    "/dashboard/renter/listings",
  );

  // Typing again clears the refusal and its hint.
  await field.fill("599 12 34 5");
  await expect(form.getByText(GUESTS_CALL)).toHaveCount(0);
  expect(phoneChanges).toHaveLength(0);
});

test("without a listing that takes a city number, only the refusal shows", async ({
  page,
}) => {
  await signIn(page, "renter", false);
  const { form, phoneChanges } = await refuseCityNumber(page);
  await expect(form.getByText(GUESTS_CALL)).toHaveCount(0);
  await expect(form.getByRole("link", { name: MY_LISTINGS })).toHaveCount(0);
  expect(phoneChanges).toHaveLength(0);
});

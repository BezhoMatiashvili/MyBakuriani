import type { Page } from "@playwright/test";
import { test, expect } from "../helpers/fixtures";
import { supabaseAdmin } from "../helpers/supabase";
import { TEST_IDS } from "../helpers/seed";
import { configureIsolatedE2E } from "../helpers/env";

// A user who holds several cabinets sees EVERY notification (all scopes plus
// global NULL-scope notices) in the header bell on every dashboard. The
// per-cabinet sidebar badges stay scoped. The entertainment fixture user stands in for
// the multi-role user: the bell lists rows by user_id, so the seeded scopes do
// not need matching cabinets. The entertainment user is used because no other
// spec seeds or reads its notifications, so this one cannot race
// notifications.spec.ts (which owns the renter/seller/food/transport users).

const USER_ID = TEST_IDS.entertainment;

const ROWS = [
  {
    id: "aae2ff00-e201-4000-a000-000000000001",
    scope: "entertainment",
    label: "გართობა",
  },
  {
    id: "aae2ff00-e202-4000-a000-000000000002",
    scope: "guest",
    label: "სტუმარი",
  },
  {
    id: "aae2ff00-e203-4000-a000-000000000003",
    scope: "seller",
    label: "ბინები (გაყიდვა)",
  },
  { id: "aae2ff00-e204-4000-a000-000000000004", scope: "food", label: "კვება" },
  // Global notice: no cabinet, labelled "general" (ზოგადი) in every bell.
  { id: "aae2ff00-e205-4000-a000-000000000005", scope: null, label: "ზოგადი" },
] as const;
const LIVE_ROW_ID = "aae2ff00-e206-4000-a000-000000000006";
const IDS = [...ROWS.map((row) => row.id), LIVE_ROW_ID];

// Navbar.markAllRead / Navbar.viewAll (ka)
const MARK_ALL_READ = "ყველას წაკითხულად მონიშვნა";
const VIEW_ALL = "ყველას ნახვა";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;
const PATHS = [
  "/dashboard/guest",
  "/dashboard/entertainment",
  "/dashboard/account",
];

const title = (row: (typeof ROWS)[number]) =>
  `Multi-role bell ${row.scope ?? "global"}`;

async function seed() {
  await supabaseAdmin.from("notifications").delete().in("id", IDS);
  // Start from a known total: nothing else unread for this user.
  await supabaseAdmin
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", USER_ID)
    .eq("is_read", false);
  const { error } = await supabaseAdmin.from("notifications").insert(
    ROWS.map((row) => ({
      id: row.id,
      user_id: USER_ID,
      type: "system",
      title: title(row),
      message: "Seeded for the unified header bell.",
      is_read: false,
      dashboard_scope: row.scope,
    })),
  );
  if (error) throw new Error(`Could not seed notifications: ${error.message}`);
}

async function allRead() {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .select("is_read")
    .in(
      "id",
      ROWS.map((row) => row.id),
    );
  if (error) throw new Error(`Could not read notifications: ${error.message}`);
  return (data ?? []).every((row) => row.is_read);
}

// The cookie banner is fixed to the bottom of the viewport and would intercept
// clicks on the popover footer, so the test user has already answered it.
async function answerCookieBanner(page: Page) {
  await page.context().addCookies([
    {
      name: "mb_cookie_consent",
      value: encodeURIComponent("v2|analytics=0|location=0"),
      url: configureIsolatedE2E().baseUrl,
    },
  ]);
}

const bell = (page: Page) => page.getByTestId("header-bell");
const badge = (page: Page) => page.getByTestId("header-bell-badge");
const popover = (page: Page) => page.getByTestId("header-bell-popover");

test.describe("Unified header bell", () => {
  // One shared user and shared rows: no parallel workers.
  test.describe.configure({ mode: "serial" });

  test.beforeEach(seed);
  test.afterEach(async () => {
    await supabaseAdmin.from("notifications").delete().in("id", IDS);
  });

  for (const viewport of VIEWPORTS) {
    for (const path of PATHS) {
      test(`${path} (${viewport.name}): badge is the total unread and the popover lists every cabinet`, async ({
        entertainmentPage: page,
      }) => {
        await answerCookieBanner(page);
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await page.goto(path);

        await expect(bell(page)).toBeVisible();
        // 4 scoped rows + 1 global row, none hidden by the active cabinet.
        await expect(badge(page)).toHaveText(String(ROWS.length));

        await bell(page).click();
        for (const row of ROWS) {
          await expect(
            popover(page).getByText(title(row), { exact: true }),
          ).toBeVisible();
          await expect(
            popover(page)
              .getByTestId("notification-scope-label")
              .filter({ hasText: row.label }),
          ).not.toHaveCount(0);
        }
      });
    }
  }

  test("'view all' opens the aggregate inbox, which labels every row", async ({
    entertainmentPage: page,
  }) => {
    await answerCookieBanner(page);
    await page.goto("/dashboard/guest");
    await expect(badge(page)).toHaveText(String(ROWS.length));

    await bell(page).click();
    await popover(page).getByRole("link", { name: VIEW_ALL }).click();
    await expect(page).toHaveURL(/\/notifications(?:$|[?#])/);

    for (const row of ROWS) {
      await expect(page.getByText(title(row), { exact: true })).toBeVisible();
    }
    await expect(page.getByTestId("notification-scope-label")).not.toHaveCount(
      0,
    );
  });

  test("the sidebar badge stays per-cabinet while the header badge is the total", async ({
    entertainmentPage: page,
  }) => {
    await answerCookieBanner(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard/entertainment");

    await expect(badge(page)).toHaveText(String(ROWS.length));
    const sidebarLink = page.locator(
      'aside a[href$="/dashboard/entertainment/notifications"]',
    );
    await expect(sidebarLink.getByText("1", { exact: true })).toBeVisible();
  });

  test("mark all as read clears every scope, the header total and the sidebar badge", async ({
    entertainmentPage: page,
  }) => {
    await answerCookieBanner(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard/entertainment");
    await expect(badge(page)).toHaveText(String(ROWS.length));

    await bell(page).click();
    await popover(page).getByRole("button", { name: MARK_ALL_READ }).click();

    await expect(badge(page)).toHaveCount(0);
    await expect.poll(allRead).toBe(true);
    const sidebarLink = page.locator(
      'aside a[href$="/dashboard/entertainment/notifications"]',
    );
    await expect(sidebarLink.getByText("1", { exact: true })).toHaveCount(0);
  });

  test("a live global notice raises the header total", async ({
    entertainmentPage: page,
  }) => {
    await answerCookieBanner(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard/guest");
    await expect(badge(page)).toHaveText(String(ROWS.length));

    const { error } = await supabaseAdmin.from("notifications").insert({
      id: LIVE_ROW_ID,
      user_id: USER_ID,
      type: "system",
      title: "Multi-role bell live global",
      message: "Arrives over realtime with no scope.",
      is_read: false,
      dashboard_scope: null,
    });
    if (error)
      throw new Error(`Could not insert live notification: ${error.message}`);

    await expect(badge(page)).toHaveText(String(ROWS.length + 1));
  });
});

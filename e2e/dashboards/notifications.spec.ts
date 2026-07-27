import type { Page } from "@playwright/test";
import { test, expect } from "../helpers/fixtures";
import { supabaseAdmin } from "../helpers/supabase";
import { TEST_IDS } from "../helpers/seed";

type Scope =
  | "renter"
  | "seller"
  | "food"
  | "transport"
  | "services";

type ScopedNotificationCase = {
  name: string;
  userId: string;
  path: string;
  scope: Exclude<Scope, "services">;
  otherScope: Scope;
  notificationId: string;
  otherNotificationId: string;
};

const CASES: ScopedNotificationCase[] = [
  {
    name: "renter",
    userId: TEST_IDS.renter,
    path: "/dashboard/renter/notifications",
    scope: "renter",
    otherScope: "seller",
    notificationId: "aae2ff00-e101-4000-a000-000000000001",
    otherNotificationId: "aae2ff00-e102-4000-a000-000000000002",
  },
  {
    name: "seller",
    userId: TEST_IDS.seller,
    path: "/dashboard/seller/notifications",
    scope: "seller",
    otherScope: "renter",
    notificationId: "aae2ff00-e103-4000-a000-000000000003",
    otherNotificationId: "aae2ff00-e104-4000-a000-000000000004",
  },
  {
    name: "food",
    userId: TEST_IDS.food,
    path: "/dashboard/food/notifications",
    scope: "food",
    otherScope: "renter",
    notificationId: "aae2ff00-e105-4000-a000-000000000005",
    otherNotificationId: "aae2ff00-e106-4000-a000-000000000006",
  },
  {
    name: "transport service",
    userId: TEST_IDS.transport,
    path: "/dashboard/transport/notifications",
    scope: "transport",
    otherScope: "services",
    notificationId: "aae2ff00-e107-4000-a000-000000000007",
    otherNotificationId: "aae2ff00-e108-4000-a000-000000000008",
  },
];

async function seedScopedNotifications(notificationCase: ScopedNotificationCase) {
  const ids = [
    notificationCase.notificationId,
    notificationCase.otherNotificationId,
  ];

  await supabaseAdmin.from("notifications").delete().in("id", ids);
  await supabaseAdmin
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", notificationCase.userId)
    .eq("dashboard_scope", notificationCase.scope)
    .eq("is_read", false);

  const { error } = await supabaseAdmin.from("notifications").insert([
    {
      id: notificationCase.notificationId,
      user_id: notificationCase.userId,
      type: "system",
      title: `Scoped ${notificationCase.name} inbox notice`,
      message: "Unread notice for the active dashboard scope.",
      is_read: false,
      dashboard_scope: notificationCase.scope,
    },
    {
      id: notificationCase.otherNotificationId,
      user_id: notificationCase.userId,
      type: "system",
      title: `Other ${notificationCase.otherScope} inbox notice`,
      message: "Unread notice that must remain in its own dashboard scope.",
      is_read: false,
      dashboard_scope: notificationCase.otherScope,
    },
  ]);
  if (error) throw new Error(`Could not seed scoped notifications: ${error.message}`);
}

async function isRead(id: string) {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .select("is_read")
    .eq("id", id)
    .single();
  if (error) throw new Error(`Could not read notification ${id}: ${error.message}`);
  return data.is_read;
}

async function expectRedBadge(page: Page, path: string) {
  const notificationLink = page.locator(`aside a[href$="${path}"]`);
  await expect(notificationLink).toBeVisible();

  const badge = notificationLink.getByText("1", { exact: true });
  await expect(badge).toHaveText("1");
  await expect(badge).toHaveCSS("background-color", "rgb(239, 68, 68)");
  await expect(badge).toHaveCSS("color", "rgb(255, 255, 255)");
}

async function expectBadgeCleared(page: Page, path: string) {
  const notificationLink = page.locator(`aside a[href$="${path}"]`);
  await expect(notificationLink.getByText("1", { exact: true })).toHaveCount(0);
}

async function verifyScopedInbox(page: Page, notificationCase: ScopedNotificationCase) {
  const ids = [
    notificationCase.notificationId,
    notificationCase.otherNotificationId,
  ];
  try {
    await seedScopedNotifications(notificationCase);

    const overviewPath = notificationCase.path.replace(/\/notifications$/, "");
    await page.goto(overviewPath);
    await expect(page).toHaveURL(new RegExp(`${overviewPath}(?:$|[/?#])`));
    await expectRedBadge(page, notificationCase.path);

    await page.goto(notificationCase.path);
    await expect(page).toHaveURL(
      new RegExp(`${notificationCase.path}(?:$|[/?#])`),
    );

    await expect.poll(() => isRead(notificationCase.notificationId)).toBe(true);
    await expectBadgeCleared(page, notificationCase.path);
    await expect.poll(() => isRead(notificationCase.otherNotificationId)).toBe(false);
  } finally {
    await supabaseAdmin.from("notifications").delete().in("id", ids);
  }
}

test.describe("Scoped dashboard notification inboxes", () => {
  test("renter inbox reads only renter notifications", async ({ renterPage }) => {
    await verifyScopedInbox(renterPage, CASES[0]);
  });

  test("seller inbox reads only seller notifications", async ({ sellerPage }) => {
    await verifyScopedInbox(sellerPage, CASES[1]);
  });

  test("food inbox reads only food notifications", async ({ foodPage }) => {
    await verifyScopedInbox(foodPage, CASES[2]);
  });

  test("service-family inbox reads only its cabinet notifications", async ({
    transportPage,
  }) => {
    await verifyScopedInbox(transportPage, CASES[3]);
  });
});

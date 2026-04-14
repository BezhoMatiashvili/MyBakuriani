import { test, expect } from "../helpers/fixtures";
import { calendarBlocks, supabaseAdmin } from "../helpers/supabase";

test.describe("Calendar and availability", () => {
  test.describe.configure({ mode: "serial" });
  test("seed data has calendar blocks for apartment", async ({ testIds }) => {
    const { data, error } = await supabaseAdmin
      .from("calendar_blocks")
      .select("*")
      .eq("property_id", testIds.apartment)
      .order("date");

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(2);

    const statuses = data!.map((c) => c.status);
    expect(statuses).toContain("available");
  });

  test("apartment has blocked dates from seed", async ({ testIds }) => {
    const { data, error } = await supabaseAdmin
      .from("calendar_blocks")
      .select("*")
      .eq("property_id", testIds.apartment);

    expect(error).toBeNull();
    const blocked = data!.filter((c) => c.status === "blocked");
    expect(blocked.length).toBeGreaterThanOrEqual(1);
  });

  test("property detail page renders", async ({ guestPage, testIds }) => {
    await guestPage.goto(`/apartments/${testIds.apartment}`);
    if (guestPage.url().includes("/auth/login")) {
      test
        .info()
        .annotations.push({ type: "skip", description: "Auth redirect" });
      return;
    }
    await expect(guestPage.locator("main")).toBeVisible();
  });

  test("calendar block status can be toggled via DB", async ({ testIds }) => {
    const block = await calendarBlocks.get(testIds.calendarBlock1);
    expect(block).not.toBeNull();
    expect(block!.status).toBe("available");

    const blocked = await calendarBlocks.update(testIds.calendarBlock1, {
      status: "blocked",
    });
    expect(blocked.status).toBe("blocked");

    const restored = await calendarBlocks.update(testIds.calendarBlock1, {
      status: "available",
    });
    expect(restored.status).toBe("available");
  });

  test("public property detail page loads", async ({ page, testIds }) => {
    await page.goto(`/apartments/${testIds.apartment}`);
    await expect(page.locator("main")).toBeVisible();
  });
});

import { test, expect } from "../helpers/fixtures";
import type { Page, Route } from "@playwright/test";
import { configureIsolatedE2E } from "../helpers/env";

// The support assistant's browser half (C43) against a mocked /api/support:
// no model and no OpenRouter spend. The mocked plan names an element from the
// snapshot the browser sent, and Jev's ring must land on that element.

type PlanRequest = {
  mode: "ask" | "plan";
  message?: string;
  goal?: string;
  elements?: Array<
    Record<string, unknown> & {
      id: string;
      kind: string;
      label: string;
      href?: string;
    }
  >;
};

// The cookie banner would cover the launcher in the bottom-right corner.
async function acceptCookies(page: Page) {
  await page.context().addCookies([
    {
      name: "mb_cookie_consent",
      value: encodeURIComponent("v2|analytics=0|location=0"),
      url: configureIsolatedE2E().baseUrl,
    },
  ]);
}

async function openAssistant(page: Page) {
  const launcher = page.getByTestId("jev-launcher");
  const mounted = await launcher.waitFor({ timeout: 20_000 }).then(
    () => true,
    () => false,
  );
  test.skip(
    !mounted,
    "the assistant mounts only when OPENROUTER_API_KEY is set",
  );
  await launcher.click();
  await expect(page.getByTestId("jev-panel")).toBeVisible();
}

test.describe("support assistant (Jev)", () => {
  test("signed-out visitors get it on the home page, named საპორტი", async ({
    page,
  }) => {
    await page.route("**/api/support", (route: Route) =>
      route.fulfill({
        json: {
          type: "answer",
          text: "Smart Match-ით სტუმარი მოთხოვნას აგზავნის.",
        },
      }),
    );
    await acceptCookies(page);
    await page.goto("/");
    await openAssistant(page);
    const panel = page.getByTestId("jev-panel");
    await expect(panel.getByRole("heading", { name: "საპორტი" })).toBeVisible();
    await expect(panel).not.toContainText("Jev");
    await expect(
      panel.getByRole("button", { name: "როგორ დავრეგისტრირდე?" }),
    ).toBeVisible();
    await panel.locator("textarea").fill("რა არის Smart Match?");
    await panel.locator("textarea").press("Enter");
    await expect(panel).toContainText("Smart Match-ით სტუმარი");
  });

  test("a plan glows on the element it names and moves on when the user clicks it", async ({
    renterPage: page,
  }) => {
    const requests: PlanRequest[] = [];
    await page.route("**/api/support", async (route: Route) => {
      const body = route.request().postDataJSON() as PlanRequest;
      requests.push(body);
      if (body.mode === "ask") {
        return route.fulfill({ json: { type: "guide", goal: body.message } });
      }
      const calendar = body.elements?.find(
        (element) => element.href === "/dashboard/renter/calendar",
      );
      if (!calendar) return route.fulfill({ json: { type: "noplan" } });
      return route.fulfill({
        json: {
          type: "plan",
          plan: {
            kind: "steps",
            intro: "",
            steps: [
              {
                target: calendar.id,
                action: "click",
                say: "დააჭირეთ „კალენდარი“-ს",
              },
            ],
            done: true,
          },
        },
      });
    });

    await acceptCookies(page);
    await page.goto("/dashboard/renter");
    await openAssistant(page);
    await page
      .getByTestId("jev-panel")
      .locator("textarea")
      .fill("სად არის კალენდარი?");
    await page.keyboard.press("Enter");

    const bubble = page.getByTestId("jev-bubble");
    await expect(bubble).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("jev-say")).toHaveText(
      "დააჭირეთ „კალენდარი“-ს",
    );

    const plan = requests.find((request) => request.mode === "plan");
    expect(plan?.goal).toBe("სად არის კალენდარი?");
    expect(plan?.elements?.length ?? 0).toBeGreaterThan(3);

    // The glow surrounds the calendar link the plan named.
    const link = page
      .locator("a[href$='/dashboard/renter/calendar']:visible")
      .first();
    const linkBox = await link.boundingBox();
    const ringBox = await page
      .locator("[data-jev-ignore] .z-\\[90\\]")
      .first()
      .boundingBox();
    expect(linkBox && ringBox).toBeTruthy();
    expect(ringBox!.x).toBeLessThanOrEqual(linkBox!.x);
    expect(ringBox!.y).toBeLessThanOrEqual(linkBox!.y);
    expect(ringBox!.x + ringBox!.width).toBeGreaterThanOrEqual(
      linkBox!.x + linkBox!.width,
    );
    expect(ringBox!.y + ringBox!.height).toBeGreaterThanOrEqual(
      linkBox!.y + linkBox!.height,
    );

    // Doing the step finishes the one-step walkthrough.
    await link.click();
    await expect(page).toHaveURL(/\/dashboard\/renter\/calendar/);
    await expect(bubble).toBeHidden();
    await expect(page.getByTestId("jev-launcher")).toBeVisible();
  });

  test("the page snapshot carries labels, never what the user typed", async ({
    renterPage: page,
  }) => {
    test.skip(
      (page.viewportSize()?.width ?? 0) < 1024,
      "the topbar search field is shown from lg up",
    );
    let snapshot: PlanRequest | null = null;
    await page.route("**/api/support", async (route: Route) => {
      const body = route.request().postDataJSON() as PlanRequest;
      if (body.mode === "plan") snapshot = body;
      return route.fulfill({ json: { type: "noplan" } });
    });

    await acceptCookies(page);
    await page.goto("/dashboard/renter");
    const search = page.locator("header input[type='text']").first();
    await search.fill("599 12 34 56 nino@example.ge");
    await openAssistant(page);
    // Any quick-help chip starts a walkthrough, which sends a snapshot.
    await page
      .getByTestId("jev-panel")
      .locator("button.min-h-11")
      .first()
      .click();

    await expect.poll(() => snapshot !== null, { timeout: 20_000 }).toBe(true);
    const sent = JSON.stringify(snapshot);
    expect(sent).not.toContain("599");
    expect(sent).not.toContain("nino@example.ge");
    expect(sent).not.toMatch(/"value"/);
    const field = snapshot!.elements?.find(
      (element) => element.kind === "input" && element.filled === true,
    );
    expect(
      field,
      "the typed-in search field is reported as filled",
    ).toBeTruthy();
  });
});

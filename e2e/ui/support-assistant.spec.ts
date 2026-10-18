import { test, expect } from "../helpers/fixtures";
import type { Page, Route } from "@playwright/test";
import { configureIsolatedE2E } from "../helpers/env";
import { supabaseAdmin } from "../helpers/supabase";
import { TEST_IDS } from "../helpers/seed";

// The support assistant's browser half (C43) against a mocked /api/support:
// no model and no OpenRouter spend. Mocked answers carry buttons with
// server-style links; mocked plans name elements from the snapshot the
// browser sent, and Jev's ring must land on that element.

type SupportRequest = {
  mode: "ask" | "plan" | "feedback";
  message?: string;
  goal?: string;
  progress?: string[];
  ref?: string;
  rating?: string;
  elements?: Array<
    Record<string, unknown> & {
      id: string;
      kind: string;
      label: string;
      href?: string;
    }
  >;
};

const REF = "abcdefghij";

function answer(extra: Record<string, unknown> = {}) {
  return {
    type: "answer",
    text: "",
    actions: [],
    guide: "",
    guideNow: false,
    suggestions: [],
    ref: REF,
    ...extra,
  };
}

/** YYYY-MM-DD, `days` from today. */
function day(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

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

async function ask(page: Page, text: string) {
  const input = page.getByTestId("jev-panel").locator("textarea");
  await input.fill(text);
  await input.press("Enter");
}

/** Records every /api/support body; `reply` answers it. */
async function mockSupport(
  page: Page,
  reply: (body: SupportRequest) => Record<string, unknown>,
): Promise<SupportRequest[]> {
  const requests: SupportRequest[] = [];
  await page.route("**/api/support", (route: Route) => {
    const body = route.request().postDataJSON() as SupportRequest;
    requests.push(body);
    return route.fulfill({ json: reply(body) });
  });
  return requests;
}

/** A one-step plan on the renter's calendar link, else noplan. */
function calendarPlan(body: SupportRequest) {
  const calendar = body.elements?.find(
    (element) => element.href === "/dashboard/renter/calendar",
  );
  if (!calendar) return { type: "noplan" };
  return {
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
  };
}

test.describe("support assistant (Jev)", () => {
  test("a visitor's answer offers a prefilled search, follow-ups and 👍/👎", async ({
    page,
  }) => {
    const checkIn = day(40);
    const checkOut = day(45);
    const href = `/search?check_in=${checkIn}&check_out=${checkOut}&guests=4&mode=rent`;
    const requests = await mockSupport(page, (body) =>
      body.mode === "feedback"
        ? { type: "ok" }
        : answer({
            text: "ამ თარიღებზე ბინებს ძებნა გიჩვენებთ.",
            actions: [
              {
                id: "search_rent",
                params: { check_in: checkIn, check_out: checkOut, guests: 4 },
                href,
              },
            ],
            suggestions: ["როგორ დავუკავშირდე მესაკუთრეს?"],
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

    await ask(page, "ბინა მინდა 4 კაცზე");
    await expect(panel).toContainText("ამ თარიღებზე ბინებს");
    const button = panel.getByTestId("jev-action");
    await expect(button).toContainText("ძებნა");
    await expect(button).toContainText("4 სტუმარი");

    // 👍 sends the answer's ref and the rating, nothing else.
    await panel.getByTestId("jev-rate-up").click();
    await expect(panel).toContainText("მადლობა!");
    await expect
      .poll(() => requests.find((request) => request.mode === "feedback"))
      .toEqual({ mode: "feedback", ref: REF, rating: "up" });

    // A follow-up chip asks it as the next question.
    await panel.getByTestId("jev-suggestion").click();
    await expect
      .poll(() => requests.filter((request) => request.mode === "ask").length)
      .toBe(2);
    expect(requests.filter((r) => r.mode === "ask")[1].message).toBe(
      "როგორ დავუკავშირდე მესაკუთრეს?",
    );

    // The button opens the search with the filters, and the chat closes.
    await panel.getByTestId("jev-action").last().click();
    await expect(page).toHaveURL(
      new RegExp(
        `/search\\?check_in=${checkIn}&check_out=${checkOut}&guests=4`,
      ),
    );
    await expect(panel).toBeHidden();
  });

  test("a plan glows on the element it names and moves on when the user clicks it", async ({
    renterPage: page,
  }) => {
    const requests = await mockSupport(page, (body) =>
      body.mode === "ask"
        ? answer({ guide: "კალენდრის გახსნა", guideNow: true })
        : calendarPlan(body),
    );

    await acceptCookies(page);
    await page.goto("/dashboard/renter");
    await openAssistant(page);
    await ask(page, "სად არის კალენდარი?");

    const bubble = page.getByTestId("jev-bubble");
    await expect(bubble).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("jev-say")).toHaveText(
      "დააჭირეთ „კალენდარი“-ს",
    );

    // The steps planned while the answer was written are the ones used: the
    // goal is the question itself.
    const plans = requests.filter((request) => request.mode === "plan");
    expect(plans).toHaveLength(1);
    expect(plans[0].goal).toBe("სად არის კალენდარი?");
    expect(plans[0].elements?.length ?? 0).toBeGreaterThan(3);

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

  test("“Do it for me” presses a page link and the walkthrough finishes", async ({
    renterPage: page,
  }) => {
    await mockSupport(page, (body) =>
      body.mode === "ask"
        ? answer({ guide: "კალენდრის გახსნა", guideNow: true })
        : calendarPlan(body),
    );
    await acceptCookies(page);
    await page.goto("/dashboard/renter");
    await openAssistant(page);
    await ask(page, "მაჩვენე კალენდარი");

    await expect(page.getByTestId("jev-bubble")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByTestId("jev-do-it").click();
    await expect(page).toHaveURL(/\/dashboard\/renter\/calendar/);
    await expect(page.getByTestId("jev-bubble")).toBeHidden();
  });

  test("a quick question answers at once, with the site's own button", async ({
    renterPage: page,
  }) => {
    const requests = await mockSupport(page, () => ({ type: "noplan" }));
    await acceptCookies(page);
    await page.goto("/dashboard/renter");
    await openAssistant(page);
    const panel = page.getByTestId("jev-panel");
    await panel
      .getByTestId("jev-quick")
      .filter({ hasText: "როგორ შევავსო ბალანსი?" })
      .click();

    await expect(panel).toContainText("„ბალანსის შევსება“");
    await expect(panel.locator("[data-action='topup']")).toContainText(
      "ბალანსის შევსება",
    );
    await expect(panel.getByTestId("jev-show-me")).toBeVisible();
    expect(requests.filter((request) => request.mode === "ask")).toHaveLength(
      0,
    );
  });

  test("a top-up button opens the payment window with the amount filled in", async ({
    renterPage: page,
  }) => {
    await mockSupport(page, () =>
      answer({
        text: "ბალანსს ბარათით შეავსებთ.",
        actions: [
          {
            id: "topup",
            params: { amount: 150 },
            href: "/dashboard/renter/balance?topup=150",
          },
        ],
      }),
    );
    await acceptCookies(page);
    await page.goto("/dashboard/renter");
    await openAssistant(page);
    await ask(page, "150 ლარით შევსება მინდა");
    await page.getByTestId("jev-action").click();

    await expect(page).toHaveURL(/\/dashboard\/renter\/balance$/);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("input").first()).toHaveValue("150");
  });

  test("the Smart Match button opens the request form prefilled, again on the same page", async ({
    guestPage: page,
  }) => {
    const href = `/dashboard/guest?smartMatch=new&check_in=${day(30)}&check_out=${day(34)}&guests=3`;
    await mockSupport(page, () =>
      answer({
        text: "მოთხოვნის ფორმა შევავსე, გადაამოწმეთ და გაგზავნეთ.",
        actions: [
          {
            id: "smart_match",
            params: { check_in: day(30), check_out: day(34), guests: 3 },
            href,
          },
        ],
      }),
    );
    await acceptCookies(page);
    await page.goto("/dashboard/guest");
    await openAssistant(page);
    await ask(page, "Smart Match მოთხოვნა 3 სტუმარზე");

    const form = page
      .locator("form")
      .filter({ has: page.getByRole("heading", { name: "ახალი მოთხოვნა" }) });
    for (let round = 0; round < 2; round += 1) {
      if (round === 1) {
        await page.keyboard.press("Escape");
        await expect(form).toBeHidden();
        await page.getByTestId("jev-launcher").click();
      }
      await page.getByTestId("jev-action").last().click();
      await expect(form).toBeVisible();
      await expect(form.locator("input[type='text']").first()).toHaveValue("3");
      // The link's params are dropped, so a reload doesn't reopen it.
      await expect(page).toHaveURL(/\/dashboard\/guest$/);
    }
  });

  test("an error right after the user's click offers help, sent only on request", async ({
    renterPage: page,
  }) => {
    const requests = await mockSupport(page, () => ({ type: "noplan" }));
    await acceptCookies(page);
    await page.goto("/dashboard/renter");
    await expect(page.getByTestId("jev-launcher")).toBeVisible({
      timeout: 20_000,
    });
    // A form's error appears as a role=alert just after a press.
    await page.evaluate(() => {
      document.addEventListener(
        "click",
        () => {
          window.setTimeout(() => {
            const alert = document.createElement("div");
            alert.setAttribute("role", "alert");
            alert.textContent = "ფოტო ძალიან დიდია";
            document.body.appendChild(alert);
          }, 200);
        },
        { once: true },
      );
    });
    await page.locator("main h1, main h2").first().click();

    const nudge = page.getByTestId("jev-nudge");
    await expect(nudge).toBeVisible();
    expect(requests).toHaveLength(0);
    await page.getByTestId("jev-nudge-show").click();
    await expect
      .poll(() => requests.find((request) => request.mode === "plan"))
      .toBeTruthy();
    const plan = requests.find((request) => request.mode === "plan");
    expect(plan?.progress).toEqual(['saw error "ფოტო ძალიან დიდია"']);
  });

  test("a press on a disabled button offers help with that button", async ({
    renterPage: page,
  }) => {
    const requests = await mockSupport(page, () => ({ type: "noplan" }));
    await acceptCookies(page);
    await page.goto("/dashboard/renter");
    await expect(page.getByTestId("jev-launcher")).toBeVisible({
      timeout: 20_000,
    });
    // A form's submit button that stays disabled until something is filled in.
    await page.evaluate(() => {
      const button = document.createElement("button");
      button.type = "submit";
      button.disabled = true;
      button.textContent = "გამოქვეყნება";
      button.style.cssText =
        "position:fixed;left:40px;top:200px;width:200px;height:60px;z-index:60";
      const form = document.createElement("form");
      form.appendChild(button);
      document.querySelector("main")?.appendChild(form);
    });
    await page.mouse.click(120, 230);

    await expect(page.getByTestId("jev-nudge")).toBeVisible();
    expect(requests).toHaveLength(0);
    await page.getByTestId("jev-nudge-show").click();
    await expect
      .poll(() => requests.find((request) => request.mode === "plan"))
      .toBeTruthy();
    expect(
      requests.find((request) => request.mode === "plan")?.progress,
    ).toEqual(['pressed disabled "გამოქვეყნება"']);
  });

  test("a chat saved by another account is never shown", async ({
    guestPage: page,
  }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem(
        "mb.jev.v2",
        JSON.stringify({
          owner: "00000000-0000-4000-8000-000000000000",
          entries: [{ id: "x", role: "user", text: "სხვისი საუბარი" }],
          guide: null,
          savedAt: Date.now(),
        }),
      );
    });
    await acceptCookies(page);
    await page.goto("/dashboard/guest");
    await openAssistant(page);
    const panel = page.getByTestId("jev-panel");
    await expect(panel).not.toContainText("სხვისი საუბარი");
    await expect(panel.getByTestId("jev-quick").first()).toBeVisible();
  });

  test("the page snapshot carries labels, never what the user typed", async ({
    renterPage: page,
  }) => {
    test.skip(
      (page.viewportSize()?.width ?? 0) < 1024,
      "the topbar search field is shown from lg up",
    );
    let snapshot: SupportRequest | null = null;
    await page.route("**/api/support", async (route: Route) => {
      const body = route.request().postDataJSON() as SupportRequest;
      if (body.mode === "plan") snapshot = body;
      return route.fulfill({ json: { type: "noplan" } });
    });

    await acceptCookies(page);
    await page.goto("/dashboard/renter");
    const search = page.locator("header input[type='text']").first();
    await search.fill("599 12 34 56 nino@example.ge");
    await openAssistant(page);
    // A walkthrough chip sends a snapshot of this page.
    await page
      .getByTestId("jev-quick")
      .filter({ hasText: "ფოტოებს ვერ ვტვირთავ" })
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

  test("on admin pages other people's names and ids never reach the planner", async ({
    adminPage: page,
  }) => {
    let snapshot: SupportRequest | null = null;
    await page.route("**/api/support", async (route: Route) => {
      const body = route.request().postDataJSON() as SupportRequest;
      if (body.mode === "plan") snapshot = body;
      return route.fulfill({ json: { type: "noplan" } });
    });
    await acceptCookies(page);
    await page.goto("/dashboard/admin/clients");
    await openAssistant(page);
    await page
      .getByTestId("jev-quick")
      .filter({ hasText: "როგორ მოვძებნო მომხმარებელი?" })
      .click();
    await page.getByTestId("jev-show-me").click();

    await expect.poll(() => snapshot !== null, { timeout: 20_000 }).toBe(true);
    const sent = JSON.stringify(snapshot);
    expect(sent).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    const elements = snapshot!.elements ?? [];
    // The sidebar keeps its labels; a user's row is only "[item N]"; the
    // search box keeps its own caption.
    expect(elements.some((element) => element.label === "მომხმარებლები")).toBe(
      true,
    );
    expect(
      elements.some(
        (element) =>
          element.kind === "input" && !/^\[item \d+\]$/.test(element.label),
      ),
    ).toBe(true);
    for (const row of elements.filter((element) =>
      element.href?.startsWith("/dashboard/admin/clients/:id"),
    ))
      expect(row.label).toMatch(/^\[item \d+\]$/);
  });

  test("a renter's guest list reaches the planner without names or notes", async ({
    renterPage: page,
  }) => {
    const name = "ნინო ტესტიშვილი";
    const note = "გვიან ჩამოვა";
    const { data: guest, error } = await supabaseAdmin
      .from("renter_guests")
      .insert({ owner_id: TEST_IDS.renter, name, note })
      .select("id")
      .single();
    expect(error).toBeNull();
    try {
      let snapshot: SupportRequest | null = null;
      await page.route("**/api/support", async (route: Route) => {
        const body = route.request().postDataJSON() as SupportRequest;
        if (body.mode === "plan") snapshot = body;
        return route.fulfill({ json: { type: "noplan" } });
      });
      await acceptCookies(page);
      await page.goto("/dashboard/renter/guests");
      await expect(page.getByText(name).first()).toBeVisible();
      await openAssistant(page);
      await page
        .getByTestId("jev-quick")
        .filter({ hasText: "ფოტოებს ვერ ვტვირთავ" })
        .click();

      await expect
        .poll(() => snapshot !== null, { timeout: 20_000 })
        .toBe(true);
      const sent = JSON.stringify(snapshot);
      expect(sent).not.toContain("ნინო");
      expect(sent).not.toContain("ტესტიშვილი");
      expect(sent).not.toContain(note);
      const elements = snapshot!.elements ?? [];
      expect(
        elements.some((element) => /^\[item \d+\]$/.test(element.label)),
      ).toBe(true);
      // The row's own buttons keep the site's wording.
      expect(
        elements.some((element) =>
          ["რედაქტირება", "დაბლოკვა"].includes(element.label),
        ),
      ).toBe(true);
    } finally {
      await supabaseAdmin.from("renter_guests").delete().eq("id", guest!.id);
    }
  });

  test("signing out from the header forgets the chat", async ({
    guestPage: page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // The browser still drops its session; the shared fixture user's session
    // on the server stays valid for the other tests.
    await page.route("**/auth/v1/logout**", (route: Route) =>
      route.fulfill({ status: 204, body: "" }),
    );
    await mockSupport(page, () =>
      answer({ text: "თქვენი განცხადება განხილვის მოლოდინშია." }),
    );
    await acceptCookies(page);
    await page.goto("/");
    await openAssistant(page);
    await ask(page, "რატომ არ ჩანს ჩემი განცხადება?");
    const panel = page.getByTestId("jev-panel");
    await expect(panel).toContainText("განხილვის მოლოდინშია");
    await panel.getByRole("button", { name: "დახურვა" }).click();

    await page.getByTestId("menu-toggle").click();
    // Sign-out reloads the page; wait for the new one.
    await Promise.all([
      page.waitForEvent("load"),
      page.getByRole("button", { name: "გასვლა" }).click(),
    ]);
    await expect(page.getByTestId("jev-launcher")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByTestId("jev-launcher").click();
    await expect(panel).toBeVisible();
    await expect(panel).not.toContainText("ჩემი განცხადება");
    await expect(panel).not.toContainText("განხილვის მოლოდინშია");
  });
});

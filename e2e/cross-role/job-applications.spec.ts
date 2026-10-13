import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Browser, Page } from "@playwright/test";
import { test, expect, loadTestUsers } from "../helpers/fixtures";
import { authenticateAsRole, type TestUser } from "../helpers/auth";
import { configureIsolatedE2E } from "../helpers/env";
import { TEST_IDS } from "../helpers/seed";
import { services, supabaseAdmin } from "../helpers/supabase";

// ---------------------------------------------------------------------------
// Job applications (CVs) reach only the employment cabinet ("CV-ები").
//
// The 2026-10-13 report: an owner with a transport service AND a vacancy saw the
// vacancy's applications, CV download included, on the transport cabinet's
// orders page. Here the transport fixture user owns the vacancy too, plus an
// entertainment and a handyman draft, so all four service cabinets are theirs:
// one account holding several cabinets is what the bug needs.
//
// The application goes through the real job page with a real PDF, once per run
// (POST /api/job-applications allows 5 per hour per IP). afterAll removes every
// row and file this file creates. The default role fixtures share one browser
// context, so each test opens its own context per account.
// ---------------------------------------------------------------------------

test.describe.configure({ mode: "serial" });

const RUN = randomUUID().slice(0, 8);
const VACANCY_ID = randomUUID();
const ENTERTAINMENT_ID = randomUUID();
const HANDYMAN_ID = randomUUID();
const VACANCY_TITLE = `E2E CV ვაკანსია ${RUN}`;
const APPLICANT = `E2E კანდიდატი ${RUN}`;
const CV_FILE = path.resolve(__dirname, "../../supabase/seed/sample-menu.pdf");
const CV_BYTES = readFileSync(CV_FILE);
const BASE_URL = configureIsolatedE2E().baseUrl;
const ORIGIN = new URL(BASE_URL).origin;

let owner: TestUser;
let otherEmployer: TestUser;
let applicationId = "";

/** A fresh browser context (signed in as `user` when given), cookie banner answered. */
async function openAs(browser: Browser, user?: TestUser) {
  const context = await browser.newContext({ baseURL: BASE_URL });
  await context.addCookies([
    {
      name: "mb_cookie_consent",
      value: encodeURIComponent("v2|analytics=0|location=0"),
      url: BASE_URL,
    },
  ]);
  const page = await context.newPage();
  if (user) await authenticateAsRole(user, page);
  return { context, page };
}

/**
 * The page's list has loaded: its skeleton, the only pulsing element in `main`,
 * is gone. Other specs add rows for the same fixture users while this one runs,
 * so an empty list is never the signal.
 */
async function expectLoaded(page: Page) {
  await expect(page.locator("main .animate-pulse")).toHaveCount(0);
}

async function applicationStatus() {
  const { data, error } = await supabaseAdmin
    .from("job_applications")
    .select("status")
    .eq("id", applicationId)
    .single();
  expect(error).toBeNull();
  return data?.status;
}

test.beforeAll(async () => {
  const users = loadTestUsers();
  owner = users.transport;
  otherEmployer = users.employment;
  await services.createMany([
    {
      id: VACANCY_ID,
      owner_id: TEST_IDS.transport,
      category: "employment",
      title: VACANCY_TITLE,
      description: "E2E: CV-ები მხოლოდ დასაქმების კაბინეტში",
      position: "მიმტანი",
      salary_range: "800-1200 ₾",
      experience_required: "1 წელი",
      employment_schedule: "სრული განაკვეთი",
      location: "ბაკურიანი",
      status: "active",
    },
    {
      id: ENTERTAINMENT_ID,
      owner_id: TEST_IDS.transport,
      category: "entertainment",
      title: `E2E გართობა ${RUN}`,
      location: "ბაკურიანი",
      status: "draft",
    },
    {
      id: HANDYMAN_ID,
      owner_id: TEST_IDS.transport,
      category: "handyman",
      title: `E2E ხელოსანი ${RUN}`,
      location: "ბაკურიანი",
      status: "draft",
    },
  ]);
});

test.afterAll(async () => {
  // The CV files outlive the rows (no cascade into storage).
  const { data: rows } = await supabaseAdmin
    .from("job_applications")
    .select("cv_path")
    .eq("service_id", VACANCY_ID);
  const files = (rows ?? [])
    .map((row) => row.cv_path)
    .filter((file): file is string => !!file);
  if (files.length > 0) {
    await supabaseAdmin.storage.from("cv-documents").remove(files);
  }
  await supabaseAdmin
    .from("notifications")
    .delete()
    .eq("user_id", TEST_IDS.transport)
    .eq("type", "job_application");
  for (const id of [VACANCY_ID, ENTERTAINMENT_ID, HANDYMAN_ID]) {
    await services.delete(id).catch(() => {});
  }
});

test("a visitor applies with a CV on the job page", async ({ browser }) => {
  const { context, page } = await openAs(browser);
  try {
    await page.goto(`/employment/${VACANCY_ID}`);
    expect(new URL(page.url()).pathname).toBe(`/employment/${VACANCY_ID}`);
    // A file picked before React hydrates the form is lost.
    await page.waitForFunction(() => {
      const input = document.querySelector("#cv-upload");
      return (
        !!input &&
        Object.keys(input).some((key) => key.startsWith("__reactProps$"))
      );
    });
    await page.locator("#cv-upload").setInputFiles(CV_FILE);
    await expect(page.getByText("sample-menu.pdf")).toBeVisible();
    await page.locator('[data-field="full_name"] input').fill(APPLICANT);
    await page.locator('[data-field="phone"] input').fill("599000099");

    const submitted = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/job-applications" &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "მონაცემების გაგზავნა" }).click();
    expect(
      (await submitted).status(),
      "429 means this IP used up the 5 applications an hour; wait or clear rate_limit_counters",
    ).toBe(201);
    await expect(
      page.getByText("განაცხადი წარმატებით გაიგზავნა"),
    ).toBeVisible();
  } finally {
    await context.close();
  }

  const { data, error } = await supabaseAdmin
    .from("job_applications")
    .select("id, status, full_name, phone, cv_path")
    .eq("service_id", VACANCY_ID);
  expect(error).toBeNull();
  expect(data).toHaveLength(1);
  const row = data![0];
  expect(row).toMatchObject({
    status: "new",
    full_name: APPLICANT,
    phone: "+995599000099",
  });
  expect(row.cv_path).toBe(`${VACANCY_ID}/${row.id}.pdf`);
  applicationId = row.id;

  // The owner is told, in the employment cabinet only.
  const { data: notices } = await supabaseAdmin
    .from("notifications")
    .select("dashboard_scope, action_url, message")
    .eq("user_id", TEST_IDS.transport)
    .eq("type", "job_application");
  const notice = (notices ?? []).find((n) => n.message.includes(APPLICANT));
  expect(notice).toMatchObject({
    dashboard_scope: "employment",
    action_url: "/dashboard/employment/orders",
  });
});

test("the transport, entertainment and services cabinets never show it", async ({
  browser,
}) => {
  const { context, page } = await openAs(browser, owner);
  const applicationReads: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/rest/v1/job_applications")) {
      applicationReads.push(request.url());
    }
  });
  try {
    for (const cabinet of ["transport", "entertainment", "services"]) {
      await page.goto(`/dashboard/${cabinet}/orders`);
      expect(new URL(page.url()).pathname).toBe(`/dashboard/${cabinet}/orders`);
      await expect(
        page.getByRole("heading", { name: "შეკვეთები / შეკითხვები" }),
      ).toBeVisible();
      await expectLoaded(page);
      await expect(page.getByText("ვაკანსიის განაცხადები")).toHaveCount(0);
      await expect(page.getByText(APPLICANT)).toHaveCount(0);
      await expect(page.locator("[data-cv-download]")).toHaveCount(0);

      await page.goto(`/dashboard/${cabinet}/notifications`);
      expect(new URL(page.url()).pathname).toBe(
        `/dashboard/${cabinet}/notifications`,
      );
      await expect(
        page.getByRole("heading", { name: "შეტყობინებები", exact: true }),
      ).toBeVisible();
      await expectLoaded(page);
      await expect(page.getByText(APPLICANT)).toHaveCount(0);
    }
    // These pages do not even ask for applications.
    expect(applicationReads).toEqual([]);
  } finally {
    await context.close();
  }
});

test("the employment cabinet lists it and hands the owner the CV", async ({
  browser,
}) => {
  const { context, page } = await openAs(browser, owner);
  try {
    await page.goto("/dashboard/employment/orders");
    expect(new URL(page.url()).pathname).toBe("/dashboard/employment/orders");
    await expect(page.getByRole("heading", { name: "CV-ები" })).toBeVisible();
    const row = page.locator("tr", { hasText: APPLICANT });
    await expect(row).toBeVisible();
    await expect(row).toContainText(VACANCY_TITLE);
    await expect(row.locator("[data-cv-download]")).toHaveAttribute(
      "href",
      `/api/job-applications/${applicationId}/cv`,
    );

    // A 302 to a short-lived signed URL that serves exactly the uploaded bytes.
    const cv = await page.request.get(
      `/api/job-applications/${applicationId}/cv`,
      { maxRedirects: 0 },
    );
    expect(cv.status()).toBe(302);
    const signedUrl = cv.headers()["location"];
    expect(signedUrl).toContain("/storage/v1/object/sign/cv-documents/");
    const file = await page.request.get(signedUrl);
    expect(file.status()).toBe(200);
    expect(Buffer.from(await file.body()).equals(CV_BYTES)).toBe(true);

    await page.goto("/dashboard/employment/notifications");
    expect(new URL(page.url()).pathname).toBe(
      "/dashboard/employment/notifications",
    );
    await expect(page.getByText(APPLICANT).first()).toBeVisible();
  } finally {
    await context.close();
  }
});

test("nobody else can open the CV or change the application", async ({
  browser,
  playwright,
}) => {
  const anonymous = await playwright.request.newContext({ baseURL: BASE_URL });
  try {
    const cv = await anonymous.get(
      `/api/job-applications/${applicationId}/cv`,
      { maxRedirects: 0 },
    );
    expect(cv.status()).toBe(401);
    const patch = await anonymous.patch(
      `/api/job-applications/${applicationId}`,
      { data: { status: "processed" }, headers: { origin: ORIGIN } },
    );
    expect(patch.status()).toBe(401);
  } finally {
    await anonymous.dispose();
  }

  const { context, page } = await openAs(browser, otherEmployer);
  try {
    const cv = await page.request.get(
      `/api/job-applications/${applicationId}/cv`,
      { maxRedirects: 0 },
    );
    expect(cv.status()).toBe(404);
    const patch = await page.request.patch(
      `/api/job-applications/${applicationId}`,
      { data: { status: "processed" }, headers: { origin: ORIGIN } },
    );
    expect(patch.status()).toBe(404);

    // Another employer's CV inbox does not list it.
    await page.goto("/dashboard/employment/orders");
    expect(new URL(page.url()).pathname).toBe("/dashboard/employment/orders");
    await expect(page.getByRole("heading", { name: "CV-ები" })).toBeVisible();
    await expectLoaded(page);
    await expect(page.getByText(APPLICANT)).toHaveCount(0);
  } finally {
    await context.close();
  }

  expect(await applicationStatus()).toBe("new");
});

test("მიღება moves it to დამუშავებული and it stays there", async ({
  browser,
}) => {
  const { context, page } = await openAs(browser, owner);
  try {
    await page.goto("/dashboard/employment/orders");
    expect(new URL(page.url()).pathname).toBe("/dashboard/employment/orders");
    const row = page.locator("tr", { hasText: APPLICANT });
    await row.getByRole("button", { name: "ნახვა" }).click();
    const dialog = page.getByRole("dialog", { name: "განაცხადის დეტალები" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "მიღება" }).click();
    // The button goes only once the server has stored the status.
    await expect(dialog.getByRole("button", { name: "მიღება" })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("heading", { name: "CV-ები" })).toBeVisible();
    await expectLoaded(page);
    await expect(page.locator("tr", { hasText: APPLICANT })).toHaveCount(0);
    await page.getByRole("button", { name: "დამუშავებული" }).click();
    await expect(page.locator("tr", { hasText: APPLICANT })).toBeVisible();
  } finally {
    await context.close();
  }

  expect(await applicationStatus()).toBe("processed");
});

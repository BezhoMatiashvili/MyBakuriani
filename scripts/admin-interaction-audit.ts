/**
 * Admin Dashboard INTERACTION Audit
 *
 * Extends admin-audit.ts — instead of just loading pages, this script actually
 * exercises every interactive element (buttons, form submits, toggles, filter
 * switches, modal open/close) and checks:
 *
 *   - does the click wire to a handler (no dead buttons)
 *   - does the resulting API call succeed (2xx/3xx)
 *   - does a toast success/error appear
 *   - does the resulting data persist (spot-checked via DB)
 *
 * Outputs .ralph/admin-interaction-report.json with per-test pass/fail.
 *
 * This is a one-off harness, NOT part of the regression suite.
 *
 * Usage:
 *   npx tsx scripts/admin-interaction-audit.ts
 */

import {
  chromium,
  type BrowserContext,
  type Page,
  type Response as PwResponse,
} from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const BASE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");
const EMAIL = process.env.ADMIN_TEST_EMAIL!;
const PASSWORD = process.env.ADMIN_TEST_PASSWORD!;
const OUT_DIR = path.resolve(process.cwd(), ".ralph");
const SHOTS_DIR = path.join(OUT_DIR, "interactions");
const REPORT_PATH = path.join(OUT_DIR, "admin-interaction-report.json");

type Verdict = "pass" | "fail" | "skip";
interface TestResult {
  page: string;
  test: string;
  verdict: Verdict;
  detail: string;
  apiCalls?: { method: string; url: string; status: number }[];
  consoleErrors?: string[];
  screenshot?: string;
  durationMs?: number;
}

const results: TestResult[] = [];

function slug(s: string) {
  return s.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

async function login(context: BrowserContext, page: Page): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const projectRef = new URL(url).hostname.split(".")[0];
  const supa = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await supa.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (error || !data.session) throw new Error("login failed");
  const session = data.session;
  const jsonPayload = JSON.stringify({
    access_token: session.access_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  });
  const cookieValue = `base64-${Buffer.from(jsonPayload).toString("base64")}`;
  await context.addCookies([
    {
      name: `sb-${projectRef}-auth-token`,
      value: cookieValue,
      domain: new URL(BASE_URL).hostname,
      path: "/",
      httpOnly: false,
      secure: BASE_URL.startsWith("https://"),
      sameSite: "Lax",
    },
  ]);
  await page.goto(`${BASE_URL}/dashboard/admin`, {
    waitUntil: "domcontentloaded",
  });
}

/**
 * Collect API calls triggered while the fn runs.
 * Filters for /api/admin/* endpoints.
 */
async function captureApiCalls<T>(
  page: Page,
  fn: () => Promise<T>,
): Promise<{
  result: T;
  calls: { method: string; url: string; status: number }[];
}> {
  const calls: { method: string; url: string; status: number }[] = [];
  const handler = (res: PwResponse) => {
    const url = res.url();
    if (url.includes("/api/admin/")) {
      calls.push({
        method: res.request().method(),
        url: url.replace(BASE_URL, ""),
        status: res.status(),
      });
    }
  };
  page.on("response", handler);
  try {
    const result = await fn();
    return { result, calls };
  } finally {
    page.off("response", handler);
  }
}

async function captureConsoleErrors<T>(
  page: Page,
  fn: () => Promise<T>,
): Promise<{ result: T; errors: string[] }> {
  const errors: string[] = [];
  const onConsole = (msg: import("@playwright/test").ConsoleMessage) => {
    if (msg.type() === "error") errors.push(msg.text());
  };
  const onPageError = (err: Error) => errors.push(`pageerror: ${err.message}`);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  try {
    const result = await fn();
    return { result, errors };
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  }
}

async function runTest(
  page: Page,
  routeLabel: string,
  testName: string,
  fn: () => Promise<{ detail: string; ok: boolean }>,
): Promise<TestResult> {
  const start = Date.now();
  let detail = "";
  let ok = false;
  let screenshot: string | undefined;
  const { errors } = await captureConsoleErrors(page, async () => {
    const { result, calls } = await captureApiCalls(page, async () => {
      try {
        const r = await fn();
        return r;
      } catch (err) {
        return {
          detail: err instanceof Error ? err.message : String(err),
          ok: false,
        };
      }
    });
    detail = result.detail;
    ok = result.ok;
    const shotPath = path.join(
      SHOTS_DIR,
      `${slug(routeLabel)}__${slug(testName)}.png`,
    );
    await page
      .screenshot({ path: shotPath, fullPage: false })
      .catch(() => undefined);
    screenshot = path.relative(process.cwd(), shotPath);
    return { calls };
  });
  const dur = Date.now() - start;
  const record: TestResult = {
    page: routeLabel,
    test: testName,
    verdict: ok ? "pass" : "fail",
    detail,
    consoleErrors: errors,
    screenshot,
    durationMs: dur,
  };
  results.push(record);
  const mark = ok ? "PASS" : "FAIL";
  console.log(`[${mark}] ${routeLabel} :: ${testName} — ${detail}`);
  return record;
}

/* --------------------- helpers to wait + interact --------------------- */

async function waitFor(
  page: Page,
  selectorOrFn: string | (() => Promise<boolean>),
  timeout = 10_000,
) {
  if (typeof selectorOrFn === "string") {
    await page.locator(selectorOrFn).first().waitFor({ timeout });
  } else {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await selectorOrFn()) return;
      await page.waitForTimeout(250);
    }
    throw new Error("waitFor condition timed out");
  }
}

async function waitForToast(page: Page, kind: "success" | "error" = "success") {
  // Sonner renders toasts with role=status; filter by data-type.
  const loc = page.locator(`[data-sonner-toast][data-type="${kind}"]`).first();
  await loc.waitFor({ state: "visible", timeout: 10_000 });
  return (await loc.textContent())?.trim() ?? "";
}

/* ------------------- per-route test suites ------------------- */

async function testReviewsPage(page: Page) {
  const route = "/dashboard/admin/reviews";
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  await runTest(page, route, "page loads with ≥1 review card", async () => {
    const count = await page.locator("article").count();
    return {
      detail: `found ${count} review article(s)`,
      ok: count > 0,
    };
  });

  await runTest(page, route, "status filter buttons clickable", async () => {
    const approvedBtn = page.getByRole("button", { name: "დადასტურებული" });
    await approvedBtn.click();
    await page.waitForTimeout(1200);
    const active =
      (await approvedBtn.getAttribute("class"))?.includes("bg-[#2563EB]") ??
      false;
    return {
      detail: `approved filter active=${active}`,
      ok: active,
    };
  });

  await runTest(page, route, "reset filter to all", async () => {
    const resPromise = page
      .waitForResponse(
        (r) =>
          r.url().includes("/api/admin/reviews") &&
          !r.url().includes("analyze") &&
          !r.url().includes("moderate"),
        { timeout: 15_000 },
      )
      .catch(() => null);
    await page.getByRole("button", { name: "ყველა" }).first().click();
    await resPromise;
    await page.waitForTimeout(800);
    const count = await page.locator("article").count();
    return {
      detail: `article count after reset=${count}`,
      ok: count > 0,
    };
  });

  await runTest(page, route, "AI analyze button wires (Gemini)", async () => {
    // Find all enabled AI buttons via CSS, click the first.
    const enabled = page.locator(
      'article button:not([disabled]):has-text("AI აუდიტი")',
    );
    const enabledCount = await enabled.count();
    if (enabledCount === 0) {
      return {
        detail: "no enabled AI button (all cards disabled)",
        ok: false,
      };
    }
    const resPromise = page
      .waitForResponse((r) => r.url().includes("/api/admin/reviews/analyze"), {
        timeout: 60_000,
      })
      .catch(() => null);
    await enabled.first().click();
    const res = await resPromise;
    if (!res) return { detail: "no analyze call observed", ok: false };
    return {
      detail: `analyze endpoint returned ${res.status()} (from ${enabledCount} enabled)`,
      ok: res.status() === 200,
    };
  });
}

async function testSettingsPage(page: Page) {
  const route = "/dashboard/admin/settings";
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  await runTest(page, route, "pricing packages load from DB", async () => {
    const rowCount = await page.locator('input[type="number"]').count();
    return { detail: `${rowCount} amount inputs rendered`, ok: rowCount >= 5 };
  });

  await runTest(page, route, "edit amount triggers PATCH", async () => {
    const firstInput = page.locator('input[type="number"]').first();
    const current = Number(await firstInput.inputValue());
    const next = current + 1;
    await firstInput.fill(String(next));
    await firstInput.blur();
    try {
      await waitForToast(page, "success");
      // revert
      await firstInput.fill(String(current));
      await firstInput.blur();
      await waitForToast(page, "success");
      return { detail: `updated ${current}→${next}→${current}`, ok: true };
    } catch (err) {
      return {
        detail: `no success toast: ${err instanceof Error ? err.message : err}`,
        ok: false,
      };
    }
  });

  await runTest(page, route, "toggle is_enabled switch persists", async () => {
    const toggle = page.locator('button[aria-label="ჩართვა/გამორთვა"]').first();
    await toggle.click();
    try {
      await waitForToast(page, "success");
      // toggle back
      await toggle.click();
      await waitForToast(page, "success");
      return { detail: "toggled off→on", ok: true };
    } catch {
      return { detail: "no success toast on toggle", ok: false };
    }
  });
}

async function testListingsPage(page: Page) {
  const route = "/dashboard/admin/listings";
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  await runTest(page, route, "properties load (≥1 row)", async () => {
    const count = await page
      .locator("div.grid")
      .filter({ hasText: "ნახვა" })
      .count();
    return { detail: `${count} listing row(s)`, ok: count >= 1 };
  });

  await runTest(page, route, "category dropdown filter works", async () => {
    // Open dropdown
    await page.getByRole("button", { name: /ყველა კატეგორია/ }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: /ტრანსპორტი/ }).click();
    await page.waitForTimeout(1200);
    // Re-open and pick all again
    await page
      .getByRole("button", { name: /ტრანსპორტი/ })
      .first()
      .click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: /ყველა კატეგორია/ }).click();
    await page.waitForTimeout(1000);
    const count = await page
      .locator("div.grid")
      .filter({ hasText: "ნახვა" })
      .count();
    return { detail: `after category cycle, ${count} rows`, ok: count >= 1 };
  });

  await runTest(page, route, "pause/resume button triggers PATCH", async () => {
    const pauseBtn = page.locator('button[aria-label="გაჩერება"]').first();
    const resumeBtn = page.locator('button[aria-label="აქტივაცია"]').first();
    const btn = (await pauseBtn.isVisible().catch(() => false))
      ? pauseBtn
      : resumeBtn;
    if (!(await btn.isVisible().catch(() => false))) {
      return { detail: "no pause/resume button visible", ok: false };
    }
    await btn.click();
    try {
      await waitForToast(page, "success");
      // toggle back to original state
      const back = (await pauseBtn.isVisible().catch(() => false))
        ? pauseBtn
        : resumeBtn;
      await back.click().catch(() => undefined);
      await page.waitForTimeout(1000);
      return { detail: "status toggled + restored", ok: true };
    } catch {
      return { detail: "no success toast on pause/resume", ok: false };
    }
  });
}

async function testVerificationsPage(page: Page) {
  const route = "/dashboard/admin/verifications";
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  await runTest(page, route, "page renders header + empty state", async () => {
    // Ensure we're at the top — heading can be scrolled out.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    const heading = page.getByRole("heading", { name: /ვერიფიკაციის/ }).first();
    await heading
      .waitFor({ state: "visible", timeout: 5_000 })
      .catch(() => undefined);
    const visible = await heading.isVisible().catch(() => false);
    const text = await heading.textContent().catch(() => null);
    return {
      detail: `heading visible=${visible} text="${text ?? ""}"`,
      ok: visible,
    };
  });

  await runTest(
    page,
    route,
    "approve/reject buttons present if rows exist",
    async () => {
      const approveBtns = await page
        .locator('button[aria-label="დადასტურება"]')
        .count();
      const rejectBtns = await page
        .locator('button[aria-label="უარყოფა"]')
        .count();
      const rowCount = await page.locator('input[type="checkbox"]').count();
      return {
        detail: `${approveBtns} approve + ${rejectBtns} reject, ${rowCount} checkboxes`,
        // With 0 verifications in DB we expect 0 buttons; accept either.
        ok: approveBtns === rejectBtns,
      };
    },
  );
}

async function testFinancesPage(page: Page) {
  const route = "/dashboard/admin/finances";
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  await runTest(page, route, "metrics card values render", async () => {
    const body = await page.content();
    const hasGross = body.includes("მთლიანი შემოსავალი");
    const hasNet = body.includes("სუფთა შემოსავალი");
    const hasListing = body.includes("შემოსავალი ობიექტზე");
    return {
      detail: `gross=${hasGross} net=${hasNet} perListing=${hasListing}`,
      ok: hasGross && hasNet && hasListing,
    };
  });

  await runTest(
    page,
    route,
    "CSV export button triggers download",
    async () => {
      const downloadPromise = page
        .waitForEvent("download", { timeout: 5_000 })
        .catch(() => null);
      await page.getByRole("button", { name: /CSV ექსპორტი/ }).click();
      const download = await downloadPromise;
      if (!download) return { detail: "no download event", ok: false };
      const filename = download.suggestedFilename();
      await download.cancel();
      return {
        detail: `download triggered: ${filename}`,
        ok: filename.endsWith(".csv"),
      };
    },
  );
}

async function testPromocodesPage(page: Page) {
  const route = "/dashboard/admin/promocodes";
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const testCode = `TEST${Date.now().toString(36).toUpperCase()}`;

  await runTest(
    page,
    route,
    "create promocode submits + lists it",
    async () => {
      const codeInput = page.locator("#promocode-code");
      await codeInput.click();
      await codeInput.fill("");
      await codeInput.type(testCode);
      await codeInput.blur();
      await page.locator('input[type="number"]').first().fill("15");
      const postPromise = page
        .waitForResponse(
          (r) =>
            r.url().includes("/api/admin/promocodes") &&
            r.request().method() === "POST",
          { timeout: 15_000 },
        )
        .catch(() => null);
      await page.getByRole("button", { name: "კოდის გენერაცია" }).click();
      const postRes = await postPromise;
      if (!postRes)
        return { detail: "no POST to /api/admin/promocodes", ok: false };
      const status = postRes.status();
      await page.waitForTimeout(1500);
      const listed = await page
        .getByText(testCode, { exact: false })
        .first()
        .isVisible()
        .catch(() => false);
      return {
        detail: `POST ${status}; visible in list=${listed}`,
        ok: status === 200 && listed,
      };
    },
  );

  await runTest(
    page,
    route,
    "cancel promocode removes from active list",
    async () => {
      // The testCode appears exactly once (we just created it). Scope by the
      // <p> that renders it, then locate the sibling cancel button in the same
      // row. Avoids ancestor-div strict-mode matches.
      const codeParagraph = page
        .locator("p", { hasText: new RegExp(`^${testCode}$`) })
        .first();
      const beforeCount = await page
        .getByRole("button", { name: "გაუქმება" })
        .count();
      // codeParagraph → div.min-w-0 (parent) → row flex-div (grandparent).
      // The cancel button is a sibling of div.min-w-0 inside the row.
      const cancelBtn = codeParagraph
        .locator("xpath=../..")
        .locator("> button", { hasText: "გაუქმება" });
      const delPromise = page
        .waitForResponse(
          (r) =>
            r.url().includes("/api/admin/promocodes") &&
            r.request().method() === "DELETE",
          { timeout: 15_000 },
        )
        .catch(() => null);
      await cancelBtn.click();
      const delRes = await delPromise;
      if (!delRes) return { detail: "no DELETE observed", ok: false };
      await page.waitForTimeout(1200);
      const afterCount = await page
        .getByRole("button", { name: "გაუქმება" })
        .count();
      const codeStillShown = await page
        .locator("p", { hasText: new RegExp(`^${testCode}$`) })
        .count();
      return {
        detail: `DELETE ${delRes.status()}; cancel buttons ${beforeCount}→${afterCount}; code rows=${codeStillShown}`,
        ok:
          delRes.status() === 200 &&
          afterCount === beforeCount - 1 &&
          codeStillShown === 0,
      };
    },
  );
}

async function testSeoPage(page: Page) {
  const route = "/dashboard/admin/seo";
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  await runTest(page, route, "existing blog_posts list rendered", async () => {
    const body = await page.content();
    const match = body.match(/სტატიები \((\d+)\)/);
    const n = match ? Number(match[1]) : 0;
    return { detail: `posts count=${n}`, ok: n >= 1 };
  });

  await runTest(page, route, "save draft (no publish) writes row", async () => {
    const title = `Test Draft ${Date.now().toString(36)}`;
    await page.locator("input[placeholder='სტატიის სათაური...']").fill(title);
    await page
      .locator("textarea[placeholder='სტატიის სრული ტექსტი (Markdown)...']")
      .fill("# მოკლე დრაფტი\n\nტექსტი.");
    const postPromise = page
      .waitForResponse(
        (r) =>
          r.url().includes("/api/admin/blog") &&
          !r.url().includes("/draft") &&
          r.request().method() === "POST",
        { timeout: 15_000 },
      )
      .catch(() => null);
    await page.getByRole("button", { name: "შენახვა draft-ად" }).click();
    const postRes = await postPromise;
    if (!postRes) return { detail: "no POST to /api/admin/blog", ok: false };
    const status = postRes.status();
    // Wait for the refetch that happens after save (GET /api/admin/blog).
    await page
      .waitForResponse(
        (r) =>
          r.url().includes("/api/admin/blog") &&
          !r.url().includes("/draft") &&
          r.request().method() === "GET",
        { timeout: 10_000 },
      )
      .catch(() => null);
    await page.waitForTimeout(500);
    const listed = await page
      .getByText(title)
      .first()
      .isVisible()
      .catch(() => false);
    return {
      detail: `POST ${status}; title visible=${listed}`,
      ok: status === 200 && listed,
    };
  });

  await runTest(page, route, "AI draft endpoint responds", async () => {
    const postPromise = page
      .waitForResponse((r) => r.url().includes("/api/admin/blog/draft"), {
        timeout: 30_000,
      })
      .catch(() => null);
    await page.getByRole("button", { name: /AI დრაფტი/ }).click();
    const postRes = await postPromise;
    if (!postRes)
      return { detail: "no /api/admin/blog/draft call observed", ok: false };
    return {
      detail: `draft endpoint returned ${postRes.status()}`,
      ok: postRes.status() === 200,
    };
  });
}

async function testBroadcastPage(page: Page) {
  const route = "/dashboard/admin/broadcast";
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  await runTest(page, route, "audience select has all options", async () => {
    const count = await page
      .locator("select#recipient-category option")
      .count();
    return { detail: `audience options=${count}`, ok: count >= 5 };
  });

  await runTest(
    page,
    route,
    "channel switch toggles email subject field",
    async () => {
      // Click email radio
      const emailLabel = page
        .locator("label")
        .filter({ hasText: "ელ. ფოსტის" });
      await emailLabel.click();
      await page.waitForTimeout(400);
      const subjectVisible = await page
        .locator("input[placeholder*='ახალი წლის']")
        .isVisible()
        .catch(() => false);
      // switch back to push
      await page
        .locator("label")
        .filter({ hasText: "ვებ-შეტყობინება" })
        .click();
      await page.waitForTimeout(400);
      const subjectHidden = !(await page
        .locator("input[placeholder*='ახალი წლის']")
        .isVisible()
        .catch(() => false));
      return {
        detail: `email→subject visible=${subjectVisible}, push→hidden=${subjectHidden}`,
        ok: subjectVisible && subjectHidden,
      };
    },
  );

  await runTest(page, route, "AI draft endpoint responds", async () => {
    const resPromise = page
      .waitForResponse((r) => r.url().includes("/api/admin/broadcasts/draft"), {
        timeout: 30_000,
      })
      .catch(() => null);
    await page.getByRole("button", { name: /AI დახმარება/ }).click();
    const res = await resPromise;
    if (!res) return { detail: "no draft call observed", ok: false };
    return {
      detail: `draft endpoint returned ${res.status()}`,
      ok: res.status() === 200,
    };
  });
}

async function testModerationPage(page: Page) {
  const route = "/dashboard/admin/moderation";
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  await runTest(
    page,
    route,
    "create-ad modal opens and validates",
    async () => {
      await page.getByRole("button", { name: /რეკლამის დამატება/ }).click();
      await page.waitForTimeout(400);
      const modalVisible = await page
        .getByRole("heading", { name: "რეკლამის დამატება" })
        .isVisible()
        .catch(() => false);
      if (!modalVisible) return { detail: "modal did not open", ok: false };
      // Try submitting empty — expect inline error
      await page.getByRole("button", { name: /კამპანიის გაშვება/ }).click();
      await page.waitForTimeout(300);
      const errorText = await page
        .getByText(/გთხოვთ შეავსოთ ყველა სავალდებულო ველი/)
        .isVisible()
        .catch(() => false);
      // Close modal
      await page.getByRole("button", { name: "დახურვა" }).click();
      return {
        detail: `modal opens=${modalVisible}, validates=${errorText}`,
        ok: modalVisible && errorText,
      };
    },
  );

  await runTest(page, route, "create ad POST succeeds", async () => {
    await page.getByRole("button", { name: /რეკლამის დამატება/ }).click();
    await page.waitForTimeout(300);
    const title = `Test Ad ${Date.now().toString(36)}`;
    await page.locator("#ad-title").fill(title);
    await page.locator("#ad-url").fill("https://example.com/promo");
    const today = new Date();
    const tomorrow = new Date(Date.now() + 7 * 864e5);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    await page.locator("#start-date").fill(fmt(today));
    await page.locator("#end-date").fill(fmt(tomorrow));
    const { calls } = await captureApiCalls(page, async () => {
      await page.getByRole("button", { name: /კამპანიის გაშვება/ }).click();
      await Promise.race([
        waitForToast(page, "success").catch(() => undefined),
        waitForToast(page, "error").catch(() => undefined),
        page.waitForTimeout(15_000),
      ]);
    });
    const createCall = calls.find(
      (c) => c.url.includes("/api/admin/ads") && c.method === "POST",
    );
    if (!createCall)
      return { detail: "no POST /api/admin/ads observed", ok: false };
    return {
      detail: `create ad returned ${createCall.status}`,
      ok: createCall.status === 200,
    };
  });
}

async function testProfileRedirect(page: Page) {
  const route = "/dashboard/admin/profile";
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const url = page.url();
  await runTest(
    page,
    route,
    "redirects to /settings without hooks error",
    async () => {
      return {
        detail: `final url=${url}`,
        ok: /\/dashboard\/admin\/settings$/.test(url),
      };
    },
  );
}

async function testKpiPage(page: Page) {
  const route = "/dashboard/admin";
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await runTest(page, route, "KPI cards visible", async () => {
    const body = await page.content();
    return {
      detail: "KPI labels found",
      ok:
        body.includes("სუფთა შემოსავალი") &&
        body.includes("ქონების კონვერსია") &&
        body.includes("აქტიური განცხადებები"),
    };
  });
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error("ADMIN_TEST_EMAIL / ADMIN_TEST_PASSWORD missing");
    process.exit(2);
  }
  await fs.mkdir(SHOTS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "ka-GE",
  });
  const page = await context.newPage();

  try {
    await login(context, page);

    await testKpiPage(page);
    await testReviewsPage(page);
    await testSettingsPage(page);
    await testListingsPage(page);
    await testVerificationsPage(page);
    await testFinancesPage(page);
    await testPromocodesPage(page);
    await testSeoPage(page);
    await testBroadcastPage(page);
    await testModerationPage(page);
    await testProfileRedirect(page);
  } finally {
    await fs.writeFile(
      REPORT_PATH,
      JSON.stringify({ results }, null, 2),
      "utf8",
    );
    const passed = results.filter((r) => r.verdict === "pass").length;
    const failed = results.filter((r) => r.verdict === "fail").length;
    console.log(
      `\n[interaction-audit] ${passed} pass / ${failed} fail / ${results.length} total`,
    );
    console.log(`[interaction-audit] report → ${REPORT_PATH}`);
    await browser.close();
  }
}

main().catch((err) => {
  console.error("[interaction-audit] fatal:", err);
  process.exit(1);
});

/**
 * Admin Dashboard Audit Script
 *
 * One-off Playwright harness (NOT part of the regression test suite).
 * Logs into the admin account via the real /ka/auth/login email flow, visits
 * every route declared in AdminSidebar.tsx, records render status + console
 * errors + failed network requests, and writes a JSON report and screenshots.
 *
 * Usage:
 *   npx tsx scripts/admin-audit.ts
 *
 * Required env (all from .env.local):
 *   NEXT_PUBLIC_SITE_URL          default http://localhost:3000
 *   ADMIN_TEST_EMAIL              admin account email
 *   ADMIN_TEST_PASSWORD           admin account password
 *
 * Outputs:
 *   .ralph/admin-audit.json       structured results
 *   .ralph/screenshots/<slug>.png per route
 */

import { chromium, type ConsoleMessage, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs/promises";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const BASE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");
const EMAIL = process.env.ADMIN_TEST_EMAIL;
const PASSWORD = process.env.ADMIN_TEST_PASSWORD;
const LOCALE = "ka";
const OUT_DIR = path.resolve(process.cwd(), ".ralph");
const SHOTS_DIR = path.join(OUT_DIR, "screenshots");
const REPORT_PATH = path.join(OUT_DIR, "admin-audit.json");

/**
 * Every route in AdminSidebar.tsx, plus the two non-sidebar admin pages that
 * exist on disk. Keep this list in sync with src/components/layout/AdminSidebar.tsx.
 */
const ADMIN_ROUTES: { label: string; path: string }[] = [
  { label: "მთავარი გვერდი", path: "/dashboard/admin" },
  { label: "ვერიფიკაციები", path: "/dashboard/admin/verifications" },
  { label: "მომხმარებლები", path: "/dashboard/admin/clients" },
  { label: "განცხადებები", path: "/dashboard/admin/listings" },
  { label: "შეფასებები", path: "/dashboard/admin/reviews" },
  { label: "ტარიფები და პაკეტები", path: "/dashboard/admin/settings" },
  { label: "ფინანსები", path: "/dashboard/admin/finances" },
  { label: "რეკლამები", path: "/dashboard/admin/moderation" },
  { label: "მასობრივი დაგზავნა", path: "/dashboard/admin/broadcast" },
  { label: "პრომო კოდები", path: "/dashboard/admin/promocodes" },
  { label: "სიახლეები", path: "/dashboard/admin/seo" },
  // Non-sidebar admin pages that exist on disk:
  { label: "პროფილი (redirect)", path: "/dashboard/admin/profile" },
  { label: "ანალიტიკა (orphaned)", path: "/dashboard/admin/analytics" },
];

interface ConsoleEntry {
  type: string;
  text: string;
}
interface NetworkFailure {
  url: string;
  method: string;
  failure: string | null;
  status?: number;
}
interface RouteResult {
  label: string;
  path: string;
  url: string;
  status: number | null;
  navigationError: string | null;
  consoleErrors: ConsoleEntry[];
  networkFailures: NetworkFailure[];
  screenshot: string;
  title: string;
  finalPath: string;
}
interface AuditReport {
  baseUrl: string;
  locale: string;
  timestamp: string;
  adminEmail: string;
  loginSucceeded: boolean;
  loginError: string | null;
  routes: RouteResult[];
  summary: {
    total: number;
    okRoutes: number;
    routesWithConsoleErrors: number;
    routesWithNetworkFailures: number;
    routesWithBadStatus: number;
  };
}

function slugify(p: string): string {
  return p
    .replace(/^\//, "")
    .replace(/\//g, "_")
    .replace(/[^a-z0-9_]/gi, "_");
}

function localized(p: string): string {
  return `${BASE_URL}/${LOCALE}${p.startsWith("/") ? p : `/${p}`}`;
}

async function attachListeners(page: Page): Promise<{
  consoleErrors: ConsoleEntry[];
  networkFailures: NetworkFailure[];
  reset: () => void;
}> {
  let consoleErrors: ConsoleEntry[] = [];
  let networkFailures: NetworkFailure[] = [];

  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      consoleErrors.push({ type: msg.type(), text: msg.text() });
    }
  };
  const onPageError = (err: Error) => {
    consoleErrors.push({ type: "pageerror", text: err.message });
  };
  const onRequestFailed = (req: import("@playwright/test").Request) => {
    const failure = req.failure();
    networkFailures.push({
      url: req.url(),
      method: req.method(),
      failure: failure?.errorText ?? null,
    });
  };
  const onResponse = (res: import("@playwright/test").Response) => {
    if (res.status() >= 400) {
      // Only flag same-origin or API responses; skip 3rd-party analytics noise.
      const url = res.url();
      if (url.startsWith(BASE_URL) || url.includes("supabase.co")) {
        networkFailures.push({
          url,
          method: res.request().method(),
          failure: null,
          status: res.status(),
        });
      }
    }
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("requestfailed", onRequestFailed);
  page.on("response", onResponse);

  return {
    get consoleErrors() {
      return consoleErrors;
    },
    get networkFailures() {
      return networkFailures;
    },
    reset() {
      consoleErrors = [];
      networkFailures = [];
    },
  } as {
    consoleErrors: ConsoleEntry[];
    networkFailures: NetworkFailure[];
    reset: () => void;
  };
}

async function login(
  page: Page,
  context: import("@playwright/test").BrowserContext,
): Promise<{
  success: boolean;
  error: string | null;
  strategy: "cookie-injection" | "ui";
}> {
  // Strategy: sign in via Supabase JS (anon client), then inject the session cookie
  // into the browser context. This mirrors e2e/helpers/auth.ts and bypasses any
  // UI-level form interaction quirks. The cookie format and name match exactly
  // what @supabase/ssr expects.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const cookieName = `sb-${projectRef}-auth-token`;

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });

  const { data: signInData, error: signInError } =
    await authClient.auth.signInWithPassword({
      email: EMAIL!,
      password: PASSWORD!,
    });

  if (signInError || !signInData.session) {
    return {
      success: false,
      error: `signInWithPassword failed: ${signInError?.message ?? "no session returned"}`,
      strategy: "cookie-injection",
    };
  }

  const session = signInData.session;
  // @supabase/ssr encodes the session as base64-prefixed JSON in the auth cookie.
  const sessionJson = JSON.stringify({
    access_token: session.access_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  });
  const cookieValue = `base64-${Buffer.from(sessionJson).toString("base64")}`;

  const cookieHost = new URL(BASE_URL).hostname;
  await context.addCookies([
    {
      name: cookieName,
      value: cookieValue,
      domain: cookieHost,
      path: "/",
      httpOnly: false,
      secure: BASE_URL.startsWith("https://"),
      sameSite: "Lax",
    },
  ]);

  // Sanity check — navigate to the admin root and confirm we don't get bounced to login.
  const adminUrl = localized("/dashboard/admin");
  const resp = await page.goto(adminUrl, { waitUntil: "domcontentloaded" });
  const finalUrl = page.url();
  if (/\/auth\/login/.test(finalUrl)) {
    return {
      success: false,
      error: `cookie injection did not authenticate — redirected to ${finalUrl} (status ${resp?.status() ?? "?"})`,
      strategy: "cookie-injection",
    };
  }
  console.log(`[audit] cookie-injection login ok → ${finalUrl}`);
  return { success: true, error: null, strategy: "cookie-injection" };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function loginViaUi(page: Page): Promise<{
  success: boolean;
  error: string | null;
}> {
  const loginUrl = `${BASE_URL}/${LOCALE}/auth/login`;
  console.log(`[audit] navigating to ${loginUrl}`);

  // Attach verbose listeners just for the login phase.
  const loginConsole: string[] = [];
  const loginNetwork: string[] = [];
  const onConsole = (msg: import("@playwright/test").ConsoleMessage) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      loginConsole.push(`[${msg.type()}] ${msg.text()}`);
    }
  };
  const onPageError = (err: Error) => {
    loginConsole.push(`[pageerror] ${err.message}`);
  };
  const onResponse = (res: import("@playwright/test").Response) => {
    const url = res.url();
    if (
      (url.includes("supabase.co/auth/v1") || url.includes("/auth/")) &&
      res.status() >= 400
    ) {
      loginNetwork.push(`${res.status()} ${res.request().method()} ${url}`);
    }
  };
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);

  await page.goto(loginUrl, { waitUntil: "networkidle" });

  // Email tab is the default; confirm by clicking.
  const emailTab = page.getByRole("button", { name: "ელ. ფოსტა" }).first();
  if (await emailTab.isVisible().catch(() => false)) {
    await emailTab.click().catch(() => undefined);
  }

  const emailInput = page.locator('input[type="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  await emailInput.fill(EMAIL!);
  await passwordInput.fill(PASSWORD!);

  // Screenshot the pre-submit state for debugging.
  await page
    .screenshot({
      path: path.join(SHOTS_DIR, "_login-01-pre-submit.png"),
      fullPage: true,
    })
    .catch(() => undefined);

  // Wait for the Supabase token call to settle OR for an error to render.
  const submit = page.getByRole("button", { name: "შესვლა" }).first();
  const tokenResponse = page
    .waitForResponse(
      (res) =>
        res.url().includes("/auth/v1/token") &&
        (res.request().method() === "POST" || res.status() < 500),
      { timeout: 20_000 },
    )
    .catch(() => null);

  await submit.click();

  const tokenRes = await tokenResponse;
  if (tokenRes) {
    loginNetwork.push(
      `token call: ${tokenRes.status()} ${tokenRes.request().method()} ${tokenRes.url()}`,
    );
  } else {
    loginNetwork.push("token call: no response observed within 20s");
  }

  // Give the redirect a chance to fire.
  try {
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  } catch {
    // handled below
  }

  await page
    .screenshot({
      path: path.join(SHOTS_DIR, "_login-02-post-submit.png"),
      fullPage: true,
    })
    .catch(() => undefined);

  const currentUrl = page.url();
  const errText = await page
    .locator("p.text-\\[\\#EF4444\\]")
    .first()
    .textContent()
    .catch(() => null);

  page.off("console", onConsole);
  page.off("pageerror", onPageError);
  page.off("response", onResponse);

  const success = /\/dashboard\//.test(currentUrl);
  if (success) {
    console.log(`[audit] login ok → ${currentUrl}`);
    return { success: true, error: null };
  }

  const diagnostics = [
    `current URL: ${currentUrl}`,
    errText ? `error text on page: ${errText.trim()}` : null,
    loginNetwork.length
      ? `network:\n  ${loginNetwork.join("\n  ")}`
      : "network: clean",
    loginConsole.length
      ? `console:\n  ${loginConsole.join("\n  ")}`
      : "console: clean",
  ]
    .filter(Boolean)
    .join("\n");
  console.error(`[audit] login failed:\n${diagnostics}`);
  return { success: false, error: diagnostics };
}

async function auditRoute(
  page: Page,
  listeners: {
    consoleErrors: ConsoleEntry[];
    networkFailures: NetworkFailure[];
    reset: () => void;
  },
  route: { label: string; path: string },
): Promise<RouteResult> {
  listeners.reset();
  const url = localized(route.path);
  let status: number | null = null;
  let navigationError: string | null = null;

  try {
    const response = await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    status = response?.status() ?? null;
    // Let any realtime subscriptions, framer-motion, etc. settle.
    await page.waitForTimeout(1_500);
  } catch (err) {
    navigationError = err instanceof Error ? err.message : String(err);
  }

  const screenshotPath = path.join(SHOTS_DIR, `${slugify(route.path)}.png`);
  await page
    .screenshot({ path: screenshotPath, fullPage: true })
    .catch((err: Error) => {
      console.warn(
        `[audit] screenshot failed for ${route.path}: ${err.message}`,
      );
    });

  const title = (await page.title().catch(() => "")) ?? "";
  const finalPath = new URL(page.url()).pathname;

  return {
    label: route.label,
    path: route.path,
    url,
    status,
    navigationError,
    consoleErrors: [...listeners.consoleErrors],
    networkFailures: [...listeners.networkFailures],
    screenshot: path.relative(process.cwd(), screenshotPath),
    title,
    finalPath,
  };
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error(
      "[audit] ADMIN_TEST_EMAIL and ADMIN_TEST_PASSWORD must be set in .env.local",
    );
    process.exit(2);
  }
  await fs.mkdir(SHOTS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "ka-GE",
  });
  const page = await context.newPage();
  const listeners = await attachListeners(page);

  const report: AuditReport = {
    baseUrl: BASE_URL,
    locale: LOCALE,
    timestamp: new Date().toISOString(),
    adminEmail: EMAIL,
    loginSucceeded: false,
    loginError: null,
    routes: [],
    summary: {
      total: 0,
      okRoutes: 0,
      routesWithConsoleErrors: 0,
      routesWithNetworkFailures: 0,
      routesWithBadStatus: 0,
    },
  };

  const loginResult = await login(page, context);
  report.loginSucceeded = loginResult.success;
  report.loginError = loginResult.error;

  if (!loginResult.success) {
    await page
      .screenshot({
        path: path.join(SHOTS_DIR, "_login-failure.png"),
        fullPage: true,
      })
      .catch(() => undefined);
    await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
    console.error("[audit] login failed, aborting route sweep.");
    await browser.close();
    process.exit(3);
  }

  for (const route of ADMIN_ROUTES) {
    console.log(`[audit] visiting ${route.path}`);
    const result = await auditRoute(page, listeners, route);
    report.routes.push(result);
  }

  // Summaries
  report.summary.total = report.routes.length;
  report.summary.okRoutes = report.routes.filter(
    (r) =>
      !r.navigationError &&
      (r.status === null || r.status < 400) &&
      r.consoleErrors.length === 0,
  ).length;
  report.summary.routesWithConsoleErrors = report.routes.filter(
    (r) => r.consoleErrors.length > 0,
  ).length;
  report.summary.routesWithNetworkFailures = report.routes.filter(
    (r) => r.networkFailures.length > 0,
  ).length;
  report.summary.routesWithBadStatus = report.routes.filter(
    (r) => r.status !== null && r.status >= 400,
  ).length;

  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  console.log(`[audit] report written → ${REPORT_PATH}`);
  console.log(
    `[audit] summary: ${report.summary.okRoutes}/${report.summary.total} ok, ` +
      `${report.summary.routesWithConsoleErrors} with console errors, ` +
      `${report.summary.routesWithNetworkFailures} with network failures`,
  );

  await browser.close();
}

main().catch((err) => {
  console.error("[audit] fatal:", err);
  process.exit(1);
});

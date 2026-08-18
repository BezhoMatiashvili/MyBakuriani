// Read-only authenticated responsive audit for the dedicated production QA
// accounts. This script obtains the same Supabase session used by the UI, then
// only navigates to dashboard pages and inspects rendered controls. It never
// clicks dashboard actions or submits dashboard forms.

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";

dotenv.config({ path: ".env.local", quiet: true });

const BASE_URL = process.env.MOBILE_AUDIT_BASE_URL ?? "http://localhost:3000";
const QA_PASSWORD = process.env.QA_TEST_PASSWORD;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const OUT_PATH =
  process.env.MOBILE_AUDIT_OUT ?? "/tmp/mybakuriani-dashboard-parity.json";

const QA_EMAILS = {
  admin: "qa-admin@qa.mybakuriani.test",
  guest: "qa-guest@qa.mybakuriani.test",
  renter: "qa-renter@qa.mybakuriani.test",
  seller: "qa-seller@qa.mybakuriani.test",
  cleaner: "qa-cleaner@qa.mybakuriani.test",
  food: "qa-food@qa.mybakuriani.test",
  entertainment: "qa-entertainment@qa.mybakuriani.test",
  transport: "qa-transport@qa.mybakuriani.test",
  employment: "qa-employment@qa.mybakuriani.test",
};

if (!QA_PASSWORD) throw new Error("QA_TEST_PASSWORD is required");
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and anon key are required");
}
const base = new URL(BASE_URL);
if (!["localhost", "127.0.0.1"].includes(base.hostname)) {
  throw new Error("The read-only dashboard audit must target a local app server");
}

async function discoverRoutes() {
  const root = path.join(process.cwd(), "src/app/[locale]/dashboard");
  const routes = [];

  async function walk(directory, segments = []) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name.startsWith("[")) continue;
        await walk(path.join(directory, entry.name), [...segments, entry.name]);
      } else if (entry.name === "page.tsx" && segments.length > 0) {
        const role = segments[0];
        if (role in QA_EMAILS) {
          routes.push({ role, path: `/dashboard/${segments.join("/")}` });
        }
      }
    }
  }

  await walk(root);
  return routes.sort((a, b) => a.path.localeCompare(b.path));
}

async function inspectPage(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    };

    const controlKey = (element) => {
      const tag = element.tagName.toLowerCase();
      const role = element.getAttribute("role") || tag;
      const name = (
        element.getAttribute("aria-label") ||
        element.getAttribute("title") ||
        element.getAttribute("placeholder") ||
        element.textContent ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100);
      let href = "";
      if (element instanceof HTMLAnchorElement && element.href) {
        const url = new URL(element.href);
        href = url.origin === location.origin ? url.pathname : url.origin;
      }
      return `${role}|${name}|${href}`;
    };

    const controls = Array.from(
      document.querySelectorAll(
        "main a, main button, main input, main select, main textarea, main [role='button']",
      ),
    ).filter(visible);
    const smallTouchTargets = controls
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          key: controlKey(element),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })
      .filter(({ width, height }) => width < 44 || height < 44);

    return {
      pathname: location.pathname,
      overflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
      overflowAmount:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      headings: Array.from(document.querySelectorAll("main h1, main h2"))
        .filter(visible)
        .map((element) => element.textContent?.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 10),
      controls: [...new Set(controls.map(controlKey).filter((key) => !key.endsWith("||")))],
      smallTouchTargets,
    };
  });
}

async function login(context, role) {
  const auth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await auth.auth.signInWithPassword({
    email: QA_EMAILS[role],
    password: QA_PASSWORD,
  });
  if (error || !data.session) {
    throw new Error(error?.message ?? "No QA session returned");
  }
  const session = data.session;
  const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
  const value =
    "base64-" +
    Buffer.from(
      JSON.stringify({
        access_token: session.access_token,
        token_type: session.token_type,
        expires_in: session.expires_in,
        expires_at: session.expires_at,
        refresh_token: session.refresh_token,
        user: session.user,
      }),
      "utf8",
    ).toString("base64url");
  await context.addCookies([
    { url: BASE_URL, name: `sb-${projectRef}-auth-token`, value },
  ]);
  return `/dashboard/${role}`;
}

async function inspectRoute(context, route) {
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 200));
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error).slice(0, 200)));

  const widths = [
    { name: "mobile", width: 390, height: 844 },
    { name: "desktop", width: 1440, height: 900 },
  ];
  const views = {};

  for (const viewport of widths) {
    await page.setViewportSize(viewport);
    const response = await page.goto(`${BASE_URL}${route.path}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(1_000);
    views[viewport.name] = {
      httpStatus: response?.status() ?? null,
      ...(await inspectPage(page)),
    };
  }

  const mobileControls = new Set(views.mobile.controls);
  const desktopOnlyControls = views.desktop.controls.filter(
    (control) => !mobileControls.has(control),
  );
  await page.close();
  return {
    ...route,
    views,
    desktopOnlyControls,
    consoleErrors: [...new Set(consoleErrors)],
  };
}

async function main() {
  const browser = await chromium.launch();
  const routes = await discoverRoutes();
  const results = [];

  for (const role of Object.keys(QA_EMAILS)) {
    const roleRoutes = routes.filter((route) => route.role === role);
    if (roleRoutes.length === 0) continue;
    const context = await browser.newContext({ locale: "en-US" });
    let loginPath;
    try {
      loginPath = await login(context, role);
    } catch (error) {
      console.log(`${role}: login failed (${String(error)})`);
      results.push({ role, loginError: String(error) });
      await context.close();
      continue;
    }
    console.log(`${role}: ${loginPath} (${roleRoutes.length} routes)`);
    if (loginPath.includes("/auth/mfa")) {
      results.push({ role, loginPath, mfaRequired: true });
      await context.close();
      continue;
    }
    for (const route of roleRoutes) {
      console.log(`  ${route.path}`);
      results.push(await inspectRoute(context, route));
    }
    await context.close();
  }

  await browser.close();
  await writeFile(
    OUT_PATH,
    JSON.stringify(
      { baseUrl: BASE_URL, generatedAt: new Date().toISOString(), results },
      null,
      2,
    ),
  );
  console.log(`Report: ${OUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

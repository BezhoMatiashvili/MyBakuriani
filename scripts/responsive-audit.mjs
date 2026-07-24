// Standalone responsive-UI audit script (NOT part of the e2e/ CI suite).
// Drives real headless Chromium against an explicitly configured isolated
// test/preview URL, captures full-page screenshots at a matrix of viewports for
// every route, composes them into per-route contact sheets, and records
// cheap diagnostics (horizontal overflow, undersized touch targets, console
// errors) into a JSON report.
//
// Usage:
//   E2E_BASE_URL=https://preview.example TEST_SUPABASE_URL=https://test.supabase.co \
//   TEST_SUPABASE_ANON_KEY=... TEST_QA_PASSWORD=... \
//   node scripts/responsive-audit.mjs [--base-url=https://...] [--routes=public|dashboard|all] [--out=DIR] [--filter=substring]

import { chromium } from "playwright";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.join("=") || true];
  }),
);

const OUT_DIR = args.out || "responsive-audit";
const ROUTE_FILTER = args.filter || null;
const ROUTE_SET = args.routes || "all"; // public | dashboard | all
const CONCURRENCY = Number(args.concurrency || 4);

const PRODUCTION_HOSTS = new Set([
  "mybakuriani.ge",
  "www.mybakuriani.ge",
  "my-bakuriani.vercel.app",
]);
const PRODUCTION_PROJECT_REFS = new Set(["yuwyrmxccrpfjvidwhhg"]);

function requireTestEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Responsive audit requires ${name}`);
  return value;
}

function assertSafeTestUrl(value, name, supabase = false) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  const host = url.hostname.toLowerCase();
  if (PRODUCTION_HOSTS.has(host) || host.endsWith(".mybakuriani.ge")) {
    throw new Error(`${name} points at a production domain`);
  }
  if (supabase && PRODUCTION_PROJECT_REFS.has(host.split(".")[0])) {
    throw new Error(`${name} points at the production Supabase project`);
  }
}

const BASE_URL = args["base-url"] || requireTestEnv("E2E_BASE_URL");
const SUPABASE_URL = requireTestEnv("TEST_SUPABASE_URL");
const SUPABASE_ANON_KEY = requireTestEnv("TEST_SUPABASE_ANON_KEY");
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const QA_PASSWORD =
  ROUTE_SET === "public" ? null : requireTestEnv("TEST_QA_PASSWORD");
assertSafeTestUrl(BASE_URL, "E2E_BASE_URL");
assertSafeTestUrl(SUPABASE_URL, "TEST_SUPABASE_URL", true);
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

// QA seed IDs (see RESPONSIVE_UI_REVIEW.md methodology section)
const QA = {
  apartment: "facade00-1001-4000-a000-000000000001",
  hotel: "facade00-1002-4000-a000-000000000002",
  sale: "facade00-1003-4000-a000-000000000003",
  food: "facade00-2001-4000-a000-000000000001",
  transport: "facade00-2002-4000-a000-000000000002",
  entertainment: "facade00-2003-4000-a000-000000000003",
  employment: "facade00-2004-4000-a000-000000000004",
  cleaning: "facade00-2005-4000-a000-000000000005",
  booking: "facade00-3001-4000-a000-000000000001",
  admin: "facade00-0001-4000-a000-000000000001",
  guest: "facade00-0002-4000-a000-000000000002",
  renter: "facade00-0003-4000-a000-000000000003",
  seller: "facade00-0004-4000-a000-000000000004",
  cleaner: "facade00-0005-4000-a000-000000000005",
};

const VIEWPORTS_FULL = [
  { name: "mobile-xs", width: 320, height: 568 },
  { name: "mobile-s", width: 375, height: 812 },
  { name: "mobile-m", width: 390, height: 844 },
  { name: "mobile-l", width: 428, height: 926 },
  { name: "tablet-p", width: 768, height: 1024 },
  { name: "tablet-l", width: 1024, height: 768 },
  { name: "laptop", width: 1440, height: 900 },
  { name: "desktop", width: 1920, height: 1080 },
];

const VIEWPORTS_CORE = [
  { name: "mobile-xs", width: 320, height: 568 },
  { name: "mobile-s", width: 375, height: 812 },
  { name: "mobile-m", width: 390, height: 844 },
  { name: "mobile-l", width: 428, height: 926 },
  { name: "tablet-p", width: 768, height: 1024 },
  { name: "tablet-l", width: 1024, height: 768 },
  { name: "laptop", width: 1440, height: 900 },
  { name: "desktop", width: 1920, height: 1080 },
];

// ---------------------------------------------------------------------------
// Route inventory
// ---------------------------------------------------------------------------
const PUBLIC_ROUTES = [
  { path: "/", label: "landing" },
  { path: "/apartments", label: "apartments-list" },
  { path: `/apartments/${QA.apartment}`, label: "apartments-detail" },
  { path: "/appartments", label: "appartments-typo-route" },
  { path: "/hotels", label: "hotels-list" },
  { path: `/hotels/${QA.hotel}`, label: "hotels-detail" },
  { path: "/sales", label: "sales-list" },
  { path: "/sales/all", label: "sales-all" },
  { path: `/sales/${QA.sale}`, label: "sales-detail" },
  { path: "/food", label: "food-list" },
  { path: `/food/${QA.food}`, label: "food-detail" },
  { path: "/services", label: "services-list" },
  { path: `/services/${QA.cleaning}`, label: "services-detail" },
  { path: "/entertainment", label: "entertainment-list" },
  { path: `/entertainment/${QA.entertainment}`, label: "entertainment-detail" },
  { path: "/transport", label: "transport-list" },
  { path: `/transport/${QA.transport}`, label: "transport-detail" },
  { path: "/employment", label: "employment-list" },
  { path: `/employment/${QA.employment}`, label: "employment-detail" },
  { path: "/blog", label: "blog-list" },
  ...(process.env.AUDIT_BLOG_ID
    ? [{ path: `/blog/${process.env.AUDIT_BLOG_ID}`, label: "blog-detail" }]
    : []),
  { path: "/faq", label: "faq" },
  { path: "/contact", label: "contact" },
  { path: "/terms", label: "terms" },
  { path: "/privacy", label: "privacy" },
  { path: "/search", label: "search" },
  {
    path: "/search?q=%E1%83%91%E1%83%90%E1%83%99%E1%83%A3%E1%83%A0%E1%83%98%E1%83%90%E1%83%9C%E1%83%98",
    label: "search-query",
  },
  { path: "/auth/login", label: "auth-login" },
  { path: "/auth/register", label: "auth-register" },
  { path: "/auth/mfa", label: "auth-mfa" },
  { path: "/checkout", label: "checkout-no-params" },
  { path: "/nonexistent-page-xyz", label: "404" },
];

const DASHBOARD_ROUTES = [
  // guest
  { path: "/dashboard/guest", label: "guest-home", role: "guest" },
  { path: "/dashboard/guest/bookings", label: "guest-bookings", role: "guest" },
  {
    path: "/dashboard/guest/favorites",
    label: "guest-favorites",
    role: "guest",
  },
  { path: "/dashboard/guest/profile", label: "guest-profile", role: "guest" },
  { path: "/dashboard/guest/reviews", label: "guest-reviews", role: "guest" },
  {
    path: `/dashboard/guest/rate/${QA.booking}`,
    label: "guest-rate-booking",
    role: "guest",
  },
  // renter
  { path: "/dashboard/renter", label: "renter-home", role: "renter" },
  {
    path: "/dashboard/renter/balance",
    label: "renter-balance",
    role: "renter",
  },
  {
    path: "/dashboard/renter/calendar",
    label: "renter-calendar",
    role: "renter",
  },
  {
    path: "/dashboard/renter/cleaners",
    label: "renter-cleaners",
    role: "renter",
  },
  { path: "/dashboard/renter/guests", label: "renter-guests", role: "renter" },
  {
    path: "/dashboard/renter/listings",
    label: "renter-listings",
    role: "renter",
  },
  {
    path: "/dashboard/renter/notifications",
    label: "renter-notifications",
    role: "renter",
  },
  {
    path: "/dashboard/renter/profile",
    label: "renter-profile",
    role: "renter",
  },
  {
    path: "/dashboard/renter/reviews",
    label: "renter-reviews",
    role: "renter",
  },
  {
    path: "/dashboard/renter/smart-match",
    label: "renter-smart-match",
    role: "renter",
  },
  // seller
  { path: "/dashboard/seller", label: "seller-home", role: "seller" },
  {
    path: "/dashboard/seller/analytics",
    label: "seller-analytics",
    role: "seller",
  },
  {
    path: "/dashboard/seller/balance",
    label: "seller-balance",
    role: "seller",
  },
  { path: "/dashboard/seller/leads", label: "seller-leads", role: "seller" },
  {
    path: "/dashboard/seller/listings",
    label: "seller-listings",
    role: "seller",
  },
  {
    path: "/dashboard/seller/notifications",
    label: "seller-notifications",
    role: "seller",
  },
  {
    path: "/dashboard/seller/organizations",
    label: "seller-organizations",
    role: "seller",
  },
  {
    path: "/dashboard/seller/organizations/link",
    label: "seller-organizations-link",
    role: "seller",
  },
  {
    path: "/dashboard/seller/organizations/new",
    label: "seller-organizations-new",
    role: "seller",
  },
  {
    path: "/dashboard/seller/settings",
    label: "seller-settings",
    role: "seller",
  },
  // cleaner
  { path: "/dashboard/cleaner", label: "cleaner-home", role: "cleaner" },
  {
    path: "/dashboard/cleaner/earnings",
    label: "cleaner-earnings",
    role: "cleaner",
  },
  {
    path: "/dashboard/cleaner/parameters",
    label: "cleaner-parameters",
    role: "cleaner",
  },
  {
    path: "/dashboard/cleaner/schedule",
    label: "cleaner-schedule",
    role: "cleaner",
  },
  // food
  { path: "/dashboard/food", label: "food-home", role: "food" },
  { path: "/dashboard/food/balance", label: "food-balance", role: "food" },
  {
    path: "/dashboard/food/notifications",
    label: "food-notifications",
    role: "food",
  },
  { path: "/dashboard/food/orders", label: "food-orders", role: "food" },
  {
    path: "/dashboard/food/parameters",
    label: "food-parameters",
    role: "food",
  },
  // transport
  { path: "/dashboard/transport", label: "transport-home", role: "transport" },
  {
    path: "/dashboard/transport/balance",
    label: "transport-balance",
    role: "transport",
  },
  {
    path: "/dashboard/transport/notifications",
    label: "transport-notifications",
    role: "transport",
  },
  {
    path: "/dashboard/transport/orders",
    label: "transport-orders",
    role: "transport",
  },
  {
    path: "/dashboard/transport/parameters",
    label: "transport-parameters",
    role: "transport",
  },
  // entertainment
  {
    path: "/dashboard/entertainment",
    label: "entertainment-home",
    role: "entertainment",
  },
  {
    path: "/dashboard/entertainment/balance",
    label: "entertainment-balance",
    role: "entertainment",
  },
  {
    path: "/dashboard/entertainment/notifications",
    label: "entertainment-notifications",
    role: "entertainment",
  },
  {
    path: "/dashboard/entertainment/orders",
    label: "entertainment-orders",
    role: "entertainment",
  },
  {
    path: "/dashboard/entertainment/parameters",
    label: "entertainment-parameters",
    role: "entertainment",
  },
  // employment
  {
    path: "/dashboard/employment",
    label: "employment-home",
    role: "employment",
  },
  {
    path: "/dashboard/employment/balance",
    label: "employment-balance",
    role: "employment",
  },
  {
    path: "/dashboard/employment/notifications",
    label: "employment-notifications",
    role: "employment",
  },
  {
    path: "/dashboard/employment/orders",
    label: "employment-orders",
    role: "employment",
  },
  {
    path: "/dashboard/employment/parameters",
    label: "employment-parameters",
    role: "employment",
  },
  // service / services (possible stale duplicate — testing both, see findings doc)
  { path: "/dashboard/service", label: "service-home", role: "cleaner" },
  {
    path: "/dashboard/service/balance",
    label: "service-balance",
    role: "cleaner",
  },
  { path: "/dashboard/services", label: "services-home", role: "cleaner" },
  {
    path: "/dashboard/services/balance",
    label: "services-balance",
    role: "cleaner",
  },
  // sms (admin tool)
  { path: "/dashboard/sms", label: "sms", role: "admin" },
  // admin
  { path: "/dashboard/admin", label: "admin-home", role: "admin" },
  {
    path: "/dashboard/admin/analytics",
    label: "admin-analytics",
    role: "admin",
  },
  { path: "/dashboard/admin/banners", label: "admin-banners", role: "admin" },
  {
    path: "/dashboard/admin/broadcast",
    label: "admin-broadcast",
    role: "admin",
  },
  { path: "/dashboard/admin/clients", label: "admin-clients", role: "admin" },
  {
    path: `/dashboard/admin/clients/${QA.guest}`,
    label: "admin-client-detail",
    role: "admin",
  },
  {
    path: "/dashboard/admin/companies",
    label: "admin-companies",
    role: "admin",
  },
  { path: "/dashboard/admin/finances", label: "admin-finances", role: "admin" },
  { path: "/dashboard/admin/listings", label: "admin-listings", role: "admin" },
  { path: "/dashboard/admin/logs", label: "admin-logs", role: "admin" },
  {
    path: "/dashboard/admin/moderation",
    label: "admin-moderation",
    role: "admin",
  },
  { path: "/dashboard/admin/profile", label: "admin-profile", role: "admin" },
  {
    path: "/dashboard/admin/promocodes",
    label: "admin-promocodes",
    role: "admin",
  },
  { path: "/dashboard/admin/reviews", label: "admin-reviews", role: "admin" },
  { path: "/dashboard/admin/seo", label: "admin-seo", role: "admin" },
  { path: "/dashboard/admin/settings", label: "admin-settings", role: "admin" },
  {
    path: "/dashboard/admin/sms-approvals",
    label: "admin-sms-approvals",
    role: "admin",
  },
  {
    path: "/dashboard/admin/status-cards",
    label: "admin-status-cards",
    role: "admin",
  },
  {
    path: "/dashboard/admin/verifications",
    label: "admin-verifications",
    role: "admin",
  },
  { path: "/dashboard/admin/zones", label: "admin-zones", role: "admin" },
  // create forms
  { path: "/create/rental", label: "create-rental", role: "renter" },
  { path: "/create/sale", label: "create-sale", role: "seller" },
  { path: "/create/food", label: "create-food", role: "food" },
  { path: "/create/service", label: "create-service", role: "cleaner" },
  {
    path: "/create/entertainment",
    label: "create-entertainment",
    role: "entertainment",
  },
  { path: "/create/transport", label: "create-transport", role: "transport" },
  {
    path: "/create/employment",
    label: "create-employment",
    role: "employment",
  },
];

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
const sessionCache = new Map();

async function getSession(role) {
  if (sessionCache.has(role)) return sessionCache.get(role);
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: QA_EMAILS[role], password: QA_PASSWORD }),
  });
  const json = await res.json();
  if (!json.access_token) {
    throw new Error(`Failed to sign in as ${role}: ${JSON.stringify(json)}`);
  }
  sessionCache.set(role, json);
  return json;
}

function buildAuthCookie(session) {
  const payload = JSON.stringify({
    access_token: session.access_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  });
  const value = "base64-" + Buffer.from(payload, "utf-8").toString("base64url");
  return { name: `sb-${PROJECT_REF}-auth-token`, value };
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------
async function collectDiagnostics(page, viewportWidth) {
  return page.evaluate((vw) => {
    const overflow =
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth;
    const overflowAmount =
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth;
    const interactive = Array.from(
      document.querySelectorAll(
        'a, button, input, select, textarea, [role="button"]',
      ),
    );
    const small = [];
    for (const el of interactive) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      if (rect.width < 44 || rect.height < 44) {
        small.push({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || el.getAttribute("aria-label") || "")
            .trim()
            .slice(0, 40),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    }
    return {
      overflow,
      overflowAmount,
      viewportWidth: vw,
      smallTouchTargets: small.slice(0, 15),
      smallTouchTargetCount: small.length,
    };
  }, viewportWidth);
}

// ---------------------------------------------------------------------------
// Core runner
// ---------------------------------------------------------------------------
async function withConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx).catch((e) => ({
        error: String(e),
      }));
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

async function shootRoute(browser, route, viewports, authCookie) {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    locale: "ka-GE",
  });
  if (authCookie) {
    await context.addCookies([
      { url: BASE_URL, name: authCookie.name, value: authCookie.value },
    ]);
  }

  const shots = [];
  const diagnostics = {};
  const consoleErrors = [];

  for (const vp of viewports) {
    const page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error")
        consoleErrors.push(`[${vp.name}] ${msg.text().slice(0, 200)}`);
    });
    page.on("pageerror", (err) =>
      consoleErrors.push(
        `[${vp.name}] pageerror: ${String(err).slice(0, 200)}`,
      ),
    );

    await page.setViewportSize({ width: vp.width, height: vp.height });
    let status = null;
    try {
      const resp = await page.goto(BASE_URL + route.path, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      status = resp ? resp.status() : null;
      // Bounded opportunistic wait for network to calm down (never blocks
      // hard — some dashboard pages keep a live Supabase Realtime socket
      // open, or a slow map-tile/font request, so neither "load" nor
      // "networkidle" ever resolve on their own).
      await page
        .waitForLoadState("networkidle", { timeout: 4000 })
        .catch(() => {});
      await page.waitForTimeout(1500); // settle animations/fonts/hydration
    } catch (e) {
      diagnostics[vp.name] = { error: String(e).slice(0, 300) };
      await page.close();
      continue;
    }

    const filePath = path.join(
      OUT_DIR,
      "screenshots",
      vp.name,
      `${route.label}.png`,
    );
    await mkdir(path.dirname(filePath), { recursive: true });
    try {
      await page.screenshot({ path: filePath, fullPage: true, timeout: 15000 });
      shots.push({ vp: vp.name, filePath, width: vp.width });
    } catch (e) {
      diagnostics[vp.name] = {
        error: `screenshot failed: ${String(e).slice(0, 200)}`,
      };
    }

    const diag = await collectDiagnostics(page, vp.width).catch((e) => ({
      error: String(e),
    }));
    diagnostics[vp.name] = { ...diag, httpStatus: status };
    await page.close();
  }

  await context.close();

  // Build contact sheet
  if (shots.length > 0) {
    await buildContactSheet(route, shots);
  }

  return {
    route: route.path,
    label: route.label,
    role: route.role || null,
    diagnostics,
    consoleErrors: [...new Set(consoleErrors)].slice(0, 20),
  };
}

async function buildContactSheet(route, shots) {
  const LABEL_H = 28;
  const metas = await Promise.all(
    shots.map(async (s) => ({
      ...s,
      meta: await sharp(s.filePath).metadata(),
    })),
  );
  const targetW = Math.max(...metas.map((m) => m.meta.width));
  const composites = [];
  let y = 0;
  for (const m of metas) {
    const scale = targetW / m.meta.width;
    const resizedH = Math.round(m.meta.height * scale);
    const label = `${m.vp} (${m.width}px)`;
    const svg = `<svg width="${targetW}" height="${LABEL_H}"><rect width="100%" height="100%" fill="#111"/><text x="8" y="19" font-family="sans-serif" font-size="16" fill="#0f0">${label}</text></svg>`;
    composites.push({ input: Buffer.from(svg), top: y, left: 0 });
    y += LABEL_H;
    composites.push({
      input: await sharp(m.filePath).resize({ width: targetW }).toBuffer(),
      top: y,
      left: 0,
    });
    y += resizedH;
  }
  const sheetPath = path.join(OUT_DIR, "sheets", `${route.label}.png`);
  await mkdir(path.dirname(sheetPath), { recursive: true });
  await sharp({
    create: { width: targetW, height: y, channels: 3, background: "#fff" },
  })
    .composite(composites)
    .png()
    .toFile(sheetPath);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();

  let routes = [];
  if (ROUTE_SET === "public" || ROUTE_SET === "all") {
    routes.push(
      ...PUBLIC_ROUTES.map((r) => ({ ...r, viewports: VIEWPORTS_FULL })),
    );
  }
  if (ROUTE_SET === "dashboard" || ROUTE_SET === "all") {
    routes.push(
      ...DASHBOARD_ROUTES.map((r) => ({ ...r, viewports: VIEWPORTS_CORE })),
    );
  }
  if (ROUTE_FILTER) {
    routes = routes.filter(
      (r) => r.path.includes(ROUTE_FILTER) || r.label.includes(ROUTE_FILTER),
    );
  }

  console.log(`Auditing ${routes.length} routes against ${BASE_URL}`);

  // Pre-warm sessions for all roles used
  const roles = [...new Set(routes.map((r) => r.role).filter(Boolean))];
  const sessions = {};
  for (const role of roles) {
    sessions[role] = await getSession(role);
    console.log(`  session ready: ${role}`);
  }

  const results = await withConcurrency(routes, CONCURRENCY, async (route) => {
    const authCookie = route.role
      ? buildAuthCookie(sessions[route.role])
      : null;
    console.log(
      `shooting ${route.path} (${route.viewports.length} viewports)${route.role ? ` as ${route.role}` : ""}`,
    );
    return shootRoute(browser, route, route.viewports, authCookie);
  });

  await browser.close();

  const reportPath = path.join(OUT_DIR, "diagnostics.json");
  await writeFile(
    reportPath,
    JSON.stringify(
      { baseUrl: BASE_URL, generatedAt: new Date().toISOString(), results },
      null,
      2,
    ),
  );
  console.log(`Done. Report: ${reportPath}`);

  const overflowing = results.filter((r) =>
    Object.values(r.diagnostics).some((d) => d.overflow),
  );
  const withErrors = results.filter(
    (r) => r.consoleErrors && r.consoleErrors.length > 0,
  );
  console.log(
    `Routes with horizontal overflow at some viewport: ${overflowing.length}`,
  );
  console.log(`Routes with console errors: ${withErrors.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

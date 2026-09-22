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
//   node scripts/responsive-audit.mjs [--base-url=https://...] [--routes=public|create|dashboard|all] [--out=DIR] [--filter=substring]

import { chromium } from "playwright";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { FIXTURE_IDS as QA } from "../e2e/helpers/fixture-manifest.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.join("=") || true];
  }),
);

const OUT_DIR = args.out || "responsive-audit";
const ROUTE_FILTER = args.filter || null;
const ROUTE_SET = args.routes || "all"; // public | create | dashboard | all
const CONCURRENCY = Number(args.concurrency || 4);
// --mode=geometry skips screenshots + contact sheets so the full 116-route
// sweep is cheap enough to re-run after every fix.
const GEOMETRY_ONLY = args.mode === "geometry";

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
// .env.example and scripts/mobile-dashboard-parity-readonly.mjs both use
// QA_TEST_PASSWORD; this script originally read only TEST_QA_PASSWORD, so it
// could never find the password that is actually configured. Accept both.
const QA_PASSWORD =
  ROUTE_SET === "public"
    ? null
    : process.env.TEST_QA_PASSWORD?.trim() ||
      requireTestEnv("QA_TEST_PASSWORD");
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

const VIEWPORTS_TEXT_STRESS = [
  { name: "mobile-xs", width: 320, height: 568 },
  { name: "mobile-m", width: 390, height: 844 },
];

// ---------------------------------------------------------------------------
// Route inventory
// ---------------------------------------------------------------------------
const PUBLIC_ROUTES = [
  { path: "/", label: "landing-rent" },
  { path: "/", label: "landing-sale", setup: "sale" },
  { path: "/apartments", label: "apartments-list" },
  { path: `/apartments/${QA.apartment}`, label: "apartments-detail" },
  { path: "/appartments", label: "appartments-typo-route" },
  { path: "/hotels", label: "hotels-list" },
  { path: `/hotels/${QA.hotel}`, label: "hotels-detail" },
  { path: "/sales", label: "sales-list" },
  { path: "/sales/all", label: "sales-all" },
  { path: `/sales/${QA.sale}`, label: "sales-detail" },
  { path: "/food", label: "food-list" },
  { path: `/food/${QA.foodService}`, label: "food-detail" },
  { path: "/services", label: "services-list" },
  { path: `/services/${QA.cleaningServicePrimary}`, label: "services-detail" },
  { path: "/entertainment", label: "entertainment-list" },
  {
    path: `/entertainment/${QA.entertainmentService}`,
    label: "entertainment-detail",
  },
  { path: "/transport", label: "transport-list" },
  { path: `/transport/${QA.transportService}`, label: "transport-detail" },
  { path: "/employment", label: "employment-list" },
  { path: `/employment/${QA.employmentService}`, label: "employment-detail" },
  { path: "/blog", label: "blog-list" },
  { path: `/blog/${QA.blogPost}`, label: "blog-detail" },
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
  { path: "/checkout", label: "checkout-no-params" },
  { path: "/nonexistent-page-xyz", label: "404" },
  {
    path: "/en/search?q=family-friendly-accommodation",
    label: "search-en-stress",
    viewports: VIEWPORTS_TEXT_STRESS,
  },
  {
    path: "/ru/search?q=семейное-размещение-в-бакуриани",
    label: "search-ru-stress",
    viewports: VIEWPORTS_TEXT_STRESS,
  },
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
];

const CREATE_ROUTES = [
  { path: "/create", label: "create-hub", role: "renter" },
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
// ---------------------------------------------------------------------------
// Card geometry ("do all listings render the same size?")
// ---------------------------------------------------------------------------
// Measures, per grid row, whether cards keep equal outer height AND equal
// internal anchor positions regardless of how much content each one carries.
//
// Two correctness rules baked in, both of which would otherwise fake results:
//
//  * Tolerances, not exact equality. getBoundingClientRect() is fractional and
//    `gap` + grid-cols-3 at 375px guarantees sub-pixel column differences, so
//    an exact comparison reports hundreds of failures on every route.
//
//  * Cards are selected by their own data-* hook and then grouped by the
//    nearest ancestor holding >=2 of them - never by ":scope > *". All ten
//    category grids render <BannerSlot> INSIDE the grid container, so treating
//    direct grid children as row peers would flag every one of those pages.
const CARD_KINDS = [
  "listing",
  "service",
  "employment",
  "sale",
  "investment",
  "blog",
  "home-blog",
];

async function collectCardGeometry(page) {
  return page.evaluate((KINDS) => {
    const HEIGHT_TOL = 1; // px - sub-pixel fractional columns
    const ROW_TOL = 2; // px - offsetTop banding
    const SELECTOR = KINDS.map((k) => `[data-${k}-card]`).join(",");

    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return (
        r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none"
      );
    };

    const cards = Array.from(document.querySelectorAll(SELECTOR)).filter(visible);
    if (cards.length === 0) return null;

    const kindOf = (el) =>
      KINDS.find((k) => el.hasAttribute(`data-${k}-card`)) || "unknown";
    const absTop = (el) => el.getBoundingClientRect().top + window.scrollY;
    const round1 = (n) => Math.round(n * 10) / 10;

    // Nearest ancestor containing >= 2 cards == the real grid, regardless of
    // how many ScrollReveal / rail-item wrappers sit in between.
    // The ancestor must ALSO be a real grid/flex container. Without that check
    // a rail holding a single card makes the walk climb into an arbitrary
    // <section> wrapper that happens to span several rails, and the "cell"
    // then measures a whole sibling rail - reporting ~200px of phantom dead
    // space. Only a layout container actually stretches its children.
    const LAYOUT = new Set(["grid", "inline-grid", "flex", "inline-flex"]);
    // Must also lay children out along the ROW axis. A `flex flex-col` wrapper
    // stretches its children horizontally, never vertically, so its height is
    // just its own content - comparing a card against it invents ~200px of
    // phantom dead space. (Caught on the landing page: a 300px avatar card
    // inside a 508px `flex flex-col` section.)
    const isRowAxis = (node) => {
      const st = getComputedStyle(node);
      if (!LAYOUT.has(st.display)) return false;
      if (st.display.includes("flex")) return !st.flexDirection.startsWith("column");
      return true; // grid
    };
    const gridOf = (card) => {
      let node = card.parentElement;
      while (node && node !== document.body) {
        if (node.querySelectorAll(SELECTOR).length >= 2 && isRowAxis(node))
          return node;
        node = node.parentElement;
      }
      return null;
    };
    // The element the grid actually lays out (may be a wrapper, not the card).
    const cellOf = (card, grid) => {
      let node = card;
      while (node && node.parentElement && node.parentElement !== grid) {
        node = node.parentElement;
      }
      return node && node.parentElement === grid ? node : card;
    };

    const measure = (card, grid) => {
      const cardRect = card.getBoundingClientRect();
      const cell = cellOf(card, grid);
      const cellRect = cell.getBoundingClientRect();
      const top = cardRect.top;
      const rel = (el) => (el ? round1(el.getBoundingClientRect().top - top) : null);

      const title = card.querySelector("h2,h3");
      let titleClamped = null;
      if (title) {
        const ts = getComputedStyle(title);
        titleClamped =
          (ts.webkitLineClamp && ts.webkitLineClamp !== "none") ||
          ts.textOverflow === "ellipsis" ||
          ts.overflow === "hidden";
      }

      // price = first leaf rendering the lari sign, SKIPPING struck-through
      // originals. A discounted card renders the old price above the real one;
      // anchoring on that compares a struck line against a live price and
      // reports a ~26px "misalignment" that is not one. (Caught by probing
      // /apartments: the discounted card's first lari leaf was its
      // line-through original at relTop 371 vs 397 for the real price.)
      let price = null;
      for (const el of card.querySelectorAll("*")) {
        if (el.children.length !== 0) continue;
        if (!/₾/.test(el.textContent || "")) continue;
        if (getComputedStyle(el).textDecorationLine.includes("line-through"))
          continue;
        price = el;
        break;
      }
      // cta = last visible interactive element in the card
      const inter = Array.from(
        card.querySelectorAll("a,button,[role='button']"),
      ).filter(visible);
      const cta = inter.length ? inter[inter.length - 1] : null;

      const st = getComputedStyle(card);
      const clipped =
        st.overflow === "hidden" && card.scrollHeight - card.clientHeight > 1;

      return {
        kind: kindOf(card),
        y: absTop(card),
        h: round1(cardRect.height),
        cellH: round1(cellRect.height),
        fillsCell: cardRect.height >= cellRect.height - HEIGHT_TOL,
        titleTop: rel(title),
        titleH: title ? round1(title.getBoundingClientRect().height) : null,
        titleClamped,
        priceTop: rel(price),
        ctaTop: rel(cta),
        clipped,
        overflowBy: clipped ? card.scrollHeight - card.clientHeight : 0,
      };
    };

    const spread = (vals) => {
      const nums = vals.filter((v) => typeof v === "number");
      if (nums.length < 2) return 0;
      return round1(Math.max(...nums) - Math.min(...nums));
    };

    // group cards by grid
    const byGrid = new Map();
    for (const card of cards) {
      const grid = gridOf(card);
      if (!grid) continue;
      if (!byGrid.has(grid)) byGrid.set(grid, []);
      byGrid.get(grid).push(card);
    }

    const violations = [];
    const grids = [];

    for (const [grid, members] of byGrid) {
      const measured = members.map((c) => measure(c, grid)).sort((a, b) => a.y - b.y);

      // band into rows
      const rows = [];
      for (const m of measured) {
        const last = rows[rows.length - 1];
        if (last && m.y - last[0].y <= ROW_TOL) last.push(m);
        else rows.push([m]);
      }

      const kinds = [...new Set(measured.map((m) => m.kind))];
      const gridInfo = {
        kinds,
        cards: measured.length,
        rows: rows.length,
        // spread across the WHOLE grid: on a 1-col mobile layout every card is
        // its own row, so row-equality is vacuous and only this number speaks.
        gridHeightSpread: spread(measured.map((m) => m.h)),
        rowDetail: [],
      };

      for (const row of rows) {
        const d = {
          n: row.length,
          heightSpread: spread(row.map((m) => m.h)),
          titleHeightSpread: spread(row.map((m) => m.titleH)),
          priceTopSpread: spread(row.map((m) => m.priceTop)),
          ctaTopSpread: spread(row.map((m) => m.ctaTop)),
        };
        gridInfo.rowDetail.push(d);

        if (row.length >= 2) {
          if (d.heightSpread > HEIGHT_TOL)
            violations.push({ g: "G1", kind: kinds.join("+"), spread: d.heightSpread });
          if (d.ctaTopSpread > HEIGHT_TOL)
            violations.push({ g: "G2-cta", kind: kinds.join("+"), spread: d.ctaTopSpread });
          if (d.priceTopSpread > HEIGHT_TOL)
            violations.push({ g: "G2-price", kind: kinds.join("+"), spread: d.priceTopSpread });
          if (d.titleHeightSpread > HEIGHT_TOL)
            violations.push({ g: "G5-title", kind: kinds.join("+"), spread: d.titleHeightSpread });
        }
      }

      for (const m of measured) {
        if (m.titleClamped === false)
          violations.push({ g: "G4-unclamped", kind: m.kind, titleH: m.titleH });
        if (m.clipped)
          violations.push({ g: "G3-clip", kind: m.kind, by: m.overflowBy });
        if (!m.fillsCell)
          violations.push({
            g: "G1-fill",
            kind: m.kind,
            cardH: m.h,
            cellH: m.cellH,
          });
      }

      grids.push(gridInfo);
    }

    // de-duplicate identical violations (a 3-col grid repeats the same defect)
    const seen = new Set();
    const uniq = [];
    for (const v of violations) {
      const key = JSON.stringify(v);
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(v);
    }

    return { cardCount: cards.length, grids, violations: uniq.slice(0, 40) };
  }, CARD_KINDS);
}

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
      if (route.setup === "sale") {
        await page.locator('[data-listing-mode="sale"]').click();
        await page.waitForTimeout(500);
      }
    } catch (e) {
      diagnostics[vp.name] = { error: String(e).slice(0, 300) };
      await page.close();
      continue;
    }

    if (!GEOMETRY_ONLY) {
      const filePath = path.join(
        OUT_DIR,
        "screenshots",
        vp.name,
        `${route.label}.png`,
      );
      await mkdir(path.dirname(filePath), { recursive: true });
      try {
        await page.screenshot({
          path: filePath,
          fullPage: true,
          timeout: 15000,
        });
        shots.push({ vp: vp.name, filePath, width: vp.width });
      } catch (e) {
        diagnostics[vp.name] = {
          error: `screenshot failed: ${String(e).slice(0, 200)}`,
        };
      }
    }

    // A gated route silently renders the consent wall / login card instead of
    // the page under test, and every geometry check then passes vacuously.
    // Record where we actually landed so that failure is loud, not invisible.
    const landedOn = await page
      .evaluate(() => location.pathname + (document.body.innerText.slice(0, 0) || ""))
      .catch(() => null);
    const redirected =
      landedOn &&
      /\/(consent-required|site-locked)$|\/auth\/(login|register)$/.test(landedOn) &&
      !route.path.includes(landedOn);

    const diag = await collectDiagnostics(page, vp.width).catch((e) => ({
      error: String(e),
    }));
    const geometry = await collectCardGeometry(page).catch((e) => ({
      error: String(e).slice(0, 200),
    }));
    diagnostics[vp.name] = {
      ...diag,
      httpStatus: status,
      geometry,
      landedOn,
      redirected: Boolean(redirected),
    };
    await page.close();
  }

  await context.close();

  // Build contact sheet
  if (!GEOMETRY_ONLY && shots.length > 0) {
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
  // Keep the review sheet readable without upscaling phone screenshots to the
  // desktop width (which can turn a normal long page into a >268 MP artifact).
  const targetW = Math.min(1024, Math.max(...metas.map((m) => m.meta.width)));
  const composites = [];
  let y = 0;
  for (const m of metas) {
    const scale = Math.min(1, targetW / m.meta.width);
    const resizedW = Math.round(m.meta.width * scale);
    const resizedH = Math.round(m.meta.height * scale);
    const label = `${m.vp} (${m.width}px)`;
    const svg = `<svg width="${targetW}" height="${LABEL_H}"><rect width="100%" height="100%" fill="#111"/><text x="8" y="19" font-family="sans-serif" font-size="16" fill="#0f0">${label}</text></svg>`;
    composites.push({ input: Buffer.from(svg), top: y, left: 0 });
    y += LABEL_H;
    composites.push({
      input: await sharp(m.filePath).resize({ width: resizedW }).toBuffer(),
      top: y,
      left: 0,
    });
    y += resizedH;
  }
  const sheetPath = path.join(OUT_DIR, "sheets", `${route.label}.png`);
  await mkdir(path.dirname(sheetPath), { recursive: true });
  await sharp({
    create: { width: targetW, height: y, channels: 3, background: "#fff" },
    limitInputPixels: false,
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
      ...PUBLIC_ROUTES.map((r) => ({
        ...r,
        viewports: r.viewports ?? VIEWPORTS_FULL,
      })),
    );
  }
  if (ROUTE_SET === "create" || ROUTE_SET === "all") {
    routes.push(
      ...CREATE_ROUTES.map((r) => ({ ...r, viewports: VIEWPORTS_CORE })),
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

  const successfulResults = results.filter((r) => r?.diagnostics);
  const overflowing = successfulResults.filter((r) =>
    Object.values(r.diagnostics).some((d) => d.overflow),
  );

  // Card-geometry rollup: which invariant broke, how often, and where.
  const geomCounts = new Map();
  const geomWhere = new Map();
  for (const r of successfulResults) {
    for (const [vpName, d] of Object.entries(r.diagnostics)) {
      for (const v of d.geometry?.violations ?? []) {
        geomCounts.set(v.g, (geomCounts.get(v.g) || 0) + 1);
        const key = `${v.g}`;
        if (!geomWhere.has(key)) geomWhere.set(key, new Set());
        geomWhere.get(key).add(`${r.label}@${vpName}`);
      }
    }
  }
  const gated = successfulResults.filter((r) =>
    Object.values(r.diagnostics).some((d) => d.redirected),
  );
  if (gated.length) {
    console.log(
      `\nWARNING: ${gated.length} route(s) were REDIRECTED (consent wall / login) - their results are vacuous:`,
    );
    for (const r of gated.slice(0, 10)) {
      const to = Object.values(r.diagnostics).find((d) => d.redirected)?.landedOn;
      console.log(`  ${r.label} -> ${to}`);
    }
  }
  if (geomCounts.size === 0) {
    console.log("Card geometry: no violations");
  } else {
    console.log("\nCard geometry violations:");
    for (const [g, n] of [...geomCounts].sort((a, b) => b[1] - a[1])) {
      const where = [...geomWhere.get(g)].slice(0, 6).join(", ");
      console.log(`  ${g}: ${n}  e.g. ${where}`);
    }
  }
  const withErrors = successfulResults.filter(
    (r) => r.consoleErrors && r.consoleErrors.length > 0,
  );
  const failedCaptures = results.filter((r) => r?.error);
  console.log(
    `Routes with horizontal overflow at some viewport: ${overflowing.length}`,
  );
  console.log(`Routes with console errors: ${withErrors.length}`);
  console.log(`Routes with capture errors: ${failedCaptures.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

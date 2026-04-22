#!/usr/bin/env node
/**
 * Sign in as pre-seeded test seller (created via Supabase MCP SQL),
 * drop auth cookies, screenshot every seller dashboard page.
 */
import { config as dotenvConfig } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

dotenvConfig({
  path: "/Users/bezhomatiashvili/Desktop/MyBakuriani/.env.local",
});

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !ANON_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
  process.exit(2);
}

const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false },
});

const OUT_DIR = "/tmp/mb-seller-screenshots";
mkdirSync(OUT_DIR, { recursive: true });

const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`;
const EMAIL = "ui-validation-seller-fixed@e2e.mybakuriani.test";
const PASS = "UiValidationPass!42";
const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-000000000001";

async function signIn() {
  const { data, error } = await anon.auth.signInWithPassword({
    email: EMAIL,
    password: PASS,
  });
  if (error) throw new Error(`sign in: ${error.message}`);
  return data.session;
}

async function run() {
  const session = await signIn();
  console.log("[session] access_token length:", session.access_token.length);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: "ka-GE",
  });

  const sessionPayload = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: USER_ID,
      email: EMAIL,
      phone: "+995599000001",
      user_metadata: { role: "seller", display_name: "გიორგი მახარაძე" },
    },
  };
  const encoded = Buffer.from(JSON.stringify(sessionPayload)).toString(
    "base64",
  );
  const cookieBase = {
    domain: "localhost",
    path: "/",
    httpOnly: false,
    secure: false,
    sameSite: "Lax",
  };
  await context.addCookies([
    { name: COOKIE_NAME, value: `base64-${encoded}`, ...cookieBase },
    { name: `${COOKIE_NAME}.0`, value: `base64-${encoded}`, ...cookieBase },
  ]);

  const PAGES = [
    ["dashboard", "/ka/dashboard/seller"],
    ["leads", "/ka/dashboard/seller/leads"],
    ["listings", "/ka/dashboard/seller/listings"],
    ["analytics", "/ka/dashboard/seller/analytics"],
    ["balance", "/ka/dashboard/seller/balance"],
    ["notifications", "/ka/dashboard/seller/notifications"],
    ["settings", "/ka/dashboard/seller/settings"],
  ];

  const page = await context.newPage();
  const results = [];
  for (const [name, url] of PAGES) {
    console.log(`[screenshot] ${name} → ${url}`);
    try {
      const resp = await page.goto(`http://localhost:3002${url}`, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      await page.waitForTimeout(1500);
      const out = path.join(OUT_DIR, `${name}.png`);
      await page.screenshot({ path: out, fullPage: true });
      results.push({
        name,
        url,
        finalUrl: page.url(),
        status: resp?.status() ?? 0,
        path: out,
      });
    } catch (e) {
      console.warn(`  × ${name} failed:`, e.message);
      results.push({ name, url, error: e.message });
    }
  }
  await browser.close();

  console.log("\n=== RESULTS ===");
  for (const r of results) {
    if (r.error) console.log(`  ${r.name.padEnd(14)} ERROR: ${r.error}`);
    else
      console.log(
        `  ${r.name.padEnd(14)} status=${r.status} final=${r.finalUrl}  →  ${r.path}`,
      );
  }
}

run().catch((e) => {
  console.error("[fatal]", e);
  process.exit(1);
});

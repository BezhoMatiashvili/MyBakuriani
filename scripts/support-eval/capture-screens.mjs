// Captures real screens for the walkthrough eval (plans.mjs, C43). Manual and
// local: signs in the staging QA accounts against a local production build,
// opens Baku on each page and types a "how do I" question; the plan request
// the widget sends carries exactly what scanPage() saw. The request is
// answered with a mock ("noplan"), so no model is called.
//
//   node --env-file=.env.local scripts/support-eval/capture-screens.mjs \
//     --base http://localhost:3861 [--only renter]
//
// Writes scripts/support-eval/screens/<name>.json. Each file keeps its
// hand-written `expect` block when it is captured again.

import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { SCREENS } from "./screens.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const BASE = option("base", "http://localhost:3861");
const ONLY = option("only", "");
const OUT = new URL("./screens/", import.meta.url);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = process.env.QA_TEST_PASSWORD ?? process.env.TEST_QA_PASSWORD;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error("run with --env-file=.env.local");
  process.exit(2);
}

// The password first; when it has drifted, a one-time magic-link token from
// the admin API (the account itself is not changed).
async function signIn(role) {
  const email = `qa-${role}@qa.mybakuriani.test`;
  const json = (headers) => ({
    ...headers,
    "Content-Type": "application/json",
  });
  if (PASSWORD) {
    const response = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: json({ apikey: ANON_KEY }),
        body: JSON.stringify({ email, password: PASSWORD }),
      },
    );
    const session = await response.json();
    if (response.ok && session.access_token) return session;
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey)
    throw new Error(`${email}: password refused, no service key`);
  const link = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: json({
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    }),
    body: JSON.stringify({ type: "magiclink", email }),
  }).then((r) => r.json());
  const tokenHash = link.hashed_token ?? link.properties?.hashed_token;
  if (!tokenHash)
    throw new Error(`${email}: no magic link (${link.msg ?? link.error_code})`);
  const verified = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: json({ apikey: ANON_KEY }),
    body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
  });
  const session = await verified.json();
  if (!verified.ok || !session.access_token)
    throw new Error(`${email}: ${session.msg ?? verified.status}`);
  return session;
}

// Same serialization as e2e/helpers/auth.ts:authenticateAsRole.
function sessionCookie(session) {
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  const payload = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: session.user.id, email: session.user.email },
  });
  const value = `base64-${Buffer.from(payload).toString("base64url")}`;
  return { name: `sb-${ref}-auth-token`, value, url: BASE };
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const sessions = new Map();
let failed = 0;

for (const screen of SCREENS.filter((s) => !ONLY || s.name.includes(ONLY))) {
  const context = await browser.newContext({ locale: "ka-GE" });
  const cookies = [
    {
      name: "mb_cookie_consent",
      value: encodeURIComponent("v2|analytics=0|location=0"),
      url: BASE,
    },
  ];
  try {
    if (screen.role) {
      if (!sessions.has(screen.role))
        sessions.set(screen.role, await signIn(screen.role));
      cookies.push(sessionCookie(sessions.get(screen.role)));
    }
    await context.addCookies(cookies);
    const page = await context.newPage();
    let captured = null;
    await page.route("**/api/support", (route) => {
      const body = route.request().postDataJSON();
      if (body.mode === "plan" && !captured) captured = body;
      return route.fulfill({
        json:
          body.mode === "plan"
            ? { type: "noplan" }
            : {
                type: "answer",
                text: "…",
                actions: [],
                guide: "",
                guideNow: false,
                suggestions: [],
                ref: "abcdefghij",
              },
      });
    });
    await page.goto(`${BASE}${screen.path}`, { waitUntil: "networkidle" });
    if (screen.prepare) await screen.prepare(page);
    const landed = new URL(page.url()).pathname;
    if (landed !== screen.path)
      console.warn(`! ${screen.name}: landed on ${landed}, not ${screen.path}`);
    await page.getByTestId("jev-launcher").click();
    const input = page.getByTestId("jev-panel").locator("textarea");
    await input.fill(screen.goal);
    await input.press("Enter");
    for (let i = 0; i < 40 && !captured; i += 1) await page.waitForTimeout(250);
    if (!captured)
      throw new Error("no plan request (the HOW_TO prefetch did not fire)");
    const file = new URL(`${screen.name}.json`, OUT);
    const previous = existsSync(file)
      ? JSON.parse(readFileSync(file, "utf8"))
      : {};
    const fixture = {
      name: screen.name,
      locale: captured.locale,
      cabinet: captured.cabinet,
      path: captured.path,
      title: captured.title,
      goal: screen.goal,
      progress: previous.progress ?? [],
      notices: captured.notices ?? [],
      elements: captured.elements,
      expect: previous.expect ?? screen.expect ?? {},
    };
    writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`);
    console.log(
      `✓ ${screen.name}: ${captured.elements.length} elements (${captured.path})`,
    );
  } catch (error) {
    failed += 1;
    console.error(`✗ ${screen.name}: ${error.message}`);
  }
  await context.close();
}

await browser.close();
process.exit(failed ? 1 : 0);

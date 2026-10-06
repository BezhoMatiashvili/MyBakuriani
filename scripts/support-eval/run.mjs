// Accuracy eval for the support assistant's answers (C43). Manual and local:
// it calls the real answer code (src/lib/support/server.ts) with the real
// prompt, live prices and zones, through OpenRouter with the key in
// .env.local, and checks every reply against cases.mjs. A few cents a run.
//
//   node --env-file=.env.local --import ./scripts/support-eval/register.mjs \
//     --experimental-strip-types --no-warnings scripts/support-eval/run.mjs \
//     [--runs 3] [--model google/gemini-3.1-flash-lite] [--only renter] [--concurrency 4]
//
// Exit code 1 when any case fails in any run.

import {
  answerQuestion,
  answerRequestBody,
} from "../../src/lib/support/server.ts";
import { loadPriceFacts } from "../../src/lib/support/prices.ts";
import {
  availableActionIds,
  normalizeAction,
} from "../../src/lib/support/actions.ts";
import { parseSupportRequest } from "../../src/lib/support/plan.ts";
import { FALLBACK_ZONES } from "../../src/lib/zones/types.ts";
import {
  CONTACT_EMAIL,
  CONTACT_PHONE_E164,
} from "../../src/lib/site-contact.ts";
import { buildCases } from "./cases.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const RUNS = Number(option("runs", "3"));
const MODEL = option("model", "");
const ONLY = option("only", "");
const CONCURRENCY = Number(option("concurrency", "4"));

if (!process.env.OPENROUTER_API_KEY) {
  console.error(
    "OPENROUTER_API_KEY is not set (run with --env-file=.env.local)",
  );
  process.exit(2);
}

function tbilisiToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tbilisi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const today = tbilisiToday();
/** The next occurrence of month/day on or after today, as YYYY-MM-DD. */
function nextDate(month, day) {
  const year = Number(today.slice(0, 4));
  const pad = (n) => String(n).padStart(2, "0");
  const thisYear = `${year}-${pad(month)}-${pad(day)}`;
  return thisYear >= today ? thisYear : `${year + 1}-${pad(month)}-${pad(day)}`;
}

async function loadZones() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    const response = await fetch(
      `${url}/rest/v1/zones?select=name_ka&is_active=eq.true&order=sort_order`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    const rows = await response.json();
    if (Array.isArray(rows) && rows.length) return rows.map((r) => r.name_ka);
  } catch {
    // fall through
  }
  return FALLBACK_ZONES.map((zone) => zone.name_ka);
}

const GEORGIAN = /\p{Script=Georgian}/gu;
const LATIN = /\p{Script=Latin}/gu;
const CYRILLIC = /\p{Script=Cyrillic}/gu;
const count = (text, re) => (text.match(re) ?? []).length;

function languageProblem(locale, text) {
  const ka = count(text, GEORGIAN);
  const la = count(text, LATIN);
  const ru = count(text, CYRILLIC);
  if (locale === "ka" && ka <= la + ru) return "not written in Georgian";
  if (locale === "en" && la <= ka + ru) return "not written in English";
  if (locale === "ru" && ru <= ka + la) return "not written in Russian";
  return null;
}

const AMOUNT = /(\d+(?:[.,]\d+)?)\s*(?:₾|GEL|ლარ|лари|lari)/giu;

function amountProblem(text, prices) {
  const listed = new Set(
    [...prices.matchAll(/(\d+(?:\.\d+)?)\s*₾/g)].map((m) => Number(m[1])),
  );
  const stated = [...text.matchAll(AMOUNT)].map((m) =>
    Number(m[1].replace(",", ".")),
  );
  const unknown = stated.filter((n) => !listed.has(n));
  return unknown.length
    ? `amounts not on the price list: ${unknown.join(", ")}`
    : null;
}

function check(expect, reply, locale, prices) {
  const problems = [];
  const ids = reply.actions.map((a) => a.id);
  const lower = reply.text.toLowerCase();
  const lang = languageProblem(locale, reply.text);
  if (lang) problems.push(lang);
  for (const suggestion of reply.suggestions)
    if (languageProblem(locale, suggestion))
      problems.push(`suggestion in another language: ${suggestion}`);
  if (expect.actionsAny && !expect.actionsAny.some((id) => ids.includes(id)))
    problems.push(
      `no button among ${expect.actionsAny.join("|")} (got ${ids.join(",") || "none"})`,
    );
  for (const id of expect.actionsNone ?? [])
    if (ids.includes(id)) problems.push(`unexpected button ${id}`);
  for (const [id, want] of Object.entries(expect.params ?? {})) {
    const action = reply.actions.find((a) => a.id === id);
    if (!action) continue; // reported by actionsAny
    for (const [key, value] of Object.entries(want)) {
      const got = action.params?.[key];
      if (JSON.stringify(got) !== JSON.stringify(value))
        problems.push(
          `${id}.${key} = ${JSON.stringify(got)}, expected ${JSON.stringify(value)}`,
        );
    }
  }
  if (
    expect.textAny &&
    !expect.textAny.some((s) => lower.includes(s.toLowerCase()))
  )
    problems.push(`text has none of ${expect.textAny.join("|")}`);
  for (const s of expect.textNone ?? [])
    if (lower.includes(s.toLowerCase())) problems.push(`text contains "${s}"`);
  if (expect.guide === true && !reply.guide)
    problems.push("no walkthrough goal");
  if (expect.guide === false && reply.guide)
    problems.push("unexpected walkthrough goal");
  if (
    expect.needsAccount !== undefined &&
    reply.needsAccount !== expect.needsAccount
  )
    problems.push(`needs_account = ${reply.needsAccount}`);
  if (expect.amounts) {
    const problem = amountProblem(reply.text, prices);
    if (problem) problems.push(problem);
  }
  return problems;
}

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index]);
      }
    }),
  );
  return results;
}

const [prices, zones] = await Promise.all([loadPriceFacts(), loadZones()]);
const cases = buildCases({ nextDate }).filter(
  (c) => !ONLY || c.name.includes(ONLY),
);
console.log(
  `support eval: ${cases.length} cases x ${RUNS} runs, today ${today}, ${zones.length} zones, model ${MODEL || "default (ANSWER_MODELS)"}`,
);

const jobs = cases.flatMap((c) =>
  Array.from({ length: RUNS }, (_, run) => ({ c, run })),
);
let cost = 0;
let ms = 0;
let cachedHits = 0;
const results = await pool(jobs, CONCURRENCY, async ({ c, run }) => {
  const req = parseSupportRequest({
    mode: "ask",
    locale: c.locale,
    cabinet: c.cabinet,
    path: c.path,
    message: c.message,
    history: c.history ?? [],
  });
  const actionCtx = {
    cabinet: c.cabinet,
    signedIn: c.signedIn,
    today,
    zones,
    contact: { phone: CONTACT_PHONE_E164, email: CONTACT_EMAIL },
  };
  const body = answerRequestBody(req, {
    signedIn: c.signedIn,
    prices,
    zones,
    today,
    available: availableActionIds(actionCtx),
    account: c.account ?? null,
  });
  if (MODEL) body.models = [MODEL];
  try {
    const result = await answerQuestion(body, req, (id, params) =>
      normalizeAction(id, params, actionCtx),
    );
    cost += result.cost ?? 0;
    ms += result.ms;
    if ((result.cachedTokens ?? 0) > 0) cachedHits += 1;
    return {
      c,
      run,
      result,
      problems: check(c.expect, result.reply, c.locale, prices),
    };
  } catch (error) {
    return { c, run, problems: [`call failed: ${error.message}`] };
  }
});

let failed = 0;
for (const c of cases) {
  const runs = results.filter((r) => r.c === c);
  const bad = runs.filter((r) => r.problems.length);
  failed += bad.length;
  console.log(
    `${bad.length ? "✗" : "✓"} ${c.name} ${runs.length - bad.length}/${runs.length}`,
  );
  for (const r of bad) {
    console.log(`    run ${r.run + 1}: ${r.problems.join("; ")}`);
    if (r.result)
      console.log(
        `      text: ${JSON.stringify(r.result.reply.text).slice(0, 300)} buttons: ${JSON.stringify(r.result.reply.actions)}`,
      );
  }
}
console.log(
  `\n${jobs.length - failed}/${jobs.length} passed; cost $${cost.toFixed(4)}; avg ${Math.round(ms / jobs.length)} ms; ${cachedHits} replies used the prompt cache`,
);
process.exit(failed ? 1 : 0);

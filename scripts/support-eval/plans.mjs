// Accuracy eval for the on-screen walkthrough planner (C43). Manual and
// local: plans on real screens recorded by capture-screens.mjs with the real
// prompt and models (server.ts:planGuide), through OpenRouter with the key in
// .env.local, and scores every plan against the screen's `expect` block.
// A few cents a run.
//
//   node --env-file=.env.local --import ./scripts/support-eval/register.mjs \
//     --experimental-strip-types --no-warnings scripts/support-eval/plans.mjs \
//     [--runs 3] [--only rental] [--concurrency 4] [--verbose]
//
// Exit code 1 when any plan fails.

import { readFileSync, readdirSync } from "node:fs";
import { planGuide, planRequestBody } from "../../src/lib/support/server.ts";
import { parseSupportRequest } from "../../src/lib/support/plan.ts";
import {
  labelMatches,
  quotedLabels,
} from "../../src/lib/support/validate.ts";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const RUNS = Number(option("runs", "3"));
const ONLY = option("only", "");
const CONCURRENCY = Number(option("concurrency", "4"));
const VERBOSE = args.includes("--verbose");
const DIR = new URL("./screens/", import.meta.url);

if (!process.env.OPENROUTER_API_KEY) {
  console.error(
    "OPENROUTER_API_KEY is not set (run with --env-file=.env.local)",
  );
  process.exit(2);
}

const screens = readdirSync(DIR)
  .filter((file) => file.endsWith(".json"))
  .map((file) => JSON.parse(readFileSync(new URL(file, DIR), "utf8")))
  .filter((screen) => !ONLY || screen.name.includes(ONLY));

const FIELD_KINDS = new Set(["input", "textarea", "select", "file"]);
const fits = (action, kind) =>
  action === "look" ||
  (action === "type"
    ? kind === "input" || kind === "textarea"
    : action === "upload"
      ? kind === "file" || kind === "button"
      : action === "select"
        ? ["select", "checkbox", "radio", "option", "button", "tab"].includes(
            kind,
          )
        : !FIELD_KINDS.has(kind));
// A step names its element when a quoted name matches the label, the
// caption part of "Caption (placeholder)", or its section (validate.ts).
function namesElement(say, element) {
  const names = [
    element.label,
    element.label.replace(/\s*\(.*$/, ""),
    element.section ?? "",
  ].filter(Boolean);
  const quoted = quotedLabels(say);
  if (quoted.length)
    return quoted.some((q) => names.some((name) => labelMatches(q, name)));
  return names.some((name) =>
    say.toLowerCase().includes(name.replace(/\*$/, "").toLowerCase()),
  );
}

function score(screen, plan) {
  const problems = [];
  const expect = screen.expect ?? {};
  const byId = new Map(screen.elements.map((e) => [e.id, e]));
  if (!plan) return ["no plan"];
  if (plan.kind === "ask") {
    if (!expect.allowAsk && !expect.ask)
      problems.push("asked instead of steps");
    return problems;
  }
  if (expect.ask) problems.push("gave steps, expected a question");
  const first = byId.get(plan.steps[0]?.target);
  const firstText = `${first?.label ?? ""} ${first?.section ?? ""}`;
  const firstOk =
    (expect.first ?? []).some((want) => firstText.includes(want)) ||
    (expect.firstPattern &&
      new RegExp(expect.firstPattern).test(first?.label ?? "") &&
      !first?.disabled);
  if (expect.first && !firstOk)
    problems.push(`first step on "${first?.label}" (${first?.id})`);
  let filled = false;
  plan.steps.forEach((step, index) => {
    const element = byId.get(step.target);
    if (!element) return;
    if (!fits(step.action, element.kind))
      problems.push(`step ${index + 1}: ${step.action} on a ${element.kind}`);
    if (step.action === "click" && element.disabled && !filled)
      problems.push(`step ${index + 1}: presses disabled "${element.label}"`);
    if (step.action === "type" || step.action === "select") filled = true;
    if (
      step.action !== "look" &&
      !element.label.startsWith("[item") &&
      !namesElement(step.say, element)
    )
      problems.push(`step ${index + 1}: say does not name "${element.label}"`);
  });
  if (expect.done !== undefined && plan.done !== expect.done)
    problems.push(`done = ${plan.done}`);
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

console.log(`plan eval: ${screens.length} screens x ${RUNS} runs`);
const jobs = screens.flatMap((screen) =>
  Array.from({ length: RUNS }, (_, run) => ({ screen, run })),
);
let ms = 0;
const results = await pool(jobs, CONCURRENCY, async ({ screen, run }) => {
  const req = parseSupportRequest({
    mode: "plan",
    locale: screen.locale,
    cabinet: screen.cabinet,
    path: screen.path,
    title: screen.title,
    goal: screen.goal,
    progress: screen.progress ?? [],
    notices: screen.notices ?? [],
    elements: screen.elements,
  });
  const started = Date.now();
  try {
    const response = await planGuide(req, planRequestBody(req, true));
    ms += Date.now() - started;
    const plan = response.type === "plan" ? response.plan : null;
    return { screen, run, plan, problems: score(screen, plan) };
  } catch (error) {
    ms += Date.now() - started;
    return {
      screen,
      run,
      plan: null,
      problems: [`call failed: ${error.message}`],
    };
  }
});

let failed = 0;
for (const screen of screens) {
  const runs = results.filter((r) => r.screen === screen);
  const bad = runs.filter((r) => r.problems.length);
  failed += bad.length;
  console.log(
    `${bad.length ? "✗" : "✓"} ${screen.name} ${runs.length - bad.length}/${runs.length}`,
  );
  for (const r of VERBOSE ? runs : bad) {
    if (r.problems.length)
      console.log(`    run ${r.run + 1}: ${r.problems.join("; ")}`);
    if (r.plan?.kind === "steps")
      console.log(
        `      steps: ${r.plan.steps.map((s) => `${s.action} ${s.target} "${s.say}"`).join(" | ")} done=${r.plan.done}`,
      );
    else if (r.plan)
      console.log(
        `      ask: ${r.plan.question} [${r.plan.options.join(" / ")}]`,
      );
  }
}
console.log(
  `\n${jobs.length - failed}/${jobs.length} plans passed; avg ${Math.round(ms / jobs.length)} ms`,
);
process.exit(failed ? 1 : 0);

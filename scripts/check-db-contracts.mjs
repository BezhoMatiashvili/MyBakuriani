// Database-side contract checks (memory-bank/contracts.md). Compares the live
// schema of whatever Supabase project .env.local / the environment points at
// with the TypeScript twins of each string-keyed coupling.
//
//   npm run check:db-contracts            # skips (exit 0) if no credentials
//   npm run check:db-contracts -- --strict   # missing credentials = failure
//
// Reads two service-role RPCs: public.schema_contract_snapshot() (migration
// 20260921120000) and public.content_review_gate_column_drift() (20260914120000).
// Static, repo-only checks live in scripts/check-contracts.mjs.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const strict = process.argv.includes("--strict");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  const msg = "check-db-contracts: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set";
  if (strict) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.log(`· ${msg} — skipping database-side checks`);
  process.exit(0);
}

const root = process.cwd();
let failures = 0;
let warnings = 0;
const fail = (m) => {
  failures += 1;
  console.error(`✗ ${m}`);
};
const warn = (m) => {
  warnings += 1;
  console.warn(`! ${m}`);
};
const ok = (m) => console.log(`✓ ${m}`);
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const onlyIn = (a, b) => a.filter((x) => !b.includes(x));
const compareSets = (label, dbVals, tsVals, dbName, tsName) => {
  if (sameSet(dbVals, tsVals)) return ok(`${label}: ${dbName} and ${tsName} agree (${dbVals.length})`);
  fail(`${label}: only in ${dbName}: [${onlyIn(dbVals, tsVals)}] · only in ${tsName}: [${onlyIn(tsVals, dbVals)}]`);
};

async function rpc(name) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

const [snapshot, drift] = await Promise.all([rpc("schema_contract_snapshot"), rpc("content_review_gate_column_drift")]);

// TypeScript twins, loaded straight from source (type-only imports are erased).
const { DASHBOARD_SCOPES } = await import("../src/lib/notifications/scopes.ts");
const { BANNER_PLACEMENT_IDS } = await import("../src/lib/banner-placements.ts");
const { REVIEWABLE_FIELDS, CLEANER_PROFILE_FIELDS } = await import("../src/lib/content-change/fields.ts");
const { CONSENT_KINDS, CONSENT_SOURCES } = await import("../src/lib/consent/channels.ts");
const { Constants } = await import("../src/lib/types/database.generated.ts");

const checkList = (table, column) =>
  snapshot.check_value_lists.find((c) => c.table === table && c.column === column)?.values ?? null;

// C3 — every Postgres enum matches the generated Constants, label for label.
{
  const dbEnums = snapshot.enums;
  const tsEnums = Constants.public.Enums;
  compareSets("C3 enum names", Object.keys(dbEnums), Object.keys(tsEnums), "database", "database.generated.ts");
  for (const [name, labels] of Object.entries(dbEnums)) {
    const ts = tsEnums[name];
    if (!ts) continue;
    if (labels.length === ts.length && labels.every((l, i) => l === ts[i])) ok(`C3 enum ${name}: ${labels.length} labels match in order`);
    else fail(`C3 enum ${name}: database [${labels}] vs generated [${ts}] — regenerate types (npm run types:gen)`);
  }
}

// C19 — notification dashboard scopes.
{
  const db = checkList("notifications", "dashboard_scope");
  if (!db) fail("C19: notifications.dashboard_scope CHECK not found");
  else compareSets("C19 dashboard_scope", db, [...DASHBOARD_SCOPES], "CHECK constraint", "DASHBOARD_SCOPES");
}

// C12 — banner placements on both tables.
for (const table of ["ads", "landing_banners"]) {
  const db = checkList(table, "placement");
  if (!db) fail(`C12: ${table}.placement CHECK not found`);
  else compareSets(`C12 ${table}.placement`, db, [...BANNER_PLACEMENT_IDS], "CHECK constraint", "BANNER_PLACEMENTS");
}

// C30 — consent kinds/sources: the CHECK constraints on public.user_consents
// against the TS unions the API route and the RPC payloads are built from.
{
  const kinds = checkList("user_consents", "kind");
  if (!kinds) fail("C30: user_consents.kind CHECK not found");
  else compareSets("C30 consent kinds", kinds, [...CONSENT_KINDS], "CHECK constraint", "CONSENT_KINDS");

  const sources = checkList("user_consents", "source");
  if (!sources) fail("C30: user_consents.source CHECK not found");
  else compareSets("C30 consent sources", sources, [...CONSENT_SOURCES], "CHECK constraint", "CONSENT_SOURCES");
}

// C30 — marketing_opt_out must stay DERIVED. If the trigger is ever dropped,
// affirmative opt-in silently reverts to opt-out for every new user.
{
  const gate = snapshot.review_gate;
  // profiles must NOT review-gate the consent columns, or a user's own consent
  // write would 42501 and a legal opt-out would need admin approval (C14).
  const reviewable = gate?.profiles ?? [];
  const leaked = ["marketing_sms_consent", "marketing_email_consent", "push_consent",
    "terms_accepted_at", "privacy_accepted_at"].filter((c) => reviewable.includes(c));
  if (leaked.length) fail(`C30/C14: consent columns must never be reviewable, found: ${leaked.join(", ")}`);
  else ok("C30: consent columns are not review-gated");
}

// C14 — review-gate allow-list: trigger (B) vs TypeScript (A), and the drift
// RPC's trigger-vs-approve (B vs C) and column-existence directions.
{
  const gate = snapshot.review_gate;
  const pairs = [
    ["profiles", REVIEWABLE_FIELDS.profile],
    ["properties", REVIEWABLE_FIELDS.property],
    ["services", REVIEWABLE_FIELDS.service],
    ["organizations", REVIEWABLE_FIELDS.organization],
    ["cleaner_profiles", CLEANER_PROFILE_FIELDS],
  ];
  for (const [table, ts] of pairs) {
    if (!gate[table]) fail(`C14: trigger has no reviewable array for ${table}`);
    else if (!ts) warn(`C14: REVIEWABLE_FIELDS has no entry for ${table} (trigger gates ${gate[table].length} columns) — no submitting surface yet`);
    else compareSets(`C14 ${table}`, gate[table], [...ts], "trigger v_reviewable", "REVIEWABLE_FIELDS");
  }
  const hard = drift.filter((r) => r.issue !== "not_in_reviewable_list");
  if (hard.length) fail(`C14: content_review_gate_column_drift reports ${hard.length} issue(s): ${JSON.stringify(hard)}`);
  else ok("C14: trigger and approve_content_change_request arrays agree, every reviewable column exists");
}

// C7 — every literal postgres_changes subscription targets a published table.
{
  const subs = new Map(); // table -> [files]
  const walk = (dir) => {
    for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(e.name)) {
        const text = readFileSync(join(root, rel), "utf8");
        for (const m of text.matchAll(/postgres_changes["'][\s\S]{0,300}?table:\s*["']([a-z_]+)["']/g)) {
          if (!subs.has(m[1])) subs.set(m[1], new Set());
          subs.get(m[1]).add(rel);
        }
      }
    }
  };
  walk("src");
  const published = snapshot.realtime_tables;
  // Subscriptions known to target an unpublished table. Empty since
  // 2026-09-21, when the nine channels left behind by the 2026-07-12
  // publication trim were removed. Add an entry only as a deliberate,
  // temporary allow-list; a stale entry fails the check too.
  const KNOWN_DEAD = [];
  const dead = [...subs.keys()].filter((t) => !published.includes(t)).sort();
  const unexpected = onlyIn(dead, KNOWN_DEAD);
  const stale = onlyIn(KNOWN_DEAD, dead);
  if (unexpected.length) fail(`C7: new subscriptions on unpublished tables: ${unexpected.map((t) => `${t} (${[...subs.get(t)].join(", ")})`).join("; ")}`);
  if (stale.length) fail(`C7: KNOWN_DEAD lists tables no longer subscribed or now published — remove: ${stale}`);
  if (!unexpected.length && !stale.length) {
    ok(`C7: ${subs.size} subscribed tables checked against the publication`);
    if (dead.length) warn(`C7: ${dead.length} known-dead subscriptions still in code: ${dead.map((t) => `${t} ← ${[...subs.get(t)].join(", ")}`).join("; ")}`);
  }
}

// C4 — scheduled jobs. Infra state rather than code, so a warning.
{
  const expected = ["rate-limit-gc", "booking-finalize-daily", "sms-automation-daily", "sms-dispatch-frequent", "vip-lifecycle-daily"];
  const present = snapshot.cron_jobs.filter((j) => j.active).map((j) => j.name);
  const missing = onlyIn(expected, present);
  if (missing.length) warn(`C4: pg_cron jobs missing or inactive on ${new URL(url).host}: ${missing.join(", ")}`);
  else ok("C4: all 5 expected pg_cron jobs are active");
}

console.log(`\n${failures} failure(s), ${warnings} warning(s) against ${new URL(url).host}`);
process.exit(failures ? 1 : 0);

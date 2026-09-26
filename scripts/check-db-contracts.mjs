// Database-side contract checks (docs/contracts.md). Compares the live
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

async function rest(path) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

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
const { COMPANY_TIERS } = await import("../src/lib/org-tiers.ts");
const { PAYMENT_STATUSES, REFUND_STATUSES } = await import("../src/lib/payments/keepz/status.ts");
const { MEMBERSHIP_SEASONS, MEMBERSHIP_PRICE_TIERS, validateRenterMembershipMeta } = await import(
  "../src/lib/membership/plans.ts"
);

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
  const leaked = ["marketing_sms_consent", "marketing_email_consent", "marketing_whatsapp_consent", "push_consent",
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

// C11 — company subscription tiers: the organization_subscriptions.tier CHECK
// against COMPANY_TIERS, and every enabled organization package's code names a
// tier (purchase_company_subscription looks packages up as company-<tier>).
// C31 — seasonal renter memberships: every enabled renter package carries a
// valid season window, and at most one is enabled per (season, price tier) —
// the same rule the admin pricing-packages API enforces on writes.
{
  const tiers = checkList("organization_subscriptions", "tier");
  if (!tiers) fail("C11: organization_subscriptions.tier CHECK not found");
  else compareSets("C11 company tiers", tiers, [...COMPANY_TIERS], "CHECK constraint", "COMPANY_TIERS");

  const subscriptionPackages = await rest(
    "pricing_packages?select=code,meta&category=eq.subscription&is_enabled=eq.true",
  );
  const company = subscriptionPackages.filter((p) => p.meta?.subscription_scope === "organization");
  const badCompany = company.filter(
    (p) => !p.code.startsWith("company-") || !COMPANY_TIERS.includes(p.code.slice("company-".length)),
  );
  if (badCompany.length) fail(`C11: enabled organization packages whose code names no tier: ${badCompany.map((p) => p.code)}`);
  else ok(`C11: ${company.length} enabled company packages all map to COMPANY_TIERS`);

  const renter = subscriptionPackages.filter((p) => p.meta?.subscription_scope === "renter");
  const invalid = renter
    .map((p) => [p.code, validateRenterMembershipMeta(p.meta)])
    .filter(([, error]) => error);
  if (invalid.length) fail(`C31: enabled renter packages with invalid season meta: ${invalid.map(([c, e]) => `${c} (${e})`).join("; ")}`);
  const slots = new Map();
  for (const p of renter) {
    const slot = `${p.meta?.season}/${p.meta?.price_tier}`;
    slots.set(slot, [...(slots.get(slot) ?? []), p.code]);
  }
  const duplicated = [...slots].filter(([, codes]) => codes.length > 1);
  if (duplicated.length) fail(`C31: more than one enabled renter package per season/tier: ${duplicated.map(([s, c]) => `${s} → ${c}`).join("; ")}`);
  if (!invalid.length && !duplicated.length) ok(`C31: ${renter.length} enabled renter memberships, valid and one per season/price tier`);
  const empty = MEMBERSHIP_SEASONS.flatMap((season) => MEMBERSHIP_PRICE_TIERS.map((tier) => `${season}/${tier}`)).filter(
    (slot) => !slots.has(slot),
  );
  if (empty.length) warn(`C31: no enabled renter package for ${empty.join(", ")} — /pricing shows "—" there`);
}

// C32 — Keepz payment and refund states: the table CHECKs against the lists
// the routes and the admin UI are written against.
for (const [table, values, name] of [
  ["payments", PAYMENT_STATUSES, "PAYMENT_STATUSES"],
  ["payment_refunds", REFUND_STATUSES, "REFUND_STATUSES"],
]) {
  const db = checkList(table, "status");
  if (!db) fail(`C32: ${table}.status CHECK not found`);
  else compareSets(`C32 ${table}.status`, db, [...values], "CHECK constraint", name);
}

// C4 — scheduled jobs. Infra state rather than code, so a warning.
{
  const expected = ["rate-limit-gc", "booking-finalize-daily", "sms-automation-daily", "sms-dispatch-frequent", "vip-lifecycle-hourly"];
  const present = snapshot.cron_jobs.filter((j) => j.active).map((j) => j.name);
  const missing = onlyIn(expected, present);
  if (missing.length) warn(`C4: pg_cron jobs missing or inactive on ${new URL(url).host}: ${missing.join(", ")}`);
  else ok("C4: all 5 expected pg_cron jobs are active");
}

// C34 — privilege posture: public_* views are read-only for the API roles, no SECURITY
// DEFINER function is reachable by anon/PUBLIC outside the allow-list, every public table has
// RLS on, and postgres' default privileges grant the API roles nothing.
{
  const posture = await rpc("security_posture_snapshot");
  const ANON_DEFINER_ALLOW = ["is_admin_user()"];
  if (posture.writable_views.length) fail(`C34: anon/authenticated can write through views: ${posture.writable_views}`);
  else ok("C34: no view is writable by anon/authenticated");
  const anonExtra = onlyIn(posture.anon_definer_functions, ANON_DEFINER_ALLOW);
  if (anonExtra.length) fail(`C34: SECURITY DEFINER functions executable by anon: ${anonExtra.join(", ")}`);
  else ok(`C34: anon reaches only the allow-listed definer function(s): ${ANON_DEFINER_ALLOW}`);
  if (posture.public_definer_functions.length)
    fail(`C34: SECURITY DEFINER functions executable by PUBLIC: ${posture.public_definer_functions.join(", ")}`);
  else ok("C34: no definer function is executable by PUBLIC");
  if (posture.rls_disabled_tables.length) fail(`C34: public tables with RLS disabled: ${posture.rls_disabled_tables}`);
  else ok("C34: RLS is on for every public table");
  const leaky = posture.default_acl.filter((d) => /(^|[{,])(anon|authenticated)=/.test(d.acl));
  const globalFns = posture.default_acl.find((d) => d.schema === "*" && d.objtype === "f");
  const publicExec = !globalFns || /(^|[{,])=X/.test(globalFns.acl);
  if (leaky.length) fail(`C34: default privileges still grant API roles: ${leaky.map((d) => `${d.schema}/${d.objtype}`)}`);
  if (publicExec) fail("C34: new functions still get PUBLIC EXECUTE by default");
  if (!leaky.length && !publicExec) ok("C34: postgres default privileges grant nothing to anon/authenticated/PUBLIC");
}

console.log(`\n${failures} failure(s), ${warnings} warning(s) against ${new URL(url).host}`);
process.exit(failures ? 1 : 0);

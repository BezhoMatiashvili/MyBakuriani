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

// A project that has not had a migration yet (prod before the batch) lacks the RPC: report a
// failure and skip the checks that need it, instead of dying at a top-level await with no verdict.
async function tryRpc(name, migration) {
  try {
    return await rpc(name);
  } catch (error) {
    fail(`${name}() failed — added by migration ${migration}: ${error.message}`);
    return null;
  }
}

function finish() {
  console.log(`\n${failures} failure(s), ${warnings} warning(s) against ${new URL(url).host}`);
  process.exit(failures ? 1 : 0);
}

const [snapshot, drift] = await Promise.all([
  tryRpc("schema_contract_snapshot", "20260921120000"),
  tryRpc("content_review_gate_column_drift", "20260914120000"),
]);
if (!snapshot) finish(); // every check below reads the snapshot

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
  if (drift) {
    const hard = drift.filter((r) => r.issue !== "not_in_reviewable_list");
    if (hard.length) fail(`C14: content_review_gate_column_drift reports ${hard.length} issue(s): ${JSON.stringify(hard)}`);
    else ok("C14: trigger and approve_content_change_request arrays agree, every reviewable column exists");
  }
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

// C4 — scheduled jobs. A missing or inactive job fails: the Keepz sweeper and the email
// dispatcher are scheduled separately, once their Vault entries exist (20260925150200,
// 20260925160100), and without them lost Keepz callbacks are never credited (C32) and queued
// email is cancelled (C33) while every other check still passes. The two retention jobs
// (20260927091000, C37) prune cron run history and strip personal data after 90 days. The
// ownership-document purge (20261001200200, C39) deletes ID scans and registry extracts no
// request keeps any more (90 days after a reject/revoke) and bounds abandoned uploads. The SMS
// finance job (20261007200000, C50) keeps the SMS ledger synced and sends the low-balance
// warning. The free-period sweep (20261020120000, C53) is SQL-only: it grants what the
// sign-up trigger missed. The short-notice check-in job (20261023100000, C18) texts a booking
// the daily run cannot reach.
{
  const expected = [
    "rate-limit-gc", "booking-finalize-daily", "sms-automation-daily", "sms-dispatch-frequent", "vip-lifecycle-hourly",
    "keepz-reconcile-10min", "email-dispatch-5min", "cron-history-gc", "pii-retention-daily",
    "ownership-document-purge-hourly", "sms-finance-hourly", "free-period-apply-5min", "sms-check-in-short-notice",
  ];
  const present = snapshot.cron_jobs.filter((j) => j.active).map((j) => j.name);
  const missing = onlyIn(expected, present);
  if (missing.length) fail(`C4: pg_cron jobs missing or inactive on ${new URL(url).host}: ${missing.join(", ")}`);
  else ok(`C4: all ${expected.length} expected pg_cron jobs are active`);
}

// C34 — privilege posture: public_* views are read-only for the API roles, no SECURITY
// DEFINER function is reachable by anon/PUBLIC outside the allow-list, every public table has
// RLS on, and postgres' default privileges grant the API roles nothing.
const posture = await tryRpc("security_posture_snapshot", "20260926170100");
if (posture) {
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
  // S1 (*_s1_client_write_column_grants.sql): writes on the four browser-written tables. authenticated writes exactly
  // the columns its own payloads send (a new create-form key needs a GRANT migration, or the
  // form fails with 42501), anon writes nothing, and only the service role writes bookings.
  const noWrites = { insert: false, update: false, delete: false, truncate: false, insert_columns: [], update_columns: [] };
  const ownerWrites = (insert_columns, update_columns) => ({ ...noWrites, delete: true, insert_columns, update_columns });
  const EXPECTED_CLIENT_WRITES = {
    profiles: {
      anon: noWrites,
      authenticated: ownerWrites(["avatar_url", "bio", "display_name", "id", "phone", "role"], ["role"]),
    },
    properties: {
      anon: noWrites,
      authenticated: ownerWrites(
        [
          "amenities", "area_sqm", "bathrooms", "cadastral_code", "cadastral_code_public", "capacity",
          "completion_year", "construction_progress_percent", "construction_stages", "construction_status",
          "description", "developer", "hotel_rooms", "hotel_stars", "house_rules", "is_for_sale", "location",
          "location_lat", "location_lng",
          "min_booking_days", "organization_id", "owner_id", "phone", "photos", "price_per_night",
          "renovation_status", "roi_percent", "roi_percent_max", "rooms", "sale_price", "sale_price_currency",
          "sale_price_gel", "status", "title", "type", "units_reserved", "units_sold", "units_total", "whatsapp"
        ],
        ["cadastral_code_public", "organization_id"],
      ),
    },
    services: {
      anon: noWrites,
      authenticated: ownerWrites(
        [
          "accommodation", "activity_category", "activity_type", "age_min", "avg_check", "category", "coords",
          "cuisine_type", "description", "driver_name", "duration", "employment_type", "equipment",
          "experience_required", "features", "good_for", "has_delivery", "has_kids_area", "has_live_music",
          "has_lounge", "languages", "location", "meals", "menu_url", "operating_hours", "owner_id", "phone",
          "photos", "position", "price", "price_unit", "provider_name", "requirements", "restaurant_type",
          "route_pricing", "routes", "safety_notes", "salary_daily", "salary_max", "salary_min", "salary_range",
          "salary_type", "schedule", "service_field", "status", "title", "transport_type", "vehicle_capacity",
          "vehicle_color", "vehicle_make", "whatsapp"
        ],
        ["status"],
      ),
    },
    bookings: { anon: noWrites, authenticated: noWrites },
    // S2/S23 (*_s2_smart_match_sms_privacy_booking_lock.sql, *_s23_grant_hygiene_posture.sql):
    // guests insert the request form's keys and only cancel (status); manual bookings are written
    // through the owner RPCs only; reviews are closed to client writes (20261025180300).
    smart_match_requests: {
      anon: noWrites,
      authenticated: {
        ...noWrites,
        insert_columns: ["budget_max", "budget_min", "check_in", "check_out", "guest_id", "guests_count", "status", "zone"],
        update_columns: ["status"],
      },
    },
    manual_bookings: { anon: noWrites, authenticated: noWrites },
    reviews: { anon: noWrites, authenticated: noWrites },
  };
  const grants = posture.client_write_grants;
  if (!grants) fail("C34: security_posture_snapshot() has no client_write_grants — apply the S1 client write grants migration");
  else {
    const drift = [];
    for (const [table, roles] of Object.entries(EXPECTED_CLIENT_WRITES))
      for (const [role, want] of Object.entries(roles))
        for (const [key, value] of Object.entries(want)) {
          const got = grants[table]?.[role]?.[key];
          if (!Array.isArray(value)) {
            if (got !== value) drift.push(`${table}.${role}.${key}=${got} (expected ${value})`);
            continue;
          }
          const extra = onlyIn(got ?? [], value);
          const missing = onlyIn(value, got ?? []);
          if (extra.length || missing.length) drift.push(`${table}.${role}.${key} extra [${extra}] missing [${missing}]`);
        }
    if (drift.length) fail(`C34: client write grants differ from EXPECTED_CLIENT_WRITES: ${drift.join("; ")}`);
    else ok("C34: anon writes none of the client tables, authenticated only the payload columns, bookings and manual_bookings nothing");
  }
  // 20261013150000: no API role holds TRUNCATE (it does not run RLS), TRIGGER, REFERENCES or MAINTAIN on a
  // public relation, anon inserts nowhere, and the tables only server code writes take no client writes.
  // Every SECURITY DEFINER function authenticated can execute binds auth.uid()/ownership (audited
  // 2026-10-13); a new one must be reviewed and added here.
  const AUTH_DEFINER_ALLOW = [
    "add_renter_guest_to_blacklist(text,text,text)", "apply_calendar_availability(uuid,date[],text)",
    "cancel_manual_booking(uuid)", "create_cleaning_task(uuid,uuid,text,timestamp with time zone,text,text)",
    "create_guest_manual_booking(uuid,date,date,text,text,text,boolean,numeric,numeric,date)",
    "create_manual_booking(uuid,date,date,text,text,text,integer,numeric,text,text,text,uuid,boolean,numeric,date)",
    "create_organization(text,text,text,text,text,text,text,text,text,text,text,double precision,double precision)",
    "get_cleaner_renter_counts()", "get_cleaning_task_contact(uuid)", "get_my_cleaning_task_cleaner_details()",
    "get_my_cleaning_task_owner_details()", "get_platform_cleaners()", "is_admin_user()", "is_approved_org_member(uuid)",
    "listing_analytics(text,uuid,integer)",
    "owner_dashboard_stats(text,timestamp with time zone,timestamp with time zone,uuid[],uuid)",
    "request_organization_membership(uuid)", "respond_membership_request(uuid,text)", "restore_manual_booking(uuid)",
    "seller_dashboard_stats(timestamp with time zone,timestamp with time zone,uuid[],uuid)",
    "transition_cleaning_task(uuid,text)",
    "update_manual_booking(uuid,date,date,text,text,text,integer,numeric,text,text,text,uuid,boolean,numeric,date)",
  ];
  const authDefiner = posture.authenticated_definer_functions;
  if (!authDefiner) fail("C34: security_posture_snapshot() has no authenticated_definer_functions — apply 20261013150000_client_privilege_hygiene.sql");
  else {
    const extra = onlyIn(authDefiner, AUTH_DEFINER_ALLOW);
    if (extra.length) fail(`C34: SECURITY DEFINER functions newly executable by authenticated (review, then allow-list): ${extra.join(", ")}`);
    else ok(`C34: authenticated reaches only the ${AUTH_DEFINER_ALLOW.length} reviewed definer functions`);
  }
  const hygiene = posture.client_privilege_hygiene;
  if (!hygiene) fail("C34: security_posture_snapshot() has no client_privilege_hygiene — apply 20261013150000_client_privilege_hygiene.sql");
  else {
    const drift = [
      ...hygiene.rls_bypass_grants.map((g) => `rls-bypass ${g}`),
      ...hygiene.anon_insert_relations.map((t) => `anon-insert ${t}`),
      ...hygiene.server_only_client_writes.map((g) => `server-only ${g}`),
    ];
    if (drift.length) fail(`C34: client privilege hygiene drifted: ${drift.join(", ")}`);
    else ok("C34: no client TRUNCATE/TRIGGER/REFERENCES/MAINTAIN, anon inserts nowhere, server-only tables take no client writes");
  }
  // C5 storage (20261013150500 / 150600 / 150900 / 151100): the upload budget and bucket type triggers are enabled,
  // only the two folder-pinned UPDATE policies remain, no storage policy is open to anon/PUBLIC, and
  // anon cannot list the public buckets (behavioural). A SELECT policy that reaches only authenticated is not seen
  // here: 20261013150600 checks a signed-in stranger at apply time only.
  const storage = posture.storage;
  if (!storage) fail("C5: security_posture_snapshot() has no storage section — apply 20261013150000_client_privilege_hygiene.sql");
  else {
    const problems = [];
    if (storage.budget_trigger_enabled !== true)
      problems.push("trigger enforce_storage_upload_budget is missing or disabled (apply 20261013150900)");
    if (storage.mime_trigger_enabled !== true)
      problems.push("trigger enforce_storage_object_mime is missing or disabled (apply 20261013151100)");
    const extraUpdate = onlyIn(storage.update_policies, ["avatars owner update", "landing-media admin update"]);
    if (extraUpdate.length)
      problems.push(`UPDATE policies beyond the two folder-pinned ones (a move refills the budget): ${extraUpdate.join(", ")}`);
    if (storage.policies_open_to_anon.length)
      problems.push(`policies open to anon/PUBLIC: ${storage.policies_open_to_anon.join(", ")}`);
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!anonKey) warn("C5: NEXT_PUBLIC_SUPABASE_ANON_KEY not set — skipped the anonymous listing check");
    else
      for (const bucket of ["property-photos", "logos", "avatars", "restaurant-menus", "landing-media"]) {
        const res = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
          method: "POST",
          headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ prefix: "", limit: 1 }),
        });
        const body = (await res.text()).trim();
        if (res.status !== 200 || body !== "[]") problems.push(`anon can list ${bucket} (HTTP ${res.status}: ${body.slice(0, 80)})`);
      }
    if (problems.length) problems.forEach((p) => fail(`C5: ${p}`));
    else ok("C5: upload budget and bucket type triggers enabled, only folder-pinned UPDATE policies, nothing open to anon, public buckets not listable");
  }
}

// C24 — a cleaner's view of a call-out comes only through get_my_cleaning_task_owner_details() (RLS hides
// properties/profiles from a cleaner). A project that is behind migration 20261001093000 lacks the RPC or some
// of its columns, and every cleaner card would say the details could not be loaded: fail here instead.
// Called with the service role (auth.uid() is NULL, so it returns zero rows); PostgREST still resolves the
// function and every selected column, so a missing function (404 PGRST202) or column (400 42703) is a failure.
{
  const tasksTs = readFileSync(join(root, "src/lib/cleaner/tasks.ts"), "utf8");
  const columns = [...(tasksTs.match(/export interface CleaningTaskOwnerDetails\s*\{([\s\S]*?)\n\}/)?.[1] ?? "").matchAll(/^\s*([a-z_]+)\??:/gm)].map((m) => m[1]);
  if (!columns.length) fail("C24: could not read CleaningTaskOwnerDetails from src/lib/cleaner/tasks.ts");
  else {
    const res = await fetch(`${url}/rest/v1/rpc/get_my_cleaning_task_owner_details?select=${columns.join(",")}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: "{}",
    });
    if (res.ok) ok(`C24: get_my_cleaning_task_owner_details() exists and exposes all ${columns.length} columns CleaningTaskOwnerDetails lists`);
    else fail(`C24: get_my_cleaning_task_owner_details() with its ${columns.length} CleaningTaskOwnerDetails columns failed (HTTP ${res.status} ${(await res.text()).slice(0, 160)}) — apply migration 20261001093000 (cleaners would see no apartment or owner)`);
  }
}

// C39 — ownership verification. ownership_contract_snapshot() (migration 20261001200000) reports the
// private bucket, every storage.objects policy that names it or tests no bucket_id, the client grants on
// both tables (direct, column-level and PUBLIC), RLS, the named CHECK constraints and the three triggers
// (the two basis triggers keep `status` truthful, so a dropped or disabled one leaves stale badges).
{
  const own = await tryRpc("ownership_contract_snapshot", "20261001200000");
  if (own) {
    const docTs = readFileSync(join(root, "src/lib/ownership/document-file.ts"), "utf8");
    const tsList = (name) =>
      [...(docTs.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\]`))?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    const dbList = (constraint) => [...String(own.checks?.[constraint] ?? "").matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);
    compareSets("C39 document kinds", dbList("ownership_verification_documents_kind_check"), tsList("OWNERSHIP_DOCUMENT_KINDS"), "kind CHECK", "OWNERSHIP_DOCUMENT_KINDS");
    compareSets("C39 statuses", dbList("ownership_verifications_status_check"), tsList("OWNERSHIP_VERIFICATION_STATUSES"), "status CHECK", "OWNERSHIP_VERIFICATION_STATUSES");

    const grants = own.client_grants ?? [];
    const hidden = ["reviewed_by", "identity_document_id", "registry_extract_document_id"];
    const bad = grants.filter(
      (g) =>
        g.table === "ownership_verification_documents" ||
        g.privilege !== "SELECT" ||
        g.grantee !== "authenticated" ||
        g.column === null ||
        hidden.includes(g.column),
    );
    if (bad.length) fail(`C39: client grants beyond the owner's column-level SELECT: ${bad.map((g) => `${g.table}.${g.grantee}.${g.privilege}${g.column ? `(${g.column})` : ""}`).join(", ")}`);
    else ok(`C39: no client role writes either table; authenticated reads ${grants.length} ownership_verifications columns (no reviewer, no document ids)`);

    const rls = own.rls ?? {};
    if (rls.ownership_verifications === true && rls.ownership_verification_documents === true) ok("C39: RLS is on for both tables");
    else fail(`C39: RLS off on ${Object.entries(rls).filter(([, on]) => on !== true).map(([t]) => t).join(", ") || "a table"}`);

    const mimes = [...(docTs.match(/OWNERSHIP_DOCUMENT_CONTENT_TYPES[\s\S]*?\{([\s\S]*?)\}/)?.[1] ?? "").matchAll(/"([a-z]+\/[a-z]+)"/g)].map((m) => m[1]);
    const bucket = own.bucket;
    if (!bucket) fail("C39: bucket ownership-documents is missing");
    else {
      if (bucket.public !== false) fail("C39: bucket ownership-documents is PUBLIC (ID cards would be world-readable)");
      if (Number(bucket.file_size_limit) !== 10485760) fail(`C39: bucket file_size_limit ${bucket.file_size_limit} ≠ 10485760 (MAX_OWNERSHIP_DOCUMENT_BYTES)`);
      compareSets("C39 bucket MIME list", bucket.allowed_mime_types ?? [], mimes, "bucket", "OWNERSHIP_DOCUMENT_CONTENT_TYPES");
      if (bucket.public === false && Number(bucket.file_size_limit) === 10485760) ok("C39: bucket ownership-documents is private with a 10 MiB limit");
    }
    if ((own.policies_mentioning_bucket ?? []).length) fail(`C39: storage.objects policies name ownership-documents (browsers must never reach it): ${own.policies_mentioning_bucket.join(", ")}`);
    else ok("C39: no storage.objects policy names ownership-documents");
    if ((own.policies_without_bucket_test ?? []).length) fail(`C39: storage.objects policies without a bucket_id test (they would cover every bucket, ownership-documents included): ${own.policies_without_bucket_test.join(", ")}`);
    else ok("C39: every storage.objects policy is scoped to a bucket");

    const triggers = own.triggers ?? {};
    const expectedTriggers = ["ownership_close_on_property_basis_change", "ownership_close_on_service_basis_change", "ownership_documents_enforce_limit"];
    const off = expectedTriggers.filter((t) => !["O", "A"].includes(triggers[t]));
    if (off.length) fail(`C39: triggers missing or disabled: ${off.join(", ")}`);
    else ok("C39: basis triggers and the per-owner file cap are enabled");

    // What each basis trigger watches (snapshot key from 20261001200150). A basis column missing from
    // UPDATE OF or from the WHEN keeps the badge on a moved or re-registered listing; an extra column,
    // or a WHEN that does not compare values, revokes it on ordinary edits (content-change approval and
    // the admin editor rewrite every reviewable column).
    const BASIS = {
      ownership_close_on_property_basis_change: ["public.properties", "close_ownership_on_property_change", ["owner_id", "cadastral_code", "location", "location_lat", "location_lng"]],
      ownership_close_on_service_basis_change: ["public.services", "close_ownership_on_service_change", ["owner_id", "title", "provider_name", "category"]],
    };
    const basisDefs = own.basis_trigger_defs;
    if (!basisDefs) fail("C39: ownership_contract_snapshot() has no basis_trigger_defs — apply 20261001200150_ownership_review_separation.sql");
    else {
      const wrong = [];
      for (const [name, [table, fn, columns]] of Object.entries(BASIS)) {
        const def = String(basisDefs[name]?.def ?? "");
        const head = def.match(/\bAFTER UPDATE OF (.+?) ON (\S+) FOR EACH ROW WHEN \((.*)\) EXECUTE FUNCTION (?:public\.)?([a-z_]+)\(\)$/);
        if (!head) {
          wrong.push(`${name}: ${def ? `unexpected definition: ${def}` : "missing"}`);
          continue;
        }
        const [, updateOf, onTable, when, calls] = head;
        if (onTable !== table || basisDefs[name].table !== table) wrong.push(`${name}: on ${onTable}, expected ${table}`);
        if (calls !== fn) wrong.push(`${name}: calls ${calls}(), expected ${fn}()`);
        const listed = updateOf.split(/,\s*/);
        if ([...listed].sort().join() !== [...columns].sort().join()) wrong.push(`${name}: UPDATE OF ${listed.join(", ")}; expected ${columns.join(", ")}`);
        const referenced = [...new Set([...when.matchAll(/\bold\.([a-z_]+)/g)].map((m) => m[1]))];
        if ([...referenced].sort().join() !== [...columns].sort().join()) wrong.push(`${name}: WHEN reads old.${referenced.join(", old.")}; expected ${columns.join(", ")}`);
        // Each column compared old-vs-new inside one OR branch.
        const uncompared = columns.filter((c) => !new RegExp(`\\bold\\.${c}\\b(?:(?! OR ).)*? IS DISTINCT FROM (?:(?! OR ).)*?\\bnew\\.${c}\\b`).test(when));
        if (uncompared.length) wrong.push(`${name}: WHEN does not compare ${uncompared.join(", ")} by value (IS DISTINCT FROM)`);
      }
      if (wrong.length) fail(`C39: basis triggers drifted — ${wrong.join("; ")}`);
      else ok("C39: basis triggers watch exactly owner/cadastral code/address/pin and owner/title/provider/category, compared by value");
    }
  }
}

// C42 — finance module. finance_contract_snapshot() (migration 20261005120000) reports the
// finance tables' RLS, every anon/authenticated/PUBLIC privilege on the tables, views and
// finance functions (all must be service_role only), the private finance-documents bucket and
// any storage policy naming it, the CHECK constraints and the triggers that keep the ledger
// append-only (forbid-delete, guards) and audited (trg_audit_row).
{
  const fin = await tryRpc("finance_contract_snapshot", "20261005120000");
  if (fin) {
    const constantsTs = readFileSync(join(root, "src/lib/finance/constants.ts"), "utf8");
    const tsList = (name) =>
      [...(constantsTs.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\]`))?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const dbList = (constraint) => [...String(fin.checks?.[constraint] ?? "").matchAll(/'([^']+)'::text/g)].map((m) => m[1]);
    for (const [constraint, constant] of [
      ["finance_entries_kind_check", "ENTRY_KINDS"],
      ["finance_entries_status_check", "ENTRY_STATUSES"],
      ["finance_entries_revenue_type_check", "REVENUE_TYPES"],
      ["finance_entries_payment_method_check", "PAYMENT_METHODS"],
      ["finance_expenses_category_check", "EXPENSE_CATEGORIES"],
      ["finance_documents_doc_type_check", "DOCUMENT_TYPES"],
      ["finance_documents_status_check", "DOCUMENT_STATUSES"],
      ["invoices_status_check", "INVOICE_STATUSES"],
      ["invoices_recipient_type_check", "RECIPIENT_TYPES"],
    ]) {
      compareSets(`C42 ${constraint}`, dbList(constraint), tsList(constant), "CHECK", constant);
    }

    const rls = fin.rls ?? {};
    const tables = ["finance_settings", "finance_entries", "finance_expenses", "finance_documents", "invoices", "invoice_counters", "invoice_templates"];
    const rlsOff = tables.filter((t) => rls[t] !== true);
    if (rlsOff.length) fail(`C42: RLS off (or table missing) on ${rlsOff.join(", ")}`);
    else ok(`C42: RLS is on for all ${tables.length} finance tables`);

    const grants = fin.client_grants ?? [];
    if (grants.length) fail(`C42: client privileges on finance tables/views (service_role only): ${grants.map((g) => `${g.table}.${g.grantee}.${g.privilege}`).join(", ")}`);
    else ok("C42: anon, authenticated and PUBLIC hold nothing on the finance tables and views");
    const fnGrants = fin.client_function_grants ?? [];
    if (fnGrants.length) fail(`C42: finance functions executable by anon/authenticated/PUBLIC: ${fnGrants.join(", ")}`);
    else ok("C42: every finance function is service_role only");

    const bucket = fin.bucket;
    if (!bucket) fail("C42: bucket finance-documents is missing");
    else {
      if (bucket.public !== false) fail("C42: bucket finance-documents is PUBLIC (invoices, contracts and receipts would be world-readable)");
      if (Number(bucket.file_size_limit) !== 10485760) fail(`C42: bucket file_size_limit ${bucket.file_size_limit} ≠ 10485760 (MAX_FINANCE_DOCUMENT_BYTES)`);
      compareSets("C42 bucket MIME list", bucket.allowed_mime_types ?? [], tsList("FINANCE_DOCUMENT_CONTENT_TYPES"), "bucket", "FINANCE_DOCUMENT_CONTENT_TYPES");
      if (bucket.public === false && Number(bucket.file_size_limit) === 10485760) ok("C42: bucket finance-documents is private with a 10 MiB limit");
    }
    if ((fin.policies_mentioning_bucket ?? []).length) fail(`C42: storage.objects policies name finance-documents (only the service-role routes may reach it): ${fin.policies_mentioning_bucket.join(", ")}`);
    else ok("C42: no storage.objects policy names finance-documents");

    const triggers = fin.triggers ?? {};
    const required = [
      ...["finance_entries", "finance_expenses", "finance_documents", "invoices"].map((t) => `public.${t}.${t}_forbid_delete`),
      "public.finance_entries.finance_entries_guard",
      "public.finance_expenses.finance_expenses_guard",
      "public.finance_documents.finance_documents_guard",
      "public.invoices.invoices_guard",
      ...["finance_entries", "finance_expenses", "finance_documents", "invoices", "invoice_templates", "finance_settings"].map((t) => `public.${t}.trg_audit_row`),
    ];
    const broken = required.filter((name) => !["O", "A"].includes(triggers[name]));
    if (broken.length) fail(`C42: triggers missing or disabled (ledger no longer append-only/audited): ${broken.join(", ")}`);
    else ok(`C42: ${required.length} forbid-delete, guard and audit triggers are enabled`);
  }
}

// C42 purchases (migration 20261028140100). admin_purchases_report()'s total gross equals
// finance_wallet_usage()'s purchases, all time and for the last 90 days, over a closed hourly
// window (no purchase lands mid-check); anon reaches neither the view nor the RPC.
{
  const call = async (apikey, path, body) => {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers: { apikey, Authorization: `Bearer ${apikey}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, text: await res.text() };
  };
  const cents = (n) => Math.round(Number(n) * 100);
  const hour = 3_600_000;
  const to = new Date(Math.floor(Date.now() / hour) * hour).toISOString();
  const problems = [];
  for (const from of [null, new Date(Date.parse(to) - 90 * 24 * hour).toISOString()]) {
    const w = { p_from: from, p_to: to };
    const [rep, use] = await Promise.all([call(key, "rpc/admin_purchases_report", w), call(key, "rpc/finance_wallet_usage", w)]);
    if (rep.status !== 200 || use.status !== 200) {
      problems.push(`admin_purchases_report/finance_wallet_usage HTTP ${rep.status}/${use.status} — apply migration 20261028140100`);
      break;
    }
    const ours = cents(JSON.parse(rep.text).summary?.gross);
    const theirs = JSON.parse(use.text).reduce((s, r) => s + cents(r.purchases), 0);
    if (ours !== theirs) problems.push(`${from ? "last 90 days" : "all time"}: purchases gross ${ours / 100} ≠ finance_wallet_usage ${theirs / 100}`);
  }
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anon) warn("C42 purchases: NEXT_PUBLIC_SUPABASE_ANON_KEY not set — skipped the anon checks");
  else {
    if ((await call(anon, "admin_purchases_v?select=id&limit=1")).status === 200) problems.push("anon can read admin_purchases_v");
    if ((await call(anon, "rpc/admin_purchases_report", {})).status === 200) problems.push("anon can execute admin_purchases_report");
  }
  if (problems.length) problems.forEach((p) => fail(`C42 purchases: ${p}`));
  else ok("C42 purchases: report gross = finance_wallet_usage (all time, 90 days); anon refused on the view and the RPC");
}

// C44 — admin status management (migration 20261006120000). The membership status CHECK
// equals MEMBERSHIP_STATUSES; the three admin views answer for the service role; each change
// RPC exists and refuses a non-admin actor before anything else (ADMIN_STATUS_FORBIDDEN);
// the anon key can neither read the views nor call the RPCs (they are service_role only).
{
  const { MEMBERSHIP_STATUSES } = await import("../src/lib/admin-statuses.ts");
  const db = checkList("user_subscriptions", "status");
  if (!db) fail("C44: user_subscriptions.status CHECK not found (migration 20261006120000)");
  else compareSets("C44 user_subscriptions.status", db, [...MEMBERSHIP_STATUSES], "CHECK constraint", "MEMBERSHIP_STATUSES");

  const views = ["admin_membership_overview_v", "admin_listing_promotions_v", "admin_company_plans_v"];
  const nobody = "00000000-0000-0000-0000-000000000000";
  const calls = [
    ["admin_change_memberships", { p_admin_id: nobody, p_action: "extend", p_user_ids: [nobody], p_days: 1 }],
    ["admin_change_listing_promotions", { p_admin_id: nobody, p_action: "vip_end", p_targets: [{ kind: "property", id: nobody }] }],
    ["admin_change_company_plans", { p_admin_id: nobody, p_action: "end", p_org_ids: [nobody] }],
  ];
  const call = async (apikey, path, body) => {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers: { apikey, Authorization: `Bearer ${apikey}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, text: await res.text() };
  };
  const problems = [];
  for (const view of views) {
    const res = await call(key, `${view}?select=*&limit=1`);
    if (res.status !== 200) problems.push(`${view} is not readable by the service role (HTTP ${res.status}: ${res.text.slice(0, 120)})`);
  }
  for (const [fn, body] of calls) {
    const res = await call(key, `rpc/${fn}`, body);
    if (!res.text.includes("ADMIN_STATUS_FORBIDDEN")) problems.push(`${fn} did not refuse a non-admin actor (HTTP ${res.status}: ${res.text.slice(0, 120)})`);
  }
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anon) warn("C44: NEXT_PUBLIC_SUPABASE_ANON_KEY not set — skipped the anon checks");
  else {
    for (const view of views) {
      const res = await call(anon, `${view}?select=*&limit=1`);
      if (res.status === 200) problems.push(`anon can read ${view}`);
    }
    for (const [fn, body] of calls) {
      const res = await call(anon, `rpc/${fn}`, body);
      if (res.status === 200 || res.text.includes("ADMIN_STATUS_FORBIDDEN")) problems.push(`anon can execute ${fn}`);
    }
  }
  if (problems.length) problems.forEach((p) => fail(`C44: ${p}`));
  else ok(`C44: ${views.length} admin views and ${calls.length} change RPCs exist, refuse non-admins and are closed to anon`);
}

// C50 — SMS financial control (migration 20261007200000). The ledger's type and status CHECKs
// equal SMS_CATEGORIES / SMS_LEDGER_STATUSES; the tables and read RPCs answer for the service
// role; a purchase by a non-admin actor is refused before anything is written; anon reaches
// neither the tables nor the RPCs (service_role only, C34).
{
  const { SMS_CATEGORIES, SMS_LEDGER_STATUSES } = await import("../src/lib/finance/sms.ts");
  for (const [column, list, name] of [
    ["category", SMS_CATEGORIES, "SMS_CATEGORIES"],
    ["status", SMS_LEDGER_STATUSES, "SMS_LEDGER_STATUSES"],
  ]) {
    const db = checkList("sms_usage_ledger", column);
    if (!db) fail(`C50: sms_usage_ledger.${column} CHECK not found (migration 20261007200000)`);
    else compareSets(`C50 sms_usage_ledger.${column}`, db, [...list], "CHECK constraint", name);
  }
  const call = async (apikey, path, body) => {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers: { apikey, Authorization: `Bearer ${apikey}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, text: await res.text() };
  };
  const tables = ["sms_usage_ledger", "sms_provider_purchases"];
  const reads = [["admin_sms_finance_purchases", {}], ["admin_sms_finance_ledger", { p_limit: 1 }]];
  const nobody = "00000000-0000-0000-0000-000000000000";
  const write = ["finance_record_sms_purchase", { p_actor: nobody, p_date: "2026-01-01", p_units: 1, p_amount: 1 }];
  const problems = [];
  for (const table of tables) {
    const res = await call(key, `${table}?select=id&limit=1`);
    if (res.status !== 200) problems.push(`${table} is not readable by the service role (HTTP ${res.status}: ${res.text.slice(0, 120)})`);
  }
  for (const [fn, body] of reads) {
    const res = await call(key, `rpc/${fn}`, body);
    if (res.status !== 200) problems.push(`${fn} failed for the service role (HTTP ${res.status}: ${res.text.slice(0, 120)})`);
  }
  const refused = await call(key, `rpc/${write[0]}`, write[1]);
  if (!refused.text.includes("admin actor required")) {
    problems.push(`${write[0]} did not refuse a non-admin actor (HTTP ${refused.status}: ${refused.text.slice(0, 120)})`);
  }
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anon) warn("C50: NEXT_PUBLIC_SUPABASE_ANON_KEY not set — skipped the anon checks");
  else {
    for (const table of tables) {
      const res = await call(anon, `${table}?select=id&limit=1`);
      if (res.status === 200) problems.push(`anon can read ${table}`);
    }
    for (const [fn, body] of [...reads, write]) {
      const res = await call(anon, `rpc/${fn}`, body);
      if (res.status === 200 || res.text.includes("admin actor required")) problems.push(`anon can execute ${fn}`);
    }
  }
  if (problems.length) problems.forEach((p) => fail(`C50: ${p}`));
  else ok(`C50: SMS ledger CHECKs match, ${tables.length} tables and the SMS RPCs answer the service role only, a non-admin purchase is refused`);
}

// C52 — admin verified users and payer groups (migration 20261016100000). The role CHECK equals USER_GROUP_ROLES;
// both group tables answer the service role and are refused to anon with a permission error (a 200, even with no
// rows, would mean a client grant); admin_save_user_group refuses a non-admin actor with its FORBIDDEN token before
// it writes anything (all six arguments are sent, so the call resolves whether or not p_group_id / p_note carry a
// DEFAULT; the all-zero uuid is no profile) and is refused to anon the same way; and the posture snapshot shows no
// client route to the RPC and RLS on for both tables. authenticated cannot be probed without a session, and making
// one would write to the project: its denial is the static check-contracts C52 plus the posture lists below (C34).
{
  const { USER_GROUP_ROLES } = await import("../src/lib/user-groups.ts");
  const tables = ["user_groups", "user_group_members"];
  const rpc = "admin_save_user_group";
  const token = "ADMIN_USER_GROUP_FORBIDDEN";
  const nobody = "00000000-0000-0000-0000-000000000000";
  const args = { p_admin_id: nobody, p_name: "x", p_payer_id: nobody, p_member_ids: [nobody], p_group_id: null, p_note: null };
  const call = async (apikey, path, body) => {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers: { apikey, Authorization: `Bearer ${apikey}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, text: await res.text() };
  };
  // A permission error (401/403 with SQLSTATE 42501), not just "not 200": a missing object answers 404.
  const refusedToClient = (res) => [401, 403].includes(res.status) && res.text.includes('"code":"42501"');

  const roles = checkList("user_group_members", "role");
  if (!roles) fail("C52: user_group_members.role CHECK not found (migration 20261016100000)");
  else compareSets("C52 user_group_members.role", roles, [...USER_GROUP_ROLES], "CHECK constraint", "USER_GROUP_ROLES");

  const problems = [];
  for (const table of tables) {
    const res = await call(key, `${table}?select=id&limit=1`);
    if (res.status !== 200) problems.push(`${table} is not readable by the service role (HTTP ${res.status}: ${res.text.slice(0, 120)}) — apply migration 20261016100000`);
  }
  const refused = await call(key, `rpc/${rpc}`, args);
  if (refused.status !== 403 || !refused.text.includes(token)) problems.push(`${rpc} did not refuse a non-admin actor with ${token} (HTTP ${refused.status}: ${refused.text.slice(0, 120)})`);
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anon) warn("C52: NEXT_PUBLIC_SUPABASE_ANON_KEY not set — skipped the anon checks");
  else {
    for (const table of tables) {
      const res = await call(anon, `${table}?select=id&limit=1`);
      if (!refusedToClient(res)) problems.push(`anon was not refused on ${table} (HTTP ${res.status}: ${res.text.slice(0, 120)}); a 200 means a client grant`);
    }
    const res = await call(anon, `rpc/${rpc}`, args);
    if (!refusedToClient(res) || res.text.includes(token)) problems.push(`anon was not refused on ${rpc} (HTTP ${res.status}: ${res.text.slice(0, 120)})`);
  }
  if (posture) {
    const reachable = [["anon", posture.anon_definer_functions], ["PUBLIC", posture.public_definer_functions], ["authenticated", posture.authenticated_definer_functions]]
      .filter(([, list]) => (list ?? []).some((f) => f.startsWith(`${rpc}(`)))
      .map(([who]) => who);
    if (reachable.length) problems.push(`${rpc} is executable by ${reachable.join(", ")} (service_role only, C34)`);
    const noRls = (posture.rls_disabled_tables ?? []).filter((t) => tables.some((name) => String(t).endsWith(name)));
    if (noRls.length) problems.push(`RLS is off on ${noRls.join(", ")}`);
  }
  if (problems.length) problems.forEach((p) => fail(`C52: ${p}`));
  else ok(`C52: ${tables.length} group tables answer the service role and are refused to anon (42501), ${rpc} refuses a non-admin actor and is refused to anon, no client role reaches it, RLS is on`);
}

// C53 — admin free periods (migration 20261020120000). The benefit CHECK equals FREE_PERIOD_BENEFITS; both period tables
// answer the service role and are refused to anon with a permission error (a 200, even with no rows, would mean a client
// grant); admin_free_period_stats refuses a non-admin actor with its FORBIDDEN token before it reads anything (the all-zero
// uuid is no profile); the three service-role entry points are refused to anon (a refused call runs nothing); and the
// posture snapshot shows no client route to any free-period function and RLS on for both tables. The service role never
// calls free_period_apply here (it writes to the project), and authenticated cannot be probed without a session: its denial
// is the static check-contracts C53 plus the posture lists below (C34).
{
  const { FREE_PERIOD_BENEFITS } = await import("../src/lib/free-periods.ts");
  const tables = ["free_periods", "free_period_grants"];
  const token = "ADMIN_STATUS_FORBIDDEN";
  const nobody = "00000000-0000-0000-0000-000000000000";
  const entryPoints = [
    ["free_period_apply", { p_period: nobody, p_limit: 1 }],
    ["free_period_apply_all", { p_limit: 1 }],
    ["admin_free_period_stats", { p_admin_id: nobody }],
  ];
  const call = async (apikey, path, body) => {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers: { apikey, Authorization: `Bearer ${apikey}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, text: await res.text() };
  };
  // A permission error (401/403 with SQLSTATE 42501), not just "not 200": a missing object answers 404.
  const refusedToClient = (res) => [401, 403].includes(res.status) && res.text.includes('"code":"42501"');

  const benefits = checkList("free_periods", "benefit");
  if (!benefits) fail("C53: free_periods.benefit CHECK not found (migration 20261020120000)");
  else compareSets("C53 free_periods.benefit", benefits, [...FREE_PERIOD_BENEFITS], "CHECK constraint", "FREE_PERIOD_BENEFITS");

  const problems = [];
  for (const table of tables) {
    const res = await call(key, `${table}?select=id&limit=1`);
    if (res.status !== 200) problems.push(`${table} is not readable by the service role (HTTP ${res.status}: ${res.text.slice(0, 120)}) — apply migration 20261020120000`);
  }
  const refused = await call(key, "rpc/admin_free_period_stats", { p_admin_id: nobody });
  if (refused.status !== 403 || !refused.text.includes(token)) problems.push(`admin_free_period_stats did not refuse a non-admin actor with ${token} (HTTP ${refused.status}: ${refused.text.slice(0, 120)})`);
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anon) warn("C53: NEXT_PUBLIC_SUPABASE_ANON_KEY not set — skipped the anon checks");
  else {
    for (const table of tables) {
      const res = await call(anon, `${table}?select=id&limit=1`);
      if (!refusedToClient(res)) problems.push(`anon was not refused on ${table} (HTTP ${res.status}: ${res.text.slice(0, 120)}); a 200 means a client grant`);
    }
    for (const [rpc, args] of entryPoints) {
      const res = await call(anon, `rpc/${rpc}`, args);
      if (!refusedToClient(res) || res.text.includes(token)) problems.push(`anon was not refused on ${rpc} (HTTP ${res.status}: ${res.text.slice(0, 120)})`);
    }
  }
  if (posture) {
    const reachable = [["anon", posture.anon_definer_functions], ["PUBLIC", posture.public_definer_functions], ["authenticated", posture.authenticated_definer_functions]]
      .map(([who, list]) => [who, (list ?? []).filter((f) => /free_period/.test(f))])
      .filter(([, list]) => list.length)
      .map(([who, list]) => `${who}: ${list.join(", ")}`);
    if (reachable.length) problems.push(`free-period functions are executable by a client role (${reachable.join("; ")}); service_role only, C34`);
    const noRls = (posture.rls_disabled_tables ?? []).filter((t) => tables.some((name) => String(t).endsWith(name)));
    if (noRls.length) problems.push(`RLS is off on ${noRls.join(", ")}`);
  }
  if (problems.length) problems.forEach((p) => fail(`C53: ${p}`));
  else ok(`C53: benefit CHECK = FREE_PERIOD_BENEFITS, ${tables.length} period tables answer the service role and are refused to anon (42501), admin_free_period_stats refuses a non-admin actor, ${entryPoints.length} entry points refused to anon, no client role reaches a free-period function, RLS is on`);
}

// C54 — the sale price currency CHECK (migration 20261028120000) lists exactly money.ts:CURRENCY_CODES: the codes
// salePrice reads and the sale form saves (a code missing from the CHECK fails every save in it with 23514).
{
  const { CURRENCY_CODES } = await import("../src/lib/currency/money.ts");
  const codes = checkList("properties", "sale_price_currency");
  if (!Array.isArray(CURRENCY_CODES)) fail("C54: src/lib/currency/money.ts does not export CURRENCY_CODES (ship it with this check)");
  else if (!codes) fail("C54: properties.sale_price_currency CHECK not found (migration 20261028120000)");
  else compareSets("C54 properties.sale_price_currency", codes, [...CURRENCY_CODES], "CHECK constraint", "CURRENCY_CODES");
}

finish();

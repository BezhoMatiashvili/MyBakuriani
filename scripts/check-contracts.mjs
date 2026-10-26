// Static (repo-only) checks for the string-keyed couplings in
// docs/contracts.md. Nothing here needs a database or network; it runs
// in `prebuild` and in CI. The database-side half lives in
// scripts/check-db-contracts.mjs.
//
// Each check prints what it compared so a failure is self-explanatory.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), "utf8");
let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error(`✗ ${msg}`);
};
const ok = (msg) => console.log(`✓ ${msg}`);

function* walk(dir, exts) {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      yield* walk(rel, exts);
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      yield rel;
    }
  }
}

const srcFiles = [...walk("src", [".ts", ".tsx"])];
const srcText = new Map(srcFiles.map((f) => [f, read(f)]));

const setEq = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const diff = (a, b) => [...a].filter((x) => !b.has(x));
const describeSetMismatch = (label, left, leftName, right, rightName) => {
  const onlyLeft = diff(left, right);
  const onlyRight = diff(right, left);
  fail(
    `${label}: only in ${leftName}: [${onlyLeft.join(", ")}] · only in ${rightName}: [${onlyRight.join(", ")}]`,
  );
};

// ---------------------------------------------------------------------------
// C4 — every edge-function name the client references has a Deno directory,
// and every directory has an explicit verify_jwt in supabase/config.toml
// (an OMITTED function defaults to true, which 401s the pg_cron callers).
// ---------------------------------------------------------------------------
{
  const referenced = new Set();
  for (const text of srcText.values()) {
    for (const m of text.matchAll(/invoke\(\s*["']([a-z0-9-]+)["']/g)) referenced.add(m[1]);
    for (const m of text.matchAll(/functions\/v1\/([a-z0-9-]+)/g)) referenced.add(m[1]);
  }
  const dirs = new Set(
    readdirSync(join(root, "supabase/functions"), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
      .map((d) => d.name),
  );
  const missingDirs = diff(referenced, dirs);
  if (missingDirs.length) fail(`C4: client invokes edge functions with no directory: ${missingDirs.join(", ")}`);
  else ok(`C4: ${referenced.size} client-referenced edge functions all have a directory`);

  const toml = read("supabase/config.toml");
  const declared = new Map();
  for (const m of toml.matchAll(/\[functions\.([a-z0-9-]+)\]\s*\n\s*verify_jwt\s*=\s*(true|false)/g)) {
    declared.set(m[1], m[2] === "true");
  }
  const undeclared = diff(dirs, new Set(declared.keys()));
  const orphaned = diff(new Set(declared.keys()), dirs);
  if (undeclared.length) fail(`C4: functions with no explicit verify_jwt in config.toml (defaults to true): ${undeclared.join(", ")}`);
  if (orphaned.length) fail(`C4: config.toml declares functions with no directory: ${orphaned.join(", ")}`);
  if (!undeclared.length && !orphaned.length) ok(`C4: config.toml declares verify_jwt for all ${dirs.size} function directories`);
}

// ---------------------------------------------------------------------------
// C6 — the CSP in src/middleware.ts and next.config.ts remotePatterns allow the
// same external image hosts. Literal hosts (unsplash, mapbox) must match
// one-for-one. Supabase hosts are never a wildcard or a literal on either side:
// both files take them from src/lib/media-hosts.ts (the configured project +
// the prod media host), and img-src, media-src and connect-src all carry them.
// No other code under src/ may test for a Supabase host (banner-creative.ts
// once kept its own endsWith(".supabase.co") check): comments are ignored.
// ---------------------------------------------------------------------------
{
  const mw = read("src/middleware.ts");
  const cfg = read("next.config.ts");
  const hostsModule = read("src/lib/media-hosts.ts");
  const directive = (name) => mw.match(new RegExp(`["\`]${name} ([^"\`]+)["\`]`))?.[1];
  const [imgSrc, mediaSrc, connectSrc] = ["img-src", "media-src", "connect-src"].map(directive);
  const block = cfg.match(/remotePatterns:\s*\[([\s\S]*?)\n\s*\],/);
  if (!imgSrc || !mediaSrc || !connectSrc) fail("C6: could not find img-src, media-src and connect-src in src/middleware.ts");
  else if (!block) fail("C6: could not find remotePatterns in next.config.ts");
  else {
    const patterns = block[1].replace(/\/\/[^\n]*/g, "");
    const cspHosts = new Set(
      imgSrc
        .split(/\s+/)
        .filter((t) => t.startsWith("https://"))
        .map((t) => t.replace(/^https:\/\//, "")),
    );
    const rpHosts = new Set([...patterns.matchAll(/hostname:\s*"([^"]+)"/g)].map((m) => m[1]));
    if (setEq(cspHosts, rpHosts)) ok(`C6: CSP img-src and remotePatterns agree on ${cspHosts.size} literal hosts`);
    else describeSetMismatch("C6 image hosts", cspHosts, "CSP img-src", rpHosts, "remotePatterns");

    const hardCoded = [imgSrc, mediaSrc, connectSrc, patterns].some((t) => /supabase\.co/.test(t));
    const sharedInCsp =
      /import \{[^}]*\bSUPABASE_MEDIA_HOSTS\b[^}]*\} from "@\/lib\/media-hosts"/.test(mw) &&
      /const SUPABASE_ORIGINS = SUPABASE_MEDIA_HOSTS\.map\(/.test(mw) &&
      [imgSrc, mediaSrc, connectSrc].every((t) => t.includes("${SUPABASE_ORIGINS}")) &&
      connectSrc.includes("wss://${SUPABASE_PROJECT_HOST}");
    const sharedInConfig =
      /import \{[^}]*\bSUPABASE_MEDIA_HOSTS\b[^}]*\} from "\.\/src\/lib\/media-hosts"/.test(cfg) &&
      /\.\.\.SUPABASE_MEDIA_HOSTS\.map\(/.test(patterns);
    const literalHosts = [...hostsModule.matchAll(/"([a-z0-9]{20}\.supabase\.co)"/g)].map((m) => m[1]);
    const legacyHost = hostsModule.match(/LEGACY_PROD_SUPABASE_HOST = "([a-z0-9]{20}\.supabase\.co)"/)?.[1];
    const prodHosts = literalHosts.filter((h) => h !== legacyHost);
    const derivesProject = /new URL\(process\.env\.NEXT_PUBLIC_SUPABASE_URL\)\.hostname/.test(hostsModule);
    if (hardCoded) fail("C6: a Supabase host is hard-coded or wildcarded in the CSP or remotePatterns; take it from src/lib/media-hosts.ts");
    else if (!sharedInCsp) fail("C6: img-src, media-src and connect-src (https + wss) must use SUPABASE_ORIGINS / SUPABASE_PROJECT_HOST from @/lib/media-hosts");
    else if (!sharedInConfig) fail("C6: next.config.ts remotePatterns must spread SUPABASE_MEDIA_HOSTS from ./src/lib/media-hosts");
    else if (literalHosts.length > 2 || prodHosts.length !== 1 || !derivesProject || /\*\.supabase\.co/.test(hostsModule))
      fail("C6: src/lib/media-hosts.ts must derive the project host from NEXT_PUBLIC_SUPABASE_URL and pin exactly one literal prod host plus at most the LEGACY_PROD_SUPABASE_HOST (no wildcard)");
    else ok(`C6: CSP and remotePatterns share the Supabase hosts of media-hosts.ts (NEXT_PUBLIC_SUPABASE_URL + ${prodHosts[0]}${legacyHost ? ` + legacy ${legacyHost}` : ""})`);

    const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
    const ownHostTests = [...walk("src", [".ts", ".tsx"])].filter(
      (file) =>
        file !== join("src", "lib", "media-hosts.ts") &&
        !file.startsWith(join("src", "lib", "types")) &&
        /supabase\.co\b/.test(stripComments(read(file))),
    );
    if (ownHostTests.length) fail(`C6: Supabase host literal outside src/lib/media-hosts.ts (use SUPABASE_MEDIA_HOSTS): ${ownHostTests.join(", ")}`);
    else ok("C6: no code under src/ tests for a Supabase host except src/lib/media-hosts.ts");
  }
}

// ---------------------------------------------------------------------------
// C13 — the admin listing editor's property_type dropdown and the API route's
// write allow-list must match the enum in the generated types.
// ---------------------------------------------------------------------------
{
  const gen = read("src/lib/types/database.generated.ts");
  const enumMatch = gen.match(/property_type:\s*\[([^\]]+)\]/);
  const enumValues = new Set([...(enumMatch?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));

  const extractList = (file, name) => {
    const text = read(file);
    const m = text.match(new RegExp(`${name}[^=]*=\\s*(?:new Set\\()?\\[([^\\]]+)\\]`));
    return new Set([...(m?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((x) => x[1]));
  };
  const adminOptions = extractList("src/components/admin/ListingAuditPanel.tsx", "PROPERTY_TYPE_OPTIONS");
  const apiValues = extractList("src/app/api/admin/listings/update/route.ts", "PROPERTY_TYPE_VALUES");
  if (!enumValues.size) fail("C13: could not read property_type enum from database.generated.ts");
  else {
    if (setEq(enumValues, adminOptions)) ok(`C13: ListingAuditPanel property types match the enum (${enumValues.size})`);
    else describeSetMismatch("C13 admin dropdown", adminOptions, "ListingAuditPanel", enumValues, "enum");
    if (setEq(enumValues, apiValues)) ok("C13: admin update route property types match the enum");
    else describeSetMismatch("C13 admin API", apiValues, "listings/update route", enumValues, "enum");
  }
}

// ---------------------------------------------------------------------------
// C5 — landing-media image mime lists agree between the uploader and the
// sign-upload route (the third copy is the bucket migration, checked DB-side).
// ---------------------------------------------------------------------------
{
  const uploader = read("src/components/forms/MediaUploader.tsx");
  const route = read("src/app/api/admin/media/sign-upload/route.ts");
  const accept = new Set(
    [...(uploader.match(/ACCEPT_TYPES\s*=\s*\[([^\]]+)\]/)?.[1] ?? "").matchAll(/"(image\/[a-z]+)"/g)].map((m) => m[1]),
  );
  const routeImages = new Set(
    [...(route.match(/IMAGE_TYPES[^=]*=\s*\{([^}]+)\}/)?.[1] ?? "").matchAll(/"(image\/[a-z]+)"/g)].map((m) => m[1]),
  );
  if (!accept.size || !routeImages.size) fail("C5: could not parse one of the landing-media image mime lists");
  else if (setEq(accept, routeImages)) ok(`C5: MediaUploader and sign-upload agree on ${accept.size} image mime types`);
  else describeSetMismatch("C5 image mimes", accept, "MediaUploader", routeImages, "sign-upload route");
}

// ---------------------------------------------------------------------------
// C5 — restaurant-menus takes menu PDFs only through readMenuPdf. file.type comes
// from the file extension, so an empty "menu.pdf" used to be stored as a 0-byte
// object that /food/[id] then linked to ("Failed to load PDF document",
// 2026-10-01). Every src upload to the bucket must store the bytes of a
// src/lib/menu-pdf.ts readMenuPdf result: `const X = await readMenuPdf(...)`
// within 700 characters before the upload and `X.bytes` among its arguments.
// A pick-time readMenuPdf call (only early feedback) can't satisfy this, and
// neither can uploading the live File. The size cap vs the bucket limit is
// pinned in scripts/unit. Only literal .from("restaurant-menus").upload( call
// sites are seen.
// ---------------------------------------------------------------------------
{
  // Comments don't count ("// const X = await readMenuPdf(" must not satisfy
  // the check) but strings do: an "image/*" literal must not open a comment.
  const withoutComments = (text) => {
    const kept = [];
    let from = 0;
    for (let i = 0; i < text.length; ) {
      const c = text[i];
      const block = c === "/" && text[i + 1] === "*";
      if (block || (c === "/" && text[i + 1] === "/" && text[i - 1] !== ":")) {
        kept.push(text.slice(from, i));
        const end = text.indexOf(block ? "*/" : "\n", i + 2);
        i = end < 0 ? text.length : block ? end + 2 : end;
        from = i;
      } else if (c === '"' || c === "'" || c === "`") {
        for (i += 1; i < text.length && text[i] !== c && (c === "`" || text[i] !== "\n"); ) i += text[i] === "\\" ? 2 : 1;
        i += 1;
      } else {
        i += c === "\\" ? 2 : 1; // an escaped "/" (as in /^https?:\/\//) can't open a comment
      }
    }
    kept.push(text.slice(from));
    return kept.join("");
  };
  const uploadRe = /\.from\(\s*["']restaurant-menus["']\s*\)\s*\.upload\(/g;
  const bindingRe = /\b(?:const|let)\s+(\w+)\s*=\s*await\s+readMenuPdf\(/g;
  const sites = srcFiles.flatMap((f) => {
    if (!srcText.get(f).includes("restaurant-menus")) return [];
    const text = withoutComments(srcText.get(f));
    return [...text.matchAll(uploadRe)].map((m) => {
      const args = m.index + m[0].length;
      const bound = [...text.slice(Math.max(0, m.index - 700), m.index).matchAll(bindingRe)].pop();
      return { f, gated: !!bound && new RegExp(`\\b${bound[1]}\\.bytes\\b`).test(text.slice(args, args + 300)) };
    });
  });
  const ungated = [...new Set(sites.filter((s) => !s.gated).map((s) => s.f))];
  if (!sites.length) fail('C5: no src file calls .from("restaurant-menus").upload( any more; update this check');
  else if (ungated.length) fail(`C5: ${ungated.join(", ")} uploads to restaurant-menus without the bytes of a readMenuPdf result: expected "const X = await readMenuPdf(...)" in the 700 characters before the .upload( call and X.bytes written inside its arguments, not via a helper or a variable built beforehand (src/lib/menu-pdf.ts)`);
  else ok(`C5: ${sites.length} restaurant-menus upload(s) store the bytes of a readMenuPdf check`);
}

// ---------------------------------------------------------------------------
// C3 — database.generated.ts is generator output only. A hand edit shows up as
// a diff against the next regen; here we just make sure nobody imports the
// generated file directly (all consumers must go through database.ts so the
// override layer applies).
// ---------------------------------------------------------------------------
{
  const offenders = srcFiles.filter(
    (f) => f !== "src/lib/types/database.ts" && /types\/database\.generated["']/.test(srcText.get(f)),
  );
  if (offenders.length) fail(`C3: import database.ts, not database.generated.ts: ${offenders.join(", ")}`);
  else ok("C3: no direct imports of database.generated.ts");
  if (!existsSync(join(root, "src/lib/types/database.generated.ts"))) fail("C3: database.generated.ts is missing");
}

// ---------------------------------------------------------------------------
// C11 — company subscription tier codes: the company-subscription edge
// function's VALID_TIERS must equal COMPANY_TIERS (the organization_subscriptions
// CHECK and the company-* package codes are compared in check-db-contracts.mjs).
// ---------------------------------------------------------------------------
{
  const tiersIn = (file, name) =>
    new Set(
      [...(read(file).match(new RegExp(`${name}[^=]*=\\s*\\[([^\\]]+)\\]`))?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map(
        (m) => m[1],
      ),
    );
  const appTiers = tiersIn("src/lib/org-tiers.ts", "COMPANY_TIERS");
  const edgeTiers = tiersIn("supabase/functions/company-subscription/index.ts", "VALID_TIERS");
  if (!appTiers.size || !edgeTiers.size) fail("C11: could not parse COMPANY_TIERS or company-subscription VALID_TIERS");
  else if (setEq(appTiers, edgeTiers)) ok(`C11: company-subscription VALID_TIERS match COMPANY_TIERS (${appTiers.size})`);
  else describeSetMismatch("C11 company tiers", appTiers, "COMPANY_TIERS", edgeTiers, "company-subscription VALID_TIERS");
}

// ---------------------------------------------------------------------------
// C21 — restaurants make no discounts (the owner's call 2026-10-11). (a) The
// newest migration naming each database rule (re)creates it: the dish CHECK
// and the food trigger, whose function raises food_discounts_removed with HINT
// invalid_target, which purchase-vip answers with 400; (b) the food cabinet
// offers none: food home passes hideDiscount, the food balance page drops the
// discount package; (c) no src file but the generated types names the per-dish
// route or RPC or the menu-item-discount resume kind.
// ---------------------------------------------------------------------------
{
  const problems = [];
  const migrations = readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  const sqlOf = (f) => read(join("supabase/migrations", f));
  const rules = [
    ["service_menu_items_no_discount", /ADD CONSTRAINT service_menu_items_no_discount CHECK \(discount_percent = 0\)/],
    ["services_refuse_food_discount", /CREATE TRIGGER services_refuse_food_discount\s+AFTER INSERT OR UPDATE OF discount_percent, category ON public\.services\b/],
  ];
  for (const [name, created] of rules) {
    const last = migrations.filter((f) => sqlOf(f).includes(name)).at(-1);
    if (!last || !created.test(sqlOf(last))) problems.push(`${last ?? "no migration"} does not (re)create ${name}`);
  }
  const fnFile = migrations.filter((f) => /FUNCTION public\.refuse_food_listing_discount\(\)/.test(sqlOf(f))).at(-1);
  const fn = (fnFile && sqlOf(fnFile).match(/FUNCTION public\.refuse_food_listing_discount\(\)[\s\S]*?\$function\$;/)?.[0]) ?? "";
  if (!/NEW\.category = 'food'/.test(fn) || !fn.includes("'food_discounts_removed'") || !/HINT = 'invalid_target'/.test(fn))
    problems.push(`${fnFile ?? "no migration"}: refuse_food_listing_discount() must refuse food rows with 'food_discounts_removed' and HINT 'invalid_target'`);
  if (!/\binvalid_target:\s*400\b/.test(read("supabase/functions/purchase-vip/index.ts")))
    problems.push("purchase-vip no longer answers invalid_target with 400 (a refused restaurant discount becomes a masked 500)");
  if (!/\bhideDiscount\b/.test(read("src/app/[locale]/dashboard/food/FoodDashboardClient.tsx")))
    problems.push("FoodDashboardClient no longer passes hideDiscount to ListingActions");
  if (!read("src/app/[locale]/dashboard/food/balance/page.tsx").includes('inferVipInfoTier(pkg) !== "discount"'))
    problems.push("the food balance page no longer drops the discount package");
  if (existsSync(join(root, "src/app/api/food/menu-item-discount-requests")))
    problems.push("src/app/api/food/menu-item-discount-requests exists again");
  for (const [file, text] of srcText) {
    if (file === join("src/lib/types/database.generated.ts")) continue;
    if (/menu-item-discount|self_service_activate_menu_item_discount/.test(text))
      problems.push(`${file} names the retired per-dish discount path`);
  }
  if (problems.length) problems.forEach((p) => fail(`C21: ${p}`));
  else ok("C21: restaurants make no discounts (dish CHECK + food trigger, HINT invalid_target → 400; food home hides it, the balance page drops the package; no per-dish route, RPC call or resume kind in src)");
}

// ---------------------------------------------------------------------------
// C14 — admin approval is bound to the version the admin loaded: the owner's
// resubmit rewrites a pending request in place (same id), so the verifications
// page sends expectedUpdatedAt = the listed row's updated_at and the approve
// route compares it with the pending row's updated_at before any approve RPC.
// The field is optional, so a rename on either side would fail open silently.
// ---------------------------------------------------------------------------
{
  const page = read("src/app/[locale]/dashboard/admin/verifications/page.tsx");
  const route = read("src/app/api/admin/content-change-requests/[id]/route.ts");
  const problems = [];
  if (!/expectedUpdatedAt:\s*item\.updated_at/.test(page))
    problems.push("the verifications page no longer sends expectedUpdatedAt: item.updated_at");
  if (!/\.select\(\s*"request_kind, updated_at"\s*\)/.test(route))
    problems.push("the approve route no longer reads updated_at with request_kind");
  if (!/pending\.updated_at\s*!==\s*body\.expectedUpdatedAt/.test(route))
    problems.push("the approve route no longer compares pending.updated_at with body.expectedUpdatedAt");
  const answer = route.indexOf("changed_since_loaded");
  if (answer < 0 || answer > route.indexOf(".rpc("))
    problems.push("the approve route must answer superseded/changed_since_loaded before calling an approve RPC");
  if (problems.length) problems.forEach((p) => fail(`C14: ${p}`));
  else ok("C14: approval is bound to the loaded version (page sends updated_at; the route compares it before the RPC)");
}

// ---------------------------------------------------------------------------
// C33 — user-typed text in mailed notifications: the newest migration that
// (re)creates each writer below passes the typed name, title or address through
// public._notice_text (line breaks and invisible characters flattened, links
// defanged). A function re-created from an older body would drop it silently.
// ---------------------------------------------------------------------------
{
  const migDir = "supabase/migrations";
  const files = readdirSync(join(root, migDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const noComments = (sql) => sql.replace(/--[^\n]*/g, "");
  const WRITERS = [
    "notify_admins_content_change_pending",
    "notify_admins_sms_broadcast_pending",
    "request_organization_membership",
    "notify_job_application",
    "notify_admins_organization_pending",
    "notify_listing_pending",
    "respond_membership_request",
    "notify_cleaner_of_new_task",
    // C18: the listing title in the price-drop SMS (20261013151200).
    "sms_materialize_due_price_drop_events",
  ];
  const missing = [];
  for (const name of WRITERS) {
    const create = new RegExp(
      `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:"?public"?\\.)?"?${name}"?\\s*\\(`,
      "i",
    );
    const file = files
      .filter((f) => create.test(noComments(read(join(migDir, f)))))
      .at(-1);
    if (!file) {
      missing.push(`${name}: no migration defines it`);
      continue;
    }
    const sql = noComments(read(join(migDir, file)));
    const at = sql.search(create);
    const tag = /\bAS\s+\$(\w*)\$/i.exec(sql.slice(at));
    const start = tag ? at + tag.index + tag[0].length : -1;
    const body =
      start < 0 ? "" : sql.slice(start, sql.indexOf(`$${tag[1]}$`, start));
    if (!body.includes("_notice_text(")) missing.push(`${name} (${file})`);
  }
  if (missing.length)
    missing.forEach((m) =>
      fail(`C33: ${m} puts user-typed text into a notification without public._notice_text`),
    );
  else
    ok(`C33: all ${WRITERS.length} notification writers pass user-typed text through public._notice_text`);
}

// ---------------------------------------------------------------------------
// C5 — the storage type trigger checks client writes only: storage-api's
// signed-upload test insert runs as the service role with the sign request's
// own application/json type, so a body without the role test refuses every
// createSignedUploadUrl (admin media uploads, media intents).
// ---------------------------------------------------------------------------
{
  const migDir = "supabase/migrations";
  const create = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:"?public"?\.)?"?enforce_storage_object_mime"?\s*\(/i;
  const file = readdirSync(join(root, migDir))
    .filter((f) => f.endsWith(".sql") && create.test(read(join(migDir, f)).replace(/--[^\n]*/g, "")))
    .sort()
    .at(-1);
  const sql = file ? read(join(migDir, file)).replace(/--[^\n]*/g, "") : "";
  const at = sql.search(create);
  const tag = at < 0 ? null : /\bAS\s+\$(\w*)\$/i.exec(sql.slice(at));
  const start = tag ? at + tag.index + tag[0].length : -1;
  const body = start < 0 ? "" : sql.slice(start, sql.indexOf(`$${tag[1]}$`, start));
  const roleTest = /current_setting\(\s*'role'/.test(body) && /request\.jwt\.claims/.test(body) && /\(\s*'anon'\s*,\s*'authenticated'\s*\)/.test(body);
  if (!file) fail("C5: no migration defines public.enforce_storage_object_mime()");
  else if (!roleTest) fail(`C5: ${file} defines enforce_storage_object_mime() without the client-role test (signed-upload URLs would fail)`);
  else ok(`C5: the storage type trigger checks client (anon/authenticated) writes only (${file})`);
}

// ---------------------------------------------------------------------------
// C25 — contact_events.visitor_phone (a visitor's private profiles.phone) is
// server-only: the newest migration granting SELECT on contact_events to
// authenticated revokes the table-wide grant and names a column list without
// it, and every user-session read selects explicit granted columns (a `*` or
// an ungranted column is "permission denied").
// ---------------------------------------------------------------------------
{
  const migDir = "supabase/migrations";
  const grantRe = /GRANT\s+SELECT\s*\(([^)]*)\)\s*ON\s+(?:TABLE\s+)?public\.contact_events\s+TO\s+authenticated/i;
  const file = readdirSync(join(root, migDir))
    .filter((f) => f.endsWith(".sql") && grantRe.test(read(join(migDir, f)).replace(/--[^\n]*/g, "")))
    .sort()
    .at(-1);
  const sql = file ? read(join(migDir, file)).replace(/--[^\n]*/g, "") : "";
  const granted = (grantRe.exec(sql)?.[1] ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  const revoked = /REVOKE\s+SELECT\s+ON\s+(?:TABLE\s+)?public\.contact_events\s+FROM\s+[^;]*\bauthenticated\b/i.test(sql);
  const problems = [];
  if (!file) problems.push("no migration grants a SELECT column list on public.contact_events to authenticated");
  else {
    if (!revoked) problems.push(`${file} must revoke the table-wide SELECT before the column grant (column grants add up)`);
    if (granted.includes("visitor_phone")) problems.push(`${file} grants visitor_phone to authenticated`);
  }
  let reads = 0;
  for (const f of srcFiles) {
    const t = read(f);
    if (/createServiceClient\(/.test(t)) continue;
    for (const m of t.matchAll(/\.from\(\s*["']contact_events["']\s*\)/g)) {
      reads++;
      const sel = /^\s*\.select\(\s*["'`]([^"'`]*)["'`]/.exec(t.slice(m.index + m[0].length));
      const cols = sel ? sel[1].split(",").map((c) => c.trim()).filter(Boolean) : [];
      const bad = cols.filter((c) => !granted.includes(c));
      if (!sel || !cols.length) problems.push(`${f}: a user-session contact_events query must start with .select("<granted columns>")`);
      else if (bad.length) problems.push(`${f}: selects ${bad.join(", ")} from contact_events (not granted to authenticated)`);
    }
  }
  if (problems.length) problems.forEach((p) => fail(`C25: ${p}`));
  else ok(`C25: contact_events.visitor_phone is not client-readable; ${reads} user-session read(s) select granted columns only`);
}

// ---------------------------------------------------------------------------
// C11 — the company listing limit counts under a per-organization advisory
// lock: without it concurrent attaches each count before the other commits and
// all pass under the plan's listing_limit.
// ---------------------------------------------------------------------------
{
  const migDir = "supabase/migrations";
  const create = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:"?public"?\.)?"?enforce_org_listing_rules"?\s*\(/i;
  const file = readdirSync(join(root, migDir))
    .filter((f) => f.endsWith(".sql") && create.test(read(join(migDir, f)).replace(/--[^\n]*/g, "")))
    .sort()
    .at(-1);
  const sql = file ? read(join(migDir, file)).replace(/--[^\n]*/g, "") : "";
  const at = sql.search(create);
  const tag = at < 0 ? null : /\bAS\s+\$(\w*)\$/i.exec(sql.slice(at));
  const start = tag ? at + tag.index + tag[0].length : -1;
  const body = start < 0 ? "" : sql.slice(start, sql.indexOf(`$${tag[1]}$`, start));
  const lock = body.search(/pg_advisory_xact_lock\(\s*hashtextextended\(\s*'org-listing-limit:'\s*\|\|\s*NEW\.organization_id/i);
  const count = body.search(/SELECT\s+count\(\*\)\s+INTO\s+v_count/i);
  if (!file) fail("C11: no migration defines public.enforce_org_listing_rules()");
  else if (lock < 0 || count < 0 || lock > count) fail(`C11: ${file} counts the organization's listings without the per-organization advisory lock first (concurrent attaches overshoot listing_limit)`);
  else ok(`C11: the company listing limit counts under a per-organization advisory lock (${file})`);
}

// ---------------------------------------------------------------------------
// C33 — the class-3 e-mail cap counts under a lock on the cap's own key
// (recipient, type, cabinet): without it concurrent notices each count before
// the others commit and all pass. The wait is capped (lock_timeout 1 s, 1 ms once
// the statement has run 2 s; set for the lock call only, then restored) so the
// notification insert never nears the statement_timeout.
// ---------------------------------------------------------------------------
{
  const migDir = "supabase/migrations";
  const create = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:"?public"?\.)?"?email_enqueue_notification"?\s*\(/i;
  const file = readdirSync(join(root, migDir))
    .filter((f) => f.endsWith(".sql") && create.test(read(join(migDir, f)).replace(/--[^\n]*/g, "")))
    .sort()
    .at(-1);
  const sql = file ? read(join(migDir, file)).replace(/--[^\n]*/g, "") : "";
  const at = sql.search(create);
  const tag = at < 0 ? null : /\bAS\s+\$(\w*)\$/i.exec(sql.slice(at));
  const start = tag ? at + tag.index + tag[0].length : -1;
  const body = start < 0 ? "" : sql.slice(start, sql.indexOf(`$${tag[1]}$`, start));
  const setTimeout = body.search(
    /set_config\(\s*'lock_timeout'\s*,\s*case\s+when\s+clock_timestamp\(\)\s*-\s*statement_timestamp\(\)\s*<\s*interval\s*'2 seconds'\s*then\s*'1s'\s*else\s*'1ms'\s*end\s*,\s*true\s*\)/i,
  );
  const lock = body.search(/pg_advisory_xact_lock\(\s*hashtextextended\(\s*'email-class3:'\s*\|\|\s*new\.user_id::text\s*\|\|\s*':'\s*\|\|\s*new\.type\s*\|\|\s*':'\s*\|\|\s*coalesce\(\s*new\.dashboard_scope/i);
  const restore = body.search(/set_config\(\s*'lock_timeout'\s*,\s*v_lock_timeout\s*,\s*true\s*\)/i);
  const count = body.search(/email_notification_priority\(new\.type\)\s*=\s*3\s+and\s+\(select\s+count\(\*\)/i);
  const handler = body.search(/exception\s+when\s+others/i);
  if (!file) fail("C33: no migration defines public.email_enqueue_notification()");
  else if ([setTimeout, lock, restore, count].some((i) => i < 0) || !(setTimeout < lock && lock < restore && restore < count) || handler < count)
    fail(`C33: ${file} counts class-3 e-mails without the capped per-key advisory lock first (concurrent notices overshoot the cap, or a lock wait can fail the notification insert)`);
  else ok(`C33: the class-3 e-mail cap counts under a capped per-recipient/type/cabinet advisory lock (${file})`);
}

// ---------------------------------------------------------------------------
// C18 / C48 — caps that must hold under concurrency count under an advisory
// lock taken before the count: (a) the price-drop subscriber cap
// (sale_price_alert_subscriber_cap) refuses at the route's own
// MAX_SUBSCRIBERS_PER_LISTING with HINT subscriber_limit_reached, which the
// route answers with 409; (b) auth_sms_code_reserve counts the per-IP and
// site-wide caps under 'auth-sms-code-caps', taken after the number's lock.
// ---------------------------------------------------------------------------
{
  const migDir = "supabase/migrations";
  const files = readdirSync(join(root, migDir)).filter((f) => f.endsWith(".sql")).sort();
  const noComments = (sql) => sql.replace(/--[^\n]*/g, "");
  const bodyOf = (name) => {
    const create = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:"?public"?\\.)?"?${name}"?\\s*\\(`, "i");
    const file = files.filter((f) => create.test(noComments(read(join(migDir, f))))).at(-1);
    if (!file) return { file: null, body: "", sql: "" };
    const sql = noComments(read(join(migDir, file)));
    const at = sql.search(create);
    const tag = /\bAS\s+\$(\w*)\$/i.exec(sql.slice(at));
    const start = tag ? at + tag.index + tag[0].length : -1;
    return { file, sql, body: start < 0 ? "" : sql.slice(start, sql.indexOf(`$${tag[1]}$`, start)) };
  };
  const problems = [];

  const route = read("src/app/api/listings/property/[propertyId]/price-drop-alert/route.ts");
  const cap = Number(route.match(/MAX_SUBSCRIBERS_PER_LISTING\s*=\s*(\d+)/)?.[1]);
  const pd = bodyOf("enforce_price_drop_subscriber_cap");
  const pdLock = pd.body.search(/pg_advisory_xact_lock\(\s*hashtextextended\(\s*'price-drop-subscribers:'\s*\|\|\s*NEW\.property_id/i);
  const pdCount = pd.body.search(/SELECT\s+count\(\*\)\s+FROM\s+public\.sale_price_alert_subscriptions/i);
  const pdCap = Number(pd.body.match(/\)\s*>=\s*(\d+)\s+THEN/i)?.[1]);
  const trigger = files.some((f) =>
    /CREATE\s+TRIGGER\s+sale_price_alert_subscriber_cap\s+BEFORE\s+INSERT\s+OR\s+UPDATE\s+OF\s+active\s+ON\s+public\.sale_price_alert_subscriptions[\s\S]*?enforce_price_drop_subscriber_cap\(\)/i.test(noComments(read(join(migDir, f)))),
  );
  if (!pd.file) problems.push("no migration defines public.enforce_price_drop_subscriber_cap()");
  else {
    if (pdLock < 0 || pdCount < 0 || pdLock > pdCount) problems.push(`${pd.file} counts price-drop subscribers without the per-listing advisory lock first`);
    if (!Number.isFinite(cap) || pdCap !== cap) problems.push(`the trigger caps at ${pdCap} but the route's MAX_SUBSCRIBERS_PER_LISTING is ${cap}`);
    if (!/HINT\s*=\s*'subscriber_limit_reached'/i.test(pd.body)) problems.push(`${pd.file} must raise HINT 'subscriber_limit_reached'`);
  }
  if (!trigger) problems.push("no migration creates trigger sale_price_alert_subscriber_cap BEFORE INSERT OR UPDATE OF active");
  if (!/error\.hint\s*===\s*"subscriber_limit_reached"[\s\S]{0,200}status:\s*409/.test(route))
    problems.push("the price-drop route must answer the database's subscriber_limit_reached with 409");

  const sms = bodyOf("auth_sms_code_reserve");
  const phoneLock = sms.body.search(/pg_advisory_xact_lock\(\s*hashtextextended\(\s*'auth-sms-code:'\s*\|\|\s*p_phone/i);
  const capsLock = sms.body.search(/pg_advisory_xact_lock\(\s*hashtextextended\(\s*'auth-sms-code-caps'/i);
  const ipCount = sms.body.search(/WHERE\s+ip\s*=\s*v_ip/i);
  const siteCount = sms.body.search(/WHERE\s+status\s*<>\s*'failed'\s+AND\s+created_at\s*>\s*now\(\)\s*-\s*interval\s*'24 hours'\)\s*>=\s*500/i);
  if (!sms.file) problems.push("no migration defines public.auth_sms_code_reserve()");
  else if ([phoneLock, capsLock, ipCount, siteCount].some((i) => i < 0) || !(phoneLock < capsLock && capsLock < ipCount && capsLock < siteCount))
    problems.push(`${sms.file} must take 'auth-sms-code-caps' after the number's lock and before the per-IP and site-wide counts`);

  if (problems.length) problems.forEach((p) => fail(`C18/C48: ${p}`));
  else ok(`C18/C48: the price-drop subscriber cap (${cap}) and the phone-code IP/site caps count under their advisory locks (${pd.file}, ${sms.file})`);
}

// ---------------------------------------------------------------------------
// C8 — a page is not protected by its layout: layouts and pages render in
// parallel, so a layout's redirect() leaves the page's output in the response.
// (a) A server file under src/app outside the API routes that reads with the
// service role (@/lib/supabase/admin, getAdminStats) calls isAdminViewer()
// before its first service-role read. (b) The middleware matcher skips a path
// only for a dot in its last segment (static files) or under /_next itself, so a
// dotted locale (/k.a/dashboard/admin) or a first segment that merely starts with
// trpc, _next or _vercel still gets the auth redirect. (c) Both protected-route
// tests read the decoded path (Next routes /%64ashboard as /dashboard).
// ---------------------------------------------------------------------------
{
  const problems = [];
  let gated = 0;
  const serviceImport = /^import\s+(?!type\b)[^;]*from\s+["']@\/lib\/(?:supabase\/admin|admin\/getAdminStats)["']/m;
  for (const f of srcFiles) {
    if (!f.startsWith("src/app/") || f.startsWith("src/app/api/") || /\/route\.tsx?$/.test(f)) continue;
    const t = read(f);
    if (!serviceImport.test(t)) continue;
    const firstRead = t.search(/\b(?:createServiceClient|getAdminStats)\(/);
    if (firstRead < 0) continue;
    const check = t.search(/\bisAdminViewer\(\)/);
    if (check < 0 || check > firstRead) problems.push(`${f} reads with the service role without calling isAdminViewer() first`);
    else gated++;
  }
  const mw = read("src/middleware.ts");
  const list = /matcher:\s*\[(.*)\]\s*,?\s*$/m.exec(mw)?.[1] ?? "";
  const patterns = [...list.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`));
  const page = patterns.find((p) => p.startsWith("/((?!"));
  const re = page ? new RegExp(`^${page}$`) : null;
  const runs = ["/k.a/dashboard/admin", "/ka./dashboard/admin", "/en.x/create/rental", "/dashboard/admin", "/k.a/apartments", "/trpc/dashboard/admin", "/trpcx/sales/all", "/_vercel/dashboard/admin", "/_nextx/dashboard/admin"];
  const skips = ["/favicon.ico", "/robots.txt", "/category-icons/a.svg", "/join/a.b", "/_next/static/x.js", "/_next/image", "/_next", "/_next/data/b/x.json"];
  if (!patterns.includes("/api/:path*")) problems.push('src/middleware.ts matcher must keep "/api/:path*"');
  if (!re) problems.push("could not read the page pattern of the middleware matcher");
  else {
    const missed = runs.filter((p) => !re.test(p));
    const ran = skips.filter((p) => re.test(p));
    if (missed.length) problems.push(`the middleware matcher skips ${missed.join(", ")} (only a dotted last segment or /_next may skip it)`);
    if (ran.length) problems.push(`the middleware matcher runs for static files ${ran.join(", ")}`);
  }
  if (!/stripLocalePrefix\(decodedPathname\(pathname\)\)/.test(mw)) problems.push("src/middleware.ts must test protected routes on stripLocalePrefix(decodedPathname(pathname))");
  if (!/decodedPathname\(request\.nextUrl\.pathname\)/.test(read("src/lib/supabase/middleware.ts"))) problems.push("src/lib/supabase/middleware.ts must test protected routes on decodedPathname(request.nextUrl.pathname)");
  if (problems.length) problems.forEach((p) => fail(`C8: ${p}`));
  else ok(`C8: ${gated} server page(s) reading with the service role check isAdminViewer() first; the middleware skips only dotted last segments and /_next, and tests decoded paths`);
}

// ---------------------------------------------------------------------------
// C8 — a refused token refresh must not sign anyone out. Hosted Auth limits
// /auth/v1/token per source address and the app refreshes every session from one
// address; auth-js treats a refused (429) refresh as a sign-out and asks the
// cookie adapter to empty the auth cookie. (a) isTransientAuthFailure treats a
// 429 as transient; (b) the two server clients that read the user's cookie jar
// (createClient(), updateSession()) wrap their fetch in refusalAwareFetch and
// drop the deletion batch that follows a refusal before they write (the
// middleware before it marks the session mutated); (c) no other src file builds
// a cookie-reading server client.
// ---------------------------------------------------------------------------
{
  const problems = [];
  if (!/error\.status\s*===\s*429/.test(read("src/lib/with-timeout.ts")))
    problems.push("isTransientAuthFailure in src/lib/with-timeout.ts must treat a 429 AuthApiError as transient");
  const guarded = [
    ["src/lib/supabase/server.ts", /setAll\(cookiesToSet\)\s*\{[\s\S]{0,300}?auth\.dropsDeletion\(cookiesToSet\)\)\s*return;/],
    ["src/lib/supabase/middleware.ts", /setAll\(cookiesToSet\)\s*\{[\s\S]{0,300}?auth\.dropsDeletion\(cookiesToSet\)\)\s*return;\s*sessionMutated\s*=\s*true;/],
  ];
  for (const [f, guard] of guarded) {
    const t = read(f);
    if (!/refusalAwareFetch\(\s*timeoutFetch\(/.test(t)) problems.push(`${f} must build its Supabase fetch with refusalAwareFetch(timeoutFetch(...))`);
    if (!/global:\s*\{\s*fetch:\s*auth\.fetch\s*\}/.test(t)) problems.push(`${f} must hand auth.fetch to the cookie-reading client`);
    if (!guard.test(t)) problems.push(`${f}: the cookie adapter's setAll must return early on auth.dropsDeletion(cookiesToSet)${f.endsWith("middleware.ts") ? " before sessionMutated = true" : ""}`);
  }
  const clients = srcFiles.filter((f) => /\bcreateServerClient\b/.test(read(f)) && !guarded.some(([g]) => g === f));
  if (clients.length) problems.push(`${clients.join(", ")} build a server client outside the refusal-aware pair (a drained token bucket would delete its sessions)`);
  if (problems.length) problems.forEach((p) => fail(`C8: ${p}`));
  else ok("C8: a refused token refresh (429) is transient and createClient()/updateSession() keep the browser's cookie (refusalAwareFetch + dropsDeletion); no other server client reads the cookie jar");
}

// ---------------------------------------------------------------------------
// C22 — the listing view/contact limiter keys embed the path id, which isUuid
// and Postgres accept in any letter case; both routes lower-case it first so
// every spelling shares one bucket.
// ---------------------------------------------------------------------------
{
  const problems = [];
  for (const f of ["src/app/api/listings/[kind]/[id]/view/route.ts", "src/app/api/listings/[kind]/[id]/contact/route.ts"]) {
    const t = read(f);
    const lower = t.search(/const\s+id\s*=\s*rawId\.toLowerCase\(\)/);
    const key = t.search(/checkRateLimit\(\s*`listing-(?:view|contact):/);
    if (!/const\s*\{\s*kind\s*,\s*id:\s*rawId\s*\}\s*=\s*await params/.test(t) || lower < 0) problems.push(`${f} must read the path id as rawId and lower-case it (const id = rawId.toLowerCase())`);
    else if (key >= 0 && key < lower) problems.push(`${f} builds its limiter key before lower-casing the id`);
  }
  if (problems.length) problems.forEach((p) => fail(`C22: ${p}`));
  else ok("C22: the listing view and contact routes lower-case the path id before their limiter keys");
}

// ---------------------------------------------------------------------------
// C4 — a dated search must not scan calendar_blocks for the whole range. The
// `search` function (service role) used to list every block in the range, any
// owner's pending listings included, into one id=not.in.(...) URL; any signed-in
// user can insert blocks, so the list was user-writable and the REST layer's URL
// limit (about 650 ids) turned every dated search into a 500. The date path now
// asks search_blocked_property_ids(p_from, p_to), which returns only PUBLIC
// listings' ids and is service_role only.
// ---------------------------------------------------------------------------
{
  const problems = [];
  const fn = read("supabase/functions/search/index.ts");
  const from = fn.indexOf("Date availability exclusion");
  const to = fn.indexOf("// Ordering:");
  const dated = from >= 0 && to > from ? fn.slice(from, to) : "";
  if (!dated) problems.push("could not find the date availability block of supabase/functions/search/index.ts");
  else {
    if (!/\.rpc\(\s*"search_blocked_property_ids"\s*,\s*\{\s*p_from:\s*check_in,\s*p_to:\s*check_out\s*\}/.test(dated))
      problems.push("the dated search path must call rpc(\"search_blocked_property_ids\", { p_from: check_in, p_to: check_out })");
    if (/calendar_blocks/.test(dated.replace(/\/\/[^\n]*/g, "")))
      problems.push("the dated search path must not read calendar_blocks itself (an owner-writable id list in a URL)");
  }
  const migs = readdirSync(join(root, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.search_blocked_property_ids\s*\(/i.test(read(join("supabase/migrations", f))));
  if (!migs.length) problems.push("no migration creates public.search_blocked_property_ids(date, date)");
  else {
    const body = read(join("supabase/migrations", migs[migs.length - 1])).replace(/--[^\n]*/g, "");
    if (!/RETURNS\s+SETOF\s+uuid/i.test(body)) problems.push(`${migs[migs.length - 1]} must return SETOF uuid`);
    if (!/JOIN\s+public\.public_properties\s+pp\s+ON\s+pp\.id\s*=\s*cb\.property_id/i.test(body)) problems.push(`${migs[migs.length - 1]} must join public_properties (public listings only)`);
    if (!/SECURITY\s+INVOKER/i.test(body) && /SECURITY\s+DEFINER/i.test(body)) problems.push(`${migs[migs.length - 1]} must not be SECURITY DEFINER`);
    if (!/SET\s+search_path\s+TO\s+''/i.test(body)) problems.push(`${migs[migs.length - 1]} must set search_path to ''`);
    if (!/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.search_blocked_property_ids\(date,\s*date\)\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i.test(body)) problems.push(`${migs[migs.length - 1]} must revoke EXECUTE from PUBLIC, anon and authenticated`);
    if (!/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.search_blocked_property_ids\(date,\s*date\)\s+TO\s+service_role/i.test(body)) problems.push(`${migs[migs.length - 1]} must grant EXECUTE to service_role`);
    if (/GRANT\s+[^;]*search_blocked_property_ids[^;]*\bTO\b[^;]*\b(?:anon|authenticated|public)\b/i.test(body)) problems.push(`${migs[migs.length - 1]} must not grant EXECUTE to anon, authenticated or PUBLIC`);
  }
  if (problems.length) problems.forEach((p) => fail(`C4/search: ${p}`));
  else ok(`C4/search: the dated search path asks search_blocked_property_ids (public listings only, service_role only, ${migs[migs.length - 1]}) and never scans calendar_blocks`);
}

// C18 — a stored NaN coordinate must not end the daily SMS run (F-V5-R8-01). A
// numeric NaN reaches sms-automation-run as the string "NaN": the pin accepts a
// finite number only, one message that cannot be built is counted and skipped
// (not thrown out of the run), and the database refuses a coordinate outside
// -90..90 / -180..180 on properties and organizations (NaN sorts above both).
{
  const problems = [];
  const domain = read("supabase/functions/sms-automation-run/domain.ts");
  const index = read("supabase/functions/sms-automation-run/index.ts");
  if (!/function pinCoordinate\(value: unknown\)[^{]*\{[^}]*Number\.isFinite\(value\)/.test(domain)) problems.push("domain.ts pinCoordinate must accept a finite number only");
  if (/\.toFixed\(/.test(domain.replace(/function pinCoordinate[\s\S]*?\n\}\n/, ""))) problems.push("domain.ts calls toFixed outside pinCoordinate (a raw database numeric can be the string \"NaN\")");
  if (!/build: \(\) => string[\s\S]{0,200}try \{\s*message = build\(\);\s*\} catch/.test(index)) problems.push("index.ts enqueue must build the message inside try/catch (one bad row ends the run for every owner after it)");
  if (/enqueue\(\s*"[a-z_]+",\s*c,\s*build[A-Z]/.test(index)) problems.push("index.ts passes a built message to enqueue; pass a () => build…() thunk");
  const migs = readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  const sql = migs.map((f) => read(join("supabase/migrations", f))).join("\n");
  for (const name of ["properties_location_lat_range", "properties_location_lng_range", "organizations_location_lat_range", "organizations_location_lng_range"]) {
    const re = new RegExp(`ADD CONSTRAINT ${name}\\s+CHECK \\(location_l(?:at|ng) BETWEEN -(?:90|180) AND (?:90|180)\\)`);
    if (!re.test(sql)) problems.push(`no migration adds ${name} (CHECK BETWEEN the coordinate range)`);
    if (new RegExp(`DROP CONSTRAINT[^;]*${name}`).test(sql.replace(/--[^\n]*/g, ""))) problems.push(`a migration drops ${name}`);
  }
  if (problems.length) problems.forEach((p) => fail(`C18/pin: ${p}`));
  else ok("C18/pin: the SMS pin takes finite numbers only, enqueue guards the message build, and coordinates are range-checked in the database");
}

// C18 — a booking the daily SMS run cannot reach (made after its 10:00 run for the
// check-in, or for today) is texted by a second job of the same function an hour after
// it was made (20261023100000). The two runs differ only by the request body, so: the
// daily time of day is the one domain.ts assumes, an unknown mode is refused (never a
// silent full pass every five minutes), the short-notice run touches no daily kind,
// and the job posts exactly that mode and is in the C4 job list. The dispatch-time check
// (sms_cancel_ineligible_automation, every minute) keeps a check_in row for today only when
// its first possible send day is today (queued that day, or after 21:00 the evening before:
// quiet hours, 20261025180000), which is when this run words it "დღეს" (notice.sendDay).
{
  const problems = [];
  const domain = read("supabase/functions/sms-automation-run/domain.ts");
  const index = read("supabase/functions/sms-automation-run/index.ts");
  const cron = read("supabase/migrations/20260801132000_schedule_sms_pipeline.sql").match(/'sms-automation-daily',\s*'(\d+) (\d+) \* \* \*'/);
  const assumed = domain.match(/DAILY_RUN_TIME = "(\d\d):(\d\d):00"/);
  if (!cron || !assumed) problems.push("cannot read the sms-automation-daily schedule or domain.ts DAILY_RUN_TIME");
  else if (`${String((Number(cron[2]) + 4) % 24).padStart(2, "0")}:${cron[1].padStart(2, "0")}` !== `${assumed[1]}:${assumed[2]}`)
    problems.push(`domain.ts DAILY_RUN_TIME ${assumed[1]}:${assumed[2]} is not when sms-automation-daily fires (${cron[2]}:${cron[1]} UTC + 4 h)`);
  if (!/throw new ApiError\("Unknown mode", 400/.test(index)) problems.push("index.ts must answer 400 to an unknown mode");
  for (const flag of ["check_in_reminder_enabled", "win_back_enabled"])
    if (!new RegExp(`if \\(daily && rule\\.${flag}(?: && \\w+)?\\)`).test(index)) problems.push(`index.ts must run ${flag} only in the daily mode`);
  const job = readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()
    .map((f) => [f, read(join("supabase/migrations", f))])
    .filter(([, t]) => /cron\.schedule\(\s*'sms-check-in-short-notice'/.test(t)).pop();
  if (!job) problems.push("no migration schedules sms-check-in-short-notice");
  else {
    if (!/body := '\{"mode":"short_notice"\}'::jsonb/.test(job[1])) problems.push(`${job[0]} must post {"mode":"short_notice"}`);
    if (!/timeout_milliseconds := \d+/.test(job[1])) problems.push(`${job[0]} must set timeout_milliseconds (C4)`);
  }
  if (!read("scripts/check-db-contracts.mjs").includes('"sms-check-in-short-notice"')) problems.push("check-db-contracts.mjs C4 does not expect sms-check-in-short-notice");
  if (!/const day: CheckInDay = c\.check_in === notice\.sendDay\s*\?\s*"today"/.test(index)) problems.push('index.ts must word a short-notice text "today" exactly when its check-in is the day the text first goes out (notice.sendDay, quiet hours)');
  const gate = readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()
    .map((f) => [f, read(join("supabase/migrations", f))])
    .filter(([, t]) => /create or replace function public\.sms_cancel_ineligible_automation\(\)/i.test(t)).pop();
  if (!gate) problems.push("no migration defines sms_cancel_ineligible_automation");
  else if (!/mb\.check_in=\(now\(\) at time zone 'Asia\/Tbilisi'\)::date\s+and public\.sms_check_in_first_send_date\(s\.created_at\)=mb\.check_in/.test(gate[1].replace(/--[^\n]*/g, "")))
    problems.push(`${gate[0]}: sms_cancel_ineligible_automation must keep a check_in row for today whose first send day is today (else every "დღეს" text is failed within a minute)`);
  if (problems.length) problems.forEach((p) => fail(`C18/short-notice: ${p}`));
  else ok(`C18/short-notice: the short-notice run (${job[0]}) posts its own mode, touches no daily kind, DAILY_RUN_TIME matches the daily cron, and the dispatch check (${gate[0]}) keeps its same-day texts`);
}

// C18 — the SMS mirror texts a notice's title only ("MyBakuriani: " + title), so each
// call-out notice names what happened in its title: the six answers the host gets and the
// cleaner's two (20261024170000). A shared title made every host SMS read the same.
{
  const problems = [];
  const def = readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()
    .map((f) => [f, read(join("supabase/migrations", f))])
    .filter(([, t]) => /create or replace function public\.notify_owner_of_task_status\(\)/i.test(t)).pop();
  if (!def) problems.push("no migration defines notify_owner_of_task_status");
  else {
    const body = def[1].replace(/--[^\n]*/g, "");
    if (body.includes("დასუფთავების სტატუსი")) problems.push(`${def[0]} still titles call-out answers "დასუფთავების სტატუსი"`);
    const titles = new Set(body.match(/v_title := '[^']+'/g) ?? []);
    if (titles.size < 7) problems.push(`${def[0]} must give each call-out notice its own title (found ${titles.size} distinct)`);
  }
  if (problems.length) problems.forEach((p) => fail(`C18/call-out answers: ${p}`));
  else ok(`C18/call-out answers: every call-out notice names what happened in its title (${def[0]})`);
}

// C18 — the owner's technical task (2026-10-25; 20261025180000-180200). (a) Quiet hours: a
// check-in text goes out only 09:00 <= t < 21:00 Tbilisi; domain.ts CHECK_IN_SEND_WINDOW (which
// words the day by the day a text is sent) = SQL sms_check_in_window_open and
// sms_check_in_first_send_date, and the claim holds check_in rows back outside it. (b) No second
// send: the claim never re-hands a row whose send started and fails in-doubt rows first;
// sms-dispatch stamps sms_mark_send_started before sendSms and reads every uBill reply through
// outcome.ts. (c) Recipients: one rule (_shared/sms-recipients.ts) in both senders, its prod ref =
// media-hosts PROD_SUPABASE_HOST (unset list = everyone on prod only). (d) Call-out answers are
// the task's exact sentences; only they may use two SMS parts in the mirror. (e) Win-back only
// while sms_marketing_gates.win_back is true (one rule in SQL and TS), always with an opt-out link
// whose hash both sides compute alike; the opt-out route withdraws only on POST. (f) The guest
// consent wording is pinned to its version label: consent events record that label as the text
// the guest saw, so a wording change needs a new version (or a deliberate re-pin).
{
  const problems = [];
  const files = readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  const bodyIn = (fn) => {
    const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\(`, "i");
    const file = files.filter((f) => re.test(read(join("supabase/migrations", f)))).at(-1);
    if (!file) return { file: null, body: "" };
    const sql = read(join("supabase/migrations", file));
    const from = sql.search(re);
    const tag = /\$[a-z_]*\$/i.exec(sql.slice(from))?.[0];
    const start = tag ? sql.indexOf(tag, from) + tag.length : -1;
    const end = tag ? sql.indexOf(tag, start) : -1;
    return { file, body: start > 0 && end > start ? sql.slice(start, end).replace(/--[^\n]*/g, "") : "" };
  };
  const domain = read("supabase/functions/sms-automation-run/domain.ts");
  const index = read("supabase/functions/sms-automation-run/index.ts");
  const dispatch = read("supabase/functions/sms-dispatch/index.ts");
  const authHook = read("supabase/functions/auth-send-sms/handler.ts");

  const win = domain.match(/CHECK_IN_SEND_WINDOW = \{ from: "(\d\d:\d\d)", to: "(\d\d:\d\d)" \}/);
  const windowFn = bodyIn("sms_check_in_window_open");
  const firstFn = bodyIn("sms_check_in_first_send_date");
  if (!win) problems.push("domain.ts must export CHECK_IN_SEND_WINDOW = { from, to }");
  else {
    if (!windowFn.body.includes(`'${win[1]}'`) || !windowFn.body.includes(`'${win[2]}'`)) problems.push(`sms_check_in_window_open (${windowFn.file}) must open at ${win[1]} and close at ${win[2]} (domain.ts CHECK_IN_SEND_WINDOW)`);
    if (!firstFn.body.includes(`'${win[2]}'`)) problems.push(`sms_check_in_first_send_date (${firstFn.file}) must move a text queued from ${win[2]} to the next day`);
  }
  const claim = bodyIn("sms_claim_dispatch_batch");
  if (!/s\.automation_kind is distinct from 'check_in' or public\.sms_check_in_window_open\(now\(\)\)/.test(claim.body)) problems.push(`sms_claim_dispatch_batch (${claim.file}) must hold check_in rows back outside the quiet-hours window`);
  if (!/s\.send_started_at is null/.test(claim.body) || !/sms_fail_in_doubt_sends\(\)/.test(claim.body)) problems.push(`sms_claim_dispatch_batch (${claim.file}) must never re-hand a started row and must fail in-doubt rows first`);
  const stampAt = dispatch.indexOf('"sms_mark_send_started"');
  const sendAt = dispatch.indexOf("await sendSms(number");
  if (stampAt < 0 || sendAt < 0 || stampAt > sendAt || !/started !== true/.test(dispatch)) problems.push("sms-dispatch must stamp sms_mark_send_started, and send nothing unless it returned true, before calling sendSms");
  if (!/classifyReply\(reply\)/.test(dispatch)) problems.push("sms-dispatch must read every uBill reply through outcome.ts classifyReply");

  const prodRef = read("src/lib/media-hosts.ts").match(/PROD_SUPABASE_HOST = "([a-z0-9]{20})\.supabase\.co"/)?.[1];
  const ref = read("supabase/functions/_shared/sms-recipients.ts").match(/PROD_PROJECT_REF = "([a-z0-9]{20})"/)?.[1];
  if (!prodRef || ref !== prodRef) problems.push(`_shared/sms-recipients.ts PROD_PROJECT_REF (${ref}) must equal media-hosts PROD_SUPABASE_HOST (${prodRef})`);
  for (const [name, text] of [["sms-dispatch/index.ts", dispatch], ["auth-send-sms/handler.ts", authHook]]) {
    if (!/recipientPolicy\(\s*[\w.]+\("SMS_TEST_RECIPIENTS"\),\s*[\w.]+\("SUPABASE_URL"\)/.test(text) || /function testRecipients/.test(text)) problems.push(`${name} must take its recipients from _shared/sms-recipients.ts recipientPolicy(SMS_TEST_RECIPIENTS, SUPABASE_URL)`);
  }

  const owner = bodyIn("notify_owner_of_task_status");
  const sentences = ["დამლაგებელმა დაადასტურა გამოძახება.", "დამლაგებელმა უარყო გამოძახება.", "დამლაგებელი დაეთანხმა გამოძახების გაუქმებას.", "დამლაგებელი არ დაეთანხმა გაუქმებას. გამოძახება ძალაში რჩება.", "დასუფთავება დაიწყო.", "დასუფთავება დასრულდა."];
  const missing = sentences.filter((s) => !owner.body.includes(`v_title := '${s}'`));
  if (missing.length) problems.push(`notify_owner_of_task_status (${owner.file}) must title the call-out answers with the task's exact sentences; missing: ${missing.join(" | ")}`);
  const mirror = bodyIn("notifications_enqueue_sms");
  if (!/char_length\(v_title\) > \(case when new\.type = 'cleaning_task_status' then 121 else 57 end\)/.test(mirror.body)) problems.push(`notifications_enqueue_sms (${mirror.file}) must keep the one-part title cap (57) for every type but cleaning_task_status (121)`);
  if (Math.max(...sentences.map((s) => 13 + s.length)) > 121 + 13) problems.push("a call-out answer no longer fits two SMS parts");

  const gateFn = bodyIn("sms_marketing_gate_open");
  if (!/\(s\.value ->> p_gate\) = 'true'/.test(gateFn.body) || !/flag === true \|\| flag === "true"/.test(read("src/lib/sms/marketing-gates.ts"))) problems.push(`the marketing gate must be value ->> gate = 'true' in SQL (${gateFn.file}) and flag === true || flag === "true" in src/lib/sms/marketing-gates.ts`);
  if (!/if \(daily && rule\.win_back_enabled && winBackOpen\)/.test(index) || !/"sms_marketing_gate_open",\s*\{ p_gate: "win_back" \}/.test(index)) problems.push("sms-automation-run must queue win-back only while the win_back gate is open");
  if (!/"sms_issue_optout_token"/.test(index) || !/buildWinBack\(c, rule, siteUrl, `\$\{siteUrl\}\/sms-stop\/\$\{token\}`\)/.test(index)) problems.push("sms-automation-run must issue an opt-out token for every win-back and put its /sms-stop/ link in the text");
  if ((domain.match(/\+ `\\n\$\{optOut\}`/g) ?? []).length !== 2) problems.push("domain.ts buildWinBack must end both win-back texts with the TEMPLATES.win_back_opt_out line");
  const route = read("src/app/api/sms-stop/[token]/route.ts");
  const postAt = route.indexOf("export async function POST");
  if (postAt < 0 || route.slice(0, postAt).includes('"sms_optout_by_token"') || !route.slice(postAt).includes('"sms_optout_by_token"')) problems.push("/api/sms-stop/[token] must withdraw only on POST (a link preview's GET opts nobody out)");
  const nodeLen = read("src/lib/sms/opt-out.ts").match(/\{(\d+)\}\$\/;/)?.[1];
  const denoBytes = read("supabase/functions/sms-automation-run/opt-out.ts").match(/new Uint8Array\((\d+)\)/)?.[1];
  if (!nodeLen || !denoBytes || Number(nodeLen) !== Math.ceil((Number(denoBytes) * 4) / 3)) problems.push(`the opt-out token length in src/lib/sms/opt-out.ts (${nodeLen}) must be the base64url length of the Deno token's ${denoBytes} bytes`);

  const CONSENT_TEXT_PIN = { version: "manual-sms-v2", sha256: "70280bb74c87e566f4f49ef3df5ecca39f6dc926febeb23736d308b444152264" };
  const version = read("src/lib/sms/manual-booking-consent.ts").match(/MANUAL_BOOKING_SMS_CONSENT_VERSION = "([^"]+)"/)?.[1];
  const consentSms = domain.match(/consent_request:\n\s*"([^"]+)"/)?.[1];
  const consentPage = ["ka", "en", "ru"].map((l) => JSON.parse(read(`messages/${l}.json`)).SmsConsent);
  const consentHash = createHash("sha256").update(JSON.stringify([consentSms, ...consentPage]), "utf8").digest("hex");
  if (version !== CONSENT_TEXT_PIN.version || consentHash !== CONSENT_TEXT_PIN.sha256) problems.push(`the guest consent text (TEMPLATES.consent_request + SmsConsent in ka/en/ru, sha256 ${consentHash}) or its version (${version}) moved from the pin ${CONSENT_TEXT_PIN.version}/${CONSENT_TEXT_PIN.sha256.slice(0, 12)}: consent events record the version as the text the guest saw, so record a new version or re-pin deliberately`);

  if (problems.length) problems.forEach((p) => fail(`C18/messaging-task: ${p}`));
  else ok(`C18/messaging-task: quiet hours ${win[1]}-${win[2]} in TS and SQL (${windowFn.file}), no second send of a started row, one recipient rule (prod ${ref}), the task's call-out sentences, win-back gated with an opt-out link, consent text pinned to ${version}`);
}

// C15 — a guest's Smart Match request dates and budgets are range-checked in
// the database (F-V5-R9-01): 'infinity', a year past 5 million or a NaN budget
// reached every renter who answered the request (a thrown RangeError took the
// renter's whole sent-offers page down until the guest cancelled).
{
  const sql = readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort().map((f) => read(join("supabase/migrations", f))).join("\n");
  const problems = [];
  if (!/ADD CONSTRAINT smart_match_requests_dates_range CHECK \(\s*\(check_in IS NULL OR check_in BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'\)\s*AND \(check_out IS NULL OR check_out BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'\)/.test(sql)) problems.push("no migration adds smart_match_requests_dates_range (check_in/check_out BETWEEN 2020-01-01 AND 2100-12-31)");
  if (!/ADD CONSTRAINT smart_match_requests_budget_range CHECK \(\s*\(budget_min IS NULL OR budget_min BETWEEN 0 AND 99999999\.99\)\s*AND \(budget_max IS NULL OR budget_max BETWEEN 0 AND 99999999\.99\)/.test(sql)) problems.push("no migration adds smart_match_requests_budget_range (budgets BETWEEN 0 AND 99999999.99)");
  if (/DROP CONSTRAINT[^;]*smart_match_requests_(?:dates|budget)_range/.test(sql.replace(/--[^\n]*/g, ""))) problems.push("a migration drops a smart_match_requests range check");
  if (problems.length) problems.forEach((p) => fail(`C15/ranges: ${p}`));
  else ok("C15/ranges: smart_match_requests dates (2020..2100) and budgets are range-checked in the database");
}

// C45 — properties.amenities is NULL or an array of strings in the database
// (F-V4-R9-01): list pages call string methods on every element, so one stored
// [5] or {"toString":0} made /sales/all answer 500 and aborted `next build`.
{
  const sql = readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort().map((f) => read(join("supabase/migrations", f))).join("\n");
  const problems = [];
  const fn = sql.match(/CREATE (?:OR REPLACE )?FUNCTION public\.jsonb_string_array_valid\(p jsonb\)[\s\S]*?\$\$;/)?.[0] ?? "";
  if (!fn) problems.push("no migration creates public.jsonb_string_array_valid(jsonb)");
  else {
    if (!/IMMUTABLE/.test(fn) || !/SET search_path = ''/.test(fn)) problems.push("jsonb_string_array_valid must be IMMUTABLE with an empty search_path");
    if (!/jsonb_typeof\(p\) <> 'array' THEN false/.test(fn) || !/jsonb_typeof\(e\) <> 'string'/.test(fn)) problems.push("jsonb_string_array_valid must refuse a non-array and any non-string element");
  }
  if (!/REVOKE ALL ON FUNCTION public\.jsonb_string_array_valid\(jsonb\) FROM PUBLIC, anon;/.test(sql) || !/GRANT EXECUTE ON FUNCTION public\.jsonb_string_array_valid\(jsonb\) TO authenticated, service_role;/.test(sql)) problems.push("jsonb_string_array_valid must be revoked from PUBLIC/anon and granted to authenticated, service_role (every writer of properties evaluates the CHECK)");
  if (!/ADD CONSTRAINT properties_amenities_string_array CHECK \(public\.jsonb_string_array_valid\(amenities\)\)/.test(sql)) problems.push("no migration adds properties_amenities_string_array");
  if (/DROP CONSTRAINT[^;]*properties_amenities_string_array/.test(sql.replace(/--[^\n]*/g, ""))) problems.push("a migration drops properties_amenities_string_array");
  if (problems.length) problems.forEach((p) => fail(`C45/amenities: ${p}`));
  else ok("C45/amenities: properties.amenities is NULL or an array of strings in the database (jsonb_string_array_valid + CHECK)");
}

// ---------------------------------------------------------------------------
// C31 — the rental posting gate's HINT is the token the create form matches:
// the newest migration defining enforce_private_rental_membership() must raise
// exactly RENTAL_MEMBERSHIP_REQUIRED_HINT from src/lib/membership/plans.ts.
// ---------------------------------------------------------------------------
{
  const hint = read("src/lib/membership/plans.ts").match(/RENTAL_MEMBERSHIP_REQUIRED_HINT\s*=\s*"([A-Z_]+)"/)?.[1];
  const gateFile = readdirSync(join(root, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => /FUNCTION public\.enforce_private_rental_membership\(/.test(read(join("supabase/migrations", f))))
    .at(-1);
  const sqlHint = gateFile && read(join("supabase/migrations", gateFile)).match(/HINT = '([A-Z_]+)'/)?.[1];
  if (!hint || !sqlHint) fail("C31: could not read RENTAL_MEMBERSHIP_REQUIRED_HINT or the gate migration's HINT");
  else if (hint === sqlHint) ok(`C31: ${gateFile} raises the HINT the rental form matches (${hint})`);
  else fail(`C31: gate migration ${gateFile} raises HINT '${sqlHint}' but plans.ts matches '${hint}'`);
}

// C31 — a rental is public only while its owner's membership is active. The
// newest public_properties definition must keep the gate's predicate (a view
// re-created from an older text silently shows lapsed rentals again), and the
// contact route must check that view before revealing a property's number.
{
  const viewFile = readdirSync(join(root, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => /VIEW public\.public_properties\b/.test(read(join("supabase/migrations", f))))
    .at(-1);
  const view = viewFile && read(join("supabase/migrations", viewFile)).match(/CREATE OR REPLACE VIEW public\.public_properties\b[^;]*;/)?.[0];
  const needed = [
    /COALESCE\(pr\.is_for_sale, false\) OR \(EXISTS/,
    /FROM public\.user_subscriptions s/,
    /s\.user_id = pr\.owner_id/,
    /s\.status = 'active'/,
    /s\.starts_at <= now\(\)/,
    /s\.expires_at > now\(\)/,
  ];
  const missing = view ? needed.filter((re) => !re.test(view)).map(String) : ["view statement"];
  if (missing.length) fail(`C31: ${viewFile ?? "no migration"} public_properties lacks the membership predicate: ${missing.join(", ")}`);
  else ok(`C31: ${viewFile} hides rentals of owners without an active membership`);
  const contact = read("src/app/api/listings/[kind]/[id]/contact/route.ts");
  if (/from\("public_properties"\)/.test(contact)) ok("C31: the contact route checks public_properties before revealing a property's number");
  else fail("C31: src/app/api/listings/[kind]/[id]/contact/route.ts no longer checks public_properties (a hidden rental's number is revealed)");
}

// C31 — a Smart Match offer must point at a page the guest can open. The newest
// migration naming the offer trigger must (re)create it BEFORE INSERT on
// smart_match_offers, reading public_properties and raising the token the offer
// form matches; the guest offer loaders read listings from public_properties,
// never through a base `properties(...)` embed (RLS hides other owners' rows, so
// the embed came back null and the offer vanished).
{
  const token = "smart_match_listing_not_public";
  const trigFile = readdirSync(join(root, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => /trg_enforce_smart_match_offer_public_listing\b/.test(read(join("supabase/migrations", f))))
    .at(-1);
  const sql = trigFile ? read(join("supabase/migrations", trigFile)) : "";
  const fn = sql.match(/FUNCTION public\.enforce_smart_match_offer_public_listing\(\)[\s\S]*?\$function\$;/)?.[0] ?? "";
  if (
    /CREATE TRIGGER trg_enforce_smart_match_offer_public_listing BEFORE INSERT ON public\.smart_match_offers\b/.test(sql) &&
    /from public\.public_properties/i.test(fn) &&
    fn.includes(`'${token}'`)
  )
    ok(`C31: ${trigFile} refuses Smart Match offers from listings outside public_properties (${token})`);
  else fail(`C31: ${trigFile ?? "no migration"} does not create the offer trigger reading public_properties and raising '${token}'`);
  const form = read("src/app/[locale]/dashboard/renter/smart-match/page.tsx");
  if (form.includes(`"${token}"`)) ok("C31: the offer form matches the hidden-listing token");
  else fail(`C31: dashboard/renter/smart-match/page.tsx no longer matches '${token}' (a refused offer shows the generic error)`);
  for (const file of ["src/app/[locale]/dashboard/guest/loadData.ts"]) {
    const text = read(file);
    if (/(^|[\s,"'`(])properties\(/.test(text)) fail(`C31: ${file} embeds base properties(...) (null for other owners' listings: their offers vanish)`);
    else if (/from\("public_properties"\)/.test(text)) ok(`C31: ${file} reads offered listings from public_properties`);
    else fail(`C31: ${file} no longer reads offered listings from public_properties`);
  }
}

// ---------------------------------------------------------------------------
// C32 — Keepz payments. (a) The origin-less POST routes (callback, reconcile)
// exist, and the middleware exempts exactly the shared list — not a copy that
// could drift or widen. (b) The retired sandbox payment functions stay 410
// tombstones, so no bulk deploy can bring free wallet credit back. (c) The Keepz
// status list the routes accept equals the one keepz_apply_payment_status
// accepts in its newest migration.
// ---------------------------------------------------------------------------
{
  const paths = read("src/lib/payments/keepz/server-paths.ts");
  const routes = [...paths.matchAll(/export const KEEPZ_\w+_PATH = "(\/api\/[^"]+)"/g)].map((m) => m[1]);
  const missing = routes.filter((p) => !existsSync(join(root, "src/app", p, "route.ts")));
  const exemptsList = /KEEPZ_ORIGINLESS_POST_PATHS\.includes\(request\.nextUrl\.pathname\)/.test(read("src/middleware.ts"));
  if (routes.length !== 2) fail(`C32: expected 2 origin-less Keepz paths in server-paths.ts, found ${routes.length}`);
  else if (missing.length) fail(`C32: origin-less Keepz path with no route file: ${missing.join(", ")}`);
  else if (!exemptsList) fail("C32: src/middleware.ts must exempt KEEPZ_ORIGINLESS_POST_PATHS by exact pathname");
  else ok(`C32: ${routes.length} origin-less Keepz routes exist and the middleware exempts exactly them`);

  const revived = ["payment-create", "payment-process"].filter(
    (fn) => !/code: "GONE"[\s\S]*\b410\b/.test(read(`supabase/functions/${fn}/index.ts`)),
  );
  if (revived.length) fail(`C32: sandbox payment functions must stay 410 tombstones: ${revived.join(", ")}`);
  else ok("C32: payment-create and payment-process are 410 tombstones");

  const listIn = (text, re, item) => new Set([...((text.match(re)?.[1] ?? "").matchAll(item))].map((m) => m[1]));
  const tsStatuses = listIn(read("src/lib/payments/keepz/status.ts"), /KEEPZ_ORDER_STATUSES = \[([\s\S]*?)\]/, /"([A-Z_]+)"/g);
  const applyFile = readdirSync(join(root, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => /FUNCTION public\.keepz_apply_payment_status\(/.test(read(join("supabase/migrations", f))))
    .at(-1);
  const sqlStatuses = applyFile
    ? listIn(read(join("supabase/migrations", applyFile)), /p_provider_status NOT IN \(([\s\S]*?)\)/, /'([A-Z_]+)'/g)
    : new Set();
  if (!tsStatuses.size || !sqlStatuses.size) fail("C32: could not read KEEPZ_ORDER_STATUSES or keepz_apply_payment_status's status list");
  else if (setEq(tsStatuses, sqlStatuses)) ok(`C32: ${applyFile} accepts the ${tsStatuses.size} Keepz statuses status.ts knows`);
  else describeSetMismatch("C32 Keepz statuses", tsStatuses, "status.ts", sqlStatuses, applyFile);
}

// ---------------------------------------------------------------------------
// C33 — email notifications. (a) The origin-less email routes (dispatcher and
// the Resend webhook) exist, and the middleware exempts exactly the
// shared list. (b) EMAIL_NOTIFICATION_TYPES equals the array returned by
// public.email_notification_types() in the newest migration defining it.
// ---------------------------------------------------------------------------
{
  const paths = read("src/lib/email/server-paths.ts");
  const routes = [...paths.matchAll(/export const EMAIL_\w+_PATH = "(\/api\/[^"]+)"/g)].map((m) => m[1]);
  const missing = routes.filter((p) => !existsSync(join(root, "src/app", p, "route.ts")));
  const exemptsList = /EMAIL_ORIGINLESS_POST_PATHS\.includes\(request\.nextUrl\.pathname\)/.test(read("src/middleware.ts"));
  if (routes.length !== 2) fail(`C33: expected 2 origin-less email paths in server-paths.ts, found ${routes.length}`);
  else if (missing.length) fail(`C33: origin-less email path with no route file: ${missing.join(", ")}`);
  else if (!exemptsList) fail("C33: src/middleware.ts must exempt EMAIL_ORIGINLESS_POST_PATHS by exact pathname");
  else ok(`C33: ${routes.length} origin-less email routes exist and the middleware exempts exactly them`);

  const tsTypes = new Set(
    [...(read("src/lib/email/types.ts").match(/EMAIL_NOTIFICATION_TYPES = \[([\s\S]*?)\]/)?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]),
  );
  const typesFile = readdirSync(join(root, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => /FUNCTION public\.email_notification_types\(/i.test(read(join("supabase/migrations", f))))
    .at(-1);
  const sqlBody = typesFile
    ? (read(join("supabase/migrations", typesFile)).match(/function public\.email_notification_types\(\)[\s\S]*?select array\[([\s\S]*?)\]::text\[\]/i)?.[1] ?? "")
    : "";
  const sqlTypes = new Set([...sqlBody.replace(/--[^\n]*/g, "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
  if (!tsTypes.size || !sqlTypes.size) fail("C33: could not read EMAIL_NOTIFICATION_TYPES or email_notification_types()");
  else if (setEq(tsTypes, sqlTypes)) ok(`C33: ${typesFile} emails the ${tsTypes.size} notification types types.ts lists`);
  else describeSetMismatch("C33 email notification types", tsTypes, "types.ts", sqlTypes, typesFile);

  // (c) Admin email broadcasts (2026-10-09): the route reads recipients through
  // the recipients RPC and queues notification_type "broadcast" (offers,
  // consent-gated) or "service_broadcast" (service notices); only "broadcast"
  // gets the marketing footer, the newest email_notification_priority() sends
  // both after every transactional class, and the trigger's list has neither
  // (push broadcasts insert 'broadcast' notifications).
  const bRoute = read("src/app/api/admin/broadcasts/route.ts");
  const prioFile = readdirSync(join(root, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => /FUNCTION public\.email_notification_priority\(/i.test(read(join("supabase/migrations", f))))
    .at(-1);
  const prioSql = prioFile ? read(join("supabase/migrations", prioFile)) : "";
  const bClass = Number(prioSql.match(/when p_type = 'broadcast' then (\d)/)?.[1]);
  const sClass = Number(prioSql.match(/when p_type = 'service_broadcast' then (\d)/)?.[1]);
  const bProblems = [];
  if (!/rpc\("admin_broadcast_email_recipients"/.test(bRoute)) bProblems.push("the broadcast route must read recipients through admin_broadcast_email_recipients");
  if (!/\.from\("email_outbound"\)\s*\.insert\(/.test(bRoute) || !/emailKind === "service" \? "service_broadcast" : "broadcast"/.test(bRoute)) bProblems.push('the broadcast route must queue email_outbound rows of notification_type "service_broadcast" (service notice) or "broadcast" (offer)');
  if (!/marketing: row\.notification_type === "broadcast"/.test(read("src/app/api/email/dispatch/route.ts"))) bProblems.push("the dispatcher must render broadcasts with the marketing footer");
  if (!(bClass > 3)) bProblems.push(`${prioFile ?? "no migration"}: email_notification_priority() must put 'broadcast' after class 3`);
  if (!(sClass > 3)) bProblems.push(`${prioFile ?? "no migration"}: email_notification_priority() must put 'service_broadcast' after class 3`);
  for (const t of ["broadcast", "service_broadcast"]) if (sqlTypes.has(t)) bProblems.push(`email_notification_types() must not list '${t}'`);
  if (bProblems.length) fail(`C33 broadcasts: ${bProblems.join("; ")}`);
  else ok(`C33: email offers are consent-gated with the marketing footer, offers class ${bClass} and service notices class ${sClass} (${prioFile})`);
}

// ---------------------------------------------------------------------------
// C18 — notification SMS mirror (free kind 'notification'). The allow-list in
// the newest migration defining public.sms_notification_types() must be a
// subset of the emailed types (C33), must never name smart_match_request, an
// admin_* queue, broadcast or a vip_* type, and the newest
// sms_outbound_automation_kind_check must still accept 'notification'.
// ---------------------------------------------------------------------------
{
  const migDir = join(root, "supabase/migrations");
  const newestWith = (re) =>
    readdirSync(migDir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) => re.test(read(join("supabase/migrations", f))))
      .at(-1);
  const smsFile = newestWith(/FUNCTION public\.sms_notification_types\(/i);
  const emailFile = newestWith(/FUNCTION public\.email_notification_types\(/i);
  const listOf = (file, fn) =>
    new Set(
      [
        ...((file ? read(join("supabase/migrations", file)) : "").match(new RegExp(`function public\\.${fn}\\(\\)[\\s\\S]*?select array\\[([\\s\\S]*?)\\]::text\\[\\]`, "i"))?.[1] ?? "")
          .replace(/--[^\n]*/g, "")
          .matchAll(/'([a-z_]+)'/g),
      ].map((m) => m[1]),
    );
  const smsTypes = listOf(smsFile, "sms_notification_types");
  const emailTypes = listOf(emailFile, "email_notification_types");
  const notEmailed = [...smsTypes].filter((t) => !emailTypes.has(t));
  const forbidden = [...smsTypes].filter((t) => t === "smart_match_request" || t === "broadcast" || t.startsWith("admin_") || t.startsWith("vip_"));
  const checkFile = newestWith(/sms_outbound_automation_kind_check\s*\n?\s*check/i);
  const checkAccepts = checkFile
    ? /sms_outbound_automation_kind_check\s*\n?\s*check[\s\S]*?\]\)\)/i.exec(read(join("supabase/migrations", checkFile)))?.[0].includes("'notification'")
    : false;
  if (!smsTypes.size || !emailTypes.size) fail("C18: could not read sms_notification_types() or email_notification_types()");
  else if (notEmailed.length) fail(`C18: sms_notification_types() (${smsFile}) has types email_notification_types() does not: ${notEmailed.join(", ")}`);
  else if (forbidden.length) fail(`C18: sms_notification_types() (${smsFile}) must not mirror: ${forbidden.join(", ")}`);
  else if (!checkAccepts) fail(`C18: the newest sms_outbound_automation_kind_check (${checkFile ?? "none"}) must accept 'notification'`);
  else ok(`C18: ${smsFile} mirrors ${smsTypes.size} emailed types by SMS (free kind 'notification', no fan-out/admin/vip types)`);
}

// ---------------------------------------------------------------------------
// C18 — the number a mirrored SMS goes to. profiles.phone is empty for every e-mail or
// Google sign-up, so the newest notifications_enqueue_sms() falls back, after the profile
// number and before the e2e skip and the caps (both must see the number chosen), to the
// listing the notice is about: a moderated listing (its UUID in action_url, owner-checked)
// or a call-out answer (?task=, which notify_owner_of_task_status appends: the called
// listing for the cleaner, the apartment for the renter), else the newest active listing
// in the notice's cabinet (dashboard_scope_for_listing), else in any. A new call-out is
// not mirrored: notify_cleaner_of_new_task queues the renter's paid cleaner_call text
// (C24), and a free mirror row would take the notice's unique source_notification_id
// first. One number gets at most 8 texts a day across both kinds (20261023110000). A pending
// listing's number is never read (20261023120000): typed freely, nobody has reviewed it, so it
// could be anyone's. Call-out answers read ACTIVE listings only; a moderation notice, which only
// the admin moderate route writes, also reads its blocked listing (a first listing's rejection).
// ---------------------------------------------------------------------------
{
  const files = readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  const text = (f) => read(join("supabase/migrations", f));
  const bodyOf = (fn) => {
    const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\(`, "i");
    const file = files.filter((f) => re.test(text(f))).at(-1);
    if (!file) return { file: null, body: "" };
    const sql = text(file);
    const from = sql.search(re);
    const tag = /\$[a-z_]*\$/i.exec(sql.slice(from))?.[0];
    const start = tag ? sql.indexOf(tag, from) + tag.length : -1;
    const end = tag ? sql.indexOf(tag, start) : -1;
    return { file, body: start > 0 && end > start ? sql.slice(start, end).replace(/--[^\n]*/g, "") : "" };
  };
  const mirror = bodyOf("notifications_enqueue_sms");
  const types = bodyOf("sms_notification_types");
  const status = bodyOf("notify_owner_of_task_status");
  const b = mirror.body;
  const problems = [];
  if (/'cleaning_task_new'/.test(types.body)) problems.push(`sms_notification_types() (${types.file}) mirrors cleaning_task_new again: its free row takes the notice's source_notification_id before notify_cleaner_of_new_task queues the renter's paid cleaner_call text`);
  if (!/v_ref\s*:=\s*substring\(\s*new\.action_url/i.test(b)) problems.push(`${mirror.file}: without a profile number the mirror must read the listing or call-out id from the notice's action_url`);
  if (!/new\.type\s*=\s*'listing_moderation'[\s\S]*?public\.properties\s+pr\s+where\s+pr\.id\s*=\s*v_ref\s+and\s+pr\.owner_id\s*=\s*new\.user_id\s+and\s+pr\.status\s+in\s*\(\s*'active'\s*,\s*'blocked'\s*\)\s+union\s+all\s+select\s+sv\.phone\s+from\s+public\.services\s+sv\s+where\s+sv\.id\s*=\s*v_ref\s+and\s+sv\.owner_id\s*=\s*new\.user_id\s+and\s+sv\.status\s+in\s*\(\s*'active'\s*,\s*'blocked'\s*\)\s*\)\s*x/i.test(b)) problems.push(`${mirror.file}: a moderation notice must fall back to the moderated listing's own number, only if the recipient owns it and an admin has decided it (active or blocked; never a pending listing's number nobody has reviewed)`);
  if (!/from\s+public\.cleaning_tasks\s+t[\s\S]*?sv\.id\s*=\s*t\.cleaner_service_id\s+and\s+sv\.owner_id\s*=\s*new\.user_id\s+and\s+sv\.status\s*=\s*'active'\s+left\s+join\s+public\.properties\s+pr\s+on\s+pr\.id\s*=\s*t\.property_id\s+and\s+pr\.owner_id\s*=\s*new\.user_id\s+and\s+pr\.status\s*=\s*'active'\s+where\s+t\.id\s*=\s*v_ref/i.test(b)) problems.push(`${mirror.file}: a call-out answer must fall back to the recipient's own ACTIVE listing on the task in its ?task= link (the called listing for the cleaner, the apartment for the renter; a pending apartment's number nobody has reviewed)`);
  if (!/dashboard_scope_for_listing\(/i.test(b) || !/order\s+by\s+\(x\.scope\s+is\s+not\s+distinct\s+from\s+new\.dashboard_scope\)\s+desc\s*,\s*x\.created_at\s+desc\s*,\s*x\.id\s+desc/i.test(b)) problems.push(`${mirror.file}: the last fallback must be the newest active listing in the notice's cabinet (dashboard_scope_for_listing), then in any, picked deterministically`);
  if (!/from\s+public\.properties\s+pr\s+where\s+pr\.owner_id\s*=\s*new\.user_id\s+and\s+pr\.status\s*=\s*'active'/i.test(b) || !/from\s+public\.services\s+sv\s+where\s+sv\.owner_id\s*=\s*new\.user_id\s+and\s+sv\.status\s*=\s*'active'/i.test(b)) problems.push(`${mirror.file}: the cabinet fallback must read only the recipient's own ACTIVE listings (never someone else's or an unreviewed number)`);
  if ((b.match(/sms_canonical_ge_phone\(/gi) ?? []).length < 5) problems.push(`${mirror.file}: every number the mirror reads (profile, moderated listing, call-out listing, both cabinet branches) must go through sms_canonical_ge_phone`);
  const fallbackAt = b.search(/dashboard_scope_for_listing\(/i);
  const e2eAt = b.indexOf("@e2e.mybakuriani.test");
  const lockAt = b.search(/pg_try_advisory_xact_lock\(/i);
  if (!(fallbackAt > -1 && e2eAt > fallbackAt && lockAt > e2eAt)) problems.push(`${mirror.file}: the listing fallback must come before the e2e skip and the caps, so both see the number chosen`);
  if (!/automation_kind\s+in\s*\(\s*'notification'\s*,\s*'cleaner_call'\s*\)\s+and\s+s\.recipient_phone\s*=\s*v_phone/i.test(b)) problems.push(`${mirror.file}: the per-number cap must count the call-out texts too (automation_kind in ('notification', 'cleaner_call'))`);
  const taskLinks = (path) => (status.body.match(new RegExp(`'${path}\\?task='\\s*\\|\\|\\s*NEW\\.id`, "gi")) ?? []).length;
  if (taskLinks("/dashboard/cleaner") < 2 || taskLinks("/dashboard/renter/cleaners") < 1) problems.push(`notify_owner_of_task_status (${status.file ?? "not found"}) must link every call-out notice with ?task=<id> (the mirror finds the listing by it)`);
  if (problems.length) problems.forEach((p) => fail(`C18/call-out number: ${p}`));
  else ok(`C18/call-out number: ${mirror.file} texts a recipient without a profile number on the listing the notice is about (moderation: active or blocked; ?task=: active), else the cabinet's newest active listing, never a pending one, before the e2e skip and the caps; a new call-out is left to the paid cleaner_call text`);
}

// ---------------------------------------------------------------------------
// C18 — one SMS per purchase (20261004150000). _enqueue_system_sms deletes the
// payment_success mirror row queued earlier in the same transaction, so the
// newest purchase_package / purchase_vip must write 'payment_success' BEFORE
// they call _enqueue_system_sms, and the newest _enqueue_system_sms must still
// carry that delete.
// ---------------------------------------------------------------------------
{
  const migDir = join(root, "supabase/migrations");
  const bodyOf = (fn) => {
    const re = new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\(`, "i");
    const file = readdirSync(migDir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) => re.test(read(join("supabase/migrations", f))))
      .at(-1);
    if (!file) return { file: null, body: "" };
    const text = read(join("supabase/migrations", file));
    const from = text.search(re);
    const tag = /\$[a-z_]*\$/i.exec(text.slice(from))?.[0];
    const start = tag ? text.indexOf(tag, from) + tag.length : -1;
    const end = tag ? text.indexOf(tag, start) : -1;
    const body = start > 0 && end > start ? text.slice(start, end).replace(/--[^\n]*/g, "") : "";
    return { file, body };
  };
  const problems = [];
  for (const fn of ["purchase_package", "purchase_vip"]) {
    const { file, body } = bodyOf(fn);
    const paid = body.indexOf("'payment_success'");
    const sms = body.indexOf("_enqueue_system_sms(");
    if (paid < 0 || sms < 0) problems.push(`${fn} (${file ?? "not found"}) must write 'payment_success' and call _enqueue_system_sms`);
    else if (sms < paid) problems.push(`${fn} (${file}) calls _enqueue_system_sms before writing 'payment_success' (the buyer gets two texts again)`);
  }
  const helper = bodyOf("_enqueue_system_sms");
  if (!/delete\s+from\s+sms_outbound[\s\S]*'payment_success'/i.test(helper.body))
    problems.push(`_enqueue_system_sms (${helper.file ?? "not found"}) no longer drops the same-transaction payment_success text`);
  if (problems.length) problems.forEach((p) => fail(`C18: ${p}`));
  else ok("C18: purchases write payment_success before their system SMS, and _enqueue_system_sms drops the duplicate");
}

// ---------------------------------------------------------------------------
// C18 — owner SMS credits are taken when uBill accepts the message
// (20261007150000). The newest sms_mark_claim_submitted debits the same kinds
// the delivery charge does; the newest sms_mark_provider_undelivered refunds
// only for uBill's report status 2/4, which both callers pass as report_status.
// Every other list of charged kinds names the same kinds (the claim batch, the
// consent and call-out credit gates; the expiry a superset), a cleaner_call row
// carries no number (the renter reads it, C25), and only the refund starts with
// the prefix TransactionList reads as +1 SMS (20261023110000).
// ---------------------------------------------------------------------------
{
  const latestBody = (fn) => {
    const re = new RegExp(
      `create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\(`,
      "i",
    );
    const file = readdirSync(join(root, "supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) => re.test(read(join("supabase/migrations", f))))
      .at(-1);
    if (!file) return { file: null, body: "" };
    const text = read(join("supabase/migrations", file));
    const from = text.search(re);
    const tag = /\$[a-z_]*\$/i.exec(text.slice(from))?.[0];
    const start = tag ? text.indexOf(tag, from) + tag.length : -1;
    const end = tag ? text.indexOf(tag, start) : -1;
    return {
      file,
      body: start > 0 && end > start ? text.slice(start, end).replace(/--[^\n]*/g, "") : "",
    };
  };
  const kinds = (body) =>
    new Set(
      [
        ...(body.match(/automation_kind\s+in\s*\(([^)]*)\)/i)?.[1] ?? "").matchAll(
          /'([a-z_]+)'/g,
        ),
      ].map((m) => m[1]),
    );
  const submitted = latestBody("sms_mark_claim_submitted");
  const delivered = latestBody("sms_mark_provider_delivered");
  const undelivered = latestBody("sms_mark_provider_undelivered");
  const problems = [];
  const subKinds = kinds(submitted.body);
  const delKinds = kinds(delivered.body);
  if (!subKinds.size || !/sms_remaining\s*=\s*v_remaining\s*-\s*1/.test(submitted.body))
    problems.push(
      `sms_mark_claim_submitted (${submitted.file ?? "not found"}) no longer debits a credit when uBill accepts the message`,
    );
  else if (!setEq(subKinds, delKinds))
    problems.push(
      `charged kinds differ: sms_mark_claim_submitted (${submitted.file}) [${[...subKinds]}] vs sms_mark_provider_delivered (${delivered.file}) [${[...delKinds]}]`,
    );
  if (!/report_status'\s*,\s*''\)\s*in\s*\(\s*'2'\s*,\s*'4'\s*\)/.test(undelivered.body))
    problems.push(
      `sms_mark_provider_undelivered (${undelivered.file ?? "not found"}) must refund only for report_status 2/4`,
    );
  for (const caller of [
    "supabase/functions/sms-dispatch/index.ts",
    "supabase/functions/sms-delivery-report/index.ts",
  ])
    if (
      !/sms_mark_provider_undelivered/.test(read(caller)) ||
      !/report_status:\s*status\b/.test(read(caller))
    )
      problems.push(`${caller} must pass report_status to sms_mark_provider_undelivered`);
  const lists = (body) =>
    [...body.matchAll(/automation_kind\s+in\s*\(([^)]*)\)/gi)].map((m) => new Set([...m[1].matchAll(/'([a-z_]+)'/g)].map((k) => k[1])));
  const claim = latestBody("sms_claim_dispatch_batch");
  const claimLists = lists(claim.body).filter((l) => l.has("check_in"));
  if (claimLists.length < 2 || claimLists.some((l) => !setEq(l, subKinds)))
    problems.push(`sms_claim_dispatch_batch (${claim.file ?? "not found"}) must reserve and rank exactly the kinds sms_mark_claim_submitted charges [${[...subKinds]}]`);
  for (const fn of ["request_manual_booking_sms_consent", "notify_cleaner_of_new_task"]) {
    const { file, body } = latestBody(fn);
    const gate = lists(body).find((l) => l.has("check_in"));
    if (!gate || !setEq(gate, subKinds)) problems.push(`${fn} (${file ?? "not found"}) must count every unsettled charged kind [${[...subKinds]}] against the owner's credits`);
  }
  const expire = latestBody("sms_expire_stale_automation");
  const expired = lists(expire.body).find((l) => l.has("check_in")) ?? new Set();
  const notExpired = [...subKinds].filter((k) => !expired.has(k));
  if (notExpired.length) problems.push(`sms_expire_stale_automation (${expire.file ?? "not found"}) never retires charged kind(s) ${notExpired.join(", ")}`);
  for (const { file, body } of [submitted, delivered, undelivered])
    if (!lists(body).find((l) => l.has("price_drop") && !l.has("check_in"))?.has("cleaner_call"))
      problems.push(`${file}: a cleaner_call transaction must be described without the recipient's number (the renter reads it)`);
  const refundPrefix = "SMS ვერ მიეწოდა, კრედიტი დაბრუნდა";
  if (!undelivered.body.includes(`'${refundPrefix}`))
    problems.push(`sms_mark_provider_undelivered (${undelivered.file}) no longer starts its refund row with '${refundPrefix}' (TransactionList shows it as a charge)`);
  for (const fn of ["sms_mark_claim_submitted", "sms_mark_provider_delivered", "sms_mark_sent", "sms_mark_claim_sent", "sms_consume_credit", "sms_consume_credits_bulk"])
    if (latestBody(fn).body.includes(refundPrefix)) problems.push(`${fn} writes the refund prefix '${refundPrefix}' on a charge`);
  if (!read("src/components/balance/TransactionList.tsx").includes(`"${refundPrefix}"`))
    problems.push(`TransactionList.tsx must tell a refund ("${refundPrefix}") from a charge`);
  if (problems.length) problems.forEach((p) => fail(`C18: ${p}`));
  else
    ok(
      `C18: owner SMS credits are charged at submit (${subKinds.size} kinds, the same in the delivery charge, the claim batch, both credit gates and the expiry), refunded only on uBill status 2/4 under the prefix TransactionList reads; cleaner_call rows carry no number`,
    );
}

// ---------------------------------------------------------------------------
// C18 — the guest's SMS consent follows the number, per host (20261022150000).
// manual_sms_consent_inherit is the one definition of a standing acceptance (an
// accepted, link-issued row — not v1, not inherited — on another live booking,
// no later decline) and writes an accepted 'manual-sms-v2-inherited' row with a
// hash nobody holds (the accepted state needs one and the revoke paths filter
// on token_hash). The win-back texts carry no opt-out, so the guest's
// link is the only withdrawal: manual_sms_consent_reconcile withdraws the host's
// inherited rows when the last link-issued source is cancelled, re-phoned or
// deleted (without accepted_at, so the booking is not read as the guest
// declining). The manual_bookings triggers (insert, number or status change,
// delete) call both; the newest respond_manual_booking_sms_consent covers the
// host's open bookings on accept and withdraws every accepted row of the host +
// number on a decline or revoke. All four functions stay closed to client roles.
// Only OPEN stays inherit (check-out today or later, Tbilisi): the gate lives inside
// manual_sms_consent_inherit (20261022160000) so the triggers, cover and the backfill
// share it; the triggers call inherit directly, so no stay from the past starts
// queueing win-back texts.
// ---------------------------------------------------------------------------
{
  const migs = readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  const bodyOf = (fn) => {
    const re = new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\(`, "i");
    const file = migs.filter((f) => re.test(read(join("supabase/migrations", f)))).at(-1);
    if (!file) return { file: null, body: "" };
    const text = read(join("supabase/migrations", file));
    const from = text.search(re);
    const tag = /\$[a-z_]*\$/i.exec(text.slice(from))?.[0];
    const start = tag ? text.indexOf(tag, from) + tag.length : -1;
    const end = tag ? text.indexOf(tag, start) : -1;
    return { file, body: start > 0 && end > start ? text.slice(start, end).replace(/--[^\n]*/g, "") : "" };
  };
  const linkIssued = /consent_version not in \('manual-sms-v1', 'manual-sms-v2-inherited'\)/i;
  const problems = [];
  const inherit = bodyOf("manual_sms_consent_inherit");
  if (!linkIssued.test(inherit.body)) problems.push(`manual_sms_consent_inherit (${inherit.file ?? "not found"}) must take its source from link-issued rows only (not v1, not inherited): an inherited row has no link the guest can answer`);
  if (!/d\.declined_at > c\.accepted_at/i.test(inherit.body)) problems.push("manual_sms_consent_inherit must not inherit past a later decline of the number");
  if (!/'manual-sms-v2-inherited', 'accepted'/i.test(inherit.body) || !/sha256\(/i.test(inherit.body)) problems.push("manual_sms_consent_inherit must write an accepted 'manual-sms-v2-inherited' row with a hash");
  if (!/coalesce\(v_prev/i.test(inherit.body)) problems.push("manual_sms_consent_inherit must hand app.manual_booking_sms_consent_write back (its caller may hold it 'allowed')");
  if (!/check_out\s*<\s*\(now\(\) at time zone 'Asia\/Tbilisi'\)::date\s+then\s+return false/i.test(inherit.body)) problems.push(`manual_sms_consent_inherit (${inherit.file ?? "not found"}) must refuse a stay that already ended (check_out before today, Tbilisi): the manual_bookings triggers call it directly, so cover's filter alone lets a past-dated booking inherit`);
  const reconcile = bodyOf("manual_sms_consent_reconcile");
  if (!linkIssued.test(reconcile.body) || !/accepted_at = null/i.test(reconcile.body)) problems.push(`manual_sms_consent_reconcile (${reconcile.file ?? "not found"}) must keep the inherited rows only while a link-issued source stands, and withdraw them WITHOUT accepted_at (else the booking reads as a guest withdrawal)`);
  if (!/coalesce\(v_prev/i.test(reconcile.body)) problems.push("manual_sms_consent_reconcile must hand app.manual_booking_sms_consent_write back");
  const follow = bodyOf("manual_booking_sms_consent_follow_trg");
  if (!/manual_sms_consent_reconcile\(/i.test(follow.body) || !/manual_sms_consent_inherit\(/i.test(follow.body)) problems.push(`manual_booking_sms_consent_follow_trg (${follow.file ?? "not found"}) must call both manual_sms_consent_reconcile and manual_sms_consent_inherit`);
  const respond = bodyOf("respond_manual_booking_sms_consent");
  if (!/manual_sms_consent_cover\(/i.test(respond.body)) problems.push(`respond_manual_booking_sms_consent (${respond.file ?? "not found"}) must cover the host's other open bookings on accept`);
  if (!/with withdrawn as \(\s*update public\.manual_booking_sms_consents[\s\S]*c\.status = 'accepted'/i.test(respond.body)) problems.push("respond_manual_booking_sms_consent must withdraw every accepted row of the host and number on a decline or revoke");
  const sql = migs.map((f) => read(join("supabase/migrations", f))).join("\n").replace(/--[^\n]*/g, "");
  for (const [name, event] of [["follow_ins", "insert"], ["follow_upd", "update of guest_phone, status"], ["follow_del", "delete"]]) {
    if (!new RegExp(`create trigger manual_booking_sms_consent_${name}\\s+after ${event} on public\\.manual_bookings`, "i").test(sql)) problems.push(`no migration creates trigger manual_booking_sms_consent_${name} (after ${event}) on manual_bookings`);
  }
  for (const sig of ["manual_sms_consent_inherit\\(uuid, uuid\\)", "manual_sms_consent_cover\\(uuid, text\\)", "manual_sms_consent_reconcile\\(uuid, text\\)", "manual_booking_sms_consent_follow_trg\\(\\)"]) {
    if (!new RegExp(`revoke all on function public\\.${sig} from public, anon, authenticated`, "i").test(sql)) problems.push(`no migration revokes ${sig.replace(/\\/g, "")} from the client roles`);
  }
  if (problems.length) problems.forEach((p) => fail(`C18/consent: ${p}`));
  else ok(`C18/consent: ${inherit.file} inherits only from link-issued acceptances onto open stays, reconciles when the last one goes, the manual_bookings triggers call both, ${respond.file} covers on accept and withdraws on decline/revoke, and the functions are closed to client roles`);
}

// ---------------------------------------------------------------------------
// C18 — the food and transport cabinets show no SMS: no top-bar chip, no SMS
// balance in the wallet card, no SMS packages and no "web notification & SMS"
// wording (the owner's call 2026-10-17). Food has its own topbar, balance page
// and parameters page, which must never mention SMS (any "sms" in them fails).
// Transport shares ServiceTopbar, service/balance and ServiceDashboardClient with
// entertainment, employment and services, so those three ask
// src/lib/dashboard/cabinetSms.ts:showsSms (false for exactly food and transport),
// and the other cabinets must keep their SMS. service/parameters words its "New
// request" line by cabinet: only employment's (a job application) is texted.
{
  const problems = [];
  if (!/const CABINETS_WITHOUT_SMS = \["food", "transport"\];/.test(read("src/lib/dashboard/cabinetSms.ts")))
    problems.push("src/lib/dashboard/cabinetSms.ts must list exactly food and transport in CABINETS_WITHOUT_SMS");
  const foodFiles = [
    ...walk("src/app/[locale]/dashboard/food", [".ts", ".tsx"]),
    "src/components/layout/FoodTopbar.tsx",
    "src/components/layout/FoodSidebar.tsx",
  ];
  for (const f of foodFiles) if (/sms/i.test(read(f))) problems.push(`${f} mentions SMS (the food cabinet shows none)`);
  if (!/showSms=\{showsSms\(serviceSegment\)\}/.test(read("src/components/layout/DashboardShell.tsx")))
    problems.push("DashboardShell no longer passes showSms={showsSms(serviceSegment)} to ServiceTopbar");
  if (!/\bshowSms\b/.test(read("src/components/layout/ServiceTopbar.tsx")))
    problems.push("ServiceTopbar no longer takes showSms (transport would show the SMS chip)");
  const balance = read("src/app/[locale]/dashboard/service/balance/page.tsx");
  if (!/showsSms\(/.test(balance) || !balance.includes("SmsBalanceStat") || !balance.includes('"sms"'))
    problems.push("service/balance must gate SmsBalanceStat and the sms packages on showsSms and keep both for the other cabinets");
  const home = read("src/app/[locale]/dashboard/service/ServiceDashboardClient.tsx");
  if (!/showsSms\(category\)/.test(home) || !home.includes('"stats.spent"') || !home.includes('"stats.spentVip"'))
    problems.push("ServiceDashboardClient must use stats.spentVip for transport and keep stats.spent for the others");
  const params = read("src/app/[locale]/dashboard/service/parameters/page.tsx");
  if (!/dashboardScopeForPath\(usePathname\(\)\) === "employment"/.test(params) || !params.includes('"channelWebSms"') || !params.includes('"channelWebOnly"'))
    problems.push("service/parameters must say web + SMS for a new request only in the employment cabinet (a job application is the only texted request) and web only in the other three");
  if (problems.length) problems.forEach((p) => fail(`C18/cabinets: ${p}`));
  else
    ok(
      "C18/cabinets: food shows no SMS (topbar, balance page, parameters); transport is gated through showsSms in the shared topbar, balance page and home tile, the other service cabinets keep SMS, and service/parameters says web + SMS for a new request only in employment",
    );
}

// ---------------------------------------------------------------------------
// C36 — sign-up confirmation link. /auth/confirm is a client page (no route.ts
// in that segment) that verifies only when its button is clicked: a mail
// scanner's prefetch GET must not confirm an address, and /verify must count
// against the user's own IP, not the app server's. It accepts only the
// email|signup link types, and the login page sends signUp and resend back to
// /auth/confirm. (The hosted "Confirm signup" template is outside the repo.)
// ---------------------------------------------------------------------------
{
  const dir = "src/app/[locale]/auth/confirm";
  const pageFile = join(dir, "page.tsx");
  const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
  // The text of a call from its "(" to the matching ")".
  const callText = (text, open) => {
    let depth = 0;
    for (let i = open; i < text.length; i += 1) {
      if (text[i] === "(") depth += 1;
      else if (text[i] === ")" && --depth === 0) return text.slice(open, i + 1);
    }
    return text.slice(open);
  };
  if (existsSync(join(root, dir, "route.ts"))) fail(`C36: ${dir}/route.ts must not exist (a GET handler verifies on a mail scanner's prefetch)`);
  else if (!existsSync(join(root, pageFile))) fail(`C36: ${pageFile} is missing`);
  else {
    const raw = read(pageFile);
    const page = stripComments(raw);
    const effects = [...page.matchAll(/\buse(?:Layout)?Effect\s*\(/g)].map((m) => callText(page, m.index + m[0].length - 1));
    const types = new Set([...(page.match(/CONFIRM_OTP_TYPES = \[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));
    const expected = new Set(["email", "signup"]);
    const otherTypes = [...page.matchAll(/["'](recovery|invite|magiclink|email_change)["']/g)].map((m) => m[1]);
    if (!/^\s*["']use client["']/.test(raw)) fail(`C36: ${pageFile} must be a client page ("use client")`);
    else if (!/\.verifyOtp\(/.test(page) || !/\bonClick=/.test(page)) fail(`C36: ${pageFile} must call verifyOtp from a button's click handler`);
    else if (effects.some((body) => /verifyOtp|exchangeCodeForSession/.test(body))) fail(`C36: ${pageFile} verifies inside an effect (on load); verify only on click`);
    else if (!setEq(types, expected)) describeSetMismatch("C36 confirm link types", types, "CONFIRM_OTP_TYPES", expected, "email|signup");
    else if (otherTypes.length) fail(`C36: ${pageFile} mentions other email-link types: ${otherTypes.join(", ")}`);
    else ok(`C36: ${pageFile} verifies on click only, for the ${[...types].join("|")} link types`);
  }

  const login = read("src/app/[locale]/auth/login/page.tsx");
  const redirects = [...login.matchAll(/emailRedirectTo:\s*([^,}\n]+?)\s*[,}\n]/g)].map((m) => m[1]);
  if (!/const CONFIRM_REDIRECT_URL = [^;]*\/auth\/confirm`/.test(login)) fail("C36: login/page.tsx must build CONFIRM_REDIRECT_URL on /auth/confirm");
  else if (redirects.length < 2 || redirects.some((r) => r !== "CONFIRM_REDIRECT_URL")) fail(`C36: every emailRedirectTo in login/page.tsx (signUp and resend) must be CONFIRM_REDIRECT_URL, found [${redirects.join(", ")}]`);
  else ok(`C36: login/page.tsx sends signUp and resend back to /auth/confirm (${redirects.length} emailRedirectTo)`);
}

// ---------------------------------------------------------------------------
// C24 — a cleaner's view of a call-out. properties/profiles have no SELECT policy
// for a cleaner, so a PostgREST embed of either in a cleaner's query is silently
// null (the 2026-10-01 "I can't tell which apartment or who to call" report). The
// cleaner reads the apartment and the owner only through the definer RPC
// get_my_cleaning_task_owner_details(), which answers only for the caller's own
// call-outs and withholds everything once one is declined or cancelled. Eight pieces
// have to agree: (1) the RPC's live-status list equals the status CHECK minus the
// statuses that end a call-out (WITHHELD below), (2) the RPC is keyed on auth.uid()
// ONLY (the WHERE ends there, no set operation) and every column but task_id sits
// behind the live gate, (3) the net EXECUTE after replaying every migration is
// authenticated only, never PUBLIC/anon, and nothing later drops, renames or
// SECURITY INVOKER-s it, (4) cleaner pages never embed properties/profiles and hand
// the RPC rows to mergeCleanerTasks, (5) no browser code writes cleaning_tasks and the
// net client DML grants (replayed over every migration) are none, (6) the cleaner's
// bell text is formatted in Asia/Tbilisi, (7) hostile owner-typed text in it is
// flattened to one line, (8) tasks.ts CleaningTaskOwnerDetails lists exactly the RPC's
// columns. It is a static text check: it reads the SQL it can see (comments and COMMENT
// ON strings dropped), not the live ACL (check-db-contracts and the e2e spec do).
// ---------------------------------------------------------------------------
{
  const migDir = "supabase/migrations";
  const migrations = readdirSync(join(root, migDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  // Statuses that end a call-out: the RPC answers with an empty row for them.
  const WITHHELD = new Set(["declined", "cancelled"]);
  const NAME_RPC = "get_my_cleaning_task_owner_details";
  const NAME_TRIG = "notify_cleaner_of_new_task";

  // SQL without its comments: a `--` or `/* */` comment or a COMMENT ON string may name any statement.
  // Quoted strings are kept whole, so a `--` inside one is not a comment.
  const stripSql = (sql) => {
    let out = "";
    let i = 0;
    while (i < sql.length) {
      const two = sql.slice(i, i + 2);
      if (two === "--") {
        while (i < sql.length && sql[i] !== "\n") i++;
      } else if (two === "/*") {
        const end = sql.indexOf("*/", i + 2);
        i = end === -1 ? sql.length : end + 2;
        out += " ";
      } else if (sql[i] === "'") {
        let j = i + 1;
        while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'"))
          j += sql[j] === "'" ? 2 : 1;
        out += sql.slice(i, j + 1);
        i = j + 1;
      } else {
        out += sql[i++];
      }
    }
    return out.replace(
      /\bCOMMENT\s+ON\s+[\s\S]*?\s+IS\s+(?:'(?:[^']|'')*'|NULL)\s*;/gi,
      "",
    );
  };
  const stripTs = (code) =>
    code
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
  // The text between the "(" at `open` and its matching ")".
  const parenSpan = (text, open) => {
    let depth = 0;
    let quote = false;
    for (let i = open; i < text.length; i++) {
      const c = text[i];
      if (c === "'") quote = !quote;
      else if (!quote && c === "(") depth++;
      else if (!quote && c === ")" && --depth === 0)
        return text.slice(open + 1, i);
    }
    return undefined;
  };
  const splitTop = (text, sep) => {
    const parts = [];
    let depth = 0;
    let quote = false;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === "'") quote = !quote;
      else if (!quote && c === "(") depth++;
      else if (!quote && c === ")") depth--;
      else if (!quote && depth === 0 && c === sep) {
        parts.push(text.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(text.slice(start));
    return parts;
  };
  // Statements, split at `;` outside quotes and dollar-quoted bodies, whitespace collapsed.
  const statementsCache = new Map();
  const statementsOf = (file) => {
    if (statementsCache.has(file)) return statementsCache.get(file);
    const sql = stripSql(read(join(migDir, file)));
    const out = [];
    let start = 0;
    let i = 0;
    while (i < sql.length) {
      const c = sql[i];
      if (c === "'") {
        i++;
        while (i < sql.length && !(sql[i] === "'" && sql[i + 1] !== "'"))
          i += sql[i] === "'" ? 2 : 1;
        i++;
      } else if (c === "$") {
        const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i, i + 64));
        if (tag) {
          const end = sql.indexOf(tag[0], i + tag[0].length);
          i = end === -1 ? sql.length : end + tag[0].length;
        } else {
          i++;
        }
      } else if (c === ";") {
        out.push(sql.slice(start, i));
        start = ++i;
      } else {
        i++;
      }
    }
    if (sql.slice(start).trim()) out.push(sql.slice(start));
    const statements = out
      .map((st) => st.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    statementsCache.set(file, statements);
    return statements;
  };

  // Anchored on the DEFINITION: a later migration that only GRANTs, ALTERs or COMMENTs on a function, or
  // wires a trigger to it, names it too and must not be taken for its body. The body may be quoted `$$` or
  // `$function$` (pg_get_functiondef); the header is every clause outside it. The name may be qualified.
  const CREATE =
    'CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:"?public"?\\.)?"?';
  const fnParts = (sql, name) => {
    const m = sql.match(
      new RegExp(
        `${CREATE}${name}"?\\s*\\(\\s*\\)([\\s\\S]*?)\\bAS\\s+\\$(\\w*)\\$([\\s\\S]*?)\\$\\2\\$([^;]*);`,
        "i",
      ),
    );
    return m ? { header: m[1] + m[4], body: m[3] } : { header: "", body: "" };
  };
  const newestWith = (re) =>
    migrations.filter((f) => re.test(stripSql(read(join(migDir, f))))).at(-1);
  const quoted = (list) =>
    new Set([...list.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]));

  // What every statement, in migration order, leaves of one function: whether it exists, who may EXECUTE it,
  // and what later statements did to its definition. CREATE OR REPLACE keeps the ACL it finds, so only the net
  // result counts, not what one file restates.
  const replayFunction = (name) => {
    // The function itself: this whole name (not a longer one that starts or ends with it, nor another schema's)
    // with no arguments. `name`, `name()` and `public."name"()` are it; an overload `name(uuid)` is another function.
    const ref = new RegExp(
      `(?<![\\w$."])(?:"?public"?\\.)?"?${name}"?(?:\\s*\\(\\s*\\)|(?![\\w$"]|\\s*\\())`,
      "i",
    );
    const created = new RegExp(`^${CREATE}${name}"?\\s*\\(\\s*\\)`, "i");
    // A new function: PUBLIC (and so anon) may execute it until a REVOKE says otherwise, and nobody else can
    // until a GRANT does (this project's default privileges, C34).
    const fresh = () => ({ public: true, anon: true, authenticated: false });
    const state = {
      exists: false,
      droppedBy: undefined,
      acl: fresh(),
      problems: [],
    };
    const reset = () => {
      state.acl = fresh();
      state.problems = [];
    };
    for (const file of migrations) {
      for (const st of statementsOf(file)) {
        if (created.test(st)) {
          if (!/^CREATE\s+OR\s+REPLACE\b/i.test(st) || !state.exists)
            state.acl = fresh();
          state.problems = [];
          state.exists = true;
          state.droppedBy = undefined;
          continue;
        }
        const drop = /^DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(.+)$/i.exec(st);
        if (drop) {
          if (ref.test(drop[1])) {
            reset();
            state.exists = false;
            state.droppedBy = file;
          }
          continue;
        }
        const alter = /^ALTER\s+FUNCTION\s+(.+)$/i.exec(st);
        if (alter) {
          if (
            state.exists &&
            ref.test(
              alter[1].split(
                /\s+(?:OWNER|SECURITY|RENAME|SET|RESET|STABLE|VOLATILE|IMMUTABLE|DEPENDS)\b/i,
              )[0],
            ) &&
            /\b(?:SECURITY\s+INVOKER|RENAME|SET\s+SCHEMA|RESET)\b/i.test(
              alter[1],
            )
          ) {
            state.problems.push(
              `${file} renames it, moves it, resets its search_path or makes it SECURITY INVOKER`,
            );
          }
          continue;
        }
        const acl =
          /^(GRANT|REVOKE)\s+(?:GRANT\s+OPTION\s+FOR\s+)?(?:ALL(?:\s+PRIVILEGES)?|EXECUTE)\s+ON\s+(FUNCTION\s+.+?|ALL\s+FUNCTIONS\s+IN\s+SCHEMA\s+\S+)\s+(?:TO|FROM)\s+(.+?)(?:\s+WITH\s+GRANT\s+OPTION|\s+CASCADE|\s+RESTRICT)?$/i.exec(
            st,
          );
        if (
          acl &&
          state.exists &&
          (/^ALL\s+FUNCTIONS\s+IN\s+SCHEMA\s+"?public"?$/i.test(acl[2]) ||
            (/^FUNCTION\s/i.test(acl[2]) && ref.test(acl[2])))
        ) {
          const value = acl[1].toUpperCase() === "GRANT";
          for (const role of acl[3]
            .split(",")
            .map((r) => r.trim().replace(/^"|"$/g, "").toLowerCase())) {
            if (role in state.acl) state.acl[role] = value;
          }
        }
      }
    }
    return state;
  };

  const checkFile = newestWith(
    /ADD\s+CONSTRAINT\s+cleaning_tasks_status_check/i,
  );
  const rpcFile = newestWith(
    new RegExp(`${CREATE}${NAME_RPC}"?\\s*\\(\\s*\\)`, "i"),
  );
  const trigFile = newestWith(
    new RegExp(`${CREATE}${NAME_TRIG}"?\\s*\\(\\s*\\)`, "i"),
  );
  // `CHECK (status IN ('a', 'b'))` or `CHECK ((status = ANY (ARRAY['a'::text, 'b'::text])))` (pg_get_constraintdef's shape),
  // read up to its own closing parenthesis, not up to the next `);` (a continued ALTER TABLE clause follows it).
  const checkList = (() => {
    if (!checkFile) return undefined;
    const sql = stripSql(read(join(migDir, checkFile)));
    const m =
      /ADD\s+CONSTRAINT\s+cleaning_tasks_status_check\s+CHECK\s*\(/i.exec(sql);
    return m ? parenSpan(sql, m.index + m[0].length - 1) : undefined;
  })();

  // (3, part) nothing LATER drops, renames or SECURITY INVOKER-s a definition (trigger function: no ACL to keep).
  const rpcState = replayFunction(NAME_RPC);
  const trigState = replayFunction(NAME_TRIG);
  for (const [name, st] of [
    [NAME_RPC, rpcState],
    [NAME_TRIG, trigState],
  ]) {
    if (st.droppedBy)
      fail(`C24: ${st.droppedBy} drops ${name}() and nothing creates it again`);
    for (const problem of st.problems) fail(`C24: ${problem} (${name})`);
  }

  if (!checkList)
    fail(
      "C24: could not read the cleaning_tasks status CHECK from the migrations",
    );
  else if (!rpcFile) fail(`C24: no migration defines ${NAME_RPC}()`);
  else {
    const rpcSql = stripSql(read(join(migDir, rpcFile)));
    const { header: rpcHeader, body: rpcRaw } = fnParts(rpcSql, NAME_RPC);
    const rpcBody = rpcRaw.trim().replace(/;\s*$/, "");
    const alias =
      rpcBody.match(
        /\bFROM\s+(?:public\.)?cleaning_tasks\s+(?:AS\s+)?([a-z_][a-z0-9_]*)/i,
      )?.[1] ?? "task";
    const live = quoted(
      rpcBody.match(
        new RegExp(`${alias}\\.status\\s+IN\\s*\\(([^)]*)\\)`, "i"),
      )?.[1] ?? "",
    );
    const expected = new Set(
      [...quoted(checkList)].filter((st) => !WITHHELD.has(st)),
    );
    const sqlColumns = new Set(
      (() => {
        const m = new RegExp(
          `${NAME_RPC}"?\\s*\\(\\s*\\)\\s*RETURNS\\s+TABLE\\s*\\(`,
          "i",
        ).exec(rpcSql);
        const span = m
          ? parenSpan(rpcSql, m.index + m[0].length - 1)
          : undefined;
        return splitTop(span ?? "", ",")
          .map((col) => col.trim().split(/\s+/)[0])
          .filter(Boolean);
      })(),
    );
    const tsKeys = new Set(
      [
        ...(
          stripTs(read("src/lib/cleaner/tasks.ts")).match(
            /export interface CleaningTaskOwnerDetails\s*\{([\s\S]*?)\n\}/,
          )?.[1] ?? ""
        ).matchAll(/^\s*([a-z_]+)\??:/gm),
      ].map((m) => m[1]),
    );
    // The WHERE is the last clause (an ORDER BY may follow) and says nothing but the caller's own rows; no OR, no
    // second branch of a set operation. Every column but the id is `CASE WHEN <gate>.live ...`.
    const scoped =
      new RegExp(
        `\\bWHERE\\s+${alias}\\.cleaner_id\\s*=\\s*(?:\\(\\s*SELECT\\s+auth\\.uid\\(\\)\\s*\\)|auth\\.uid\\(\\))(?:\\s+ORDER\\s+BY\\s[^;]*)?$`,
        "i",
      ).test(rpcBody) && !/\b(?:UNION|INTERSECT|EXCEPT)\b/i.test(rpcBody);
    const gate = rpcBody.match(
      /\bAS\s+live\s*\)\s*AS\s+([a-z_][a-z0-9_]*)/i,
    )?.[1];
    const gated = gate
      ? [
          ...rpcBody.matchAll(
            new RegExp(`\\bCASE\\s+WHEN\\s+${gate}\\.live\\b`, "gi"),
          ),
        ].length
      : 0;
    const net = rpcState.acl;
    if (!live.size) {
      fail(
        `C24: ${rpcFile} must gate on an explicit allow-list (${alias}.status IN ('pending', ...)): a deny-list would disclose every status added to the CHECK later`,
      );
    } else if (!setEq(live, expected)) {
      describeSetMismatch(
        `C24 live statuses (${checkFile} CHECK minus ${[...WITHHELD].join("/")} vs ${rpcFile}; a status that ENDS a call-out belongs in WITHHELD in this check, any other must be in the RPC's list)`,
        expected,
        "CHECK",
        live,
        `${NAME_RPC}()`,
      );
    } else if (
      !/SECURITY\s+DEFINER/i.test(rpcHeader) ||
      !/SET\s+search_path\s*(?:=|\bTO\b)/i.test(rpcHeader)
    ) {
      fail(
        `C24: ${rpcFile} must define the RPC SECURITY DEFINER with a pinned search_path`,
      );
    } else if (!scoped) {
      fail(
        `C24: ${rpcFile} must end its query with WHERE ${alias}.cleaner_id = auth.uid() (optionally (SELECT auth.uid()) and an ORDER BY): no OR, no UNION: the RPC is a definer and anything wider hands every owner's number to every signed-in user`,
      );
    } else if (
      !gate ||
      sqlColumns.size === 0 ||
      gated !== sqlColumns.size - 1
    ) {
      fail(
        `C24: ${rpcFile} must put every column except task_id behind the live gate (CASE WHEN <gate>.live ...): found ${gated} gated for ${Math.max(sqlColumns.size - 1, 0)} columns${gate ? "" : " and no (SELECT ... AS live) AS <gate>"}`,
      );
    } else if (
      !rpcState.exists ||
      net.public ||
      net.anon ||
      !net.authenticated
    ) {
      fail(
        `C24: after every migration EXECUTE on ${NAME_RPC}() is PUBLIC=${net.public}, anon=${net.anon}, authenticated=${net.authenticated}: it must be authenticated only (REVOKE ALL ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated, C34)`,
      );
    } else if (!sqlColumns.size || !setEq(sqlColumns, tsKeys)) {
      describeSetMismatch(
        "C24 RPC columns",
        sqlColumns,
        `${rpcFile} RETURNS TABLE`,
        tsKeys,
        "tasks.ts CleaningTaskOwnerDetails",
      );
    } else {
      ok(
        `C24: ${NAME_RPC}() (${rpcFile}) discloses for [${[...live].join(", ")}] = the status CHECK minus ${[...WITHHELD].join("/")}, scoped to auth.uid() alone, ${gated} columns gated, authenticated only, ${sqlColumns.size} columns = CleaningTaskOwnerDetails`,
      );
    }
  }

  // (4) cleaner pages: no embeds of the tables a cleaner cannot read, and the RPC rows are handed to the merge.
  const cleanerDir = "src/app/[locale]/dashboard/cleaner";
  const code = (f) => stripTs(read(f));
  const readers = (
    existsSync(join(root, cleanerDir))
      ? [...walk(cleanerDir, [".ts", ".tsx"])]
      : []
  ).filter((f) => /\.from\(\s*["'`]cleaning_tasks["'`]\s*\)/.test(code(f)));
  const embedding = readers.filter((f) =>
    /\b(?:properties|profiles)\s*(?:![A-Za-z0-9_]+)*\s*\(/.test(code(f)),
  );
  // mergeCleanerTasks(platform, manual, <the RPC rows>): a missing or empty third argument is the old bug without the embed.
  const mergeArgs = (text) => {
    const at = text.search(/\bmergeCleanerTasks\s*\(/);
    if (at < 0) return undefined;
    return splitTop(parenSpan(text, text.indexOf("(", at)) ?? "", ",").map(
      (arg) => arg.trim(),
    );
  };
  const unmerged = readers.filter((f) => {
    const text = code(f);
    const args = mergeArgs(text);
    return (
      !/loadCleaningTaskOwnerDetails\(/.test(text) ||
      !args ||
      args.length < 3 ||
      /^(?:\[\s*\]|undefined|null)?$/.test(args[2])
    );
  });
  if (!readers.length)
    fail(
      `C24: no file under ${cleanerDir} reads cleaning_tasks any more; update this check with the move`,
    );
  else if (embedding.length)
    fail(
      `C24: ${embedding.join(", ")} embeds properties/profiles in a cleaner query (RLS makes it null for a cleaner): use loadCleaningTaskOwnerDetails`,
    );
  else if (unmerged.length)
    fail(
      `C24: ${unmerged.join(", ")} reads cleaning_tasks without handing loadCleaningTaskOwnerDetails rows to mergeCleanerTasks as its third argument (the apartment and owner details never reach the card)`,
    );
  else
    ok(
      `C24: ${readers.length} cleaner reader(s) merge get_my_cleaning_task_owner_details and embed neither properties nor profiles`,
    );

  // (5) nobody writes cleaning_tasks from code that holds a user session; the grants are revoked to match.
  const writers = [];
  for (const [file, text] of srcText) {
    // The REVOKE does not apply to service_role: a file that holds the service client is not a user session.
    if (/supabase\/admin["']/.test(text)) continue;
    for (const m of stripTs(text).matchAll(
      /\.from\(\s*["'`]cleaning_tasks["'`]\s*\)\s*\.([a-z]+)\(/g,
    )) {
      if (m[1] !== "select") writers.push(`${file} (.${m[1]})`);
    }
  }
  // The client roles' DML on the table after replaying every GRANT/REVOKE in order. Supabase's default
  // privileges give a new table everything for anon and authenticated (PUBLIC gets nothing), so a clean end
  // state means an explicit REVOKE had the last word.
  const DML = ["insert", "update", "delete", "truncate"];
  const clientRoles = ["anon", "authenticated", "public"];
  const dml = Object.fromEntries(
    clientRoles.map((role) => [role, new Set(role === "public" ? [] : DML)]),
  );
  // The table in a GRANT/REVOKE target list: `cleaning_tasks`, `public.cleaning_tasks`, `"public"."cleaning_tasks"`.
  const CLEANING_TASKS_REF =
    /(?:^|,\s*)(?:"?public"?\.)?"?cleaning_tasks"?\s*(?:,|$)/i;
  let lastRevoke;
  for (const file of migrations) {
    for (const st of statementsOf(file)) {
      const m =
        /^(GRANT|REVOKE)\s+(?:GRANT\s+OPTION\s+FOR\s+)?(.+?)\s+ON\s+(?:TABLE\s+)?(.+?)\s+(?:TO|FROM)\s+(.+?)(?:\s+WITH\s+GRANT\s+OPTION|\s+CASCADE|\s+RESTRICT)?$/i.exec(
          st,
        );
      if (
        !m ||
        !(
          CLEANING_TASKS_REF.test(m[3]) ||
          /^ALL\s+TABLES\s+IN\s+SCHEMA\s+"?public"?$/i.test(m[3])
        )
      )
        continue;
      const privileges = m[2]
        .replace(/\([^)]*\)/g, "")
        .split(",")
        .map((p) => p.trim().toLowerCase())
        .flatMap((p) => (p === "all" || p === "all privileges" ? DML : [p]))
        .filter((p) => DML.includes(p));
      const grant = m[1].toUpperCase() === "GRANT";
      for (const role of m[4]
        .split(",")
        .map((r) => r.trim().replace(/^"|"$/g, "").toLowerCase())) {
        if (!dml[role]) continue;
        for (const p of privileges) {
          if (grant) dml[role].add(p);
          else dml[role].delete(p);
        }
      }
      if (!grant && privileges.length) lastRevoke = file;
    }
  }
  const stillGranted = clientRoles.flatMap((role) =>
    [...dml[role]].map((p) => `${p} to ${role}`),
  );
  if (writers.length)
    fail(
      `C24: browser/server code writes cleaning_tasks directly: ${writers.join(", ")} (only create_cleaning_task / transition_cleaning_task may)`,
    );
  else if (stillGranted.length)
    fail(
      `C24: after every migration client DML is still granted on public.cleaning_tasks (${stillGranted.join(", ")}): only the definer RPCs write it, so the REVOKE (INSERT, UPDATE, DELETE, TRUNCATE FROM anon, authenticated) must have the last word`,
    );
  else
    ok(
      `C24: cleaning_tasks has no client writer in src/ and ${lastRevoke} revokes client DML (nothing re-grants it)`,
    );

  // (6)+(7) the cleaner's bell text.
  if (!trigFile) fail(`C24: no migration defines ${NAME_TRIG}()`);
  else {
    const trigBody = fnParts(
      stripSql(read(join(migDir, trigFile))),
      NAME_TRIG,
    ).body;
    // The class an owner-typed value is flattened with: line breaks (a typed one cannot fake a second line) and
    // bidi overrides / zero-width characters (an RLO reorders the time and the address). It is a U& string of
    // code-point escapes, so it means the same under every collation (POSIX [:space:] does not).
    const flatClass = (value) =>
      new RegExp(
        `regexp_replace\\(\\s*${value}\\s*,\\s*(?:U&)?'([^']*)'`,
        "i",
      ).exec(trigBody)?.[1] ?? "";
    const flattened = (value) => {
      const cls = flatClass(value);
      return (
        /\\0001-\\0020/.test(cls) &&
        /\\2028-\\202F/i.test(cls) &&
        /\\FEFF/i.test(cls)
      );
    };
    if (!/AT\s+TIME\s+ZONE\s+'Asia\/Tbilisi'/i.test(trigBody))
      fail(
        `C24: ${trigFile} formats the call-out time without AT TIME ZONE 'Asia/Tbilisi' (the bell shows UTC)`,
      );
    else if (!flattened("v_title") || !flattened("NEW\\.address"))
      fail(
        `C24: ${trigFile} must flatten BOTH owner-typed values (apartment title and address) with the explicit class of line breaks, bidi overrides and zero-width characters (U&'[\\0001-\\0020 ... \\2028-\\202F ... \\FEFF]+'), before they go into the bell and the emailed copy`,
      );
    else
      ok(
        `C24: ${trigFile} formats the bell time in Asia/Tbilisi and flattens the owner-typed title and address`,
      );

    // (8) the cleaner's SMS (C18 + C24, 2026-10-23): the renter's, paid with 1 SMS credit (kind cleaner_call,
    // charged when uBill accepts it). This trigger queues it after the bell notice, in its own BEGIN … EXCEPTION
    // block (a failure there must keep the bell and the call-out): sender = the renter, recipient = the cleaner,
    // one text per call-out, on the cleaner's profile number else the listing the renter CALLED (an ACTIVE cleaning
    // listing of theirs only, 20261023120000: a pending or blocked listing's number nobody has reviewed), only while the
    // renter has a free credit, at most 3 a day from one renter to one cleaner, never to an e2e account, under
    // the mirror's per-number try-lock and daily cap.
    const insAt = trigBody.search(/INSERT\s+INTO\s+public\.notifications/i);
    const smsAt = trigBody.search(/INSERT\s+INTO\s+public\.sms_outbound/i);
    const smsStmt = smsAt === -1 ? "" : trigBody.slice(smsAt, trigBody.indexOf(";", smsAt));
    const handlersAfter = [...trigBody.matchAll(/EXCEPTION\s+WHEN\s+OTHERS/gi)].filter((m) => m.index > smsAt).length;
    const gate = [...trigBody.matchAll(/automation_kind\s+in\s*\(([^)]*)\)/gi)].map((m) => m[1]).find((l) => l.includes("'check_in'")) ?? "";
    if (smsAt === -1 || !/'cleaner_call'/.test(smsStmt))
      fail(`C24: ${trigFile} no longer queues the call-out SMS (INSERT INTO public.sms_outbound … 'cleaner_call'): the cleaner gets the bell only`);
    else if (/UPDATE\s+public\.sms_outbound/i.test(trigBody))
      fail(`C24: ${trigFile} rewords an sms_outbound row again: the mirror no longer queues cleaning_task_new, this trigger owns the text`);
    else if (!(smsAt > insAt && insAt !== -1) || !/\bBEGIN\b/i.test(trigBody.slice(insAt, smsAt)) || handlersAfter < 2)
      fail(`C24: ${trigFile} must queue the SMS after the bell notice, inside its own BEGIN … EXCEPTION WHEN OTHERS block (otherwise a failure there rolls back the bell and the call-out)`);
    else if (!/\(\s*NEW\.owner_id\s*,\s*NEW\.cleaner_id\s*,/i.test(smsStmt) || !/source_cleaning_task_id/i.test(smsStmt) || !/ON\s+CONFLICT\s+DO\s+NOTHING/i.test(smsStmt))
      fail(`C24: ${trigFile} must queue the text as the renter's (sender NEW.owner_id) to the cleaner (NEW.cleaner_id), linked by source_cleaning_task_id, ON CONFLICT DO NOTHING`);
    else if (!/ORDER\s+BY\s+\(\s*s\.id\s+IS\s+NOT\s+DISTINCT\s+FROM\s+NEW\.cleaner_service_id\s*\)\s+DESC/i.test(trigBody))
      fail(`C24: ${trigFile} must text a cleaner without a profile number on the listing the renter called (cleaner_service_id first), not on their newest one`);
    else if (
      !/FROM\s+public\.services\s+s\s+WHERE\s+s\.owner_id\s*=\s*NEW\.cleaner_id\s+AND\s+s\.category\s*=\s*'cleaning'\s+AND\s+s\.status\s*=\s*'active'\s+AND\s+public\.sms_canonical_ge_phone\(\s*s\.phone\s*\)\s+IS\s+NOT\s+NULL\s+ORDER\s+BY/i.test(trigBody) ||
      !/sms_canonical_ge_phone\(\s*p\.phone\s*\)/i.test(trigBody) ||
      !/sms_canonical_ge_phone\(\s*s\.phone\s*\)/i.test(trigBody)
    )
      fail(`C24: ${trigFile} must text only the cleaner's own number: the profile one, else an ACTIVE cleaning listing of theirs (the called one first; a pending or blocked listing's number nobody has reviewed), through sms_canonical_ge_phone`);
    else if (!/automation_kind\s*=\s*'cleaner_call'\s+AND\s+s\.sender_id\s*=\s*NEW\.owner_id\s+AND\s+s\.recipient_id\s*=\s*NEW\.cleaner_id[\s\S]*?>=\s*3\s+THEN\s+RETURN\s+NEW/i.test(trigBody))
      fail(`C24: ${trigFile} must text at most 3 call-outs a day from one renter to one cleaner (one renter must not use up the number's daily budget)`);
    else if (
      !/b\.user_id\s*=\s*NEW\.owner_id/i.test(trigBody) ||
      !gate.includes("'cleaner_call'") ||
      !/coalesce\(\s*v_credits\s*,\s*0\s*\)\s*-\s*v_reserved\s*<\s*1\s+THEN\s+RETURN\s+NEW/i.test(trigBody)
    )
      fail(`C24: ${trigFile} must queue the text only while the renter has a free credit (balances.sms_remaining minus unsettled charged texts, cleaner_call included)`);
    else if (!/@e2e\.mybakuriani\.test/.test(trigBody) || !/'sms_notification_phone:'/.test(trigBody) || !/automation_kind\s+IN\s*\(\s*'notification'\s*,\s*'cleaner_call'\s*\)/i.test(trigBody))
      fail(`C24: ${trigFile} must skip e2e accounts and apply the mirror's per-number try-lock and daily cap (both kinds)`);
    else if (!/'app\.site_url'/.test(trigBody) || !/!~\s*'\^https:\/\//.test(trigBody))
      fail(`C24: ${trigFile} must take the SMS link host from Vault 'app.site_url' and drop it unless it is a bare https:// origin`);
    else
      ok(`C24: ${trigFile} queues the renter's paid cleaner_call text (the cleaner's own number, the called listing first, free-credit gate, 3 a day per renter, per-number cap) in its own exception block`);
  }
}

// ---------------------------------------------------------------------------
// C39 — ownership verification. (a) The origin-less purge route exists and the
// middleware exempts exactly the shared list. (b) Admins view a document
// through a signed URL WITHOUT `download` (never saved to Downloads). (c) Only
// src/lib/ownership/purge.ts deletes from the ownership-documents bucket.
// (d) Browser reads of ownership_verifications select OWNER_VERIFICATION_COLUMNS,
// which must equal the column grant to authenticated in the migration (a `*`
// or an extra column is "permission denied").
// ---------------------------------------------------------------------------
{
  const pathsFile = "src/lib/ownership/server-paths.ts";
  if (!existsSync(join(root, pathsFile))) fail(`C39: ${pathsFile} is missing`);
  else {
    const routes = [...read(pathsFile).matchAll(/export const OWNERSHIP_\w+_PATH = "(\/api\/[^"]+)"/g)].map((m) => m[1]);
    const missing = routes.filter((p) => !existsSync(join(root, "src/app", p, "route.ts")));
    const exemptsList = /OWNERSHIP_ORIGINLESS_POST_PATHS\.includes\(request\.nextUrl\.pathname\)/.test(read("src/middleware.ts"));
    if (routes.length !== 1) fail(`C39: expected 1 origin-less ownership path in server-paths.ts, found ${routes.length}`);
    else if (missing.length) fail(`C39: origin-less ownership path with no route file: ${missing.join(", ")}`);
    else if (!exemptsList) fail("C39: src/middleware.ts must exempt OWNERSHIP_ORIGINLESS_POST_PATHS by exact pathname");
    else ok("C39: the origin-less purge route exists and the middleware exempts exactly it");
  }

  const docRoute = "src/app/api/admin/ownership-verifications/documents/[id]/route.ts";
  if (!existsSync(join(root, docRoute))) fail(`C39: ${docRoute} is missing`);
  else {
    const body = read(docRoute);
    if (!/createSignedUrl\(/.test(body)) fail(`C39: ${docRoute} must answer with a short-lived signed URL`);
    else if (/download\s*:/.test(body)) fail(`C39: ${docRoute} signs with \`download\` — ID cards would be saved to admin Downloads`);
    else ok("C39: admins view documents through a signed URL without download");
  }

  const deleters = srcFiles.filter((f) => {
    const t = read(f);
    return /["']ownership-documents["']/.test(t) && /\.remove\(/.test(t);
  });
  const strayDeleters = deleters.filter((f) => f !== "src/lib/ownership/purge.ts");
  if (strayDeleters.length) fail(`C39: only src/lib/ownership/purge.ts may delete ownership documents: ${strayDeleters.join(", ")}`);
  else ok("C39: src/lib/ownership/purge.ts is the only code that deletes ownership documents");

  const readers = srcFiles.filter(
    (f) => !f.startsWith("src/app/api/") && f !== "src/lib/ownership/purge.ts" && /\.from\(\s*["']ownership_verifications["']\s*\)/.test(read(f)),
  );
  const loose = readers.filter((f) => !/OWNER_VERIFICATION_COLUMNS/.test(read(f)));
  const typesFile = "src/lib/ownership/types.ts";
  const tsColumns = existsSync(join(root, typesFile))
    ? (read(typesFile).match(/OWNER_VERIFICATION_COLUMNS\s*=\s*"([^"]+)"/)?.[1] ?? "").split(",").map((c) => c.trim()).filter(Boolean)
    : [];
  const grantColumns = (
    read("supabase/migrations/20261001200000_ownership_verification.sql").match(
      /GRANT SELECT \(([\s\S]*?)\) ON public\.ownership_verifications TO authenticated/,
    )?.[1] ?? ""
  )
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (loose.length) fail(`C39: browser reads of ownership_verifications must select OWNER_VERIFICATION_COLUMNS: ${loose.join(", ")}`);
  else if (!tsColumns.length || !grantColumns.length) fail("C39: could not read OWNER_VERIFICATION_COLUMNS or the migration's column grant");
  else if (!setEq(new Set(tsColumns), new Set(grantColumns)))
    describeSetMismatch("C39 owner-readable columns", new Set(tsColumns), "OWNER_VERIFICATION_COLUMNS", new Set(grantColumns), "the column grant");
  else ok(`C39: ${readers.length} browser reader(s) select the ${tsColumns.length} granted ownership_verifications columns`);
}

// ---------------------------------------------------------------------------
// C40 — the SEO surface. (a) robots.txt: NON_INDEXABLE_PREFIXES covers every
// prefix middleware protects (C8) and is expanded for every routing locale.
// (b) Sitemap: every public page directory under src/app/[locale] is listed in
// src/app/sitemap.ts (or is private / noindex on purpose), every listed path has
// a page, the resort guide's paths match its directories, and listings are
// emitted through the canonical-URL helpers. (c) Every public page builds its
// metadata through buildPageMetadata / buildListingMetadata, which own canonical
// and hreflang. (d) One canonical host in site.ts, check-production-config.mjs
// and check-redirects.mjs. (e) The sitemap's /_next/image URLs use a width and a
// quality next.config.ts allows (any other pair answers 400). (f) hreflang has a
// single source: next-intl's alternateLinks stays off. (g) JSON-LD is written
// only through components/seo/JsonLd.tsx (escaped by serializeJsonLd).
// ---------------------------------------------------------------------------
{
  const quoted = (text) => [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const localeDir = "src/app/[locale]";

  const robotsLib = read("src/lib/seo/robots.ts");
  const prefixes = quoted(robotsLib.match(/NON_INDEXABLE_PREFIXES = \[([\s\S]*?)\] as const/)?.[1] ?? "");
  const protectedPrefixes = quoted(read("src/middleware.ts").match(/const isProtected =([\s\S]*?);/)?.[1] ?? "");
  const unlistedPrefixes = protectedPrefixes.filter((p) => !prefixes.includes(p));
  if (!prefixes.length || !protectedPrefixes.length) fail("C40: could not read NON_INDEXABLE_PREFIXES or the protected prefixes in src/middleware.ts");
  else if (unlistedPrefixes.length) fail(`C40: middleware protects [${unlistedPrefixes.join(", ")}] but NON_INDEXABLE_PREFIXES (robots.txt) does not list it`);
  else if (prefixes.some((p) => p.endsWith("/"))) fail("C40: NON_INDEXABLE_PREFIXES must be written without a trailing slash (`/create` would stay crawlable)");
  else if (!/for \(const locale of input\.locales\)/.test(robotsLib) || !/locales:\s*routing\.locales/.test(read("src/app/robots.ts")))
    fail("C40: robots.txt must expand every private prefix for every entry of routing.locales");
  else ok(`C40: robots.txt disallows the ${prefixes.length} private prefixes (middleware's ${protectedPrefixes.length} included) in every locale`);

  const sitemapSrc = read("src/app/sitemap.ts");
  const guideSrc = read("src/lib/guide.ts");
  const guideBase = guideSrc.match(/GUIDE_BASE_PATH = "([^"]+)"/)?.[1] ?? "";
  const guideSubs = [...guideSrc.matchAll(/`\$\{GUIDE_BASE_PATH\}\/([a-z-]+)`/g)].map((m) => m[1]);
  const staticPaths = quoted(sitemapSrc.match(/const STATIC_PATHS = \[([\s\S]*?)\n\];/)?.[1] ?? "");
  const spreadsGuide = /\.\.\.GUIDE_PATHS\b/.test(sitemapSrc);
  const pageDirs = readdirSync(join(root, localeDir), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !/^[_[]/.test(e.name) && existsSync(join(root, localeDir, e.name, "page.tsx")))
    .map((e) => `/${e.name}`);
  const NOINDEX_PAGES = ["/search"]; // noindex by metadata, out of the sitemap on purpose
  const unlisted = pageDirs.filter((p) => !staticPaths.includes(p) && !prefixes.includes(p) && !NOINDEX_PAGES.includes(p) && !(spreadsGuide && p === guideBase));
  const dangling = staticPaths.filter((p) => p !== "/" && !pageDirs.includes(p));
  if (!staticPaths.length || !guideBase) fail("C40: could not read STATIC_PATHS from src/app/sitemap.ts or GUIDE_BASE_PATH from src/lib/guide.ts");
  else if (unlisted.length) fail(`C40: public page directories missing from the sitemap's STATIC_PATHS (or from the private/noindex lists): ${unlisted.join(", ")}`);
  else if (dangling.length) fail(`C40: STATIC_PATHS lists paths with no page: ${dangling.join(", ")}`);
  else if (!spreadsGuide) fail("C40: src/app/sitemap.ts must spread GUIDE_PATHS");
  else ok(`C40: the sitemap lists all ${staticPaths.length} static pages plus the guide; ${prefixes.length + NOINDEX_PAGES.length} private or noindex areas are left out`);

  const guideDirPath = join(localeDir, guideBase.replace(/^\//, ""));
  const guideDirs = existsSync(join(root, guideDirPath))
    ? readdirSync(join(root, guideDirPath), { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith("[")).map((e) => e.name)
    : [];
  const guideSetOk = setEq(new Set(guideDirs), new Set(guideSubs));
  const guidePagesOk = [...guideSubs, "[zone]"].every((d) => existsSync(join(root, guideDirPath, d, "page.tsx"))) && existsSync(join(root, guideDirPath, "page.tsx"));
  if (!guideSetOk) describeSetMismatch("C40 guide pages", new Set(guideDirs), `${guideDirPath}/*`, new Set(guideSubs), "GUIDE_PATHS");
  else if (!guidePagesOk) fail(`C40: ${guideDirPath} needs a page.tsx at its root, in each of [${guideSubs.join(", ")}] and in [zone]`);
  else ok(`C40: the resort guide's ${guideSubs.length + 1} fixed pages and its [zone] page match GUIDE_PATHS`);

  if (!/\bpropertyViewUrl\(/.test(sitemapSrc) || !/\bserviceViewUrl\(/.test(sitemapSrc) || !/blog_posts/.test(sitemapSrc))
    fail("C40: src/app/sitemap.ts must emit properties and services through propertyViewUrl/serviceViewUrl, and blog posts");
  else ok("C40: the sitemap emits listings through the canonical-URL helpers and includes blog posts");

  const publicPages = [...walk(localeDir, ["page.tsx"])].filter((f) => !prefixes.includes(`/${f.split(/[\\/]/)[3]}`));
  const rawMetadata = publicPages.filter((f) => {
    const text = read(f);
    return !/generateMetadata/.test(text) || !/\b(buildPageMetadata|buildListingMetadata)\(/.test(text);
  });
  if (rawMetadata.length) fail(`C40: public pages must build metadata with buildPageMetadata / buildListingMetadata (canonical + hreflang): ${rawMetadata.join(", ")}`);
  else ok(`C40: all ${publicPages.length} public pages build their metadata through the shared helpers`);

  const hosts = {
    "src/lib/seo/site.ts": read("src/lib/seo/site.ts").match(/CANONICAL_HOST = "([^"]+)"/)?.[1],
    "scripts/check-production-config.mjs": read("scripts/check-production-config.mjs").match(/CANONICAL_PRODUCTION_HOST = "([^"]+)"/)?.[1],
    "scripts/check-redirects.mjs": read("scripts/check-redirects.mjs").match(/canonical: "([^"]+)"/)?.[1],
  };
  if (Object.values(hosts).some((h) => !h) || new Set(Object.values(hosts)).size !== 1)
    fail(`C40: the canonical host must be one value in all three places: ${Object.entries(hosts).map(([f, h]) => `${f}=${h}`).join(" · ")}`);
  else ok(`C40: ${Object.values(hosts)[0]} is the canonical host in site.ts and in both scripts`);

  const imageSrc = read("src/lib/seo/image-url.ts");
  const imageWidth = Number(imageSrc.match(/SEO_IMAGE_WIDTH = (\d+)/)?.[1]);
  const imageQuality = Number(imageSrc.match(/SEO_IMAGE_QUALITY = (\d+)/)?.[1]);
  const nextConfig = read("next.config.ts");
  const numbersIn = (re) => (nextConfig.match(re)?.[1] ?? "").split(",").map((s) => Number(s.trim())).filter(Boolean);
  if (!imageWidth || !imageQuality) fail("C40: could not read SEO_IMAGE_WIDTH / SEO_IMAGE_QUALITY from src/lib/seo/image-url.ts");
  else if (!numbersIn(/deviceSizes:\s*\[([^\]]*)\]/).includes(imageWidth)) fail(`C40: next.config.ts images.deviceSizes must include ${imageWidth} (the sitemap image width), or /_next/image answers 400`);
  else if (!numbersIn(/qualities:\s*\[([^\]]*)\]/).includes(imageQuality)) fail(`C40: next.config.ts images.qualities must include ${imageQuality} (the sitemap image quality), or /_next/image answers 400`);
  else ok(`C40: sitemap images (w=${imageWidth}, q=${imageQuality}) are sizes the image optimizer allows`);

  if (!/alternateLinks:\s*false/.test(read("src/i18n/routing.ts"))) fail("C40: src/i18n/routing.ts must keep alternateLinks: false (hreflang comes from buildAlternates alone)");
  else ok("C40: hreflang has a single source (alternateLinks stays off)");

  const middlewareSrc = read("src/middleware.ts");
  if (!/IS_INDEXABLE/.test(middlewareSrc) || !/X-Robots-Tag/.test(middlewareSrc)) fail("C40: src/middleware.ts must send X-Robots-Tag: noindex on non-canonical hosts (IS_INDEXABLE)");
  else ok("C40: non-canonical hosts answer with X-Robots-Tag noindex");

  const jsonLdWriters = srcFiles.filter((f) => /application\/ld\+json/.test(srcText.get(f)));
  const strayWriters = jsonLdWriters.filter((f) => f !== join("src", "components", "seo", "JsonLd.tsx") && f !== join("src", "lib", "seo", "jsonld.ts"));
  if (strayWriters.length) fail(`C40: JSON-LD must be written through components/seo/JsonLd.tsx (escaped by serializeJsonLd): ${strayWriters.join(", ")}`);
  else if (!/serializeJsonLd/.test(read("src/components/seo/JsonLd.tsx"))) fail("C40: components/seo/JsonLd.tsx must serialize with serializeJsonLd (a raw `<` would end the script tag)");
  else ok("C40: JSON-LD is written only through JsonLd.tsx, escaped by serializeJsonLd");

  const widthMap = Object.fromEntries([...read("src/components/seo/listing-kind.ts").matchAll(/^\s+(\w+): "(max-w-[\w-]+)",$/gm)].map((m) => [m[1], m[2]]));
  const detailClients = { apartments: "ApartmentDetailClient", hotels: "HotelDetailClient", sales: "SaleDetailClient", food: "FoodDetailClient", services: "ServiceDetailClient", entertainment: "EntertainmentDetailClient", transport: "TransportDetailClient", employment: "EmploymentDetailClient" };
  const widthDrift = Object.entries(detailClients)
    .filter(([kind, client]) => read(`${localeDir}/${kind}/[id]/${client}.tsx`).match(/<div className="mx-auto (max-w-[\w-]+) px-4/)?.[1] !== widthMap[kind])
    .map(([kind]) => kind);
  if (Object.keys(widthMap).length !== Object.keys(detailClients).length) fail("C40: could not read DETAIL_WIDTH from src/components/seo/listing-kind.ts");
  else if (widthDrift.length) fail(`C40: DETAIL_WIDTH (breadcrumb + related-listings column) disagrees with the detail client's root container for: ${widthDrift.join(", ")}`);
  else ok("C40: the breadcrumb and related-listings width follows each detail client's column");

  // A remote background image under a hero is painted even at 3% opacity, so it becomes the LCP (/sales: 4.6 s).
  const appBackgrounds = srcFiles.filter((f) => f.startsWith(join("src", "app")) && /backgroundImage:\s*(?!\s|HERO_NOISE_BACKGROUND)/.test(srcText.get(f)));
  if (appBackgrounds.length) fail(`C40: a page's background-image must be HERO_NOISE_BACKGROUND (a remote one becomes the LCP element): ${appBackgrounds.join(", ")}`);
  else ok("C40: page heroes use the inline noise texture, not a remote background image");

  // Crawl paths: a link-graph crawl of the production build found /en and /ru linked from nowhere (the header selector is a popover of buttons) and listing pages reachable only through the grid's JS pagination.
  const indexTopics = ["apartments", "hotels", "sales", "food", "services", "entertainment", "transport", "employment"];
  const noListingIndex = indexTopics.filter((t) => !new RegExp(`<CategoryIntro[^>]*topic="${t}"[^>]*listings=\\{`).test(read(`${localeDir}/${t}/page.tsx`)));
  if (noListingIndex.length) fail(`C40: these category pages must pass their rows to <CategoryIntro listings={...}> (the crawlable all-listings index): ${noListingIndex.join(", ")}`);
  else ok(`C40: all ${indexTopics.length} category pages hand their listings to the crawlable index`);
  if (!/<FooterLanguageLinks\s*\/>/.test(read("src/components/layout/Footer.tsx")) || !/routing\.locales/.test(read("src/components/layout/FooterLanguageLinks.tsx")))
    fail("C40: Footer must render <FooterLanguageLinks />, which links every entry of routing.locales (the header selector is buttons, so /en and /ru would have no inbound link)");
  else ok("C40: the footer links the same page in every locale");

  // A locked deployment must not publish listing URLs: the sitemap tests the same predicate as the middleware's lock.
  const lockTest = /process\.env\.SITE_LOCKED === "true"/;
  const siteSrc = read("src/lib/seo/site.ts");
  if (!lockTest.test(read("src/middleware.ts")) || !/export function isSiteLocked\([^)]*\)[^{]*\{\s*return raw === "true";/.test(siteSrc))
    fail('C40: src/middleware.ts (process.env.SITE_LOCKED === "true") and src/lib/seo/site.ts:isSiteLocked (raw === "true") must test the same value');
  else if (!/isSiteLocked\(process\.env\.SITE_LOCKED\)/.test(read("src/app/sitemap.ts")))
    fail("C40: src/app/sitemap.ts must return an empty sitemap while SITE_LOCKED is on (isSiteLocked(process.env.SITE_LOCKED))");
  else ok("C40: a locked deployment serves an empty sitemap, by the same test as the middleware's lock");

  // Owner descriptions are mostly a few characters: the three property detail pages state the listing's own fields as a sentence, on the page and as the meta-description fallback.
  const factsPages = ["apartments", "hotels", "sales"];
  const noFacts = factsPages.filter((k) => {
    const src = read(`${localeDir}/${k}/[id]/page.tsx`);
    return !/<ListingFacts\b[\s\S]*?facts=\{propertyFactsFromRow\(/.test(src) || !/listingFactsText\(locale, propertyFactsFromRow\(/.test(src);
  });
  if (noFacts.length) fail(`C40: these detail pages must render <ListingFacts> and build their description fallback with listingFactsText: ${noFacts.join(", ")}`);
  else ok(`C40: ${factsPages.length} property detail pages state their facts as text and as the description fallback`);

  // The admin edits the guide's copy (site_settings guide_content): it reaches only the surfaces that read `Guide` through
  // src/lib/guide-content.ts:getGuideTranslator, so no other file may build a `Guide` translator (useTranslations included).
  const guideReader = "src/lib/guide-content.ts";
  const noComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
  const guideBypass = srcFiles.filter((f) => f !== guideReader && /namespace:\s*"Guide"|Translations\(\s*"Guide"/.test(noComments(srcText.get(f))));
  const guideSurfaces = srcFiles.filter((f) => /getGuideTranslator\(/.test(srcText.get(f)) && f !== guideReader);
  if (guideBypass.length) fail(`C40: these files read the Guide namespace without getGuideTranslator, so admin edits of the guide never reach them: ${guideBypass.join(", ")}`);
  else if (guideSurfaces.length < 6) fail(`C40: expected the four guide pages, GuideEnd and ZoneListings to read Guide through getGuideTranslator; found ${guideSurfaces.length}`);
  else ok(`C40: ${guideSurfaces.length} guide surfaces read the admin-editable copy through getGuideTranslator`);

  // The admin edits the /faq copy (site_settings faq_content): it reaches only a page that reads it through
  // src/lib/faq-content.ts:loadFaqContent, so nothing else may read the `FAQ` namespace or spell the setting key (src/lib/faq.ts
  // defines FAQ_CONTENT_SETTING_KEY, the admin route imports it). The page is ISR with a one-minute
  // revalidate and sits in next.config.ts's bounded edge-cache group (C28), or an edit would wait on a year-long
  // stale-while-revalidate; both admin navs link the editor.
  const faqReader = "src/lib/faq-content.ts";
  const faqModel = "src/lib/faq.ts";
  const faqPage = "src/app/[locale]/faq/page.tsx";
  const faqBypass = srcFiles.filter((f) => f !== faqReader && f !== faqModel && /namespace:\s*"FAQ"|Translations\(\s*"FAQ"|["'`]faq_content["'`]/.test(noComments(srcText.get(f))));
  const faqProblems = [];
  if (faqBypass.length) faqProblems.push(`these files read the FAQ copy without loadFaqContent, so admin edits never reach them: ${faqBypass.join(", ")}`);
  if (!/loadFaqContent\(/.test(read(faqPage))) faqProblems.push(`${faqPage} must read the copy through loadFaqContent`);
  if (!/export const revalidate = 60;/.test(read(faqPage))) faqProblems.push(`${faqPage} must keep revalidate = 60`);
  if (!/source:\s*"\/:locale\(ka\|en\|ru\)\?\/faq",\s*\.\.\.edgeCached/.test(read("next.config.ts"))) faqProblems.push("next.config.ts must put /faq in the edgeCached group");
  for (const nav of ["src/components/layout/AdminSidebar.tsx", "src/components/layout/MobileBottomNav.tsx"]) {
    if (!read(nav).includes('"/dashboard/admin/faq"')) faqProblems.push(`${nav} must link /dashboard/admin/faq`);
  }
  if (faqProblems.length) for (const p of faqProblems) fail(`C40: ${p}`);
  else ok("C40: /faq reads its admin-editable copy through loadFaqContent, revalidates every minute and is edge-cached like the blog index");
}

// ---------------------------------------------------------------------------
// C41 — admin sign-up links. Every preset destination in src/lib/signup-links.ts
// must be a real page (a typo sends every new user of that link to a 404), the
// code pattern must equal the signup_links_code_check constraint, the cookie
// name lives only in that module, and the three hand-offs stay wired: the
// sign-up copies the code into user_metadata, the wizard asks the resolve
// route, and the guest dashboard opens the request form from the param.
// ---------------------------------------------------------------------------
{
  const modFile = "src/lib/signup-links.ts";
  const mod = read(modFile);
  const localeDir = "src/app/[locale]";
  const presetPaths = [...(mod.match(/SIGNUP_LINK_PRESETS = \[([\s\S]*?)\] as const;/)?.[1] ?? "").matchAll(/destination:\s*[`"](\/[^`"?$]*)/g)].map((m) => m[1]);
  const missingPages = presetPaths.filter((path) => !existsSync(join(root, localeDir, path, "page.tsx")));
  const tsCode = mod.match(/const CODE_PATTERN = \/(.+)\/;/)?.[1];
  const migration = readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort().filter((f) => /signup_links_code_check/.test(read(join("supabase/migrations", f)))).at(-1);
  const sqlCode = migration ? read(join("supabase/migrations", migration)).match(/signup_links_code_check\s+CHECK \(code ~ '([^']+)'\)/)?.[1] : undefined;
  const cookieUsers = srcFiles.filter((f) => f !== join(modFile) && srcText.get(f).includes('"mb_signup_link"'));
  const problems = [];
  if (!presetPaths.length) problems.push(`could not read SIGNUP_LINK_PRESETS from ${modFile}`);
  if (missingPages.length) problems.push(`preset destinations with no page under ${localeDir}: ${missingPages.join(", ")}`);
  if (!tsCode || !sqlCode) problems.push("could not read CODE_PATTERN or signup_links_code_check");
  else if (tsCode !== sqlCode) problems.push(`CODE_PATTERN /${tsCode}/ differs from signup_links_code_check '${sqlCode}' (${migration})`);
  if (cookieUsers.length) problems.push(`the cookie name is spelled outside ${modFile} (import SIGNUP_LINK_COOKIE): ${cookieUsers.join(", ")}`);
  if (!existsSync(join(root, localeDir, "join/[code]/route.ts"))) problems.push(`${localeDir}/join/[code]/route.ts is missing`);
  if (!/\[SIGNUP_LINK_METADATA_KEY\]:\s*signupLink/.test(read(`${localeDir}/auth/login/page.tsx`))) problems.push("the login page's signUp must copy the cookie's code into user_metadata[SIGNUP_LINK_METADATA_KEY]");
  if (!/fetch\("\/api\/signup-links\/resolve"/.test(read(`${localeDir}/auth/register/page.tsx`))) problems.push("the registration wizard must ask /api/signup-links/resolve where to go");
  if (!/searchParams\.get\(SMART_MATCH_NEW_PARAM\) === SMART_MATCH_NEW_VALUE/.test(read(`${localeDir}/dashboard/guest/GuestDashboardClient.tsx`))) problems.push("dashboard/guest/GuestDashboardClient.tsx must open the request form for ?SMART_MATCH_NEW_PARAM=SMART_MATCH_NEW_VALUE");
  if (problems.length) problems.forEach((p) => fail(`C41: ${p}`));
  else ok(`C41: ${presetPaths.length} sign-up link destinations are real pages; code pattern, cookie and hand-offs agree`);
}

// ---------------------------------------------------------------------------
// C42 — finance module. (a) Every vocabulary in src/lib/finance/constants.ts
// equals its CHECK constraint in the finance migrations (the API validates
// with the constants, the database with the CHECK: a value on one side only
// is a 400 or a 23514). (b) MAX_FINANCE_DOCUMENT_BYTES = the finance-documents
// bucket limit. (c) constants/filters/money/xlsx stay free of "@/" imports
// (scripts/unit loads them with --experimental-strip-types). (d) Finance
// tables and the finance-documents bucket are written only by the finance API
// and src/lib/finance/server. (e) The public invoice link looks the token up
// by its hash and answers noindex. (f) Each register's filter is defined once
// and shared by its page list and its export.
// ---------------------------------------------------------------------------
{
  const constantsFile = "src/lib/finance/constants.ts";
  const constants = read(constantsFile);
  const migrations = readdirSync(join(root, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql") && f.includes("finance"))
    .sort()
    .map((f) => read(join("supabase/migrations", f)));
  const tsList = (name) =>
    [...(constants.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\]`))?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  // The body of the newest CHECK named `name`, read to its own closing paren.
  const checkBody = (name) => {
    for (const sql of [...migrations].reverse()) {
      const at = sql.search(new RegExp(`CONSTRAINT ${name}\\b`));
      if (at < 0) continue;
      const open = sql.indexOf("(", sql.indexOf("CHECK", at));
      let depth = 0;
      for (let i = open; i < sql.length; i += 1) {
        if (sql[i] === "(") depth += 1;
        else if (sql[i] === ")" && --depth === 0) return sql.slice(open + 1, i);
      }
    }
    return null;
  };
  const pairs = [
    ["finance_entries_kind_check", "ENTRY_KINDS"],
    ["finance_entries_status_check", "ENTRY_STATUSES"],
    ["finance_entries_revenue_type_check", "REVENUE_TYPES"],
    ["finance_entries_payment_method_check", "PAYMENT_METHODS"],
    ["finance_expenses_payment_method_check", "PAYMENT_METHODS"],
    ["invoices_payment_method_check", "PAYMENT_METHODS"],
    ["finance_expenses_category_check", "EXPENSE_CATEGORIES"],
    ["finance_documents_doc_type_check", "DOCUMENT_TYPES"],
    ["finance_documents_status_check", "DOCUMENT_STATUSES"],
    ["finance_documents_content_type_check", "FINANCE_DOCUMENT_CONTENT_TYPES"],
    ["invoices_status_check", "INVOICE_STATUSES"],
    ["invoices_recipient_type_check", "RECIPIENT_TYPES"],
  ];
  const problems = [];
  for (const [constraint, constant] of pairs) {
    const body = checkBody(constraint);
    const ts = tsList(constant);
    if (body === null || !ts.length) {
      problems.push(`could not read ${body === null ? constraint : constant}`);
      continue;
    }
    const db = new Set([...body.matchAll(/'([^']+)'/g)].map((m) => m[1]));
    const code = new Set(ts);
    if (!setEq(db, code)) {
      problems.push(`${constraint} [${[...db].join(", ")}] ≠ ${constant} [${ts.join(", ")}]`);
    }
  }

  const bytes = constants.match(/MAX_FINANCE_DOCUMENT_BYTES = ([\d\s*]+);/)?.[1];
  const tsBytes = bytes ? bytes.split("*").reduce((product, n) => product * Number(n.trim()), 1) : NaN;
  const bucketBytes = Number(migrations.join("\n").match(/'finance-documents',\s*'finance-documents',\s*false,\s*(\d+)/)?.[1]);
  if (tsBytes !== bucketBytes) problems.push(`MAX_FINANCE_DOCUMENT_BYTES ${tsBytes} ≠ finance-documents file_size_limit ${bucketBytes}`);

  for (const pure of ["constants", "filters", "money", "xlsx"]) {
    if (/from "@\//.test(read(`src/lib/finance/${pure}.ts`))) problems.push(`src/lib/finance/${pure}.ts imports from "@/" (unit tests load it bare)`);
  }

  const owners = ["src/app/api/admin/finance/", "src/lib/finance/server/"];
  const tables = "finance_entries|finance_expenses|finance_documents|finance_settings|invoices|invoice_templates|invoice_counters";
  const writer = new RegExp(`\\.from\\(\\s*"(?:${tables})"\\s*\\)[\\s\\S]{0,160}?\\.(?:insert|update|upsert|delete)\\(|\\.from\\(\\s*"finance-documents"\\s*\\)`);
  const strangers = srcFiles.filter(
    (f) => !owners.some((dir) => f.startsWith(dir)) && writer.test(srcText.get(f)),
  );
  if (strangers.length) problems.push(`finance tables or the finance-documents bucket written outside the finance API: ${strangers.join(", ")}`);

  const publicRoute = read("src/app/api/invoices/[token]/route.ts");
  if (!/hashShareToken\(/.test(publicRoute) || !/share_token_hash/.test(publicRoute)) problems.push("the public invoice route must look the token up by hashShareToken()");
  if (!/"X-Robots-Tag":\s*"noindex/.test(publicRoute)) problems.push("the public invoice route must answer X-Robots-Tag noindex");

  const data = read("src/lib/finance/server/data.ts");
  for (const register of ["payment", "refund", "expense", "document", "invoice"]) {
    const uses = (data.match(new RegExp(`\\b${register}Ops\\(`, "g")) ?? []).length;
    if (uses < 3) problems.push(`${register}Ops must be the one filter definition of its list and its export (found ${uses} uses in data.ts)`);
  }

  if (problems.length) problems.forEach((p) => fail(`C42: ${p}`));
  else ok(`C42: ${pairs.length} finance CHECK lists = constants.ts; document limit = bucket; pure modules bare; finance writes only in the finance API; public invoice link hashed + noindex; one filter per register`);
}

// ---------------------------------------------------------------------------
// C43 — support assistant on every page (Gemini Flash + the Jev router via
// OpenRouter). (a) The key is read only in the server-only OpenRouter client
// and never NEXT_PUBLIC_; (b) the steps calls get their forced show_steps tool
// built from the on-screen ids and the answer goes through parseJevPlan, never
// response_format; (c) both model calls keep data_collection "deny"; (d) the
// route rate-limits per user, or per IP plus a shared allowance when signed
// out; (e) the snapshot type carries no field value; (f) all three mounts are
// gated on isSupportConfigured(); (g) every model id is a Gemini Flash model or
// the Jev router, and the router's pool is cut to Gemini Flash (the owner's
// choice: no GPT, DeepSeek or other models); (h)-(j) below.
// ---------------------------------------------------------------------------
{
  const clientFile = "src/lib/support/openrouter.ts";
  const serverFile = "src/lib/support/server.ts";
  const routeFile = "src/app/api/support/route.ts";
  const planFile = "src/lib/support/plan.ts";
  const mounts = ["src/app/[locale]/layout.tsx", "src/app/[locale]/dashboard/layout.tsx", "src/app/[locale]/create/layout.tsx"];
  const problems = [];
  const keyReaders = srcFiles.filter((f) => f !== join(clientFile) && /OPENROUTER_API_KEY/.test(srcText.get(f)));
  if (keyReaders.length) problems.push(`OPENROUTER_API_KEY is read outside ${clientFile}: ${keyReaders.join(", ")}`);
  if (!/^import "server-only";/m.test(read(clientFile))) problems.push(`${clientFile} must import "server-only"`);
  const publicKey = srcFiles.filter((f) => /NEXT_PUBLIC_OPENROUTER/.test(srcText.get(f)));
  if (publicKey.length) problems.push(`an OpenRouter variable is NEXT_PUBLIC_ (ships to every browser): ${publicKey.join(", ")}`);
  const server = read(serverFile).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
  if (/response_format/.test(server)) problems.push(`${serverFile} uses response_format (Jev answered in prose with it); keep the forced tool call`);
  if (!/tool_choice:\s*\{\s*type:\s*"function",\s*function:\s*\{\s*name:\s*SHOW_STEPS_TOOL\s*\}\s*\}/.test(server)) problems.push(`${serverFile} must force the show_steps tool for Jev`);
  if (!/buildShowStepsTool\(ids\)/.test(server) || !/parseJevPlan\(\s*call\.function\?\.arguments,\s*allowed\s*\)/.test(server)) problems.push(`${serverFile} must build the tool from the on-screen ids and check Jev's answer with parseJevPlan(…, allowed)`);
  if (!/NO_RETENTION = \{ data_collection: "deny" \}/.test(server) || (server.match(/provider: NO_RETENTION/g) ?? []).length < 2) problems.push(`${serverFile}: both model calls must send provider: NO_RETENTION (data_collection "deny")`);
  const route = read(routeFile);
  if (!/await getCurrentUser\(\)/.test(route) || !/checkRateLimit\(/.test(route)) problems.push(`${routeFile} must rate-limit per signed-in user`);
  if (!/support:\$\{parsed\.mode\}:ip:\$\{getClientIp\(request\)\}/.test(route) || !/"support:day:anon"/.test(route)) problems.push(`${routeFile} must rate-limit signed-out callers per IP (getClientIp) and under a shared "support:day:anon" allowance`);
  const modelIds = [...server.matchAll(/"([a-z0-9-]+\/[a-z0-9.*-]+)"/g)].map((m) => m[1]);
  const offList = modelIds.filter((id) => id !== "typesafe/jev-router" && !/^google\/gemini-[a-z0-9.*-]*flash[a-z0-9.*-]*$/.test(id));
  if (!modelIds.length || offList.length) problems.push(`${serverFile}: only Gemini Flash models and typesafe/jev-router may be called${offList.length ? ` (found ${offList.join(", ")})` : ""}`);
  if (!/\{\s*model: JEV_MODEL,\s*plugins: JEV_GEMINI_FLASH/.test(server) || !/id:\s*"jev-router",\s*models:\s*\["google\/gemini-\*flash\*"\],\s*excluded_models:\s*\[[^\]]*"openai\*"[^\]]*"deepseek\*"/.test(server)) problems.push(`${serverFile}: the Jev router must be called with its pool cut to Gemini Flash and the other makers excluded (plugins: JEV_GEMINI_FLASH)`);
  const elementType = read(planFile).match(/export type PageElement = \{([\s\S]*?)\};/)?.[1];
  if (!elementType) problems.push(`could not read PageElement from ${planFile}`);
  else if (/\bvalue\b/.test(elementType)) problems.push(`PageElement in ${planFile} must not carry a field's value`);
  const ungated = mounts.filter((f) => !/\{isSupportConfigured\(\) && <SupportAssistantLoader/.test(read(f)));
  if (ungated.length) problems.push(`the assistant must mount only when isSupportConfigured(): ${ungated.join(", ")}`);
  // (h) answers go through the forced reply tool and parseReply; its schema
  // has no link field, and every button link is built by the route from the
  // checked id and params (actions.ts), never by the model or the browser.
  if (!/tool_choice:\s*\{\s*type:\s*"function",\s*function:\s*\{\s*name:\s*REPLY_TOOL\s*\}\s*\}/.test(server) || !/parseReply\(/.test(server)) problems.push(`${serverFile} must force the reply tool and check the answer with parseReply`);
  const replySchema = read(planFile).match(/export function buildReplyTool[\s\S]*?\n}\n/)?.[0] ?? "";
  if (!replySchema) problems.push(`could not read buildReplyTool from ${planFile}`);
  else if (/\b(?:href|url|link|path)\s*:/i.test(replySchema)) problems.push(`buildReplyTool in ${planFile} must not offer a link field: buttons are action ids with typed params`);
  if (!/actionHref\(action, ctx\)/.test(route)) problems.push(`${routeFile} must build every button's link on the server (actionHref)`);
  // (i) account facts are read with the user's own session (RLS), never the
  // service role.
  const account = read("src/lib/support/account.ts");
  if (!/import \{ createClient \} from "@\/lib\/supabase\/server";/.test(account) || /createServiceClient|SUPABASE_SERVICE_ROLE_KEY|supabase\/service/.test(account)) problems.push("src/lib/support/account.ts must read with createClient() from @/lib/supabase/server only (the user's own session)");
  // (j) every quoted Georgian label the assistant tells users to press exists
  // verbatim in the site's own text (src/, messages/ka.json outside Support,
  // or a migration's seed such as a price-list name), so a renamed button
  // cannot silently make answers wrong. Also the pre-written chip answers.
  {
    const labelFiles = ["src/lib/support/knowledge.ts", serverFile, "src/lib/support/actions.ts"];
    const georgian = /[\u10A0-\u10FF]/;
    const quoted = /\\?"([^"\\\n]{2,80})\\?"|„([^“\n]{2,80})“|“([^”\n]{2,80})”/g;
    const labels = new Map();
    const collect = (text, from) => {
      for (const m of text.matchAll(quoted)) {
        const label = (m[1] ?? m[2] ?? m[3]).trim();
        if (georgian.test(label) && !labels.has(label)) labels.set(label, from);
      }
    };
    for (const f of labelFiles) collect(read(f), f);
    const ka = JSON.parse(read("messages/ka.json"));
    for (const [key, text] of Object.entries(ka.Support?.canned ?? {})) if (typeof text === "string") collect(text, `messages/ka.json Support.canned.${key}`);
    // The widget's own strings count (its name, its buttons); its pre-written
    // answers do not, or they would vouch for themselves.
    const { canned: _canned, ...supportUi } = ka.Support ?? {};
    const corpus = [
      JSON.stringify({ ...ka, Support: supportUi }).replace(/\\"/g, '"'),
      ...srcFiles.filter((f) => !f.startsWith(join("src/lib/support/"))).map((f) => srcText.get(f)),
      ...[...walk("supabase/migrations", [".sql"])].map((f) => read(f)),
    ].join("\n");
    const unknown = [...labels].filter(([label]) => !corpus.includes(label));
    if (unknown.length) problems.push(`quoted labels not found anywhere on the site (renamed?): ${unknown.map(([l, f]) => `"${l}" (${f})`).join(", ")}`);
  }
  // (k) every answer and plan passes the deterministic checks (validate.ts)
  // before the browser sees it; answers are checked against the request's
  // own context (replyCheckContext: site labels, prices, zones, the screen).
  if (!/checkReply\(/.test(server) || !/checkPlan\(/.test(server)) problems.push(`${serverFile} must check every answer (checkReply) and every plan (checkPlan)`);
  if (!/replyCheckContext\(parsed, context\)/.test(route)) problems.push(`${routeFile} must pass replyCheckContext(parsed, context) to answerQuestion`);
  // (l) the English/Russian label table is generated from the catalogs for
  // every label the knowledge quotes, and is current.
  {
    const labelsFile = "src/lib/support/labels.ts";
    if (!existsSync(join(root, labelsFile))) problems.push(`${labelsFile} is missing: run node scripts/support-labels.mjs`);
    else {
      const { status } = spawnSync(process.execPath, ["scripts/support-labels.mjs", "--check"], { cwd: root, encoding: "utf8" });
      if (status !== 0) problems.push(`${labelsFile} is stale: run node scripts/support-labels.mjs`);
    }
  }
  // (m) every page the knowledge sends users to exists ("/auth" alone only
  // names the sign-in area).
  {
    const knowledge = read("src/lib/support/knowledge.ts");
    const paths = new Set([...knowledge.matchAll(/(?:^|[\s("'`])(\/(?:dashboard|create|auth)(?:\/[a-z0-9-]+)*)/g)].map((m) => m[1]));
    paths.delete("/auth");
    const missing = [...paths].filter((p) => !existsSync(join(root, "src/app/[locale]", p, "page.tsx")) && !existsSync(join(root, "src/app/[locale]", p, "route.ts")));
    if (missing.length) problems.push(`knowledge.ts names pages that do not exist: ${missing.join(", ")}`);
  }
  // (n) the question log (support_questions) is written only by
  // questions.ts, called from the route inside after() (never delaying an
  // answer); the row builder carries no user id or IP.
  {
    const writers = srcFiles.filter((f) => /["']support_questions["']/.test(srcText.get(f)) && f !== join("src/lib/support/questions.ts") && f !== join("src/lib/types/database.generated.ts"));
    if (writers.length) problems.push(`support_questions is used outside src/lib/support/questions.ts: ${writers.join(", ")}`);
    // A cached answer skips withinLimits, so its row passes withinCacheLogLimit first.
    if (!/after\(async \(\) => \{[^}]*withinCacheLogLimit\(request\)[^}]*await logQuestion\(/.test(route) || (route.match(/logQuestion\(/g) ?? []).length !== 1 || !/after\(\(\) => rateQuestion\(/.test(route)) problems.push(`${routeFile} must write the question log only inside after() (logQuestion behind withinCacheLogLimit for cache hits, rateQuestion)`);
    const row = read(planFile).match(/export type SupportQuestionRow = \{([\s\S]*?)\};/)?.[1] ?? "";
    if (!row) problems.push(`could not read SupportQuestionRow from ${planFile}`);
    else if (/\b(?:user_id|ip|email|phone|answer)\b/.test(row)) problems.push(`SupportQuestionRow in ${planFile} must not carry a user id, IP, contact or answer text`);
  }
  if (problems.length) problems.forEach((p) => fail(`C43: ${p}`));
  else ok("C43: OpenRouter key server-only; steps forced through show_steps + parseJevPlan; answers through the forced reply tool + parseReply, buttons are ids whose links the route builds; account facts under the user's own session; every quoted label exists on the site; answers and plans pass checkReply/checkPlan; en/ru label table current; knowledge pages exist; question log written only in after(), no user id/IP; no-retention on both calls; per-user/per-IP limits; Gemini Flash + Jev (Gemini Flash pool) only; snapshot carries no values");
}

// ---------------------------------------------------------------------------
// C44 — admin status management (memberships, VIP / discounts, company plans).
// (a) user_subscriptions_status_check = MEMBERSHIP_STATUSES; (b) each change
// RPC's c_actions = its TS action list (the route validates with the TS list,
// the RPC with its own); (c) the three RPCs and three views are revoked from
// PUBLIC, anon and authenticated where they are created and never granted back;
// (d) only the statuses API and its server helper read the views or name the
// RPCs (the admin clients route may read the views for its filters, never
// name the RPCs); (e) the pure module has no "@/" import; (f) the *_admin_update
// notification types stay out of the e-mail and SMS lists (bell only);
// (g) admin_gift_sms_credits is service_role only and called only by the admin
// bonus route.
// ---------------------------------------------------------------------------
{
  const pureFile = "src/lib/admin-statuses.ts";
  const pure = read(pureFile);
  const migrations = readdirSync(join(root, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => [f, read(join("supabase/migrations", f)).replace(/--[^\n]*/g, "")]);
  const newest = [...migrations].reverse();
  const tsList = (name) =>
    [...(pure.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\]`))?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const quoted = (text) => new Set([...text.matchAll(/'([^']+)'/g)].map((m) => m[1]));
  const problems = [];

  const statusCheck = newest
    .map(([, sql]) => sql.match(/ADD CONSTRAINT user_subscriptions_status_check\s+CHECK \(status IN \(([^)]*)\)\)/)?.[1])
    .find(Boolean);
  const statuses = new Set(tsList("MEMBERSHIP_STATUSES"));
  if (!statusCheck || !statuses.size) problems.push("could not read user_subscriptions_status_check or MEMBERSHIP_STATUSES");
  else if (!setEq(quoted(statusCheck), statuses)) problems.push(`user_subscriptions_status_check [${[...quoted(statusCheck)].join(", ")}] ≠ MEMBERSHIP_STATUSES [${[...statuses].join(", ")}]`);

  const rpcs = [
    ["admin_change_memberships", "MEMBERSHIP_ACTIONS"],
    ["admin_change_listing_promotions", "LISTING_ACTIONS"],
    ["admin_change_company_plans", "COMPANY_ACTIONS"],
  ];
  for (const [fn, constant] of rpcs) {
    const created = newest.find(([, sql]) => new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${fn}\\(`).test(sql));
    const body = created ? created[1].slice(created[1].search(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${fn}\\(`))) : "";
    const actions = body.match(/c_actions CONSTANT text\[\] := ARRAY\[([\s\S]*?)\]/)?.[1];
    const ts = new Set(tsList(constant));
    if (!actions || !ts.size) problems.push(`could not read c_actions of ${fn} or ${constant}`);
    else if (!setEq(quoted(actions), ts)) problems.push(`${fn} c_actions [${[...quoted(actions)].join(", ")}] ≠ ${constant} [${[...ts].join(", ")}]`);
  }

  const views = ["admin_membership_overview_v", "admin_listing_promotions_v", "admin_company_plans_v"];
  const objects = [...rpcs.map(([fn]) => fn), ...views];
  for (const name of objects) {
    const creator = migrations.find(([, sql]) => new RegExp(`CREATE (?:OR REPLACE )?(?:FUNCTION|VIEW) public\\.${name}\\b`).test(sql));
    if (!creator) {
      problems.push(`no migration creates public.${name}`);
      continue;
    }
    if (!new RegExp(`REVOKE ALL ON (?:FUNCTION )?public\\.${name}\\b[^;]*FROM PUBLIC, anon, authenticated`).test(creator[1])) problems.push(`${creator[0]} must REVOKE ALL on public.${name} FROM PUBLIC, anon, authenticated`);
    for (const [file, sql] of migrations) {
      for (const grant of sql.match(new RegExp(`GRANT[^;]*\\bpublic\\.${name}\\b[^;]*;`, "g")) ?? []) {
        if (/\bTO\b[^;]*\b(?:anon|authenticated|PUBLIC)\b/.test(grant)) problems.push(`${file} grants public.${name} to a client role`);
      }
    }
  }

  const apiDir = join("src/app/api/admin/statuses/");
  const allowed = new Set([join("src/lib/admin-statuses-server.ts"), join("src/lib/types/database.ts"), join("src/lib/types/database.generated.ts")]);
  const namePattern = new RegExp(`"(?:${objects.join("|")})"`);
  // The clients directory reads the views for its filters (read-only).
  const viewReaders = new Set([join("src/app/api/admin/clients/route.ts")]);
  const rpcPattern = new RegExp(`"(?:${rpcs.map(([fn]) => fn).join("|")})"`);
  const strangers = srcFiles.filter((f) => {
    if (f.startsWith(apiDir) || allowed.has(f)) return false;
    // A type lookup (Views["admin_…_v"]) reads nothing at runtime.
    const text = srcText.get(f).replace(/\["admin_[a-z_]+_v"\]/g, "");
    return (viewReaders.has(f) ? rpcPattern : namePattern).test(text);
  });
  if (strangers.length) problems.push(`the admin status views/RPCs are used outside src/app/api/admin/statuses: ${strangers.join(", ")}`);

  if (/from "@\//.test(pure)) problems.push(`${pureFile} imports from "@/" (scripts/unit loads it bare)`);

  // SMS-credit gifts (admin_gift_sms_credits): service_role only, called only
  // by the admin bonus route.
  const giftFn = "admin_gift_sms_credits";
  const giftCreator = migrations.find(([, sql]) => new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${giftFn}\\(`).test(sql));
  if (!giftCreator) problems.push(`no migration creates public.${giftFn}`);
  else if (!new RegExp(`REVOKE ALL ON FUNCTION public\\.${giftFn}\\b[^;]*FROM PUBLIC, anon, authenticated`).test(giftCreator[1])) problems.push(`${giftCreator[0]} must REVOKE ALL on public.${giftFn} FROM PUBLIC, anon, authenticated`);
  for (const [file, sql] of migrations) {
    for (const grant of sql.match(new RegExp(`GRANT[^;]*\\bpublic\\.${giftFn}\\b[^;]*;`, "g")) ?? []) {
      if (/\bTO\b[^;]*\b(?:anon|authenticated|PUBLIC)\b/.test(grant)) problems.push(`${file} grants public.${giftFn} to a client role`);
    }
  }
  const giftRoute = join("src/app/api/admin/clients/bonus/route.ts");
  const giftCallers = srcFiles.filter((f) => !f.startsWith(join("src/lib/types")) && new RegExp(`"${giftFn}"`).test(srcText.get(f)));
  if (!giftCallers.includes(giftRoute)) problems.push(`${giftRoute} no longer calls ${giftFn}`);
  if (giftCallers.some((f) => f !== giftRoute)) problems.push(`${giftFn} is called outside ${giftRoute}: ${giftCallers.filter((f) => f !== giftRoute).join(", ")}`);

  const ownTypes = ["membership_admin_update", "promotion_admin_update", "company_plan_admin_update", "sms_credit_admin_update"];
  for (const fn of ["email_notification_types", "sms_notification_types"]) {
    const created = newest.find(([, sql]) => new RegExp(`FUNCTION public\\.${fn}\\(`, "i").test(sql));
    const list = created?.[1].match(new RegExp(`function public\\.${fn}\\(\\)[\\s\\S]*?select array\\[([\\s\\S]*?)\\]::text\\[\\]`, "i"))?.[1];
    if (!list) problems.push(`could not read ${fn}()`);
    else {
      const leaked = ownTypes.filter((type) => quoted(list).has(type));
      if (leaked.length) problems.push(`${fn}() lists ${leaked.join(", ")}: admin status notices are bell only`);
    }
  }

  const audited = newest.find(([, sql]) => /TRIGGER trg_audit_row ON public\.organization_subscriptions|CREATE TRIGGER trg_audit_row\s+AFTER[^;]*ON public\.organization_subscriptions/.test(sql));
  if (!audited || !/CREATE TRIGGER trg_audit_row\s+AFTER INSERT OR UPDATE OR DELETE ON public\.organization_subscriptions/.test(audited[1])) problems.push("the newest migration touching trg_audit_row on organization_subscriptions must (re)create it: admin plan edits are audited");

  if (problems.length) problems.forEach((p) => fail(`C44: ${p}`));
  else ok(`C44: membership status CHECK = MEMBERSHIP_STATUSES; ${rpcs.length} change RPCs' actions = the TS lists; RPCs and views service_role only; used only by the statuses API; pure module bare; admin status notices bell only; SMS-credit gifts service_role only, one caller; company plans audited`);
}

// ---------------------------------------------------------------------------
// C46 — ad & banner analytics. Every creative event goes beacon → one route →
// one RPC, and every admin number comes from one read RPC behind requireAdmin:
// (a) record_banner_events (C47's batched writer) is called only by the track
// route and admin_banner_analytics only by src/lib/banner-analytics-server.ts
// (the loader of the admin page's route and its export route, both behind
// requireAdmin, the only importers) and C49's src/lib/analytics/server.ts
// (imported only by the requireAdmin analytics routes, pinned there); nothing
// calls the superseded record_banner_event or
// increment_ad_metric; (b) only src/lib/banner-tracking.ts posts to the track
// route; (c) the renderer counts impressions on the shell, opens where the
// detail window opens, and clicks on the detail window's CTA; (d)
// src/lib/banner-analytics.ts stays free of "@/" imports (scripts/unit loads
// it bare; the SQL lists are compared there).
// ---------------------------------------------------------------------------
{
  const appFiles = srcFiles.filter((f) => !f.startsWith(join("src/lib/types")));
  const callers = (pattern) => appFiles.filter((f) => pattern.test(srcText.get(f)));
  const problems = [];
  const expectOnly = (label, pattern, allowed, also = []) => {
    const found = callers(pattern);
    const extra = found.filter((f) => f !== join(allowed) && !also.some((a) => join(a) === f));
    if (!found.includes(join(allowed))) problems.push(`${allowed} no longer calls ${label}`);
    if (extra.length) problems.push(`${label} is called outside ${allowed}: ${extra.join(", ")}`);
  };
  expectOnly("record_banner_events", /rpc\(\s*"record_banner_events"/, "src/app/api/banner-slots/track/route.ts");
  const single = callers(/rpc\(\s*"record_banner_event"/);
  if (single.length) problems.push(`record_banner_event is superseded by the batched record_banner_events: ${single.join(", ")}`);
  expectOnly("admin_banner_analytics", /rpc\(\s*"admin_banner_analytics"/, "src/lib/banner-analytics-server.ts", ["src/lib/analytics/server.ts"]);
  const adRoutes = ["src/app/api/admin/banner-analytics/route.ts", "src/app/api/admin/banner-analytics/export/route.ts"];
  const loaderUsers = callers(/from "@\/lib\/banner-analytics-server"/);
  for (const route of adRoutes) if (!loaderUsers.includes(join(route))) problems.push(`${route} must read through src/lib/banner-analytics-server.ts`);
  const strayLoaderUsers = loaderUsers.filter((f) => !adRoutes.some((r) => join(r) === f));
  if (strayLoaderUsers.length) problems.push(`src/lib/banner-analytics-server.ts is imported outside the two requireAdmin routes: ${strayLoaderUsers.join(", ")}`);
  if (!/^import "server-only";/m.test(read("src/lib/banner-analytics-server.ts"))) problems.push('src/lib/banner-analytics-server.ts must import "server-only"');
  expectOnly('the "/api/banner-slots/track" beacon', /["`]\/api\/banner-slots\/track["`]/, "src/lib/banner-tracking.ts");
  for (const route of adRoutes) if (!/await requireAdmin\(\)/.test(read(route))) problems.push(`${route} must check requireAdmin() before reading`);
  const legacy = callers(/increment_ad_metric/);
  if (legacy.length) problems.push(`increment_ad_metric is superseded by record_banner_event: ${legacy.join(", ")}`);
  const view = read("src/components/banners/BannerSlotView.tsx");
  if (!/useBannerViewTracking\(\s*creative,\s*interactive\b/.test(view)) problems.push("BannerSlotView's CreativeShell must count impressions with useBannerViewTracking(creative, interactive, …)");
  if (!/reportBannerEvent\(creative, "open"\);\s*setExpanded\(creative\)/.test(view)) problems.push("BannerSlotView must count an open where the detail window opens");
  if (!/reportBannerEvent\(creative, "click"\)/.test(read("src/components/shared/BannerDetailModal.tsx"))) problems.push("BannerDetailModal's CTA must count a click");
  if (/from "@\//.test(read("src/lib/banner-analytics.ts"))) problems.push('src/lib/banner-analytics.ts imports from "@/" (scripts/unit loads it bare)');
  if (problems.length) problems.forEach((p) => fail(`C46: ${p}`));
  else ok("C46: banner events go through one beacon, one route and one RPC; admin numbers (page and exports) through one read RPC and one loader behind requireAdmin; impressions, opens and clicks wired in the renderer");
}

// ---------------------------------------------------------------------------
// C47 — ad campaigns per the owner's media plan (SOV, priority, frequency cap,
// rotation, the sponsored grid card, the phone-only strip, the rate card):
// (a) the draw happens in one place: BannerSlotView renders through
// useSlotRotation (src/lib/banner-slots-client.ts), which is the only caller
// of pickAd; (b) every listing_grid mount is a sponsored card placed by
// interleaveSponsored (it carries `position={slot}`), never a fixed slot at the
// top of a grid; (c) mobile_strip is mounted exactly once, in LocaleShell;
// (d) the empty ad position is counted with useEmptySlotTracking; (e) both
// admin ads routes read the campaign fields with parseCampaignFields and turn
// the capacity trigger's SQLSTATE into a 409; (f) ad-rotation.ts,
// ad-rate-card.ts, staff-browser.ts and ad-preview.ts stay free of "@/"
// imports (scripts/unit loads them bare and compares them with the migration
// and the placement registry); (g) the admin's on-site preview route
// (2026-10-11) checks requireAdmin() and answers private, no-store; (h) an
// admin's browser obeys no cap and sends no event: banner-tracking.ts returns
// first on isStaffBrowser() in cappedCreativeIds, enqueue, reportBannerEvent
// and the impression callback; (i) every file that signs out also calls
// clearStaffBrowser().
// ---------------------------------------------------------------------------
{
  const problems = [];
  const appFiles = srcFiles.filter((f) => !f.startsWith(join("src/lib/types")));
  const view = read("src/components/banners/BannerSlotView.tsx");
  if (!/useSlotRotation\(/.test(view)) problems.push("BannerSlotView must choose its creatives with useSlotRotation (the one draw site)");
  const pickers = appFiles.filter((f) => /\bpickAd\(/.test(srcText.get(f)) && f !== join("src/lib/ad-rotation.ts"));
  if (pickers.join() !== join("src/lib/banner-slots-client.ts")) problems.push(`pickAd must be called only by src/lib/banner-slots-client.ts (found: ${pickers.join(", ") || "none"})`);
  if (!/useEmptySlotTracking\(/.test(view)) problems.push("BannerSlotView must count an empty ad position with useEmptySlotTracking");
  for (const f of appFiles) {
    const text = srcText.get(f);
    for (const m of text.matchAll(/<BannerSlot\b[^>]*placement="listing_grid"[^>]*>/g)) {
      if (!/position=\{slot\}/.test(m[0]) || !/interleaveSponsored\(/.test(text)) problems.push(`${f}: a listing_grid slot must be a sponsored card placed by interleaveSponsored (position={slot})`);
    }
  }
  const stripMounts = appFiles.filter((f) => /placement="mobile_strip"/.test(srcText.get(f)));
  if (stripMounts.join() !== join("src/components/layout/LocaleShell.tsx")) problems.push(`mobile_strip must be mounted once, in LocaleShell (found: ${stripMounts.join(", ") || "none"})`);
  for (const route of ["src/app/api/admin/ads/route.ts", "src/app/api/admin/ads/[id]/route.ts"]) {
    const text = read(route);
    if (!/parseCampaignFields\(/.test(text) || !/SLOT_FULL_SQLSTATE/.test(text) || !/status: 409/.test(text)) problems.push(`${route} must read SOV/priority/cap with parseCampaignFields and answer 409 to SLOT_FULL_SQLSTATE`);
  }
  for (const pure of ["src/lib/ad-rotation.ts", "src/lib/ad-rate-card.ts", "src/lib/staff-browser.ts", "src/lib/ad-preview.ts"]) {
    if (/from "@\//.test(read(pure))) problems.push(`${pure} imports from "@/" (scripts/unit loads it bare)`);
  }
  const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
  const previewRoute = "src/app/api/admin/ads/[id]/preview/route.ts";
  const previewText = stripComments(read(previewRoute));
  if (!/await requireAdmin\(\)/.test(previewText) || !/"private, no-store"/.test(previewText)) problems.push(`${previewRoute} must check requireAdmin() and answer "private, no-store" (an ad's preview, paused ones included, is admin-only)`);
  const tracking = stripComments(read("src/lib/banner-tracking.ts"));
  const staffGates = [
    ["cappedCreativeIds", /export function cappedCreativeIds\b[\s\S]{0,300}?isStaffBrowser\(\)\) return capped;/],
    ["enqueue", /function enqueue\([^)]*\)[^{]*\{\s*if \(isStaffBrowser\(\)\) return;/],
    ["reportBannerEvent", /export function reportBannerEvent\([^)]*\)[^{]*\{\s*if \(isStaffBrowser\(\)\) return;/],
    ["the impression callback", /useViewable\([^()]*,\s*\(\)\s*=>\s*\{\s*if \(isStaffBrowser\(\)\) return;/],
  ];
  for (const [name, pattern] of staffGates) {
    if (!pattern.test(tracking)) problems.push(`src/lib/banner-tracking.ts: ${name} must return first on isStaffBrowser() (an admin's browser obeys no cap and counts nothing)`);
  }
  for (const f of appFiles) {
    const code = stripComments(srcText.get(f));
    if (/\.auth\.signOut\(/.test(code) && !/clearStaffBrowser\(\)/.test(code)) problems.push(`${f} signs out without clearStaffBrowser() (the next person on that browser would be neither capped nor counted)`);
  }
  if (problems.length) problems.forEach((p) => fail(`C47: ${p}`));
  else ok("C47: one draw site (useSlotRotation), sponsored grid cards placed by interleaveSponsored, mobile_strip mounted once, empty ad positions counted, admin ads routes validate SOV/priority/cap and map the capacity trigger; the on-site preview is admin-only and no-store; an admin's browser is gated out of the cap and the beacon, and every sign-out clears it");
}

// ---------------------------------------------------------------------------
// C48 — phone sign-in (SMS code through the Supabase Auth Send SMS hook):
// (a) auth-send-sms verifies the Standard Webhooks signature before it reads
// the payload and refuses when SEND_SMS_HOOK_SECRET is unset; (b) it texts the
// toUbillNumber(sms.phone) target (Georgian mobiles only) as a uBill OTP
// through _shared/ubill.ts:ubillSend and logs only through deps.log;
// (c) _shared/ubill.ts is the only file that POSTs to uBill's /send;
// (d) the login page's phone sign-in carries the C41 signup-link data;
// (e) the login and account pages gate phone UI on isPhoneAuthEnabled;
// (f) the app's refusal tokens equal the hook's; (g) the code-log functions
// are never granted to anon/authenticated.
// ---------------------------------------------------------------------------
{
  const problems = [];
  const handler = read("supabase/functions/auth-send-sms/handler.ts");
  const verifyAt = handler.indexOf("verify(await req.text()");
  const firstRead = handler.search(/event\.(sms|user|metadata)/);
  if (verifyAt < 0 || firstRead < 0 || verifyAt > firstRead) problems.push("auth-send-sms must verify the signature (verify(await req.text(), …)) before reading the payload");
  if (!/if \(!secrets\) \{[\s\S]{0,200}return refuse\(/.test(handler)) problems.push("auth-send-sms must refuse when SEND_SMS_HOOK_SECRET is unset");
  if (!/toUbillNumber\(\s*String\(event\.sms\?\.phone/.test(handler)) problems.push("auth-send-sms must text toUbillNumber(sms.phone …), the number Auth names");
  if (!/otp: true/.test(handler)) problems.push("auth-send-sms must send with uBill's otp flag");
  if (/console\.(log|error|warn|info)/.test(handler)) problems.push("auth-send-sms/handler.ts must log only through deps.log (masked fields, never the code)");
  if (!/send: ubillSend/.test(read("supabase/functions/auth-send-sms/index.ts"))) problems.push("auth-send-sms/index.ts must send through _shared/ubill.ts:ubillSend");
  const senders = [...walk("supabase/functions", [".ts"])].filter((f) => !f.endsWith("_test.ts") && /\/send`/.test(read(f)));
  if (senders.join() !== join("supabase/functions/_shared/ubill.ts")) problems.push(`only _shared/ubill.ts may POST to uBill's /send (found: ${senders.join(", ") || "none"})`);
  const login = read("src/app/[locale]/auth/login/page.tsx");
  if (!/signInWithPhone\([\s\S]{0,160}\[SIGNUP_LINK_METADATA_KEY\]: signupLink/.test(login)) problems.push("the login page's signInWithPhone must carry { [SIGNUP_LINK_METADATA_KEY]: signupLink } (C41)");
  for (const page of ["src/app/[locale]/auth/login/page.tsx", "src/app/[locale]/dashboard/account/page.tsx"]) {
    if (!/isPhoneAuthEnabled\(\)/.test(read(page))) problems.push(`${page} must gate its phone UI on isPhoneAuthEnabled()`);
  }
  const tokens = (text) => (text.match(/AUTH_SMS_ERRORS = \{([\s\S]*?)\} as const/)?.[1] ?? "").replace(/\s+/g, "");
  const appTokens = tokens(read("src/lib/auth/phone.ts"));
  if (!appTokens || appTokens !== tokens(read("supabase/functions/_shared/auth-sms.ts"))) problems.push("AUTH_SMS_ERRORS differs between src/lib/auth/phone.ts and supabase/functions/_shared/auth-sms.ts");
  if (/from "@\//.test(read("src/lib/auth/phone.ts"))) problems.push('src/lib/auth/phone.ts imports from "@/" (scripts/unit loads it bare)');
  const migrations = [...walk("supabase/migrations", [".sql"])].map(read).join("\n");
  if (/GRANT[^;]*auth_sms_code[^;]*TO[^;]*\b(anon|authenticated|PUBLIC)\b/i.test(migrations)) problems.push("auth_sms_code_* must never be granted to anon, authenticated or PUBLIC (C34)");
  if (problems.length) problems.forEach((p) => fail(`C48: ${p}`));
  else ok("C48: hook verifies before reading and fails closed, texts toUbillNumber(sms.phone) as a uBill OTP via ubillSend (the only /send), login carries the signup-link data, phone UI gated, refusal tokens equal, code-log service-role only");
}

// ---------------------------------------------------------------------------
// C49 — admin analytics (owner spec "Admin Dashboard"): (a) the vocabularies of
// src/lib/analytics/model.ts equal the migrations' CHECK lists and function
// outputs (sources, devices, page types, listing kinds, event names, the lead
// events behind Key Actions); (b) only PageviewTracker posts to /api/track/view
// and /api/track/ping and only track-client.ts to /api/track/event, only the
// two track routes set the mb_sid cookie, only events.ts writes
// analytics_events (behind the consent check) and only the ping route calls
// analytics_ping; (c) the admin_analytics_* RPCs are called only from the
// server-only src/lib/analytics/server.ts, which only the two admin analytics
// routes import, both behind requireAdmin; (d) no migration grants the
// analytics table, view or functions to anon, authenticated or PUBLIC (C34);
// (e) the pure modules have no runtime imports (scripts/unit loads them bare);
// (f) the DB-IP attribution (CC BY 4.0) is on the page and in every export.
// ---------------------------------------------------------------------------
{
  const problems = [];
  const model = read("src/lib/analytics/model.ts");
  const tsList = (name) =>
    [...(model.match(new RegExp("export const " + name + " = \\[([\\s\\S]*?)\\] as const"))?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const sqlFiles = readdirSync(join(root, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => read(join("supabase/migrations", f)).replace(/--[^\n]*/g, ""));
  const newest = (pattern) => [...sqlFiles].reverse().find((sql) => pattern.test(sql)) ?? "";
  const body = (fn) =>
    newest(new RegExp("function public\\." + fn + "\\(", "i")).match(new RegExp("function public\\." + fn + "\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$", "i"))?.[1] ?? "";
  const literals = (text) => [...text.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const same = (label, ts, sql) => {
    const a = new Set(ts);
    const b = new Set(sql);
    if (!a.size || !setEq(a, b)) problems.push(label + ": model.ts [" + ts.join(", ") + "] vs SQL [" + [...b].join(", ") + "]");
  };

  const dims = body("analytics_check_dims");
  same("analytics_check_dims devices", tsList("DEVICES"), literals(dims.match(/p_device not in \(([^)]*)\)/i)?.[1] ?? ""));
  same("analytics_check_dims sources", tsList("TRAFFIC_SOURCES"), literals(dims.match(/p_source not in \(([^)]*)\)/i)?.[1] ?? ""));
  same("analytics_check_dims page types", tsList("PAGE_TYPES"), literals(dims.match(/p_page_type not in \(([^)]*)\)/i)?.[1] ?? ""));
  same("analytics_page_type outputs", tsList("PAGE_TYPES"), [...body("analytics_page_type").matchAll(/(?:then|else) '([^']+)'/gi)].map((m) => m[1]));
  const kind = body("analytics_listing_kind");
  same("analytics_listing_kind outputs", tsList("LISTING_KINDS"), [
    ...[...kind.matchAll(/(?:then|else) '([^']+)'/gi)].map((m) => m[1]),
    ...(/then p_type/i.test(kind) ? literals(kind.match(/when p_type in \(([^)]*)\) then p_type/i)?.[1] ?? "") : []),
  ]);
  const kindOrder = literals(body("admin_analytics_listings").match(/unnest\(array\[([^\]]*)\]\) with ordinality/i)?.[1] ?? "");
  if (kindOrder.join() !== tsList("LISTING_KINDS").join()) problems.push("admin_analytics_listings kind order [" + kindOrder.join(", ") + "] must equal LISTING_KINDS");
  const tables = newest(/page_views_source_check/i);
  for (const [, list] of tables.matchAll(/\bsource in \(([^)]*)\)/gi)) same("source CHECK", tsList("TRAFFIC_SOURCES"), literals(list));
  for (const [, list] of tables.matchAll(/\bdevice in \(([^)]*)\)/gi)) same("device CHECK", tsList("DEVICES"), literals(list));
  same("analytics_events.name CHECK", tsList("EVENT_NAMES"), literals(newest(/table if not exists public\.analytics_events/i).match(/name text not null check \(name in \(([^)]*)\)/i)?.[1] ?? ""));
  const keyActions = [...body("admin_analytics_traffic").matchAll(/\.name in \(([^)]*)\)/gi)];
  if (!keyActions.length) problems.push("admin_analytics_traffic no longer lists the lead events");
  for (const [, list] of keyActions) same("admin_analytics_traffic Key Actions", tsList("LEAD_EVENTS"), literals(list));
  const events = new Set(tsList("EVENT_NAMES"));
  const strays = tsList("CLIENT_EVENTS").filter((e) => !events.has(e));
  if (strays.length) problems.push("CLIENT_EVENTS not in EVENT_NAMES: " + strays.join(", "));

  const appFiles = srcFiles.filter((f) => !f.startsWith(join("src/lib/types")));
  const only = (label, pattern, allowed) => {
    const found = appFiles.filter((f) => pattern.test(srcText.get(f)));
    const extra = found.filter((f) => !allowed.some((a) => join(a) === f));
    const missing = allowed.filter((a) => !found.includes(join(a)));
    if (extra.length) problems.push(label + " is used outside " + allowed.join(", ") + ": " + extra.join(", "));
    if (missing.length) problems.push(missing.join(", ") + " no longer uses " + label);
  };
  only('the "/api/track/view" and "/api/track/ping" beacons', /["`]\/api\/track\/(view|ping)["`]/, ["src/components/analytics/PageviewTracker.tsx"]);
  only('the "/api/track/event" beacon', /["`]\/api\/track\/event["`]/, ["src/lib/analytics/track-client.ts"]);
  only("the mb_sid cookie writer (name: SESSION_COOKIE)", /name: SESSION_COOKIE/, ["src/app/api/track/view/route.ts", "src/app/api/track/ping/route.ts"]);
  only('the literal "mb_sid"', /["'`]mb_sid["'`]/, ["src/lib/analytics/model.ts"]);
  only('.from("analytics_events")', /\.from\(\s*"analytics_events"\s*\)/, ["src/lib/analytics/events.ts"]);
  only("analytics_ping", /rpc\(\s*"analytics_ping"/, ["src/app/api/track/ping/route.ts"]);
  only("the admin_analytics_* RPCs", /rpc\(\s*"admin_analytics_/, ["src/lib/analytics/server.ts"]);
  const adminRoutes = ["src/app/api/admin/analytics/route.ts", "src/app/api/admin/analytics/export/route.ts"];
  only("src/lib/analytics/server.ts", /from "@\/lib\/analytics\/server"/, adminRoutes);
  for (const route of adminRoutes) {
    if (!/await requireAdmin\(\)/.test(read(route))) problems.push(route + " must check requireAdmin() before reading");
  }
  for (const file of ["src/lib/analytics/server.ts", "src/lib/analytics/events.ts"]) {
    if (!/^import "server-only";/m.test(read(file))) problems.push(file + ' must start with import "server-only"');
  }
  if (!/hasAnalyticsConsent\(/.test(read("src/lib/analytics/events.ts"))) problems.push("src/lib/analytics/events.ts must check analytics consent before recording");
  if (!/hasAnalyticsConsent\(/.test(read("src/app/api/track/view/route.ts"))) problems.push("/api/track/view must check analytics consent");
  for (const route of ["src/app/api/track/ping/route.ts", "src/app/api/track/event/route.ts"]) {
    if (!/analyticsVisitor\(req\)/.test(read(route))) problems.push(route + " must resolve the consenting visitor (analyticsVisitor) before writing");
  }

  if (!/afterPageview\(\)\.then\(\(\) =>\s*fetch\(\`\/api\/listings\//.test(read("src/lib/hooks/useListingViewCount.ts"))) problems.push("useListingViewCount must send the listing view after afterPageview() (its analytics event needs the cookies the page view issues)");
  if (!/\.finally\(pageviewAnswered\)/.test(read("src/components/analytics/PageviewTracker.tsx"))) problems.push("PageviewTracker must call pageviewAnswered when its view beacon settles");
  const objects = "analytics_events|analytics_person_map_v|admin_analytics_\\w+|analytics_ping|analytics_page_type|analytics_listing_kind|analytics_check_\\w+";
  const granted = new RegExp("grant[^;]*\\b(" + objects + ")\\b[^;]*\\bto\\b[^;]*\\b(anon|authenticated|public)\\b", "i");
  if (sqlFiles.some((sql) => granted.test(sql))) problems.push("a migration grants an analytics table, view or function to anon, authenticated or PUBLIC (C34)");
  if (!/alter table public\.analytics_events enable row level security/i.test(sqlFiles.join("\n"))) problems.push("analytics_events must have RLS enabled");

  for (const name of ["model", "report", "traffic-source", "device", "geoip-core", "cities"]) {
    if (/^import (?!type\b)[^;]*;/m.test(read("src/lib/analytics/" + name + ".ts"))) problems.push("src/lib/analytics/" + name + ".ts has a runtime import (scripts/unit loads it bare: use import type)");
  }

  const dashboard = read("src/components/admin/analytics/AnalyticsDashboard.tsx");
  if (!/href="https:\/\/db-ip\.com"/.test(dashboard) || !/t\("geoAttribution"\)/.test(dashboard)) problems.push('the analytics page must link "IP Geolocation by DB-IP" to https://db-ip.com (CC BY 4.0)');
  if (!/t\("export\.geo"\)/.test(read("src/lib/analytics/report.ts"))) problems.push("every analytics export must carry the DB-IP attribution (export.geo)");
  for (const locale of ["ka", "en", "ru"]) {
    const messages = JSON.parse(read("messages/" + locale + ".json")).AdminAnalytics ?? {};
    if (!/IP Geolocation by DB-IP/.test(messages.geoAttribution ?? "") || !/IP Geolocation by DB-IP/.test(messages.export?.geo ?? "")) problems.push("messages/" + locale + '.json AdminAnalytics.geoAttribution and export.geo must say "IP Geolocation by DB-IP"');
  }

  if (problems.length) problems.forEach((p) => fail("C49: " + p));
  else ok("C49: analytics vocabularies = the migrations; beacons, the mb_sid cookie, analytics_events and analytics_ping each have one writer behind the consent check; admin_analytics_* only through the server-only loader behind requireAdmin; nothing granted to clients; pure modules bare; DB-IP attribution on the page and in exports");
}

// ---------------------------------------------------------------------------
// C50 — SMS financial control (owner spec "SMS Control"): (a) SMS_CATEGORIES /
// SMS_LEDGER_STATUSES (src/lib/finance/sms.ts) equal the ledger's CHECKs; (b)
// every sms_outbound.automation_kind of the newest CHECK is named in the
// newest sms_finance_category() (a kind left out silently lands in "other");
// (c) the sign-in code template the ledger prices equals domain.ts
// TEMPLATES.auth_code; (d) every route under api/admin/finance/sms calls
// requireAdmin(); (e) nothing in src writes the ledger or the purchase table
// (RPCs only) and the purchase/void/threshold RPCs are called only from that
// API; (f) no SMS-finance table or function is granted to anon, authenticated
// or PUBLIC; (g) the low-balance notice stays out of the SMS and e-mail lists
// (bell only); (h) src/lib/finance/sms.ts stays free of "@/" imports.
// ---------------------------------------------------------------------------
{
  const problems = [];
  const migrationFiles = readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  const migrations = migrationFiles.map((f) => read(join("supabase/migrations", f)));
  const newest = (pattern) => [...migrations].reverse().find((sql) => pattern.test(sql)) ?? null;
  // A function's body from the newest migration that (re)creates it.
  const fnBody = (name) => {
    const sql = newest(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\(`, "i"));
    if (!sql) return null;
    const at = sql.search(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\(`, "i"));
    const head = sql.slice(at).match(/\bAS\s+(\$[a-z_]*\$)/i);
    if (!head) return null;
    const start = at + head.index + head[0].length;
    return sql.slice(start, sql.indexOf(head[1], start));
  };
  const checkValues = (name) => {
    const sql = newest(new RegExp(`CONSTRAINT ${name}\\b`, "i"));
    if (!sql) return null;
    const at = [...sql.matchAll(new RegExp(`CONSTRAINT ${name}\\b`, "gi"))].at(-1).index;
    const open = sql.indexOf("(", sql.search(/check/i) >= 0 ? sql.toLowerCase().indexOf("check", at) : at);
    let depth = 0;
    for (let i = open; i < sql.length; i += 1) {
      if (sql[i] === "(") depth += 1;
      else if (sql[i] === ")" && --depth === 0) return new Set([...sql.slice(open + 1, i).matchAll(/'([^']+)'/g)].map((m) => m[1]));
    }
    return null;
  };

  const pure = read("src/lib/finance/sms.ts");
  const tsList = (name) =>
    new Set([...(pure.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\]`))?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]));
  for (const [constraint, constant] of [
    ["sms_usage_ledger_category_check", "SMS_CATEGORIES"],
    ["sms_usage_ledger_status_check", "SMS_LEDGER_STATUSES"],
  ]) {
    const db = checkValues(constraint);
    const ts = tsList(constant);
    if (!db || !ts.size) problems.push(`could not read ${db ? constant : constraint}`);
    else if (!setEq(db, ts)) problems.push(`${constraint} [${[...db].join(", ")}] ≠ ${constant} [${[...ts].join(", ")}]`);
  }

  const kinds = checkValues("sms_outbound_automation_kind_check");
  const mapping = fnBody("sms_finance_category");
  if (!kinds || !mapping) problems.push(`could not read ${kinds ? "sms_finance_category()" : "sms_outbound_automation_kind_check"}`);
  else {
    const unnamed = [...kinds].filter((k) => !mapping.includes(`'${k}'`));
    if (unnamed.length) problems.push(`sms_finance_category() does not name automation kind(s) ${unnamed.join(", ")} (map each to one of the six types)`);
    const keys = tsList("SMS_KIND_KEYS");
    const unworded = [...kinds].filter((k) => !keys.has(k));
    if (unworded.length) problems.push(`SMS_KIND_KEYS lacks automation kind(s) ${unworded.join(", ")}`);
  }

  const template = read("supabase/functions/sms-automation-run/domain.ts").match(/auth_code: "([^"]+)"/)?.[1];
  const otpSync = fnBody("_sms_finance_sync_auth_codes") ?? "";
  if (!template || !otpSync.includes(`'${template.replace("[Code]", "000000")}'`)) {
    problems.push("_sms_finance_sync_auth_codes() must price the text of domain.ts TEMPLATES.auth_code (with a 6-digit code)");
  }

  const routes = [...walk("src/app/api/admin/finance/sms", [".ts"])];
  if (!routes.length) problems.push("no routes under src/app/api/admin/finance/sms");
  for (const route of routes) {
    if (!/await requireAdmin\(\)/.test(read(route))) problems.push(`${route} must call requireAdmin()`);
  }

  const owners = ["src/app/api/admin/finance/sms/", "src/lib/finance/server/sms.ts"];
  const tableWriter = /\.from\(\s*"(?:sms_usage_ledger|sms_provider_purchases)"\s*\)[\s\S]{0,160}?\.(?:insert|update|upsert|delete)\(/;
  const rpcCall = /\.rpc\(\s*"(?:finance_record_sms_purchase|finance_void_sms_purchase|finance_set_sms_low_balance|admin_sms_finance_\w+)"/;
  for (const file of srcFiles) {
    const text = srcText.get(file);
    if (tableWriter.test(text)) problems.push(`${file} writes an SMS-finance table directly (only the RPCs may)`);
    if (rpcCall.test(text) && !owners.some((o) => file.startsWith(o))) problems.push(`${file} calls an SMS-finance RPC outside the admin SMS finance API`);
  }

  const c50 = migrations.filter((_, i) => /finance_sms_control/.test(migrationFiles[i])).join("\n");
  if (!c50) problems.push("the finance_sms_control migration is missing");
  const names = "sms_usage_ledger|sms_provider_purchases|sms_billing_units|sms_finance_\\w+|_sms_finance_\\w+|admin_sms_finance_\\w+|finance_record_sms_purchase|finance_void_sms_purchase|finance_set_sms_low_balance|sms_outbound_keep_ledger";
  const all = migrations.join("\n");
  if (new RegExp(`GRANT[^;]*\\b(?:${names})\\b[^;]*TO[^;]*\\b(?:anon|authenticated|PUBLIC)\\b`, "i").test(all)) {
    problems.push("an SMS-finance table or function is granted to anon, authenticated or PUBLIC (service_role only, C34)");
  }
  if (!/REVOKE ALL ON FUNCTION[\s\S]{0,200}FROM PUBLIC, anon, authenticated/.test(c50)) problems.push("the migration must revoke its functions from PUBLIC, anon and authenticated");

  for (const fn of ["sms_notification_types", "email_notification_types"]) {
    const body = fnBody(fn);
    if (body === null) problems.push(`could not read ${fn}()`);
    else if (body.includes("admin_sms_balance_low")) problems.push(`admin_sms_balance_low must stay out of ${fn}() (bell only)`);
  }

  if (/from "@\//.test(pure)) problems.push('src/lib/finance/sms.ts imports from "@/" (scripts/unit loads it bare)');

  if (problems.length) problems.forEach((p) => fail(`C50: ${p}`));
  else ok(`C50: SMS ledger CHECKs = sms.ts; all ${kinds.size} automation kinds mapped and worded; OTP template = domain.ts; ${routes.length} admin SMS routes requireAdmin; writes only through the RPCs; service_role only; low-balance notice bell only`);
}

// ---------------------------------------------------------------------------
// C51 — password reset and change: (a) useAuth sends /recover and the password
// update once (no withRetry: a lost answer would come back as a false 429 or
// 422 same_password, or a second email killing the first link), and
// changePassword signs in with the current password before the update;
// (b) the forgot page reads every result through resetRequestOutcome (the
// resend window is the sent state, not an error); (c) the reset page spends a
// token_hash link only on submit (no effect verifies it); (d) the settings card
// changes a password only through changePassword and sends an account without
// one to the emailed link; (e) no other src file writes a password;
// (f) the pure modules have no "@/" import.
// ---------------------------------------------------------------------------
{
  const problems = [];
  const auth = read("src/lib/hooks/useAuth.ts");
  for (const fn of ["resetPasswordForEmail", "updatePassword"]) {
    const body = auth.match(new RegExp(`async function ${fn}\\([^)]*\\) \\{([\\s\\S]*?)\\n  \\}`))?.[1] ?? null;
    if (body === null) problems.push(`useAuth.ts must define ${fn}`);
    else if (/withRetry/.test(body)) problems.push(`useAuth.ts ${fn} must not use withRetry (one call)`);
  }
  if (!/async function changePassword\([\s\S]{0,200}await signInWithPassword\(email, currentPassword\);\s*return updatePassword\(newPassword\);/.test(auth)) problems.push("useAuth.ts changePassword must sign in with the current password, then call updatePassword");
  const forgot = read("src/app/[locale]/auth/forgot-password/page.tsx");
  if (!/resetRequestOutcome\(failure\)/.test(forgot) || /\.status === 429/.test(forgot)) problems.push("forgot-password/page.tsx must read every /recover result through resetRequestOutcome");
  const reset = read("src/app/[locale]/auth/reset-password/page.tsx");
  if (!/recoveryTokenHash\(searchParams\)/.test(reset)) problems.push("reset-password/page.tsx must read the link with recoveryTokenHash");
  const verifyAt = reset.indexOf('type: "recovery"');
  if (verifyAt < 0 || verifyAt < reset.indexOf("async function handleSubmit") || /useEffect\(/.test(reset)) problems.push('reset-password/page.tsx must verify the token (type: "recovery") only in handleSubmit, never in an effect');
  const card = read("src/components/auth/ChangePasswordCard.tsx");
  if (!/identity\.provider === "email"/.test(card) || !/changePassword\(email, currentPassword, password\)/.test(card) || /updatePassword|updateUser/.test(card)) problems.push("ChangePasswordCard must change a password only through changePassword, for an account with the email identity");
  if (!/href="\/auth\/forgot-password"/.test(card)) problems.push("ChangePasswordCard must send an account without a password to /auth/forgot-password");
  const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const writers = srcFiles.filter((f) => f !== join("src/lib/hooks/useAuth.ts") && /updateUser\(\s*\{[^}]*\bpassword\b/.test(code(f)));
  if (writers.length) problems.push(`only useAuth.ts may call updateUser({ password }) (found: ${writers.join(", ")})`);
  for (const file of ["src/lib/auth/password-reset.ts", "src/lib/auth/password.ts"]) {
    if (/from "@\//.test(read(file))) problems.push(`${file} imports from "@/" (scripts/unit loads it bare)`);
  }
  if (problems.length) problems.forEach((p) => fail(`C51: ${p}`));
  else ok("C51: /recover and the password update sent once; changePassword proves the current password; the resend window is the sent state; token_hash links spent only on submit; the card writes through changePassword; no other password writer; pure modules bare");
}

// ---------------------------------------------------------------------------
// C52 — admin verified users and payer groups (/dashboard/admin/verified-users): (a) user_groups and
// user_group_members are created once, with RLS on, REVOKE ALL from PUBLIC/anon/authenticated, GRANT to service_role
// only and the audit trigger, no policy, and no migration grants them to a client role or switches RLS off;
// (a2) admin_save_user_group is a SECURITY DEFINER with an empty search_path, revoked from PUBLIC/anon/authenticated
// where it is created, granted to service_role only and never to a client role; (b) the role CHECK = USER_GROUP_ROLES;
// (c) every handler of the verified-users routes and of the verified toggle starts with the requireAdmin guard, a
// writing handler runs under createServiceClient(guard.admin.userId) (the audit row names the admin) and the RPC gets
// the session's admin id, never the body's; (d) the group tables and the RPC are named as strings only inside that API
// directory and the generated types; (e) src/lib/user-groups.ts has no runtime import (check-db-contracts and
// scripts/unit load it bare); (f) AdminVerifiedUsers is a dashboard namespace, DashboardSidebar.nav.verifiedUsers is
// worded in every locale, both admin menus link the page, and the page file exists and imports no service-role client;
// (g) profiles.is_verified is written only by the toggle route and verifications/moderate, and the toggle writes through
// verificationPatch on a real transition only, behind an isUuid check; (h) no log line of those routes carries a
// request body, name, note, search term, row or the raw error object; (i) no select("*"); (j) a <button> that can be
// disabled does not interpolate a person's name (the support assistant's nudge reads a pressed disabled button's label).
// ---------------------------------------------------------------------------
{
  const problems = [];
  const tables = ["user_groups", "user_group_members"];
  const rpc = "admin_save_user_group";
  const apiDir = "src/app/api/admin/verified-users";
  const toggleRoute = "src/app/api/admin/clients/[id]/verified/route.ts";
  const moderateRoute = "src/app/api/admin/verifications/moderate/route.ts";
  const pureFile = "src/lib/user-groups.ts";
  const serverFile = "src/lib/user-groups-server.ts";
  const componentDir = "src/components/admin/verified-users";
  const pageFile = "src/app/[locale]/dashboard/admin/verified-users/page.tsx";
  const generatedTypes = join("src/lib/types", "database");
  const sources = new Map();
  const source = (f) => {
    if (!sources.has(f)) {
      if (!existsSync(join(root, f))) problems.push(`${f} is missing`);
      sources.set(f, existsSync(join(root, f)) ? read(f) : "");
    }
    return sources.get(f);
  };
  // One left-to-right pass: a comment is dropped, a string is kept, so "//" in a URL string and "/**" inside a
  // "//" comment cannot swallow code (a block-comment pass first would).
  const asCode = (code) => code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (m) => (m[0] === "/" ? " " : m));
  // Comments never count in SQL: "-- GRANT ... TO anon" must neither fail nor pass.
  const migrations = readdirSync(join(root, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => [f, read(join("supabase/migrations", f)).replace(/\/\*[\s\S]*?\*\/|--[^\n]*|'(?:[^']|'')*'/g, (m) => (m[0] === "'" ? m : " "))]);
  const grantsOn = (sql, name) => sql.match(new RegExp(`\\bGRANT\\b[^;]*\\bpublic\\.${name}\\b[^;]*;`, "gi")) ?? [];
  const toClient = (grant) => /\bTO\b[^;]*\b(?:anon|authenticated|PUBLIC)\b/i.test(grant);

  // (a) one creating migration per table, which also closes it off; no later policy, RLS-off or client grant.
  for (const table of tables) {
    const creators = migrations.filter(([, sql]) => new RegExp(`\\bCREATE TABLE (?:IF NOT EXISTS )?public\\.${table}\\b`, "i").test(sql));
    if (creators.length !== 1) problems.push(`public.${table} must be created by exactly one migration (found ${creators.length})`);
    else {
      const [file, sql] = creators[0];
      for (const [pattern, what] of [
        [`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "ENABLE ROW LEVEL SECURITY"],
        [`REVOKE ALL ON (?:TABLE )?public\\.${table}\\b[^;]*FROM PUBLIC, anon, authenticated`, "REVOKE ALL FROM PUBLIC, anon, authenticated"],
        [`GRANT [A-Z, ]+ ON (?:TABLE )?public\\.${table} TO service_role\\s*;`, "GRANT to service_role only"],
        [`CREATE TRIGGER trg_audit_row\\s+AFTER[^;]*\\bON public\\.${table}\\s+FOR EACH ROW EXECUTE FUNCTION public\\.audit_row_change\\(\\)`, "CREATE TRIGGER trg_audit_row (an admin's edit is audited)"],
      ]) {
        if (!new RegExp(pattern, "i").test(sql)) problems.push(`${file} must ${what} on public.${table}`);
      }
    }
    for (const [file, sql] of migrations) {
      if (new RegExp(`CREATE POLICY[^;]*\\bON public\\.${table}\\b`, "i").test(sql)) problems.push(`${file} adds a policy on public.${table} (service role only: no client path)`);
      if (new RegExp(`ALTER TABLE (?:ONLY )?public\\.${table} (?:DISABLE|NO FORCE) ROW LEVEL SECURITY`, "i").test(sql)) problems.push(`${file} switches RLS off on public.${table}`);
      if (grantsOn(sql, table).some(toClient)) problems.push(`${file} grants public.${table} to a client role`);
    }
  }

  // (a2) the definer RPC: service_role only, search_path pinned, never granted to a client role.
  const rpcHeader = new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${rpc}\\(`, "i");
  const rpcCreators = migrations.filter(([, sql]) => rpcHeader.test(sql));
  if (!rpcCreators.length) problems.push(`no migration creates public.${rpc}`);
  else {
    const [first, firstSql] = rpcCreators[0];
    if (!new RegExp(`REVOKE ALL ON FUNCTION public\\.${rpc}\\b[^;]*FROM PUBLIC, anon, authenticated`, "i").test(firstSql)) problems.push(`${first} must REVOKE ALL on public.${rpc} FROM PUBLIC, anon, authenticated`);
    if (!new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${rpc}\\b[^;]*TO service_role\\s*;`, "i").test(firstSql)) problems.push(`${first} must GRANT EXECUTE on public.${rpc} TO service_role only`);
    const [newest, newestSql] = rpcCreators.at(-1);
    const head = newestSql.slice(newestSql.search(rpcHeader)).match(/^[\s\S]*?\bAS\s+\$[a-z_]*\$/i)?.[0] ?? "";
    if (!/\bSECURITY DEFINER\b/i.test(head) || !/\bSET search_path\s*=\s*''/i.test(head)) problems.push(`${newest} must define public.${rpc} as SECURITY DEFINER with SET search_path = '' (the newest definition is the one that counts)`);
  }
  for (const [file, sql] of migrations) {
    if (grantsOn(sql, rpc).some(toClient)) problems.push(`${file} grants public.${rpc} to a client role`);
  }

  // (b) the role CHECK equals USER_GROUP_ROLES (a role on one side only is a 400 or a 23514).
  const pure = source(pureFile);
  const tsRoles = [...(pure.match(/export const USER_GROUP_ROLES = \[([\s\S]*?)\]/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  let dbRoles = null;
  for (const [, sql] of [...migrations].reverse()) {
    const at = sql.search(/CONSTRAINT user_group_members_role_check\s+CHECK\s*\(/i);
    if (at < 0) continue;
    const open = sql.indexOf("(", at);
    let depth = 0;
    for (let i = open; i < sql.length; i += 1) {
      if (sql[i] === "(") depth += 1;
      else if (sql[i] === ")" && --depth === 0) {
        dbRoles = [...sql.slice(open + 1, i).matchAll(/'([^']+)'/g)].map((m) => m[1]);
        break;
      }
    }
    break;
  }
  if (!dbRoles || !tsRoles.length) problems.push(`could not read ${dbRoles ? "USER_GROUP_ROLES" : "user_group_members_role_check"}`);
  else if (!setEq(new Set(dbRoles), new Set(tsRoles))) problems.push(`user_group_members_role_check [${dbRoles.join(", ")}] ≠ USER_GROUP_ROLES [${tsRoles.join(", ")}]`);

  // (c) requireAdmin first in every handler; a writing handler runs under the admin's id.
  const routeFiles = existsSync(join(root, apiDir)) ? [...walk(apiDir, [".ts"])].filter((f) => /(^|\/)route\.ts$/.test(f)) : [];
  if (!routeFiles.length) problems.push(`no routes under ${apiDir}`);
  const handlersOf = (code) => {
    const found = [...code.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\s*\(/g)];
    return found.map((m, i) => {
      let depth = 0;
      let at = m.index + m[0].length - 1;
      for (; at < code.length; at += 1) {
        if (code[at] === "(") depth += 1;
        else if (code[at] === ")" && --depth === 0) break;
      }
      return { method: m[1], body: code.slice(code.indexOf("{", at) + 1, found[i + 1]?.index ?? code.length) };
    });
  };
  const guardFirst = /^\s*const guard = await requireAdmin\(\);\s*if \(!guard\.ok\) return guard\.response;/;
  let handlerCount = 0;
  for (const file of [...routeFiles, toggleRoute]) {
    const code = asCode(source(file));
    const handlers = handlersOf(code);
    if (!handlers.length) problems.push(`${file} exports no HTTP handler`);
    for (const { method, body } of handlers) {
      handlerCount += 1;
      if (!guardFirst.test(body)) problems.push(`${file} ${method} must start with const guard = await requireAdmin(); if (!guard.ok) return guard.response;`);
      const writes = method !== "GET" || /\.(?:insert|update|upsert|delete)\(|\.rpc\(/.test(body);
      if (writes && !/createServiceClient\(\s*guard\.admin\.userId\s*\)/.test(body)) problems.push(`${file} ${method} writes without createServiceClient(guard.admin.userId) (the audit row would have no actor)`);
    }
    for (const call of code.match(new RegExp(`\\.rpc\\(\\s*"${rpc}"[\\s\\S]*?\\}\\s*\\)`, "g")) ?? []) {
      if (!/\bp_admin_id:\s*guard\.admin\.userId\b/.test(call)) problems.push(`${file} calls ${rpc} without p_admin_id: guard.admin.userId (the session's admin, never the body's)`);
    }
  }

  // (d) nothing else names the tables or the RPC as a string: only the admin API (and the generated types).
  const named = new RegExp(`["'\`](?:${[...tables, rpc].join("|")})["'\`]`);
  const strangers = srcFiles.filter((f) => !f.startsWith(`${apiDir}/`) && !f.startsWith(generatedTypes) && named.test(asCode(srcText.get(f))));
  if (strangers.length) problems.push(`the group tables / ${rpc} are named outside ${apiDir}: ${strangers.join(", ")}`);

  // (e) the pure module is loaded bare by check-db-contracts and scripts/unit.
  if (/^\s*import\s+(?!type\b)|^\s*export\s+(?:\*|\{[^}]*\})\s+from\b/m.test(asCode(pure))) problems.push(`${pureFile} has a runtime import or re-export (it is loaded bare: use import type)`);

  // (f) namespace, nav label, both menus, the page.
  if (!/"AdminVerifiedUsers"/.test(source("src/i18n/namespaces.ts").match(/DASHBOARD_NAMESPACES = \[([\s\S]*?)\]/)?.[1] ?? "")) problems.push("AdminVerifiedUsers is missing from DASHBOARD_NAMESPACES (src/i18n/namespaces.ts)");
  for (const locale of ["ka", "en", "ru"]) {
    const messages = JSON.parse(source(`messages/${locale}.json`) || "{}");
    if (typeof messages.DashboardSidebar?.nav?.verifiedUsers !== "string" || !messages.DashboardSidebar.nav.verifiedUsers.trim()) problems.push(`messages/${locale}.json lacks DashboardSidebar.nav.verifiedUsers (both admin menus use it)`);
    if (!messages.AdminVerifiedUsers) problems.push(`messages/${locale}.json lacks the AdminVerifiedUsers namespace`);
  }
  for (const menu of ["src/components/layout/AdminSidebar.tsx", "src/components/layout/MobileBottomNav.tsx"]) {
    if (!/labelKey:\s*"verifiedUsers"[\s\S]{0,80}href:\s*"\/dashboard\/admin\/verified-users"/.test(source(menu))) problems.push(`${menu} must list the page (labelKey "verifiedUsers", href /dashboard/admin/verified-users)`);
  }
  if (/@\/lib\/supabase\/admin|getAdminStats/.test(source(pageFile))) problems.push(`${pageFile} must not import the service-role client or getAdminStats (every figure comes from ${apiDir}; C8 stays n/a)`);

  // (g) profiles.is_verified: two writers; the toggle stamps verified_at on a real transition only.
  const isVerifiedWrite = /\.(?:update|upsert|insert)\(\s*(?:\[\s*)?\{[^}]*\bis_verified\b|\bverificationPatch\(/;
  const writers = new Set([toggleRoute, moderateRoute]);
  const rogue = srcFiles.filter((f) => !f.startsWith(generatedTypes) && f !== pureFile && !writers.has(f) && isVerifiedWrite.test(asCode(srcText.get(f))));
  if (rogue.length) problems.push(`profiles.is_verified is written outside the two admin routes (${rogue.join(", ")}); extend this allow-list only on purpose`);
  const toggle = asCode(source(toggleRoute));
  if (!/\.update\(\s*verificationPatch\(/.test(toggle)) problems.push(`${toggleRoute} must write through verificationPatch (is_verified AND verified_at)`);
  if (!/is_verified\.is\.null,is_verified\.eq\.false/.test(toggle) || !/\.eq\(\s*"is_verified",\s*true\s*\)/.test(toggle)) problems.push(`${toggleRoute} must update on a transition only (a repeat keeps the original verified_at)`);
  if (!/\bisUuid\(/.test(toggle) || toggle.indexOf("isUuid(") > toggle.indexOf(".from(")) problems.push(`${toggleRoute} must reject a non-uuid id before the first query`);

  // (h) + (i) the routes, the toggle and their helper: what may be logged, what may be selected.
  const callArgs = (code, opener) => [...code.matchAll(opener)].map((m) => {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < code.length && depth > 0; i += 1) {
      if (code[i] === "(") depth += 1;
      else if (code[i] === ")") depth -= 1;
    }
    return code.slice(m.index + m[0].length, i - 1);
  });
  // String literals out, the ${…} expressions of template literals kept: only identifiers are tested.
  const exprsOf = (args) => args.replace(/`((?:[^`\\]|\\.)*)`|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (_, template) => (template === undefined ? " " : [...template.matchAll(/\$\{([^}]*)\}/g)].map((m) => ` ${m[1]} `).join("")));
  const unsafeLog = /(?<![.\w])(?:body|name|note|q|term|search|parsed|input|payerId|memberIds|display_name|details|data)(?!\w)|(?<![.\w])(?:error|readError|err)(?![\w.])/;
  const selectsAll = /\.select\(\s*\)|\.select\(\s*(["'`])[^"'`]*\*[^"'`]*\1|\b[A-Z][A-Z_]*(?:SELECT|COLUMNS)\s*=\s*(["'`])[^"'`]*\*[^"'`]*\2/;
  for (const file of [...routeFiles, toggleRoute, serverFile]) {
    const code = asCode(source(file));
    for (const args of callArgs(code, /console\.(?:error|warn|log|info|debug)\(/g)) {
      const hit = exprsOf(args).match(unsafeLog)?.[0];
      if (hit) problems.push(`${file} logs "${hit}" (log only a fixed label and the error's code, message and hint)`);
    }
    if (selectsAll.test(code)) problems.push(`${file} selects every column (name the columns; select("*") would also return a CHECK violation's row)`);
  }

  // (j) a <button>/<Button> the browser can disable (disabled, aria-disabled, or Button's loading) must not carry a
  // person's name in its label or text: the support assistant's nudge reads it. A per-person control (remove X) stays
  // enabled and shows aria-busy instead. Props passed down (ConfirmPanel's cancelLabel) are not followed.
  const buttonsOf = (code) => {
    const found = [];
    for (const m of code.matchAll(/<(button|Button)(?=[\s/>])/g)) {
      let depth = 0;
      let quote = "";
      let props = "";
      let end = -1;
      for (let i = m.index + m[0].length; i < code.length; i += 1) {
        const c = code[i];
        if (quote) {
          if (c === "\\" && depth > 0) i += 1;
          else if (c === quote) quote = "";
        } else if (c === '"' || c === "'" || c === "`") {
          quote = c;
          if (depth === 0) props += " ";
        } else if (c === "{") depth += 1;
        else if (c === "}") {
          depth -= 1;
          if (depth === 0) props += " ";
        } else if (c === ">" && depth === 0) {
          end = i;
          break;
        } else if (depth === 0) props += c;
      }
      if (end < 0) continue;
      const open = code.slice(m.index, end + 1);
      const close = open.endsWith("/>") ? -1 : code.indexOf(`</${m[1]}>`, end);
      found.push({ tag: m[1], open, props: ` ${props} `, children: close < 0 ? "" : code.slice(end + 1, close) });
    }
    return found;
  };
  const namesAPerson = /\bdisplay_name\b|\bname\s*:|\{\s*(?:[\w$]+\.)*name\s*\}|<UserIdentity\b/;
  let buttonCount = 0;
  let disableable = 0;
  const componentFiles = existsSync(join(root, componentDir)) ? [...walk(componentDir, [".tsx"])] : [];
  if (!componentFiles.length) problems.push(`no components under ${componentDir}`);
  for (const file of componentFiles) {
    for (const button of buttonsOf(asCode(source(file)))) {
      buttonCount += 1;
      const canDisable = /\s(?:disabled|aria-disabled)(?=[\s=/])/.test(button.props) || (button.tag === "Button" && /\sloading(?=[\s=/])/.test(button.props));
      if (!canDisable) continue;
      disableable += 1;
      if (namesAPerson.test(button.open) || namesAPerson.test(button.children)) problems.push(`${file}: a button that can be disabled interpolates a person's name (${button.open.replace(/\s+/g, " ").slice(0, 90)}…); keep per-person buttons enabled and use aria-busy`);
    }
  }

  if (problems.length) problems.forEach((p) => fail(`C52: ${p}`));
  else ok(`C52: ${tables.length} group tables and ${rpc} service_role only (RLS on, audited, no policy); role CHECK = USER_GROUP_ROLES; ${handlerCount} handlers in ${routeFiles.length + 1} route files start with requireAdmin and write under the admin's id; tables named only by the admin API; is_verified written by 2 admin routes, the toggle stamps verified_at on a transition; no body/name/note logged, no select("*"); ${disableable} of ${buttonCount} buttons can be disabled and none interpolates a name; pure module bare; namespace, nav label and both menus wired`);
}

// ---------------------------------------------------------------------------
// C53 — admin free periods (/dashboard/admin/free-periods): (a) free_periods and free_period_grants are created once,
// RLS on, REVOKE ALL from PUBLIC/anon/authenticated, GRANT to service_role only, no policy, no client grant (free_periods
// is audited); (b) every free-period function pins search_path = '' (definers except the guard trigger), is revoked from
// PUBLIC/anon/authenticated where it is created and is never granted to a client role; only the three entry points are
// granted (to service_role); (c) FREE_PERIOD_BENEFITS / ROLES / NAME_MAX / MAX_LISTINGS_LIMIT equal the CHECKs and the
// user_role enum minus admin; (d) every token the migration raises maps to a request error code that is worded in all
// three locales; (e) every handler of the routes starts with the requireAdmin guard, a writing handler is rate-limited
// and runs under the admin's id; (f) the tables and RPCs are named as strings only in the admin API, the server helper
// and the generated types; no log line of those files carries an object, no select("*"); (g) the sign-up trigger swallows
// every error, no trigger on properties/services applies a period, the cron job is SQL-only, the migration writes no
// transactions row and notifies only with the two bell-only admin types; (h) src/lib/free-periods.ts has no runtime
// import; namespace, nav label, both menus and the page are wired; the cron job is in check-db-contracts' list.
// ---------------------------------------------------------------------------
{
  const problems = [];
  const tables = ["free_periods", "free_period_grants"];
  const entryPoints = ["free_period_apply", "free_period_apply_all", "admin_free_period_stats"];
  const functions = ["free_periods_guard", "_free_period_member_candidates", "_free_period_listing_candidates", "_free_period_grant_membership", "_free_period_grant_listing", "free_period_on_profile_insert", ...entryPoints];
  const apiDir = "src/app/api/admin/free-periods";
  const pureFile = "src/lib/free-periods.ts";
  const serverFile = "src/lib/free-periods-server.ts";
  const pageFile = "src/app/[locale]/dashboard/admin/free-periods/page.tsx";
  const generatedTypes = join("src/lib/types", "database");
  const sources = new Map();
  const source = (f) => {
    if (!sources.has(f)) {
      if (!existsSync(join(root, f))) problems.push(`${f} is missing`);
      sources.set(f, existsSync(join(root, f)) ? read(f) : "");
    }
    return sources.get(f);
  };
  const asCode = (code) => code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (m) => (m[0] === "/" ? " " : m));
  const migrations = readdirSync(join(root, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => [f, read(join("supabase/migrations", f)).replace(/\/\*[\s\S]*?\*\/|--[^\n]*|'(?:[^']|'')*'/g, (m) => (m[0] === "'" ? m : " "))]);
  const grantsOn = (sql, name) => sql.match(new RegExp(`\\bGRANT\\b[^;]*\\b(?:public\\.)?${name}\\b[^;]*;`, "gi")) ?? [];
  const toClient = (grant) => /\bTO\b[^;]*\b(?:anon|authenticated|PUBLIC)\b/i.test(grant);
  const listIn = (text, name) => [...(text.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\]`))?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const creatorsOf = (pattern) => migrations.filter(([, sql]) => pattern.test(sql));

  // (a) one creating migration per table, which also closes it off; no later policy, RLS-off or client grant.
  for (const table of tables) {
    const creators = creatorsOf(new RegExp(`\\bCREATE TABLE (?:IF NOT EXISTS )?public\\.${table}\\b`, "i"));
    if (creators.length !== 1) problems.push(`public.${table} must be created by exactly one migration (found ${creators.length})`);
    else {
      const [file, sql] = creators[0];
      for (const [pattern, what] of [
        [`ALTER TABLE public\\.${table}\\s+ENABLE ROW LEVEL SECURITY`, "ENABLE ROW LEVEL SECURITY"],
        [`REVOKE ALL ON (?:TABLE )?public\\.${table}\\b[^;]*FROM PUBLIC, anon, authenticated`, "REVOKE ALL FROM PUBLIC, anon, authenticated"],
        [`GRANT [A-Z, ]+ ON (?:TABLE )?public\\.${table}\\s+TO service_role\\s*;`, "GRANT to service_role only"],
        ...(table === "free_periods" ? [[`CREATE TRIGGER trg_audit_row\\s+AFTER[^;]*\\bON public\\.${table}\\s+FOR EACH ROW EXECUTE FUNCTION public\\.audit_row_change\\(\\)`, "CREATE TRIGGER trg_audit_row (an admin's edit is audited)"]] : []),
      ]) {
        if (!new RegExp(pattern, "i").test(sql)) problems.push(`${file} must ${what} on public.${table}`);
      }
    }
    for (const [file, sql] of migrations) {
      if (new RegExp(`CREATE POLICY[^;]*\\bON public\\.${table}\\b`, "i").test(sql)) problems.push(`${file} adds a policy on public.${table} (service role only: no client path)`);
      if (new RegExp(`ALTER TABLE (?:ONLY )?public\\.${table} (?:DISABLE|NO FORCE) ROW LEVEL SECURITY`, "i").test(sql)) problems.push(`${file} switches RLS off on public.${table}`);
      if (grantsOn(sql, table).some(toClient)) problems.push(`${file} grants public.${table} to a client role`);
    }
  }

  // (b) the functions: search_path pinned, definer (the guard trigger is invoker), closed to client roles.
  for (const fn of functions) {
    const header = new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${fn}\\(`, "i");
    const creators = creatorsOf(header);
    if (!creators.length) {
      problems.push(`no migration creates public.${fn}`);
      continue;
    }
    const [first, firstSql] = creators[0];
    if (!new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\b[^;]*FROM PUBLIC, anon, authenticated`, "i").test(firstSql)) problems.push(`${first} must REVOKE ALL on public.${fn} FROM PUBLIC, anon, authenticated`);
    const [newest, newestSql] = creators.at(-1);
    const head = newestSql.slice(newestSql.search(header)).match(/^[\s\S]*?\bAS\s+\$[a-z_]*\$/i)?.[0] ?? "";
    if (!/\bSET search_path\s*=\s*''/i.test(head)) problems.push(`${newest} must define public.${fn} with SET search_path = ''`);
    if (fn !== "free_periods_guard" && !/\bSECURITY DEFINER\b/i.test(head)) problems.push(`${newest} must define public.${fn} as SECURITY DEFINER`);
    for (const [file, sql] of migrations) {
      const grants = grantsOn(sql, fn);
      if (grants.some(toClient)) problems.push(`${file} grants public.${fn} to a client role`);
      if (!entryPoints.includes(fn) && grants.length) problems.push(`${file} grants public.${fn}, which is an internal helper (only ${entryPoints.join(", ")} are granted, to service_role)`);
    }
    if (entryPoints.includes(fn) && !new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\b[^;]*TO service_role\\s*;`, "i").test(firstSql)) problems.push(`${first} must GRANT EXECUTE on public.${fn} TO service_role only`);
  }

  // (c) vocabulary and limits against the CHECKs and the enum.
  const pure = source(pureFile);
  const tableSql = creatorsOf(/\bCREATE TABLE (?:IF NOT EXISTS )?public\.free_periods\b/i)[0]?.[1] ?? "";
  const dbBenefits = [...(tableSql.match(/free_periods_benefit_check\s+CHECK\s*\(benefit IN \(([^)]*)\)/i)?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const tsBenefits = listIn(pure, "FREE_PERIOD_BENEFITS");
  if (!dbBenefits.length || !tsBenefits.length) problems.push("could not read free_periods_benefit_check or FREE_PERIOD_BENEFITS");
  else if (!setEq(new Set(dbBenefits), new Set(tsBenefits))) problems.push(`free_periods_benefit_check [${dbBenefits.join(", ")}] ≠ FREE_PERIOD_BENEFITS [${tsBenefits.join(", ")}]`);
  const enumRoles = [...(source(join("src/lib/types", "database.generated.ts")).match(/user_role: \[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((role) => role !== "admin");
  const tsRoles = listIn(pure, "FREE_PERIOD_ROLES");
  if (!enumRoles.length || !tsRoles.length) problems.push("could not read the user_role enum or FREE_PERIOD_ROLES");
  else if (!setEq(new Set(enumRoles), new Set(tsRoles))) problems.push(`FREE_PERIOD_ROLES [${tsRoles.join(", ")}] ≠ enum user_role without admin [${enumRoles.join(", ")}]`);
  if (!/NOT \('admin'::public\.user_role = ANY \(roles\)\)/i.test(tableSql)) problems.push("free_periods_roles_check must refuse the admin role");
  const nameMax = Number(tableSql.match(/char_length\(btrim\(name\)\) BETWEEN 1 AND (\d+)/i)?.[1]);
  if (nameMax !== Number(pure.match(/export const FREE_PERIOD_NAME_MAX = (\d+)/)?.[1])) problems.push(`free_periods_name_check (${nameMax}) ≠ FREE_PERIOD_NAME_MAX`);
  const listingsMax = Number(tableSql.match(/max_listings BETWEEN 1 AND (\d+)/i)?.[1]);
  if (listingsMax !== Number(pure.match(/export const FREE_PERIOD_MAX_LISTINGS_LIMIT = (\d+)/)?.[1])) problems.push(`free_periods_max_listings_check (${listingsMax}) ≠ FREE_PERIOD_MAX_LISTINGS_LIMIT`);

  // (d) database tokens → request error codes → wording in every locale.
  const codes = listIn(pure, "FREE_PERIOD_ERROR_CODES");
  const dbErrors = new Map([...(pure.match(/export const FREE_PERIOD_DB_ERRORS[^=]*=\s*\{([\s\S]*?)\};/)?.[1] ?? "").matchAll(/([A-Z_]+):\s*"([a-z_]+)"/g)].map((m) => [m[1], m[2]]));
  const raised = new Set(creatorsOf(/FREE_PERIOD_/).flatMap(([, sql]) => [...sql.matchAll(/RAISE EXCEPTION '(FREE_PERIOD_[A-Z_]+|ADMIN_STATUS_FORBIDDEN)'/g)].map((m) => m[1])));
  raised.delete("FREE_PERIOD_LEDGER_CONFLICT"); // internal: never reaches a response (the trigger swallows it, the sweep counts it as skipped)
  for (const token of raised) if (!dbErrors.has(token)) problems.push(`the migration raises ${token} but FREE_PERIOD_DB_ERRORS has no code for it (the admin would get a 500)`);
  if (!dbErrors.has("ADMIN_STATUS_FORBIDDEN")) problems.push("FREE_PERIOD_DB_ERRORS must map ADMIN_STATUS_FORBIDDEN (admin_free_period_stats)");
  for (const [token, code] of dbErrors) if (!codes.includes(code)) problems.push(`FREE_PERIOD_DB_ERRORS maps ${token} to ${code}, which is not in FREE_PERIOD_ERROR_CODES`);
  for (const locale of ["ka", "en", "ru"]) {
    const messages = JSON.parse(source(`messages/${locale}.json`) || "{}");
    for (const code of codes) if (typeof messages.AdminFreePeriods?.errors?.[code] !== "string" || !messages.AdminFreePeriods.errors[code].trim()) problems.push(`messages/${locale}.json lacks AdminFreePeriods.errors.${code}`);
    if (typeof messages.DashboardSidebar?.nav?.freePeriods !== "string" || !messages.DashboardSidebar.nav.freePeriods.trim()) problems.push(`messages/${locale}.json lacks DashboardSidebar.nav.freePeriods (both admin menus use it)`);
  }

  // (e) requireAdmin first in every handler; a writing handler is rate-limited and runs under the admin's id.
  const routeFiles = existsSync(join(root, apiDir)) ? [...walk(apiDir, [".ts"])].filter((f) => /(^|\/)route\.ts$/.test(f)) : [];
  if (!routeFiles.length) problems.push(`no routes under ${apiDir}`);
  const handlersOf = (code) => {
    const found = [...code.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\s*\(/g)];
    return found.map((m, i) => {
      let depth = 0;
      let at = m.index + m[0].length - 1;
      for (; at < code.length; at += 1) {
        if (code[at] === "(") depth += 1;
        else if (code[at] === ")" && --depth === 0) break;
      }
      return { method: m[1], body: code.slice(code.indexOf("{", at) + 1, found[i + 1]?.index ?? code.length) };
    });
  };
  const guardFirst = /^\s*const guard = await requireAdmin\(\);\s*if \(!guard\.ok\) return guard\.response;/;
  let handlerCount = 0;
  for (const file of routeFiles) {
    const handlers = handlersOf(asCode(source(file)));
    if (!handlers.length) problems.push(`${file} exports no HTTP handler`);
    for (const { method, body } of handlers) {
      handlerCount += 1;
      if (!guardFirst.test(body)) problems.push(`${file} ${method} must start with const guard = await requireAdmin(); if (!guard.ok) return guard.response;`);
      if (method === "GET") continue;
      if (!/\bconst adminId = guard\.admin\.userId;/.test(body)) problems.push(`${file} ${method} must take the actor from const adminId = guard.admin.userId (never the body)`);
      if (!/\bwithinRateLimit\(\s*adminId\s*\)/.test(body)) problems.push(`${file} ${method} writes without withinRateLimit(adminId)`);
      if (!/createServiceClient\(\s*adminId\s*\)|\bapplyPeriod\(\s*adminId\b/.test(body)) problems.push(`${file} ${method} writes without createServiceClient(adminId) or applyPeriod(adminId, …) (the audit row would have no actor)`);
    }
  }

  // (f) who names the tables and RPCs; what may be logged; no select("*").
  const named = new RegExp(`["'\`](?:${[...tables, ...entryPoints].join("|")})["'\`]`);
  const strangers = srcFiles.filter((f) => !f.startsWith(`${apiDir}/`) && f !== serverFile && !f.startsWith(generatedTypes) && named.test(asCode(srcText.get(f))));
  if (strangers.length) problems.push(`the free-period tables / RPCs are named outside ${apiDir} and ${serverFile}: ${strangers.join(", ")}`);
  const callArgs = (code, opener) => [...code.matchAll(opener)].map((m) => {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < code.length && depth > 0; i += 1) {
      if (code[i] === "(") depth += 1;
      else if (code[i] === ")") depth -= 1;
    }
    return code.slice(m.index + m[0].length, i - 1);
  });
  const exprsOf = (args) => args.replace(/`((?:[^`\\]|\\.)*)`|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (_, template) => (template === undefined ? " " : [...template.matchAll(/\$\{([^}]*)\}/g)].map((m) => ` ${m[1]} `).join("")));
  const unsafeLog = /(?<![.\w])(?:body|name|parsed|input|row|data|details)(?!\w)|(?<![.\w])(?:error|err)(?![\w.])/;
  const selectsAll = /\.select\(\s*\)|\.select\(\s*(["'`])[^"'`]*\*[^"'`]*\1|\b[A-Z][A-Z_]*(?:SELECT|COLUMNS)\s*=\s*(["'`])[^"'`]*\*[^"'`]*\2/;
  for (const file of [...routeFiles, serverFile]) {
    const code = asCode(source(file));
    for (const args of callArgs(code, /console\.(?:error|warn|log|info|debug)\(/g)) {
      const hit = exprsOf(args).match(unsafeLog)?.[0];
      if (hit) problems.push(`${file} logs "${hit}" (log only a fixed label and the error's code, message and hint)`);
    }
    if (selectsAll.test(code)) problems.push(`${file} selects every column (name the columns)`);
  }

  // (g) how the benefit is applied.
  const allSql = creatorsOf(/FREE_PERIOD|free_period/i);
  const profileFn = allSql.map(([, sql]) => sql.match(/CREATE (?:OR REPLACE )?FUNCTION public\.free_period_on_profile_insert\(\)[\s\S]*?\$fn\$[\s\S]*?\$fn\$/i)?.[0]).find(Boolean) ?? "";
  if (!/EXCEPTION WHEN OTHERS THEN/i.test(profileFn)) problems.push("free_period_on_profile_insert must swallow every error (EXCEPTION WHEN OTHERS): a registration must never fail because of a free period");
  const applyFn = allSql.map(([, sql]) => sql.match(/CREATE (?:OR REPLACE )?FUNCTION public\.free_period_apply\(p_period[\s\S]*?\$fn\$[\s\S]*?\$fn\$/i)?.[0]).filter(Boolean).at(-1) ?? "";
  if ((applyFn.match(/WHEN OTHERS THEN/gi) ?? []).length < 4) problems.push("free_period_apply must isolate every per-row grant and re-date with WHEN OTHERS (one poisoned row would abort the chunk and be first in line again on every sweep)");
  if (!allSql.some(([, sql]) => /CREATE TRIGGER profiles_free_period_grant\s+AFTER INSERT ON public\.profiles\b/i.test(sql))) problems.push("trigger profiles_free_period_grant must be AFTER INSERT ON public.profiles");
  for (const [file, sql] of allSql) {
    for (const m of sql.matchAll(/CREATE TRIGGER (\w+)[\s\S]*?\bON public\.(properties|services)\b[\s\S]*?EXECUTE FUNCTION public\.(\w+)\(/gi)) {
      if (/free_period/i.test(m[3])) problems.push(`${file}: trigger ${m[1]} runs ${m[3]} on public.${m[2]} (VIP is applied only by the sweep; the listing write path and its guard triggers stay untouched)`);
    }
    if (/INSERT INTO public\.transactions\b/i.test(sql) && /free_period/i.test(sql)) problems.push(`${file} writes a transactions row from a free-period migration (a free benefit is never revenue, C26)`);
    for (const m of sql.matchAll(/PERFORM public\._notify\(\s*[^,]+,\s*'([a-z_]+)'/gi)) {
      if (!["membership_admin_update", "promotion_admin_update"].includes(m[1])) problems.push(`${file} notifies with ${m[1]}; free periods use only the bell-only types membership_admin_update and promotion_admin_update`);
    }
    for (const m of sql.matchAll(/cron\.schedule\(\s*'(free-period-[a-z0-9-]+)'[\s\S]*?\$job\$([\s\S]*?)\$job\$/gi)) {
      if (/net\.http_|http_post/i.test(m[2])) problems.push(`${file}: cron job ${m[1]} must be SQL-only (an HTTP job needs a timeout and a secret, C4)`);
    }
  }
  if (!allSql.some(([, sql]) => /cron\.schedule\(\s*'free-period-apply-5min'/i.test(sql))) problems.push("no migration schedules the cron job free-period-apply-5min");
  if (!/"free-period-apply-5min"/.test(read("scripts/check-db-contracts.mjs"))) problems.push("scripts/check-db-contracts.mjs must list free-period-apply-5min among the active cron jobs (C4)");

  // (h) the pure module, the namespace, both menus, the page.
  if (/^\s*import\s+(?!type\b)|^\s*export\s+(?:\*|\{[^}]*\})\s+from\b/m.test(asCode(pure))) problems.push(`${pureFile} has a runtime import or re-export (it is loaded bare by scripts/unit: use import type)`);
  if (!/"AdminFreePeriods"/.test(source("src/i18n/namespaces.ts").match(/DASHBOARD_NAMESPACES = \[([\s\S]*?)\]/)?.[1] ?? "")) problems.push("AdminFreePeriods is missing from DASHBOARD_NAMESPACES (src/i18n/namespaces.ts)");
  for (const locale of ["ka", "en", "ru"]) {
    if (!JSON.parse(source(`messages/${locale}.json`) || "{}").AdminFreePeriods) problems.push(`messages/${locale}.json lacks the AdminFreePeriods namespace`);
  }
  for (const menu of ["src/components/layout/AdminSidebar.tsx", "src/components/layout/MobileBottomNav.tsx"]) {
    if (!/labelKey:\s*"freePeriods"[\s\S]{0,80}href:\s*"\/dashboard\/admin\/free-periods"/.test(source(menu))) problems.push(`${menu} must list the page (labelKey "freePeriods", href /dashboard/admin/free-periods)`);
  }
  if (/@\/lib\/supabase\/admin|getAdminStats/.test(source(pageFile))) problems.push(`${pageFile} must not import the service-role client or getAdminStats (every figure comes from ${apiDir})`);

  if (problems.length) problems.forEach((p) => fail(`C53: ${p}`));
  else ok(`C53: ${tables.length} period tables and ${entryPoints.length} entry points service_role only (RLS on, no policy), ${functions.length} functions pinned to search_path '' and closed to client roles; benefit/role/name/listing limits = CHECKs and enum; ${raised.size + 1} database tokens → ${codes.length} worded error codes; ${handlerCount} handlers start with requireAdmin, writers rate-limited under the admin's id; tables named only by the admin API; sign-up trigger swallows errors, no trigger on properties/services, cron SQL-only, no transactions row, bell-only notices; pure module bare; namespace, nav label and both menus wired`);
}

if (failures) {
  console.error(`\n${failures} contract check(s) failed.`);
  process.exit(1);
}
console.log("\nAll static contract checks passed.");

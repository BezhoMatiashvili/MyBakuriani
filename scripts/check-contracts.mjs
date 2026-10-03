// Static (repo-only) checks for the string-keyed couplings in
// docs/contracts.md. Nothing here needs a database or network; it runs
// in `prebuild` and in CI. The database-side half lives in
// scripts/check-db-contracts.mjs.
//
// Each check prints what it compared so a failure is self-explanatory.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

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
    const prodHosts = [...hostsModule.matchAll(/"([a-z0-9]{20}\.supabase\.co)"/g)].map((m) => m[1]);
    const derivesProject = /new URL\(process\.env\.NEXT_PUBLIC_SUPABASE_URL\)\.hostname/.test(hostsModule);
    if (hardCoded) fail("C6: a Supabase host is hard-coded or wildcarded in the CSP or remotePatterns; take it from src/lib/media-hosts.ts");
    else if (!sharedInCsp) fail("C6: img-src, media-src and connect-src (https + wss) must use SUPABASE_ORIGINS / SUPABASE_PROJECT_HOST from @/lib/media-hosts");
    else if (!sharedInConfig) fail("C6: next.config.ts remotePatterns must spread SUPABASE_MEDIA_HOSTS from ./src/lib/media-hosts");
    else if (prodHosts.length !== 1 || !derivesProject || /\*\.supabase\.co/.test(hostsModule))
      fail("C6: src/lib/media-hosts.ts must derive the project host from NEXT_PUBLIC_SUPABASE_URL and pin exactly one literal prod host (no wildcard)");
    else ok(`C6: CSP and remotePatterns share the Supabase hosts of media-hosts.ts (NEXT_PUBLIC_SUPABASE_URL + ${prodHosts[0]})`);

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
}

if (failures) {
  console.error(`\n${failures} contract check(s) failed.`);
  process.exit(1);
}
console.log("\nAll static contract checks passed.");

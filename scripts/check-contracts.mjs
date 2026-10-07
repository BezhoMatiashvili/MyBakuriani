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
  for (const file of ["src/app/[locale]/dashboard/guest/loadData.ts", "src/app/[locale]/dashboard/guest/bookings/page.tsx"]) {
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
  if (problems.length) problems.forEach((p) => fail(`C18: ${p}`));
  else
    ok(
      `C18: owner SMS credits are charged at submit (${subKinds.size} kinds, same as the delivery charge) and refunded only on uBill status 2/4`,
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

    // (8) the cleaner's SMS (C18 + C24, 2026-10-07): the mirror queues "MyBakuriani: <title>" only; this
    // trigger rewords that row with the apartment, the time and the link. It finds the row by the
    // notification it just inserted (RETURNING id), only while the mirror's free kind is still 'approved',
    // and in its own BEGIN … EXCEPTION block (a failure there must keep the bell, not roll it back).
    const insAt = trigBody.search(/INSERT\s+INTO\s+public\.notifications/i);
    const updAt = trigBody.search(/UPDATE\s+public\.sms_outbound/i);
    const notifVar = /RETURNING\s+id\s+INTO\s+(\w+)/i.exec(trigBody)?.[1];
    const updStmt = updAt === -1 ? "" : trigBody.slice(updAt, trigBody.indexOf(";", updAt));
    const handlersAfter = [...trigBody.matchAll(/EXCEPTION\s+WHEN\s+OTHERS/gi)].filter((m) => m.index > updAt).length;
    if (updAt === -1)
      fail(
        `C24: ${trigFile} no longer rewords the cleaner's SMS (UPDATE public.sms_outbound): a new call-out is texted as "MyBakuriani: ახალი გამოძახება" again, without the apartment, time or link`,
      );
    else if (
      !(updAt > insAt && insAt !== -1) ||
      !notifVar ||
      !new RegExp(`source_notification_id\\s*=\\s*${notifVar}\\b`, "i").test(updStmt) ||
      !/automation_kind\s*=\s*'notification'/i.test(updStmt) ||
      !/status\s*=\s*'approved'/i.test(updStmt)
    )
      fail(
        `C24: ${trigFile} must reword only the row the mirror queued for the notification it just inserted: UPDATE public.sms_outbound … WHERE source_notification_id = <the INSERT's RETURNING id> AND automation_kind = 'notification' AND status = 'approved'`,
      );
    else if (!/\bBEGIN\b/i.test(trigBody.slice(insAt, updAt)) || handlersAfter < 2)
      fail(
        `C24: ${trigFile} must reword the SMS inside its own BEGIN … EXCEPTION WHEN OTHERS block (otherwise a failure there rolls back the cleaner's bell notice too)`,
      );
    else if (!/'app\.site_url'/.test(trigBody) || !/!~\s*'\^https:\/\//.test(trigBody))
      fail(`C24: ${trigFile} must take the SMS link host from Vault 'app.site_url' and drop it unless it is a bare https:// origin`);
    else
      ok(`C24: ${trigFile} rewords the mirror's SMS of a new call-out (apartment, time, link) in its own exception block`);
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
  if (problems.length) problems.forEach((p) => fail(`C43: ${p}`));
  else ok("C43: OpenRouter key server-only; steps forced through show_steps + parseJevPlan; answers through the forced reply tool + parseReply, buttons are ids whose links the route builds; account facts under the user's own session; every quoted label exists on the site; no-retention on both calls; per-user/per-IP limits; Gemini Flash + Jev (Gemini Flash pool) only; snapshot carries no values");
}

// ---------------------------------------------------------------------------
// C44 — admin status management (memberships, VIP / discounts, company plans).
// (a) user_subscriptions_status_check = MEMBERSHIP_STATUSES; (b) each change
// RPC's c_actions = its TS action list (the route validates with the TS list,
// the RPC with its own); (c) the three RPCs and three views are revoked from
// PUBLIC, anon and authenticated where they are created and never granted back;
// (d) only the statuses API and its server helper read the views or name the
// RPCs; (e) the pure module has no "@/" import; (f) the *_admin_update
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
  const strangers = srcFiles.filter((f) => {
    if (f.startsWith(apiDir) || allowed.has(f)) return false;
    // A type lookup (Views["admin_…_v"]) reads nothing at runtime.
    const text = srcText.get(f).replace(/\["admin_[a-z_]+_v"\]/g, "");
    return namePattern.test(text);
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
// the capacity trigger's SQLSTATE into a 409; (f) ad-rotation.ts and
// ad-rate-card.ts stay free of "@/" imports (scripts/unit loads them bare and
// compares them with the migration and the placement registry).
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
  for (const pure of ["src/lib/ad-rotation.ts", "src/lib/ad-rate-card.ts"]) {
    if (/from "@\//.test(read(pure))) problems.push(`${pure} imports from "@/" (scripts/unit loads it bare)`);
  }
  if (problems.length) problems.forEach((p) => fail(`C47: ${p}`));
  else ok("C47: one draw site (useSlotRotation), sponsored grid cards placed by interleaveSponsored, mobile_strip mounted once, empty ad positions counted, admin ads routes validate SOV/priority/cap and map the capacity trigger");
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

if (failures) {
  console.error(`\n${failures} contract check(s) failed.`);
  process.exit(1);
}
console.log("\nAll static contract checks passed.");

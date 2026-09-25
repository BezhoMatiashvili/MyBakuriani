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
// C6 — every external image host in the CSP img-src is also in
// next.config.ts remotePatterns, and vice versa.
// ---------------------------------------------------------------------------
{
  const mw = read("src/middleware.ts");
  const imgSrc = mw.match(/"img-src ([^"]+)"/);
  if (!imgSrc) fail("C6: could not find the img-src directive in src/middleware.ts");
  else {
    const cspHosts = new Set(
      imgSrc[1]
        .split(/\s+/)
        .filter((t) => t.startsWith("https://"))
        .map((t) => t.replace(/^https:\/\//, "")),
    );
    const cfg = read("next.config.ts");
    const block = cfg.match(/remotePatterns:\s*\[([\s\S]*?)\n\s*\],/);
    if (!block) fail("C6: could not find remotePatterns in next.config.ts");
    else {
      const rpHosts = new Set([...block[1].matchAll(/hostname:\s*"([^"]+)"/g)].map((m) => m[1]));
      if (setEq(cspHosts, rpHosts)) ok(`C6: CSP img-src and remotePatterns agree on ${cspHosts.size} hosts`);
      else describeSetMismatch("C6 image hosts", cspHosts, "CSP img-src", rpHosts, "remotePatterns");
    }
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

if (failures) {
  console.error(`\n${failures} contract check(s) failed.`);
  process.exit(1);
}
console.log("\nAll static contract checks passed.");

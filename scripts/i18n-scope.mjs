// Import-graph-aware i18n namespace analyzer + build guard.
//
// Determines which message namespaces are needed by CLIENT components reachable
// from public routes vs dashboard-only routes, by traversing the import graph
// from each route entry and crossing "use client" boundaries. A component picks
// up a client namespace requirement only when it (or an importer) is a client
// module — this correctly catches components without a "use client" directive
// that become client via import (e.g. Footer lazy-imported by LocaleShell).
//
// Bias: toward INCLUSION. Over-including a namespace only wastes bytes; under-
// including breaks translations. Any ambiguity (no-arg useTranslations,
// useMessages, unresolved dynamic) makes the script abort the split.
//
// Modes:
//   node scripts/i18n-scope.mjs           -> print PUBLIC / DASHBOARD-ONLY sets
//   node scripts/i18n-scope.mjs --check    -> exit 1 if src/i18n/namespaces.ts is stale/unsafe

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";

const ROOT = resolve(process.cwd());
const SRC = join(ROOT, "src");
const APP = join(SRC, "app", "[locale]");

const exts = [".tsx", ".ts", ".jsx", ".js"];

function listFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...listFiles(p));
    else if (exts.some((x) => e.endsWith(x))) out.push(p);
  }
  return out;
}

function stripLeading(src) {
  // remove leading whitespace + line/block comments to find the first directive
  let i = 0;
  const s = src;
  for (;;) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s.startsWith("//", i)) {
      const nl = s.indexOf("\n", i);
      i = nl === -1 ? s.length : nl + 1;
    } else if (s.startsWith("/*", i)) {
      const end = s.indexOf("*/", i);
      i = end === -1 ? s.length : end + 2;
    } else break;
  }
  return s.slice(i);
}

const cache = new Map();
function parse(file) {
  if (cache.has(file)) return cache.get(file);
  let src = "";
  try {
    src = readFileSync(file, "utf8");
  } catch {
    const v = {
      isClient: false,
      imports: [],
      ns: [],
      noArg: false,
      useMessages: false,
    };
    cache.set(file, v);
    return v;
  }
  const head = stripLeading(src);
  const isClient = /^["']use client["']/.test(head);

  const imports = [];
  const reImp = /\bfrom\s+["']([^"']+)["']/g;
  const reDynImp = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  let m;
  while ((m = reImp.exec(src))) imports.push(m[1]);
  while ((m = reDynImp.exec(src))) imports.push(m[1]);

  const ns = new Set();
  const reNs = /useTranslations\(\s*["'`]([^"'`]+)["'`]/g;
  while ((m = reNs.exec(src))) ns.add(m[1].split(".")[0]);
  const noArg = /useTranslations\(\s*\)/.test(src);
  const useMessages = /\buseMessages\(/.test(src);

  const v = { isClient, imports, ns: [...ns], noArg, useMessages };
  cache.set(file, v);
  return v;
}

function resolveImport(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // external / node_modules
  // try direct file, then with extensions, then index
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const x of exts) if (existsSync(base + x)) return base + x;
  for (const x of exts) {
    const idx = join(base, "index" + x);
    if (existsSync(idx)) return idx;
  }
  return null;
}

const problems = [];

// Traverse from an entry file. `clientCtx` = are we already inside a client subtree.
// Collect namespaces of every file that is evaluated in client context.
function collect(entry) {
  const found = new Set();
  const seen = new Set(); // key: file|ctx
  function dfs(file, clientCtx) {
    const info = parse(file);
    const nowClient = clientCtx || info.isClient;
    const key = file + "|" + nowClient;
    if (seen.has(key)) return;
    seen.add(key);
    if (nowClient) {
      for (const n of info.ns) found.add(n);
      if (info.noArg)
        problems.push(
          `${file}: useTranslations() with no namespace (cannot safely split)`,
        );
      if (info.useMessages)
        problems.push(
          `${file}: useMessages() pulls all namespaces (cannot safely split)`,
        );
    }
    for (const spec of info.imports) {
      const r = resolveImport(spec, file);
      if (r) dfs(r, nowClient);
    }
  }
  dfs(entry, false);
  return found;
}

const routeEntries = listFiles(APP).filter((f) =>
  /(page|layout|template|loading|error|not-found)\.(tsx|ts)$/.test(f),
);
const publicEntries = routeEntries.filter(
  (f) => !f.includes(`${APP}/dashboard`) && !f.includes("/dashboard/"),
);
const dashEntries = routeEntries.filter((f) => f.includes("/dashboard/"));

const pub = new Set();
const dash = new Set();
for (const e of publicEntries) for (const n of collect(e)) pub.add(n);
for (const e of dashEntries) for (const n of collect(e)) dash.add(n);

const dashOnly = [...dash].filter((n) => !pub.has(n)).sort();
const publicArr = [...pub].sort();

if (process.argv.includes("--json")) {
  console.log(
    JSON.stringify(
      { public: publicArr, dashboardOnly: dashOnly, problems },
      null,
      2,
    ),
  );
} else if (process.argv.includes("--check")) {
  const nsFile = join(SRC, "i18n", "namespaces.ts");
  if (!existsSync(nsFile)) {
    console.error("[i18n-scope] src/i18n/namespaces.ts missing");
    process.exit(1);
  }
  const txt = readFileSync(nsFile, "utf8");
  const grab = (name) => {
    const m = txt.match(new RegExp(name + "\\s*=\\s*\\[([^\\]]*)\\]", "s"));
    if (!m) return [];
    return [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
  };
  // Only the PUBLIC set is risk-bearing: the root [locale] provider ships exactly
  // these namespaces, so any public-reachable client namespace MUST be listed.
  // The dashboard layout ships the full bundle, so it needs no enforcement.
  const declaredPublic = new Set(grab("PUBLIC_NAMESPACES"));
  const missingPublic = publicArr.filter((n) => !declaredPublic.has(n));
  let bad = false;
  if (problems.length) {
    console.error("[i18n-scope] ambiguous usages:\n  " + problems.join("\n  "));
    bad = true;
  }
  if (missingPublic.length) {
    console.error(
      "[i18n-scope] PUBLIC_NAMESPACES is missing client-reachable namespaces " +
        "(public pages would break). Add to src/i18n/namespaces.ts:\n  " +
        missingPublic.join(", "),
    );
    bad = true;
  }
  if (bad) process.exit(1);
  console.log(
    "[i18n-scope] OK — PUBLIC_NAMESPACES covers all public client usages.",
  );
} else {
  console.log("PUBLIC (" + publicArr.length + "):\n" + publicArr.join(", "));
  console.log(
    "\nDASHBOARD-ONLY (" + dashOnly.length + "):\n" + dashOnly.join(", "),
  );
  console.log(
    "\nPROBLEMS (" + problems.length + "):\n" + (problems.join("\n") || "none"),
  );
}

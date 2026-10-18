// Import-graph-aware i18n namespace analyzer + build guard.
//
// Determines which message namespaces are needed by CLIENT components under each
// NextIntlClientProvider scope (the root [locale] provider plus the nested
// providers in SCOPES below), by traversing the import graph from each route
// entry and crossing "use client" boundaries. A component picks
// up a client namespace requirement only when it (or an importer) is a client
// module — this correctly catches components without a "use client" directive
// that become client via import (e.g. Footer lazy-imported by LocaleShell).
//
// Bias: toward INCLUSION. Over-including a namespace only wastes bytes; under-
// including breaks translations. Any ambiguity (no-arg useTranslations,
// useMessages, unresolved dynamic) makes the script abort the split.
//
// Modes:
//   node scripts/i18n-scope.mjs           -> print the namespace set of every scope
//   node scripts/i18n-scope.mjs --json     -> same, as JSON
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
      nonLiteral: false,
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
  const nonLiteral = /useTranslations\(\s*[^"'`)\s]/.test(src);
  const useMessages = /\buseMessages\(/.test(src);

  const v = { isClient, imports, ns: [...ns], noArg, nonLiteral, useMessages };
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
      if (info.nonLiteral)
        problems.push(
          `${file}: useTranslations() with a non-literal namespace (cannot safely split)`,
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

// Provider scopes. A nested NextIntlClientProvider REPLACES the messages of the
// provider above it (it does not merge), so every client component rendered
// inside a scope must find its namespace in that scope's constant. `covers`
// maps a route entry (path relative to src/app/[locale]) to the scope whose
// provider renders it; everything else renders under the root [locale]
// provider and is checked against PUBLIC_NAMESPACES. A layout-level provider
// covers its whole directory (the layout itself, loading/error, every page); a
// page-level provider covers only that page, so the directory's loading.tsx
// and error.tsx stay under the root provider.
const SCOPES = [
  {
    constant: "DASHBOARD_NAMESPACES",
    provider: "dashboard/layout.tsx",
    covers: (rel) => rel.startsWith("dashboard/"),
  },
  {
    constant: "CREATE_NAMESPACES",
    provider: "create/layout.tsx",
    covers: (rel) => rel.startsWith("create/"),
  },
  {
    constant: "AUTH_NAMESPACES",
    provider: "auth/layout.tsx",
    covers: (rel) => rel.startsWith("auth/"),
  },
  {
    constant: "FAQ_NAMESPACES",
    provider: "faq/page.tsx",
    covers: (rel) => rel === "faq/page.tsx",
  },
  {
    constant: "MANUAL_REVIEW_NAMESPACES",
    provider: "review/[token]/page.tsx",
    covers: (rel) => rel === "review/[token]/page.tsx",
  },
  {
    constant: "SMS_CONSENT_NAMESPACES",
    provider: "sms-consent/[token]/page.tsx",
    covers: (rel) => rel === "sms-consent/[token]/page.tsx",
  },
];
const ROOT_SCOPE = "PUBLIC_NAMESPACES";

const routeEntries = listFiles(APP).filter((f) =>
  /(page|layout|template|loading|error|not-found)\.(tsx|ts)$/.test(f),
);
const sets = new Map([
  [ROOT_SCOPE, new Set()],
  ...SCOPES.map((sc) => [sc.constant, new Set()]),
]);
for (const entry of routeEntries) {
  const rel = entry
    .slice(APP.length + 1)
    .split("\\")
    .join("/");
  const scope = SCOPES.find((sc) => sc.covers(rel))?.constant ?? ROOT_SCOPE;
  for (const n of collect(entry)) sets.get(scope).add(n);
}
const sorted = Object.fromEntries(
  [...sets].map(([k, v]) => [k, [...v].sort()]),
);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ ...sorted, problems }, null, 2));
} else if (process.argv.includes("--check")) {
  const nsFile = join(SRC, "i18n", "namespaces.ts");
  if (!existsSync(nsFile)) {
    console.error("[i18n-scope] src/i18n/namespaces.ts missing");
    process.exit(1);
  }
  const txt = readFileSync(nsFile, "utf8");
  const grab = (name) => {
    const m = txt.match(new RegExp(name + "\\s*=\\s*\\[([^\\]]*)\\]", "s"));
    if (!m) return null;
    return [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
  };
  let bad = false;
  if (problems.length) {
    console.error("[i18n-scope] ambiguous usages:\n  " + problems.join("\n  "));
    bad = true;
  }
  for (const [constant, needed] of Object.entries(sorted)) {
    const declared = grab(constant);
    if (!declared) {
      console.error(
        `[i18n-scope] ${constant} is not declared in src/i18n/namespaces.ts`,
      );
      bad = true;
      continue;
    }
    const missing = needed.filter((n) => !declared.includes(n));
    if (missing.length) {
      console.error(
        `[i18n-scope] ${constant} is missing client-reachable namespaces ` +
          "(those strings would render as raw keys). Add to src/i18n/namespaces.ts:\n  " +
          missing.join(", "),
      );
      bad = true;
    }
  }
  for (const sc of SCOPES) {
    const file = join(APP, sc.provider);
    const src = existsSync(file) ? readFileSync(file, "utf8") : "";
    if (!src.includes("NextIntlClientProvider") || !src.includes(sc.constant)) {
      console.error(
        `[i18n-scope] ${sc.provider} must render a NextIntlClientProvider with ${sc.constant}`,
      );
      bad = true;
    }
  }
  if (bad) process.exit(1);
  console.log(
    `[i18n-scope] OK — ${[ROOT_SCOPE, ...SCOPES.map((sc) => sc.constant)].join(", ")} cover all client usages.`,
  );
} else {
  for (const [constant, list] of Object.entries(sorted)) {
    console.log(`${constant} (${list.length}):\n${list.join(", ")}\n`);
  }
  console.log(
    "PROBLEMS (" + problems.length + "):\n" + (problems.join("\n") || "none"),
  );
}

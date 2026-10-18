#!/usr/bin/env node
// Regression checks for the HTTP hardening in next.config.ts / src/middleware.ts
// (contracts C6, C28), run against a LOCAL production build only:
//   node scripts/check-http-hardening.mjs --base=http://localhost:3000
//   node scripts/check-http-hardening.mjs --base=http://localhost:3000 \
//     --detail=/apartments/5e120712-5fad-4ace-8c6f-108015df5d9f
//
// (a) an RSC request without `_rsc` never carries an edge-cacheable header
// (b) the same pages' plain HTML keeps its s-maxage (unchanged behaviour)
// (c) a client-router request (RSC + `_rsc`) still gets Flight data
// (d) /_next/image refuses a Supabase project that is not ours
// (e) /_next/image serves a configured-host photo from `/` at its own q, and
//     refuses an unlisted q
//
// Refuses any base other than http://localhost:<port>: never aim it at a
// deployment.

import { readFileSync } from "node:fs";

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
};

const base = arg("base") ?? "";
const detail =
  arg("detail") ?? "/apartments/5e120712-5fad-4ace-8c6f-108015df5d9f";

if (!/^http:\/\/localhost:\d+\/?$/.test(base)) {
  console.error(
    `Refusing --base=${base || "(missing)"}: only http://localhost:<port> is allowed.`,
  );
  process.exit(2);
}
if (!detail.startsWith("/")) {
  console.error(`--detail must be a path starting with "/", got ${detail}`);
  process.exit(2);
}
const origin = base.replace(/\/$/, "");

let failures = 0;

async function check(label, fn) {
  try {
    const { ok, info } = await fn();
    if (ok) {
      console.log(`  PASS ${label}: ${info}`);
    } else {
      console.error(`  FAIL ${label}: ${info}`);
      failures++;
    }
  } catch (err) {
    console.error(`  FAIL ${label}: request failed (${err.message})`);
    failures++;
  }
}

// Manual redirects: a redirect is judged by its own headers, never by the
// page it points at.
function get(path, headers = {}) {
  return fetch(origin + path, {
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
}

const cacheControl = (res) => res.headers.get("cache-control") ?? "(none)";
const contentType = (res) => res.headers.get("content-type") ?? "(none)";
const withRsc = (path, value) =>
  `${path}${path.includes("?") ? "&" : "?"}_rsc=${value}`;

// The configured Supabase host, so (e) exercises the project this build talks
// to rather than whichever host a restored row happens to point at.
function configuredSupabaseHost() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    try {
      const env = readFileSync(".env.local", "utf8");
      url = env
        .match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1]
        ?.trim()
        .replace(/^["']|["']$/g, "");
    } catch {
      // No .env.local: fall back to any Supabase host below.
    }
  }
  try {
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
}

const pages = ["/", "/apartments", detail, "/faq", "/pricing"];

console.log(`Checking ${origin}\n`);

console.log("(a) RSC request without _rsc is never edge-cacheable:");
for (const path of pages) {
  await check(path, async () => {
    const res = await get(path, { RSC: "1" });
    const cc = cacheControl(res);
    return {
      ok: /no-store|private/.test(cc) && !/s-maxage/.test(cc),
      info: `${res.status} cache-control=${cc}`,
    };
  });
}

console.log("\n(b) Plain HTML keeps its edge cache (unchanged):");
for (const path of pages) {
  await check(path, async () => {
    const res = await get(path);
    const cc = cacheControl(res);
    return {
      ok: contentType(res).startsWith("text/html") && /s-maxage/.test(cc),
      info: `${res.status} ${contentType(res)} cache-control=${cc}`,
    };
  });
}

console.log("\n(c) Client-router request (RSC + _rsc) still gets Flight:");
for (const path of pages) {
  await check(withRsc(path, "hardening"), async () => {
    const res = await get(withRsc(path, "hardening"), { RSC: "1" });
    return {
      ok:
        res.status < 500 &&
        (res.status !== 200 || contentType(res).startsWith("text/x-component")),
      info: `${res.status} ${contentType(res)}`,
    };
  });
}

console.log("\n(d) Image optimizer refuses a foreign Supabase project:");
await check("aaaaaaaaaaaaaaaaaaaa.supabase.co", async () => {
  const foreign =
    "https://aaaaaaaaaaaaaaaaaaaa.supabase.co/storage/v1/object/public/x/y.png";
  const res = await get(
    `/_next/image?url=${encodeURIComponent(foreign)}&w=64&q=75`,
  );
  const body = (await res.text()).slice(0, 120);
  return {
    ok: res.status === 400 && body.includes('"url" parameter is not allowed'),
    info: `${res.status} ${body}`,
  };
});

console.log("\n(e) Image optimizer: real photo at its own q; unlisted q:");
const host = configuredSupabaseHost();
let target = null;
try {
  const html = await (await get("/")).text();
  const candidates = [
    ...html.matchAll(
      /\/_next\/image\?url=([^"'\s&]+)(?:&amp;|&)w=(\d+)(?:&amp;|&)q=(\d+)/g,
    ),
  ]
    .map((m) => ({ url: decodeURIComponent(m[1]), w: m[2], q: m[3] }))
    .filter((c) => /^https:\/\/[^/]+\.supabase\.co\//.test(c.url));
  target =
    candidates.find((c) => new URL(c.url).hostname === host) ??
    (host ? null : (candidates[0] ?? null));
  if (!target) {
    console.error(
      `  FAIL discovery: no /_next/image URL for ${host ?? "a Supabase host"} on / (${candidates.length} Supabase candidates)`,
    );
    failures++;
  }
} catch (err) {
  console.error(`  FAIL discovery: could not fetch / (${err.message})`);
  failures++;
}
if (target) {
  const imagePath = (q) =>
    `/_next/image?url=${encodeURIComponent(target.url)}&w=${target.w}&q=${q}`;
  const label = `${new URL(target.url).hostname} w=${target.w}`;
  await check(`${label} q=${target.q}`, async () => {
    const res = await get(imagePath(target.q), { Accept: "image/webp,*/*" });
    await res.arrayBuffer();
    return {
      ok: res.status === 200 && contentType(res).startsWith("image/"),
      info: `${res.status} ${contentType(res)}`,
    };
  });
  await check(`${label} q=37`, async () => {
    const res = await get(imagePath(37), { Accept: "image/webp,*/*" });
    const body = (await res.text()).slice(0, 120);
    return {
      ok: res.status === 400,
      info: `${res.status} ${res.status === 400 ? body : contentType(res)}`,
    };
  });
}

console.log(`\n${failures} failure(s).`);
process.exit(failures > 0 ? 1 : 0);

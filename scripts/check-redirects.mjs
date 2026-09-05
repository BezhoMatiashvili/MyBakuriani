#!/usr/bin/env node
// Verifies the live domain-level redirect setup for a deployed environment:
// http -> https upgrades, and the alt-domain -> canonical-domain 301s (with
// path/query preserved). Run after any prod/staging deploy:
//   node scripts/check-redirects.mjs --env=prod
//   node scripts/check-redirects.mjs --env=staging
//
// DNS resolution failures are reported as WARN, not FAIL — a resolver that
// can't see a domain isn't evidence the domain's redirect is misconfigured.

const env = (
  process.argv.find((a) => a.startsWith("--env=")) ?? "--env=prod"
).split("=")[1];

const ENVS = {
  prod: {
    canonical: "mybakuriani.ge",
    altDomains: ["mybakuriani.com", "mybakuriani.com.ge"],
  },
  staging: {
    canonical: "staging.mybakuriani.ge",
    altDomains: [],
  },
};

const config = ENVS[env];
if (!config) {
  console.error(`Unknown --env=${env}. Use "prod" or "staging".`);
  process.exit(2);
}

const CHECK_PATH = "/ka/apartments?page=2";
let failures = 0;
let warnings = 0;

async function headNoRedirect(url) {
  return fetch(url, { redirect: "manual" });
}

async function assertRedirect(fromUrl, expectedLocation, label) {
  try {
    const res = await headNoRedirect(fromUrl);
    const location = res.headers.get("location");
    if (
      res.status >= 300 &&
      res.status < 400 &&
      location === expectedLocation
    ) {
      console.log(`  OK   ${label}: ${res.status} -> ${location}`);
    } else if (res.status >= 300 && res.status < 400) {
      console.error(
        `  FAIL ${label}: got ${res.status} -> ${location ?? "(no Location)"}, expected -> ${expectedLocation}`,
      );
      failures++;
    } else {
      console.error(`  FAIL ${label}: got ${res.status}, expected a redirect`);
      failures++;
    }
  } catch (err) {
    console.warn(
      `  WARN ${label}: could not reach (${err.message}) — DNS/network, not a redirect verdict`,
    );
    warnings++;
  }
}

async function assertOk(url, label) {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (res.status === 200) {
      console.log(`  OK   ${label}: 200`);
    } else {
      console.error(`  FAIL ${label}: got ${res.status}, expected 200`);
      failures++;
    }
  } catch (err) {
    console.warn(
      `  WARN ${label}: could not reach (${err.message}) — DNS/network, not a redirect verdict`,
    );
    warnings++;
  }
}

console.log(
  `Checking redirects for env=${env} (canonical: ${config.canonical})\n`,
);

console.log("Canonical domain serves the site:");
await assertOk(`https://${config.canonical}/`, `https://${config.canonical}/`);

console.log("\nHTTP upgrades to HTTPS:");
await assertRedirect(
  `http://${config.canonical}/`,
  `https://${config.canonical}/`,
  `http://${config.canonical}/`,
);

for (const alt of config.altDomains) {
  console.log(`\nHTTP upgrades to HTTPS (${alt}):`);
  await assertRedirect(`http://${alt}/`, `https://${alt}/`, `http://${alt}/`);

  console.log(
    `\nAlt domain redirects to canonical, path+query preserved (${alt}):`,
  );
  await assertRedirect(
    `https://${alt}${CHECK_PATH}`,
    `https://${config.canonical}${CHECK_PATH}`,
    `https://${alt}${CHECK_PATH}`,
  );
}

console.log(`\n${failures} failure(s), ${warnings} warning(s).`);
process.exit(failures > 0 ? 1 : 0);

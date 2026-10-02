import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_HOST,
  DEFAULT_SITE_URL,
  isIndexableSiteUrl,
  resolveSiteUrl,
} from "../../src/lib/seo/site.ts";
import {
  buildAlternates,
  pathForLocale,
} from "../../src/lib/seo/alternates.ts";
import {
  NON_INDEXABLE_PREFIXES,
  buildRobotsConfig,
} from "../../src/lib/seo/robots.ts";

const LOCALES = ["ka", "en", "ru"];

test("only the canonical host is indexable (fail-safe direction)", () => {
  assert.equal(CANONICAL_HOST, "mybakuriani.ge");
  assert.equal(isIndexableSiteUrl("https://mybakuriani.ge"), true);
  assert.equal(isIndexableSiteUrl("https://mybakuriani.ge/"), true);
  assert.equal(isIndexableSiteUrl("https://staging.mybakuriani.ge"), false);
  assert.equal(isIndexableSiteUrl("https://www.mybakuriani.ge"), false);
  assert.equal(isIndexableSiteUrl("https://mybakuriani.com"), false);
  assert.equal(isIndexableSiteUrl(DEFAULT_SITE_URL), false);
  assert.equal(isIndexableSiteUrl("http://localhost:3000"), false);
  assert.equal(isIndexableSiteUrl("not a url"), false);
  assert.equal(isIndexableSiteUrl(""), false);
});

test("resolveSiteUrl falls back to the non-indexable default and trims slashes", () => {
  assert.equal(resolveSiteUrl(undefined), DEFAULT_SITE_URL);
  assert.equal(resolveSiteUrl(null), DEFAULT_SITE_URL);
  assert.equal(resolveSiteUrl("   "), DEFAULT_SITE_URL);
  assert.equal(
    resolveSiteUrl("https://mybakuriani.ge/"),
    "https://mybakuriani.ge",
  );
  assert.equal(
    resolveSiteUrl(" https://staging.mybakuriani.ge// "),
    "https://staging.mybakuriani.ge",
  );
});

test("pathForLocale: default locale unprefixed, others prefixed, no trailing slash on the home", () => {
  assert.equal(pathForLocale("/", "ka", "ka"), "/");
  assert.equal(pathForLocale("/", "en", "ka"), "/en");
  assert.equal(pathForLocale("", "ru", "ka"), "/ru");
  assert.equal(pathForLocale("/apartments", "ka", "ka"), "/apartments");
  assert.equal(pathForLocale("/apartments", "en", "ka"), "/en/apartments");
  assert.equal(
    pathForLocale("/apartments/abc", "ru", "ka"),
    "/ru/apartments/abc",
  );
  assert.equal(pathForLocale("apartments", "en", "ka"), "/en/apartments");
});

test("buildAlternates: self canonical + every locale + x-default (= unprefixed)", () => {
  const home = buildAlternates({
    path: "/",
    locale: "en",
    locales: LOCALES,
    defaultLocale: "ka",
  });
  assert.equal(home.canonical, "/en");
  assert.deepEqual(home.languages, {
    ka: "/",
    en: "/en",
    ru: "/ru",
    "x-default": "/",
  });

  const detail = buildAlternates({
    path: "/hotels/abc",
    locale: "ka",
    locales: LOCALES,
    defaultLocale: "ka",
  });
  assert.equal(detail.canonical, "/hotels/abc");
  assert.deepEqual(detail.languages, {
    ka: "/hotels/abc",
    en: "/en/hotels/abc",
    ru: "/ru/hotels/abc",
    "x-default": "/hotels/abc",
  });
});

test("robots: a non-canonical host stays crawlable, so Google can read the noindex, and has no sitemap", () => {
  const cfg = buildRobotsConfig({
    locales: LOCALES,
    defaultLocale: "ka",
    indexable: false,
    siteUrl: "https://staging.mybakuriani.ge",
  });
  assert.deepEqual(cfg.rules.allow, ["/"]);
  assert.equal(cfg.rules.disallow, undefined);
  assert.equal(cfg.sitemap, undefined);
});

test("robots: the canonical host disallows every protected prefix in every locale", () => {
  const cfg = buildRobotsConfig({
    locales: LOCALES,
    defaultLocale: "ka",
    indexable: true,
    siteUrl: "https://mybakuriani.ge",
  });
  assert.equal(cfg.sitemap, "https://mybakuriani.ge/sitemap.xml");
  const disallow = cfg.rules.disallow ?? [];
  for (const prefix of NON_INDEXABLE_PREFIXES) {
    assert.ok(disallow.includes(prefix), `missing ${prefix}`);
    assert.ok(disallow.includes(`/en${prefix}`), `missing /en${prefix}`);
    assert.ok(disallow.includes(`/ru${prefix}`), `missing /ru${prefix}`);
  }
  assert.ok(disallow.includes("/api/"));
});

test("robots: /api/og/ stays allowed under the /api/ disallow (Facebook fetches og:image)", () => {
  const cfg = buildRobotsConfig({
    locales: LOCALES,
    defaultLocale: "ka",
    indexable: true,
    siteUrl: "https://mybakuriani.ge",
  });
  assert.ok(cfg.rules.allow.includes("/api/og/"));
  assert.ok(cfg.rules.allow.includes("/"));
});

test("protected prefixes carry no trailing slash (so /create is covered, not just /create/…)", () => {
  for (const prefix of NON_INDEXABLE_PREFIXES) {
    assert.match(prefix, /^\/[a-z-]+$/);
  }
  // The auth-gated cabinets middleware redirects must all be listed.
  assert.ok(NON_INDEXABLE_PREFIXES.includes("/dashboard"));
  assert.ok(NON_INDEXABLE_PREFIXES.includes("/create"));
});

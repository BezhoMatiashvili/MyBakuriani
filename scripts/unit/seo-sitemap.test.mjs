import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAlternates } from "../../src/lib/seo/alternates.ts";
import {
  SEO_IMAGE_QUALITY,
  SEO_IMAGE_WIDTH,
  SEO_MAX_IMAGES,
  optimizedImageUrls,
} from "../../src/lib/seo/image-url.ts";
import {
  SEED_LISTING_ID_PREFIXES,
  buildSitemapEntries,
  isSeedListingId,
  xmlEscape,
} from "../../src/lib/seo/sitemap.ts";

const SITE = "https://mybakuriani.ge";
const LOCALES = ["ka", "en", "ru"];
const alternatesFor = (path, locale) =>
  buildAlternates({ path, locale, locales: LOCALES, defaultLocale: "ka" });
const build = (pages) =>
  buildSitemapEntries({
    siteUrl: SITE,
    locales: LOCALES,
    alternatesFor,
    pages,
  });

test("every page becomes one entry per locale, each with the full hreflang set", () => {
  const entries = build([{ path: "/apartments" }]);
  assert.deepEqual(
    entries.map((e) => e.url),
    [`${SITE}/apartments`, `${SITE}/en/apartments`, `${SITE}/ru/apartments`],
  );
  const expected = {
    ka: `${SITE}/apartments`,
    en: `${SITE}/en/apartments`,
    ru: `${SITE}/ru/apartments`,
    "x-default": `${SITE}/apartments`,
  };
  for (const entry of entries) {
    assert.deepEqual(entry.alternates.languages, expected);
  }
});

test("the home page keeps the head's shape: / for ka, /en and /ru without a slash", () => {
  const entries = build([{ path: "/" }]);
  assert.deepEqual(
    entries.map((e) => e.url),
    [`${SITE}/`, `${SITE}/en`, `${SITE}/ru`],
  );
  assert.equal(entries[0].alternates.languages["x-default"], `${SITE}/`);
});

test("a sitemap url is the page's own canonical, resolved against the site", () => {
  const path = "/hotels/6f1c2d3e-0000-4000-8000-000000000001";
  const entries = build([{ path }]);
  LOCALES.forEach((locale, i) => {
    const { canonical } = alternatesFor(path, locale);
    assert.equal(entries[i].url, new URL(canonical, SITE).href);
  });
});

test("a Georgian blog slug is percent-encoded the way a page's canonical is", () => {
  const slug = "ბაკურიანი-გზამკვლევი-ab12";
  const [ka, en] = build([{ path: `/blog/${slug}` }]);
  assert.equal(ka.url, `${SITE}/blog/${encodeURIComponent(slug)}`);
  assert.equal(en.url, `${SITE}/en/blog/${encodeURIComponent(slug)}`);
  assert.ok(!/[^\x20-\x7e]/.test(ka.url), "the sitemap is ASCII");
  assert.ok(!/[^\x20-\x7e]/.test(en.alternates.languages.ru));
});

test("lastmod appears only when a page supplies a real one", () => {
  const when = new Date("2026-07-20T06:47:29.852Z");
  const [bare, dated] = [
    build([{ path: "/faq" }])[0],
    build([{ path: "/blog/x", lastModified: when }])[0],
  ];
  assert.equal("lastModified" in bare, false);
  assert.equal(dated.lastModified, when);
  assert.equal(
    "lastModified" in build([{ path: "/faq", lastModified: null }])[0],
    false,
  );
});

test("urls are XML-escaped because Next writes them into the file verbatim", () => {
  assert.equal(xmlEscape(`a&b<c>"d'e`), "a&amp;b&lt;c&gt;&quot;d&apos;e");
  const [entry] = build([{ path: "/blog/a&b" }]);
  assert.equal(entry.url, `${SITE}/blog/a&amp;b`);
  assert.ok(entry.alternates.languages.en.includes("a&amp;b"));
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;)/.test(entry.url));
});

test("photos become same-origin optimizer urls: https only, capped, plain text", () => {
  const storage = (n) =>
    `https://proj.supabase.co/storage/v1/object/public/property-photos/u/${n}.jpg`;
  const images = optimizedImageUrls(SITE, [
    "/placeholder.jpg",
    "http://insecure.example/x.jpg",
    null,
    storage(1),
    storage(2),
    storage(3),
    storage(4),
  ]);
  assert.equal(images.length, SEO_MAX_IMAGES);
  for (const image of images) {
    assert.ok(image.startsWith(`${SITE}/_next/image?url=`));
    assert.ok(image.endsWith(`&w=${SEO_IMAGE_WIDTH}&q=${SEO_IMAGE_QUALITY}`));
    assert.ok(!image.includes("&amp;"), "XML escaping is the sitemap's job");
  }
  const params = new URL(images[0]).searchParams;
  assert.equal(params.get("url"), storage(1));
  assert.equal(params.get("w"), String(SEO_IMAGE_WIDTH));
  assert.equal(params.get("q"), String(SEO_IMAGE_QUALITY));
  assert.deepEqual(optimizedImageUrls(SITE, [storage(1), storage(2)], 1), [
    images[0],
  ]);
});

test("sitemap images are escaped on the way out and ride along on every locale", () => {
  const raw = optimizedImageUrls(SITE, [
    "https://proj.supabase.co/storage/v1/object/public/b/u/1.jpg",
  ]);
  const entries = build([
    { path: "/apartments/a", images: raw },
    { path: "/apartments/b", images: [] },
  ]);
  assert.equal(entries.length, 6);
  for (const entry of entries.slice(0, 3)) {
    assert.deepEqual(entry.images, [xmlEscape(raw[0])]);
    assert.ok(entry.images[0].includes("&amp;w=1200&amp;q=75"));
    assert.ok(!/&(?!amp;)/.test(entry.images[0]), "no raw ampersand");
  }
  for (const entry of entries.slice(3)) assert.equal("images" in entry, false);
});

test("seeded QA and e2e fixture ids are recognised, real ids are not", () => {
  assert.deepEqual([...SEED_LISTING_ID_PREFIXES], ["facade00-", "aae2ff00-"]);
  assert.equal(isSeedListingId("facade00-0000-4000-8000-000000000001"), true);
  assert.equal(isSeedListingId("aae2ff00-cf01-4000-a000-000000000001"), true);
  assert.equal(isSeedListingId("02f58755-95d7-48ca-806f-d1c110b1aa03"), false);
});

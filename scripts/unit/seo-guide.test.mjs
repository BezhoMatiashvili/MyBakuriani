import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GUIDE_BASE_PATH,
  GUIDE_FACTS_CHECKED,
  GUIDE_PAGE_SOURCES,
  GUIDE_PATHS,
  GUIDE_SOURCES,
  GUIDE_ZONE_SLUGS,
  isGuideZoneSlug,
} from "../../src/lib/guide.ts";
import { FALLBACK_ZONES } from "../../src/lib/zones/types.ts";

const here = (path) => new URL(path, import.meta.url);
const LOCALES = ["ka", "en", "ru"];
const messages = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(readFileSync(here(`../../messages/${locale}.json`), "utf8")),
  ]),
);

// Prefix of `Guide.meta.<prefix>Title/Description` for each guide page.
const META_PREFIXES = [
  "hub",
  "gettingThere",
  "skiLifts",
  "didveli",
  "centri",
  "kokhta",
  "z25",
];

test("the guide has a hub, two topic pages and one page per zone", () => {
  assert.equal(GUIDE_PATHS.length, 3 + GUIDE_ZONE_SLUGS.length);
  assert.equal(new Set(GUIDE_PATHS).size, GUIDE_PATHS.length);
  assert.equal(GUIDE_PATHS[0], GUIDE_BASE_PATH);
  for (const path of GUIDE_PATHS) assert.ok(path.startsWith(GUIDE_BASE_PATH));
  for (const slug of GUIDE_ZONE_SLUGS) {
    assert.ok(GUIDE_PATHS.includes(`${GUIDE_BASE_PATH}/${slug}`));
  }
});

test("guide zones are the seeded zones and nothing else passes the check", () => {
  const seeded = FALLBACK_ZONES.map((zone) => zone.slug);
  for (const slug of GUIDE_ZONE_SLUGS) {
    assert.ok(seeded.includes(slug), `${slug} is a seeded zone`);
    assert.equal(isGuideZoneSlug(slug), true);
  }
  for (const other of ["etc", "", "__proto__", "Didveli", "didveli/"]) {
    assert.equal(isGuideZoneSlug(other), false, JSON.stringify(other));
  }
});

test("every page names real, https sources, each only once", () => {
  assert.deepEqual(
    Object.keys(GUIDE_PAGE_SOURCES).sort(),
    ["hub", "getting-there", "ski-lifts", ...GUIDE_ZONE_SLUGS].sort(),
  );
  for (const [page, ids] of Object.entries(GUIDE_PAGE_SOURCES)) {
    assert.ok(ids.length > 0, `${page} cites something`);
    assert.equal(new Set(ids).size, ids.length, `${page} repeats a source`);
    for (const id of ids) {
      const source = GUIDE_SOURCES[id];
      assert.ok(source, `${page}: unknown source ${id}`);
      assert.ok(source.url.startsWith("https://"), `${id} is https`);
      assert.ok(source.title.length > 0);
    }
  }
});

test("the fact-check date is a real day that is not in the future", () => {
  assert.match(GUIDE_FACTS_CHECKED, /^\d{4}-\d{2}-\d{2}$/);
  const checked = new Date(`${GUIDE_FACTS_CHECKED}T00:00:00Z`);
  assert.ok(!Number.isNaN(checked.getTime()));
  // The date is written in local (Tbilisi) time, which can be a day ahead of UTC.
  assert.ok(checked.getTime() <= Date.now() + 24 * 60 * 60 * 1000);
});

test("every locale carries the copy each guide page reads", () => {
  for (const locale of LOCALES) {
    const guide = messages[locale].Guide;
    const zones = messages[locale].Zones;
    assert.ok(guide, `${locale}: Guide namespace`);
    for (const key of [
      "crumb",
      "checked",
      "sourcesTitle",
      "faqTitle",
      "listingsMore",
      "alsoSee",
    ]) {
      assert.ok(guide[key], `${locale}: Guide.${key}`);
    }
    assert.ok(
      guide.checked.includes("{date}"),
      `${locale}: {date} placeholder`,
    );
    for (const prefix of META_PREFIXES) {
      assert.ok(guide.meta[`${prefix}Title`], `${locale}: ${prefix}Title`);
      assert.ok(guide.meta[`${prefix}Description`], `${locale}: ${prefix}Desc`);
    }
    for (const slug of GUIDE_ZONE_SLUGS) {
      for (const key of ["h1", "p1", "p2", "suitsP", "listingsTitle"]) {
        assert.ok(guide.zone[slug]?.[key], `${locale}: zone.${slug}.${key}`);
      }
      assert.ok(zones[slug]?.name, `${locale}: Zones.${slug}.name`);
      assert.ok(
        zones[slug]?.description,
        `${locale}: Zones.${slug}.description`,
      );
    }
    assert.ok(guide.zone.suitsTitle);
    assert.ok(guide.gettingThere.crumb && guide.skiLifts.crumb);
    assert.ok(messages[locale].Seo.region, `${locale}: Seo.region`);
  }
});

test("meta titles and descriptions fit a search result", () => {
  for (const locale of LOCALES) {
    for (const [key, text] of Object.entries(messages[locale].Guide.meta)) {
      const limit = key.endsWith("Title") ? 70 : 160;
      assert.ok(
        text.length <= limit,
        `${locale}: Guide.meta.${key} is ${text.length} characters (max ${limit})`,
      );
    }
  }
});

test("every tag in the guide copy has a link target, and tags are balanced", () => {
  const source = readFileSync(
    here("../../src/components/seo/richLinks.tsx"),
    "utf8",
  );
  const block = source.slice(
    source.indexOf("const TAG_HREFS = {"),
    source.indexOf("} as const;"),
  );
  const hrefs = Object.fromEntries(
    [...block.matchAll(/^\s+(\w+): "([^"]+)",/gm)].map((m) => [m[1], m[2]]),
  );
  // `mta` is the one external tag, defined beside the internal ones.
  const known = new Set([...Object.keys(hrefs), "mta"]);

  for (const [tag, href] of Object.entries(hrefs)) {
    if (href.startsWith(GUIDE_BASE_PATH)) {
      assert.ok(
        GUIDE_PATHS.includes(href),
        `${tag} -> ${href} is a guide page`,
      );
    }
  }

  for (const locale of LOCALES) {
    const walk = (node, path) => {
      if (typeof node === "string") {
        const opens = [...node.matchAll(/<(\w+)>/g)].map((m) => m[1]);
        const closes = [...node.matchAll(/<\/(\w+)>/g)].map((m) => m[1]);
        assert.deepEqual(opens, closes, `${locale}: ${path} tags balance`);
        for (const tag of opens) {
          assert.ok(known.has(tag), `${locale}: ${path} uses unknown <${tag}>`);
        }
      } else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
          walk(value, `${path}.${key}`);
        }
      }
    };
    walk(messages[locale].Guide, "Guide");
  }
});

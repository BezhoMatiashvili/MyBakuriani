import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GUIDE_EDIT_GROUPS,
  GUIDE_LOCALES,
  applyGuideOverrides,
  flattenGuide,
  guideKeyGroup,
  sanitizeGuideOverrides,
} from "../../src/lib/guide-overrides.ts";

const here = (path) => new URL(path, import.meta.url);
const guides = Object.fromEntries(
  GUIDE_LOCALES.map((locale) => [
    locale,
    JSON.parse(readFileSync(here(`../../messages/${locale}.json`), "utf8"))
      .Guide,
  ]),
);
const defaults = Object.fromEntries(
  GUIDE_LOCALES.map((locale) => [locale, flattenGuide(guides[locale])]),
);
const TAGS = ["apartments", "guide", "skiLifts", "mta"];
const formats = () => true;
const sanitize = (input, formatsCleanly = formats) =>
  sanitizeGuideOverrides(input, defaults, TAGS, formatsCleanly);

// A key whose catalog text carries a link tag, and one whose does not.
const richKey = Object.keys(defaults.ka).find((key) =>
  /<\w+>/.test(defaults.ka[key]),
);
const plainKey = "hub.h1";

test("the catalogs flatten to the same keys in every locale", () => {
  const ka = Object.keys(defaults.ka).sort();
  assert.ok(ka.length > 50);
  assert.deepEqual(Object.keys(defaults.en).sort(), ka);
  assert.deepEqual(Object.keys(defaults.ru).sort(), ka);
  assert.ok(ka.includes("zone.25ianebi.h1"));
  assert.ok(richKey, "some guide text carries a link");
});

test("a changed text is kept; empty or unchanged texts are dropped", () => {
  const { overrides, problems } = sanitize({
    ka: { [plainKey]: "  ახალი\n სათაური ", "hub.lead": "" },
    en: { [plainKey]: defaults.en[plainKey] },
  });
  assert.deepEqual(problems, []);
  assert.deepEqual(overrides, {
    ka: { [plainKey]: "ახალი სათაური" },
    en: {},
    ru: {},
  });
});

test("a catalog text with odd whitespace is not stored back as an edit", () => {
  const spaced = {
    ...defaults,
    ka: { ...defaults.ka, [plainKey]: "ორი  სიტყვა\nაქ" },
  };
  const { overrides, problems } = sanitizeGuideOverrides(
    { ka: { [plainKey]: "ორი სიტყვა აქ" } },
    spaced,
    TAGS,
    formats,
  );
  assert.deepEqual(problems, []);
  assert.deepEqual(overrides.ka, {});
});

test("unknown keys, prototype keys and non-string values are refused", () => {
  const input = JSON.parse(
    '{"ka":{"hub.nope":"x","__proto__":"x","constructor":"x","hub.lead":5}}',
  );
  const { overrides, problems } = sanitize(input);
  assert.deepEqual(overrides.ka, {});
  assert.deepEqual(
    problems.map((p) => p.key).sort(),
    ["__proto__", "constructor", "hub.nope"].sort(),
  );
  assert.ok(problems.every((p) => p.problem === "unknown_key"));
});

test("link tags: only known tags, balanced, and only where the catalog has one", () => {
  const ok = sanitize({ ka: { [richKey]: "იხ. <guide>გზამკვლევი</guide>." } });
  assert.deepEqual(ok.problems, []);

  const cases = [
    [richKey, "<guide>ღია", "unbalanced_tags"],
    [richKey, "<script>x</script>", "tag_not_allowed"],
    [plainKey, "<guide>x</guide>", "tag_not_allowed"],
  ];
  for (const [key, text, expected] of cases) {
    const { overrides, problems } = sanitize({ ka: { [key]: text } });
    assert.deepEqual(overrides.ka, {}, text);
    assert.equal(problems[0]?.problem, expected, text);
  }
});

test("the {date} argument must stay and no other may appear", () => {
  assert.ok(defaults.ka.checked.includes("{date}"));
  assert.equal(
    sanitize({ ka: { checked: "შემოწმდა {date}" } }).problems.length,
    0,
  );
  assert.equal(
    sanitize({ ka: { checked: "შემოწმდა" } }).problems[0]?.problem,
    "placeholders",
  );
  assert.equal(
    sanitize({ ka: { [plainKey]: "{name} სათაური" } }).problems[0]?.problem,
    "placeholders",
  );
});

test("meta titles and descriptions keep the search-result limits", () => {
  const title = sanitize({ ka: { "meta.hubTitle": "ა".repeat(71) } });
  assert.equal(title.problems[0]?.problem, "too_long");
  const description = sanitize({
    ka: { "meta.hubDescription": "ა".repeat(161) },
  });
  assert.equal(description.problems[0]?.problem, "too_long");
  assert.equal(
    sanitize({ ka: { "meta.hubTitle": "ა".repeat(70) } }).problems.length,
    0,
  );
});

test("a text the ICU check rejects is refused as invalid_format", () => {
  const { overrides, problems } = sanitize(
    { ka: { [plainKey]: "სათაური" } },
    () => false,
  );
  assert.deepEqual(overrides.ka, {});
  assert.equal(problems[0]?.problem, "invalid_format");
});

test("overrides replace existing leaves only and never mutate the catalog", () => {
  const before = JSON.stringify(guides.ka);
  const merged = applyGuideOverrides(guides.ka, {
    "zone.25ianebi.h1": "ახალი",
    "hub.missing": "x",
    hub: "x",
    "hub.h1.deeper": "x",
  });
  assert.equal(merged.zone["25ianebi"].h1, "ახალი");
  assert.equal(merged.hub.missing, undefined);
  assert.equal(typeof merged.hub, "object");
  assert.equal(merged.hub.h1, guides.ka.hub.h1);
  assert.equal(JSON.stringify(guides.ka), before);
});

test("every catalog key lands on an admin tab", () => {
  const groups = new Set(GUIDE_EDIT_GROUPS);
  for (const key of Object.keys(defaults.ka)) {
    assert.ok(groups.has(guideKeyGroup(key)), key);
  }
  assert.equal(guideKeyGroup("hub.lead"), "hub");
  assert.equal(guideKeyGroup("meta.gettingThereTitle"), "gettingThere");
  assert.equal(guideKeyGroup("meta.z25Description"), "25ianebi");
  assert.equal(guideKeyGroup("zone.kokhta.p1"), "kokhta");
  assert.equal(guideKeyGroup("zone.suitsTitle"), "common");
  assert.equal(guideKeyGroup("checked"), "common");
  // Every page tab has texts to edit.
  for (const group of GUIDE_EDIT_GROUPS) {
    assert.ok(
      Object.keys(defaults.ka).some((key) => guideKeyGroup(key) === group),
      group,
    );
  }
});

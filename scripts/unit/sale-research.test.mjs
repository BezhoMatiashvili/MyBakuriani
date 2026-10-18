import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SALE_RESEARCH_DEFAULT_VALUES,
  SALE_RESEARCH_LOCALES,
  SALE_RESEARCH_TEXT_FIELDS,
  SALE_RESEARCH_TEXT_KEYS,
  SALE_RESEARCH_TEXT_LIMITS,
  SALE_RESEARCH_VALUE_MAX,
  emptySaleResearch,
  resolveSaleResearch,
  sanitizeSaleResearch,
} from "../../src/lib/sale-research.ts";

const catalogs = Object.fromEntries(
  SALE_RESEARCH_LOCALES.map((locale) => [
    locale,
    JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")),
  ]),
);

test("every field's default text exists in all three catalogs", () => {
  for (const locale of SALE_RESEARCH_LOCALES) {
    const sale = catalogs[locale].Landing.sale;
    for (const field of SALE_RESEARCH_TEXT_FIELDS) {
      const key = SALE_RESEARCH_TEXT_KEYS[field];
      assert.equal(typeof sale[key], "string", `${locale} Landing.sale.${key}`);
      assert.ok(sale[key].length <= SALE_RESEARCH_TEXT_LIMITS[field]);
    }
  }
});

test("the admin page labels every field and problem in all three catalogs", () => {
  const problems = [
    "unknown_locale",
    "unknown_field",
    "not_text",
    "too_long",
    "invalid_share",
  ];
  for (const locale of SALE_RESEARCH_LOCALES) {
    const ns = catalogs[locale].AdminSaleResearch;
    for (const field of [
      ...SALE_RESEARCH_TEXT_FIELDS,
      "roiValue",
      "entryValue",
      "smallShare",
    ]) {
      assert.equal(typeof ns.fields[field], "string", `${locale} ${field}`);
    }
    for (const p of problems) assert.equal(typeof ns.problems[p], "string");
  }
});

test("clean input is kept, whitespace collapsed, empty fields dropped", () => {
  const { content, problems } = sanitizeSaleResearch({
    texts: {
      ka: { title: "  ახალი\n  სათაური ", body: "   " },
      en: { eyebrow: "Q1 2026 research", title: null },
      ru: {},
    },
    values: { roiValue: " 8-12% ", entryValue: "", smallShare: "64.25" },
  });
  assert.deepEqual(problems, []);
  assert.deepEqual(content.texts.ka, { title: "ახალი სათაური" });
  assert.deepEqual(content.texts.en, { eyebrow: "Q1 2026 research" });
  assert.deepEqual(content.texts.ru, {});
  assert.deepEqual(content.values, { roiValue: "8-12%", smallShare: 64.3 });
});

test("unknown locales, fields and prototype keys are refused", () => {
  const input = JSON.parse(
    '{"texts":{"de":{"title":"x"},"ka":{"__proto__":"x","constructor":"y","heading":"z"}},"values":{"toString":"1"},"extra":1}',
  );
  const { content, problems } = sanitizeSaleResearch(input);
  assert.deepEqual(content, emptySaleResearch());
  const seen = problems.map((p) => `${p.locale ?? ""}:${p.field}:${p.problem}`);
  assert.ok(seen.includes(":extra:unknown_field"));
  assert.ok(seen.includes("de:texts:unknown_locale"));
  assert.ok(seen.includes("ka:__proto__:unknown_field"));
  assert.ok(seen.includes("ka:constructor:unknown_field"));
  assert.ok(seen.includes("ka:heading:unknown_field"));
  assert.ok(seen.includes(":toString:unknown_field"));
});

test("length caps and non-text values are problems", () => {
  const { content, problems } = sanitizeSaleResearch({
    texts: {
      ka: {
        eyebrow: "x".repeat(SALE_RESEARCH_TEXT_LIMITS.eyebrow + 1),
        title: 42,
      },
    },
    values: { roiValue: "9".repeat(SALE_RESEARCH_VALUE_MAX + 1) },
  });
  assert.deepEqual(content, emptySaleResearch());
  assert.deepEqual(problems.map((p) => `${p.field}:${p.problem}`).sort(), [
    "eyebrow:too_long",
    "roiValue:too_long",
    "title:not_text",
  ]);
});

test("the share must be a number from 0 to 100", () => {
  for (const bad of [-1, 100.1, "abc", Number.NaN, Infinity, true, [50]]) {
    const { problems } = sanitizeSaleResearch({ values: { smallShare: bad } });
    assert.deepEqual(
      problems.map((p) => p.problem),
      ["invalid_share"],
      String(bad),
    );
  }
  for (const good of [0, 100, "55", 78.6]) {
    const { content, problems } = sanitizeSaleResearch({
      values: { smallShare: good },
    });
    assert.deepEqual(problems, []);
    assert.equal(content.values.smallShare, Number(good));
  }
  // Empty means "standard".
  assert.deepEqual(
    sanitizeSaleResearch({ values: { smallShare: "" } }).content.values,
    {},
  );
});

test("non-object input is treated as no edits", () => {
  for (const input of [null, undefined, "x", 5, []]) {
    assert.deepEqual(sanitizeSaleResearch(input), {
      content: emptySaleResearch(),
      problems: [],
    });
  }
});

test("resolve falls back per field and per locale", () => {
  const catalog = (locale) => (key) => `${locale}:${key}`;
  const content = {
    texts: { ka: { title: "ახალი" }, en: {}, ru: { body: "Новый" } },
    values: { entryValue: "<$900", smallShare: 0 },
  };

  const ka = resolveSaleResearch(content, "ka", catalog("ka"));
  assert.equal(ka.title, "ახალი");
  assert.equal(ka.body, "ka:researchBody");
  assert.equal(ka.roiValue, SALE_RESEARCH_DEFAULT_VALUES.roiValue);
  assert.equal(ka.entryValue, "<$900");
  assert.equal(ka.smallShare, 0);

  // An edit in one language never leaks into another.
  const en = resolveSaleResearch(content, "en", catalog("en"));
  assert.equal(en.title, "en:whyInvest");
  const ru = resolveSaleResearch(content, "ru", catalog("ru"));
  assert.equal(ru.body, "Новый");
  assert.equal(ru.title, "ru:whyInvest");

  // No stored row: everything is the default.
  const none = resolveSaleResearch(null, "ka", catalog("ka"));
  assert.equal(none.eyebrow, "ka:researchEyebrow");
  assert.equal(none.smallShare, SALE_RESEARCH_DEFAULT_VALUES.smallShare);
});

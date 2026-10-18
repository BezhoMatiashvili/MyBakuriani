import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FAQ_ANSWER_MAX,
  FAQ_LOCALES,
  FAQ_MAX_ITEMS,
  FAQ_QUESTION_MAX,
  FAQ_TITLE_MAX,
  faqFromCatalog,
  normalizeFaqAnswer,
  normalizeFaqLine,
  resolveFaq,
  sanitizeFaqContent,
} from "../../src/lib/faq.ts";

const here = (path) => new URL(path, import.meta.url);
const catalogs = Object.fromEntries(
  FAQ_LOCALES.map((locale) => [
    locale,
    JSON.parse(readFileSync(here(`../../messages/${locale}.json`), "utf8")).FAQ,
  ]),
);
const defaults = faqFromCatalog(catalogs);

const texts = (ka, en = "", ru = "") => ({ ka, en, ru });
const item = (id, question, answer) => ({
  id,
  question: texts(question),
  answer: texts(answer),
});
const content = (items) => ({
  title: texts("Title"),
  subtitle: texts(""),
  items,
});
const kinds = (input) =>
  sanitizeFaqContent(input).problems.map(
    (p) => `${p.field}:${p.locale ?? "-"}:${p.problem}`,
  );

test("the catalog text, as content, passes every rule the admin route holds an edit to", () => {
  assert.ok(defaults.items.length >= 5);
  assert.deepEqual(sanitizeFaqContent(defaults).problems, []);
  // Saving the untouched catalog text changes nothing.
  assert.deepEqual(sanitizeFaqContent(defaults).content, defaults);
});

test("the defaults carry every item in every locale, in the ka catalog's order", () => {
  assert.deepEqual(
    defaults.items.map((entry) => entry.id),
    Object.keys(catalogs.ka.items),
  );
  for (const entry of defaults.items) {
    for (const locale of FAQ_LOCALES) {
      assert.ok(entry.question[locale], `${entry.id} question ${locale}`);
      assert.ok(entry.answer[locale], `${entry.id} answer ${locale}`);
    }
  }
  for (const locale of FAQ_LOCALES) {
    assert.ok(defaults.title[locale], `title ${locale}`);
    assert.ok(defaults.subtitle[locale], `subtitle ${locale}`);
  }
});

test("an answer keeps its line breaks, a question and a title collapse them", () => {
  assert.equal(
    normalizeFaqAnswer("  one  \r\n\r\n\r\n\r\ntwo\nthree \n"),
    "one\n\ntwo\nthree",
  );
  assert.equal(normalizeFaqLine("  a \n  b\t c "), "a b c");
  const { content: out } = sanitizeFaqContent(
    content([item("a", "Q\nline", "Para 1\n\nPara 2")]),
  );
  assert.equal(out.items[0].question.ka, "Q line");
  assert.equal(out.items[0].answer.ka, "Para 1\n\nPara 2");
});

test("braces, angle brackets and quotes are ordinary characters", () => {
  const text = "50% {discount} <b>bold</b> it's";
  const { content: out, problems } = sanitizeFaqContent(
    content([item("a", text, text)]),
  );
  assert.deepEqual(problems, []);
  assert.equal(out.items[0].question.ka, text);
  assert.equal(out.items[0].answer.ka, text);
});

test("the Georgian title, question and answer are required; the other locales and the subtitle are not", () => {
  assert.deepEqual(kinds(content([item("a", "Q", "A")])), []);
  assert.deepEqual(
    kinds({ ...content([item("a", "Q", "A")]), title: texts(" ") }),
    ["title:ka:required"],
  );
  assert.deepEqual(kinds(content([item("a", " ", "A")])), [
    "question:ka:required",
  ]);
  assert.deepEqual(kinds(content([item("a", "Q", "")])), [
    "answer:ka:required",
  ]);
});

test("limits are inclusive and measured after tidying", () => {
  const edge = (n) => "x".repeat(n);
  assert.deepEqual(
    kinds({
      ...content([item("a", edge(FAQ_QUESTION_MAX), edge(FAQ_ANSWER_MAX))]),
      title: texts(edge(FAQ_TITLE_MAX)),
    }),
    [],
  );
  assert.deepEqual(
    kinds(content([item("a", edge(FAQ_QUESTION_MAX + 1), "A")])),
    ["question:ka:too_long"],
  );
  assert.deepEqual(
    kinds(content([item("a", "Q", `${edge(FAQ_ANSWER_MAX)}\n\n\n\n   `)])),
    [],
  );
  const long = item("a", "Q", "A");
  long.answer.ru = edge(FAQ_ANSWER_MAX + 1);
  assert.deepEqual(kinds(content([long])), ["answer:ru:too_long"]);
});

test("the list needs 1 to FAQ_MAX_ITEMS questions with distinct, plain ids", () => {
  assert.deepEqual(kinds(content([])), ["items:-:required"]);
  const many = Array.from({ length: FAQ_MAX_ITEMS + 1 }, (_, i) =>
    item(`q${i}`, "Q", "A"),
  );
  assert.deepEqual(kinds(content(many)), ["items:-:too_many"]);
  assert.deepEqual(kinds(content(many.slice(0, FAQ_MAX_ITEMS))), []);
  assert.deepEqual(
    kinds(content([item("a", "Q", "A"), item("a", "Q2", "A2")])),
    ["items:-:duplicate_id"],
  );
  for (const id of ["", "has space", "a/b", "x".repeat(41), "ქართული"]) {
    assert.deepEqual(kinds(content([item(id, "Q", "A")])), [
      "items:-:invalid_id",
    ]);
  }
});

test("anything that is not the expected shape is refused, never thrown on", () => {
  for (const input of [null, undefined, 5, "text", [], {}, { items: "x" }]) {
    assert.ok(sanitizeFaqContent(input).problems.length > 0);
  }
  const { content: out } = sanitizeFaqContent({
    title: { ka: 5, en: null },
    items: [null, "x", { id: "a", question: { ka: ["Q"] }, answer: 3 }],
  });
  assert.deepEqual(out.title, texts(""));
});

test("a visitor sees their locale's text, else the Georgian one", () => {
  const set = {
    title: texts("სათაური", "Title", ""),
    subtitle: texts("ქვე", "", ""),
    items: [
      {
        id: "full",
        question: texts("კ1", "Q1", "В1"),
        answer: texts("პ1", "A1", "О1"),
      },
      {
        id: "half",
        question: texts("კ2", "Q2", "В2"),
        answer: texts("პ2", "", "О2"),
      },
    ],
  };
  const en = resolveFaq(set, "en");
  assert.equal(en.title, "Title");
  assert.equal(en.subtitle, "ქვე");
  assert.deepEqual(en.items, [
    { id: "full", question: "Q1", answer: "A1" },
    // The question without its answer is not mixed with the Georgian answer.
    { id: "half", question: "კ2", answer: "პ2" },
  ]);
  const ru = resolveFaq(set, "ru");
  assert.equal(ru.title, "სათაური");
  assert.equal(ru.items[1].question, "В2");
  assert.equal(resolveFaq(set, "ka").items[0].question, "კ1");
});

test("the catalog's own page renders from the defaults in each locale", () => {
  for (const locale of FAQ_LOCALES) {
    const faq = resolveFaq(defaults, locale);
    assert.equal(faq.title, catalogs[locale].title);
    assert.equal(faq.items.length, Object.keys(catalogs.ka.items).length);
    assert.equal(
      faq.items[0].question,
      catalogs[locale].items.booking.question,
    );
    assert.equal(faq.items[0].answer, catalogs[locale].items.booking.answer);
  }
});

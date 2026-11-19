import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BLOG_LOCALES,
  blogPostLocales,
  hasBlogTranslation,
  localizeBlogPost,
} from "../../src/lib/blog/translations.ts";

const georgian = {
  title: "ბაკურიანი ზამთარში",
  excerpt: "მოკლე აღწერა",
  content: "<p>ქართული ტექსტი</p>",
};

test("the locales are Georgian first, then the translations", () => {
  assert.deepEqual([...BLOG_LOCALES], ["ka", "en", "ru"]);
});

test("an untranslated post reads Georgian in every locale", () => {
  for (const locale of BLOG_LOCALES) {
    assert.deepEqual(localizeBlogPost(georgian, locale), {
      ...georgian,
      lang: "ka",
    });
  }
  assert.deepEqual(blogPostLocales(georgian), ["ka"]);
});

test("a translated locale gets its own title, excerpt and body, and says so", () => {
  const post = {
    ...georgian,
    title_en: " Bakuriani in winter ",
    excerpt_en: "Short",
    content_en: "<p>English text</p>",
  };
  assert.deepEqual(localizeBlogPost(post, "en"), {
    title: "Bakuriani in winter",
    excerpt: "Short",
    content: "<p>English text</p>",
    lang: "en",
  });
  // Russian is not translated: the whole Georgian post, never a mix.
  assert.equal(localizeBlogPost(post, "ru").lang, "ka");
  assert.equal(localizeBlogPost(post, "ru").title, georgian.title);
  assert.equal(localizeBlogPost(post, "ka").content, georgian.content);
  assert.deepEqual(blogPostLocales(post), ["ka", "en"]);
});

test("a translation without an excerpt never borrows the Georgian one", () => {
  const post = {
    ...georgian,
    title_ru: "Бакуриани",
    excerpt_ru: "  ",
    content_ru: "<p>Текст</p>",
  };
  assert.equal(localizeBlogPost(post, "ru").excerpt, null);
  assert.equal(localizeBlogPost(post, "ru").lang, "ru");
});

test("half a translation (title or body alone, or blank) does not count", () => {
  const cases = [
    { title_en: "Only a title", content_en: null },
    { title_en: null, content_en: "<p>Only a body</p>" },
    { title_en: "   ", content_en: "<p>Body</p>" },
    { title_en: "Title", content_en: "" },
  ];
  for (const extra of cases) {
    const post = { ...georgian, ...extra };
    assert.equal(hasBlogTranslation(post, "en"), false, JSON.stringify(extra));
    assert.equal(localizeBlogPost(post, "en").lang, "ka");
    assert.deepEqual(blogPostLocales(post), ["ka"]);
  }
});

test("an unknown locale reads Georgian", () => {
  assert.equal(localizeBlogPost(georgian, "de").lang, "ka");
});

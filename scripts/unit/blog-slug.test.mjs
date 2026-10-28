import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  blogSlug,
  blogSlugToken,
  isLatinSlug,
} from "../../src/lib/blog-slug.ts";
import {
  FIXTURE_BLOG_GEORGIAN_SLUG,
  FIXTURE_BLOG_SLUG,
} from "../../e2e/helpers/fixture-manifest.mjs";

// The owner's shared link (2026-10-27) was 693 characters: the Georgian title,
// percent-encoded, then `--mvibu9t4`. This is the plan's example of its new
// form (the post is on prod only, so its full title was not read here).
test("the owner's example: Latin words, the same token", () => {
  assert.equal(
    blogSlug("გადატხრილი ქუჩები აღარ დახვდებათ დამსვენებლებს", "mvibu9t4"),
    "gadatkhrili-kuchebi-aghar-dakhvdebat-damsveneblebs-mvibu9t4",
  );
});

test("each Mkhedruli letter has its national romanization, no apostrophes", () => {
  assert.equal(
    blogSlug("აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰ", "mvibu9t4"),
    "abgdevztiklmnopzhrstupkghqshchtsdztschkhjh-mvibu9t4",
  );
});

test("Mtavruli capitals give the same words", () => {
  const capitals = "ბაკურიანის სეზონი".toUpperCase();
  assert.notEqual(capitals, "ბაკურიანის სეზონი");
  assert.equal(blogSlug(capitals, "mvibu9t4"), "bakurianis-sezoni-mvibu9t4");
});

// The staging posts' titles (dry run of scripts/blog-latin-slugs.mjs,
// 2026-10-28): the old slugs had deleted the dash ("20262027",
// "ბორჯომიბაკურიანის").
test("punctuation becomes one hyphen and accents go, so no slug has a dot", () => {
  assert.equal(
    blogSlug("ბაკურიანში 2026–2027 წლის ზამთრის სეზონი", "mv14emfz"),
    "bakurianshi-2026-2027-tslis-zamtris-sezoni-mv14emfz",
  );
  assert.equal(
    blogSlug("ბორჯომი–ბაკურიანის „კუკუშკა“ დეკემბერში დაბრუნდება", "mv1aq4dh"),
    "borjomi-bakurianis-kukushka-dekembershi-dabrundeba-mv1aq4dh",
  );
  assert.equal(
    blogSlug("Café «Crème» v2.0 / 2026", "mvibu9t4"),
    "cafe-creme-v2-0-2026-mvibu9t4",
  );
});

test("the words stop at 60 characters, on a word boundary", () => {
  const a = "a".repeat(29);
  assert.equal(
    blogSlug(`${a} ${"b".repeat(30)}`, "mvibu9t4"),
    `${a}-${"b".repeat(30)}-mvibu9t4`,
  );
  assert.equal(blogSlug(`${a} ${"b".repeat(31)}`, "mvibu9t4"), `${a}-mvibu9t4`);
  assert.equal(
    blogSlug(
      "გადატხრილი ქუჩები აღარ დახვდებათ დამსვენებლებს ბაკურიანში",
      "mvibu9t4",
    ),
    "gadatkhrili-kuchebi-aghar-dakhvdebat-damsveneblebs-mvibu9t4",
  );
  // One word longer than that is cut inside the word.
  assert.equal(
    blogSlug("x".repeat(70), "mvibu9t4"),
    `${"x".repeat(60)}-mvibu9t4`,
  );
});

test("a title with nothing to romanize becomes post", () => {
  assert.equal(blogSlug(" — !? ", "mvibu9t4"), "post-mvibu9t4");
  assert.equal(blogSlug("Новости", "mvibu9t4"), "post-mvibu9t4");
});

test("the token is read from old Georgian and new Latin slugs alike", () => {
  assert.equal(blogSlugToken("გადატხრილი-ქუჩები--mvibu9t4"), "mvibu9t4");
  assert.equal(blogSlugToken("gadatkhrili-kuchebi-mvibu9t4"), "mvibu9t4");
  assert.equal(blogSlugToken(FIXTURE_BLOG_SLUG), "e2e00001");
  assert.equal(blogSlugToken(FIXTURE_BLOG_GEORGIAN_SLUG), "e2e00002");
  for (const none of [
    "e2e-test-blog",
    "aae2ff00-7001-4000-a000-000000000001",
    "post-MVIBU9T4",
    "mvibu9t4",
  ]) {
    assert.equal(blogSlugToken(none), null, none);
  }
});

test("isLatinSlug accepts what blogSlug writes and nothing else", () => {
  for (const title of [
    "გადატხრილი ქუჩები",
    "ბაკურიანის სეზონი".toUpperCase(),
    "Café 2026/2027",
    "!!!",
    "ა ".repeat(50),
  ]) {
    const slug = blogSlug(title, "mvibu9t4");
    assert.ok(isLatinSlug(slug), slug);
    assert.equal(blogSlugToken(slug), "mvibu9t4", slug);
  }
  assert.ok(isLatinSlug(FIXTURE_BLOG_SLUG));
  // The e2e post that stands for one the backfill has not renamed yet.
  assert.equal(isLatinSlug(FIXTURE_BLOG_GEORGIAN_SLUG), false);
  for (const bad of [
    "",
    "გადატხრილი-mvibu9t4",
    "a--b",
    "-a",
    "a-",
    "a.b",
    "A-b",
    "a b",
  ]) {
    assert.equal(isLatinSlug(bad), false, bad);
  }
});

// scripts/blog-latin-slugs.mjs and these tests import the module directly (C29).
test("the module has no imports and no raw combining marks", () => {
  const source = readFileSync(
    new URL("../../src/lib/blog-slug.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /^\s*import\b|\bfrom\s+["']/m);
  const raw = [...source].filter((ch) => {
    const code = ch.codePointAt(0);
    return code >= 0x300 && code <= 0x36f;
  });
  assert.deepEqual(raw, []);
});

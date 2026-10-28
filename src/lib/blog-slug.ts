// Blog post URLs (C40): `/blog/<words>-<token>`, Latin words romanized from the
// title plus the base36 time token the post was created with. Deliberately
// free of imports so scripts/unit and scripts/blog-latin-slugs.mjs load this
// one copy of the romanization (C29).

/**
 * The national romanization of the 33 Mkhedruli letters, ა..ჰ (U+10D0..U+10F0)
 * in alphabet order, without its apostrophes.
 */
const ROMAN =
  "a b g d e v z t i k l m n o p zh r s t u p k gh q sh ch ts dz ts ch kh j h".split(
    " ",
  );
const FIRST_LETTER = 0x10d0;

/** Longest words part; whole words are kept, a single longer word is cut. */
const MAX_WORDS = 60;

/**
 * `<words>-<token>`: lowercase (which also folds Mtavruli capitals into
 * Mkhedruli), accents stripped, Georgian romanized, and every run of anything
 * else one hyphen, so "2026/2027" stays readable and a slug never has a dot
 * (C8's matcher skips a last segment with one).
 */
export function blogSlug(title: string, token: string): string {
  let words = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u10d0-\u10f0]/g, (ch) => ROMAN[ch.charCodeAt(0) - FIRST_LETTER])
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (words.length > MAX_WORDS) {
    const end = words.lastIndexOf("-", MAX_WORDS);
    words = words.slice(0, end > 0 ? end : MAX_WORDS);
  }
  return `${words || "post"}-${token}`;
}

/**
 * The 8-character token a slug ends in, old Georgian slugs included
 * (`…--mvibu9t4`): it finds a post whose words changed.
 */
export function blogSlugToken(slug: string): string | null {
  return /-([0-9a-z]{8})$/.exec(slug)?.[1] ?? null;
}

/** A slug in the Latin form blogSlug writes. */
export function isLatinSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

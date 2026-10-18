// The /faq page's copy as an admin edits it (C40). The catalog's `FAQ`
// namespace (messages/<locale>.json) is the starting text; from
// /dashboard/admin/faq an admin can change the title, the subtitle and the
// questions, add, remove and reorder them, in every locale. The whole set is
// stored in site_settings `faq_content` and, once saved, replaces the catalog
// text. Texts are plain strings handed to the page as props, never through an
// ICU message, so braces and angle brackets are ordinary characters. Pure module
// (no "@/" imports) so scripts/unit/faq.test.mjs imports it.

export const FAQ_CONTENT_SETTING_KEY = "faq_content";

export const FAQ_LOCALES = ["ka", "en", "ru"] as const;
export type FaqLocale = (typeof FAQ_LOCALES)[number];

export type FaqTexts = Record<FaqLocale, string>;

// Type aliases, not interfaces: the content is stored as jsonb, and only an
// alias is assignable to the generated `Json` type.
export type FaqItem = {
  id: string;
  question: FaqTexts;
  answer: FaqTexts;
};

export type FaqContent = {
  title: FaqTexts;
  subtitle: FaqTexts;
  items: FaqItem[];
};

export const FAQ_MAX_ITEMS = 40;
export const FAQ_TITLE_MAX = 120;
export const FAQ_SUBTITLE_MAX = 240;
export const FAQ_QUESTION_MAX = 240;
export const FAQ_ANSWER_MAX = 4000;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

export type FaqField = "title" | "subtitle" | "items" | "question" | "answer";
export type FaqProblemKind =
  "required" | "too_long" | "too_many" | "invalid_id" | "duplicate_id";

export interface FaqProblem {
  field: FaqField;
  problem: FaqProblemKind;
  locale?: FaqLocale;
  // The item a question/answer/id problem belongs to.
  id?: string;
}

export function emptyFaqTexts(): FaqTexts {
  return { ka: "", en: "", ru: "" };
}

// Title, subtitle and question sit in one line of the page: whitespace
// (line breaks included) collapses to single spaces.
export function normalizeFaqLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

// An answer renders with `whitespace-pre-line`, so a line break is a line
// break and a blank line a paragraph: keep them, tidy the rest.
export function normalizeFaqAnswer(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textsOf(
  value: unknown,
  normalize: (text: string) => string,
): FaqTexts {
  const source = objectOf(value);
  const out = emptyFaqTexts();
  for (const locale of FAQ_LOCALES) {
    const raw = source[locale];
    out[locale] = typeof raw === "string" ? normalize(raw) : "";
  }
  return out;
}

function checkTexts(
  texts: FaqTexts,
  field: FaqField,
  max: number,
  requireKa: boolean,
  problems: FaqProblem[],
  id?: string,
) {
  for (const locale of FAQ_LOCALES) {
    const base = id === undefined ? { field, locale } : { field, locale, id };
    if (texts[locale].length > max) {
      problems.push({ ...base, problem: "too_long" });
    } else if (locale === "ka" && requireKa && !texts.ka) {
      problems.push({ ...base, problem: "required" });
    }
  }
}

// Turns stored or submitted input into clean content. `problems` lists what the
// admin route refuses with a 400; the page reader treats any problem as "use
// the catalog text" so a bad stored row can never break the page.
export function sanitizeFaqContent(input: unknown): {
  content: FaqContent;
  problems: FaqProblem[];
} {
  const source = objectOf(input);
  const problems: FaqProblem[] = [];

  const title = textsOf(source.title, normalizeFaqLine);
  const subtitle = textsOf(source.subtitle, normalizeFaqLine);
  checkTexts(title, "title", FAQ_TITLE_MAX, true, problems);
  checkTexts(subtitle, "subtitle", FAQ_SUBTITLE_MAX, false, problems);

  const rawItems = Array.isArray(source.items) ? source.items : [];
  if (rawItems.length === 0)
    problems.push({ field: "items", problem: "required" });
  if (rawItems.length > FAQ_MAX_ITEMS) {
    problems.push({ field: "items", problem: "too_many" });
  }

  const seen = new Set<string>();
  const items: FaqItem[] = [];
  for (const raw of rawItems.slice(0, FAQ_MAX_ITEMS)) {
    const entry = objectOf(raw);
    const id = typeof entry.id === "string" ? entry.id : "";
    if (!ID_PATTERN.test(id)) {
      problems.push({ field: "items", problem: "invalid_id" });
      continue;
    }
    if (seen.has(id)) {
      problems.push({ field: "items", problem: "duplicate_id", id });
      continue;
    }
    seen.add(id);
    const question = textsOf(entry.question, normalizeFaqLine);
    const answer = textsOf(entry.answer, normalizeFaqAnswer);
    checkTexts(question, "question", FAQ_QUESTION_MAX, true, problems, id);
    checkTexts(answer, "answer", FAQ_ANSWER_MAX, true, problems, id);
    items.push({ id, question, answer });
  }

  return { content: { title, subtitle, items }, problems };
}

function leaf(node: unknown, ...path: string[]): string {
  let current = node;
  for (const key of path) current = objectOf(current)[key];
  return typeof current === "string" ? current : "";
}

// The catalog's `FAQ` namespace of every locale as content. The question ids
// are the catalog's item keys, in the ka catalog's order.
export function faqFromCatalog(
  catalogs: Record<FaqLocale, unknown>,
): FaqContent {
  const content: FaqContent = {
    title: emptyFaqTexts(),
    subtitle: emptyFaqTexts(),
    items: [],
  };
  for (const locale of FAQ_LOCALES) {
    content.title[locale] = leaf(catalogs[locale], "title");
    content.subtitle[locale] = leaf(catalogs[locale], "subtitle");
  }
  const ids = Object.keys(objectOf(objectOf(catalogs.ka).items));
  for (const id of ids) {
    const item: FaqItem = {
      id,
      question: emptyFaqTexts(),
      answer: emptyFaqTexts(),
    };
    for (const locale of FAQ_LOCALES) {
      item.question[locale] = leaf(catalogs[locale], "items", id, "question");
      item.answer[locale] = leaf(catalogs[locale], "items", id, "answer");
    }
    content.items.push(item);
  }
  return content;
}

export interface ResolvedFaq {
  title: string;
  subtitle: string;
  items: { id: string; question: string; answer: string }[];
}

// What a visitor in `locale` sees. A text missing in that locale shows the
// Georgian one; a question counts as present only together with its answer.
export function resolveFaq(
  content: FaqContent,
  locale: FaqLocale,
): ResolvedFaq {
  return {
    title: content.title[locale] || content.title.ka,
    subtitle: content.subtitle[locale] || content.subtitle.ka,
    items: content.items.map((item) => {
      const own = item.question[locale] && item.answer[locale];
      const from = own ? locale : "ka";
      return {
        id: item.id,
        question: item.question[from],
        answer: item.answer[from],
      };
    }),
  };
}

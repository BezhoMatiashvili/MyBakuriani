// Admin edits of the resort guide's copy (C40). The guide's text is
// messages/<locale>.json `Guide.*`; from /dashboard/admin/guide an admin can
// replace any of those strings per locale. Only the strings that differ from
// the catalog are stored, in site_settings `guide_content` as
// { ka: { "hub.lead": "…" }, en: {…}, ru: {…} }, and merged over the catalog
// when a guide page renders. Pure module (no "@/" imports) so
// scripts/unit/guide-overrides.test.mjs imports it; the ICU parse check needs
// next-intl, so callers pass it in as `formatsCleanly`.

export const GUIDE_CONTENT_SETTING_KEY = "guide_content";

export const GUIDE_LOCALES = ["ka", "en", "ru"] as const;
export type GuideLocale = (typeof GUIDE_LOCALES)[number];

// Dotted key ("zone.didveli.h1") -> text.
export type GuideTexts = Record<string, string>;
export type GuideOverrides = Record<GuideLocale, GuideTexts>;

// The same limits scripts/unit/seo-guide.test.mjs holds the catalog copy to.
export const GUIDE_META_TITLE_MAX = 70;
export const GUIDE_META_DESCRIPTION_MAX = 160;
export const GUIDE_TEXT_MAX = 2000;

export type GuideTextProblem =
  | "unknown_key"
  | "too_long"
  | "unbalanced_tags"
  | "tag_not_allowed"
  | "placeholders"
  | "invalid_format";

export interface GuideProblem {
  locale: GuideLocale;
  key: string;
  problem: GuideTextProblem;
}

export function emptyGuideOverrides(): GuideOverrides {
  return { ka: {}, en: {}, ru: {} };
}

// Every string leaf of a catalog's `Guide` namespace, keyed by its dotted
// path, in catalog order (the order the admin page lists them).
export function flattenGuide(node: unknown, prefix = ""): GuideTexts {
  const out: GuideTexts = {};
  if (!node || typeof node !== "object") return out;
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[path] = value;
    else Object.assign(out, flattenGuide(value, path));
  }
  return out;
}

export function guideTextLimit(key: string): number {
  if (key.startsWith("meta.") && key.endsWith("Title")) {
    return GUIDE_META_TITLE_MAX;
  }
  if (key.startsWith("meta.") && key.endsWith("Description")) {
    return GUIDE_META_DESCRIPTION_MAX;
  }
  return GUIDE_TEXT_MAX;
}

function openingTags(text: string): string[] {
  return [...text.matchAll(/<(\w+)>/g)].map((m) => m[1]);
}

function closingTags(text: string): string[] {
  return [...text.matchAll(/<\/(\w+)>/g)].map((m) => m[1]);
}

function placeholders(text: string): string {
  return [...new Set([...text.matchAll(/\{\s*(\w+)\s*\}/g)].map((m) => m[1]))]
    .sort()
    .join(",");
}

// A key may carry link tags only when its catalog text already does in some
// locale: those are the keys the pages render with t.rich. Any other key goes
// through plain t(), where a tag would fail to format.
export function guideKeyTakesTags(defaults: string[]): boolean {
  return defaults.some((text) => openingTags(text).length > 0);
}

// Whitespace (line breaks included) collapses to single spaces: every guide
// text renders inside one element, so a typed line break would not show.
export function normalizeGuideText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function checkGuideText(
  key: string,
  text: string,
  defaults: string[],
  knownTags: readonly string[],
): GuideTextProblem | null {
  if (text.length > guideTextLimit(key)) return "too_long";
  const opens = openingTags(text);
  const closes = closingTags(text);
  if (opens.join(",") !== closes.join(",")) return "unbalanced_tags";
  if (opens.length > 0) {
    if (!guideKeyTakesTags(defaults)) return "tag_not_allowed";
    if (opens.some((tag) => !knownTags.includes(tag))) return "tag_not_allowed";
  }
  // `{date}` in `checked` must stay; nothing else may add an argument.
  if (placeholders(text) !== placeholders(defaults[0] ?? "")) {
    return "placeholders";
  }
  return null;
}

// Turns stored or submitted input into clean overrides. A key must exist in
// that locale's catalog; an empty value or one equal to the catalog text is
// dropped (no override). `problems` lists what was refused: the admin route
// answers 400 with it, the page reader just leaves those texts at the default.
export function sanitizeGuideOverrides(
  input: unknown,
  defaults: Record<GuideLocale, GuideTexts>,
  knownTags: readonly string[],
  formatsCleanly: (text: string, key: string) => boolean,
): { overrides: GuideOverrides; problems: GuideProblem[] } {
  const overrides = emptyGuideOverrides();
  const problems: GuideProblem[] = [];
  const source = (input ?? {}) as Record<string, unknown>;

  for (const locale of GUIDE_LOCALES) {
    const texts = source[locale];
    if (!texts || typeof texts !== "object") continue;
    const catalog = defaults[locale];
    for (const [key, raw] of Object.entries(texts)) {
      if (typeof raw !== "string") continue;
      if (!Object.hasOwn(catalog, key)) {
        problems.push({ locale, key, problem: "unknown_key" });
        continue;
      }
      const text = normalizeGuideText(raw);
      if (!text || text === normalizeGuideText(catalog[key])) continue;
      const keyDefaults = GUIDE_LOCALES.map((l) => defaults[l][key]).filter(
        (value): value is string => typeof value === "string",
      );
      const problem =
        checkGuideText(key, text, keyDefaults, knownTags) ??
        (formatsCleanly(text, key) ? null : "invalid_format");
      if (problem) {
        problems.push({ locale, key, problem });
        continue;
      }
      overrides[locale][key] = text;
    }
  }
  return { overrides, problems };
}

// A copy of a catalog's `Guide` tree with the overridden leaves replaced. Only
// existing string leaves are replaced, so an override can never add a key or
// turn a branch into a string.
export function applyGuideOverrides<T>(guide: T, texts: GuideTexts): T {
  const copy = structuredClone(guide);
  for (const [key, text] of Object.entries(texts)) {
    const parts = key.split(".");
    let node: unknown = copy;
    for (const part of parts.slice(0, -1)) {
      if (!node || typeof node !== "object" || !Object.hasOwn(node, part)) {
        node = null;
        break;
      }
      node = (node as Record<string, unknown>)[part];
    }
    const leaf = parts[parts.length - 1];
    if (
      node &&
      typeof node === "object" &&
      Object.hasOwn(node, leaf) &&
      typeof (node as Record<string, unknown>)[leaf] === "string"
    ) {
      (node as Record<string, unknown>)[leaf] = text;
    }
  }
  return copy;
}

// Which admin tab a key belongs to: the page it is shown on, or "common" for
// the strings every guide page shares. The SEO title and description sit with
// their page.
export const GUIDE_EDIT_GROUPS = [
  "hub",
  "gettingThere",
  "skiLifts",
  "didveli",
  "centri",
  "kokhta",
  "25ianebi",
  "common",
] as const;
export type GuideEditGroup = (typeof GUIDE_EDIT_GROUPS)[number];

const META_PREFIX_GROUP: Record<string, GuideEditGroup> = {
  hub: "hub",
  gettingThere: "gettingThere",
  skiLifts: "skiLifts",
  didveli: "didveli",
  centri: "centri",
  kokhta: "kokhta",
  z25: "25ianebi",
};

export function guideKeyGroup(key: string): GuideEditGroup {
  const parts = key.split(".");
  const [head, second] = parts;
  if (head === "hub" || head === "gettingThere" || head === "skiLifts") {
    return head;
  }
  if (head === "zone" && parts.length > 2) {
    return (GUIDE_EDIT_GROUPS as readonly string[]).includes(second)
      ? (second as GuideEditGroup)
      : "common";
  }
  if (head === "meta" && second) {
    const prefix = second.replace(/(Title|Description)$/, "");
    return META_PREFIX_GROUP[prefix] ?? "common";
  }
  return "common";
}

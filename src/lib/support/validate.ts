// Deterministic checks of the support assistant's output (C43), run on every
// answer and every plan before the browser sees them. What can be fixed
// without a model is fixed here (a step's action that does not fit its
// element, a step whose words name another element, a "done" that ends on a
// Next button, suggestions in the wrong language); what cannot is returned as
// problems, and server.ts asks the model once more with them.
//
// Pure, like plan.ts: no runtime imports, so scripts/unit and the evals run
// exactly these checks.

import type {
  JevAction,
  JevPlan,
  PageElement,
  SupportLocale,
  SupportReply,
} from "./plan";

const GEORGIAN = /\p{Script=Georgian}/gu;
const LATIN = /\p{Script=Latin}/gu;
const CYRILLIC = /\p{Script=Cyrillic}/gu;
// Quoted names: „…“, “…”, "…", «…», and '…' only around Georgian text and
// not after a letter, so an English apostrophe never opens one.
const QUOTED =
  /„([^“”"\n]{2,80})[“”"]|“([^”\n]{2,80})”|"([^"\n]{2,80})"|«([^»\n]{2,80})»|(?<![A-Za-z\u0400-\u04ff\u10a0-\u10ff])['‘](?=[^'‘’\n]{2,80}['’])([^'‘’\n]*[\u10a0-\u10ff][^'‘’\n]*)['’]/g;
// Latin words every language uses as they are (brands, acronyms, the name).
const SHARED_WORDS =
  /\b(?:[A-Z][A-Z0-9]+|Smart Match|Google|WhatsApp|Keepz|MyBakuriani|Baku|Facebook|Instagram|Mapbox|iPhone)\b/g;
// "1 500 ₾" (the site prints thousands with a space) or "1500 GEL".
const AMOUNT =
  /(\d{1,3}(?:[ \u00a0]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(?:₾|GEL|ლარ|лари|lari)/giu;
const PATH = /(?:^|[\s(„"«“])(\/[a-z][a-z0-9-]*(?:\/[a-z0-9:-]+)*)/g;
const NEXT_LABEL =
  /^(?:გაგრძელება|შემდეგი|next|continue|далее|продолжить|дальше)(?:\s|$)/i;

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

/** The quoted names in a text, trimmed. */
export function quotedLabels(text: string): string[] {
  return [...text.matchAll(QUOTED)]
    .map((m) => (m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? "").trim())
    .filter(Boolean);
}

/** A label as compared: lower case, one space, no trailing "*" or punctuation. */
export function normLabel(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\s*:.,!?-]+$/, "")
    .trim();
}

/**
 * Whether a quoted name refers to a label: the same, the label with a
 * Georgian case ending ("შევსებაზე", "ბინებში"), or its start (at least 4
 * letters: "ბინები" for "ბინები (გაქირავება)").
 */
export function labelMatches(quoted: string, label: string): boolean {
  const q = normLabel(quoted);
  const l = normLabel(label);
  if (!q || !l) return false;
  if (q === l) return true;
  if (q.length >= 4 && l.startsWith(q)) return true;
  if (q.startsWith(l) && q.length - l.length <= 6) return true;
  // A final vowel dropped before the ending (ბინები -> ბინებში).
  const stem = l.length > 4 ? l.slice(0, -1) : "";
  return Boolean(stem) && q.startsWith(stem) && q.length - stem.length <= 6;
}

/** Not written in the request's language (quotes and shared words aside). */
export function languageProblem(
  locale: SupportLocale,
  text: string,
): string | null {
  const plain = text.replace(QUOTED, " ").replace(SHARED_WORDS, " ");
  const ka = count(plain, GEORGIAN);
  const la = count(plain, LATIN);
  const ru = count(plain, CYRILLIC);
  if (ka + la + ru === 0) return null;
  if (locale === "ka" && ka <= la + ru) return "not written in Georgian";
  if (locale === "en" && la <= ka + ru) return "not written in English";
  if (locale === "ru" && ru <= ka + la) return "not written in Russian";
  return null;
}

/** Every GEL amount in a text, as numbers. */
export function amountsIn(text: string): number[] {
  return [...text.matchAll(AMOUNT)].map((m) =>
    Number(m[1].replace(/[ \u00a0]/g, "").replace(",", ".")),
  );
}

/** Amounts in the text that are not among the known ones. */
export function amountProblem(
  text: string,
  known: ReadonlySet<number>,
): string | null {
  const unknown = amountsIn(text).filter((n) => !known.has(n));
  return unknown.length
    ? `amounts not on the price list: ${unknown.join(", ")} ₾`
    : null;
}

export type ReplyCheckContext = {
  locale: SupportLocale;
  /** Every name the site shows (knowledge, buttons, prices, zones, screen). */
  labels: readonly string[];
  /** Prices, facts and amounts the user or the screen mentioned. */
  amounts: ReadonlySet<number>;
  /** Pages that exist. */
  paths: ReadonlySet<string>;
  /** What the user wrote in this chat, lower case: their own words may be quoted back. */
  said?: string;
};

/**
 * Checks an answer: quoted Georgian names must exist on the site or the
 * user's screen, amounts must be listed, the text must be in the user's
 * language and name only real pages. Suggestions in another language are
 * dropped rather than reported.
 */
export function checkReply(
  reply: SupportReply,
  ctx: ReplyCheckContext,
): { reply: SupportReply; problems: string[] } {
  const problems: string[] = [];
  const language = languageProblem(ctx.locale, reply.text);
  if (language) problems.push(`the answer is ${language}`);
  const unknown = quotedLabels(reply.text).filter(
    (label) =>
      /\p{Script=Georgian}/u.test(label) &&
      !ctx.said?.includes(normLabel(label)) &&
      !ctx.labels.some((known) => labelMatches(label, known)),
  );
  if (unknown.length)
    problems.push(
      `it names ${unknown
        .slice(0, 3)
        .map((label) => `"${label}"`)
        .join(", ")}, which the site does not show anywhere`,
    );
  const amount = amountProblem(reply.text, ctx.amounts);
  if (amount) problems.push(amount);
  const paths = [...reply.text.matchAll(PATH)]
    .map((m) => m[1].replace(/\/$/, ""))
    .filter((path) => !ctx.paths.has(path));
  if (paths.length)
    problems.push(`it names pages that do not exist: ${paths.join(", ")}`);
  const suggestions = reply.suggestions.filter(
    (suggestion) => !languageProblem(ctx.locale, suggestion),
  );
  return { reply: { ...reply, suggestions }, problems };
}

const FIELD_KINDS = new Set(["input", "textarea", "select", "file"]);

/** The action an element of this kind takes ("look" is always kept). */
function fittingAction(action: JevAction, kind: string): JevAction {
  if (action === "look") return action;
  switch (kind) {
    case "input":
    case "textarea":
      return "type";
    case "file":
      return "upload";
    case "select":
      return "select";
    case "checkbox":
    case "radio":
      return action === "type" ? "select" : action;
    default:
      return action === "type" ? "click" : action;
  }
}

function names(element: PageElement): string[] {
  return [element.label, element.section ?? ""].filter(Boolean);
}

/** `action "label"`, as SupportAssistant records a finished step. */
export function progressLine(action: JevAction, element: PageElement): string {
  return `${action} "${element.label || element.hint || element.id}"`;
}

export type PlanCheckContext = {
  elements: readonly PageElement[];
  progress: readonly string[];
  notices: readonly string[];
};

/**
 * Checks Jev's steps against the screen. Fixed here: an action that does not
 * fit its element, a click whose words name exactly one other element, and
 * done=true on a Next button. Reported: a click naming nothing on screen, a
 * disabled button pressed while required fields are empty, steps that only
 * point at form fields, and steps that repeat what was already done here.
 */
export function checkPlan(
  plan: JevPlan,
  ctx: PlanCheckContext,
): { plan: JevPlan; problems: string[] } {
  if (plan.kind !== "steps") return { plan, problems: [] };
  const problems: string[] = [];
  const byId = new Map(ctx.elements.map((element) => [element.id, element]));
  const steps = plan.steps.map((step, index) => {
    let element = byId.get(step.target);
    if (!element) return step;
    let target = step.target;
    const own = element;
    const quoted = quotedLabels(step.say);
    const namesTarget = quoted.some((q) =>
      names(own).some((name) => labelMatches(q, name)),
    );
    if (step.action === "click" && quoted.length && !namesTarget) {
      const others = ctx.elements.filter(
        (other) =>
          !other.label.startsWith("[item") &&
          quoted.some((q) => labelMatches(q, other.label)),
      );
      if (others.length === 1) {
        element = others[0];
        target = element.id;
      } else if (others.length === 0) {
        problems.push(
          `step ${index + 1} says ${quoted.map((q) => `"${q}"`).join(", ")}, which is not on this screen`,
        );
      }
    }
    return {
      ...step,
      target,
      action: fittingAction(step.action, element.kind),
    };
  });

  const requiredEmpty = ctx.elements.filter(
    (element) =>
      element.required &&
      !element.filled &&
      !element.disabled &&
      FIELD_KINDS.has(element.kind),
  );
  steps.forEach((step, index) => {
    const element = byId.get(step.target);
    if (step.action !== "click" || !element?.disabled) return;
    const before = new Set(steps.slice(0, index).map((s) => s.target));
    const missing = requiredEmpty.filter((field) => !before.has(field.id));
    if (missing.length)
      problems.push(
        `step ${index + 1} presses "${element.label}", which is disabled; required fields still empty: ${missing
          .slice(0, 4)
          .map((field) => `"${field.label}"`)
          .join(", ")}`,
      );
  });

  if (
    steps.every((step) => step.action === "look") &&
    steps.some((step) => FIELD_KINDS.has(byId.get(step.target)?.kind ?? ""))
  )
    problems.push(
      "the steps only point at form fields: say what to type or choose in each (type/select)",
    );

  let opened = -1;
  ctx.progress.forEach((line, index) => {
    if (line.startsWith("opened ")) opened = index;
  });
  const doneHere = new Set(ctx.progress.slice(opened + 1));
  const repeated = (step: (typeof steps)[number]) => {
    const element = byId.get(step.target);
    return element ? progressLine(step.action, element) : step.target;
  };
  const repeats = steps.filter((step) => doneHere.has(repeated(step)));
  if (
    ctx.notices.length === 0 &&
    repeats.length > 0 &&
    repeats.length === steps.length
  )
    problems.push(
      `every step was already done on this screen and it did not move on (${repeats
        .map(repeated)
        .join(
          ", ",
        )}): look for what blocks the user (an empty required field, a message, a disabled button)`,
    );

  const last = steps[steps.length - 1];
  const lastElement = last ? byId.get(last.target) : undefined;
  const done =
    plan.done &&
    !(
      last?.action === "click" &&
      lastElement &&
      NEXT_LABEL.test(normLabel(lastElement.label))
    );
  return { plan: { ...plan, steps, done }, problems };
}

/**
 * In English and Russian answers, swaps each quoted Georgian label for the
 * same button's text in the user's own UI (labels.ts:UI_LABELS), quoted the
 * way that language quotes. A label without an entry stays as it is.
 */
export function localizeLabels(
  text: string,
  locale: SupportLocale,
  table: Readonly<Record<string, { en: string; ru: string }>>,
): string {
  if (locale === "ka") return text;
  return text.replace(QUOTED, (whole, a, b, c, d, e) => {
    const label = String(a ?? b ?? c ?? d ?? e ?? "").trim();
    const entry = table[label] ?? table[label.replace(/\s*\*$/, "")];
    if (!entry) return whole;
    return locale === "ru" ? `«${entry.ru}»` : `"${entry.en}"`;
  });
}

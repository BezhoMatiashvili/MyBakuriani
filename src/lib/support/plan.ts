// The support assistant's wire contract, shared by POST /api/support, the
// dashboard widget and scripts/unit/support-plan.test.mjs (C43). Pure: no
// runtime "@/..." imports, no DOM, no Node APIs, because the unit tests load
// this file directly with Node's type stripping.
//
// "Type-safe" Jev: the model may only point at elements the browser reported
// on the user's screen. The tool schema lists those ids as an enum, and every
// plan is checked again here, whatever the routed model did with the schema.

export const SUPPORT_LOCALES = ["ka", "en", "ru"] as const;
export type SupportLocale = (typeof SUPPORT_LOCALES)[number];

// The area of the site the user is in: a dashboard cabinet, the shared
// account pages, or the /create listing forms.
export const SUPPORT_CABINETS = [
  "guest",
  "renter",
  "seller",
  "cleaner",
  "food",
  "entertainment",
  "transport",
  "employment",
  "services",
  "admin",
  "account",
  "create",
] as const;
export type SupportCabinet = (typeof SUPPORT_CABINETS)[number];

export const JEV_ACTIONS = [
  "click",
  "type",
  "select",
  "upload",
  "look",
] as const;
export type JevAction = (typeof JEV_ACTIONS)[number];

export const ELEMENT_KINDS = [
  "button",
  "link",
  "input",
  "textarea",
  "select",
  "checkbox",
  "radio",
  "file",
  "tab",
  "option",
  "other",
] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];

/** One interactive element of the user's screen. Never carries a field's value. */
export type PageElement = {
  id: string;
  kind: ElementKind;
  label: string;
  href?: string;
  section?: string;
  hint?: string;
  required?: boolean;
  filled?: boolean;
  disabled?: boolean;
};

export type JevStep = { target: string; action: JevAction; say: string };

export type JevPlan =
  | { kind: "steps"; intro: string; steps: JevStep[]; done: boolean }
  | { kind: "ask"; intro: string; question: string; options: string[] };

export type SupportTurn = { role: "user" | "assistant"; text: string };

export type SupportAskRequest = {
  mode: "ask";
  locale: SupportLocale;
  cabinet: SupportCabinet;
  path: string;
  message: string;
  history: SupportTurn[];
};

export type SupportPlanRequest = {
  mode: "plan";
  locale: SupportLocale;
  cabinet: SupportCabinet;
  path: string;
  title: string;
  goal: string;
  progress: string[];
  elements: PageElement[];
};

export type SupportRequest = SupportAskRequest | SupportPlanRequest;

export type SupportErrorCode =
  | "invalid"
  | "unauthenticated"
  | "rate_limited"
  | "unavailable"
  | "budget"
  | "failed";

export type SupportResponse =
  | { type: "answer"; text: string }
  // Gemini decided the user needs a walkthrough: the browser now snapshots the
  // page and sends a "plan" request with this goal.
  | { type: "guide"; goal: string }
  | { type: "plan"; plan: JevPlan }
  // Nothing on this screen leads toward the goal.
  | { type: "noplan" }
  | { type: "error"; error: SupportErrorCode };

export const SUPPORT_LIMITS = {
  body: 64_000,
  message: 500,
  history: 6,
  historyText: 600,
  goal: 300,
  progress: 12,
  progressText: 120,
  path: 200,
  title: 120,
  elements: 100,
  label: 60,
  section: 60,
  hint: 80,
  href: 120,
  steps: 8,
  say: 160,
  intro: 200,
  question: 160,
  options: 4,
  option: 60,
  answer: 1200,
} as const;

export const SHOW_STEPS_TOOL = "show_steps";
export const START_GUIDE_TOOL = "start_guide";

const ELEMENT_ID = /^[A-Za-z0-9:_-]{1,40}$/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Six or more digits, optionally split by spaces, dots, dashes or brackets:
// phone numbers, personal ids, card numbers.
const LONG_NUMBER = /\+?\d(?:[\s.()-]*\d){5,}/g;
// C0/C1 controls, zero-width and bidi characters, line/paragraph separators.
const INVISIBLE =
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g;
// The same minus line feed, for multi-line answers.
const INVISIBLE_KEEP_NEWLINE =
  /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function oneOf<T extends string>(list: readonly T[], value: unknown): T | null {
  return typeof value === "string" &&
    (list as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function clip(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max
    ? `${chars
        .slice(0, max - 1)
        .join("")
        .trimEnd()}…`
    : text;
}

/** Replaces e-mail addresses and long digit runs before text reaches a model. */
export function maskPersonalData(text: string): string {
  return text.replace(EMAIL, "[email]").replace(LONG_NUMBER, "[number]");
}

/** One line of plain text: invisible characters and repeated whitespace collapsed. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return clip(value.replace(INVISIBLE, " ").replace(/\s+/g, " ").trim(), max);
}

/** cleanText for anything that may show a person's data (labels, user text). */
export function cleanPrivate(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return cleanText(maskPersonalData(cleanText(value, 600)), max);
}

/** A same-site path without query or fragment, or "" for anything else. */
export function cleanPath(value: unknown, max: number): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  )
    return "";
  const path = value.split(/[?#]/, 1)[0];
  if (!/^\/[A-Za-z0-9\-._~%/:@]*$/.test(path)) return "";
  return path.length > max ? "" : path;
}

/**
 * Model text shown in the chat as plain text: no markup survives, line breaks
 * do (at most one blank line), list markers become bullets.
 */
export function cleanAnswer(value: unknown): string {
  if (typeof value !== "string") return "";
  const lines = value
    .replace(/\r\n?/g, "\n")
    .replace(INVISIBLE_KEEP_NEWLINE, "")
    .replace(/\*\*|__|`/g, "")
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s*#{1,6}\s+/, "")
        .replace(/^\s*[*-]\s+/, "• ")
        .replace(/[ \t]+/g, " ")
        .trim(),
    );
  return clip(
    lines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    SUPPORT_LIMITS.answer,
  );
}

/** The client's element list, re-checked: unknown fields dropped, ids unique, text masked and capped. */
export function normalizeElements(raw: unknown): PageElement[] {
  if (!Array.isArray(raw)) return [];
  const out: PageElement[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= SUPPORT_LIMITS.elements) break;
    if (!isRecord(item) || typeof item.id !== "string") continue;
    const id = item.id;
    if (!ELEMENT_ID.test(id) || seen.has(id)) continue;
    const label = cleanPrivate(item.label, SUPPORT_LIMITS.label);
    const hint = cleanText(item.hint, SUPPORT_LIMITS.hint);
    if (!label && !hint) continue;
    const element: PageElement = {
      id,
      kind: oneOf(ELEMENT_KINDS, item.kind) ?? "other",
      label,
    };
    const href = cleanPath(item.href, SUPPORT_LIMITS.href);
    if (href) element.href = href;
    const section = cleanPrivate(item.section, SUPPORT_LIMITS.section);
    if (section) element.section = section;
    if (hint) element.hint = hint;
    if (item.required === true) element.required = true;
    if (item.filled === true) element.filled = true;
    if (item.disabled === true) element.disabled = true;
    seen.add(id);
    out.push(element);
  }
  return out;
}

/** Validates a request body. Returns null for anything that is not a usable request. */
export function parseSupportRequest(body: unknown): SupportRequest | null {
  if (!isRecord(body)) return null;
  const locale = oneOf(SUPPORT_LOCALES, body.locale) ?? "ka";
  const cabinet = oneOf(SUPPORT_CABINETS, body.cabinet) ?? "guest";
  const path = cleanPath(body.path, SUPPORT_LIMITS.path) || "/dashboard";

  if (body.mode === "ask") {
    const message = cleanPrivate(body.message, SUPPORT_LIMITS.message);
    if (!message) return null;
    const history: SupportTurn[] = [];
    if (Array.isArray(body.history)) {
      for (const turn of body.history.slice(-SUPPORT_LIMITS.history)) {
        if (!isRecord(turn)) continue;
        const role = oneOf(["user", "assistant"] as const, turn.role);
        const text = cleanPrivate(turn.text, SUPPORT_LIMITS.historyText);
        if (role && text) history.push({ role, text });
      }
    }
    return { mode: "ask", locale, cabinet, path, message, history };
  }

  if (body.mode === "plan") {
    const goal = cleanPrivate(body.goal, SUPPORT_LIMITS.goal);
    if (!goal) return null;
    const progress = Array.isArray(body.progress)
      ? body.progress
          .slice(-SUPPORT_LIMITS.progress)
          .map((item) => cleanPrivate(item, SUPPORT_LIMITS.progressText))
          .filter(Boolean)
      : [];
    return {
      mode: "plan",
      locale,
      cabinet,
      path,
      title: cleanPrivate(body.title, SUPPORT_LIMITS.title),
      goal,
      progress,
      elements: normalizeElements(body.elements),
    };
  }

  return null;
}

/**
 * Jev's only tool. `target` is an enum of the ids on the user's screen, so a
 * model that honours the schema cannot name anything else; parseJevPlan
 * enforces the same for one that does not.
 */
export function buildShowStepsTool(elementIds: readonly string[]) {
  return {
    type: "function" as const,
    function: {
      name: SHOW_STEPS_TOOL,
      description:
        "Show the user on their screen what to press and where to type next, or ask one simple question when the goal is unclear.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "intro", "steps", "question", "options", "done"],
        properties: {
          kind: { type: "string", enum: ["steps", "ask"] },
          intro: {
            type: "string",
            description: "One short sentence for the chat.",
          },
          steps: {
            type: "array",
            maxItems: SUPPORT_LIMITS.steps,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["target", "action", "say"],
              properties: {
                target: { type: "string", enum: [...elementIds] },
                action: { type: "string", enum: [...JEV_ACTIONS] },
                say: {
                  type: "string",
                  description:
                    "One short instruction that names the element as it is labelled on screen.",
                },
              },
            },
          },
          question: {
            type: "string",
            description: "Only for kind=ask, otherwise empty.",
          },
          options: {
            type: "array",
            maxItems: SUPPORT_LIMITS.options,
            items: { type: "string" },
            description: "Only for kind=ask: 2-4 short answers.",
          },
          done: {
            type: "boolean",
            description:
              "true when these steps finish the goal; false when it continues on the next screen.",
          },
        },
      },
    },
  };
}

/** Gemini's hand-off to Jev. */
export const startGuideTool = {
  type: "function" as const,
  function: {
    name: START_GUIDE_TOOL,
    description:
      "Start an on-screen walkthrough that highlights what to press and where to type, step by step.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["goal"],
      properties: {
        goal: {
          type: "string",
          description:
            "What the user wants to get done, as one short sentence in the user's language.",
        },
      },
    },
  },
};

function parseArguments(raw: unknown): Record<string, unknown> | null {
  if (isRecord(raw)) return raw;
  if (typeof raw !== "string") return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

/** The goal of a start_guide call, or "" when the arguments are unusable. */
export function parseGuideGoal(raw: unknown): string {
  return cleanPrivate(parseArguments(raw)?.goal, SUPPORT_LIMITS.goal);
}

/**
 * Validates Jev's show_steps arguments against the ids that were on screen.
 * Steps with an unknown target, an unknown action or no instruction are
 * dropped; null means nothing usable is left.
 */
export function parseJevPlan(
  raw: unknown,
  allowedIds: ReadonlySet<string>,
): JevPlan | null {
  const value = parseArguments(raw);
  if (!value) return null;
  const intro = cleanText(value.intro, SUPPORT_LIMITS.intro);

  if (value.kind === "ask") {
    const question = cleanText(value.question, SUPPORT_LIMITS.question);
    if (!question) return null;
    const options: string[] = [];
    for (const option of Array.isArray(value.options) ? value.options : []) {
      const text = cleanText(option, SUPPORT_LIMITS.option);
      if (text && !options.includes(text)) options.push(text);
      if (options.length === SUPPORT_LIMITS.options) break;
    }
    return { kind: "ask", intro, question, options };
  }

  if (value.kind !== "steps") return null;
  const steps: JevStep[] = [];
  for (const item of Array.isArray(value.steps) ? value.steps : []) {
    if (steps.length === SUPPORT_LIMITS.steps) break;
    if (!isRecord(item) || typeof item.target !== "string") continue;
    if (!allowedIds.has(item.target)) continue;
    const action = oneOf(JEV_ACTIONS, item.action);
    const say = cleanText(item.say, SUPPORT_LIMITS.say);
    if (!action || !say) continue;
    const previous = steps[steps.length - 1];
    if (previous?.target === item.target && previous.action === action)
      continue;
    steps.push({ target: item.target, action, say });
  }
  if (steps.length === 0) return null;
  return { kind: "steps", intro, steps, done: value.done === true };
}

/** Which part of the site a (locale-free) path belongs to. */
export function cabinetForPath(
  path: string,
  homeRole?: string | null,
): SupportCabinet {
  if (path === "/create" || path.startsWith("/create/")) return "create";
  const [, root, segment] = path.split("/");
  if (root === "dashboard" && segment) {
    if (segment === "sms") return "renter";
    if (segment === "account" || segment === "payments") return "account";
    if (segment === "service" || segment === "handyman") return "services";
    const cabinet = oneOf(SUPPORT_CABINETS, segment);
    if (cabinet) return cabinet;
  }
  if (homeRole === "service" || homeRole === "handyman") return "services";
  return oneOf(SUPPORT_CABINETS, homeRole) ?? "guest";
}

/** Strips the optional locale prefix ("as-needed" routing: ka has none). */
export function stripLocale(pathname: string): string {
  return pathname.replace(/^\/(?:ka|en|ru)(?=\/|$)/, "") || "/";
}

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
// account pages, the /create listing forms, sign-in and registration, or the
// public site.
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
  "auth",
  "public",
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

/** Coarse subject of an answer, logged with 👍/👎 instead of any text. */
export const REPLY_TOPICS = [
  "listing",
  "photos",
  "membership",
  "payments",
  "promotion",
  "sms",
  "smart_match",
  "bookings",
  "cleaning",
  "verification",
  "account",
  "search",
  "pricing",
  "contact",
  "other",
] as const;
export type ReplyTopic = (typeof REPLY_TOPICS)[number];

/** Parameters a button may carry; validated per action in actions.ts. */
export const ACTION_PARAM_KEYS = [
  "category",
  "zone",
  "check_in",
  "check_out",
  "guests",
  "rooms",
  "price_max",
  "budget_min",
  "budget_max",
  "types",
  "amount",
  "tab",
  "query",
] as const;
export type ActionParamKey = (typeof ACTION_PARAM_KEYS)[number];
export type ActionParams = Partial<
  Record<ActionParamKey, string | number | string[]>
>;

/** A button the assistant offers: an action id from actions.ts plus checked params. */
export type SupportActionRef = { id: string; params?: ActionParams };

/**
 * A button as the browser gets it: the server builds `href` from the
 * registry (actions.ts:actionHref), never from model text.
 */
export type SupportButton = SupportActionRef & { href: string };

/** The answer model's reply, after parseReply. */
export type SupportReply = {
  text: string;
  actions: SupportActionRef[];
  /** A goal for an on-screen walkthrough, offered as "Show me" ("" = none). */
  guide: string;
  /** The user explicitly asked to be shown: start the walkthrough at once. */
  guideNow: boolean;
  suggestions: string[];
  topic: ReplyTopic;
  /** The answer depends on the user's own status, which was not given. */
  needsAccount: boolean;
};

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

/** 👍/👎 on an answer: only its ref and the rating travel, never text. */
export type SupportFeedbackRequest = {
  mode: "feedback";
  ref: string;
  rating: "up" | "down";
};

export type SupportRequest =
  SupportAskRequest | SupportPlanRequest | SupportFeedbackRequest;

export type SupportErrorCode =
  | "invalid"
  | "unauthenticated"
  | "rate_limited"
  | "unavailable"
  | "budget"
  | "failed";

export type SupportResponse =
  | {
      type: "answer";
      text: string;
      actions: SupportButton[];
      /** Walkthrough goal offered as "Show me" ("" = none). */
      guide: string;
      guideNow: boolean;
      suggestions: string[];
      /** Matches the server's log line; 👍/👎 send it back. */
      ref: string;
    }
  | { type: "plan"; plan: JevPlan }
  // Nothing on this screen leads toward the goal.
  | { type: "noplan" }
  // Feedback recorded.
  | { type: "ok" }
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
  actions: 3,
  suggestions: 3,
  suggestion: 90,
  actionText: 60,
} as const;

export const SHOW_STEPS_TOOL = "show_steps";
export const REPLY_TOOL = "reply";

/**
 * A question about the user's own situation (why / can't / not showing /
 * didn't arrive / status / pending), in ka, en or ru. Only these load the
 * user's own status for the answer; "my" alone does not (almost every
 * question has it). The model's needs_account flag catches the rest.
 */
export const ACCOUNT_QUESTION =
  /რატომ|ვერ(?:\s|ა)|არ\s(?:ჩანს|მოვიდა|ჩაირიცხ|გამოჩნდ|მიჩანს|აქვეყნებ|ქვეყნდება|დამიდასტურ|დადასტურდა|მუშაობს)|სტატუს|მოლოდინ|განხილვა|უარყოფ|\b(?:why|can'?t|cannot|unable|not\s(?:showing|visible|appearing|published|working|credited)|didn'?t\s(?:arrive|appear|show|go)|hasn'?t|isn'?t|status|pending|rejected|declined|stuck)\b|почему|не\s(?:могу|видно|отображ|пришл|поступ|появ|публику|работает)|статус|ожида|отклон/i;

const UUID =
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;

/** Replaces UUID path segments with ":id": a path can name another user. */
export function maskIds(path: string): string {
  return path.replace(UUID, ":id");
}

/**
 * Pages where every element outside the sidebar is private by default (the
 * scan sends a neutral label instead of its text): the admin area shows
 * other people's names, contacts and listings everywhere.
 */
export function isPrivatePath(path: string): boolean {
  return path === "/dashboard/admin" || path.startsWith("/dashboard/admin/");
}

/** The neutral label a private element is sent with (the 1st, 2nd... on screen). */
export function privateItemLabel(n: number): string {
  return `[item ${n}]`;
}

const ELEMENT_ID = /^[A-Za-z0-9:_-]{1,40}$/;
// A server answer ref, or a pre-written chip answer's "canned:<key>".
export const FEEDBACK_REF = /^(?:[a-z0-9]{10}|canned:[A-Za-z]{2,30})$/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Six or more digits, optionally split by spaces, dots, dashes or brackets:
// phone numbers, personal ids, card numbers.
const LONG_NUMBER = /\+?\d(?:[\s.()-]*\d){5,}/g;
// ...except an amount of money ("300000 GEL", "₾ 1 500 000"): a budget is
// what the user wants the search filtered by, not a personal number.
const MONEY_AFTER = /^\s*(?:₾|\$|€|ლარ|лари|(?:gel|lari|usd|eur)\b)/i;
const MONEY_BEFORE = /(?:₾|\$|€|\b(?:gel|usd|eur))\s*$/i;
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
  return text
    .replace(EMAIL, "[email]")
    .replace(LONG_NUMBER, (match, offset: number, whole: string) =>
      MONEY_AFTER.test(whole.slice(offset + match.length)) ||
      MONEY_BEFORE.test(whole.slice(0, offset))
        ? match
        : "[number]",
    );
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

/**
 * A same-site path without query or fragment, its UUID segments as ":id",
 * or "" for anything else.
 */
export function cleanPath(value: unknown, max: number): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  )
    return "";
  const path = maskIds(value.split(/[?#]/, 1)[0]);
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
  if (body.mode === "feedback") {
    const ref =
      typeof body.ref === "string" && FEEDBACK_REF.test(body.ref)
        ? body.ref
        : null;
    const rating =
      body.rating === "up" || body.rating === "down" ? body.rating : null;
    return ref && rating ? { mode: "feedback", ref, rating } : null;
  }
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

/**
 * The answer model's only tool. Buttons are action ids from a fixed list
 * (actions.ts) with typed params: there is no field for a link, so text
 * injected through a page or a question can at most pick another listed
 * button, which the user still has to press.
 */
export function buildReplyTool(vocab: {
  actions: readonly string[];
  propertyTypes: readonly string[];
  tabs: readonly string[];
}) {
  const text = (description: string) => ({ type: "string", description });
  const whole = (description: string) => ({ type: "integer", description });
  return {
    type: "function" as const,
    function: {
      name: REPLY_TOOL,
      description:
        "Answer the user, with buttons that open the right page or form, an optional walkthrough goal and follow-up questions.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: [
          "text",
          "actions",
          "guide",
          "guide_now",
          "suggestions",
          "topic",
          "needs_account",
        ],
        properties: {
          text: text(
            "The answer: at most 4 short sentences of plain text in the user's language.",
          ),
          actions: {
            type: "array",
            maxItems: SUPPORT_LIMITS.actions,
            description:
              "0-3 buttons from 'Buttons available here' that take the user straight to what they need.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id"],
              properties: {
                id: { type: "string", enum: [...vocab.actions] },
                params: {
                  type: "object",
                  additionalProperties: false,
                  description:
                    "Only what the user said; leave everything else out.",
                  properties: {
                    category: text("One of the categories the button lists."),
                    zone: text("A zone name exactly as written under ZONES."),
                    check_in: text("YYYY-MM-DD"),
                    check_out: text("YYYY-MM-DD"),
                    guests: whole("Number of guests."),
                    rooms: whole("Minimum number of rooms."),
                    price_max: whole(
                      "Highest price in GEL (per night for rentals).",
                    ),
                    budget_min: whole(
                      "Smart Match budget from, GEL per night.",
                    ),
                    budget_max: whole(
                      "Smart Match budget up to, GEL per night.",
                    ),
                    types: {
                      type: "array",
                      items: { type: "string", enum: [...vocab.propertyTypes] },
                    },
                    amount: whole("Top-up amount in GEL."),
                    tab: { type: "string", enum: [...vocab.tabs] },
                    query: text("Text for the admin user search."),
                  },
                },
              },
            },
          },
          guide: text(
            "A short goal for an on-screen walkthrough when the user asks how or where to do something on this site, or about the form or screen they are on; otherwise empty.",
          ),
          guide_now: {
            type: "boolean",
            description:
              "true only when the user explicitly asked to be shown on screen.",
          },
          suggestions: {
            type: "array",
            maxItems: SUPPORT_LIMITS.suggestions,
            items: { type: "string" },
            description:
              "2-3 short follow-up questions the user might ask next, written as the user would type them, in the user's language.",
          },
          topic: { type: "string", enum: [...REPLY_TOPICS] },
          needs_account: {
            type: "boolean",
            description:
              "true when the answer depends on this user's own status and YOUR ACCOUNT is not given.",
          },
        },
      },
    },
  };
}

/**
 * Validates the reply tool's arguments. Each button goes through `normalize`
 * (actions.ts: only ids available on this request, params checked), so an
 * unknown id or bad param never reaches the browser. Null when nothing usable
 * is left.
 */
export function parseReply(
  raw: unknown,
  normalize: (id: string, params: unknown) => SupportActionRef | null,
  message = "",
): SupportReply | null {
  const value = parseArguments(raw);
  if (!value) return null;
  const text = cleanAnswer(value.text);
  const actions: SupportActionRef[] = [];
  for (const item of Array.isArray(value.actions) ? value.actions : []) {
    if (actions.length === SUPPORT_LIMITS.actions) break;
    if (!isRecord(item) || typeof item.id !== "string") continue;
    if (actions.some((action) => action.id === item.id)) continue;
    const action = normalize(item.id, item.params);
    if (action) actions.push(action);
  }
  const guide = cleanPrivate(value.guide, SUPPORT_LIMITS.goal);
  const asked = cleanText(message, SUPPORT_LIMITS.message).toLowerCase();
  const suggestions: string[] = [];
  for (const item of Array.isArray(value.suggestions)
    ? value.suggestions
    : []) {
    if (suggestions.length === SUPPORT_LIMITS.suggestions) break;
    const suggestion = cleanPrivate(item, SUPPORT_LIMITS.suggestion);
    if (
      suggestion &&
      suggestion.toLowerCase() !== asked &&
      !suggestions.includes(suggestion)
    )
      suggestions.push(suggestion);
  }
  if (!text && actions.length === 0 && !guide) return null;
  return {
    text,
    actions,
    guide,
    guideNow: guide !== "" && value.guide_now === true,
    suggestions,
    topic: oneOf(REPLY_TOPICS, value.topic) ?? "other",
    needsAccount: value.needs_account === true,
  };
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

  // The schema requires kind, but a routed model sometimes leaves it out of an
  // otherwise good answer (DeepSeek did on 1 of 8 probes, 2026-10-05).
  const kind =
    value.kind === "ask" || value.kind === "steps"
      ? value.kind
      : Array.isArray(value.steps) && value.steps.length > 0
        ? "steps"
        : typeof value.question === "string" && value.question.trim()
          ? "ask"
          : null;

  if (kind === "ask") {
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

  if (kind !== "steps") return null;
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
  const [, root, segment] = path.split("/");
  if (root === "create") return "create";
  if (root === "auth" || root === "join") return "auth";
  if (root !== "dashboard") return "public";
  if (segment) {
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

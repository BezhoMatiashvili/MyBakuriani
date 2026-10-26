// The support assistant's checks and session memory (C43): validate.ts runs
// on every answer and plan, plan.ts carries the memory and the question log
// row, actions.ts maps a budget given in the other key.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  amountsIn,
  checkPlan,
  checkReply,
  labelMatches,
  languageProblem,
  localizeLabels,
  progressLine,
  quotedLabels,
} from "../../src/lib/support/validate.ts";
import {
  SUPPORT_LIMITS,
  parseMemory,
  parseSupportRequest,
  supportQuestionRow,
} from "../../src/lib/support/plan.ts";
import { normalizeAction } from "../../src/lib/support/actions.ts";

const reply = (extra = {}) => ({
  text: "",
  actions: [],
  guide: "",
  guideNow: false,
  suggestions: [],
  topic: "other",
  needsAccount: false,
  memory: { goal: "", details: [] },
  intent: "",
  ...extra,
});

const ctx = (extra = {}) => ({
  locale: "ka",
  labels: ["ბალანსის შევსება", "ბალანსი და VIP", "ბინები (გაქირავება)"],
  amounts: new Set([20, 2000]),
  paths: new Set(["/", "/dashboard/renter/balance"]),
  ...extra,
});

test("language check ignores quotes, acronyms and brand names", () => {
  assert.equal(languageProblem("ka", "რა არის SUPER VIP?"), null);
  assert.equal(
    languageProblem("en", "Press „ბალანსის შევსება“ on „ბალანსი და VIP“."),
    null,
  );
  assert.equal(
    languageProblem("ka", "Press the button below."),
    "not written in Georgian",
  );
  assert.equal(languageProblem("ru", "Нажмите кнопку."), null);
});

test("amounts read the site's thousands separator", () => {
  assert.deepEqual(
    amountsIn("1 500 ₾, 20 ₾, 300000 GEL, 2,5 ლარი"),
    [1500, 20, 300000, 2.5],
  );
});

test("labels match with Georgian case endings and as a start", () => {
  assert.equal(labelMatches("ბალანსის შევსებაზე", "ბალანსის შევსება"), true);
  assert.equal(labelMatches("ბინებში", "ბინები"), true);
  assert.equal(labelMatches("ბინები", "ბინები (გაქირავება)"), true);
  assert.equal(labelMatches("ფოტოები", "ფასები"), false);
  assert.deepEqual(quotedLabels('„ა ბ“ "გ დ" «ე ვ»'), ["ა ბ", "გ დ", "ე ვ"]);
});

test("single-quoted Georgian labels are read and swapped, apostrophes are not", () => {
  const table = { "ბალანსის შევსება": { en: "Top up", ru: "Пополнить" } };
  const text = "Don't wait: press 'ბალანსის შევსება' on ‘ბალანსი და VIP’.";
  assert.deepEqual(quotedLabels(text), ["ბალანსის შევსება", "ბალანსი და VIP"]);
  assert.equal(
    localizeLabels(text, "en", table),
    'Don\'t wait: press "Top up" on ‘ბალანსი და VIP’.',
  );
  assert.deepEqual(quotedLabels("You'll see it, it's there."), []);
});

test("checkReply flags invented labels, unlisted amounts and pages", () => {
  const good = checkReply(
    reply({ text: "დააჭირეთ „ბალანსის შევსებას“ — მაქსიმუმ 2000 ₾." }),
    ctx(),
  );
  assert.deepEqual(good.problems, []);
  const bad = checkReply(
    reply({
      text: "გადადით /dashboard/wallet-ზე, დააჭირეთ „საფულის შევსება“ და გადაიხადეთ 35 ₾.",
    }),
    ctx(),
  );
  assert.equal(bad.problems.length, 3);
  assert.match(bad.problems.join(" "), /საფულის შევსება/);
  assert.match(bad.problems.join(" "), /35/);
  assert.match(bad.problems.join(" "), /\/dashboard\/wallet/);
});

test("checkReply lets the user's own words be quoted back and drops foreign suggestions", () => {
  const checked = checkReply(
    reply({
      text: "განცხადება „მზიანი კოტეჯი“ მოლოდინშია.",
      suggestions: ["როგორ დავამატო ფოტო?", "How do I add photos?"],
    }),
    ctx({ said: "ჩემი მზიანი კოტეჯი რატომ არ ჩანს?" }),
  );
  assert.deepEqual(checked.problems, []);
  assert.deepEqual(checked.reply.suggestions, ["როგორ დავამატო ფოტო?"]);
});

const screen = [
  {
    id: "e1",
    kind: "select",
    label: "ბინის ტიპი*",
    required: true,
    filled: true,
  },
  { id: "e2", kind: "select", label: "ლოკაცია*", required: true },
  { id: "e3", kind: "input", label: "სათაური* (მაგ: ბინა)", required: true },
  { id: "e4", kind: "button", label: "გაგრძელება" },
  { id: "e5", kind: "button", label: "გამოქვეყნება", disabled: true },
  {
    id: "e6",
    kind: "link",
    label: "წევრობის შეძენა",
    href: "/dashboard/renter",
  },
];
const steps = (list, done = false) => ({
  kind: "steps",
  intro: "",
  steps: list.map(([target, action, say]) => ({ target, action, say })),
  done,
});
const planCtx = (extra = {}) => ({
  elements: screen,
  progress: [],
  notices: [],
  ...extra,
});

test("checkPlan gives every step the action its element takes", () => {
  const { plan, problems } = checkPlan(
    steps([
      ["e2", "click", "აირჩიეთ „ლოკაცია“"],
      ["e3", "click", "ჩაწერეთ „სათაური“"],
      ["e4", "type", "დააჭირეთ „გაგრძელება“"],
    ]),
    planCtx(),
  );
  assert.deepEqual(problems, []);
  assert.deepEqual(
    plan.steps.map((step) => step.action),
    ["select", "type", "click"],
  );
});

test("checkPlan moves a click onto the element its words name", () => {
  const { plan, problems } = checkPlan(
    steps([["e4", "click", "დააჭირეთ „წევრობის შეძენა“-ს"]]),
    planCtx(),
  );
  assert.deepEqual(problems, []);
  assert.equal(plan.steps[0].target, "e6");
  const lost = checkPlan(
    steps([["e4", "click", "დააჭირეთ „შენახვა“-ს"]]),
    planCtx(),
  );
  assert.match(lost.problems[0], /not on this screen/);
});

test("checkPlan reports a disabled button pressed before the required fields", () => {
  const { problems } = checkPlan(
    steps([["e5", "click", "დააჭირეთ „გამოქვეყნება“"]]),
    planCtx(),
  );
  assert.match(problems[0], /disabled/);
  assert.match(problems[0], /ლოკაცია/);
  const filledFirst = checkPlan(
    steps([
      ["e2", "select", "აირჩიეთ „ლოკაცია“"],
      ["e3", "type", "ჩაწერეთ „სათაური“"],
      ["e5", "click", "დააჭირეთ „გამოქვეყნება“"],
    ]),
    planCtx(),
  );
  assert.deepEqual(filledFirst.problems, []);
});

test("checkPlan reports steps that only point at fields, and loops", () => {
  const looks = checkPlan(
    steps([["e3", "look", "შეხედეთ სავალდებულო ველებს"]]),
    planCtx(),
  );
  assert.match(looks.problems[0], /only point at form fields/);
  const again = steps([["e4", "click", "დააჭირეთ „გაგრძელება“"]]);
  const loop = checkPlan(
    again,
    planCtx({
      progress: ["opened /create/rental", progressLine("click", screen[3])],
    }),
  );
  assert.match(loop.problems[0], /already done on this screen/);
  // A message on screen explains the stop: pressing again may be right.
  const explained = checkPlan(
    again,
    planCtx({
      progress: [progressLine("click", screen[3])],
      notices: ["აირჩიეთ ლოკაცია"],
    }),
  );
  assert.deepEqual(explained.problems, []);
  // Done on another page: the same click there is new.
  const elsewhere = checkPlan(
    again,
    planCtx({
      progress: [progressLine("click", screen[3]), "opened /create/rental"],
    }),
  );
  assert.deepEqual(elsewhere.problems, []);
});

test("checkPlan never finishes on a Next button", () => {
  const { plan } = checkPlan(
    steps(
      [
        ["e2", "select", "აირჩიეთ „ლოკაცია“"],
        ["e4", "click", "დააჭირეთ „გაგრძელება“"],
      ],
      true,
    ),
    planCtx(),
  );
  assert.equal(plan.done, false);
  const ask = { kind: "ask", intro: "", question: "?", options: [] };
  assert.deepEqual(checkPlan(ask, planCtx()), { plan: ask, problems: [] });
});

test("memory, events, screen and recent turns are masked and capped", () => {
  const memory = parseMemory({
    goal: "list my hotel; mail me at a@b.ge",
    details: Array.from({ length: 9 }, (_, i) => `detail ${i}`),
  });
  assert.equal(memory.goal, "list my hotel; mail me at [email]");
  assert.equal(memory.details.length, SUPPORT_LIMITS.memoryDetails);
  assert.deepEqual(parseMemory("nope"), { goal: "", details: [] });

  const ask = parseSupportRequest({
    mode: "ask",
    message: "რამდენი ფოტო?",
    memory: { goal: "list a hotel", details: ["zone Didveli"] },
    events: ['walkthrough "x" finished', 5, "e2", "e3", "e4", "e5"],
    screen: {
      title: "ფორმა",
      elements: Array.from({ length: 60 }, (_, i) => ({
        id: `e${i + 1}`,
        kind: "button",
        label: `ღილაკი ${i}`,
      })),
      notices: ["შეცდომა: 599123456", "a", "b", "c"],
    },
  });
  assert.deepEqual(ask.memory, {
    goal: "list a hotel",
    details: ["zone Didveli"],
  });
  assert.equal(ask.events.length, SUPPORT_LIMITS.events);
  assert.equal(ask.screen.elements.length, SUPPORT_LIMITS.screenElements);
  assert.equal(ask.screen.notices.length, SUPPORT_LIMITS.notices);
  assert.equal(ask.screen.notices.includes("შეცდომა: 599123456"), false);

  const bare = parseSupportRequest({ mode: "ask", message: "გამარჯობა" });
  assert.deepEqual(bare.memory, { goal: "", details: [] });
  assert.deepEqual(bare.screen, { title: "", elements: [], notices: [] });

  const plan = parseSupportRequest({
    mode: "plan",
    goal: "add a hotel",
    elements: [{ id: "e1", kind: "button", label: "გაგრძელება" }],
    recent: ["one", "two", "three"],
    notices: ["აირჩიეთ ლოკაცია"],
  });
  assert.deepEqual(plan.recent, ["two", "three"]);
  assert.deepEqual(plan.notices, ["აირჩიეთ ლოკაცია"]);
});

test("the question log row carries what was asked, never who", () => {
  const req = parseSupportRequest({
    mode: "ask",
    locale: "ka",
    cabinet: "renter",
    path: "/dashboard/renter/3f2b9c1e-8a4d-4f6b-9c2e-1a2b3c4d5e6f",
    message: "ფოტო ვერ ავტვირთე, ჩემი ნომერია 599123456",
  });
  const row = supportQuestionRow(
    req,
    reply({ topic: "photos", intent: "upload listing photos", guide: "x" }),
    {
      source: "model",
      signedIn: true,
      problems: 1,
      repaired: true,
      ref: "abcdefghij",
    },
  );
  assert.deepEqual(row, {
    locale: "ka",
    cabinet: "renter",
    path: "/dashboard/renter/:id",
    question: "ფოტო ვერ ავტვირთე, ჩემი ნომერია [number]",
    intent: "upload listing photos",
    topic: "photos",
    source: "model",
    signed_in: true,
    guide: true,
    problems: 1,
    repaired: true,
    ref: "abcdefghij",
  });
  for (const key of ["user_id", "ip", "email", "answer"])
    assert.equal(key in row, false, key);
});

test("a budget given in the other key still filters the search", () => {
  const actionCtx = {
    cabinet: "public",
    signedIn: false,
    today: "2026-10-25",
    zones: [],
  };
  assert.deepEqual(
    normalizeAction(
      "search_sale",
      { types: ["cottage"], budget_max: 300000 },
      actionCtx,
    ),
    { id: "search_sale", params: { types: ["cottage"], price_max: 300000 } },
  );
});

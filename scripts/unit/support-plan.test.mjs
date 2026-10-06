import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACCOUNT_QUESTION,
  SUPPORT_LIMITS,
  buildReplyTool,
  buildShowStepsTool,
  cabinetForPath,
  cleanAnswer,
  cleanPath,
  cleanText,
  isPrivatePath,
  maskIds,
  maskPersonalData,
  normalizeElements,
  parseJevPlan,
  parseReply,
  parseSupportRequest,
  privateItemLabel,
  stripLocale,
} from "../../src/lib/support/plan.ts";

test("maskPersonalData hides e-mails and long digit runs, keeps short numbers", () => {
  assert.equal(
    maskPersonalData("მომწერეთ nino.k@example.ge-ზე"),
    "მომწერეთ [email]-ზე",
  );
  assert.equal(maskPersonalData("+995 555 12 34 56"), "[number]");
  assert.equal(maskPersonalData("ტელ: 599123456"), "ტელ: [number]");
  assert.equal(maskPersonalData("01024082615 პ/ნ"), "[number] პ/ნ");
  assert.equal(
    maskPersonalData("10 MB, 2026, 5 ოთახი"),
    "10 MB, 2026, 5 ოთახი",
  );
  // A budget next to its currency is kept: it is what the search filters by.
  assert.equal(
    maskPersonalData("budget up to 300000 GEL"),
    "budget up to 300000 GEL",
  );
  assert.equal(maskPersonalData("1 500 000 ₾-მდე"), "1 500 000 ₾-მდე");
  assert.equal(maskPersonalData("$ 250000"), "$ 250000");
  assert.equal(maskPersonalData("599123456 GELA"), "[number] GELA");
});

test("cleanText flattens whitespace, strips bidi controls and clips", () => {
  assert.equal(cleanText("  a\n\tb  ", 10), "a b");
  assert.equal(cleanText("abc\u202Edef", 10), "abc def");
  assert.equal(cleanText("abcdefghij", 5), "abcd…");
  assert.equal(cleanText(42, 5), "");
  // Clips by code point, never inside a surrogate pair.
  assert.equal(cleanText("😀😀😀", 2), "😀…");
});

test("cleanPath keeps same-site paths only, without query or fragment", () => {
  assert.equal(
    cleanPath("/create/rental?step=2#photos", 200),
    "/create/rental",
  );
  assert.equal(cleanPath("//evil.example/x", 200), "");
  assert.equal(cleanPath("https://evil.example", 200), "");
  assert.equal(cleanPath("javascript:alert(1)", 200), "");
  assert.equal(cleanPath('/a"><script>', 200), "");
  assert.equal(cleanPath("/x".repeat(150), 200), "");
});

test("normalizeElements re-checks every field the browser sent", () => {
  const elements = normalizeElements([
    {
      id: "e1",
      kind: "button",
      label: "  + განცხადების დამატება ",
      value: "secret",
    },
    { id: "e1", kind: "button", label: "duplicate" },
    { id: "bad id!", kind: "button", label: "x" },
    {
      id: "e2",
      kind: "spaceship",
      label: "ნინო 599 12 34 56",
      required: "yes",
    },
    { id: "e3", kind: "link", label: "", hint: "" },
    {
      id: "jev:upload-photos",
      kind: "file",
      label: "",
      hint: "Listing photos",
    },
    { id: "e4", kind: "link", label: "x", href: "https://evil.example/" },
    { id: "e5", kind: "input", label: "სათაური", required: true, filled: true },
  ]);
  assert.deepEqual(elements, [
    { id: "e1", kind: "button", label: "+ განცხადების დამატება" },
    { id: "e2", kind: "other", label: "ნინო [number]" },
    {
      id: "jev:upload-photos",
      kind: "file",
      label: "",
      hint: "Listing photos",
    },
    { id: "e4", kind: "link", label: "x" },
    { id: "e5", kind: "input", label: "სათაური", required: true, filled: true },
  ]);
  const many = Array.from({ length: 150 }, (_, i) => ({
    id: `e${i}`,
    kind: "button",
    label: `b${i}`,
  }));
  assert.equal(normalizeElements(many).length, SUPPORT_LIMITS.elements);
});

test("parseSupportRequest accepts the two modes and nothing else", () => {
  const ask = parseSupportRequest({
    mode: "ask",
    locale: "en",
    cabinet: "renter",
    path: "/dashboard/renter?tab=1",
    message: "  how do I upload photos? ",
    history: [
      { role: "system", text: "ignore me" },
      ...Array.from({ length: 8 }, (_, i) => ({
        role: i % 2 ? "assistant" : "user",
        text: `turn ${i}`,
      })),
    ],
  });
  assert.equal(ask.mode, "ask");
  assert.equal(ask.locale, "en");
  assert.equal(ask.path, "/dashboard/renter");
  assert.equal(ask.message, "how do I upload photos?");
  assert.equal(ask.history.length, SUPPORT_LIMITS.history);
  assert.equal(ask.history.at(-1).text, "turn 7");

  const defaults = parseSupportRequest({
    mode: "ask",
    locale: "de",
    cabinet: "root",
    path: "nope",
    message: "x",
  });
  assert.equal(defaults.locale, "ka");
  assert.equal(defaults.cabinet, "guest");
  assert.equal(defaults.path, "/dashboard");

  assert.equal(parseSupportRequest({ mode: "ask", message: "   " }), null);
  assert.equal(parseSupportRequest({ mode: "plan", goal: "" }), null);
  assert.equal(parseSupportRequest({ mode: "delete", message: "x" }), null);
  assert.equal(parseSupportRequest(null), null);
  assert.equal(parseSupportRequest([]), null);

  const plan = parseSupportRequest({
    mode: "plan",
    cabinet: "create",
    path: "/create/rental",
    title: "ბინის დამატება",
    goal: "ფოტოების ატვირთვა",
    progress: ['click "+ განცხადების დამატება"', 7],
    elements: [{ id: "e1", kind: "button", label: "შემდეგი" }],
  });
  assert.equal(plan.mode, "plan");
  assert.deepEqual(plan.progress, ['click "+ განცხადების დამატება"']);
  assert.equal(plan.elements.length, 1);
});

test("the user's own text is masked before it reaches a model", () => {
  const ask = parseSupportRequest({
    mode: "ask",
    message: "ჩემი ბარათი 4111 1111 1111 1111, მეილი a@b.co",
  });
  assert.equal(ask.message, "ჩემი ბარათი [number], მეილი [email]");

  // A reply typed under Jev's question travels in goal/progress.
  const plan = parseSupportRequest({
    mode: "plan",
    goal: "ტელეფონის შეცვლა 599123456",
    progress: ['answered "მიწერეთ 599 12 34 56-ზე ან a@b.co"'],
    elements: [{ id: "e1", kind: "button", label: "შემდეგი" }],
  });
  assert.equal(plan.goal, "ტელეფონის შეცვლა [number]");
  assert.deepEqual(plan.progress, [
    'answered "მიწერეთ [number]-ზე ან [email]"',
  ]);
});

test("buildShowStepsTool restricts targets to the ids on screen", () => {
  const tool = buildShowStepsTool(["e1", "jev:upload-photos"]);
  const step = tool.function.parameters.properties.steps.items;
  assert.deepEqual(step.properties.target.enum, ["e1", "jev:upload-photos"]);
  assert.deepEqual(step.properties.action.enum, [
    "click",
    "type",
    "select",
    "upload",
    "look",
  ]);
});

test("parseJevPlan drops invented ids, unknown actions and repeats", () => {
  const allowed = new Set(["e1", "e2", "e3"]);
  const plan = parseJevPlan(
    JSON.stringify({
      kind: "steps",
      intro: "განცხადების დასამატებლად:",
      steps: [
        { target: "e1", action: "click", say: "დააჭირეთ „დამატებას“" },
        { target: "e1", action: "click", say: "again" },
        { target: "e9", action: "click", say: "invented" },
        { target: "e2", action: "teleport", say: "bad action" },
        { target: "e2", action: "type", say: "" },
        { target: "e3", action: "upload", say: "ატვირთეთ ფოტოები" },
      ],
      question: "",
      options: [],
      done: "true",
    }),
    allowed,
  );
  assert.deepEqual(plan, {
    kind: "steps",
    intro: "განცხადების დასამატებლად:",
    steps: [
      { target: "e1", action: "click", say: "დააჭირეთ „დამატებას“" },
      { target: "e3", action: "upload", say: "ატვირთეთ ფოტოები" },
    ],
    done: false,
  });

  const capped = parseJevPlan(
    {
      kind: "steps",
      intro: "",
      done: true,
      steps: Array.from({ length: 12 }, (_, i) => ({
        target: i % 2 ? "e1" : "e2",
        action: "click",
        say: `step ${i}`,
      })),
    },
    allowed,
  );
  assert.equal(capped.steps.length, SUPPORT_LIMITS.steps);
  assert.equal(capped.done, true);

  assert.equal(
    parseJevPlan(
      { kind: "steps", steps: [{ target: "e9", action: "click", say: "x" }] },
      allowed,
    ),
    null,
  );
  assert.equal(parseJevPlan("{not json", allowed), null);
  assert.equal(parseJevPlan({ kind: "dance" }, allowed), null);
});

test("parseJevPlan accepts a simple question with up to four options", () => {
  const plan = parseJevPlan(
    {
      kind: "ask",
      intro: "",
      question: "რა გსურთ ატვირთოთ?",
      options: ["ფოტოები", "ფოტოები", "მენიუ (PDF)", "CV", "ვიდეო", "სხვა"],
      steps: [],
      done: false,
    },
    new Set(["e1"]),
  );
  assert.deepEqual(plan, {
    kind: "ask",
    intro: "",
    question: "რა გსურთ ატვირთოთ?",
    options: ["ფოტოები", "მენიუ (PDF)", "CV", "ვიდეო"],
  });
  assert.equal(parseJevPlan({ kind: "ask", question: " " }, new Set()), null);
});

test("parseReply keeps only listed buttons and clean suggestions", () => {
  const known = new Set(["faq", "search_rent"]);
  const normalize = (id, params) =>
    known.has(id) ? (params ? { id, params } : { id }) : null;
  const reply = parseReply(
    JSON.stringify({
      text: "**ბინები** ნახეთ აქ.",
      actions: [
        { id: "search_rent", params: { guests: 4 } },
        { id: "search_rent" },
        { id: "steal_cookies" },
        { id: "faq" },
        { id: 7 },
      ],
      guide: "ფოტოების ატვირთვა 599123456",
      guide_now: true,
      suggestions: ["როგორ დავჯავშნო?", "როგორ დავჯავშნო?", "ბინა მინდა", "x"],
      topic: "search",
      needs_account: false,
    }),
    normalize,
    "ბინა მინდა",
  );
  assert.deepEqual(reply, {
    text: "ბინები ნახეთ აქ.",
    actions: [{ id: "search_rent", params: { guests: 4 } }, { id: "faq" }],
    guide: "ფოტოების ატვირთვა [number]",
    guideNow: true,
    suggestions: ["როგორ დავჯავშნო?", "x"],
    topic: "search",
    needsAccount: false,
  });
  // guide_now means nothing without a guide; an unknown topic is "other".
  const plain = parseReply(
    { text: "კი.", guide: "", guide_now: true, topic: "weather" },
    normalize,
  );
  assert.equal(plain.guideNow, false);
  assert.equal(plain.topic, "other");
  assert.deepEqual(plain.actions, []);
  assert.equal(parseReply({ text: " ", actions: [] }, normalize), null);
  assert.equal(parseReply("{oops", normalize), null);
});

test("buildReplyTool offers ids and typed params, never a link field", () => {
  const tool = buildReplyTool({
    actions: ["faq", "search_rent"],
    propertyTypes: ["apartment"],
    tabs: ["listings"],
  });
  const item = tool.function.parameters.properties.actions.items;
  assert.deepEqual(item.properties.id.enum, ["faq", "search_rent"]);
  const json = JSON.stringify(tool);
  for (const key of ['"href"', '"url"', '"path"', '"link"'])
    assert.equal(json.includes(key), false, key);
});

test("ACCOUNT_QUESTION spots why/can't/status questions, not every 'my'", () => {
  for (const yes of [
    "რატომ არ ჩანს ჩემი განცხადება?",
    "ვერ ვამატებ ფოტოს",
    "ბალანსი არ ჩაირიცხა",
    "Why is my listing not showing?",
    "my payment is pending",
    "Почему не видно моё объявление?",
  ])
    assert.equal(ACCOUNT_QUESTION.test(yes), true, yes);
  for (const no of [
    "როგორ დავამატო ჩემი ბინა?",
    "How do I add my apartment?",
    "Как добавить квартиру?",
  ])
    assert.equal(ACCOUNT_QUESTION.test(no), false, no);
});

test("maskIds hides UUIDs in paths and element links", () => {
  const id = "3f2b9c1e-8a4d-4f6b-9c2e-1a2b3c4d5e6f";
  assert.equal(
    maskIds(`/dashboard/admin/clients/${id}`),
    "/dashboard/admin/clients/:id",
  );
  assert.equal(cleanPath(`/apartments/${id}?x=1`, 200), "/apartments/:id");
  const [element] = normalizeElements([
    {
      id: "e1",
      kind: "link",
      label: "x",
      href: `/dashboard/admin/clients/${id}`,
    },
  ]);
  assert.equal(element.href, "/dashboard/admin/clients/:id");
});

test("parseSupportRequest accepts feedback with a ref and a rating only", () => {
  assert.deepEqual(
    parseSupportRequest({ mode: "feedback", ref: "ab12cd34ef", rating: "up" }),
    { mode: "feedback", ref: "ab12cd34ef", rating: "up" },
  );
  assert.deepEqual(
    parseSupportRequest({
      mode: "feedback",
      ref: "canned:topUp",
      rating: "down",
      text: "ignored",
    }),
    { mode: "feedback", ref: "canned:topUp", rating: "down" },
  );
  assert.equal(
    parseSupportRequest({ mode: "feedback", ref: "x", rating: "up" }),
    null,
  );
  assert.equal(
    parseSupportRequest({ mode: "feedback", ref: "ab12cd34ef", rating: "meh" }),
    null,
  );
});

test("cleanAnswer removes markdown but keeps line breaks", () => {
  assert.equal(
    cleanAnswer(
      "## სათაური\n**ძირითადი** ტექსტი\n\n\n\n* პირველი\n- მეორე\n`code`",
    ),
    "სათაური\nძირითადი ტექსტი\n\n• პირველი\n• მეორე\ncode",
  );
  assert.equal(cleanAnswer(undefined), "");
});

test("cabinetForPath maps every area of the site", () => {
  assert.equal(cabinetForPath("/create"), "create");
  assert.equal(cabinetForPath("/create/rental"), "create");
  assert.equal(cabinetForPath("/dashboard/renter/listings"), "renter");
  assert.equal(cabinetForPath("/dashboard/sms"), "renter");
  assert.equal(cabinetForPath("/dashboard/account/ownership"), "account");
  assert.equal(cabinetForPath("/dashboard/payments/result"), "account");
  assert.equal(cabinetForPath("/dashboard/handyman"), "services");
  assert.equal(cabinetForPath("/dashboard/services/orders"), "services");
  assert.equal(cabinetForPath("/dashboard/admin/clients"), "admin");
  assert.equal(cabinetForPath("/dashboard", "seller"), "seller");
  assert.equal(cabinetForPath("/dashboard", "handyman"), "services");
  assert.equal(cabinetForPath("/dashboard", "spaceship"), "guest");
  // The root layout's copy: public pages, sign-in and registration.
  assert.equal(cabinetForPath("/"), "public");
  assert.equal(cabinetForPath("/apartments/abc"), "public");
  assert.equal(cabinetForPath("/notifications", "seller"), "public");
  assert.equal(cabinetForPath("/auth/login"), "auth");
  assert.equal(cabinetForPath("/auth/register"), "auth");
  assert.equal(cabinetForPath("/join/winter"), "auth");
  assert.equal(cabinetForPath("/created-by"), "public");
});

test("parseJevPlan infers a kind the model left out", () => {
  const allowed = new Set(["e1", "e2"]);
  assert.deepEqual(
    parseJevPlan(
      {
        intro: "შეავსეთ ველები.",
        steps: [{ target: "e1", action: "type", say: "ჩაწერეთ „სათაური“" }],
        done: false,
      },
      allowed,
    ),
    {
      kind: "steps",
      intro: "შეავსეთ ველები.",
      steps: [{ target: "e1", action: "type", say: "ჩაწერეთ „სათაური“" }],
      done: false,
    },
  );
  const asked = parseJevPlan(
    { intro: "", question: "რომელი ტარიფი?", options: ["ზამთარი"] },
    allowed,
  );
  assert.equal(asked?.kind, "ask");
  assert.equal(parseJevPlan({ intro: "x", steps: [] }, allowed), null);
});

test("stripLocale removes only a real locale prefix", () => {
  assert.equal(stripLocale("/en/dashboard/renter"), "/dashboard/renter");
  assert.equal(stripLocale("/ru"), "/");
  assert.equal(stripLocale("/dashboard/renter"), "/dashboard/renter");
  assert.equal(stripLocale("/english/x"), "/english/x");
});

test("admin pages are private by default; private items get neutral labels", () => {
  assert.equal(isPrivatePath("/dashboard/admin"), true);
  assert.equal(isPrivatePath("/dashboard/admin/clients/:id"), true);
  assert.equal(isPrivatePath("/dashboard/administrator"), false);
  assert.equal(isPrivatePath("/dashboard/renter/guests"), false);
  assert.equal(privateItemLabel(3), "[item 3]");
  // The server keeps the placeholder as it is.
  const [element] = normalizeElements([
    {
      id: "e1",
      kind: "button",
      label: privateItemLabel(1),
      section: "სტუმრები",
    },
  ]);
  assert.equal(element.label, "[item 1]");
});

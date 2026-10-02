import {
  assertEquals,
  assertFalse,
  assertStringIncludes,
} from "https://deno.land/std@0.177.0/testing/asserts.ts";
import {
  buildCheckIn,
  buildConsentRequest,
  buildReviewRequest,
  buildWinBack,
  type Candidate,
  type Rule,
  tbilisiDate,
  toCanonicalGePhone,
} from "./domain.ts";

const PIN = "\u{1F4CD}";
const PHONE = "☎️";

/** Georgian goes out as UCS-2: 70 UTF-16 units in one SMS, 67 per segment after. */
function segments(text: string): number {
  return text.length <= 70 ? 1 : Math.ceil(text.length / 67);
}

const rule: Rule = {
  user_id: "owner",
  display_name: null,
  owner_phone: "+995555000000",
  check_in_reminder_enabled: true,
  review_request_enabled: true,
  win_back_enabled: true,
  win_back_discount_value: "15%",
  win_back_discount_period: "ნოემბრის ბოლომდე",
};

const candidate: Candidate = {
  source: "platform",
  booking_id: "booking-id",
  owner_id: "owner",
  recipient_id: "guest",
  guest_phone: "+995555111111",
  guest_name: "ნინო",
  property: {
    id: "property-id",
    type: "apartment",
    is_for_sale: false,
    location_lat: 41.75,
    location_lng: 43.53,
    phone: null,
    check_in_time: "15:30:00",
    title: "ნინოს ბინა",
  },
};

Deno.test("canonical Georgian phone rejects extra legacy digits", () => {
  assertEquals(toCanonicalGePhone("555 111 111"), "+995555111111");
  assertEquals(toCanonicalGePhone("+995 555 111 111"), "+995555111111");
  assertEquals(toCanonicalGePhone("995555111111999"), null);
  assertEquals(toCanonicalGePhone("59911111"), null);
});

Deno.test("Tbilisi date uses UTC+4 at the UTC day boundary", () => {
  const atUtcEvening = Date.parse("2026-07-31T21:30:00.000Z");
  assertEquals(tbilisiDate(0, atUtcEvening), "2026-08-01");
  assertEquals(tbilisiDate(1, atUtcEvening), "2026-08-02");
});

Deno.test("check-in text uses fallback name and drops unavailable clauses", () => {
  const message = buildCheckIn(
    {
      ...candidate,
      guest_name: "",
      property: candidate.property && {
        ...candidate.property,
        location_lat: null,
        location_lng: null,
      },
    },
    { ...rule, owner_phone: null },
  );
  assertEquals(
    message,
    "გამარჯობა, ძვირფასო სტუმარო! გელოდებით ხვალ 15:30-დან — ნინოს ბინა.",
  );
  assertFalse(/\[[A-Za-z_]+\]/.test(message));
});

Deno.test("check-in text is one line: name, map pin and host number", () => {
  const message = buildCheckIn(
    {
      ...candidate,
      guest_name: "ილო",
      property: candidate.property && {
        ...candidate.property,
        type: "studio",
        location_lat: 41.666867,
        location_lng: 44.751657,
        phone: "+995 577 350 909",
        check_in_time: "14:00:00",
        title: "ბინა მთაში",
      },
    },
    rule,
  );
  assertEquals(
    message,
    "გამარჯობა, ილო! გელოდებით ხვალ 14:00-დან — ბინა მთაში. " +
      `${PIN}https://maps.google.com/?q=41.66687,44.75166 ${PHONE}+995577350909`,
  );
});

Deno.test("check-in text falls back to the owner's number and drops the name clause when the title is blank", () => {
  const message = buildCheckIn(
    {
      ...candidate,
      property: candidate.property && { ...candidate.property, title: " \n " },
    },
    rule,
  );
  assertEquals(
    message,
    "გამარჯობა, ნინო! გელოდებით ხვალ 15:30-დან. " +
      `${PIN}https://maps.google.com/?q=41.75,43.53 ${PHONE}+995555000000`,
  );
});

Deno.test("check-in text keeps an owner-typed title on one line, verbatim", () => {
  const message = buildCheckIn(
    {
      ...candidate,
      property: candidate.property && {
        ...candidate.property,
        title: "ბინა\n[Map_Link] $& 📍x y",
      },
    },
    rule,
  );
  assertFalse(message.includes("\n"));
  assertStringIncludes(message, "— ბინა [Map_Link] $& 📍x y. ");
  assertEquals(message.split("https://maps.google.com/").length - 1, 1);
});

Deno.test("check-in text clamps name, title and a non-Georgian number", () => {
  const message = buildCheckIn(
    {
      ...candidate,
      guest_name: "ა".repeat(100),
      property: candidate.property && {
        ...candidate.property,
        phone: "+995 577 350 909 / +995 599 000 000",
        title: "ბ".repeat(100),
      },
    },
    rule,
  );
  assertStringIncludes(message, `გამარჯობა, ${"ა".repeat(20)}! `);
  assertStringIncludes(message, `— ${"ბ".repeat(25)}. `);
  assertStringIncludes(message, `${PHONE}+995 577 350 909 / +`);
});

Deno.test("check-in text segment budget over the spec's input shapes", () => {
  const full = candidate.property!;
  const cases: {
    name: string;
    candidate: Candidate;
    rule?: Rule;
    length: number;
    sms: number;
  }[] = [
    {
      name: "short name, nothing optional",
      candidate: {
        ...candidate,
        property: {
          ...full,
          title: "",
          location_lat: null,
          location_lng: null,
          phone: null,
        },
      },
      rule: { ...rule, owner_phone: null },
      length: 42,
      sms: 1,
    },
    {
      name: "medium name, everything",
      candidate: {
        ...candidate,
        guest_name: "ა".repeat(10),
        property: {
          ...full,
          title: "მთის ბინა",
          location_lat: 41.666867,
          location_lng: 44.751657,
          phone: "+995577350909",
        },
      },
      length: 123,
      sms: 2,
    },
    {
      name: "maximum name and title, everything",
      candidate: {
        ...candidate,
        guest_name: "ა".repeat(20),
        property: {
          ...full,
          title: "ბ".repeat(25),
          location_lat: 41.666867,
          location_lng: 44.751657,
          phone: "+995577350909",
        },
      },
      length: 149,
      sms: 3,
    },
    {
      name: "very long listing name, everything",
      candidate: {
        ...candidate,
        property: {
          ...full,
          title: "ბ".repeat(300),
          location_lat: 41.666867,
          location_lng: 44.751657,
          phone: "+995577350909",
        },
      },
      length: 133,
      sms: 2,
    },
    {
      name: "maximum name and title, nothing else",
      candidate: {
        ...candidate,
        guest_name: "ა".repeat(20),
        property: {
          ...full,
          title: "ბ".repeat(25),
          location_lat: null,
          location_lng: null,
          phone: null,
        },
      },
      rule: { ...rule, owner_phone: null },
      length: 86,
      sms: 2,
    },
    {
      name: "worst case: 15-digit pin, two numbers typed, 100-letter name",
      candidate: {
        ...candidate,
        guest_name: "ა".repeat(100),
        property: {
          ...full,
          title: "ბ".repeat(100),
          location_lat: 41.123456789012345,
          location_lng: 44.123456789012345,
          phone: "+995 577 350 909 / +995 599 000 000",
        },
      },
      length: 156,
      sms: 3,
    },
  ];
  for (const c of cases) {
    const message = buildCheckIn(c.candidate, c.rule ?? rule);
    assertEquals(message.length, c.length, c.name);
    assertEquals(segments(message), c.sms, c.name);
    assertFalse(/\[[A-Za-z_]+\]/.test(message), c.name);
  }
});

Deno.test("review text is short and carries the canonical routes", () => {
  const platform = buildReviewRequest(candidate, "https://example.com");
  assertEquals(
    platform,
    "ნინო, მადლობა! შეგვიფასეთ ბინა: https://example.com/dashboard/guest/rate/booking-id — MyBakuriani",
  );
  const manual = buildReviewRequest(
    { ...candidate, source: "manual", recipient_id: null },
    "https://example.com",
    "a".repeat(64),
  );
  assertStringIncludes(manual, `https://example.com/review/${"a".repeat(64)}`);
  assertFalse(manual.includes("dashboard/guest/rate"));
});

Deno.test("win-back keeps the offer, its period and the property link", () => {
  assertEquals(
    buildWinBack(candidate, rule, "https://example.com"),
    "ნინო, დაბრუნდით ბაკურიანში! მიიღეთ 15% ფასდაკლება (ნოემბრის ბოლომდე): https://example.com/apartments/property-id — MyBakuriani",
  );
});

Deno.test("win-back falls back when either owner field is empty", () => {
  for (
    const empty of [
      { win_back_discount_period: null },
      { win_back_discount_value: " " },
    ]
  ) {
    const message = buildWinBack(
      candidate,
      { ...rule, ...empty },
      "https://example.com",
    );
    assertEquals(
      message,
      "ნინო, დაბრუნდით ბაკურიანში! თქვენთვის სპეციალური შეთავაზება: https://example.com/apartments/property-id — MyBakuriani",
    );
    assertFalse(message.includes("[Discount_Value]"));
    assertFalse(message.includes("[Discount_Period]"));
  }
});

Deno.test("consent request asks plainly, offers accept or decline, carries only the link", () => {
  const link = `https://staging.mybakuriani.ge/sms-consent/${"A".repeat(43)}`;
  const message = buildConsentRequest(link);
  assertEquals(
    message,
    `MyBakuriani.ge: გსურთ მარკეტინგული SMS-ების მიღება? დაადასტურეთ ან უარი თქვით: ${link}`,
  );
  assertEquals(message.length <= 320, true);
});

Deno.test("link-bearing texts stay within 3 segments with production-sized links", () => {
  const site = "https://mybakuriani.ge";
  const id = "3f2b8c1e-9a47-4d65-b0e2-7c1d5a9e4f60";
  const withId = {
    ...candidate,
    booking_id: id,
    property: candidate.property && { ...candidate.property, id },
  };
  const texts = {
    "review (platform link)": buildReviewRequest(withId, site),
    "review (manual link)": buildReviewRequest(
      { ...withId, source: "manual" },
      site,
      "a".repeat(64),
    ),
    "win-back": buildWinBack(withId, rule, site),
    "win-back fallback": buildWinBack(
      withId,
      { ...rule, win_back_discount_period: null },
      site,
    ),
    "consent": buildConsentRequest(`${site}/sms-consent/${"A".repeat(43)}`),
  };
  for (const [name, text] of Object.entries(texts)) {
    assertEquals(segments(text) <= 3, true, `${name}: ${text.length} units`);
  }
});

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
    status: "active",
  },
};

const SITE = "https://mybakuriani.ge";

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
    SITE,
  );
  assertStringIncludes(message, "ძვირფასო სტუმარო");
  assertFalse(/\[[A-Za-z_]+\]/.test(message));
  assertFalse(message.includes("📍"));
  assertFalse(message.includes("☎️"));
});

Deno.test("check-in text names the property and links its listing", () => {
  const message = buildCheckIn(
    {
      ...candidate,
      guest_name: "ილო",
      property: candidate.property && {
        ...candidate.property,
        type: "studio",
        location_lat: 41.666867,
        location_lng: 44.751657,
        phone: "+995577350909",
        check_in_time: "14:00:00",
        title: "საუკეთესო ბინა ჯიგრულ ფასად",
      },
    },
    rule,
    "https://staging.mybakuriani.ge",
  );
  assertEquals(
    message,
    "გამარჯობა, ილო! გელოდებით ხვალ, 14:00 საათიდან — საუკეთესო ბინა ჯიგრულ ფასად.\n" +
      "🔗 https://staging.mybakuriani.ge/apartments/property-id\n" +
      "📍 https://maps.google.com/?q=41.666867,44.751657\n" +
      "☎️ +995577350909\n" +
      "კარგ დასვენებას გისურვებთ!",
  );
});

Deno.test("check-in text links a hotel under /hotels", () => {
  const message = buildCheckIn(
    {
      ...candidate,
      property: candidate.property && { ...candidate.property, type: "hotel" },
    },
    rule,
    SITE,
  );
  assertStringIncludes(message, `🔗 ${SITE}/hotels/property-id\n`);
});

Deno.test("check-in text has no link for a listing that is not active", () => {
  for (const status of ["draft", "blocked", null]) {
    const message = buildCheckIn(
      {
        ...candidate,
        property: candidate.property && { ...candidate.property, status },
      },
      rule,
      SITE,
    );
    assertFalse(message.includes("🔗"));
    assertFalse(message.includes("/apartments/"));
    assertStringIncludes(message, "ნინოს ბინა");
  }
});

Deno.test("check-in text drops the name clause when the title is blank", () => {
  const message = buildCheckIn(
    {
      ...candidate,
      property: candidate.property && { ...candidate.property, title: " \n " },
    },
    rule,
    SITE,
  );
  assertStringIncludes(message, "15:30 საათიდან.\n");
  assertFalse(message.includes("—"));
});

Deno.test("check-in text keeps an owner-typed title on one line, verbatim", () => {
  const message = buildCheckIn(
    {
      ...candidate,
      property: candidate.property && {
        ...candidate.property,
        title: "ბინა\n📍 evil.ge $& [Map_Link]\u2028x",
      },
    },
    rule,
    SITE,
  );
  const lines = message.split("\n");
  assertEquals(lines.length, 5);
  assertStringIncludes(
    lines[0],
    "— ბინა 📍 evil.ge $& [Map_Link] x.",
  );
  assertEquals(lines[2], "📍 https://maps.google.com/?q=41.75,43.53");
});

Deno.test("check-in text stays within the 320-character column", () => {
  const message = buildCheckIn(
    {
      ...candidate,
      guest_name: "ა".repeat(100),
      property: candidate.property && {
        ...candidate.property,
        type: "hotel",
        location_lat: 41.123456789012345,
        location_lng: 44.123456789012345,
        phone: "+995 577 350 909 / +995 599 000 000",
        title: "ბ".repeat(100),
      },
    },
    rule,
    "https://staging.mybakuriani.ge",
  );
  assertEquals(message.length <= 320, true);
  assertStringIncludes(message, "კარგ დასვენებას გისურვებთ!");
});

Deno.test("review and win-back links use the canonical routes", () => {
  assertStringIncludes(
    buildReviewRequest(candidate, "https://example.com"),
    "https://example.com/dashboard/guest/rate/booking-id",
  );
  const message = buildWinBack(candidate, rule, "https://example.com");
  assertStringIncludes(message, "15%");
  assertStringIncludes(message, "ნოემბრის ბოლომდე");
  assertStringIncludes(message, "https://example.com/apartments/property-id");
});

Deno.test("manual review requests use the single-use public token route", () => {
  const message = buildReviewRequest(
    { ...candidate, source: "manual", recipient_id: null },
    "https://example.com",
    "a".repeat(64),
  );
  assertStringIncludes(message, `https://example.com/review/${"a".repeat(64)}`);
  assertFalse(message.includes("dashboard/guest/rate"));
});

Deno.test("win-back falls back when either owner field is empty", () => {
  const message = buildWinBack(
    candidate,
    { ...rule, win_back_discount_period: null },
    "https://example.com",
  );
  assertStringIncludes(message, "სპეციალური ფასდაკლება ექსკლუზიურად თქვენთვის");
  assertFalse(message.includes("[Discount_Value]"));
  assertFalse(message.includes("[Discount_Period]"));
});

Deno.test("consent request carries the guest link and nothing else variable", () => {
  const link = `https://staging.mybakuriani.ge/sms-consent/${"A".repeat(43)}`;
  const message = buildConsentRequest(link);
  assertStringIncludes(message, link);
  assertFalse(/\[[A-Za-z_]+\]/.test(message));
  assertEquals(message.length <= 320, true);
});

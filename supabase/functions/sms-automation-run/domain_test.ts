import {
  assertEquals,
  assertFalse,
  assertStringIncludes,
} from "https://deno.land/std@0.177.0/testing/asserts.ts";
import {
  buildCheckIn,
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
  assertStringIncludes(message, "ძვირფასო სტუმარო");
  assertFalse(message.includes("[Map_Link]"));
  assertFalse(message.includes("[Host_Phone]"));
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

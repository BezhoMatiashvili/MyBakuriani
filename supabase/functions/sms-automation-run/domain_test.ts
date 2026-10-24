import {
  assert,
  assertEquals,
  assertFalse,
  assertStringIncludes,
} from "https://deno.land/std@0.177.0/testing/asserts.ts";
import {
  buildAuthCode,
  buildCheckIn,
  buildConsentRequest,
  buildWinBack,
  type Candidate,
  missedDailyRun,
  type Rule,
  SHORT_NOTICE_DELAY_MS,
  shortNoticeWindow,
  tbilisiDate,
  toCanonicalGePhone,
} from "./domain.ts";

const PIN = "\u{1F4CD}";
const LINK = "\u{1F517}";
const PHONE = "☎️";
const SITE = "https://mybakuriani.ge";
// The longest host the function runs on, for the length budget.
const STAGING = "https://staging.mybakuriani.ge";
const LISTING_ID = "3590e66c-c48a-40a0-a7f4-79e0fa82b384";

/** Georgian goes out as UCS-2: 70 UTF-16 units in one SMS, 67 per segment after. */
function segments(text: string): number {
  return text.length <= 70 ? 1 : Math.ceil(text.length / 67);
}

const rule: Rule = {
  user_id: "owner",
  display_name: null,
  owner_phone: "+995555000000",
  check_in_reminder_enabled: true,
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
    location: "ცენტრი / პარკი",
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

Deno.test("check-in text names today for a stay that begins today", () => {
  const tomorrow = buildCheckIn(candidate, rule, SITE, false);
  const today = buildCheckIn(candidate, rule, SITE, false, "today");
  assertStringIncludes(today, "გელოდებით დღეს 15:30-დან");
  assertEquals(today, tomorrow.replace("ხვალ", "დღეს"));
});

// sms-automation-daily fires at 10:00 in Tbilisi (06:00 UTC) the day before check-in.
Deno.test("a booking is short notice once the daily run for its check-in has fired", () => {
  const checkIn = "2026-10-24"; // its daily run: 2026-10-23T06:00:00Z
  assertFalse(missedDailyRun(checkIn, "2026-10-23T05:59:59.999Z"));
  // At the boundary both runs may see it: a duplicate is free, a gap is not.
  assert(missedDailyRun(checkIn, "2026-10-23T06:00:00.000Z"));
  // 15:00 the day before is 23 h before a midnight check-in and 27 h before a 14:00
  // one: a "less than 24 h" rule would text neither the daily run nor this one.
  assert(missedDailyRun(checkIn, "2026-10-23T11:00:00Z"));
  assert(missedDailyRun(checkIn, "2026-10-24T07:00:00Z")); // the day itself
  assertFalse(missedDailyRun(checkIn, "2026-10-20T09:00:00Z")); // days ahead: daily
  assertFalse(missedDailyRun(checkIn, null));
  assertFalse(missedDailyRun(checkIn, "not a date"));
});

Deno.test("the short-notice window follows the Tbilisi day", () => {
  assertEquals(shortNoticeWindow(Date.parse("2026-10-23T08:20:00Z")), {
    today: "2026-10-23",
    tomorrow: "2026-10-24",
    from: "2026-10-22T06:00:00.000Z", // the daily run for a stay today
    to: "2026-10-23T07:20:00.000Z", // booked at least an hour ago
  });
  const afterMidnight = shortNoticeWindow(Date.parse("2026-10-23T20:30:00Z"));
  assertEquals(afterMidnight.today, "2026-10-24");
  assertEquals(afterMidnight.tomorrow, "2026-10-25");
});

Deno.test("a booking made at 23:30 for tomorrow is texted an hour later as today", () => {
  const created = "2026-10-23T19:30:00Z"; // 23:30 in Tbilisi, the stay begins tomorrow
  const w = shortNoticeWindow(Date.parse(created) + SHORT_NOTICE_DELAY_MS);
  assertEquals(w.today, "2026-10-24"); // 00:30: it is the check-in day now
  assert(Date.parse(created) >= Date.parse(w.from));
  assert(Date.parse(created) <= Date.parse(w.to)); // exactly an hour old: in
  assert(missedDailyRun("2026-10-24", created));
  // One minute earlier it is not an hour old yet.
  const early = shortNoticeWindow(Date.parse(created) + SHORT_NOTICE_DELAY_MS - 60_000);
  assert(Date.parse(created) > Date.parse(early.to));
});

Deno.test("check-in text uses fallback name and drops unavailable lines", () => {
  const message = buildCheckIn(
    {
      ...candidate,
      guest_name: "",
      property: candidate.property && {
        ...candidate.property,
        location_lat: null,
        location_lng: null,
        location: " ",
      },
    },
    { ...rule, owner_phone: null },
    SITE,
    false,
  );
  assertEquals(
    message,
    "გამარჯობა, ძვირფასო სტუმარო! გელოდებით ხვალ 15:30-დან — ნინოს ბინა.",
  );
  assertFalse(/\[[A-Za-z_]+\]/.test(message));
});

Deno.test("check-in text: listing link, map pin and host number on their own lines", () => {
  const message = buildCheckIn(
    {
      ...candidate,
      guest_name: "ილო",
      property: candidate.property && {
        ...candidate.property,
        id: LISTING_ID,
        type: "studio",
        location_lat: 41.666867,
        location_lng: 44.751657,
        phone: "+995 577 350 909",
        check_in_time: "14:00:00",
        title: "ბინა მთაში",
      },
    },
    rule,
    SITE,
    true,
  );
  assertEquals(
    message,
    "გამარჯობა, ილო! გელოდებით ხვალ 14:00-დან — ბინა მთაში.\n" +
      `${LINK} ${SITE}/apartments/${LISTING_ID}\n` +
      `${PIN} https://maps.google.com/?q=41.66687,44.75166\n` +
      `${PHONE} +995577350909`,
  );
});

// Staging 2026-10-10: a hotel with no pin got neither a link nor a location.
Deno.test("check-in text names a pin-less listing's area as text, never a zone pin", () => {
  const message = buildCheckIn(
    {
      ...candidate,
      source: "manual",
      recipient_id: null,
      guest_name: "Nino",
      property: {
        id: LISTING_ID,
        type: "hotel",
        is_for_sale: false,
        location_lat: null,
        location_lng: null,
        location: "დიდველი / კრისტალი",
        phone: "+995577350909",
        check_in_time: "14:00:00",
        title: "კრისტალ ლოფტში",
      },
    },
    rule,
    SITE,
    true,
  );
  assertEquals(
    message,
    "გამარჯობა, Nino! გელოდებით ხვალ 14:00-დან — კრისტალ ლოფტში.\n" +
      `${LINK} ${SITE}/hotels/${LISTING_ID}\n` +
      `${PIN} დიდველი / კრისტალი\n` +
      `${PHONE} +995577350909`,
  );
  assertFalse(message.includes("maps.google.com"));
  assertEquals(segments(message), 3);
});

// F-V5-R8-01: a numeric NaN reaches the function as the string "NaN" (PostgREST),
// and its toFixed ended the whole daily run. A pin that is not a finite number
// is no pin: the text names the area, like a pin-less listing's.
Deno.test("check-in text treats a non-numeric pin as no pin", () => {
  const withPin = (lat: unknown, lng: unknown) =>
    buildCheckIn(
      {
        ...candidate,
        property: candidate.property && {
          ...candidate.property,
          location_lat: lat as number,
          location_lng: lng as number,
        },
      },
      rule,
      SITE,
      true,
    );
  const noPin = withPin(null, null);
  assertFalse(noPin.includes("maps.google.com"));
  for (
    const [lat, lng] of [
      ["NaN", "NaN"],
      ["NaN", 43.53],
      [41.75, "NaN"],
      [Number.NaN, Number.NaN],
      ["41.75", "43.53"],
    ]
  ) {
    assertEquals(withPin(lat, lng), noPin, `${String(lat)},${String(lng)}`);
  }
  assertStringIncludes(withPin(41.75, 43.53), "maps.google.com/?q=41.75,43.53");
});

Deno.test("check-in text links no listing the site does not show", () => {
  const message = buildCheckIn(candidate, rule, SITE, false);
  assertFalse(message.includes(SITE));
  assertFalse(message.includes(LINK));
  assertEquals(
    message,
    "გამარჯობა, ნინო! გელოდებით ხვალ 15:30-დან — ნინოს ბინა.\n" +
      `${PIN} https://maps.google.com/?q=41.75,43.53\n` +
      `${PHONE} +995555000000`,
  );
});

Deno.test("check-in text falls back to the owner's number and drops the name clause when the title is blank", () => {
  const message = buildCheckIn(
    {
      ...candidate,
      property: candidate.property && { ...candidate.property, title: " \n " },
    },
    rule,
    SITE,
    true,
  );
  assertEquals(
    message,
    "გამარჯობა, ნინო! გელოდებით ხვალ 15:30-დან.\n" +
      `${LINK} ${SITE}/apartments/property-id\n` +
      `${PIN} https://maps.google.com/?q=41.75,43.53\n` +
      `${PHONE} +995555000000`,
  );
});

Deno.test("check-in text keeps owner-typed title and area on their own line, verbatim", () => {
  const message = buildCheckIn(
    {
      ...candidate,
      property: candidate.property && {
        ...candidate.property,
        location_lat: null,
        location_lng: null,
        title: "ბინა\n[Location] $& 📍x y",
        location: "ზონა\r\n[Host_Phone] $1",
      },
    },
    rule,
    SITE,
    true,
  );
  const lines = message.split("\n");
  assertEquals(lines.length, 4);
  assertStringIncludes(lines[0], "— ბინა [Location] $& 📍x y.");
  assertEquals(lines[2], `${PIN} ზონა [Host_Phone] $1`);
  assertEquals(lines[3], `${PHONE} +995555000000`);
});

Deno.test("check-in text clamps name, title, area and a non-Georgian number", () => {
  const message = buildCheckIn(
    {
      ...candidate,
      guest_name: "ა".repeat(100),
      property: candidate.property && {
        ...candidate.property,
        location_lat: null,
        location_lng: null,
        location: "გ".repeat(100),
        phone: "+995 577 350 909 / +995 599 000 000",
        title: "ბ".repeat(100),
      },
    },
    rule,
    SITE,
    true,
  );
  assertStringIncludes(message, `გამარჯობა, ${"ა".repeat(20)}! `);
  assertStringIncludes(message, `— ${"ბ".repeat(25)}.\n`);
  assertStringIncludes(message, `\n${PIN} ${"გ".repeat(30)}\n`);
  assertStringIncludes(message, `${PHONE} +995 577 350 909 / +`);
});

// sms_enqueue_automation cuts a message at 320 characters, so the longest text
// must stay under it; links decide the segment count.
Deno.test("check-in text length budget over the input shapes", () => {
  const full = { ...candidate.property!, id: LISTING_ID };
  const cases: {
    name: string;
    candidate: Candidate;
    rule?: Rule;
    visible?: boolean;
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
          location: null,
          phone: null,
        },
      },
      rule: { ...rule, owner_phone: null },
      visible: false,
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
      length: 207,
      sms: 4,
    },
    {
      name: "pin-less hotel with its zone, everything",
      candidate: {
        ...candidate,
        guest_name: "Nino",
        property: {
          ...full,
          type: "hotel",
          title: "კრისტალ ლოფტში",
          location_lat: null,
          location_lng: null,
          location: "დიდველი / კრისტალი",
          phone: "+995577350909",
          check_in_time: "14:00:00",
        },
      },
      length: 176,
      sms: 3,
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
      length: 233,
      sms: 4,
    },
    {
      name: "worst case: 15-digit pin, two numbers typed, 100-letter name",
      candidate: {
        ...candidate,
        guest_name: "ა".repeat(100),
        property: {
          ...full,
          title: "ბ".repeat(100),
          location_lat: -41.123456789012345,
          location_lng: -144.123456789012345,
          phone: "+995 577 350 909 / +995 599 000 000",
        },
      },
      length: 243,
      sms: 4,
    },
  ];
  for (const c of cases) {
    const message = buildCheckIn(
      c.candidate,
      c.rule ?? rule,
      STAGING,
      c.visible ?? true,
    );
    assertEquals(message.length, c.length, c.name);
    // "დღეს" and "ხვალ" are the same length: short notice changes no budget.
    assertEquals(
      buildCheckIn(c.candidate, c.rule ?? rule, STAGING, c.visible ?? true, "today")
        .length,
      c.length,
      c.name,
    );
    assertEquals(segments(message), c.sms, c.name);
    assert(message.length <= 320, c.name);
    assertFalse(/\[[A-Za-z_]+\]/.test(message), c.name);
  }
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

// Owner-typed text never reaches a phone as a link (C18, C33): a dot between two
// non-space characters becomes U+2024 and "://" becomes ":/ /", as
// public._notice_text does for notifications. The links the texts build stay.
Deno.test("owner-typed text in check-in and win-back texts is never a link", () => {
  const LEADER = "\u2024";
  const listing = `${SITE}/apartments/property-id`;
  const checkIn = buildCheckIn(
    {
      ...candidate,
      guest_name: "nino.ge",
      property: candidate.property && {
        ...candidate.property,
        location_lat: null,
        location_lng: null,
        title: "evil.ge/x",
        location: "https://evil.ge/y",
        phone: "call evil.ge",
      },
    },
    rule,
    SITE,
    true,
  );
  assertStringIncludes(checkIn, listing);
  assertFalse(
    /[^\s.]\.[^\s.]|:\/\//.test(checkIn.replace(listing, "")),
    checkIn,
  );
  assertStringIncludes(checkIn, `nino${LEADER}ge`);
  assertStringIncludes(checkIn, `evil${LEADER}ge/x`);
  assertStringIncludes(checkIn, `https:/ /evil${LEADER}ge/y`);
  assertStringIncludes(checkIn, `call evil${LEADER}ge`);
  const winBack = buildWinBack(
    candidate,
    {
      ...rule,
      win_back_discount_value: "x.ge",
      win_back_discount_period: "https://y.ge",
    },
    "https://example.com",
  );
  assertStringIncludes(winBack, `x${LEADER}ge`);
  assertStringIncludes(winBack, `(https:/ /y${LEADER}ge)`);
  assertStringIncludes(winBack, "https://example.com/apartments/property-id");
});

Deno.test("owner-typed text drops bidi and zero-width characters", () => {
  const message = buildCheckIn(
    {
      ...candidate,
      property: candidate.property && {
        ...candidate.property,
        title: "a\u202Eb\u200Bc",
      },
    },
    rule,
    SITE,
    true,
  );
  assertStringIncludes(message, "— a b c.");
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
    property: candidate.property && { ...candidate.property, id },
  };
  const texts = {
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

Deno.test("the sign-in code fits one SMS on the production host", () => {
  const text = buildAuthCode("123456", "mybakuriani.ge");
  assertEquals(
    text,
    "MyBakuriani კოდი: 123456. არავის გაუზიაროთ.\n@mybakuriani.ge #123456",
  );
  assertEquals(segments(text), 1, `${text.length} units`);
  // WebOTP: the origin-bound line is the last line.
  assertEquals(text.split("\n").at(-1), "@mybakuriani.ge #123456");
  assertEquals(segments(buildAuthCode("123456", "staging.mybakuriani.ge")) <= 2, true);
  assertEquals(buildAuthCode("123456", null), "MyBakuriani კოდი: 123456. არავის გაუზიაროთ.");
});

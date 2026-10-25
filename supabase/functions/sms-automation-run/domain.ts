export type AutomationKind = "check_in" | "win_back";

// Spec-mandated texts. This module is the single template source of truth.
// Written to MyBakuriani_SMS_Optimization_Spec-2.md: Georgian goes out as UCS-2,
// 70 UTF-16 units in one SMS and 67 per segment once it is split, so every value
// below is clamped and the texts carry no filler.
export const TEMPLATES = {
  // One line per part. buildCheckIn drops the " — name" clause and every line
  // whose value is missing; each URL ends its own line, so nothing is glued to it.
  check_in:
    "გამარჯობა, [Guest_Name]! გელოდებით [Check_In_Day] [Check_In_Time]-დან — [Property_Name].\n🔗 [Listing_Link]\n📍 [Location]\n☎️ [Host_Phone]",
  win_back:
    "[Guest_Name], დაბრუნდით ბაკურიანში! მიიღეთ [Discount_Value] ფასდაკლება ([Discount_Period]): [Property_Direct_Link] — MyBakuriani",
  win_back_fallback:
    "[Guest_Name], დაბრუნდით ბაკურიანში! თქვენთვის სპეციალური შეთავაზება: [Property_Direct_Link] — MyBakuriani",
  // Last line of every win-back text: the guest's own opt-out link, /sms-stop/<token>
  // (owner's technical task 2026-10-25). It withdraws this host's offers to the number.
  win_back_opt_out: "უარის თქმა: [Opt_Out_Link]",
  // Sent by the platform when an owner asks for a manual-booking guest's
  // marketing consent (the owner never sees the link). No owner-typed text.
  consent_request:
    "MyBakuriani.ge: გსურთ მარკეტინგული SMS-ების მიღება? დაადასტურეთ ან უარი თქვით: [Consent_Link]",
  // Phone sign-in / phone-change code (C48), sent by the auth-send-sms hook.
  auth_code: "MyBakuriani კოდი: [Code]. არავის გაუზიაროთ.",
} as const;

const GUEST_NAME_FALLBACK = "ძვირფასო სტუმარო";
const GUEST_NAME_MAX = 20;
const PROPERTY_TITLE_MAX = 25;
// A pin-less listing's area (its zone name, or what the owner typed) as text.
const AREA_MAX = 30;
// Longest host number kept when it is not a Georgian mobile (those are 13).
const HOST_PHONE_MAX = 20;

export interface Rule {
  user_id: string;
  display_name: string | null;
  owner_phone: string | null;
  check_in_reminder_enabled: boolean;
  win_back_enabled: boolean;
  win_back_discount_value: string | null;
  win_back_discount_period: string | null;
}

export interface PropertyRef {
  id: string;
  type: string | null;
  is_for_sale: boolean | null;
  location_lat: number | null;
  location_lng: number | null;
  location: string | null;
  phone: string | null;
  check_in_time: string | null;
  title: string | null;
}

export interface Candidate {
  source: "platform" | "manual";
  booking_id: string;
  owner_id: string;
  recipient_id: string | null;
  guest_phone: string | null;
  guest_name: string | null;
  property: PropertyRef | null;
}

/** Accept only an exact Georgian mobile number after punctuation is removed. */
export function toCanonicalGePhone(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith("995")
    ? digits.slice(3)
    : digits.length === 9
    ? digits
    : "";
  return /^5\d{8}$/.test(local) ? `+995${local}` : null;
}

export function propertyViewPath(p: PropertyRef): string {
  if (p.is_for_sale) return `/sales/${p.id}`;
  if (p.type === "hotel") return `/hotels/${p.id}`;
  return `/apartments/${p.id}`;
}

/** Georgia has a fixed UTC+4 offset and no DST. */
export function tbilisiDate(offsetDays: number, now = Date.now()): string {
  const d = new Date(now + 4 * 3600_000);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Check-in texts go out only between these Tbilisi times (owner's technical task SMS-10,
 * 2026-10-25): from 09:00, never at or after 21:00. = SQL sms_check_in_window_open, which
 * holds a queued text back until the window opens (check-contracts C18/quiet-hours).
 */
export const CHECK_IN_SEND_WINDOW = { from: "09:00", to: "21:00" } as const;

/**
 * The Tbilisi day a check-in text queued at `now` first goes out: today, or tomorrow at
 * 09:00 once today's window has closed. = SQL sms_check_in_first_send_date.
 */
export function firstSendDate(now = Date.now()): string {
  const clock = new Date(now + 4 * 3600_000).toISOString().slice(11, 16);
  return tbilisiDate(clock >= CHECK_IN_SEND_WINDOW.to ? 1 : 0, now);
}

/** The day the check-in text names: the day it goes out decides today or tomorrow. */
export type CheckInDay = "today" | "tomorrow";

const CHECK_IN_DAY_WORD: Record<CheckInDay, string> = {
  today: "დღეს",
  tomorrow: "ხვალ",
};

// sms-automation-daily is `0 6 * * *` UTC, which is this time in Tbilisi (C18).
const DAILY_RUN_TIME = "10:00:00";
/** A short-notice text goes out once the booking is this old. */
export const SHORT_NOTICE_DELAY_MS = 3600_000;

/** The moment the daily run that texts `checkIn` (the day before) fires. */
function dailyRunBefore(checkIn: string): number {
  return Date.parse(`${checkIn}T${DAILY_RUN_TIME}+04:00`) - 86_400_000;
}

/**
 * True when the daily run for this check-in had already fired when the booking was
 * made, so only the short-notice run can text it. `>=`, not `>`: a booking made in
 * the second of the run may or may not be in its scan, and a duplicate costs
 * nothing (one row per booking and kind in the database) while a gap loses the text.
 */
export function missedDailyRun(
  checkIn: string,
  createdAt: string | null,
): boolean {
  const created = createdAt ? Date.parse(createdAt) : NaN;
  return Number.isFinite(created) && created >= dailyRunBefore(checkIn);
}

/**
 * What one short-notice run looks at: stays that begin today or tomorrow, made at
 * least SHORT_NOTICE_DELAY_MS ago and no earlier than the daily run for a stay
 * today (the earlier of the two; `missedDailyRun` then decides each row).
 */
export function shortNoticeWindow(now = Date.now()) {
  const today = tbilisiDate(0, now);
  return {
    today,
    tomorrow: tbilisiDate(1, now),
    // The day a text queued by this run first goes out (quiet hours): a check-in on
    // that day is "today" (დღეს), any later one "tomorrow" (ხვალ).
    sendDay: firstSendDate(now),
    from: new Date(dailyRunBefore(today)).toISOString(),
    to: new Date(now - SHORT_NOTICE_DELAY_MS).toISOString(),
  };
}

// Owner-typed text gets what public._notice_text gives user-typed text in a
// notification (C33): control, space, zero-width and bidi characters become one
// space (the C24 class), a dot between two non-space characters becomes U+2024
// and "://" becomes ":/ /", so a typed value never reaches a phone as a link.
const FLATTEN =
  /[\p{Cc}\s\u0001-\u0020\u007F-\u00A0\u00AD\u034F\u061C\u115F\u1160\u1680\u17B4\u17B5\u180E\u2000-\u200B\u200E\u200F\u2028-\u202F\u205F-\u206F\u2800\u3000\u3164\uFEFF\uFFA0\uFFF9-\uFFFC\u{E0001}\u{E0020}-\u{E007F}]+/gu;

function plainText(value: string | null): string {
  return (value ?? "")
    .replace(FLATTEN, " ")
    .trim()
    .replace(/([^\s.])\.(?=[^\s.])/gu, "$1\u2024")
    .split("://")
    .join(":/ /");
}

function clampName(name: string | null): string {
  const trimmed = plainText(name);
  if (!trimmed) return GUEST_NAME_FALLBACK;
  return trimmed.length > GUEST_NAME_MAX
    ? trimmed.slice(0, GUEST_NAME_MAX)
    : trimmed;
}

/** Owner-typed text as one line (no line breaks), cut to `max` characters. */
function clampOneLine(value: string | null, max: number): string {
  const oneLine = plainText(value);
  return Array.from(oneLine).slice(0, max).join("").trim();
}

/**
 * A pin to about a metre (5 decimals): the URL is the longest part of the text.
 * PostgREST sends a numeric NaN as the string "NaN", which an owner can store
 * (no range check on the column before 20261016130000): anything that is not a
 * finite number is no pin, and the text names the area instead.
 */
function pinCoordinate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Number(value.toFixed(5))
    : null;
}

/**
 * `listingVisible`: public_properties serves the listing (C31 hides a lapsed
 * owner's rentals), so its page opens. Otherwise the text carries no link.
 */
export function buildCheckIn(
  c: Candidate,
  rule: Rule,
  siteUrl: string,
  listingVisible: boolean,
  day: CheckInDay = "tomorrow",
): string {
  const p = c.property;
  const time = (p?.check_in_time ?? "14:00").slice(0, 5);
  const title = clampOneLine(p?.title ?? null, PROPERTY_TITLE_MAX);
  const listingLink = p && listingVisible
    ? `${siteUrl}${propertyViewPath(p)}`
    : null;
  const lat = pinCoordinate(p?.location_lat);
  const lng = pinCoordinate(p?.location_lng);
  const pin = lat !== null && lng !== null ? `${lat},${lng}` : null;
  // The owner's exact pin, else the area as text: a zone's centre on a map
  // would read as the exact spot and send the guest to the wrong place.
  const location = pin
    ? `https://maps.google.com/?q=${pin}`
    : (clampOneLine(p?.location ?? null, AREA_MAX) || null);
  // A Georgian mobile in its fixed +995 form; any other number as typed, cut short.
  const rawPhone = p?.phone ?? rule.owner_phone ?? null;
  const hostPhone = toCanonicalGePhone(rawPhone) ??
    (clampOneLine(rawPhone, HOST_PHONE_MAX) || null);

  const values: Record<string, string | null> = {
    Guest_Name: clampName(c.guest_name),
    Check_In_Day: CHECK_IN_DAY_WORD[day],
    Check_In_Time: time,
    Property_Name: title,
    Listing_Link: listingLink,
    Location: location,
    Host_Phone: hostPhone,
  };
  const template = title
    ? TEMPLATES.check_in
    : TEMPLATES.check_in.replace(" — [Property_Name]", "");
  // Single pass per line, so a value is never re-read as a placeholder or as a
  // `$` pattern; a line with a missing value is left out.
  return template
    .split("\n")
    .flatMap((line) => {
      let missing = false;
      const filled = line.replace(/\[(\w+)\]/g, (_, key: string) => {
        const value = values[key];
        if (!value) missing = true;
        return value ?? "";
      });
      return missing ? [] : [filled];
    })
    .join("\n");
}

/** `optOutLink`: the guest's /sms-stop/<token> URL, the text's last line. */
export function buildWinBack(
  c: Candidate,
  rule: Rule,
  siteUrl: string,
  optOutLink: string,
): string {
  const value = plainText(rule.win_back_discount_value);
  const period = plainText(rule.win_back_discount_period);
  const link = c.property
    ? `${siteUrl}${propertyViewPath(c.property)}`
    : siteUrl;

  const optOut = TEMPLATES.win_back_opt_out.replace(
    "[Opt_Out_Link]",
    () => optOutLink,
  );
  if (!value || !period) {
    return TEMPLATES.win_back_fallback
      .replace("[Guest_Name]", clampName(c.guest_name))
      .replace("[Property_Direct_Link]", link) + `\n${optOut}`;
  }
  return TEMPLATES.win_back
    .replace("[Guest_Name]", clampName(c.guest_name))
    .replace("[Discount_Value]", value)
    .replace("[Discount_Period]", period)
    .replace("[Property_Direct_Link]", link) + `\n${optOut}`;
}

/** The consent-request SMS; `consentLink` is the guest's /sms-consent/<token> URL. */
export function buildConsentRequest(consentLink: string): string {
  return TEMPLATES.consent_request.replace("[Consent_Link]", consentLink);
}

/**
 * The sign-in code SMS. With the site's host it ends in the origin-bound line
 * `@host #code` that Android's WebOTP and iOS code autofill read (the code is
 * then offered only on that site). 67 UTF-16 units for mybakuriani.ge: one SMS.
 */
export function buildAuthCode(code: string, host: string | null): string {
  const text = TEMPLATES.auth_code.replace("[Code]", code);
  return host ? `${text}\n@${host} #${code}` : text;
}

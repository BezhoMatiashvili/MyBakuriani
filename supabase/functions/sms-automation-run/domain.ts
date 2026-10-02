export type AutomationKind = "check_in" | "review_request" | "win_back";

// Spec-mandated texts. This module is the single template source of truth.
// Written to MyBakuriani_SMS_Optimization_Spec-2.md: Georgian goes out as UCS-2,
// 70 UTF-16 units in one SMS and 67 per segment once it is split, so every value
// below is clamped and the texts carry no filler.
export const TEMPLATES = {
  // One line. buildCheckIn drops the optional " — name", " 📍map" and
  // " ☎️phone" parts when their value is missing.
  check_in:
    "გამარჯობა, [Guest_Name]! გელოდებით ხვალ [Check_In_Time]-დან — [Property_Name]. 📍[Map_Link] ☎️[Host_Phone]",
  review_request:
    "[Guest_Name], მადლობა! შეგვიფასეთ ბინა: [Property_Review_Link] — MyBakuriani",
  win_back:
    "[Guest_Name], დაბრუნდით ბაკურიანში! მიიღეთ [Discount_Value] ფასდაკლება ([Discount_Period]): [Property_Direct_Link] — MyBakuriani",
  win_back_fallback:
    "[Guest_Name], დაბრუნდით ბაკურიანში! თქვენთვის სპეციალური შეთავაზება: [Property_Direct_Link] — MyBakuriani",
  // Sent by the platform when an owner asks for a manual-booking guest's
  // marketing consent (the owner never sees the link). No owner-typed text.
  consent_request:
    "MyBakuriani.ge: გსურთ მარკეტინგული SMS-ების მიღება? დაადასტურეთ ან უარი თქვით: [Consent_Link]",
} as const;

const GUEST_NAME_FALLBACK = "ძვირფასო სტუმარო";
const GUEST_NAME_MAX = 20;
const PROPERTY_TITLE_MAX = 25;
// Longest host number kept when it is not a Georgian mobile (those are 13).
const HOST_PHONE_MAX = 20;

export interface Rule {
  user_id: string;
  display_name: string | null;
  owner_phone: string | null;
  check_in_reminder_enabled: boolean;
  review_request_enabled: boolean;
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

function clampName(name: string | null): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return GUEST_NAME_FALLBACK;
  return trimmed.length > GUEST_NAME_MAX
    ? trimmed.slice(0, GUEST_NAME_MAX)
    : trimmed;
}

/** Owner-typed text as one line (no line breaks), cut to `max` characters. */
function clampOneLine(value: string | null, max: number): string {
  const oneLine = (value ?? "").replace(/[\p{Cc}\s]+/gu, " ").trim();
  return Array.from(oneLine).slice(0, max).join("").trim();
}

/** A pin to about a metre (5 decimals): the URL is the longest part of the text. */
function pinCoordinate(value: number): number {
  return Number(value.toFixed(5));
}

export function buildCheckIn(c: Candidate, rule: Rule): string {
  const p = c.property;
  const time = (p?.check_in_time ?? "14:00").slice(0, 5);
  const title = clampOneLine(p?.title ?? null, PROPERTY_TITLE_MAX);
  const pin = p && p.location_lat != null && p.location_lng != null
    ? [p.location_lat, p.location_lng].map(pinCoordinate).join(",")
    : null;
  const mapLink = pin ? `https://maps.google.com/?q=${pin}` : null;
  // A Georgian mobile in its fixed +995 form; any other number as typed, cut short.
  const rawPhone = p?.phone ?? rule.owner_phone ?? null;
  const hostPhone = toCanonicalGePhone(rawPhone) ??
    (clampOneLine(rawPhone, HOST_PHONE_MAX) || null);

  const values: Record<string, string | null> = {
    Guest_Name: clampName(c.guest_name),
    Check_In_Time: time,
    Property_Name: title,
    Map_Link: mapLink,
    Host_Phone: hostPhone,
  };
  let template: string = TEMPLATES.check_in;
  if (!title) template = template.replace(" — [Property_Name]", "");
  if (!mapLink) template = template.replace(" 📍[Map_Link]", "");
  if (!hostPhone) template = template.replace(" ☎️[Host_Phone]", "");
  // Single pass, so a value is never re-read as a placeholder or as a `$` pattern.
  return template.replace(/\[(\w+)\]/g, (_, key: string) => values[key] ?? "");
}

export function buildReviewRequest(
  c: Candidate,
  siteUrl: string,
  manualToken?: string,
): string {
  return TEMPLATES.review_request
    .replace("[Guest_Name]", clampName(c.guest_name))
    .replace(
      "[Property_Review_Link]",
      manualToken
        ? `${siteUrl}/review/${manualToken}`
        : `${siteUrl}/dashboard/guest/rate/${c.booking_id}`,
    );
}

export function buildWinBack(
  c: Candidate,
  rule: Rule,
  siteUrl: string,
): string {
  const value = (rule.win_back_discount_value ?? "").trim();
  const period = (rule.win_back_discount_period ?? "").trim();
  const link = c.property
    ? `${siteUrl}${propertyViewPath(c.property)}`
    : siteUrl;

  if (!value || !period) {
    return TEMPLATES.win_back_fallback
      .replace("[Guest_Name]", clampName(c.guest_name))
      .replace("[Property_Direct_Link]", link);
  }
  return TEMPLATES.win_back
    .replace("[Guest_Name]", clampName(c.guest_name))
    .replace("[Discount_Value]", value)
    .replace("[Discount_Period]", period)
    .replace("[Property_Direct_Link]", link);
}

/** The consent-request SMS; `consentLink` is the guest's /sms-consent/<token> URL. */
export function buildConsentRequest(consentLink: string): string {
  return TEMPLATES.consent_request.replace("[Consent_Link]", consentLink);
}

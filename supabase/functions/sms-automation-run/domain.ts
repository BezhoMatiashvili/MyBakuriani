export type AutomationKind = "check_in" | "review_request" | "win_back";

// Spec-mandated texts. This module is the only live template copy; the older
// src/lib/sms/templates.ts file has no importers and uses a different contract.
export const TEMPLATES = {
  check_in:
    "გამარჯობა [Guest_Name]. გელოდებით ხვალ [Check_In_Time]-დან. ლოკაცია: [Map_Link]. დეტალებისთვის: [Host_Phone]. კარგ დასვენებას გისურვებთ!",
  review_request:
    "[Guest_Name], მადლობა სტუმრობისთვის! მოხარული ვიქნებით თუ შეაფასებთ ჩვენს ბინას აქ: [Property_Review_Link]. თქვენი აზრი ჩვენთვის მნიშვნელოვანია! - MyBakuriani.ge",
  win_back:
    "მოგესალმებით [Guest_Name]. დაბრუნდით ბაკურიანში! დაჯავშნეთ ჩვენი ბინა და მიიღეთ [Discount_Value] ფასდაკლება ([Discount_Period]): [Property_Direct_Link]",
  win_back_fallback:
    "მოგესალმებით [Guest_Name]. დაბრუნდით ბაკურიანში! დაჯავშნეთ ჩვენი ბინა და მიიღეთ სპეციალური ფასდაკლება ექსკლუზიურად თქვენთვის: [Property_Direct_Link]",
} as const;

const GUEST_NAME_FALLBACK = "ძვირფასო სტუმარო";
const GUEST_NAME_MAX = 40;

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

export function buildCheckIn(c: Candidate, rule: Rule): string {
  const p = c.property;
  const time = (p?.check_in_time ?? "14:00").slice(0, 5);
  const mapLink = p && p.location_lat != null && p.location_lng != null
    ? `https://maps.google.com/?q=${p.location_lat},${p.location_lng}`
    : null;
  const hostPhone = p?.phone ?? rule.owner_phone ?? null;

  let message = TEMPLATES.check_in
    .replace("[Guest_Name]", clampName(c.guest_name))
    .replace("[Check_In_Time]", time);
  message = mapLink
    ? message.replace("[Map_Link]", mapLink)
    : message.replace(" ლოკაცია: [Map_Link].", "");
  message = hostPhone
    ? message.replace("[Host_Phone]", hostPhone)
    : message.replace(" დეტალებისთვის: [Host_Phone].", "");
  return message;
}

export function buildReviewRequest(c: Candidate, siteUrl: string): string {
  return TEMPLATES.review_request
    .replace("[Guest_Name]", clampName(c.guest_name))
    .replace(
      "[Property_Review_Link]",
      `${siteUrl}/dashboard/guest/rate/${c.booking_id}`,
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

export type AutomationKind = "check_in" | "review_request" | "win_back";

// Spec-mandated texts. This module is the single template source of truth.
export const TEMPLATES = {
  // One line per optional value: buildCheckIn drops a line whose value is
  // missing. Every URL ends its own line, so nothing is glued to it.
  check_in:
    "გამარჯობა, [Guest_Name]! გელოდებით ხვალ, [Check_In_Time] საათიდან — [Property_Name].\n🔗 [Listing_Link]\n📍 [Map_Link]\n☎️ [Host_Phone]\nკარგ დასვენებას გისურვებთ!",
  review_request:
    "[Guest_Name], მადლობა სტუმრობისთვის! მოხარული ვიქნებით თუ შეაფასებთ ჩვენს ბინას აქ: [Property_Review_Link]. თქვენი აზრი ჩვენთვის მნიშვნელოვანია! - MyBakuriani.ge",
  win_back:
    "მოგესალმებით [Guest_Name]. დაბრუნდით ბაკურიანში! დაჯავშნეთ ჩვენი ბინა და მიიღეთ [Discount_Value] ფასდაკლება ([Discount_Period]): [Property_Direct_Link]",
  win_back_fallback:
    "მოგესალმებით [Guest_Name]. დაბრუნდით ბაკურიანში! დაჯავშნეთ ჩვენი ბინა და მიიღეთ სპეციალური ფასდაკლება ექსკლუზიურად თქვენთვის: [Property_Direct_Link]",
  // Sent by the platform when an owner asks for a manual-booking guest's
  // marketing consent (the owner never sees the link). No owner-typed text.
  consent_request:
    "MyBakuriani.ge: თქვენი მასპინძელი გთხოვთ თანხმობას მარკეტინგული SMS-ების მისაღებად. დაადასტურეთ ან უარი თქვით: [Consent_Link]",
} as const;

const GUEST_NAME_FALLBACK = "ძვირფასო სტუმარო";
const GUEST_NAME_MAX = 40;
// sms_enqueue_automation cuts a message at 320 characters, which would drop the
// phone and the sign-off, so the owner-typed title is kept short.
const PROPERTY_TITLE_MAX = 40;

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
  status: string | null;
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

/** The property's name as one line: owner-typed, so no line breaks, and short. */
function clampPropertyTitle(title: string | null): string {
  const oneLine = (title ?? "").replace(/[\p{Cc}\s]+/gu, " ").trim();
  return Array.from(oneLine).slice(0, PROPERTY_TITLE_MAX).join("").trim();
}

export function buildCheckIn(
  c: Candidate,
  rule: Rule,
  siteUrl: string,
): string {
  const p = c.property;
  const time = (p?.check_in_time ?? "14:00").slice(0, 5);
  const title = clampPropertyTitle(p?.title ?? null);
  // Detail pages serve active listings only, so any other status gets no link.
  const listingLink = p && p.status === "active"
    ? `${siteUrl}${propertyViewPath(p)}`
    : null;
  const mapLink = p && p.location_lat != null && p.location_lng != null
    ? `https://maps.google.com/?q=${p.location_lat},${p.location_lng}`
    : null;
  const hostPhone = p?.phone ?? rule.owner_phone ?? null;

  const values: Record<string, string | null> = {
    Guest_Name: clampName(c.guest_name),
    Check_In_Time: time,
    Property_Name: title,
    Listing_Link: listingLink,
    Map_Link: mapLink,
    Host_Phone: hostPhone,
  };
  const template = title
    ? TEMPLATES.check_in
    : TEMPLATES.check_in.replace(" — [Property_Name]", "");
  // Single pass, so a value is never re-read as a placeholder or as a `$` pattern.
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

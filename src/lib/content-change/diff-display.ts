// Display helpers for content_change_requests.field_diff (admin review, C14).
// Pure: type-only "@/" imports, so scripts/unit loads it (C29).
import type { ContentChangeTarget } from "@/lib/content-change/fields";
import type { HotelRoom } from "@/lib/hotel-rooms";

/** AdminLogs.tables wording. */
export const TARGET_LABELS: Record<ContentChangeTarget, string> = {
  property: "განცხადება",
  service: "სერვისი",
  profile: "პროფილი",
  organization: "ორგანიზაცია",
};

/** Every REVIEWABLE_FIELDS key and the cleaner-profile keys
 * (scripts/unit/content-change-fields.test.mjs), plus nested keys. Wording is
 * copied from the forms and AdminShared.listingAudit where one exists. */
export const FIELD_LABELS: Record<string, string> = {
  type: "ბინის ტიპი",
  title: "სათაური",
  description: "აღწერა",
  location: "მისამართი",
  location_lat: "განედი (lat)",
  location_lng: "გრძედი (lng)",
  cadastral_code: "საკადასტრო კოდი",
  area_sqm: "ფართობი (მ²)",
  rooms: "ოთახი",
  bathrooms: "სველი წერტილი",
  capacity: "ტევადობა",
  price_per_night: "ფასი / ღამე",
  sale_price: "გასაყიდი ფასი",
  sale_price_gel: "გასაყიდი ფასი (₾)",
  sale_price_currency: "გასაყიდი ფასის ვალუტა",
  currency: "ვალუტა",
  amenities: "კეთილმოწყობა",
  photos: "ფოტოები",
  house_rules: "სახლის წესები",
  min_booking_days: "მინ. ღამე",
  is_for_sale: "გასაყიდი ობიექტი",
  roi_percent: "ROI %",
  roi_percent_max: "ROI % (მაქს)",
  construction_status: "მშენებლობის სტატუსი",
  developer: "დეველოპერი",
  cleaning_fee: "დასუფთავების საფასური",
  renovation_status: "რემონტის სტატუსი",
  hotel_stars: "ვარსკვლავი (სასტუმრო)",
  numeric_rating: "რეიტინგი",
  room_type: "ოთახის ტიპი",
  distance_to_slope_m: "მანძილი ფერდამდე (მ)",
  phone: "ტელეფონი",
  whatsapp: "WhatsApp",
  completion_year: "დასრულების წელი",
  units_total: "ბინები სულ",
  units_sold: "გაყიდული ბინები",
  units_reserved: "დაჯავშნილი ბინები",
  construction_stages: "სამუშაო ეტაპები",
  construction_progress_percent: "პროგრესი %",
  construction_image_url: "მშენებლობის ფოტო",
  hotel_rooms: "ნომრები",
  category: "კატეგორია",
  price: "ფასი",
  price_unit: "ფასის ერთეული",
  schedule: "გრაფიკი",
  driver_name: "მძღოლის სახელი",
  vehicle_capacity: "ადგილების რაოდენობა",
  route: "ძირითადი მარშრუტი",
  cuisine_type: "სამზარეულოს ტიპი",
  has_delivery: "მიტანის სერვისი",
  operating_hours: "სამუშაო საათები",
  menu: "მენიუ",
  position: "პოზიცია",
  salary_range: "ანაზღაურების დიაპაზონი",
  experience_required: "გამოცდილების მოთხოვნა",
  employment_schedule: "დასაქმების გრაფიკი",
  provider_name: "სახელი / კომპანია",
  service_field: "მომსახურების სფერო",
  languages: "ენები",
  vehicle_make: "ავტომობილი",
  transport_type: "ტრანსპორტის ტიპი",
  vehicle_color: "მანქანის ფერი",
  routes: "დამატებითი მარშრუტები",
  route_pricing: "მარშრუტების ფასები",
  equipment: "აღჭურვილობა",
  features: "მახასიათებლები",
  menu_url: "მენიუს URL",
  activity_type: "გართობის ტიპი",
  activity_category: "გართობის კატეგორია",
  duration: "ხანგრძლივობა",
  age_min: "ასაკი",
  good_for: "ვისთვის არის",
  coords: "კოორდინატები",
  restaurant_type: "რესტორნის ტიპი",
  avg_check: "საშუალო ჩეკი",
  meals: "კერძები",
  accommodation: "საცხოვრებელი",
  has_kids_area: "საბავშვო სივრცე",
  has_live_music: "ცოცხალი მუსიკა",
  has_lounge: "მოწევის ზონა",
  employment_type: "დასაქმების ტიპი",
  requirements: "მოთხოვნები",
  salary_daily: "დღიური ანაზღაურება",
  salary_min: "ანაზღაურება (მინ)",
  salary_max: "ანაზღაურება (მაქს)",
  salary_type: "ანაზღაურების ტიპი",
  work_schedule: "სამუშაო გრაფიკი",
  safety_notes: "უსაფრთხოება და პირობები",
  legal_name: "იურიდიული დასახელება",
  brand_name: "საჯარო დასახელება",
  company_type: "კომპანიის ტიპი",
  logo_url: "ლოგო",
  cover_url: "ყდა (COVER)",
  website: "ვებგვერდი",
  city: "ქალაქი",
  address: "მისამართი",
  bio: "ბიოგრაფია",
  response_time_minutes: "პასუხის დრო (წთ)",
  cleaner_profile: "დამლაგებლის პროფილი",
  first_name: "სახელი",
  last_name: "გვარი",
  personal_number: "პირადი ნომერი",
  // Nested: house_rules (create/rental, create/sale), menu {url}, legacy discount diffs.
  hosting_langs: "მასპინძლის ენები",
  smoking: "მოწევა დაშვებულია",
  pets: "ცხოველები დაშვებულია",
  meals_included: "კვება ფასში",
  handover_month: "ჩაბარების დრო",
  exact_location: "ზუსტი მდებარეობა",
  management_service: "მართვის სერვისი",
  payment_options: "გადახდის პირობები",
  price_currency: "ფასის ვალუტა",
  url: "ბმული",
  discount_percent: "ფასდაკლება %",
};

export const fieldLabel = (key: string) => FIELD_LABELS[key] ?? key;

export type PhotoListDiff = {
  before: string[];
  after: string[];
  added: Set<string>;
  removed: Set<string>;
  coverChanged: boolean;
  orderChanged: boolean;
};

const asList = (v: unknown): string[] | null =>
  v == null
    ? []
    : Array.isArray(v) && v.every((s) => typeof s === "string")
      ? v
      : null;

/** null when a side is not a string list: the caller shows it raw. */
export function photoListDiff(
  before: unknown,
  after: unknown,
): PhotoListDiff | null {
  const b = asList(before);
  const a = asList(after);
  if (!b || !a) return null;
  const inB = new Set(b);
  const inA = new Set(a);
  // Order is compared on the photos both sides keep, so an add or a removal
  // alone is not a reorder.
  const keptB = b.filter((u) => inA.has(u));
  const keptA = a.filter((u) => inB.has(u));
  return {
    before: b,
    after: a,
    added: new Set(a.filter((u) => !inB.has(u))),
    removed: new Set(b.filter((u) => !inA.has(u))),
    coverChanged: (b[0] ?? null) !== (a[0] ?? null),
    orderChanged: keptB.some((u, i) => u !== keptA[i]),
  };
}

export function photoDiffNotes(d: PhotoListDiff): string[] {
  const notes: string[] = [];
  if (d.coverChanged) notes.push("მთავარი ფოტო შეიცვალა");
  if (d.orderChanged) {
    notes.push(
      d.added.size || d.removed.size
        ? "რიგი შეიცვალა"
        : "იგივე ფოტოები — შეიცვალა მხოლოდ რიგი",
    );
  }
  if (d.added.size) notes.push(`+${d.added.size} ახალი ფოტო`);
  if (d.removed.size) notes.push(`−${d.removed.size} წაშლილი ფოტო`);
  return notes;
}

/** The public room card's wording (HotelRooms.tsx) with exact values:
 * formatPrice/formatNumber round (99.5 → 100). The count shows even at 1, so
 * a 1 → 2 change is visible. */
export const roomFacts = (r: HotelRoom) =>
  [
    `${r.guests} სტუმარი`,
    r.beds != null && `${r.beds} საწოლი`,
    r.area_sqm != null && `${r.area_sqm} მ²`,
    `${r.price} ₾ / ღამე`,
    `${r.quantity} ასეთი ნომერი`,
  ]
    .filter(Boolean)
    .join(" · ");

export type RoomMark = "new" | "changed" | "removed" | null;

/** Rooms have no id: matched by name. Pass parsed rooms (stable key order). */
export function roomMarks(before: HotelRoom[], after: HotelRoom[]) {
  const used = new Set<number>();
  const afterMarks = after.map((room): RoomMark => {
    const i = before.findIndex((b, j) => !used.has(j) && b.name === room.name);
    if (i < 0) return "new";
    used.add(i);
    return JSON.stringify(before[i]) === JSON.stringify(room)
      ? null
      : "changed";
  });
  return {
    before: before.map((_, j): RoomMark => (used.has(j) ? null : "removed")),
    after: afterMarks,
  };
}

/** parseHotelRooms dropped a room or photo: the admin must see the raw value. */
export function roomsLostData(raw: unknown, parsed: HotelRoom[]): boolean {
  if (raw == null) return false;
  if (!Array.isArray(raw) || raw.length !== parsed.length) return true;
  return raw.some((r, i) => {
    const p = (r as { photos?: unknown } | null)?.photos;
    return Array.isArray(p) ? p.length !== parsed[i].photos.length : p != null;
  });
}

export const isPdfUrl = (url: string) => {
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
};

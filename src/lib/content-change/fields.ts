/** Fields which are public content and therefore require editorial approval.
 * Keep this list intentionally explicit: ownership, moderation, payments and
 * other system state can never be staged through the content-review API.
 */
export const REVIEWABLE_FIELDS = {
  profile: [
    "display_name",
    "phone",
    "avatar_url",
    "bio",
    "response_time_minutes",
  ],
  property: [
    "type",
    "title",
    "description",
    "location",
    "location_lat",
    "location_lng",
    "cadastral_code",
    "area_sqm",
    "rooms",
    "bathrooms",
    "capacity",
    "price_per_night",
    "sale_price",
    "currency",
    "amenities",
    "photos",
    "house_rules",
    "min_booking_days",
    "is_for_sale",
    "roi_percent",
    "roi_percent_max",
    "construction_status",
    "developer",
    "cleaning_fee",
    "renovation_status",
    "hotel_stars",
    "numeric_rating",
    "room_type",
    "distance_to_slope_m",
    "phone",
    "whatsapp",
    "completion_year",
    "units_total",
    "units_sold",
    "units_reserved",
    "construction_stages",
    "construction_progress_percent",
    "construction_image_url",
  ],
  service: [
    "category",
    "title",
    "description",
    "price",
    "price_unit",
    "currency",
    "photos",
    "location",
    "schedule",
    "phone",
    "whatsapp",
    "driver_name",
    "vehicle_capacity",
    "route",
    "cuisine_type",
    "has_delivery",
    "operating_hours",
    "menu",
    "position",
    "salary_range",
    "experience_required",
    "employment_schedule",
    "provider_name",
    "service_field",
    "languages",
    "vehicle_make",
    "transport_type",
    "vehicle_color",
    "routes",
    "route_pricing",
    "equipment",
    "features",
    "menu_url",
    "activity_type",
    "activity_category",
    "duration",
    "age_min",
    "good_for",
    "coords",
    "restaurant_type",
    "avg_check",
    "meals",
    "accommodation",
    "has_kids_area",
    "has_live_music",
    "has_lounge",
    "employment_type",
    "requirements",
    "salary_daily",
    "salary_min",
    "salary_max",
    "salary_type",
    "work_schedule",
    "safety_notes",
  ],
  organization: [
    "legal_name",
    "brand_name",
    "company_type",
    "logo_url",
    "cover_url",
    "phone",
    "website",
    "city",
    "address",
    "location_lat",
    "location_lng",
  ],
} as const;

export const CLEANER_PROFILE_FIELDS = [
  "first_name",
  "last_name",
  "personal_number",
  "address",
  "phone",
  "whatsapp",
] as const;

export type ContentChangeTarget = keyof typeof REVIEWABLE_FIELDS;

export function pickReviewableValues(
  target: ContentChangeTarget,
  values: Record<string, unknown>,
) {
  const allowed = new Set<string>(REVIEWABLE_FIELDS[target]);
  const picked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (allowed.has(key)) picked[key] = value;
  }
  return picked;
}

export function hasOnlyReviewableValues(
  target: ContentChangeTarget,
  values: Record<string, unknown>,
) {
  const allowed = new Set<string>(REVIEWABLE_FIELDS[target]);
  return Object.keys(values).every((key) => allowed.has(key));
}

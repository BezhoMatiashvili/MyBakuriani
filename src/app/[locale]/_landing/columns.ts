import type { Tables } from "@/lib/types/database";

// The public_* columns the landing's client components read: LandingPage.tsx
// (card mappers, map pins, service sort, describeSalary, blog items) and
// SaleLandingBody.tsx (toSaleCard, readPaymentOptions, map pins). The page used
// to select("*"), which serialized every view column — descriptions, JSON
// blobs, full blog bodies, every photo URL — into the inline RSC payload of the
// site's most-visited page and of every "/" prefetch.
//
// The strings stay plain literals so supabase-js infers the row types from
// them, and the Pick types are what the client components accept: forgetting a
// column the code reads is a compile error. tsc cannot catch a column the VIEW
// lacks (the override layer types views as their base table), so every name
// here must exist in public_properties / public_services / blog_posts.
export const LANDING_RENTAL_COLUMNS =
  "id, title, location, photos, price_per_night, sale_price, is_for_sale, capacity, rooms, is_vip, is_super_vip, discount_percent, discount_expires_at, created_at, distance_to_slope_m, location_lat, location_lng";
export const LANDING_HOTEL_COLUMNS =
  "id, title, location, photos, price_per_night, sale_price, is_for_sale, capacity, rooms, is_vip, is_super_vip, discount_percent, discount_expires_at, created_at, distance_to_slope_m, location_lat, location_lng, hotel_stars, numeric_rating, is_b2b_partner, room_type";
export const LANDING_SALE_COLUMNS =
  "id, title, location, photos, price_per_night, sale_price, is_for_sale, capacity, rooms, is_vip, is_super_vip, discount_percent, discount_expires_at, created_at, distance_to_slope_m, location_lat, location_lng, type, area_sqm, construction_status, construction_progress_percent, house_rules";
export const LANDING_SERVICE_COLUMNS =
  "id, title, category, location, photos, price, price_unit, discount_percent, discount_expires_at, best_active_menu_item_discount_percent, created_at, is_vip, is_super_vip, schedule, operating_hours, has_whatsapp, vehicle_capacity, transport_type, vehicle_make, route, routes, salary_type, salary_min, salary_max, salary_daily, salary_range";
export const LANDING_BLOG_COLUMNS =
  "id, title, excerpt, image_url, published_at, created_at";

type PropertyRow = Tables<"properties">;

export type LandingProperty = Pick<
  PropertyRow,
  | "id"
  | "title"
  | "location"
  | "photos"
  | "price_per_night"
  | "sale_price"
  | "is_for_sale"
  | "capacity"
  | "rooms"
  | "is_vip"
  | "is_super_vip"
  | "discount_percent"
  | "discount_expires_at"
  | "created_at"
  | "distance_to_slope_m"
  | "location_lat"
  | "location_lng"
>;

export type LandingHotel = LandingProperty &
  Pick<PropertyRow, "hotel_stars" | "numeric_rating" | "is_b2b_partner" | "room_type">;

export type LandingSaleProperty = LandingProperty &
  Pick<
    PropertyRow,
    | "type"
    | "area_sqm"
    | "construction_status"
    | "construction_progress_percent"
    | "house_rules"
  >;

export type LandingService = Pick<
  Tables<"public_services">,
  | "id"
  | "title"
  | "category"
  | "location"
  | "photos"
  | "price"
  | "price_unit"
  | "discount_percent"
  | "discount_expires_at"
  | "best_active_menu_item_discount_percent"
  | "created_at"
  | "is_vip"
  | "is_super_vip"
  | "schedule"
  | "operating_hours"
  | "has_whatsapp"
  | "vehicle_capacity"
  | "transport_type"
  | "vehicle_make"
  | "route"
  | "routes"
  | "salary_type"
  | "salary_min"
  | "salary_max"
  | "salary_daily"
  | "salary_range"
>;

export type LandingBlogPost = Pick<
  Tables<"blog_posts">,
  "id" | "title" | "excerpt" | "image_url" | "published_at" | "created_at"
>;

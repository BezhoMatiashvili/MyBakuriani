/**
 * Content-variation ("stress") listings for the card-geometry audit.
 *
 * The question these answer: does a listing card keep the same size and internal
 * alignment when one card carries the MAXIMUM information the product can hold and
 * the card beside it carries the MINIMUM? Real staging data cannot answer it - the
 * longest real title is 54 chars and almost nothing carries VIP + discount + full
 * optional rows.
 *
 * Two deliberate design choices:
 *
 * 1. Every pair is `is_vip: true` with the newest `created_at`. Public list pages
 *    order by `is_super_vip desc, is_vip desc, created_at desc`, so this is what
 *    pins a min/max pair ADJACENT in the first grid row. Without it they drift
 *    apart and the row-equality check compares unrelated cards.
 *
 * 2. `max` is calibrated to what the product can actually REACH, not to an
 *    arbitrary large number - otherwise any fix is tuned to fiction:
 *      - rental/sale titles cap at 35 chars client-side (TITLE_MAX in
 *        create/rental/page.tsx and create/sale/page.tsx),
 *      - the other five create forms have NO title cap at all, so a long title is
 *        genuinely reachable there (a finding in its own right).
 *
 * Inserted through the service-role client, which is exempt from
 * force_listing_moderation_state (20260723000000) - that trigger otherwise forces
 * status='pending', is_vip=false, discount_percent=0 on any non-privileged insert
 * no matter what the client sends.
 */
import { supabaseAdmin, properties, services } from "./supabase";
import { STRESS_IDS } from "./fixture-manifest.mjs";
import { FIXTURE_IDS } from "./fixture-manifest.mjs";

/** Builds a Georgian string of EXACTLY `len` characters (no manual miscounting). */
function georgian(len: number): string {
  const base = "ბაკურიანის მაღალმთიანი საცხოვრებელი კომპლექსი ხედით თოვლიან მთებზე და ტყეზე ";
  return base.repeat(Math.ceil(len / base.length)).slice(0, len);
}

const MAX_AMENITIES = [
  "wifi", "parking", "heating", "kitchen", "tv", "washing_machine",
  "balcony", "fireplace", "ski_storage", "pets_allowed",
];

const PROPERTY_PHOTO = "/placeholder-property.jpg";
const SERVICE_PHOTO = "/placeholder-service.jpg";

/** Newest-first timestamps so the pair pins to the top of every list page. */
function recent(secondsAgo: number): string {
  return new Date(Date.now() - secondsAgo * 1000).toISOString();
}

function futureISO(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export async function seedStressFixtures(): Promise<void> {
  // -- properties -----------------------------------------------------------
  const propertyRows = [
    // rent: fullest card the rental form can produce
    {
      id: STRESS_IDS.rentMax,
      owner_id: FIXTURE_IDS.renter,
      type: "apartment",
      title: georgian(35), // TITLE_MAX
      description: georgian(600),
      location: georgian(60),
      area_sqm: 180,
      rooms: 6,
      bathrooms: 3,
      capacity: 12,
      price_per_night: 1250,
      currency: "GEL",
      amenities: MAX_AMENITIES,
      house_rules: { hosting_langs: ["ka", "en", "ru"] },
      photos: [PROPERTY_PHOTO, PROPERTY_PHOTO, PROPERTY_PHOTO],
      status: "active",
      is_for_sale: false,
      is_vip: true,
      vip_expires_at: futureISO(30),
      discount_percent: 35,
      discount_expires_at: futureISO(30),
      min_booking_days: 2,
      distance_to_slope_m: 150,
      created_at: recent(1),
    },
    // rent: barest legal card - only the 4 NOT NULL columns carry data
    {
      id: STRESS_IDS.rentMin,
      owner_id: FIXTURE_IDS.renter,
      type: "apartment",
      title: "ა",
      location: "ბ",
      photos: [],
      status: "active",
      is_for_sale: false,
      is_vip: true,
      vip_expires_at: futureISO(30),
      created_at: recent(2),
    },
    // sale: fullest
    {
      id: STRESS_IDS.saleMax,
      owner_id: FIXTURE_IDS.seller,
      type: "apartment",
      title: georgian(35),
      description: georgian(600),
      location: georgian(60),
      area_sqm: 240,
      rooms: 5,
      bathrooms: 3,
      sale_price: 480000,
      currency: "GEL",
      photos: [PROPERTY_PHOTO, PROPERTY_PHOTO, PROPERTY_PHOTO],
      status: "active",
      is_for_sale: true,
      is_vip: true,
      vip_expires_at: futureISO(30),
      discount_percent: 20,
      discount_expires_at: futureISO(30),
      developer: georgian(40),
      roi_percent: 9,
      roi_percent_max: 14,
      construction_status: "under_construction",
      construction_progress_percent: 65,
      completion_year: 2028,
      units_total: 120,
      units_sold: 74,
      units_reserved: 12,
      renovation_status: "newly_renovated",
      created_at: recent(3),
    },
    // sale: barest
    {
      id: STRESS_IDS.saleMin,
      owner_id: FIXTURE_IDS.seller,
      type: "apartment",
      title: "გ",
      location: "დ",
      photos: [],
      status: "active",
      is_for_sale: true,
      is_vip: true,
      vip_expires_at: futureISO(30),
      created_at: recent(4),
    },
    // hotel pair
    {
      id: STRESS_IDS.hotelMax,
      owner_id: FIXTURE_IDS.renter,
      type: "hotel",
      title: georgian(35),
      description: georgian(600),
      location: georgian(60),
      area_sqm: 90,
      rooms: 3,
      bathrooms: 2,
      capacity: 6,
      price_per_night: 890,
      currency: "GEL",
      amenities: MAX_AMENITIES,
      photos: [PROPERTY_PHOTO, PROPERTY_PHOTO],
      status: "active",
      is_for_sale: false,
      is_vip: true,
      vip_expires_at: futureISO(30),
      hotel_stars: 5,
      numeric_rating: 4.9,
      room_type: georgian(30),
      discount_percent: 15,
      discount_expires_at: futureISO(30),
      created_at: recent(5),
    },
    {
      id: STRESS_IDS.hotelMin,
      owner_id: FIXTURE_IDS.renter,
      type: "hotel",
      title: "ე",
      location: "ვ",
      photos: [],
      status: "active",
      is_for_sale: false,
      is_vip: true,
      vip_expires_at: futureISO(30),
      created_at: recent(6),
    },
  ];
  // One INSERT per row, deliberately: a PostgREST bulk insert normalizes the
  // column set across the whole batch, so a row that OMITS a column (expecting
  // its DB default) is sent an explicit NULL instead - which fails on NOT NULL
  // columns like properties.units_sold. Per-row inserts let each variant carry
  // only the columns it actually sets, which is the entire point of `min`.
  for (const row of propertyRows) await properties.create(row as never);

  // -- services -------------------------------------------------------------
  // These five categories have NO client-side title cap, so a long title is a
  // genuinely reachable state - unlike rental/sale above.
  const LONG_TITLE = georgian(120);

  const serviceRows = [
    {
      id: STRESS_IDS.foodMax,
      owner_id: FIXTURE_IDS.food,
      category: "food",
      title: LONG_TITLE,
      description: georgian(600),
      location: georgian(60),
      photos: [SERVICE_PHOTO, SERVICE_PHOTO],
      status: "active",
      is_vip: true,
      vip_expires_at: futureISO(30),
      price: 95,
      price_unit: "პირზე",
      currency: "GEL",
      restaurant_type: georgian(25),
      cuisine_type: georgian(25),
      avg_check: "60-100",
      has_delivery: true,
      has_kids_area: true,
      has_lounge: true,
      has_live_music: true,
      operating_hours: { open: "09:00", close: "23:00" },
      phone: "+995599111001",
      whatsapp: "+995599111001",
      created_at: recent(1),
    },
    {
      id: STRESS_IDS.foodMin,
      owner_id: FIXTURE_IDS.food,
      category: "food",
      title: "ზ",
      photos: [],
      status: "active",
      is_vip: true,
      vip_expires_at: futureISO(30),
      created_at: recent(2),
    },
    {
      id: STRESS_IDS.cleaningMax,
      owner_id: FIXTURE_IDS.cleaner,
      category: "cleaning",
      title: LONG_TITLE,
      description: georgian(600),
      location: georgian(60),
      photos: [SERVICE_PHOTO],
      status: "active",
      is_vip: true,
      vip_expires_at: futureISO(30),
      price: 75,
      price_unit: "საათი",
      currency: "GEL",
      provider_name: georgian(40),
      service_field: georgian(30),
      experience_required: "5+",
      languages: ["ka", "en", "ru"],
      schedule: { mode: "24/7" },
      phone: "+995599111002",
      whatsapp: "+995599111002",
      created_at: recent(3),
    },
    {
      id: STRESS_IDS.cleaningMin,
      owner_id: FIXTURE_IDS.cleaner,
      category: "cleaning",
      title: "თ",
      photos: [],
      status: "active",
      is_vip: true,
      vip_expires_at: futureISO(30),
      created_at: recent(4),
    },
    {
      id: STRESS_IDS.entertainmentMax,
      owner_id: FIXTURE_IDS.entertainment,
      category: "entertainment",
      title: LONG_TITLE,
      description: georgian(600),
      location: georgian(60),
      photos: [SERVICE_PHOTO, SERVICE_PHOTO],
      status: "active",
      is_vip: true,
      vip_expires_at: futureISO(30),
      price: 320,
      price_unit: "პირზე",
      currency: "GEL",
      discount_percent: 25,
      discount_expires_at: futureISO(30),
      activity_type: georgian(25),
      activity_category: georgian(25),
      duration: "3 სთ",
      age_min: 8,
      good_for: ["families", "groups"],
      safety_notes: georgian(200),
      phone: "+995599111003",
      created_at: recent(5),
    },
    {
      id: STRESS_IDS.entertainmentMin,
      owner_id: FIXTURE_IDS.entertainment,
      category: "entertainment",
      title: "ი",
      photos: [],
      status: "active",
      is_vip: true,
      vip_expires_at: futureISO(30),
      created_at: recent(6),
    },
    {
      id: STRESS_IDS.transportMax,
      owner_id: FIXTURE_IDS.transport,
      category: "transport",
      title: LONG_TITLE,
      description: georgian(600),
      location: georgian(60),
      photos: [SERVICE_PHOTO],
      status: "active",
      is_vip: true,
      vip_expires_at: futureISO(30),
      price: 260,
      price_unit: "მგზავრობა",
      currency: "GEL",
      driver_name: georgian(40),
      vehicle_make: georgian(25),
      vehicle_capacity: 8,
      vehicle_color: georgian(15),
      transport_type: georgian(20),
      route_pricing: [
        { route: georgian(30), price: 260, unit: "მგზავრობა" },
        { route: georgian(30), price: 180, unit: "მგზავრობა" },
      ],
      equipment: ["ski_rack", "child_seat", "winter_tyres"],
      languages: ["ka", "en", "ru"],
      phone: "+995599111004",
      created_at: recent(7),
    },
    {
      id: STRESS_IDS.transportMin,
      owner_id: FIXTURE_IDS.transport,
      category: "transport",
      title: "კ",
      photos: [],
      status: "active",
      is_vip: true,
      vip_expires_at: futureISO(30),
      created_at: recent(8),
    },
    {
      id: STRESS_IDS.employmentMax,
      owner_id: FIXTURE_IDS.employment,
      category: "employment",
      title: LONG_TITLE,
      description: georgian(600),
      location: georgian(60),
      photos: [],
      status: "active",
      is_vip: true,
      vip_expires_at: futureISO(30),
      position: georgian(40),
      employment_type: "full_time",
      salary_type: "monthly",
      salary_min: 1800,
      salary_max: 3600,
      accommodation: true,
      meals: true,
      requirements: georgian(300),
      languages: ["ka", "en", "ru"],
      experience_required: "3+",
      phone: "+995599111005",
      created_at: recent(9),
    },
    {
      id: STRESS_IDS.employmentMin,
      owner_id: FIXTURE_IDS.employment,
      category: "employment",
      title: "ლ",
      photos: [],
      status: "active",
      is_vip: true,
      vip_expires_at: futureISO(30),
      created_at: recent(10),
    },
  ];
  for (const row of serviceRows) await services.create(row as never);
}

export async function cleanupStressFixtures(): Promise<void> {
  const ids = Object.values(STRESS_IDS) as string[];
  await supabaseAdmin.from("properties").delete().in("id", ids);
  await supabaseAdmin.from("services").delete().in("id", ids);
}

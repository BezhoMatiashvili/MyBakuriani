import {
  createTestUser,
  elevateTestUserToAal2,
  type TestUser,
} from "./auth";
import {
  supabaseAdmin,
  properties,
  calendarBlocks,
  bookings,
  reviews,
  services,
  notifications,
  transactions,
  blogPosts,
  cleaningTasks,
  cleanerManualTasks,
  smartMatchRequests,
  verifications,
  smsMessages,
  leads,
  organizations,
  organizationSubscriptions,
} from "./supabase";
import { FIXTURE_IDS } from "./fixture-manifest.mjs";

// ---------------------------------------------------------------------------
// Deterministic UUIDs
// ---------------------------------------------------------------------------
export const TEST_IDS = FIXTURE_IDS;

// ---------------------------------------------------------------------------
// Phone numbers
// ---------------------------------------------------------------------------
export const PHONES = {
  admin: "+995599000001",
  guest: "+995599000002",
  renter: "+995599000003",
  seller: "+995599000004",
  cleaner: "+995599000005",
  food: "+995599000006",
  transport: "+995599000007",
  entertainment: "+995599000008",
  employment: "+995599000009",
} as const;

/** Stable future timestamp for the organization subscription expiry E2E case. */
export const ORGANIZATION_SUBSCRIPTION_EXPIRES_AT =
  "2036-06-15T14:30:00.000Z";

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
export function futureDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function futureISO(days: number): string {
  return futureDate(days).toISOString().split("T")[0];
}

/** Timestamp anchored to a local wall-clock time, for calendar-day assertions. */
export function futureLocalTimestamp(
  days: number,
  hours: number,
  minutes = 0,
): string {
  const date = futureDate(days);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

function pastTimestamp(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type TestUserMap = Record<
  | "admin"
  | "guest"
  | "renter"
  | "seller"
  | "cleaner"
  | "food"
  | "transport"
  | "entertainment"
  | "employment",
  TestUser
>;

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
export async function seedTestData(): Promise<{ users: TestUserMap }> {
  // ---- Users ----
  const admin = await elevateTestUserToAal2(await createTestUser({
    id: TEST_IDS.admin,
    phone: PHONES.admin,
    displayName: "E2E ადმინი",
    role: "admin",
  }));
  const guest = await createTestUser({
    id: TEST_IDS.guest,
    phone: PHONES.guest,
    displayName: "E2E სტუმარი",
    role: "guest",
  });
  const renter = await createTestUser({
    id: TEST_IDS.renter,
    phone: PHONES.renter,
    displayName: "E2E გამქირავებელი",
    role: "renter",
  });
  const seller = await createTestUser({
    id: TEST_IDS.seller,
    phone: PHONES.seller,
    displayName: "E2E გამყიდველი",
    role: "seller",
  });
  const cleaner = await createTestUser({
    id: TEST_IDS.cleaner,
    phone: PHONES.cleaner,
    displayName: "E2E დამლაგებელი",
    role: "cleaner",
  });
  const food = await createTestUser({
    id: TEST_IDS.food,
    phone: PHONES.food,
    displayName: "E2E კვება",
    role: "food",
  });
  const transport = await createTestUser({
    id: TEST_IDS.transport,
    phone: PHONES.transport,
    displayName: "E2E ტრანსპორტი",
    role: "transport",
  });
  const entertainment = await createTestUser({
    id: TEST_IDS.entertainment,
    phone: PHONES.entertainment,
    displayName: "E2E გართობა",
    role: "entertainment",
  });
  const employment = await createTestUser({
    id: TEST_IDS.employment,
    phone: PHONES.employment,
    displayName: "E2E დასაქმება",
    role: "employment",
  });

  const users: TestUserMap = {
    admin,
    guest,
    renter,
    seller,
    cleaner,
    food,
    transport,
    entertainment,
    employment,
  };

  // ---- Seller organization and active subscription ----
  await organizations.create({
    id: TEST_IDS.organization,
    owner_id: TEST_IDS.seller,
    org_type: "shps",
    legal_name: "შპს E2E დეველოპერი",
    identification_code: "123456789",
    brand_name: "E2E Development",
    company_type: "developer",
    status: "active",
  });
  await organizationSubscriptions.create({
    id: TEST_IDS.organizationSubscription,
    organization_id: TEST_IDS.organization,
    tier: "pro",
    listing_limit: 50,
    amount_gel: 200,
    expires_at: ORGANIZATION_SUBSCRIPTION_EXPIRES_AT,
    status: "active",
  });

  // ---- Properties ----
  await properties.create({
    id: TEST_IDS.apartment,
    owner_id: TEST_IDS.renter,
    type: "apartment",
    title: "E2E ბინა ბაკურიანში",
    description: "ტესტ ბინა ავტომატური ტესტებისთვის",
    location: "ბაკურიანი, დიდველის ქუჩა",
    area_sqm: 65,
    rooms: 2,
    bathrooms: 1,
    capacity: 4,
    price_per_night: 150,
    currency: "GEL",
    amenities: ["wifi", "parking", "heating"],
    house_rules: { hosting_langs: ["ka", "en"] },
    photos: ["/placeholder-property.jpg", "/placeholder-property.jpg"],
    status: "active",
    is_for_sale: false,
    created_at: pastTimestamp(2),
  });

  await properties.create({
    id: TEST_IDS.villa,
    owner_id: TEST_IDS.renter,
    type: "villa",
    title: "E2E ვილა ბაკურიანში",
    description: "ტესტ ვილა ავტომატური ტესტებისთვის",
    location: "ბაკურიანი, კოხტა",
    area_sqm: 200,
    rooms: 5,
    bathrooms: 3,
    capacity: 10,
    price_per_night: 450,
    currency: "GEL",
    amenities: ["wifi", "parking", "heating", "fireplace", "bbq"],
    photos: [],
    status: "active",
    is_for_sale: false,
    created_at: pastTimestamp(25),
  });

  await properties.create({
    id: TEST_IDS.hotel,
    owner_id: TEST_IDS.renter,
    type: "hotel",
    title: "E2E სასტუმრო ბაკურიანში",
    description: "დეტერმინისტული სასტუმრო responsive აუდიტისთვის",
    location: "ბაკურიანი, კოხტა",
    area_sqm: 32,
    rooms: 1,
    bathrooms: 1,
    capacity: 2,
    price_per_night: 220,
    currency: "GEL",
    amenities: ["wifi", "parking", "breakfast"],
    house_rules: { hosting_langs: ["ru", "ar"] },
    photos: [],
    hotel_stars: 4,
    status: "active",
    is_for_sale: false,
    created_at: pastTimestamp(5),
  });

  await properties.create({
    id: TEST_IDS.sale,
    owner_id: TEST_IDS.seller,
    type: "apartment",
    title: "E2E გასაყიდი ბინა",
    description: "ტესტ გასაყიდი ბინა",
    location: "ბაკურიანი, ცენტრალური",
    area_sqm: 80,
    rooms: 3,
    bathrooms: 1,
    capacity: 6,
    sale_price: 120000,
    currency: "GEL",
    amenities: ["wifi", "parking"],
    photos: [],
    status: "active",
    is_for_sale: true,
    construction_status: "completed",
    created_at: pastTimestamp(3),
  });

  // Dedicated public-contact fixture: immutable during parallel test runs.
  await properties.create({
    id: TEST_IDS.whatsappApartment,
    owner_id: TEST_IDS.renter,
    type: "apartment",
    title: "E2E WhatsApp ბინა",
    description: "WhatsApp contact fixture",
    location: "ბაკურიანი, დიდველი",
    area_sqm: 45,
    rooms: 1,
    bathrooms: 1,
    capacity: 2,
    price_per_night: 120,
    currency: "GEL",
    amenities: [],
    photos: [],
    whatsapp: "+995599000010",
    status: "active",
    is_for_sale: false,
  });

  // ---- Seller CRM lead ----
  await leads.create({
    id: TEST_IDS.sellerLead,
    owner_id: TEST_IDS.seller,
    property_id: TEST_IDS.sale,
    client_name: "E2E Drag Lead",
    client_phone: "+995555010101",
    source: "direct",
    stage: "new",
    priority: "high",
    budget_min: 45_000,
    budget_max: 55_000,
    currency: "USD",
    note: "Deterministic seller board lead",
    interest_type: "apartment_purchase",
    desired_location: "didveli",
  });

  // ---- Calendar blocks ----
  await calendarBlocks.create({
    id: TEST_IDS.calendarBlock1,
    property_id: TEST_IDS.apartment,
    date: futureISO(1),
    status: "available",
  });

  await calendarBlocks.create({
    id: TEST_IDS.calendarBlock2,
    property_id: TEST_IDS.apartment,
    date: futureISO(10),
    status: "blocked",
  });

  await calendarBlocks.create({
    id: TEST_IDS.calendarBlock3,
    property_id: TEST_IDS.apartment,
    date: futureISO(20),
    status: "booked",
  });

  // ---- Booking ----
  await bookings.create({
    id: TEST_IDS.booking,
    property_id: TEST_IDS.apartment,
    guest_id: TEST_IDS.guest,
    owner_id: TEST_IDS.renter,
    check_in: futureISO(30),
    check_out: futureISO(33),
    guests_count: 2,
    total_price: 450,
    currency: "GEL",
    status: "confirmed",
    guest_message: "ტესტ შეტყობინება",
  });

  // ---- Review ----
  await reviews.create({
    id: TEST_IDS.review,
    property_id: TEST_IDS.apartment,
    booking_id: TEST_IDS.booking,
    guest_id: TEST_IDS.guest,
    rating: 5,
    comment: "შესანიშნავი ადგილი!",
  });

  // ---- Services ----
  await services.create({
    id: TEST_IDS.foodService,
    owner_id: TEST_IDS.food,
    category: "food",
    title: "E2E რესტორანი",
    description: "ტესტ კვების სერვისი",
    price: 30,
    price_unit: "კერძი",
    location: "ბაკურიანი",
    cuisine_type: "ქართული",
    has_delivery: true,
    operating_hours: "10:00-22:00",
    status: "active",
    created_at: pastTimestamp(1),
  });

  await services.create({
    id: TEST_IDS.transportService,
    owner_id: TEST_IDS.transport,
    category: "transport",
    title: "E2E ტრანსპორტი",
    description: "ტესტ სატრანსპორტო სერვისი",
    price: 50,
    price_unit: "რეისი",
    location: "ბაკურიანი",
    driver_name: "ტესტ მძღოლი",
    vehicle_make: "Mercedes-Benz",
    transport_type: "minivan",
    vehicle_capacity: 7,
    vehicle_color: "შავი",
    route: "თბილისი - ბაკურიანი - თბილისი",
    routes: ["თბილისი - ბაკურიანი - თბილისი"],
    route_pricing: [
      {
        route: "თბილისი - ბაკურიანი - თბილისი",
        price: 50,
        unit: "one_way",
      },
    ],
    equipment: ["ზამთრის საბურავები", "ბავშვის სავარძელი"],
    features: ["Wi-Fi", "USB დამტენი"],
    languages: ["ქართული", "English"],
    status: "active",
    created_at: pastTimestamp(2),
  });

  await services.create({
    id: TEST_IDS.entertainmentService,
    owner_id: TEST_IDS.entertainment,
    category: "entertainment",
    title: "E2E გართობა",
    description: "ტესტ გართობის სერვისი",
    price: 100,
    price_unit: "ადამიანი",
    location: "ბაკურიანი",
    status: "active",
    created_at: pastTimestamp(3),
  });

  await services.create({
    id: TEST_IDS.employmentService,
    owner_id: TEST_IDS.employment,
    category: "employment",
    title: "E2E ვაკანსია",
    description: "ტესტ დასაქმების განცხადება",
    position: "მიმტანი",
    salary_range: "800-1200 ₾",
    experience_required: "1 წელი",
    employment_schedule: "სრული განაკვეთი",
    location: "ბაკურიანი",
    status: "active",
    created_at: pastTimestamp(4),
  });

  await services.create({
    id: TEST_IDS.cleaningServicePrimary,
    owner_id: TEST_IDS.cleaner,
    category: "cleaning",
    title: "E2E დილის დასუფთავება",
    provider_name: "E2E დამლაგებელი",
    description: "ტესტ დასუფთავების სერვისი",
    price: 80,
    price_unit: "საათი",
    location: "ბაკურიანი, დიდველი",
    schedule: "08:00 - 16:00",
    operating_hours: "08:00 - 16:00",
    experience_required: "5 წელი",
    languages: ["ქართული", "რუსული"],
    service_field: "დასუფთავება/დამლაგებელი",
    status: "active",
    created_at: pastTimestamp(5),
  });

  await services.create({
    id: TEST_IDS.cleaningServiceSecondary,
    owner_id: TEST_IDS.cleaner,
    category: "cleaning",
    title: "E2E საღამოს დასუფთავება",
    provider_name: "E2E დამლაგებელი",
    description: "საღამოს დასუფთავება აპარტამენტებისა და კოტეჯებისთვის",
    price: 90,
    price_unit: "საათი",
    location: "ბაკურიანი",
    operating_hours: "10:00 - 18:00",
    experience_required: "5 წელი",
    languages: ["ქართული", "რუსული"],
    service_field: "დასუფთავება/დამლაგებელი",
    status: "active",
    created_at: pastTimestamp(25),
  });

  // Dedicated public-contact fixture: immutable during parallel test runs.
  await services.create({
    id: TEST_IDS.whatsappService,
    owner_id: TEST_IDS.cleaner,
    category: "cleaning",
    title: "E2E WhatsApp სერვისი",
    description: "WhatsApp contact fixture",
    price: 75,
    price_unit: "საათი",
    location: "ბაკურიანი",
    whatsapp: "+995599000011",
    status: "active",
  });

  // ---- Balances (update, not insert — trigger auto-creates them) ----
  await supabaseAdmin
    .from("balances")
    .update({ amount: 500, sms_remaining: 50 })
    .eq("user_id", TEST_IDS.renter);

  await supabaseAdmin
    .from("balances")
    .update({ amount: 200, sms_remaining: 20 })
    .eq("user_id", TEST_IDS.seller);

  // ---- Transaction ----
  await transactions.create({
    id: TEST_IDS.transaction,
    user_id: TEST_IDS.renter,
    amount: 500,
    type: "topup",
    description: "E2E ტესტ შევსება",
  });

  // ---- Notifications ----
  const notifPairs: Array<[string, string, string]> = [
    [TEST_IDS.notifAdmin, TEST_IDS.admin, "ადმინის შეტყობინება"],
    [TEST_IDS.notifGuest, TEST_IDS.guest, "სტუმრის შეტყობინება"],
    [TEST_IDS.notifRenter, TEST_IDS.renter, "გამქირავებლის შეტყობინება"],
    [TEST_IDS.notifSeller, TEST_IDS.seller, "გამყიდველის შეტყობინება"],
    [TEST_IDS.notifCleaner, TEST_IDS.cleaner, "დამლაგებლის შეტყობინება"],
    [TEST_IDS.notifFood, TEST_IDS.food, "კვების შეტყობინება"],
    [TEST_IDS.notifTransport, TEST_IDS.transport, "ტრანსპორტის შეტყობინება"],
    [
      TEST_IDS.notifEntertainment,
      TEST_IDS.entertainment,
      "გართობის შეტყობინება",
    ],
    [TEST_IDS.notifEmployment, TEST_IDS.employment, "დასაქმების შეტყობინება"],
  ];

  await notifications.createMany(
    notifPairs.map(([id, userId, title]) => ({
      id,
      user_id: userId,
      type: "system",
      title,
      message: "ტესტ შეტყობინება",
      is_read: false,
    })),
  );

  // ---- Blog post ----
  await blogPosts.create({
    id: TEST_IDS.blogPost,
    title: "E2E ტესტ ბლოგი",
    slug: "e2e-test-blog",
    content: "ეს არის ტესტ ბლოგ პოსტი ავტომატური ტესტებისთვის.",
    excerpt: "ტესტ ბლოგი",
    published: true,
    published_at: new Date().toISOString(),
    author_id: TEST_IDS.admin,
  });

  // ---- Cleaning task ----
  await cleaningTasks.create({
    id: TEST_IDS.cleaningTask,
    property_id: TEST_IDS.apartment,
    owner_id: TEST_IDS.renter,
    cleaner_id: TEST_IDS.cleaner,
    cleaner_service_id: TEST_IDS.cleaningServicePrimary,
    service_title: "E2E დილის დასუფთავება",
    cleaning_type: "standard",
    scheduled_at: futureISO(5),
    price: 80,
    price_unit: "საათი",
    status: "pending",
    address: "ბაკურიანი, დიდველის ქუჩა, ბინა 12",
    notes: "ტესტ დავალება",
  });

  // An accepted job on the default selected date keeps the cleaner schedule
  // populated-state controls covered without affecting the pending-task flow.
  await cleaningTasks.create({
    id: TEST_IDS.cleanerScheduleTask,
    property_id: TEST_IDS.villa,
    owner_id: TEST_IDS.renter,
    cleaner_id: TEST_IDS.cleaner,
    cleaner_service_id: TEST_IDS.cleaningServicePrimary,
    service_title: "E2E დილის დასუფთავება",
    cleaning_type: "standard",
    scheduled_at: futureISO(0),
    price: 100,
    price_unit: "საათი",
    status: "accepted",
    notes: "განრიგის CTA ტესტი",
  });

  // Manual work exercises the cleaner's second task source without occupying
  // tomorrow, which the empty-day schedule test deliberately selects.
  await cleanerManualTasks.create({
    id: TEST_IDS.cleanerManualTask,
    cleaner_id: TEST_IDS.cleaner,
    client_name: "E2E პირადი კლიენტი",
    client_phone: "+995599123456",
    address: "ბაკურიანი, აღმაშენებლის ქუჩა 10",
    cleaning_type: "general",
    scheduled_at: futureLocalTimestamp(0, 14, 30),
    price: 120,
    status: "accepted",
    notes: "მთავარი გვერდის გაერთიანების ტესტი",
  });
  await cleanerManualTasks.create({
    id: TEST_IDS.cleanerManualFutureTask,
    cleaner_id: TEST_IDS.cleaner,
    client_name: "E2E მომავალი კლიენტი",
    client_phone: "+995599123457",
    address: "ბაკურიანი, დიდველი 5",
    cleaning_type: "standard",
    // 00:30 Tbilisi serializes to the previous UTC date; the UI must still
    // mark/select the intended local calendar day.
    scheduled_at: futureLocalTimestamp(2, 0, 30),
    price: 95,
    status: "accepted",
  });
  await cleanerManualTasks.create({
    id: TEST_IDS.cleanerManualCompletedTask,
    cleaner_id: TEST_IDS.cleaner,
    client_name: "E2E დასრულებული კლიენტი",
    client_phone: "+995599123458",
    address: "ბაკურიანი, წაქაძის ქუჩა 3",
    cleaning_type: "standard",
    scheduled_at: futureLocalTimestamp(-2, 9),
    price: 80,
    status: "completed",
    completed_at: futureLocalTimestamp(-2, 11),
  });

  // ---- Smart match request ----
  await smartMatchRequests.create({
    id: TEST_IDS.smartMatch,
    guest_id: TEST_IDS.guest,
    check_in: futureISO(40),
    check_out: futureISO(45),
    budget_min: 100,
    budget_max: 300,
    guests_count: 3,
    preferences: { wifi: true, parking: true },
    status: "pending",
    matched_properties: [],
  });

  // ---- Verification ----
  await verifications.create({
    id: TEST_IDS.verification,
    user_id: TEST_IDS.renter,
    property_id: TEST_IDS.apartment,
    status: "pending",
    documents: { id_photo: "test.jpg", ownership_doc: "test.pdf" },
  });

  return { users };
}

// ---------------------------------------------------------------------------
// Cleanup — reverse FK order
// ---------------------------------------------------------------------------
export async function cleanupTestData(): Promise<void> {
  const ignore = () => {};

  // Organization subscriptions must be deleted before their organization.
  await organizationSubscriptions
    .delete(TEST_IDS.organizationSubscription)
    .catch(ignore);
  await organizations.delete(TEST_IDS.organization).catch(ignore);

  // Seller leads (depends on profiles + properties)
  await leads.delete(TEST_IDS.sellerLead).catch(ignore);

  // Reviews (depends on bookings + properties)
  await reviews.delete(TEST_IDS.review).catch(ignore);

  // Calendar blocks (depends on properties + bookings)
  await calendarBlocks.delete(TEST_IDS.calendarBlock1).catch(ignore);
  await calendarBlocks.delete(TEST_IDS.calendarBlock2).catch(ignore);
  await calendarBlocks.delete(TEST_IDS.calendarBlock3).catch(ignore);

  // Bookings (depends on properties + profiles)
  await bookings.delete(TEST_IDS.booking).catch(ignore);

  // Cleaning tasks (depends on properties + profiles)
  await cleaningTasks.delete(TEST_IDS.cleaningTask).catch(ignore);
  await cleaningTasks.delete(TEST_IDS.cleanerScheduleTask).catch(ignore);
  await cleanerManualTasks.delete(TEST_IDS.cleanerManualTask).catch(ignore);
  await cleanerManualTasks
    .delete(TEST_IDS.cleanerManualFutureTask)
    .catch(ignore);
  await cleanerManualTasks
    .delete(TEST_IDS.cleanerManualCompletedTask)
    .catch(ignore);

  // Verifications (depends on properties + profiles)
  await verifications.delete(TEST_IDS.verification).catch(ignore);

  // Smart match requests (depends on profiles)
  await smartMatchRequests.delete(TEST_IDS.smartMatch).catch(ignore);

  // Services (depends on profiles)
  await services.delete(TEST_IDS.foodService).catch(ignore);
  await services.delete(TEST_IDS.transportService).catch(ignore);
  await services.delete(TEST_IDS.entertainmentService).catch(ignore);
  await services.delete(TEST_IDS.employmentService).catch(ignore);
  await services.delete(TEST_IDS.cleaningServicePrimary).catch(ignore);
  await services.delete(TEST_IDS.cleaningServiceSecondary).catch(ignore);
  await services.delete(TEST_IDS.whatsappService).catch(ignore);

  // SMS messages (cleanup any created during tests)
  await smsMessages.deleteWhere("from_user_id", TEST_IDS.guest).catch(ignore);
  await smsMessages.deleteWhere("from_user_id", TEST_IDS.renter).catch(ignore);

  // Transactions (depends on profiles)
  await transactions.delete(TEST_IDS.transaction).catch(ignore);

  // Notifications
  for (const id of [
    TEST_IDS.notifAdmin,
    TEST_IDS.notifGuest,
    TEST_IDS.notifRenter,
    TEST_IDS.notifSeller,
    TEST_IDS.notifCleaner,
    TEST_IDS.notifFood,
    TEST_IDS.notifTransport,
    TEST_IDS.notifEntertainment,
    TEST_IDS.notifEmployment,
  ]) {
    await notifications.delete(id).catch(ignore);
  }

  // Blog posts
  await blogPosts.delete(TEST_IDS.blogPost).catch(ignore);

  // Properties (depends on profiles)
  await properties.delete(TEST_IDS.apartment).catch(ignore);
  await properties.delete(TEST_IDS.villa).catch(ignore);
  await properties.delete(TEST_IDS.sale).catch(ignore);
  await properties.delete(TEST_IDS.whatsappApartment).catch(ignore);
  await properties.delete(TEST_IDS.hotel).catch(ignore);

  // Profiles + auth users — delete in order
  const userIds = [
    TEST_IDS.admin,
    TEST_IDS.guest,
    TEST_IDS.renter,
    TEST_IDS.seller,
    TEST_IDS.cleaner,
    TEST_IDS.food,
    TEST_IDS.transport,
    TEST_IDS.entertainment,
    TEST_IDS.employment,
  ];

  for (const uid of userIds) {
    try {
      await supabaseAdmin.from("balances").delete().eq("user_id", uid);
    } catch {}
    try {
      await supabaseAdmin.from("profiles").delete().eq("id", uid);
    } catch {}
    try {
      await supabaseAdmin.auth.admin.deleteUser(uid);
    } catch {}
  }
}

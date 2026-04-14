import { createTestUser, type TestUser } from "./auth";
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
  smartMatchRequests,
  verifications,
  smsMessages,
} from "./supabase";

// ---------------------------------------------------------------------------
// Deterministic UUIDs
// ---------------------------------------------------------------------------
export const TEST_IDS = {
  // Users (valid UUID v4: pos 13=4, pos 17=8/9/a/b)
  admin: "aae2ff00-0001-4000-a000-000000000001",
  guest: "aae2ff00-0002-4000-a000-000000000002",
  renter: "aae2ff00-0003-4000-a000-000000000003",
  seller: "aae2ff00-0004-4000-a000-000000000004",
  cleaner: "aae2ff00-0005-4000-a000-000000000005",
  food: "aae2ff00-0006-4000-a000-000000000006",
  transport: "aae2ff00-0007-4000-a000-000000000007",
  entertainment: "aae2ff00-0008-4000-a000-000000000008",
  employment: "aae2ff00-0009-4000-a000-000000000009",

  // Properties
  apartment: "aae2ff00-1001-4000-a000-000000000001",
  villa: "aae2ff00-1002-4000-a000-000000000002",
  sale: "aae2ff00-1003-4000-a000-000000000003",

  // Booking
  booking: "aae2ff00-2001-4000-a000-000000000001",

  // Review
  review: "aae2ff00-3001-4000-a000-000000000001",

  // Services
  foodService: "aae2ff00-4001-4000-a000-000000000001",
  transportService: "aae2ff00-4002-4000-a000-000000000002",
  entertainmentService: "aae2ff00-4003-4000-a000-000000000003",
  employmentService: "aae2ff00-4004-4000-a000-000000000004",

  // Calendar blocks
  calendarBlock1: "aae2ff00-5001-4000-a000-000000000001",
  calendarBlock2: "aae2ff00-5002-4000-a000-000000000002",
  calendarBlock3: "aae2ff00-5003-4000-a000-000000000003",

  // Smart match
  smartMatch: "aae2ff00-6001-4000-a000-000000000001",

  // Blog post
  blogPost: "aae2ff00-7001-4000-a000-000000000001",

  // Cleaning task
  cleaningTask: "aae2ff00-8001-4000-a000-000000000001",

  // Verification
  verification: "aae2ff00-9001-4000-a000-000000000001",

  // Notifications (one per user)
  notifAdmin: "aae2ff00-a001-4000-a000-000000000001",
  notifGuest: "aae2ff00-a002-4000-a000-000000000002",
  notifRenter: "aae2ff00-a003-4000-a000-000000000003",
  notifSeller: "aae2ff00-a004-4000-a000-000000000004",
  notifCleaner: "aae2ff00-a005-4000-a000-000000000005",
  notifFood: "aae2ff00-a006-4000-a000-000000000006",
  notifTransport: "aae2ff00-a007-4000-a000-000000000007",
  notifEntertainment: "aae2ff00-a008-4000-a000-000000000008",
  notifEmployment: "aae2ff00-a009-4000-a000-000000000009",

  // Transaction
  transaction: "aae2ff00-b001-4000-a000-000000000001",
} as const;

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
  const admin = await createTestUser({
    id: TEST_IDS.admin,
    phone: PHONES.admin,
    displayName: "E2E ადმინი",
    role: "admin",
  });
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
    photos: [],
    status: "active",
    is_for_sale: false,
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
    vehicle_capacity: 7,
    route: "თბილისი-ბაკურიანი",
    status: "active",
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
    cleaning_type: "standard",
    scheduled_at: futureISO(5),
    price: 80,
    status: "pending",
    notes: "ტესტ დავალება",
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

  // Verifications (depends on properties + profiles)
  await verifications.delete(TEST_IDS.verification).catch(ignore);

  // Smart match requests (depends on profiles)
  await smartMatchRequests.delete(TEST_IDS.smartMatch).catch(ignore);

  // Services (depends on profiles)
  await services.delete(TEST_IDS.foodService).catch(ignore);
  await services.delete(TEST_IDS.transportService).catch(ignore);
  await services.delete(TEST_IDS.entertainmentService).catch(ignore);
  await services.delete(TEST_IDS.employmentService).catch(ignore);

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

/** Deterministic fixtures shared by the seeder and standalone responsive audit. */
export const FIXTURE_IDS = Object.freeze({
  admin: "aae2ff00-0001-4000-a000-000000000001",
  guest: "aae2ff00-0002-4000-a000-000000000002",
  renter: "aae2ff00-0003-4000-a000-000000000003",
  seller: "aae2ff00-0004-4000-a000-000000000004",
  cleaner: "aae2ff00-0005-4000-a000-000000000005",
  food: "aae2ff00-0006-4000-a000-000000000006",
  transport: "aae2ff00-0007-4000-a000-000000000007",
  entertainment: "aae2ff00-0008-4000-a000-000000000008",
  employment: "aae2ff00-0009-4000-a000-000000000009",
  organization: "aae2ff00-d001-4000-a000-000000000001",
  organizationSubscription: "aae2ff00-d002-4000-a000-000000000001",
  renterMembership: "aae2ff00-d003-4000-a000-000000000001",
  apartment: "aae2ff00-1001-4000-a000-000000000001",
  villa: "aae2ff00-1002-4000-a000-000000000002",
  sale: "aae2ff00-1003-4000-a000-000000000003",
  whatsappApartment: "aae2ff00-1004-4000-a000-000000000004",
  hotel: "aae2ff00-1005-4000-a000-000000000005",
  booking: "aae2ff00-2001-4000-a000-000000000001",
  foodService: "aae2ff00-4001-4000-a000-000000000001",
  transportService: "aae2ff00-4002-4000-a000-000000000002",
  entertainmentService: "aae2ff00-4003-4000-a000-000000000003",
  employmentService: "aae2ff00-4004-4000-a000-000000000004",
  cleaningServicePrimary: "aae2ff00-4005-4000-a000-000000000005",
  cleaningServiceSecondary: "aae2ff00-4006-4000-a000-000000000006",
  whatsappService: "aae2ff00-4007-4000-a000-000000000007",
  calendarBlock1: "aae2ff00-5001-4000-a000-000000000001",
  calendarBlock2: "aae2ff00-5002-4000-a000-000000000002",
  calendarBlock3: "aae2ff00-5003-4000-a000-000000000003",
  smartMatch: "aae2ff00-6001-4000-a000-000000000001",
  blogPost: "aae2ff00-7001-4000-a000-000000000001",
  blogPostGeorgian: "aae2ff00-7002-4000-a000-000000000002",
  cleaningTask: "aae2ff00-8001-4000-a000-000000000001",
  cleanerScheduleTask: "aae2ff00-8002-4000-a000-000000000002",
  cleanerManualTask: "aae2ff00-8003-4000-a000-000000000003",
  cleanerManualFutureTask: "aae2ff00-8004-4000-a000-000000000004",
  cleanerManualCompletedTask: "aae2ff00-8005-4000-a000-000000000005",
  verification: "aae2ff00-9001-4000-a000-000000000001",
  notifAdmin: "aae2ff00-a001-4000-a000-000000000001",
  notifGuest: "aae2ff00-a002-4000-a000-000000000002",
  notifRenter: "aae2ff00-a003-4000-a000-000000000003",
  notifSeller: "aae2ff00-a004-4000-a000-000000000004",
  notifCleaner: "aae2ff00-a005-4000-a000-000000000005",
  notifFood: "aae2ff00-a006-4000-a000-000000000006",
  notifTransport: "aae2ff00-a007-4000-a000-000000000007",
  notifEntertainment: "aae2ff00-a008-4000-a000-000000000008",
  notifEmployment: "aae2ff00-a009-4000-a000-000000000009",
  transaction: "aae2ff00-b001-4000-a000-000000000001",
  sellerLead: "aae2ff00-c001-4000-a000-000000000001",
});

/**
 * The seeded blog post's slug: Latin words plus the 8-character token every
 * post's slug ends in (src/lib/blog-slug.ts), so old links resolve by token.
 */
export const FIXTURE_BLOG_SLUG = "e2e-test-blog-e2e00001";

/** Its cover in landing-media, outside the blog/ folder the admin routes clean up. */
export const FIXTURE_BLOG_COVER_PATH = "e2e/blog-cover-e2e00001.jpg";

/**
 * A second post still on a Georgian slug of the old form, title words then
 * its token, as posts had before scripts/blog-latin-slugs.mjs renamed them.
 */
export const FIXTURE_BLOG_GEORGIAN_SLUG = "e2e-ძველი-ბმული--e2e00002";

/**
 * Content-variation listings for the card-geometry audit (see stress-fixtures.ts).
 * Same `aae2ff00-` prefix as FIXTURE_IDS so one teardown sweep finds everything.
 */
export const STRESS_IDS = Object.freeze({
  rentMax: "aae2ff00-e001-4000-a000-000000000001",
  rentMin: "aae2ff00-e001-4000-a000-000000000002",
  saleMax: "aae2ff00-e001-4000-a000-000000000003",
  saleMin: "aae2ff00-e001-4000-a000-000000000004",
  hotelMax: "aae2ff00-e001-4000-a000-000000000005",
  hotelMin: "aae2ff00-e001-4000-a000-000000000006",
  foodMax: "aae2ff00-e002-4000-a000-000000000001",
  foodMin: "aae2ff00-e002-4000-a000-000000000002",
  cleaningMax: "aae2ff00-e002-4000-a000-000000000003",
  cleaningMin: "aae2ff00-e002-4000-a000-000000000004",
  entertainmentMax: "aae2ff00-e002-4000-a000-000000000005",
  entertainmentMin: "aae2ff00-e002-4000-a000-000000000006",
  transportMax: "aae2ff00-e002-4000-a000-000000000007",
  transportMin: "aae2ff00-e002-4000-a000-000000000008",
  employmentMax: "aae2ff00-e002-4000-a000-000000000009",
  employmentMin: "aae2ff00-e002-4000-a000-00000000000a",
});

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect, loadTestUsers } from "../helpers/fixtures";
import type { TestUser } from "../helpers/auth";
import { configureIsolatedE2E } from "../helpers/env";
import { PHONES, TEST_IDS } from "../helpers/seed";
import { cleaningTasks, properties, supabaseAdmin } from "../helpers/supabase";
import type { TablesInsert } from "../../src/lib/types/database";
import {
  createPlatformCleanerTask,
  loadCleaningTaskOwnerDetails,
} from "../../src/lib/cleaner/tasks";

// ---------------------------------------------------------------------------
// What a cleaner can see of a call-out (the 2026-10-01 CEO report: "I can't
// tell which apartment it is, where, or who to call").
//
// properties and profiles are invisible to a cleaner under RLS, so everything
// here must come through get_my_cleaning_task_owner_details(). Owner and
// cleaner are always two different accounts in this file: a single account
// playing both roles is exactly what hid the bug.
//
// Every row this file creates is far in the future (clear of the seed's jobs and
// of the cleaner's 30-minute slot rule) and is deleted again in afterAll. A run
// that was killed leaves its rows behind, so beforeAll clears anything of the
// cleaner's dated 50+ days out (nothing else in the suite is) before it starts.
// The default fixtures share one browser context, so a test here uses
// `cleanerPage` and never a second role's page.
// ---------------------------------------------------------------------------

// Bakuriani is UTC+4 all year. The browser is pinned to it so the times on the
// cards do not depend on the machine running the tests.
test.use({ timezoneId: "Asia/Tbilisi", locale: "ka-GE" });

const LIVE = [
  "pending",
  "accepted",
  "cancellation_requested",
  "in_progress",
  "completed",
] as const;
const WITHHELD = ["declined", "cancelled"] as const;

const WHATSAPP_APARTMENT = "+995599000010";
// The pinned listing has its own number: it has to win over the owner's account number.
const PINNED_PHONE = "+995599000021";
const PINNED_LAT = 41.7536;
const PINNED_LNG = 43.5322;
// One unbroken word each: no space, hyphen or slash, so a browser has no place to break
// them and only `overflow-wrap` keeps them inside a 360 px card. (A title with hyphens
// wraps at the hyphens whatever the CSS says, which hid a missing `break-words`.)
const LONG_TITLE =
  "E2Eძალიანგრძელისახელისმქონებინარომელსაცსივრცეარაქვსდაამიტომუნდაგადავიდესახაზზე";
const LONG_ACTIVE_TITLE =
  "E2Eასევეძალიანგრძელისახელისმქონეაქტიურიბინარომელსაცსივრცეარაქვსდაგადავიდესახაზზე";
const LONG_URL =
  "ბაკურიანიდიდველიკოხტაქუჩასახლიმეთორმეტეშესასვლელიმარჯვენაკორპუსშიმესამეკომლი";
const PINNED_TITLE = "E2E პინიანი ბინა";
const INFINITE_JOB_CLIENT = "E2E უსასრულო";

// Characters that reorder or hide text, which an owner can type into a title or an
// address. Built from code points so the file holds no invisible characters.
const RLO = String.fromCharCode(0x202e); // right-to-left override
const ZWSP = String.fromCharCode(0x200b); // zero-width space
// A family emoji is three emoji joined by zero-width joiners: flattening must not split it.
const FAMILY = String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
const HOSTILE_TITLE = `E2E${RLO}${ZWSP}ბინა ${FAMILY}`;
// The joiners (U+200C/U+200D) are legitimate text and stay.
const INVISIBLE = new RegExp(
  `[${ZWSP}${String.fromCharCode(0x200e)}${String.fromCharCode(0x200f)}${String.fromCharCode(0x202a)}-${RLO}${String.fromCharCode(0x2066)}-${String.fromCharCode(0x2069)}${String.fromCharCode(0xfeff)}]`,
);

// One clock reading for the whole file: a run that crosses 00:00 UTC (04:00 in
// Bakuriani) must not move the days the tests click away from the days beforeAll
// created the jobs on.
const RUN_STARTED = Date.now();

/** 07:00 UTC (11:00 in Bakuriani) `days` from the start of the run. */
function farFuture(days: number, minutes = 0): Date {
  const date = new Date(RUN_STARTED);
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(7, minutes, 0, 0);
  return date;
}

/** YYYY-MM-DD of an instant in Bakuriani, which is what the calendar's day cells are keyed by. */
function tbilisiDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tbilisi" }).format(
    date,
  );
}

/** A Supabase client that acts as `user`: their RLS, their grants. */
async function clientFor(user: TestUser) {
  const env = configureIsolatedE2E();
  const client = createClient(env.supabaseUrl, env.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.setSession({
    access_token: user.accessToken,
    refresh_token: user.refreshToken,
  });
  expect(error).toBeNull();
  return client;
}

/** Every row of the details RPC for `user`, by call-out id. */
async function detailsFor(user: TestUser) {
  const { data, error } = await loadCleaningTaskOwnerDetails(
    await clientFor(user),
  );
  expect(error).toBeNull();
  return new Map((data ?? []).map((row) => [row.task_id, row]));
}

/** The cookie banner is fixed to the bottom of the viewport and would sit on top of the cards. */
async function answerCookieBanner(page: Page) {
  await page.context().addCookies([
    {
      name: "mb_cookie_consent",
      value: encodeURIComponent("v2|analytics=0|location=0"),
      url: configureIsolatedE2E().baseUrl,
    },
  ]);
}

/**
 * Bring a month into view and click a day on the schedule's calendar. A click on
 * the server-rendered calendar before React has hydrated it does nothing, and the
 * calendar computes "next month" from the month it last rendered, so a second
 * click before the first has rendered is lost: wait for hydration, then for each
 * month to appear (its 15th exists only in its own month's grid) before stepping on.
 * The calendar starts on the current month: load the page again before a second day.
 */
async function selectDay(page: Page, date: Date) {
  await page.waitForFunction(() => {
    const next = document.querySelector(
      '[data-testid="cleaner-calendar-next-month"]',
    );
    return (
      !!next && Object.keys(next).some((key) => key.startsWith("__reactProps$"))
    );
  });
  const [year, month] = tbilisiDay(date).split("-").map(Number);
  let [shownYear, shownMonth] = tbilisiDay(new Date()).split("-").map(Number);
  while (shownYear * 12 + shownMonth < year * 12 + month) {
    await page.getByTestId("cleaner-calendar-next-month").click();
    shownMonth += 1;
    if (shownMonth > 12) {
      shownMonth = 1;
      shownYear += 1;
    }
    const middle = `${shownYear}-${String(shownMonth).padStart(2, "0")}-15`;
    await expect(
      page.getByTestId(`cleaner-calendar-day-${middle}`),
    ).toBeVisible();
  }
  await page.getByTestId(`cleaner-calendar-day-${tbilisiDay(date)}`).click();
}

/**
 * Nothing on the page may be wider than the phone, and none of these may be cut off
 * (a clipped element reports more scrollable width than it has). The dashboard's
 * scroller is <main>, not the document, so the document never reports sideways
 * overflow by itself: <main> is checked too.
 */
async function expectNotClipped(page: Page, selectors: string[]) {
  const viewport = page.viewportSize()!;
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
    "the page scrolls sideways",
  ).toBeLessThanOrEqual(viewport.width);
  expect(
    await page.evaluate(() => {
      const main = document.querySelector("main");
      return main ? main.scrollWidth - main.clientWidth : 0;
    }),
    "the dashboard's scroller scrolls sideways",
  ).toBeLessThanOrEqual(1);
  for (const selector of selectors) {
    const box = await page
      .locator(selector)
      .first()
      .evaluate((el) => ({
        clipped: el.scrollWidth > el.clientWidth + 1,
        right: el.getBoundingClientRect().right,
      }));
    expect(box.clipped, `${selector} is clipped`).toBe(false);
    expect(box.right, `${selector} runs off the screen`).toBeLessThanOrEqual(
      viewport.width,
    );
  }
}

/** Nothing inside a card may reach past the card's own right edge. */
async function expectInsideCard(page: Page, cardSelector: string) {
  const outside = await page
    .locator(cardSelector)
    .first()
    .evaluate((card) => {
      const right = card.getBoundingClientRect().right;
      return [...card.querySelectorAll("*")]
        .filter((el) => {
          const box = el.getBoundingClientRect();
          return box.width > 0 && box.right > right + 1;
        })
        .map(
          (el) =>
            `${el.tagName.toLowerCase()}[${el.getAttribute("data-testid") ?? ""}] ${(el.textContent ?? "").trim().slice(0, 30)}`,
        );
    });
  expect(outside, `${cardSelector} has content outside the card`).toEqual([]);
}

test.describe("Cleaner call-out details", () => {
  test.describe.configure({ mode: "serial" });

  const taskIds: string[] = [];
  const propertyIds: string[] = [];
  const manualIds: string[] = [];
  const ui = {
    pending: randomUUID(),
    areaOnly: randomUUID(),
    whatsapp: randomUUID(),
    long: randomUUID(),
    pinned: randomUUID(),
    noPrice: randomUUID(),
    longActive: randomUUID(),
    areaOnlyActive: randomUUID(),
  };
  // The listing with a pin and a number of its own; set in beforeAll.
  const pinnedListing = { id: "" };

  const task = async (over: Partial<TablesInsert<"cleaning_tasks">>) => {
    const row = await cleaningTasks.create({
      property_id: TEST_IDS.apartment,
      owner_id: TEST_IDS.renter,
      cleaner_id: TEST_IDS.cleaner,
      cleaner_service_id: TEST_IDS.cleaningServicePrimary,
      service_title: "E2E დილის დასუფთავება",
      cleaning_type: "standard",
      scheduled_at: farFuture(100).toISOString(),
      price: 80,
      price_unit: "საათი",
      status: "pending",
      ...over,
    });
    taskIds.push(row.id);
    return row;
  };

  const listing = async (over: Partial<TablesInsert<"properties">>) => {
    const row = await properties.create({
      id: randomUUID(),
      owner_id: TEST_IDS.renter,
      type: "apartment",
      title: "E2E",
      description: "E2E listing for the cleaner call-out details",
      location: "ბაკურიანი, კოხტა",
      area_sqm: 30,
      rooms: 1,
      bathrooms: 1,
      capacity: 2,
      price_per_night: 100,
      currency: "GEL",
      amenities: [],
      photos: [],
      status: "draft",
      is_for_sale: false,
      ...over,
    });
    propertyIds.push(row.id);
    return row;
  };

  test.beforeAll(async () => {
    // A killed earlier run leaves far-future jobs behind (the cleaner's 30-minute
    // slot rule refuses a repeat at the same instant, and a job still pointing at a
    // listing blocks its delete) and its listings.
    const staleJobs = await supabaseAdmin
      .from("cleaning_tasks")
      .delete()
      .eq("cleaner_id", TEST_IDS.cleaner)
      .gte(
        "scheduled_at",
        new Date(Date.now() + 50 * 86_400_000).toISOString(),
      );
    if (staleJobs.error) {
      console.error("cleanup: stale jobs", staleJobs.error.message);
    }
    const staleManual = await supabaseAdmin
      .from("cleaner_manual_tasks")
      .delete()
      .eq("cleaner_id", TEST_IDS.cleaner)
      .eq("client_name", INFINITE_JOB_CLIENT);
    if (staleManual.error) {
      console.error("cleanup: stale manual jobs", staleManual.error.message);
    }
    // A job still pointing at a listing blocks its delete, whatever its date.
    const staleListings = await supabaseAdmin
      .from("properties")
      .select("id")
      .eq("owner_id", TEST_IDS.renter)
      .in("title", [
        LONG_TITLE,
        LONG_ACTIVE_TITLE,
        PINNED_TITLE,
        HOSTILE_TITLE,
      ]);
    const staleIds = (staleListings.data ?? []).map((row) => row.id);
    if (staleListings.error) {
      console.error("cleanup: stale listings", staleListings.error.message);
    }
    if (staleIds.length) {
      const jobs = await supabaseAdmin
        .from("cleaning_tasks")
        .delete()
        .in("property_id", staleIds);
      if (jobs.error) console.error("cleanup: their jobs", jobs.error.message);
      const removed = await supabaseAdmin
        .from("properties")
        .delete()
        .in("id", staleIds);
      if (removed.error) {
        console.error("cleanup: stale listings", removed.error.message);
      }
    }

    // A listing only the details RPC can describe: long unbroken name, not public.
    const longProperty = await listing({
      title: LONG_TITLE,
      description: "E2E draft listing for the clipping check",
    });
    // A public listing with a long unbroken name: its title is a link.
    const longActive = await listing({
      title: LONG_ACTIVE_TITLE,
      status: "active",
    });
    // A pin and a number of its own (not the owner's account number), on a draft.
    const pinned = await listing({
      title: PINNED_TITLE,
      location: "ბაკურიანი, დიდველი",
      location_lat: PINNED_LAT,
      location_lng: PINNED_LNG,
      phone: PINNED_PHONE,
      whatsapp: WHATSAPP_APARTMENT,
      area_sqm: 45,
    });
    pinnedListing.id = pinned.id;

    await task({
      id: ui.pending,
      address: "ბაკურიანი, დიდველის ქუჩა, ბინა 12",
      notes: "გასაღები მეზობელთანაა",
      scheduled_at: farFuture(100).toISOString(),
    });
    // No address typed: all the cleaner has is the listing's area name.
    await task({
      id: ui.areaOnly,
      property_id: TEST_IDS.villa,
      address: null,
      status: "accepted",
      scheduled_at: farFuture(101).toISOString(),
    });
    await task({
      id: ui.whatsapp,
      property_id: TEST_IDS.whatsappApartment,
      address: "ბაკურიანი, დიდველი, ბინა 3",
      status: "accepted",
      scheduled_at: farFuture(102).toISOString(),
    });
    await task({
      id: ui.long,
      property_id: longProperty.id,
      address: LONG_URL,
      status: "accepted",
      scheduled_at: farFuture(103).toISOString(),
    });
    await task({
      id: ui.pinned,
      property_id: pinned.id,
      address: "ბაკურიანი, დიდველი, ბინა 21",
      status: "accepted",
      scheduled_at: farFuture(104).toISOString(),
    });
    // A service with no price: the price slot says "by agreement".
    await task({
      id: ui.noPrice,
      address: "ბაკურიანი, დიდველი, ბინა 5",
      status: "accepted",
      price: null,
      price_unit: null,
      scheduled_at: farFuture(105).toISOString(),
    });
    await task({
      id: ui.longActive,
      property_id: longActive.id,
      address: LONG_URL,
      status: "accepted",
      scheduled_at: farFuture(106).toISOString(),
    });
    // Under way, with only the area known: the "ask for the address" hint is moot.
    await task({
      id: ui.areaOnlyActive,
      property_id: TEST_IDS.villa,
      address: null,
      status: "in_progress",
      scheduled_at: farFuture(107).toISOString(),
    });
  });

  test.afterAll(async () => {
    // Tasks first: they reference the listings.
    if (taskIds.length) {
      const { error } = await supabaseAdmin
        .from("cleaning_tasks")
        .delete()
        .in("id", taskIds);
      if (error) console.error("cleanup: jobs", error.message);
    }
    if (manualIds.length) {
      const { error } = await supabaseAdmin
        .from("cleaner_manual_tasks")
        .delete()
        .in("id", manualIds);
      if (error) console.error("cleanup: manual jobs", error.message);
    }
    for (const id of propertyIds) {
      await properties
        .delete(id)
        .catch((error) => console.error("cleanup: listing", id, error));
    }
  });

  test("the details RPC discloses exactly while a call-out is live", async () => {
    const users = loadTestUsers();
    const byStatus = new Map<string, string>();
    for (const [index, status] of [...LIVE, ...WITHHELD].entries()) {
      const row = await task({
        property_id: TEST_IDS.whatsappApartment,
        status,
        scheduled_at: farFuture(60 + index).toISOString(),
      });
      byStatus.set(status, row.id);
    }
    const details = await detailsFor(users.cleaner);

    for (const status of LIVE) {
      const row = details.get(byStatus.get(status)!);
      expect(row, `${status}: the row`).toBeTruthy();
      expect(row!.owner_name, status).toBe("E2E გამქირავებელი");
      expect(row!.phone, `${status}: the owner's number`).toBe(PHONES.renter);
      expect(row!.whatsapp, `${status}: the owner's WhatsApp`).toBe(
        WHATSAPP_APARTMENT,
      );
      expect(row!.property_title, status).toBe("E2E WhatsApp ბინა");
      expect(row!.property_location, status).toBe("ბაკურიანი, დიდველი");
      expect(row!.property_type, status).toBe("apartment");
      expect(row!.property_is_active, status).toBe(true);
      expect(row!.property_is_for_sale, status).toBe(false);
      expect(Number(row!.property_area_sqm), status).toBe(45);
      expect(row!.property_rooms, status).toBe(1);
      expect(row!.property_bathrooms, status).toBe(1);
    }

    // A declined or cancelled call-out still returns its row, with nothing in it:
    // not the number, not the owner, not even where the apartment is.
    for (const status of WITHHELD) {
      const row = details.get(byStatus.get(status)!);
      expect(row, `${status}: the row`).toBeTruthy();
      expect(
        { ...row, task_id: null },
        `${status} must withhold everything`,
      ).toEqual({
        task_id: null,
        owner_name: null,
        owner_avatar_url: null,
        phone: null,
        whatsapp: null,
        property_id: null,
        property_title: null,
        property_location: null,
        property_lat: null,
        property_lng: null,
        property_type: null,
        property_is_for_sale: false,
        property_is_active: false,
        property_area_sqm: null,
        property_rooms: null,
        property_bathrooms: null,
      });
    }

    // Only the call-out's own cleaner gets rows: not its owner, not a stranger.
    const ids = [...byStatus.values()];
    for (const other of [users.renter, users.guest]) {
      const rows = await detailsFor(other);
      expect(ids.filter((id) => rows.has(id))).toEqual([]);
    }
  });

  test("the pin and the listing's own number are disclosed only while a call-out is live", async () => {
    const live = await task({
      property_id: pinnedListing.id,
      status: "accepted",
      scheduled_at: farFuture(70).toISOString(),
    });
    const gone = await task({
      property_id: pinnedListing.id,
      status: "declined",
      scheduled_at: farFuture(71).toISOString(),
    });
    const details = await detailsFor(loadTestUsers().cleaner);

    // the listing's number beats the owner's account number, and the pin of a draft is
    // still the owner's own act of sending this cleaner there
    const row = details.get(live.id)!;
    expect(row.phone).toBe(PINNED_PHONE);
    expect(row.phone).not.toBe(PHONES.renter);
    expect(Number(row.property_lat)).toBeCloseTo(PINNED_LAT, 4);
    expect(Number(row.property_lng)).toBeCloseTo(PINNED_LNG, 4);
    expect(row.property_is_active).toBe(false);

    const withheld = details.get(gone.id)!;
    expect(withheld.phone).toBeNull();
    expect(withheld.property_lat).toBeNull();
    expect(withheld.property_lng).toBeNull();
  });

  test("a draft listing is described but not offered as a link", async () => {
    const details = await detailsFor(loadTestUsers().cleaner);
    const row = details.get(ui.long)!;
    expect(row.property_title).toBe(LONG_TITLE);
    expect(row.property_is_active).toBe(false);
    expect(row.phone).toBe(PHONES.renter);
  });

  test("no browser session can write cleaning_tasks", async () => {
    const users = loadTestUsers();
    const target = await task({
      property_id: TEST_IDS.whatsappApartment,
      scheduled_at: farFuture(80).toISOString(),
    });

    for (const [who, user] of [
      ["cleaner", users.cleaner],
      ["owner", users.renter],
    ] as const) {
      const client = await clientFor(user);
      // "permission denied for table" is the missing grant; a row-level-security
      // refusal also carries 42501 but says "violates row-level security policy".
      const forged = await client.from("cleaning_tasks").insert({
        property_id: TEST_IDS.whatsappApartment,
        owner_id: user.id,
        cleaner_id: user.id,
        cleaning_type: "standard",
        scheduled_at: farFuture(81).toISOString(),
      });
      expect(forged.error?.code, `${who}: insert`).toBe("42501");
      expect(forged.error?.message, `${who}: insert`).toMatch(
        /permission denied/i,
      );
      const update = await client
        .from("cleaning_tasks")
        .update({ status: "accepted" })
        .eq("id", target.id);
      expect(update.error?.code, `${who}: update`).toBe("42501");
      expect(update.error?.message, `${who}: update`).toMatch(
        /permission denied/i,
      );
      const remove = await client
        .from("cleaning_tasks")
        .delete()
        .eq("id", target.id);
      expect(remove.error?.code, `${who}: delete`).toBe("42501");
      expect(remove.error?.message, `${who}: delete`).toMatch(
        /permission denied/i,
      );

      // Reading their own call-outs still works, which the dashboards and Realtime need.
      const read = await client
        .from("cleaning_tasks")
        .select("id")
        .eq("id", target.id);
      expect(read.error, `${who}: select`).toBeNull();
      expect(read.data).toHaveLength(1);
    }
    expect((await cleaningTasks.get(target.id))?.status).toBe("pending");
  });

  test("the bell gives the cleaner Tbilisi time and one clean line; absurd dates are refused", async () => {
    const renter = await clientFor(loadTestUsers().renter);
    // Unique to this run, so the lookup below can only find the row this test made.
    const marker = randomUUID().slice(0, 8);
    const args = {
      p_property_id: TEST_IDS.apartment,
      p_cleaner_service_id: TEST_IDS.cleaningServicePrimary,
      p_cleaning_type: "standard",
      p_notes: null,
    };

    // 07:17 UTC is 11:17 in Bakuriani. The bell used to say 07:17.
    const created = await createPlatformCleanerTask(renter, {
      ...args,
      p_scheduled_at: farFuture(90, 17).toISOString(),
      p_address: `ქუჩა 1\n\nნახვა: https://evil.example/${marker}\tბინა 4`,
    });
    expect(created.error).toBeNull();
    taskIds.push((created.data as { id: string }).id);

    const { data } = await supabaseAdmin
      .from("notifications")
      .select("message")
      .eq("user_id", TEST_IDS.cleaner)
      .eq("type", "cleaning_task_new")
      .ilike("message", `%${marker}%`)
      .limit(1);
    const message = data?.[0]?.message ?? "";
    expect(message).toContain("11:17");
    expect(message).not.toContain("07:17");
    // where the job is, flattened to a single line so it cannot fake a second one
    expect(message).toContain(
      `ქუჩა 1 ნახვა: https://evil.example/${marker} ბინა 4`,
    );
    expect(message).not.toMatch(/[\n\r\t]/);

    // What the owner types can also reorder or hide text: a right-to-left override in the
    // address reorders the time and the address in the bell, a zero-width space in the
    // title is invisible.
    const hostile = await listing({ title: HOSTILE_TITLE });
    const hostileMarker = randomUUID().slice(0, 8);
    const second = await createPlatformCleanerTask(renter, {
      ...args,
      p_property_id: hostile.id,
      p_scheduled_at: farFuture(91, 17).toISOString(),
      p_address: `ქუჩა${RLO} 1${ZWSP}\n${hostileMarker}`,
    });
    expect(second.error).toBeNull();
    taskIds.push((second.data as { id: string }).id);
    const { data: hostileRows } = await supabaseAdmin
      .from("notifications")
      .select("message")
      .eq("user_id", TEST_IDS.cleaner)
      .eq("type", "cleaning_task_new")
      .ilike("message", `%${hostileMarker}%`)
      .limit(1);
    const hostileMessage = hostileRows?.[0]?.message ?? "";
    expect(hostileMessage).not.toMatch(INVISIBLE);
    expect(hostileMessage).toContain(`E2E ბინა ${FAMILY} • `);
    expect(hostileMessage).toContain(`ქუჩა 1 ${hostileMarker}`);

    // A call-out in year 275760 cannot be formatted by the cleaner's dashboard and
    // would take the whole page down with it.
    for (const [label, at] of [
      ["infinity", "infinity"],
      [
        "three years out",
        new Date(Date.now() + 3 * 365 * 86_400_000).toISOString(),
      ],
    ] as const) {
      const refused = await createPlatformCleanerTask(renter, {
        ...args,
        p_scheduled_at: at,
        p_address: null,
      });
      // If the refusal ever regresses, the row it made must not outlive the test.
      const stray = (refused.data as { id?: string } | null)?.id;
      if (stray) taskIds.push(stray);
      expect(refused.error?.code, label).toBe("22023");
    }
  });

  test("a new request names the apartment, what it is, where, who to call and when", async ({
    cleanerPage,
  }) => {
    await answerCookieBanner(cleanerPage);
    await cleanerPage.goto("/dashboard/cleaner");
    expect(cleanerPage.url()).not.toContain("/auth/");

    const card = cleanerPage.getByTestId(
      `cleaner-pending-task-platform-${ui.pending}`,
    );
    await expect(card).toBeVisible();
    // which apartment, with a way to open its listing
    const link = card.getByTestId("cleaner-task-listing-link");
    await expect(link).toContainText("E2E ბინა ბაკურიანში");
    await expect(link).toHaveAttribute(
      "href",
      new RegExp(`/apartments/${TEST_IDS.apartment}$`),
    );
    await expect(link).toHaveAttribute("target", "_blank");
    // what it is
    await expect(card.getByTestId("cleaner-task-facts")).toHaveText(
      "65 მ² · 2 ოთახი · 1 სააბაზანო",
    );
    // where: an address the owner typed needs no "ask for the exact one" hint
    await expect(card.getByTestId("cleaner-task-address")).toHaveText(
      "ბაკურიანი, დიდველის ქუჩა, ბინა 12",
    );
    await expect(card.getByTestId("cleaner-task-area-only")).toHaveCount(0);
    // who to call, and what they wrote
    await expect(card).toContainText("E2E გამქირავებელი");
    await expect(card.getByTestId("cleaner-task-call")).toHaveAttribute(
      "href",
      `tel:${PHONES.renter}`,
    );
    await expect(card.getByTestId("cleaner-task-notes")).toContainText(
      "გასაღები მეზობელთანაა",
    );
    // when (the browser is in Bakuriani: 07:00 UTC is 11:00) and for how much
    await expect(card).toContainText("11:00");
    await expect(card).toContainText(/80 ₾\s*\/\s*საათი/);
    // and the answer to "what does Confirm do"
    await expect(card).toContainText(
      "მესაკუთრე კი თქვენი ტელეფონის ნომერსაც ნახავს",
    );
    // with everything in front of the cleaner, Confirm is available
    await expect(card.getByTestId("cleaner-task-confirm")).toBeEnabled();
  });

  test("an accepted job shows WhatsApp, the facts, the pin and says when only the area is known", async ({
    cleanerPage,
  }) => {
    await answerCookieBanner(cleanerPage);
    await cleanerPage.goto("/dashboard/cleaner");
    expect(cleanerPage.url()).not.toContain("/auth/");

    const whatsapp = cleanerPage.getByTestId(
      `cleaner-scheduled-task-platform-${ui.whatsapp}`,
    );
    await expect(whatsapp).toBeVisible();
    await expect(whatsapp.getByTestId("cleaner-task-whatsapp")).toHaveAttribute(
      "href",
      "https://wa.me/995599000010",
    );
    await expect(whatsapp.getByTestId("cleaner-task-facts")).toHaveText(
      "45 მ² · 1 ოთახი · 1 სააბაზანო",
    );
    await expect(whatsapp.getByTestId("cleaner-task-area-only")).toHaveCount(0);
    // the owner-typed address shares a line with the time: it is isolated, so a bidi
    // override typed into it cannot reorder what comes before it
    await expect(
      whatsapp.getByTestId("cleaner-task-when-where").locator("bdi"),
    ).toHaveText("ბაკურიანი, დიდველი, ბინა 3");

    const areaOnly = cleanerPage.getByTestId(
      `cleaner-scheduled-task-platform-${ui.areaOnly}`,
    );
    await expect(areaOnly).toContainText("ბაკურიანი, კოხტა");
    await expect(areaOnly.getByTestId("cleaner-task-area-only")).toBeVisible();
    await expect(areaOnly.getByTestId("cleaner-task-facts")).toHaveText(
      "200 მ² · 5 ოთახი · 3 სააბაზანო",
    );

    // the listing's own number and its pin: a tel: link to the one, a route to the other
    const pinned = cleanerPage.getByTestId(
      `cleaner-scheduled-task-platform-${ui.pinned}`,
    );
    await expect(pinned.getByTestId("cleaner-task-call")).toHaveAttribute(
      "href",
      `tel:${PINNED_PHONE}`,
    );
    await expect(pinned.getByTestId("cleaner-task-directions")).toHaveAttribute(
      "href",
      new RegExp(`destination=${PINNED_LAT}%2C${PINNED_LNG}`),
    );

    // once the job is under way, "ask for the exact address" has nothing left to say
    const underWay = cleanerPage.getByTestId(
      `cleaner-scheduled-task-platform-${ui.areaOnlyActive}`,
    );
    await expect(underWay.getByTestId("cleaner-task-facts")).toBeVisible();
    await expect(underWay.getByTestId("cleaner-task-area-only")).toHaveCount(0);

    // the link to the listing is a thumb-sized target (CLAUDE.md: 44 px)
    const box = await whatsapp
      .getByTestId("cleaner-task-listing-link")
      .boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test("the schedule page tells a start time from a deadline and shows the same facts", async ({
    cleanerPage,
  }) => {
    await answerCookieBanner(cleanerPage);
    await cleanerPage.goto("/dashboard/cleaner/schedule");
    expect(cleanerPage.url()).not.toContain("/auth/");

    await selectDay(cleanerPage, farFuture(102));
    const day = cleanerPage.getByTestId("cleaner-selected-day-schedule");
    await expect(day).toContainText("E2E WhatsApp ბინა");
    await expect(day).toContainText("დაწყების დრო");
    await expect(day).toContainText("11:00 სთ");
    await expect(day).not.toContainText("უნდა დასრულდეს");
    await expect(day.getByTestId("cleaner-task-facts")).toHaveText(
      "45 მ² · 1 ოთახი · 1 სააბაზანო",
    );
    await expect(day.getByTestId("cleaner-task-whatsapp")).toHaveAttribute(
      "href",
      "https://wa.me/995599000010",
    );

    // a job with only its area known says so here too
    await cleanerPage.goto("/dashboard/cleaner/schedule");
    await selectDay(cleanerPage, farFuture(101));
    await expect(day.getByTestId("cleaner-task-area-only")).toBeVisible();
    await expect(day.getByTestId("cleaner-task-facts")).toHaveText(
      "200 მ² · 5 ოთახი · 3 სააბაზანო",
    );

    // a job with a pin has its route
    await cleanerPage.goto("/dashboard/cleaner/schedule");
    await selectDay(cleanerPage, farFuture(104));
    await expect(day.getByTestId("cleaner-task-directions")).toHaveAttribute(
      "href",
      new RegExp(`destination=${PINNED_LAT}%2C${PINNED_LNG}`),
    );

    // a service with no price says so instead of leaving the row empty
    await cleanerPage.goto("/dashboard/cleaner/schedule");
    await selectDay(cleanerPage, farFuture(105));
    await expect(day).toContainText("შეთანხმებით");
  });

  test("a number that is not a mobile is shown as text; with no number the hint stops saying to call", async ({
    cleanerPage,
  }) => {
    await answerCookieBanner(cleanerPage);
    let mode: "landline" | "none" = "landline";
    // What the owner left in the listing is out of this test's hands: rewrite the answer.
    await cleanerPage.route(
      "**/rest/v1/rpc/get_my_cleaning_task_owner_details*",
      async (route) => {
        const response = await route.fetch();
        const rows = (await response.json()) as Array<Record<string, unknown>>;
        await route.fulfill({
          response,
          json: rows.map((row) =>
            mode === "none"
              ? { ...row, phone: null, whatsapp: null }
              : { ...row, phone: "032 2 00 00 00", whatsapp: null },
          ),
        });
      },
    );

    for (const next of ["landline", "none"] as const) {
      mode = next;
      await cleanerPage.goto("/dashboard/cleaner/schedule");
      expect(cleanerPage.url()).not.toContain("/auth/");
      await selectDay(cleanerPage, farFuture(101)); // the villa: only its area is known
      const day = cleanerPage.getByTestId("cleaner-selected-day-schedule");
      const hint = day.getByTestId("cleaner-task-area-only");
      if (next === "landline") {
        const call = day.getByTestId("cleaner-task-call");
        await expect(call).toContainText("032 2 00 00 00");
        await expect(call).not.toHaveAttribute("href", /.+/);
        await expect(hint).toContainText("დაურეკეთ მესაკუთრეს");
      } else {
        await expect(
          day.getByTestId("cleaner-task-phone-missing"),
        ).toBeVisible();
        await expect(hint).toContainText("ნომერიც არ მიუთითა");
        await expect(hint).not.toContainText("დაურეკეთ");
      }
    }
  });

  test("when the details cannot be loaded the card says so instead of claiming there is no number", async ({
    cleanerPage,
  }) => {
    await answerCookieBanner(cleanerPage);
    // The browser client is what the schedule page loads them with: fail every attempt.
    await cleanerPage.route(
      "**/rest/v1/rpc/get_my_cleaning_task_owner_details*",
      (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ code: "XX000", message: "forced failure" }),
        }),
    );
    await cleanerPage.goto("/dashboard/cleaner/schedule");
    expect(cleanerPage.url()).not.toContain("/auth/");

    await selectDay(cleanerPage, farFuture(102));
    const day = cleanerPage.getByTestId("cleaner-selected-day-schedule");
    await expect(
      day.getByTestId("cleaner-task-details-unavailable"),
    ).toBeVisible();
    await expect(day.getByTestId("cleaner-task-phone-missing")).toHaveCount(0);
    await expect(day.getByTestId("cleaner-task-call")).toHaveCount(0);
  });

  test("a failed refetch on the schedule keeps the details of a job the cleaner is looking at", async ({
    cleanerPage,
  }) => {
    test.setTimeout(120_000);
    await answerCookieBanner(cleanerPage);
    let failing = false;
    await cleanerPage.route(
      "**/rest/v1/rpc/get_my_cleaning_task_owner_details*",
      (route) =>
        failing
          ? route.fulfill({
              status: 500,
              contentType: "application/json",
              body: JSON.stringify({
                code: "XX000",
                message: "forced failure",
              }),
            })
          : route.continue(),
    );
    await cleanerPage.goto("/dashboard/cleaner/schedule");
    expect(cleanerPage.url()).not.toContain("/auth/");
    await selectDay(cleanerPage, farFuture(102));
    const day = cleanerPage.getByTestId("cleaner-selected-day-schedule");
    await expect(day.getByTestId("cleaner-task-call")).toBeVisible();

    const touch = (notes: string | null) =>
      supabaseAdmin
        .from("cleaning_tasks")
        .update({ notes })
        .eq("id", ui.whatsapp);
    try {
      // The owner's note is part of the call-out row, so seeing a new note proves the
      // page fetched everything again. The page subscribes only after it has hydrated
      // and an event sent before the channel is joined is lost: touch the row again
      // until the page reacts.
      failing = true;
      const note = `კარის კოდი ${randomUUID().slice(0, 4)}`;
      await expect(async () => {
        await touch(note);
        await expect(day.getByTestId("cleaner-task-notes")).toContainText(
          note,
          {
            timeout: 3_000,
          },
        );
      }).toPass({ timeout: 40_000 });
      // That refetch could not read the details, yet the card still has them: a weak
      // signal that aborts one request must not take the owner's number off a job.
      await expect(day.getByTestId("cleaner-task-call")).toBeVisible();
      await expect(day.getByTestId("cleaner-task-facts")).toBeVisible();
      await expect(
        day.getByTestId("cleaner-task-details-unavailable"),
      ).toHaveCount(0);
    } finally {
      failing = false;
      await touch(null);
    }
  });

  test("Confirm waits for the details of a request that arrives unreadable, while one already read keeps its own", async ({
    cleanerPage,
  }) => {
    test.setTimeout(120_000);
    await answerCookieBanner(cleanerPage);
    let failing = false;
    await cleanerPage.route(
      "**/rest/v1/rpc/get_my_cleaning_task_owner_details*",
      (route) =>
        failing
          ? route.fulfill({
              status: 500,
              contentType: "application/json",
              body: JSON.stringify({
                code: "XX000",
                message: "forced failure",
              }),
            })
          : route.continue(),
    );
    await cleanerPage.goto("/dashboard/cleaner");
    expect(cleanerPage.url()).not.toContain("/auth/");
    const read = cleanerPage.getByTestId(
      `cleaner-pending-task-platform-${ui.pending}`,
    );
    await expect(read.getByTestId("cleaner-task-confirm")).toBeEnabled();

    const stamp = () => `გასაღები მეზობელთანაა (${randomUUID().slice(0, 4)})`;
    const touch = (notes: string) =>
      supabaseAdmin
        .from("cleaning_tasks")
        .update({ notes })
        .eq("id", ui.pending);
    try {
      // A second request arrives while the details lookup fails (a weak signal, an
      // outage). The dashboard fetches everything again on a Realtime event; it
      // subscribes only after it has hydrated and an event sent before the channel is
      // joined is lost, so the first request is touched again until the page reacts.
      failing = true;
      const arrived = await task({
        address: "ბაკურიანი, დიდველი, ბინა 9",
        scheduled_at: farFuture(108).toISOString(),
      });
      const card = cleanerPage.getByTestId(
        `cleaner-pending-task-platform-${arrived.id}`,
      );
      await expect(async () => {
        await touch(stamp());
        await expect(card).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 40_000 });

      // The newcomer has no details: it says so, and Confirm waits (Decline does not).
      const confirm = card.getByTestId("cleaner-task-confirm");
      const note = card.getByTestId("cleaner-task-confirm-note");
      await expect(
        card.getByTestId("cleaner-task-details-unavailable"),
      ).toBeVisible();
      await expect(confirm).toBeDisabled();
      // The reason sits right above the buttons and is tied to Confirm, not only a
      // screen up in the owner's box.
      await expect(note).toContainText("ვერ მოხერხდა");
      await expect(confirm).toHaveAttribute(
        "aria-describedby",
        (await note.getAttribute("id")) ?? "",
      );
      await expect(card.getByTestId("cleaner-task-decline")).toBeEnabled();
      // The request the cleaner had already read went through the same failed refetch
      // and is as it was: details on it, Confirm available.
      await expect(read.getByTestId("cleaner-task-call")).toBeVisible();
      await expect(
        read.getByTestId("cleaner-task-details-unavailable"),
      ).toHaveCount(0);
      await expect(read.getByTestId("cleaner-task-confirm")).toBeEnabled();

      // ...and the newcomer becomes readable as soon as the lookup works again.
      failing = false;
      await expect(async () => {
        await touch(stamp());
        await expect(card.getByTestId("cleaner-task-call")).toBeVisible({
          timeout: 3_000,
        });
      }).toPass({ timeout: 40_000 });
      await expect(confirm).toBeEnabled();
      await expect(confirm).not.toHaveAttribute("aria-describedby", /.+/);
      await expect(note).toContainText(
        "მესაკუთრე კი თქვენი ტელეფონის ნომერსაც ნახავს",
      );
    } finally {
      failing = false;
      await touch("გასაღები მეზობელთანაა");
    }
  });

  test("the owner's call-out form asks for a start time, and its address follows the apartment", async ({
    renterPage,
  }) => {
    // Redialling a cancelled call-out opens the form with its apartment and address.
    const cancelled = await task({
      property_id: pinnedListing.id,
      status: "cancelled",
      address: "ქუჩა 7",
      scheduled_at: farFuture(110).toISOString(),
    });
    await answerCookieBanner(renterPage);
    await renterPage.goto("/dashboard/renter/cleaners");
    expect(renterPage.url()).not.toContain("/auth/");
    await renterPage
      .getByTestId(`renter-cleaning-task-${cancelled.id}`)
      .getByRole("button", { name: "თავიდან გამოძახება" })
      .click();

    const form = renterPage
      .locator("form")
      .filter({ has: renterPage.locator("select") });
    const address = form.getByPlaceholder("მისამართი", { exact: true });
    // The cleaner reads the time as "Starts at": the owner is asked for a start.
    await expect(form.getByText("დაწყების დრო", { exact: true })).toBeVisible();
    await expect(address).toHaveValue("ქუჩა 7");

    // Another apartment: the address typed for the previous one does not travel with it.
    await form.locator("select").first().selectOption({ label: LONG_TITLE });
    await expect(address).toHaveValue("ბაკურიანი, კოხტა");
  });

  test("a job stored with an impossible date does not take the cleaner's pages down", async ({
    cleanerPage,
  }) => {
    // cleaner_manual_tasks has no bound on scheduled_at, and date-fns throws on
    // 'infinity': one such row used to crash the whole page it was listed on.
    const { data, error } = await supabaseAdmin
      .from("cleaner_manual_tasks")
      .insert({
        cleaner_id: TEST_IDS.cleaner,
        client_name: INFINITE_JOB_CLIENT,
        cleaning_type: "standard",
        scheduled_at: "infinity",
        status: "accepted",
        price: 10,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    manualIds.push(data!.id);

    await answerCookieBanner(cleanerPage);
    await cleanerPage.goto("/dashboard/cleaner");
    expect(cleanerPage.url()).not.toContain("/auth/");
    // the other cards are still there, and this one shows a dash where its date would be
    await expect(
      cleanerPage.getByTestId(`cleaner-pending-task-platform-${ui.pending}`),
    ).toBeVisible();
    const infinite = cleanerPage.getByTestId(
      `cleaner-scheduled-task-manual-${data!.id}`,
    );
    await expect(infinite).toContainText(INFINITE_JOB_CLIENT);
    await expect(infinite.getByTestId("cleaner-task-when-where")).toContainText(
      "—",
    );

    await cleanerPage.goto("/dashboard/cleaner/schedule");
    expect(cleanerPage.url()).not.toContain("/auth/");
    await expect(
      cleanerPage.getByText(INFINITE_JOB_CLIENT).first(),
    ).toBeVisible();
  });

  test("on a phone nothing about the apartment is clipped", async ({
    cleanerPage,
  }) => {
    await cleanerPage.setViewportSize({ width: 360, height: 800 });
    await answerCookieBanner(cleanerPage);

    await cleanerPage.goto("/dashboard/cleaner/schedule");
    expect(cleanerPage.url()).not.toContain("/auth/");
    await selectDay(cleanerPage, farFuture(103));
    const day = cleanerPage.getByTestId("cleaner-selected-day-schedule");
    await expect(day.getByTestId("cleaner-task-title")).toHaveText(LONG_TITLE);
    await expect(day.getByTestId("cleaner-task-address")).toHaveText(LONG_URL);
    // a draft listing has no public page, so no link to it
    await expect(day.getByTestId("cleaner-task-listing-link")).toHaveCount(0);
    // the whole title and the whole address are in the layout, wrapped rather than cut off
    await expectNotClipped(cleanerPage, [
      `[data-testid="cleaner-selected-day-schedule"] [data-testid="cleaner-task-title"]`,
      `[data-testid="cleaner-selected-day-schedule"] [data-testid="cleaner-task-address"]`,
    ]);

    // the overview: a draft's card, a public listing's card (its title is a link) and a job with no price
    await cleanerPage.goto("/dashboard/cleaner");
    const card = (id: string) =>
      `[data-testid="cleaner-scheduled-task-platform-${id}"]`;
    for (const id of [ui.long, ui.longActive, ui.noPrice]) {
      await expect(cleanerPage.locator(card(id))).toBeVisible();
    }
    await expectNotClipped(cleanerPage, [
      `${card(ui.long)} [data-testid="cleaner-task-title"]`,
      `${card(ui.long)} [data-testid="cleaner-task-when-where"]`,
      `${card(ui.longActive)} [data-testid="cleaner-task-title"]`,
      `${card(ui.longActive)} [data-testid="cleaner-task-when-where"]`,
    ]);
    for (const id of [ui.long, ui.longActive, ui.noPrice]) {
      await expectInsideCard(cleanerPage, card(id));
    }

    // "by agreement" sits in the price slot beside other content: it has to fit the
    // narrowest phones and the widest translation, not only Georgian at 360 px
    for (const [path, width] of [
      ["/dashboard/cleaner", 360],
      ["/ru/dashboard/cleaner", 360],
      ["/dashboard/cleaner", 320],
    ] as const) {
      await cleanerPage.setViewportSize({ width, height: 800 });
      await cleanerPage.goto(path);
      await expect(cleanerPage.locator(card(ui.noPrice))).toBeVisible();
      await expectInsideCard(cleanerPage, card(ui.noPrice));
      await expectNotClipped(cleanerPage, [
        `${card(ui.noPrice)} [data-testid="cleaner-task-title"]`,
      ]);
    }
  });
});

import { randomInt, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  authenticateAsRole,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "../helpers/auth";
import { configureIsolatedE2E } from "../helpers/env";
import { supabaseAdmin } from "../helpers/supabase";

// ---------------------------------------------------------------------------
// Ownership verification ("მესაკუთრეობის დადასტურება", C39), end to end:
// an owner uploads an ID and one registry extract per listing, an admin
// decides, and an approved listing carries the badge until its identifying
// data changes or an admin revokes it.
//
// Everything here is this file's own: three fresh accounts (owner, a stranger
// and an admin; their phone numbers are cleared, so no SMS can go out, and
// their @e2e.mybakuriani.test addresses are never e-mailed), two rentals and a
// restaurant of the owner's, one rental of the stranger's. It does not need the
// shared seed: run it with --project=cross-role --no-deps --workers=1 against a
// local production build (E2E_BASE_URL). Every row, file and notice it makes is
// removed in afterAll. The purge-route test needs E2E_OWNERSHIP_PURGE_SECRET,
// the secret whose SHA-256 the server holds in OWNERSHIP_PURGE_SECRET_SHA256.
// ---------------------------------------------------------------------------

test.use({ timezoneId: "Asia/Tbilisi", locale: "ka-GE" });

const env = configureIsolatedE2E();
const BASE = env.baseUrl;
const BUCKET = "ownership-documents";
const RUN_STARTED = new Date().toISOString();
// One word in every title of this run, so /search?location= finds exactly them.
const TOKEN = `E2EOV${randomUUID().slice(0, 8)}`;
// Digits and dots only, like a real code (isValidCadastralCode); unique per run.
const CADASTRAL = `99.${randomInt(10, 99)}.${randomInt(10, 99)}.${randomInt(100, 999)}`;
const PURGE_SECRET = process.env.E2E_OWNERSHIP_PURGE_SECRET ?? "";

const JPEG = readFileSync(
  path.resolve(__dirname, "../../public/placeholder-property.jpg"),
);
const PDF = readFileSync(
  path.resolve(__dirname, "../../supabase/seed/sample-menu.pdf"),
);

const REJECT_REASON = "E2E: ამონაწერი სხვა ობიექტს ეხება";
const REVOKE_REASON = "E2E: მესაკუთრე შეიცვალა";
const DECIDED_TITLE = "მესაკუთრეობის დადასტურება: მოთხოვნა განხილულია";
const CLOSED_TITLE = "მესაკუთრეობის დადასტურება გაუქმდა";
const DATA_CHANGED = "მონაცემები შეიცვალა";
const BADGE_FULL = "მესაკუთრეობა დადასტურებულია";
const BADGE_EXPLANATION =
  "მესაკუთრემ წარმოადგინა ამონაწერი საჯარო რეესტრიდან და პირადობის დამადასტურებელი დოკუმენტი, რომლებიც შემოწმებულია MyBakuriani-ს მიერ.";
const SUBMITTED = "მოთხოვნა გაიგზავნა. შედეგს შეგატყობინებთ.";
const DESCRIPTION_BEFORE = "E2E ბინა მესაკუთრეობის შესამოწმებლად";
const DESCRIPTION_AFTER = "E2E ბინა — აღწერა განახლდა, მისამართი იგივეა";
const LOCATION_BEFORE = "ბაკურიანი, დიდველი";
const LOCATION_AFTER = "ბაკურიანი, კოხტა";

type Upload = { name: string; mimeType: string; buffer: Buffer };
const idCard = (name = "id-card.jpg"): Upload => ({
  name,
  mimeType: "image/jpeg",
  buffer: JPEG,
});
const extract = (name = "extract.pdf"): Upload => ({
  name,
  mimeType: "application/pdf",
  buffer: PDF,
});

const listings = {
  rental: randomUUID(),
  sibling: randomUUID(),
  food: randomUUID(),
  strangers: randomUUID(),
  adminOwn: randomUUID(),
};
const key = (kind: "property" | "service", id: string) => `${kind}:${id}`;

let owner: TestUser;
let stranger: TestUser;
let admin: TestUser;
let ownerContext: BrowserContext;
let strangerContext: BrowserContext;
let adminContext: BrowserContext;
let anonContext: BrowserContext;

/** A context that has answered the cookie banner and, for a user, is signed in. */
async function contextFor(browser: Browser, user: TestUser | null) {
  const context = await browser.newContext({
    baseURL: BASE,
    locale: "ka-GE",
    timezoneId: "Asia/Tbilisi",
  });
  await context.addCookies([
    {
      name: "mb_cookie_consent",
      value: encodeURIComponent("v2|analytics=0|location=0"),
      url: BASE,
    },
  ]);
  if (user) {
    const page = await context.newPage();
    await authenticateAsRole(user, page);
    await page.close();
  }
  return context;
}

/** A Supabase client that acts as `user`: their RLS, their grants. */
async function clientFor(user: TestUser) {
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

function uploadDocument(
  api: APIRequestContext,
  kind: string,
  file: Upload,
  replacesDocumentId?: string,
) {
  const multipart: Record<string, string | Upload> = { kind, file };
  if (replacesDocumentId) multipart.replacesDocumentId = replacesDocumentId;
  return api.post(`${BASE}/api/ownership-verifications/documents`, {
    headers: { Origin: BASE },
    multipart,
  });
}

async function uploadedId(
  api: APIRequestContext,
  kind: "identity" | "registry_extract",
  file: Upload,
): Promise<string> {
  const response = await uploadDocument(api, kind, file);
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

function submit(api: APIRequestContext, body: unknown) {
  return api.post(`${BASE}/api/ownership-verifications`, {
    headers: { Origin: BASE },
    data: body,
  });
}

function review(
  api: APIRequestContext,
  id: string,
  action: "approve" | "reject" | "revoke",
  note?: string,
) {
  return api.post(`${BASE}/api/admin/ownership-verifications`, {
    headers: { Origin: BASE },
    data: note ? { id, action, note } : { id, action },
  });
}

async function verifications(ownerId: string) {
  const { data, error } = await supabaseAdmin
    .from("ownership_verifications")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });
  expect(error).toBeNull();
  return data ?? [];
}

async function verificationFor(listingId: string) {
  const { data, error } = await supabaseAdmin
    .from("ownership_verifications")
    .select("*")
    .or(`property_id.eq.${listingId},service_id.eq.${listingId}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  expect(error).toBeNull();
  return data!;
}

async function documentRow(id: string) {
  const { data, error } = await supabaseAdmin
    .from("ownership_verification_documents")
    .select("*")
    .eq("id", id)
    .single();
  expect(error).toBeNull();
  return data!;
}

/** Whether the object is still in the bucket (service-role listing). */
async function objectExists(storagePath: string): Promise<boolean> {
  const [folder, name] = storagePath.split("/");
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .list(folder, { search: name });
  expect(error).toBeNull();
  return (data ?? []).some((object) => object.name === name);
}

async function ownerNotices(type: string) {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .select("title, dashboard_scope, action_url, is_read")
    .eq("user_id", owner.id)
    .eq("type", type);
  expect(error).toBeNull();
  return data ?? [];
}

/** The pending content change the owner filed for a listing. */
async function pendingChange(listingId: string) {
  const { data, error } = await supabaseAdmin
    .from("content_change_requests")
    .select("id, field_diff")
    .eq("target_id", listingId)
    .eq("status", "pending")
    .single();
  expect(error).toBeNull();
  return data!;
}

async function approveChange(changeId: string) {
  const response = await adminContext.request.post(
    `${BASE}/api/admin/content-change-requests/${changeId}`,
    { headers: { Origin: BASE }, data: { action: "approve" } },
  );
  expect(response.status(), await response.text()).toBe(200);
}

/** Waits until React has attached its handlers to `selector` (a click before that does nothing). */
async function waitForHydration(page: Page, selector: string) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return (
      !!el && Object.keys(el).some((name) => name.startsWith("__reactProps$"))
    );
  }, selector);
}

/** The public detail page, reloaded until the badge is (or is not) there. */
async function expectDetailBadge(page: Page, url: string, shown: boolean) {
  await expect(async () => {
    await page.goto(url);
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("[data-ownership-verified]")).toHaveCount(
      shown ? 1 : 0,
    );
  }).toPass({ timeout: 90_000, intervals: [1_000, 3_000, 5_000] });
}

const rentalUrl = () => `/apartments/${listings.rental}`;
const siblingUrl = () => `/apartments/${listings.sibling}`;

test.describe("Ownership verification", () => {
  test.describe.configure({ mode: "serial" });

  const rentalRow = (page: Page, kind: "property" | "service", id: string) =>
    page.locator(
      `[data-testid="ownership-listing"][data-listing-key="${key(kind, id)}"]`,
    );

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    const phone = () => `+99559${randomInt(1_000_000, 9_999_999)}`;
    owner = await createTestUser({
      id: randomUUID(),
      phone: phone(),
      displayName: `E2E მესაკუთრე ${TOKEN}`,
      role: "renter",
    });
    stranger = await createTestUser({
      id: randomUUID(),
      phone: phone(),
      displayName: `E2E უცხო ${TOKEN}`,
      role: "renter",
    });
    admin = await createTestUser({
      id: randomUUID(),
      phone: phone(),
      displayName: `E2E ადმინი ${TOKEN}`,
      role: "admin",
    });
    // No number, no SMS: the notification mirror skips a profile without one.
    const cleared = await supabaseAdmin
      .from("profiles")
      .update({ phone: null })
      .in("id", [owner.id, stranger.id, admin.id]);
    expect(cleared.error).toBeNull();

    const rental = {
      type: "apartment" as const,
      is_for_sale: false,
      status: "active" as const,
      area_sqm: 45,
      rooms: 2,
      bathrooms: 1,
      capacity: 4,
      price_per_night: 120,
      currency: "GEL",
      amenities: [],
      house_rules: { hosting_langs: ["ka"], smoking: false, pets: false },
      photos: ["/placeholder-property.jpg"],
      phone: "+995599000321",
      min_booking_days: 1,
    };
    const created = await supabaseAdmin.from("properties").insert([
      {
        ...rental,
        id: listings.rental,
        owner_id: owner.id,
        title: `${TOKEN} ბინა დადასტურებისთვის`,
        description: DESCRIPTION_BEFORE,
        location: LOCATION_BEFORE,
        location_lat: 41.7536,
        location_lng: 43.5322,
        cadastral_code: CADASTRAL,
      },
      {
        ...rental,
        id: listings.sibling,
        owner_id: owner.id,
        title: `${TOKEN} მეზობელი ბინა`,
        description: "E2E ბინა ნიშნის გარეშე",
        location: LOCATION_BEFORE,
      },
      {
        ...rental,
        id: listings.strangers,
        owner_id: stranger.id,
        title: `${TOKEN} უცხოს ბინა`,
        description: "E2E სხვისი ბინა",
        location: LOCATION_BEFORE,
      },
      {
        ...rental,
        id: listings.adminOwn,
        owner_id: admin.id,
        title: `${TOKEN} ადმინის ბინა`,
        description: "E2E ადმინის საკუთარი ბინა",
        location: LOCATION_BEFORE,
      },
    ]);
    expect(created.error).toBeNull();
    const restaurant = await supabaseAdmin.from("services").insert({
      id: listings.food,
      owner_id: owner.id,
      category: "food",
      title: `${TOKEN} რესტორანი`,
      description: "E2E რესტორანი",
      location: LOCATION_BEFORE,
      photos: ["/placeholder-property.jpg"],
      status: "active",
    });
    expect(restaurant.error).toBeNull();

    ownerContext = await contextFor(browser, owner);
    strangerContext = await contextFor(browser, stranger);
    adminContext = await contextFor(browser, admin);
    anonContext = await contextFor(browser, null);
  });

  test.afterAll(async () => {
    const people = [owner, stranger, admin].filter(Boolean);
    const uploaders = [owner, stranger, admin].filter(Boolean).map((u) => u.id);
    for (const id of uploaders) {
      const { data } = await supabaseAdmin.storage
        .from(BUCKET)
        .list(id, { limit: 1000 });
      if (data?.length) {
        const removed = await supabaseAdmin.storage
          .from(BUCKET)
          .remove(data.map((object) => `${id}/${object.name}`));
        if (removed.error)
          console.error("cleanup: files", removed.error.message);
      }
    }
    const steps: [
      string,
      () => PromiseLike<{ error: { message: string } | null }>,
    ][] = [
      [
        "requests",
        () =>
          supabaseAdmin
            .from("ownership_verifications")
            .delete()
            .in("owner_id", uploaders),
      ],
      [
        "documents",
        () =>
          supabaseAdmin
            .from("ownership_verification_documents")
            .delete()
            .in("owner_id", uploaders),
      ],
      [
        "changes",
        () =>
          supabaseAdmin
            .from("content_change_requests")
            .delete()
            .in("target_id", Object.values(listings)),
      ],
      [
        "properties",
        () =>
          supabaseAdmin
            .from("properties")
            .delete()
            .in("id", [
              listings.rental,
              listings.sibling,
              listings.strangers,
              listings.adminOwn,
            ]),
      ],
      [
        "services",
        () => supabaseAdmin.from("services").delete().eq("id", listings.food),
      ],
      [
        "notices",
        () =>
          supabaseAdmin
            .from("notifications")
            .delete()
            .in(
              "user_id",
              people.map((u) => u.id),
            ),
      ],
      // Every admin got (at most) one coalesced queue notice from this run.
      [
        "admin notices",
        () =>
          supabaseAdmin
            .from("notifications")
            .delete()
            .eq("type", "admin_ownership_pending")
            .gte("created_at", RUN_STARTED),
      ],
      [
        "profiles",
        () =>
          supabaseAdmin
            .from("profiles")
            .delete()
            .in(
              "id",
              people.map((u) => u.id),
            ),
      ],
    ];
    for (const [label, run] of steps) {
      const { error } = await run();
      if (error) console.error(`cleanup: ${label}`, error.message);
    }
    for (const user of people) await deleteTestUser(user.id);
    for (const context of [
      ownerContext,
      strangerContext,
      adminContext,
      anonContext,
    ]) {
      await context?.close();
    }
  });

  test("uploads are judged by their bytes, one at a time per owner", async () => {
    test.setTimeout(120_000);
    const api = ownerContext.request;

    const anonymous = await uploadDocument(
      anonContext.request,
      "identity",
      idCard(),
    );
    expect(anonymous.status()).toBe(401);

    const refused: [string, Upload, number, string][] = [
      [
        "registry_extract",
        {
          name: "empty.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.alloc(0),
        },
        400,
        "empty",
      ],
      // A text file renamed to passport.jpg: the name and the declared type are ignored.
      [
        "identity",
        {
          name: "passport.jpg",
          mimeType: "image/jpeg",
          buffer: Buffer.from("Name: Test\nID: 01001\n"),
        },
        400,
        "unsupported",
      ],
      [
        "registry_extract",
        {
          name: "page.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("<!doctype html><script>alert(1)</script>"),
        },
        400,
        "unsupported",
      ],
      // Header kept, trailer lost: a download cut short.
      [
        "registry_extract",
        {
          name: "cut.pdf",
          mimeType: "application/pdf",
          buffer: PDF.subarray(0, Math.floor(PDF.length / 2)),
        },
        400,
        "incomplete",
      ],
      ["passport", idCard(), 400, "invalid_kind"],
    ];
    for (const [kind, file, status, code] of refused) {
      const response = await uploadDocument(api, kind, file);
      expect(response.status(), `${file.name} as ${kind}`).toBe(status);
      expect(((await response.json()) as { error: string }).error).toBe(code);
    }

    // Replacing a file discards the old one, and the same request deletes it.
    const firstId = await uploadedId(
      api,
      "registry_extract",
      extract("first.pdf"),
    );
    const second = await uploadDocument(
      api,
      "registry_extract",
      extract("second.pdf"),
      firstId,
    );
    expect(second.status()).toBe(201);
    const secondBody = (await second.json()) as Record<string, unknown>;
    expect(secondBody).toMatchObject({
      kind: "registry_extract",
      contentType: "application/pdf",
      size: PDF.length,
    });
    expect(JSON.stringify(secondBody)).not.toContain(owner.id);
    const replaced = await documentRow(firstId);
    expect(replaced.discarded_at).not.toBeNull();
    expect(replaced.purged_at).not.toBeNull();
    expect(await objectExists(replaced.storage_path)).toBe(false);
    const kept = await documentRow(secondBody.id as string);
    expect(kept.purged_at).toBeNull();
    expect(kept.storage_path.startsWith(`${owner.id}/`)).toBe(true);
    expect(await objectExists(kept.storage_path)).toBe(true);

    // Two uploads at once: the second is turned away before its body is read.
    // 3 MB keeps the winner well inside the server's 9.5 s storage timeout on a
    // home uplink (a local server uploads from the developer's own network).
    const large = Buffer.alloc(3 * 1024 * 1024);
    large.set([0xff, 0xd8, 0xff, 0xe0]);
    const [a, b] = await Promise.all([
      uploadDocument(api, "identity", {
        name: "large-a.jpg",
        mimeType: "image/jpeg",
        buffer: large,
      }),
      uploadDocument(api, "identity", {
        name: "large-b.jpg",
        mimeType: "image/jpeg",
        buffer: large,
      }),
    ]);
    expect([a.status(), b.status()].sort()).toEqual([201, 429]);
    const busy = a.status() === 429 ? a : b;
    expect(((await busy.json()) as { error: string }).error).toBe(
      "upload_busy",
    );
    expect(Number(busy.headers()["retry-after"])).toBeGreaterThan(0);
  });

  test("an owner verifies a rental and a restaurant in one submission", async () => {
    test.setTimeout(150_000);
    // The rental's public page before any decision: no badge.
    const visitor = await anonContext.newPage();
    await expectDetailBadge(visitor, rentalUrl(), false);
    await visitor.close();

    const page = await ownerContext.newPage();
    await page.goto(
      `/dashboard/account/ownership?listing=${key("property", listings.rental)}`,
    );
    const rental = rentalRow(page, "property", listings.rental);
    const food = rentalRow(page, "service", listings.food);
    await expect(rental).toHaveAttribute("data-status", "none");
    await expect(food).toHaveAttribute("data-status", "none");
    await waitForHydration(page, '[data-testid="ownership-submit"]');
    // ?listing= preselected the rental; the restaurant joins the same submission.
    await expect(rental.getByRole("checkbox")).toBeChecked();
    await food.getByRole("checkbox").check();

    await page.getByTestId("ownership-identity-input").setInputFiles(idCard());
    await page
      .locator(
        `[data-testid="ownership-extract-input"][data-listing-key="${key("property", listings.rental)}"]`,
      )
      .setInputFiles(extract("extract-rental.pdf"));
    await page
      .locator(
        `[data-testid="ownership-extract-input"][data-listing-key="${key("service", listings.food)}"]`,
      )
      .setInputFiles(extract("extract-restaurant.pdf"));
    await expect(
      page.locator('[data-testid="ownership-slot"][data-state="uploaded"]'),
    ).toHaveCount(3, { timeout: 90_000 });

    await page.getByTestId("ownership-submit").click();
    await expect(page.getByText(SUBMITTED).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(rental).toHaveAttribute("data-status", "pending");
    await expect(food).toHaveAttribute("data-status", "pending");

    const rows = await verifications(owner.id);
    expect(rows.map((row) => row.status)).toEqual(["pending", "pending"]);
    expect(new Set(rows.map((row) => row.submission_id)).size).toBe(1);
    expect(new Set(rows.map((row) => row.identity_document_id)).size).toBe(1);
    expect(
      new Set(rows.map((row) => row.registry_extract_document_id)).size,
    ).toBe(2);
    expect(
      rows.find((row) => row.property_id === listings.rental),
    ).toBeTruthy();
    expect(rows.find((row) => row.service_id === listings.food)).toBeTruthy();

    // One coalesced queue notice for the admin, pointing at the ownership tab.
    const { data: queue } = await supabaseAdmin
      .from("notifications")
      .select("action_url")
      .eq("user_id", admin.id)
      .eq("type", "admin_ownership_pending");
    expect(queue).toEqual([
      { action_url: "/dashboard/admin/verifications?tab=ownership" },
    ]);
  });

  test("nobody else can use the owner's listings or documents", async () => {
    const [identity] = (await verifications(owner.id)).map(
      (row) => row.identity_document_id,
    );
    const strangerApi = strangerContext.request;
    const strangerId = await uploadedId(strangerApi, "identity", idCard());
    const strangerExtract = await uploadedId(
      strangerApi,
      "registry_extract",
      extract(),
    );

    // Someone else's listing answers exactly like a missing one.
    const notTheirs = await submit(strangerApi, {
      identityDocumentId: strangerId,
      items: [
        { kind: "property", id: listings.sibling, documentId: strangerExtract },
      ],
    });
    expect(notTheirs.status()).toBe(404);
    expect(((await notTheirs.json()) as { error: string }).error).toBe(
      "listing_not_found",
    );

    // Someone else's ID card cannot back the stranger's own listing.
    const borrowed = await submit(strangerApi, {
      identityDocumentId: identity,
      items: [
        {
          kind: "property",
          id: listings.strangers,
          documentId: strangerExtract,
        },
      ],
    });
    expect(borrowed.status()).toBe(400);
    expect(((await borrowed.json()) as { error: string }).error).toBe(
      "document_invalid",
    );

    // A listing with a live request cannot be sent again.
    const again = await submit(ownerContext.request, {
      identityDocumentId: identity,
      items: [
        {
          kind: "property",
          id: listings.rental,
          documentId: await uploadedId(
            ownerContext.request,
            "registry_extract",
            extract("again.pdf"),
          ),
        },
      ],
    });
    expect(again.status()).toBe(409);
    expect(((await again.json()) as { error: string }).error).toBe(
      "request_exists",
    );

    // Malformed bodies never reach the database.
    const malformed = await submit(ownerContext.request, {
      identityDocumentId: "x",
      items: [],
    });
    expect(malformed.status()).toBe(400);
    expect((await verifications(stranger.id)).length).toBe(0);
  });

  test("only an admin opens the documents, inline and uncached", async () => {
    const list = await adminContext.request.get(
      `${BASE}/api/admin/ownership-verifications?status=pending`,
    );
    expect(list.status()).toBe(200);
    const { items } = (await list.json()) as {
      items: {
        id: string;
        owner: { id: string; displayName: string | null } | null;
        listing: { id: string; kind: string; cadastralCode: string | null };
        documents: Record<
          "identity" | "extract",
          { id: string; available: boolean; contentType: string }
        >;
      }[];
    };
    const mine = items.filter((item) => item.owner?.id === owner.id);
    expect(mine.map((item) => item.listing.id).sort()).toEqual(
      [listings.rental, listings.food].sort(),
    );
    const rentalItem = mine.find(
      (item) => item.listing.id === listings.rental,
    )!;
    expect(rentalItem.listing.cadastralCode).toBe(CADASTRAL);
    expect(rentalItem.documents.identity).toMatchObject({
      available: true,
      contentType: "image/jpeg",
    });
    expect(rentalItem.documents.extract).toMatchObject({
      available: true,
      contentType: "application/pdf",
    });

    const documentUrl = `${BASE}/api/admin/ownership-verifications/documents/${rentalItem.documents.identity.id}`;
    const redirect = await adminContext.request.get(documentUrl, {
      maxRedirects: 0,
    });
    expect(redirect.status()).toBe(302);
    expect(redirect.headers()["cache-control"]).toContain("no-store");
    // The route asks for no-referrer, but the middleware's app-wide
    // strict-origin-when-cross-origin wins on /api today. Either way no path
    // (the document id) is sent to the storage host.
    expect([
      "no-referrer",
      "same-origin",
      "strict-origin",
      "strict-origin-when-cross-origin",
    ]).toContain(redirect.headers()["referrer-policy"]);
    const signedUrl = redirect.headers()["location"];
    expect(signedUrl).toContain(`/storage/v1/object/sign/${BUCKET}/`);
    expect(signedUrl).not.toContain("download");
    const plain = await playwrightRequest.newContext();
    const file = await plain.get(signedUrl);
    expect(file.status()).toBe(200);
    expect(file.headers()["content-type"]).toContain("image/jpeg");
    expect(file.headers()["content-disposition"] ?? "").not.toMatch(
      /attachment/i,
    );

    for (const [context, status] of [
      [ownerContext, 403],
      [strangerContext, 403],
      [anonContext, 401],
    ] as const) {
      const denied = await context.request.get(documentUrl, {
        maxRedirects: 0,
      });
      expect(denied.status()).toBe(status);
      const queue = await context.request.get(
        `${BASE}/api/admin/ownership-verifications?status=pending`,
      );
      expect(queue.status()).toBe(status);
    }

    // The bucket has no policy at all: the owner's own session can neither
    // read, list nor write it, and there is no public URL.
    const identity = await documentRow(rentalItem.documents.identity.id);
    const asOwner = await clientFor(owner);
    const download = await asOwner.storage
      .from(BUCKET)
      .download(identity.storage_path);
    expect(download.error).not.toBeNull();
    const listed = await asOwner.storage.from(BUCKET).list(owner.id);
    expect(listed.data ?? []).toEqual([]);
    const written = await asOwner.storage
      .from(BUCKET)
      .upload(`${owner.id}/${randomUUID()}.pdf`, PDF, {
        contentType: "application/pdf",
      });
    expect(written.error).not.toBeNull();
    const publicCopy = await plain.get(
      `${env.supabaseUrl}/storage/v1/object/public/${BUCKET}/${identity.storage_path}`,
    );
    expect(publicCopy.ok()).toBe(false);
    await plain.dispose();
  });

  test("the admin approves the rental and rejects the restaurant", async () => {
    test.setTimeout(120_000);
    const rentalRequest = await verificationFor(listings.rental);
    const foodRequest = await verificationFor(listings.food);
    const identityId = rentalRequest.identity_document_id;

    const page = await adminContext.newPage();
    await page.goto("/dashboard/admin/verifications?tab=ownership");
    const rentalItem = page.locator(
      `[data-ownership-request="${rentalRequest.id}"]`,
    );
    const foodItem = page.locator(
      `[data-ownership-request="${foodRequest.id}"]`,
    );
    await expect(rentalItem).toBeVisible({ timeout: 30_000 });
    await expect(rentalItem.getByText(CADASTRAL)).toBeVisible();
    await waitForHydration(
      page,
      `[data-ownership-request="${rentalRequest.id}"] button`,
    );

    await rentalItem
      .getByRole("button", { name: "დადასტურება", exact: true })
      .click();
    await expect(rentalItem).toHaveCount(0, { timeout: 30_000 });
    expect((await verificationFor(listings.rental)).status).toBe("approved");
    // The rental's extract is deleted at once; the ID stays while the
    // restaurant still needs it.
    const rentalExtract = await documentRow(
      rentalRequest.registry_extract_document_id,
    );
    expect(rentalExtract.purged_at).not.toBeNull();
    expect(await objectExists(rentalExtract.storage_path)).toBe(false);
    const identityWhilePending = await documentRow(identityId);
    expect(identityWhilePending.purged_at).toBeNull();
    expect(await objectExists(identityWhilePending.storage_path)).toBe(true);

    await foodItem
      .getByRole("button", { name: "უარყოფა", exact: true })
      .click();
    await foodItem.getByLabel("უარყოფის მიზეზი").fill(REJECT_REASON);
    await foodItem
      .getByRole("button", { name: "უარყოფა", exact: true })
      .click();
    await expect(foodItem).toHaveCount(0, { timeout: 30_000 });
    const rejected = await verificationFor(listings.food);
    expect(rejected).toMatchObject({
      status: "rejected",
      decision_note: REJECT_REASON,
      reviewed_by: admin.id,
    });
    for (const id of [identityId, foodRequest.registry_extract_document_id]) {
      const row = await documentRow(id);
      expect(row.purged_at, id).not.toBeNull();
      expect(await objectExists(row.storage_path)).toBe(false);
    }

    // Deciding twice is harmless; deciding a decided request is refused.
    const again = await review(
      adminContext.request,
      rentalRequest.id,
      "approve",
    );
    expect(await again.json()).toEqual({
      status: "approved",
      idempotent: true,
    });
    const flip = await review(adminContext.request, foodRequest.id, "approve");
    expect(flip.status()).toBe(409);
    expect(((await flip.json()) as { error: string }).error).toBe(
      "already_decided",
    );
    const noReason = await review(
      adminContext.request,
      rentalRequest.id,
      "revoke",
    );
    expect(noReason.status()).toBe(400);
    expect(((await noReason.json()) as { error: string }).error).toBe(
      "note_required",
    );

    // One notice per cabinet, with a title that names nothing private.
    const notices = await ownerNotices("verification");
    expect(
      notices.map((n) => [n.dashboard_scope, n.title, n.action_url]).sort(),
    ).toEqual([
      ["food", DECIDED_TITLE, "/dashboard/account/ownership"],
      ["renter", DECIDED_TITLE, "/dashboard/account/ownership"],
    ]);
  });

  test("the owner sees both outcomes, with the reason", async () => {
    const page = await ownerContext.newPage();
    await page.goto("/dashboard/account/ownership");
    const rental = rentalRow(page, "property", listings.rental);
    const food = rentalRow(page, "service", listings.food);
    await expect(rental).toHaveAttribute("data-status", "approved");
    await expect(rental).toContainText("მესაკუთრეობა: დადასტურებულია");
    await expect(rental.getByRole("checkbox")).toHaveCount(0);
    await expect(food).toHaveAttribute("data-status", "rejected");
    await expect(food).toContainText(`მიზეზი: ${REJECT_REASON}`);
    // A rejected listing can be sent again.
    await expect(food.getByRole("checkbox")).toHaveCount(1);

    // The renter cabinet shows each rental's state, with a way in for the other.
    await page.goto("/dashboard/renter");
    const chips = page.getByTestId("ownership-status-chip");
    await expect(
      chips.and(page.locator('[data-status="approved"]')),
    ).toHaveCount(1, { timeout: 30_000 });
    await expect(
      page
        .locator(
          `a[href*="listing=${encodeURIComponent(key("property", listings.sibling))}"], a[href*="listing=${key("property", listings.sibling)}"]`,
        )
        .first(),
    ).toBeVisible();
  });

  test("the badge marks the approved rental, and only it", async () => {
    test.setTimeout(150_000);
    const page = await anonContext.newPage();
    await expectDetailBadge(page, rentalUrl(), true);
    const badge = page.locator("[data-ownership-verified]");
    await expect(badge).toContainText(BADGE_FULL);
    await badge.locator("summary").click();
    await expect(page.getByText(BADGE_EXPLANATION)).toBeVisible();

    await expectDetailBadge(page, siblingUrl(), false);
    await expectDetailBadge(page, `/food/${listings.food}`, false);

    const card = (id: string) =>
      page.locator(`a[data-listing-card][href*="${id}"]`);
    await page.goto(`/search?location=${TOKEN}`);
    await expect(card(listings.rental)).toHaveCount(1);
    await expect(card(listings.sibling)).toHaveCount(1);
    await expect(
      card(listings.rental).locator("[data-ownership-verified]"),
    ).toHaveCount(1);
    await expect(
      card(listings.sibling).locator("[data-ownership-verified]"),
    ).toHaveCount(0);

    // "Verified owners only" now means this badge, not the profile tick
    // (every account in this file has a verified profile).
    await page.goto(`/search?location=${TOKEN}&verified_only=1`);
    await expect(card(listings.rental)).toHaveCount(1);
    await expect(card(listings.sibling)).toHaveCount(0);

    // A badge never makes its card taller than an unbadged neighbour.
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/search?location=${TOKEN}`);
      await expect(card(listings.sibling)).toBeVisible();
      const [badged, plain] = await Promise.all(
        [listings.rental, listings.sibling].map(
          async (id) => (await card(id).boundingBox())!.height,
        ),
      );
      expect(
        Math.abs(badged - plain),
        `card heights at ${width}px`,
      ).toBeLessThanOrEqual(1);
      const badgeBox = await card(listings.rental)
        .locator("[data-ownership-verified]")
        .boundingBox();
      const cardBox = await card(listings.rental).boundingBox();
      expect(
        badgeBox!.x + badgeBox!.width,
        `badge inside the card at ${width}px`,
      ).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);
    }
  });

  test("a description edit keeps the badge; an address edit takes it away", async () => {
    test.setTimeout(180_000);
    // Through the real edit form: it re-sends every field, so this proves
    // that nothing it re-sends (coordinates, cadastral code) counts as a change.
    const page = await ownerContext.newPage();
    await page.goto(`/create/rental?edit=${listings.rental}`);
    const description = page.getByPlaceholder("დეტალური აღწერა...");
    await expect(description).toHaveValue(DESCRIPTION_BEFORE, {
      timeout: 30_000,
    });
    await description.fill(DESCRIPTION_AFTER);
    const next = page.getByRole("button", { name: "გაგრძელება" });
    for (let step = 0; step < 4; step++) {
      await next.click();
      await expect(page.locator("h1, h2").first()).toBeVisible();
    }
    await page.getByRole("button", { name: "განხილვაზე გაგზავნა" }).click();
    await page.waitForURL(/\/dashboard\/renter/, { timeout: 30_000 });
    const descriptionChange = await pendingChange(listings.rental);
    expect(Object.keys(descriptionChange.field_diff as object)).toEqual([
      "description",
    ]);
    await approveChange(descriptionChange.id);

    const kept = await verificationFor(listings.rental);
    expect(kept.status).toBe("approved");
    const visitor = await anonContext.newPage();
    await expect(async () => {
      await visitor.goto(rentalUrl());
      await expect(visitor.getByText(DESCRIPTION_AFTER).first()).toBeVisible();
      await expect(visitor.locator("[data-ownership-verified]")).toHaveCount(1);
    }).toPass({ timeout: 90_000, intervals: [1_000, 3_000, 5_000] });

    // A new address goes through the same review queue and closes the approval.
    const addressChange = await ownerContext.request.post(
      `${BASE}/api/content-change-requests`,
      {
        headers: { Origin: BASE },
        data: {
          targetType: "property",
          targetId: listings.rental,
          proposedValues: { location: LOCATION_AFTER },
        },
      },
    );
    expect(addressChange.status(), await addressChange.text()).toBe(201);
    await approveChange((await pendingChange(listings.rental)).id);

    const closed = await verificationFor(listings.rental);
    expect(closed).toMatchObject({
      status: "revoked",
      decision_note: DATA_CHANGED,
      reviewed_by: null,
    });
    expect(
      (await ownerNotices("verification")).filter(
        (n) => n.title === CLOSED_TITLE,
      ),
    ).toEqual([
      expect.objectContaining({
        dashboard_scope: "renter",
        action_url: "/dashboard/account/ownership",
      }),
    ]);
    await expectDetailBadge(visitor, rentalUrl(), false);

    // The owner is offered the verification again.
    await page.goto("/dashboard/account/ownership");
    const rental = rentalRow(page, "property", listings.rental);
    await expect(rental).toHaveAttribute("data-status", "revoked");
    await expect(rental).toContainText(`მიზეზი: ${DATA_CHANGED}`);
    await expect(rental.getByRole("checkbox")).toHaveCount(1);
  });

  test("an admin revoke takes the badge away", async () => {
    test.setTimeout(150_000);
    const api = ownerContext.request;
    const submitted = await submit(api, {
      identityDocumentId: await uploadedId(api, "identity", idCard()),
      items: [
        {
          kind: "property",
          id: listings.sibling,
          documentId: await uploadedId(
            api,
            "registry_extract",
            extract("sibling.pdf"),
          ),
        },
      ],
    });
    expect(submitted.status(), await submitted.text()).toBe(201);
    expect(await submitted.json()).toMatchObject({ count: 1 });
    const request = await verificationFor(listings.sibling);
    const approved = await review(adminContext.request, request.id, "approve");
    expect(await approved.json()).toEqual({
      status: "approved",
      idempotent: false,
    });

    const visitor = await anonContext.newPage();
    await expectDetailBadge(visitor, siblingUrl(), true);

    const page = await adminContext.newPage();
    await page.goto("/dashboard/admin/verifications?tab=ownership");
    await page
      .getByRole("button", { name: "დადასტურებული", exact: true })
      .click();
    const item = page.locator(`[data-ownership-request="${request.id}"]`);
    await expect(item).toBeVisible({ timeout: 30_000 });
    await item.getByRole("button", { name: "გაუქმება", exact: true }).click();
    await item.getByLabel("გაუქმების მიზეზი").fill(REVOKE_REASON);
    await item.getByRole("button", { name: "გაუქმება", exact: true }).click();
    await expect(item).toHaveCount(0, { timeout: 30_000 });

    expect(await verificationFor(listings.sibling)).toMatchObject({
      status: "revoked",
      decision_note: REVOKE_REASON,
      reviewed_by: admin.id,
    });
    await expectDetailBadge(visitor, siblingUrl(), false);
  });

  test("the purge route deletes abandoned uploads and answers only the cron", async () => {
    test.skip(!PURGE_SECRET, "set E2E_OWNERSHIP_PURGE_SECRET to run this test");
    const abandoned = await uploadedId(
      ownerContext.request,
      "registry_extract",
      extract("abandoned.pdf"),
    );
    // Unsubmitted for more than a day.
    const backdated = await supabaseAdmin
      .from("ownership_verification_documents")
      .update({
        created_at: new Date(Date.now() - 25 * 3_600_000).toISOString(),
      })
      .eq("id", abandoned);
    expect(backdated.error).toBeNull();

    // No Origin header and no cookie: the route is exempt from the Origin
    // check by exact path, and its own bearer check is what answers.
    const cron = await playwrightRequest.newContext();
    const url = `${BASE}/api/ownership-verifications/purge`;
    expect((await cron.post(url)).status()).toBe(401);
    expect(
      (
        await cron.post(url, {
          headers: { Authorization: "Bearer not-the-secret" },
        })
      ).status(),
    ).toBe(401);
    const run = await cron.post(url, {
      headers: { Authorization: `Bearer ${PURGE_SECRET}` },
    });
    expect(run.status(), await run.text()).toBe(200);
    expect(
      ((await run.json()) as { purged: number }).purged,
    ).toBeGreaterThanOrEqual(1);
    await cron.dispose();

    const row = await documentRow(abandoned);
    expect(row.purged_at).not.toBeNull();
    expect(await objectExists(row.storage_path)).toBe(false);
  });

  // Last, so the admin's own pending request never shows in the queue the
  // panel tests above count on.
  test("an admin cannot decide on a request for their own listing", async () => {
    const api = adminContext.request;
    const identityId = await uploadedId(api, "identity", idCard());
    const extractId = await uploadedId(api, "registry_extract", extract());
    const submitted = await submit(api, {
      identityDocumentId: identityId,
      items: [
        { kind: "property", id: listings.adminOwn, documentId: extractId },
      ],
    });
    expect(submitted.status(), await submitted.text()).toBe(201);
    const request = await verificationFor(listings.adminOwn);
    expect(request.status).toBe("pending");

    for (const [action, note] of [
      ["approve", undefined],
      ["reject", "E2E: საკუთარი მოთხოვნა"],
    ] as const) {
      const response = await review(api, request.id, action, note);
      expect(response.status(), await response.text()).toBe(403);
      expect(await response.json()).toEqual({ error: "self_review" });
    }
    const after = await verificationFor(listings.adminOwn);
    expect(after.status).toBe("pending");
    expect(after.reviewed_by).toBeNull();
  });
});

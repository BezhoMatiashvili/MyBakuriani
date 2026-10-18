import { randomInt, randomUUID } from "node:crypto";
import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
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
// Admin "Verified Users" and payer groups (C52), end to end: the admin API
// (list, picker search, group create / edit / delete, the shared verify toggle),
// who may call it, what lands in the database and the audit trail, and a light
// smoke of the page.
//
// Everything here is this file's own: one admin, a guest who is no admin, two
// payers, two members and one account the toggle works on (fresh accounts; their
// phone numbers are cleared, so no SMS can go out, and their
// @e2e.mybakuriani.test addresses are never e-mailed). It needs no shared seed:
// run it with --project=cross-role --no-deps --workers=1 against a local
// production build. Needs TEST_SUPABASE_URL / TEST_SUPABASE_ANON_KEY /
// TEST_SUPABASE_SERVICE_ROLE_KEY and an EXPLICIT E2E_BASE_URL of the form
// http://localhost:<port>: the cookie helper pins the session cookie to the
// localhost domain, the port must be in that server's ALLOWED_ORIGINS (every
// cookie-authenticated write below sends its Origin by hand), and the default
// :3000 belongs to another project, so the suite skips without the variable.
// Every row it makes is removed in afterAll, also when a test fails.
// ---------------------------------------------------------------------------

test.use({ timezoneId: "Asia/Tbilisi", locale: "ka-GE" });

const env = configureIsolatedE2E();
const BASE = env.baseUrl;
const ORIGIN = new URL(BASE).origin;
// One word in every group name and every account name of this run: cleanup (and a
// failed run's leftovers) are found by it, and the lists below are asked for it.
// Letters only on purpose: a search term with four or more digits also matches
// phone numbers (the list and the picker add a phone clause for it), and a digit
// run from a random token could meet an unrelated account's number.
const TOKEN = `E2EVU${Array.from({ length: 10 }, () =>
  String.fromCharCode(97 + randomInt(26)),
).join("")}`;
const GROUP_NAME = `${TOKEN} ოჯახი`;

const LIST = "/api/admin/verified-users";
const SEARCH = `${LIST}/search`;
const GROUPS = `${LIST}/groups`;
const toggle = (id: string) => `/api/admin/clients/${id}/verified`;

type Body = Record<string, unknown>;
type Chip = { group_id: string; group_name: string; role: string };
type VerifiedRow = { id: string; verified_at: string | null; groups: Chip[] };
type Person = { id: string; is_verified: boolean };
type GroupJson = {
  id: string;
  name: string;
  payer: Person | null;
  members: Person[];
};

let admin: TestUser;
let stranger: TestUser;
let payer1: TestUser; // verified
let payer2: TestUser; // not verified
let member1: TestUser; // not verified
let member2: TestUser; // verified
let subject: TestUser; // not verified; the toggle works on this one
let adminContext: BrowserContext;
let strangerContext: BrowserContext;
const names = new Map<string, string>();
let groupId = "";

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

/**
 * One API call. Playwright's APIRequestContext sends NO Origin, and the
 * middleware answers 403 invalid_origin to a write without an allowed one (also
 * to an anonymous write, before the route can say 401), so every call sends it.
 */
async function call(
  api: APIRequestContext,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  data?: unknown,
) {
  const response = await api.fetch(`${BASE}${path}`, {
    method,
    headers: { origin: ORIGIN },
    data,
  });
  const text = await response.text();
  let body: Body = {};
  try {
    body = JSON.parse(text) as Body;
  } catch {
    // not JSON: the status and the text still say what happened
  }
  return { status: response.status(), body, text };
}

const groupBody = (over: Body = {}) => ({
  name: GROUP_NAME,
  note: "E2E",
  payerId: payer1.id,
  memberIds: [member1.id, member2.id],
  ...over,
});

/** "payer:<id>" / "member:<id>" for every member row of a group, sorted. */
async function memberRows(id: string) {
  const { data, error } = await supabaseAdmin
    .from("user_group_members")
    .select("user_id, role")
    .eq("group_id", id);
  expect(error).toBeNull();
  return (data ?? []).map((row) => `${row.role}:${row.user_id}`).sort();
}
const rowsOf = (payer: TestUser, members: TestUser[]) =>
  [`payer:${payer.id}`, ...members.map((m) => `member:${m.id}`)].sort();

async function profileState(id: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("is_verified, verified_at")
    .eq("id", id)
    .single();
  expect(error).toBeNull();
  return data!;
}

/** The DELETE rows of the audit trail for one group and for its member rows. */
async function deleteTrail(id: string) {
  const [group, members] = await Promise.all([
    supabaseAdmin
      .from("audit_logs")
      .select("actor_id, actor_source")
      .eq("table_name", "user_groups")
      .eq("operation", "DELETE")
      .eq("record_id", id),
    supabaseAdmin
      .from("audit_logs")
      .select("actor_id, actor_source")
      .eq("table_name", "user_group_members")
      .eq("operation", "DELETE")
      .eq("old_values->>group_id", id),
  ]);
  expect(group.error).toBeNull();
  expect(members.error).toBeNull();
  return { group: group.data ?? [], members: members.data ?? [] };
}

async function groupsNamed() {
  const { count, error } = await supabaseAdmin
    .from("user_groups")
    .select("id", { count: "exact", head: true })
    .ilike("name", `%${TOKEN}%`);
  expect(error).toBeNull();
  return count ?? 0;
}

test.describe("Admin verified users and payer groups (C52)", () => {
  test.skip(
    !process.env.E2E_BASE_URL,
    "needs an explicit E2E_BASE_URL (http://localhost:<port> of a local production build); the default :3000 is another project",
  );
  test.skip(
    new URL(BASE).hostname !== "localhost",
    "the cookie helper pins the session cookie to the localhost domain",
  );
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    const phone = () => `+99559${randomInt(1_000_000, 9_999_999)}`;
    const make = async (
      role: "admin" | "renter" | "guest",
      label: string,
    ): Promise<TestUser> => {
      const displayName = `E2E ${label} ${TOKEN}`;
      const user = await createTestUser({
        id: randomUUID(),
        phone: phone(),
        displayName,
        role,
      });
      names.set(user.id, displayName);
      return user;
    };
    admin = await make("admin", "ადმინი");
    stranger = await make("guest", "უცხო");
    payer1 = await make("renter", "გადამხდელი 1");
    payer2 = await make("renter", "გადამხდელი 2");
    member1 = await make("guest", "წევრი 1");
    member2 = await make("guest", "წევრი 2");
    subject = await make("guest", "სუბიექტი");

    const everyone = [
      admin,
      stranger,
      payer1,
      payer2,
      member1,
      member2,
      subject,
    ];
    // No number, no SMS: the notification mirror skips a profile without one.
    const cleared = await supabaseAdmin
      .from("profiles")
      .update({ phone: null })
      .in(
        "id",
        everyone.map((u) => u.id),
      );
    expect(cleared.error).toBeNull();
    // createTestUser verifies EVERYONE (with no date). These tests need a mix:
    // payer1 and member2 verified, the rest not, and no date anywhere.
    for (const user of everyone) {
      const verified = user === payer1 || user === member2;
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ is_verified: verified, verified_at: null })
        .eq("id", user.id);
      expect(error).toBeNull();
    }
    adminContext = await contextFor(browser, admin);
    strangerContext = await contextFor(browser, stranger);
  });

  test.afterAll(async () => {
    const people = [
      admin,
      stranger,
      payer1,
      payer2,
      member1,
      member2,
      subject,
    ].filter(Boolean);
    const ids = people.map((u) => u.id);
    // Groups first (their members cascade), then what the accounts own, then the
    // profiles (by hand, as the other specs do), then the auth users. A partial
    // beforeAll leaves fewer accounts: all of it tolerates that.
    const steps: [
      string,
      () => PromiseLike<{ error: { message: string } | null }>,
    ][] = [
      [
        "groups",
        () =>
          supabaseAdmin
            .from("user_groups")
            .delete()
            .ilike("name", `%${TOKEN}%`),
      ],
    ];
    if (ids.length) {
      steps.push(
        [
          "members",
          () =>
            supabaseAdmin
              .from("user_group_members")
              .delete()
              .in("user_id", ids),
        ],
        [
          "groups of the admin",
          () =>
            supabaseAdmin
              .from("user_groups")
              .delete()
              .eq("created_by", admin.id),
        ],
        [
          "balances",
          () => supabaseAdmin.from("balances").delete().in("user_id", ids),
        ],
        [
          "profiles",
          () => supabaseAdmin.from("profiles").delete().in("id", ids),
        ],
      );
    }
    for (const [label, run] of steps) {
      const { error } = await run();
      if (error) console.error(`cleanup: ${label}`, error.message);
    }
    for (const user of people) await deleteTestUser(user.id);
    await adminContext?.close();
    await strangerContext?.close();
  });

  test("every route refuses a non-admin (403) and an anonymous caller (401), and writes nothing", async () => {
    const someGroup = randomUUID();
    const calls: {
      method: "GET" | "POST" | "PATCH" | "DELETE";
      path: string;
      data?: unknown;
    }[] = [
      { method: "GET", path: LIST },
      { method: "GET", path: `${SEARCH}?q=${TOKEN}` },
      { method: "GET", path: GROUPS },
      { method: "POST", path: GROUPS, data: groupBody() },
      { method: "PATCH", path: `${GROUPS}/${someGroup}`, data: groupBody() },
      { method: "DELETE", path: `${GROUPS}/${someGroup}` },
      { method: "POST", path: toggle(subject.id), data: { is_verified: true } },
    ];
    for (const { method, path, data } of calls) {
      const refused = await call(strangerContext.request, method, path, data);
      expect([method, path, refused.status, refused.body.error]).toEqual([
        method,
        path,
        403,
        "forbidden",
      ]);
    }
    const anonymous = await playwrightRequest.newContext({ baseURL: BASE });
    try {
      for (const { method, path, data } of calls) {
        const refused = await call(anonymous, method, path, data);
        expect([method, path, refused.status, refused.body.error]).toEqual([
          method,
          path,
          401,
          "unauthenticated",
        ]);
      }
    } finally {
      await anonymous.dispose();
    }
    expect(await groupsNamed()).toBe(0);
    expect(await profileState(subject.id)).toEqual({
      is_verified: false,
      verified_at: null,
    });
  });

  test("a bad body gets its documented 400, an unknown group a 404, and nothing is written", async () => {
    const admins = adminContext.request;
    const cases: [string, unknown, string][] = [
      ["a blank name", groupBody({ name: "   " }), "name_required"],
      [
        "a name over 120 characters",
        groupBody({ name: `${TOKEN}${"x".repeat(121)}` }),
        "name_too_long",
      ],
      [
        "a note over 1000 characters",
        groupBody({ note: "y".repeat(1001) }),
        "note_too_long",
      ],
      ["no payer", groupBody({ payerId: undefined }), "payer_required"],
      [
        "a payer that is no uuid",
        groupBody({ payerId: "nope" }),
        "payer_required",
      ],
      [
        "a member that is no uuid",
        groupBody({ memberIds: ["nope"] }),
        "invalid_input",
      ],
      [
        "the payer among the members",
        groupBody({ memberIds: [payer1.id, member1.id] }),
        "payer_in_members",
      ],
      ["no members", groupBody({ memberIds: [] }), "members_required"],
      [
        "101 members",
        groupBody({
          memberIds: Array.from({ length: 101 }, () => randomUUID()),
        }),
        "too_many_members",
      ],
      ["a body that is no object", [], "invalid_input"],
      [
        "an unknown payer and member",
        groupBody({ payerId: randomUUID(), memberIds: [randomUUID()] }),
        "unknown_user",
      ],
      [
        "a real payer with one unknown member",
        groupBody({ memberIds: [member1.id, randomUUID()] }),
        "unknown_user",
      ],
    ];
    for (const [label, data, code] of cases) {
      const reply = await call(admins, "POST", GROUPS, data);
      expect([label, reply.status, reply.body.error]).toEqual([
        label,
        400,
        code,
      ]);
    }
    // The same parser stands in front of an edit.
    const edit = await call(
      admins,
      "PATCH",
      `${GROUPS}/${randomUUID()}`,
      groupBody({ memberIds: [payer1.id] }),
    );
    expect([edit.status, edit.body.error]).toEqual([400, "payer_in_members"]);
    // A real body for a group nobody made: the RPC checks the people first, so the
    // fixtures below are real accounts, and the answer is not_found.
    const missing = await call(
      admins,
      "PATCH",
      `${GROUPS}/${randomUUID()}`,
      groupBody(),
    );
    expect([missing.status, missing.body.error]).toEqual([404, "not_found"]);
    const badEdit = await call(
      admins,
      "PATCH",
      `${GROUPS}/not-a-uuid`,
      groupBody(),
    );
    expect([badEdit.status, badEdit.body.error]).toEqual([400, "invalid_id"]);
    const badDelete = await call(admins, "DELETE", `${GROUPS}/not-a-uuid`);
    expect([badDelete.status, badDelete.body.error]).toEqual([
      400,
      "invalid_id",
    ]);
    const noDelete = await call(admins, "DELETE", `${GROUPS}/${randomUUID()}`);
    expect([noDelete.status, noDelete.body.error]).toEqual([404, "not_found"]);

    expect(await groupsNamed()).toBe(0);
    const { count, error } = await supabaseAdmin
      .from("user_groups")
      .select("id", { count: "exact", head: true })
      .eq("created_by", admin.id);
    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  test("the admin links one payer to two members: 201, the payer is a member row, and the audit trail names the admin", async () => {
    const created = await call(
      adminContext.request,
      "POST",
      GROUPS,
      groupBody(),
    );
    expect(created.status, created.text).toBe(201);
    groupId = created.body.id as string;
    expect(groupId).toMatch(/^[0-9a-f-]{36}$/);

    expect(await memberRows(groupId)).toEqual(
      rowsOf(payer1, [member1, member2]),
    );
    const { data: group } = await supabaseAdmin
      .from("user_groups")
      .select("name, note, created_by")
      .eq("id", groupId)
      .single();
    expect(group).toEqual({
      name: GROUP_NAME,
      note: "E2E",
      created_by: admin.id,
    });

    // The list returns the payer apart and everybody else as members.
    const list = await call(adminContext.request, "GET", GROUPS);
    expect(list.status, list.text).toBe(200);
    const row = (list.body.groups as GroupJson[]).find((g) => g.id === groupId);
    expect(row?.payer?.id).toBe(payer1.id);
    expect(row?.members.map((m) => m.id).sort()).toEqual(
      [member1.id, member2.id].sort(),
    );

    // One INSERT of the group and one per member row (the payer's included), all
    // written under the admin (x-actor-id), none by "system".
    const { data: groupAudit } = await supabaseAdmin
      .from("audit_logs")
      .select("actor_id, actor_source, operation")
      .eq("table_name", "user_groups")
      .eq("record_id", groupId);
    expect(groupAudit).toEqual([
      { actor_id: admin.id, actor_source: "admin", operation: "INSERT" },
    ]);
    const { data: memberAudit } = await supabaseAdmin
      .from("audit_logs")
      .select("actor_id, actor_source, subject_user_id")
      .eq("table_name", "user_group_members")
      .eq("operation", "INSERT")
      .eq("new_values->>group_id", groupId);
    expect((memberAudit ?? []).map((r) => r.subject_user_id).sort()).toEqual(
      [payer1.id, member1.id, member2.id].sort(),
    );
    expect(
      (memberAudit ?? []).every(
        (r) => r.actor_id === admin.id && r.actor_source === "admin",
      ),
    ).toBe(true);
  });

  test("the verified list shows a verified account with its group chip, never an unverified one; the picker finds any account", async () => {
    const api = adminContext.request;
    const verified = await call(api, "GET", `${LIST}?q=${TOKEN}`);
    expect(verified.status, verified.text).toBe(200);
    const rows = verified.body.rows as VerifiedRow[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect([...byId.keys()].sort()).toEqual([payer1.id, member2.id].sort());
    expect(verified.body.count).toBe(2);
    expect(verified.body.total as number).toBeGreaterThanOrEqual(2);
    expect(byId.get(payer1.id)?.groups).toEqual([
      { group_id: groupId, group_name: GROUP_NAME, role: "payer" },
    ]);
    expect(byId.get(member2.id)?.groups).toEqual([
      { group_id: groupId, group_name: GROUP_NAME, role: "member" },
    ]);
    // Nobody here has a verification date (the fixtures were set up with none).
    expect(rows.every((r) => r.verified_at === null)).toBe(true);

    // The picker searches every profile, verified or not: by name, by id, and
    // not at all below two characters.
    const search = async (q: string) => {
      const reply = await call(
        api,
        "GET",
        `${SEARCH}?q=${encodeURIComponent(q)}`,
      );
      expect(reply.status, reply.text).toBe(200);
      return reply.body.results as { id: string; is_verified: boolean }[];
    };
    const byName = await search(names.get(member1.id)!);
    expect(byName.find((p) => p.id === member1.id)?.is_verified).toBe(false);
    const byToken = await search(TOKEN);
    expect(byToken.map((p) => p.id).sort()).toEqual(
      [admin, stranger, payer1, payer2, member1, member2, subject]
        .map((u) => u.id)
        .sort(),
    );
    expect((await search(member1.id)).map((p) => p.id)).toEqual([member1.id]);
    expect(await search("e")).toEqual([]);
  });

  test("an edit swaps the payer: to a member (the old payer only stays if listed), then to a new user with the old payer as a member", async () => {
    const api = adminContext.request;
    // 1. member1 becomes the payer; payer1 is not listed, so payer1 leaves.
    const one = await call(
      api,
      "PATCH",
      `${GROUPS}/${groupId}`,
      groupBody({ payerId: member1.id, memberIds: [member2.id] }),
    );
    expect([one.status, one.body.id]).toEqual([200, groupId]);
    expect(await memberRows(groupId)).toEqual(rowsOf(member1, [member2]));

    // 2. payer2 (not in the group) becomes the payer; member1, the old payer, is
    // listed and stays as a member (it is demoted before payer2 is promoted, since
    // one payer per group is a unique index); payer1 comes back as a member too.
    const renamed = `${GROUP_NAME} 2`;
    const two = await call(
      api,
      "PATCH",
      `${GROUPS}/${groupId}`,
      groupBody({
        name: renamed,
        note: "",
        payerId: payer2.id,
        memberIds: [member1.id, member2.id, payer1.id],
      }),
    );
    expect([two.status, two.body.id]).toEqual([200, groupId]);
    const rows = await memberRows(groupId);
    expect(rows).toEqual(rowsOf(payer2, [member1, member2, payer1]));
    expect(rows.filter((r) => r.startsWith("payer:"))).toHaveLength(1);
    const { data: group } = await supabaseAdmin
      .from("user_groups")
      .select("name, note")
      .eq("id", groupId)
      .single();
    expect(group).toEqual({ name: renamed, note: null });

    // 3. Saving the same state again changes nothing.
    const again = await call(
      api,
      "PATCH",
      `${GROUPS}/${groupId}`,
      groupBody({
        name: renamed,
        note: "",
        payerId: payer2.id,
        memberIds: [member1.id, member2.id, payer1.id],
      }),
    );
    expect(again.status, again.text).toBe(200);
    expect(await memberRows(groupId)).toEqual(rows);

    // 4. A refused edit leaves the group as it was.
    const refused = await call(
      api,
      "PATCH",
      `${GROUPS}/${groupId}`,
      groupBody({ payerId: payer2.id, memberIds: [payer2.id] }),
    );
    expect([refused.status, refused.body.error]).toEqual([
      400,
      "payer_in_members",
    ]);
    expect(await memberRows(groupId)).toEqual(rows);
  });

  test("the verify toggle stamps verified_at on a real change only, keeps group memberships, and is audited under the admin", async () => {
    const api = adminContext.request;
    const first = await call(api, "POST", toggle(subject.id), {
      is_verified: true,
    });
    expect(first.status, first.text).toBe(200);
    expect(first.body).toMatchObject({
      ok: true,
      changed: true,
      is_verified: true,
    });
    const stamp = first.body.verified_at as string;
    expect(stamp).toBeTruthy();
    expect(await profileState(subject.id)).toEqual({
      is_verified: true,
      verified_at: stamp,
    });

    // A repeat changes nothing: same answer, the first date stays.
    const repeat = await call(api, "POST", toggle(subject.id), {
      is_verified: true,
    });
    expect(repeat.body).toMatchObject({
      ok: true,
      changed: false,
      is_verified: true,
      verified_at: stamp,
    });
    expect((await profileState(subject.id)).verified_at).toBe(stamp);

    // Put the account in a group, then un-verify it: the date goes, the group stays.
    const second = await call(api, "POST", GROUPS, {
      name: `${TOKEN} toggle`,
      payerId: payer2.id,
      memberIds: [subject.id],
    });
    expect(second.status, second.text).toBe(201);
    const off = await call(api, "POST", toggle(subject.id), {
      is_verified: false,
    });
    expect(off.body).toMatchObject({
      ok: true,
      changed: true,
      is_verified: false,
      verified_at: null,
    });
    expect(await profileState(subject.id)).toEqual({
      is_verified: false,
      verified_at: null,
    });
    expect(await memberRows(second.body.id as string)).toEqual(
      rowsOf(payer2, [subject]),
    );
    const offAgain = await call(api, "POST", toggle(subject.id), {
      is_verified: false,
    });
    expect(offAgain.body).toMatchObject({ ok: true, changed: false });

    // Two real changes, two audit rows under the admin: the repeats wrote nothing.
    const { data: audit } = await supabaseAdmin
      .from("audit_logs")
      .select("actor_source, changed_fields, new_values")
      .eq("table_name", "profiles")
      .eq("record_id", subject.id)
      .eq("actor_id", admin.id)
      .order("occurred_at", { ascending: true });
    expect(audit).toHaveLength(2);
    for (const row of audit ?? []) {
      expect(row.actor_source).toBe("admin");
      expect(row.changed_fields).toEqual(
        expect.arrayContaining(["is_verified", "verified_at"]),
      );
    }

    // The documented refusals.
    const unknown = await call(api, "POST", toggle(randomUUID()), {
      is_verified: true,
    });
    expect([unknown.status, unknown.body.error]).toEqual([404, "not_found"]);
    const badId = await call(api, "POST", toggle("not-a-uuid"), {
      is_verified: true,
    });
    expect([badId.status, badId.body.error]).toEqual([400, "invalid_id"]);
    const badBody = await call(api, "POST", toggle(subject.id), {
      is_verified: "yes",
    });
    expect(badBody.status).toBe(400);
  });

  test("the page shows both tabs to an admin and links itself in the sidebar; a guest is sent away, an anonymous visitor to sign-in", async ({
    browser,
  }) => {
    const page = await adminContext.newPage();
    await page.goto(`/dashboard/admin/verified-users?q=${TOKEN}`);
    const usersTab = page.getByRole("tab", { name: "ვერიფიცირებულები" });
    const groupsTab = page.getByRole("tab", { name: "ჯგუფები" });
    await expect(usersTab).toHaveAttribute("aria-selected", "true");
    await expect(groupsTab).toHaveAttribute("aria-selected", "false");
    await expect(
      page
        .locator("aside")
        .getByRole("link", { name: "ვერიფიცირებულები", exact: true }),
    ).toHaveAttribute("href", /\/dashboard\/admin\/verified-users$/);

    // The verified fixture is listed (the list is client-rendered, so this also
    // waits for hydration); the unverified one is not.
    const rows = page.getByTestId("verified-user-row");
    await expect(rows.filter({ hasText: names.get(payer1.id)! })).toHaveCount(
      1,
    );
    await expect(rows.filter({ hasText: names.get(member1.id)! })).toHaveCount(
      0,
    );

    await groupsTab.click();
    await expect(page).toHaveURL(/tab=groups/);
    await expect(groupsTab).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByTestId("user-group-card").filter({ hasText: TOKEN }).first(),
    ).toBeVisible();
    await page.close();

    const guestPage = await strangerContext.newPage();
    await guestPage.goto("/dashboard/admin/verified-users");
    await expect(guestPage).not.toHaveURL(/\/dashboard\/admin/);
    await guestPage.close();

    const anonymous = await contextFor(browser, null);
    try {
      const anonymousPage = await anonymous.newPage();
      await anonymousPage.goto("/dashboard/admin/verified-users");
      await expect(anonymousPage).toHaveURL(/\/auth\/login/);
    } finally {
      await anonymous.close();
    }
  });

  test("deleting a group removes its members and nobody's verification changes; the second delete is a 404", async () => {
    const api = adminContext.request;
    const people = [payer1, payer2, member1, member2];
    const before = await Promise.all(people.map((u) => profileState(u.id)));
    expect(before.map((s) => s.is_verified)).toEqual([
      true,
      false,
      false,
      true,
    ]);

    // The trail of removals so far: the earlier edit that dropped a member left
    // one row of its own, so the delete is counted against this, not against zero.
    const trailBefore = await deleteTrail(groupId);

    const removed = await call(api, "DELETE", `${GROUPS}/${groupId}`);
    expect([removed.status, removed.body.ok]).toEqual([200, true]);
    const again = await call(api, "DELETE", `${GROUPS}/${groupId}`);
    expect([again.status, again.body.error]).toEqual([404, "not_found"]);

    expect(await memberRows(groupId)).toEqual([]);
    const { count } = await supabaseAdmin
      .from("user_groups")
      .select("id", { count: "exact", head: true })
      .eq("id", groupId);
    expect(count).toBe(0);
    expect(await Promise.all(people.map((u) => profileState(u.id)))).toEqual(
      before,
    );

    // The delete (one row) and the cascade it caused (the group then held a
    // payer and three members) are in the trail, all under the admin.
    const trailAfter = await deleteTrail(groupId);
    expect(trailAfter.group).toHaveLength(trailBefore.group.length + 1);
    expect(trailAfter.members).toHaveLength(trailBefore.members.length + 4);
    expect(
      [...trailAfter.group, ...trailAfter.members].every(
        (r) => r.actor_id === admin.id && r.actor_source === "admin",
      ),
    ).toBe(true);
  });
});

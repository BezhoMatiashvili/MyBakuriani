import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FREE_PERIOD_BENEFITS,
  FREE_PERIOD_DB_ERRORS,
  FREE_PERIOD_ERROR_CODES,
  FREE_PERIOD_ROLES,
  addDays,
  addYears,
  defaultRoles,
  freePeriodDayEnd,
  freePeriodDayStart,
  formatDay,
  freePeriodErrorFromDb,
  freePeriodState,
  isIsoDate,
  isSeasonEnd,
  parseFreePeriodCreate,
  parseFreePeriodPatch,
  tbilisiDateOf,
  tbilisiToday,
  toFreePeriodView,
} from "../../src/lib/free-periods.ts";

const TODAY = "2026-10-20";
const NOW = new Date("2026-10-20T09:00:00Z");

const valid = (extra = {}) => ({
  name: "Launch",
  benefit: "membership",
  registrationFrom: "2026-10-20",
  registrationTo: "2026-10-30",
  endDate: "2026-12-31",
  roles: ["renter"],
  ...extra,
});

const err = (result) => (result.ok ? null : result.error);

test("vocabularies: benefits and roles (the SQL lists are compared by check-contracts C53)", () => {
  assert.deepEqual(
    [...FREE_PERIOD_BENEFITS],
    ["membership", "vip", "super_vip"],
  );
  assert.equal(FREE_PERIOD_ROLES.includes("admin"), false);
  assert.equal(FREE_PERIOD_ROLES.length, 9);
  assert.deepEqual(defaultRoles("membership"), ["renter"]);
  assert.deepEqual(defaultRoles("vip"), [...FREE_PERIOD_ROLES]);
  assert.deepEqual(defaultRoles("super_vip"), [...FREE_PERIOD_ROLES]);
});

test("day bounds are the SQL _admin_status_day_start / _end instants in Tbilisi", () => {
  assert.equal(freePeriodDayStart("2026-10-20"), "2026-10-20T00:00:00+04:00");
  assert.equal(
    freePeriodDayEnd("2026-10-30"),
    "2026-10-30T23:59:59.999999+04:00",
  );
  // The end is still that Tbilisi calendar day, the start too.
  assert.equal(tbilisiDateOf(freePeriodDayEnd("2026-10-30")), "2026-10-30");
  assert.equal(tbilisiDateOf(freePeriodDayStart("2026-10-20")), "2026-10-20");
  assert.equal(tbilisiToday(new Date("2026-10-19T20:30:00Z")), "2026-10-20");
});

test("dates: real calendar days only, and the +2 years horizon clamps like PostgreSQL", () => {
  assert.equal(isIsoDate("2026-10-20"), true);
  assert.equal(isIsoDate("2026-02-30"), false);
  assert.equal(isIsoDate("20-10-2026"), false);
  assert.equal(isIsoDate(undefined), false);
  assert.equal(addYears("2028-02-29", 2), "2030-02-28");
});

test("form helpers: adding days crosses months and years, days display as DD.MM.YYYY", () => {
  assert.equal(addDays("2026-10-20", 9), "2026-10-29");
  assert.equal(addDays("2026-10-25", 10), "2026-11-04");
  assert.equal(addDays("2026-12-25", 10), "2027-01-04");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(formatDay("2026-10-20"), "20.10.2026");
});

test("season ends are 31 Oct and 31 Mar", () => {
  assert.equal(isSeasonEnd("2026-10-31"), true);
  assert.equal(isSeasonEnd("2027-03-31"), true);
  assert.equal(isSeasonEnd("2026-12-31"), false);
  assert.equal(isSeasonEnd("2026-11-30"), false);
});

test("create: a valid membership period becomes whole Tbilisi days", () => {
  const r = parseFreePeriodCreate(valid(), TODAY);
  assert.equal(r.ok, true);
  assert.deepEqual(r.args, {
    name: "Launch",
    benefit: "membership",
    registration_starts_at: "2026-10-20T00:00:00+04:00",
    registration_ends_at: "2026-10-30T23:59:59.999999+04:00",
    benefit_ends_at: "2026-12-31T23:59:59.999999+04:00",
    roles: ["renter"],
    max_listings: null,
    is_active: true,
  });
});

test("create: a single-day window and an end on the last registration day are allowed", () => {
  assert.equal(
    parseFreePeriodCreate(
      valid({
        registrationFrom: "2026-10-20",
        registrationTo: "2026-10-20",
        endDate: "2026-10-20",
      }),
      TODAY,
    ).ok,
    true,
  );
});

test("create: a window in the past is allowed (retroactive gift) as long as the end is not", () => {
  const r = parseFreePeriodCreate(
    valid({ registrationFrom: "2026-10-01", registrationTo: "2026-10-10" }),
    TODAY,
  );
  assert.equal(r.ok, true);
});

test("create: errors name the first broken rule", () => {
  assert.equal(err(parseFreePeriodCreate(null, TODAY)), "invalid_request");
  assert.equal(err(parseFreePeriodCreate([], TODAY)), "invalid_request");
  assert.equal(
    err(parseFreePeriodCreate(valid({ name: "   " }), TODAY)),
    "invalid_name",
  );
  assert.equal(
    err(parseFreePeriodCreate(valid({ name: "x".repeat(81) }), TODAY)),
    "invalid_name",
  );
  assert.equal(
    err(parseFreePeriodCreate(valid({ name: 5 }), TODAY)),
    "invalid_name",
  );
  assert.equal(
    err(parseFreePeriodCreate(valid({ benefit: "company_plan" }), TODAY)),
    "invalid_benefit",
  );
  assert.equal(
    err(parseFreePeriodCreate(valid({ registrationFrom: "nope" }), TODAY)),
    "invalid_window",
  );
  assert.equal(
    err(
      parseFreePeriodCreate(valid({ registrationFrom: "2026-11-01" }), TODAY),
    ),
    "invalid_window",
  );
  assert.equal(
    err(parseFreePeriodCreate(valid({ endDate: undefined }), TODAY)),
    "invalid_end_date",
  );
  assert.equal(
    err(parseFreePeriodCreate(valid({ endDate: "2026-10-29" }), TODAY)),
    "end_before_window_end",
  );
  assert.equal(
    err(
      parseFreePeriodCreate(
        valid({
          registrationFrom: "2026-10-01",
          registrationTo: "2026-10-05",
          endDate: "2026-10-10",
        }),
        TODAY,
      ),
    ),
    "invalid_end_date",
    "the end date may not be in the past",
  );
  assert.equal(
    err(parseFreePeriodCreate(valid({ endDate: "2028-10-21" }), TODAY)),
    "invalid_end_date",
  );
  assert.equal(
    parseFreePeriodCreate(valid({ endDate: "2028-10-20" }), TODAY).ok,
    true,
  );
  assert.equal(
    err(parseFreePeriodCreate(valid({ roles: [] }), TODAY)),
    "invalid_roles",
  );
  assert.equal(
    err(parseFreePeriodCreate(valid({ roles: ["admin"] }), TODAY)),
    "invalid_roles",
  );
  assert.equal(
    err(parseFreePeriodCreate(valid({ roles: ["renter", "pilot"] }), TODAY)),
    "invalid_roles",
  );
  assert.equal(
    err(parseFreePeriodCreate(valid({ roles: "renter" }), TODAY)),
    "invalid_roles",
  );
  assert.equal(
    err(parseFreePeriodCreate(valid({ isActive: "yes" }), TODAY)),
    "invalid_request",
  );
});

test("create: roles are de-duplicated, VIP periods accept max_listings, membership refuses it", () => {
  const dup = parseFreePeriodCreate(
    valid({ roles: ["renter", "seller", "renter"] }),
    TODAY,
  );
  assert.deepEqual(dup.args.roles, ["renter", "seller"]);

  const vip = parseFreePeriodCreate(
    valid({ benefit: "vip", maxListings: 3 }),
    TODAY,
  );
  assert.equal(vip.ok, true);
  assert.equal(vip.args.max_listings, 3);
  assert.equal(
    parseFreePeriodCreate(
      valid({ benefit: "super_vip", maxListings: null }),
      TODAY,
    ).args.max_listings,
    null,
  );
  assert.equal(
    parseFreePeriodCreate(valid({ benefit: "vip" }), TODAY).args.max_listings,
    null,
  );

  assert.equal(
    err(parseFreePeriodCreate(valid({ maxListings: 3 }), TODAY)),
    "invalid_max_listings",
  );
  for (const bad of [0, -1, 101, 1.5, "3", NaN]) {
    assert.equal(
      err(
        parseFreePeriodCreate(
          valid({ benefit: "vip", maxListings: bad }),
          TODAY,
        ),
      ),
      "invalid_max_listings",
      String(bad),
    );
  }
  assert.equal(
    parseFreePeriodCreate(valid({ benefit: "vip", maxListings: 100 }), TODAY)
      .ok,
    true,
  );
});

test("create: a paused period can be created", () => {
  assert.equal(
    parseFreePeriodCreate(valid({ isActive: false }), TODAY).args.is_active,
    false,
  );
});

const stored = (extra = {}) => ({
  name: "Launch",
  benefit: "membership",
  registration_starts_at: "2026-10-20T00:00:00+04:00",
  registration_ends_at: "2026-10-30T23:59:59.999999+04:00",
  benefit_ends_at: "2026-12-31T23:59:59.999999+04:00",
  roles: ["renter"],
  max_listings: null,
  is_active: true,
  ...extra,
});

test("patch: only the fields in the body come back, as columns", () => {
  const r = parseFreePeriodPatch(
    { endDate: "2027-03-31", name: " Winter " },
    TODAY,
    stored(),
    NOW,
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.args, {
    name: "Winter",
    benefit_ends_at: "2027-03-31T23:59:59.999999+04:00",
  });
  const p = parseFreePeriodPatch({ isActive: false }, TODAY, stored(), NOW);
  assert.deepEqual(p.args, { is_active: false });
  const w = parseFreePeriodPatch(
    { registrationTo: "2026-11-15" },
    TODAY,
    stored(),
    NOW,
  );
  assert.deepEqual(w.args, {
    registration_ends_at: "2026-11-15T23:59:59.999999+04:00",
  });
});

test("patch: the stored row completes the cross-field rules", () => {
  assert.equal(
    err(
      parseFreePeriodPatch(
        { registrationTo: "2027-01-05" },
        TODAY,
        stored(),
        NOW,
      ),
    ),
    "end_before_window_end",
  );
  assert.equal(
    err(
      parseFreePeriodPatch(
        { registrationFrom: "2026-11-01" },
        TODAY,
        stored(),
        NOW,
      ),
    ),
    "invalid_window",
  );
  assert.equal(
    err(parseFreePeriodPatch({ endDate: "2026-10-25" }, TODAY, stored(), NOW)),
    "end_before_window_end",
  );
  assert.equal(
    err(
      parseFreePeriodPatch(
        { endDate: "2026-10-30" },
        TODAY,
        stored({ registration_ends_at: "2026-10-30T23:59:59.999999+04:00" }),
        NOW,
      ),
    ),
    null,
  );
  assert.equal(
    err(parseFreePeriodPatch({ maxListings: 2 }, TODAY, stored(), NOW)),
    "invalid_max_listings",
  );
  assert.equal(
    parseFreePeriodPatch(
      { maxListings: 2 },
      TODAY,
      stored({ benefit: "vip" }),
      NOW,
    ).ok,
    true,
  );
  assert.equal(
    parseFreePeriodPatch(
      { maxListings: null },
      TODAY,
      stored({ benefit: "vip", max_listings: 2 }),
      NOW,
    ).args.max_listings,
    null,
  );
});

test("patch: the benefit never changes", () => {
  assert.equal(
    err(parseFreePeriodPatch({ benefit: "vip" }, TODAY, stored(), NOW)),
    "benefit_locked",
  );
  // Sending the same benefit back is harmless.
  assert.equal(
    parseFreePeriodPatch(
      { benefit: "membership", name: "X" },
      TODAY,
      stored(),
      NOW,
    ).ok,
    true,
  );
});

test("patch: an empty or unknown body is a request error", () => {
  assert.equal(
    err(parseFreePeriodPatch({}, TODAY, stored(), NOW)),
    "invalid_request",
  );
  assert.equal(
    err(parseFreePeriodPatch({ foo: 1 }, TODAY, stored(), NOW)),
    "invalid_request",
  );
  assert.equal(
    err(parseFreePeriodPatch("x", TODAY, stored(), NOW)),
    "invalid_request",
  );
  assert.equal(
    err(parseFreePeriodPatch({ isActive: "no" }, TODAY, stored(), NOW)),
    "invalid_request",
  );
});

test("patch: an ended period keeps its end date but can still be renamed or paused", () => {
  const ended = stored({
    registration_starts_at: "2026-09-01T00:00:00+04:00",
    registration_ends_at: "2026-09-10T23:59:59.999999+04:00",
    benefit_ends_at: "2026-10-05T23:59:59.999999+04:00",
  });
  assert.equal(
    err(parseFreePeriodPatch({ endDate: "2026-12-31" }, TODAY, ended, NOW)),
    "period_ended",
  );
  assert.equal(
    parseFreePeriodPatch({ name: "Old launch" }, TODAY, ended, NOW).ok,
    true,
  );
  assert.equal(
    parseFreePeriodPatch({ isActive: false }, TODAY, ended, NOW).ok,
    true,
  );
  // Re-sending the unchanged end date is not an end-date edit.
  assert.equal(
    parseFreePeriodPatch(
      { endDate: "2026-10-05", name: "Old" },
      TODAY,
      ended,
      NOW,
    ).ok,
    true,
  );
});

test("patch: moving the end date needs today..+2y", () => {
  assert.equal(
    err(
      parseFreePeriodPatch(
        { endDate: "2026-10-19" },
        TODAY,
        stored({
          registration_starts_at: "2026-10-10T00:00:00+04:00",
          registration_ends_at: "2026-10-18T23:59:59.999999+04:00",
        }),
        NOW,
      ),
    ),
    "invalid_end_date",
  );
  assert.equal(
    err(parseFreePeriodPatch({ endDate: "2029-01-01" }, TODAY, stored(), NOW)),
    "invalid_end_date",
  );
  assert.equal(
    err(parseFreePeriodPatch({ endDate: "garbage" }, TODAY, stored(), NOW)),
    "invalid_end_date",
  );
});

test("state: ended wins over paused; scheduled before the window opens", () => {
  const nowMs = Date.parse("2026-10-20T09:00:00Z");
  assert.equal(freePeriodState(stored(), nowMs), "running");
  assert.equal(freePeriodState(stored({ is_active: false }), nowMs), "paused");
  assert.equal(
    freePeriodState(
      stored({ registration_starts_at: "2026-11-01T00:00:00+04:00" }),
      nowMs,
    ),
    "scheduled",
  );
  assert.equal(
    freePeriodState(
      stored({ benefit_ends_at: "2026-10-05T23:59:59.999999+04:00" }),
      nowMs,
    ),
    "ended",
  );
  assert.equal(
    freePeriodState(
      stored({
        benefit_ends_at: "2026-10-05T23:59:59.999999+04:00",
        is_active: false,
      }),
      nowMs,
    ),
    "ended",
  );
  // The benefit end instant itself is already ended (the DB uses benefit_ends_at <= now()).
  assert.equal(
    freePeriodState(stored({ benefit_ends_at: "2026-10-20T09:00:00Z" }), nowMs),
    "ended",
  );
});

test("view: Tbilisi dates, derived state and zeroed counters", () => {
  const row = {
    ...stored(),
    id: "b2f2a1c0-0000-4000-a000-000000000001",
    created_at: "2026-10-20T08:00:00Z",
  };
  const view = toFreePeriodView(
    row,
    { granted_members: 3, granted_listings: 0, waiting: 2 },
    NOW.getTime(),
  );
  assert.deepEqual(
    { ...view },
    {
      id: row.id,
      name: "Launch",
      benefit: "membership",
      registrationFrom: "2026-10-20",
      registrationTo: "2026-10-30",
      endDate: "2026-12-31",
      roles: ["renter"],
      maxListings: null,
      isActive: true,
      state: "running",
      grantedMembers: 3,
      grantedListings: 0,
      waiting: 2,
      createdAt: "2026-10-20T08:00:00Z",
    },
  );
  const bare = toFreePeriodView(row, undefined, NOW.getTime());
  assert.deepEqual(
    [bare.grantedMembers, bare.grantedListings, bare.waiting],
    [0, 0, 0],
  );
});

test("database error tokens map to request error codes", () => {
  assert.equal(
    freePeriodErrorFromDb("FREE_PERIOD_BENEFIT_LOCKED"),
    "benefit_locked",
  );
  assert.equal(
    freePeriodErrorFromDb("... FREE_PERIOD_ENDED ..."),
    "period_ended",
  );
  assert.equal(
    freePeriodErrorFromDb("FREE_PERIOD_END_PAST"),
    "invalid_end_date",
  );
  assert.equal(freePeriodErrorFromDb("FREE_PERIOD_NOT_FOUND"), "not_found");
  assert.equal(freePeriodErrorFromDb("ADMIN_STATUS_FORBIDDEN"), "forbidden");
  assert.equal(freePeriodErrorFromDb("duplicate key value"), null);
  assert.equal(freePeriodErrorFromDb(null), null);
  // Every mapped code is a published error code (the UI has a message for each).
  for (const code of Object.values(FREE_PERIOD_DB_ERRORS)) {
    assert.ok(FREE_PERIOD_ERROR_CODES.includes(code), code);
  }
});

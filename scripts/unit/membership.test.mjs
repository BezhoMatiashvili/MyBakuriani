import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SEASON_BOUNDS,
  validateRenterMembershipMeta,
  isMembershipActiveAt,
  windowsOverlap,
  deriveMembershipState,
  RENTAL_MEMBERSHIP_REQUIRED_HINT,
  isRentalMembershipRequiredError,
  rentalPostingGate,
} from "../../src/lib/membership/plans.ts";

const meta = (season, tier, bounds = SEASON_BOUNDS[season]) => ({
  subscription_scope: "renter",
  billing_period: "seasonal",
  season,
  price_tier: tier,
  season_start_month: bounds.start[0],
  season_start_day: bounds.start[1],
  season_end_month: bounds.end[0],
  season_end_day: bounds.end[1],
});

test("seasons follow the 2026 price list: summer Apr 1 – Oct 31, winter Nov 1 – Mar 31", () => {
  assert.deepEqual(SEASON_BOUNDS.summer, { start: [4, 1], end: [10, 31] });
  assert.deepEqual(SEASON_BOUNDS.winter, { start: [11, 1], end: [3, 31] });
});

test("validateRenterMembershipMeta accepts the four doc packages and rejects drift", () => {
  for (const season of ["summer", "winter"]) {
    for (const tier of ["fb_group_vip", "standard"]) {
      assert.equal(validateRenterMembershipMeta(meta(season, tier)), null);
    }
  }
  // the pre-2026 "ends on March 15" shape is no longer valid
  assert.notEqual(
    validateRenterMembershipMeta({
      subscription_scope: "renter",
      billing_period: "seasonal",
      season_end_month: 3,
      season_end_day: 15,
    }),
    null,
  );
  assert.notEqual(validateRenterMembershipMeta(meta("summer", "gold")), null);
  assert.notEqual(
    validateRenterMembershipMeta(
      meta("spring", "standard", SEASON_BOUNDS.summer),
    ),
    null,
  );
  assert.notEqual(
    validateRenterMembershipMeta(
      meta("summer", "standard", SEASON_BOUNDS.winter),
    ),
    null,
  );
  assert.notEqual(
    validateRenterMembershipMeta({
      ...meta("winter", "standard"),
      billing_period: "monthly",
    }),
    null,
  );
  // non-renter meta (company tiers, VIP rows) passes through untouched
  assert.equal(
    validateRenterMembershipMeta({
      subscription_scope: "organization",
      listing_limit: 10,
    }),
    null,
  );
  assert.equal(validateRenterMembershipMeta({}), null);
});

test("isMembershipActiveAt mirrors the SQL gate (active, started, not expired)", () => {
  const now = Date.parse("2026-09-25T09:00:00Z");
  const row = (status, starts, expires) => ({
    status,
    starts_at: starts,
    expires_at: expires,
  });
  assert.equal(
    isMembershipActiveAt(
      row("active", "2026-09-01T00:00:00Z", "2026-10-31T19:59:59.999Z"),
      now,
    ),
    true,
  );
  assert.equal(
    isMembershipActiveAt(
      row("active", "2026-10-31T20:00:00Z", "2027-03-31T19:59:59.999Z"),
      now,
    ),
    false,
  );
  assert.equal(
    isMembershipActiveAt(
      row(
        "pending_approval",
        "2026-09-01T00:00:00Z",
        "2026-10-31T19:59:59.999Z",
      ),
      now,
    ),
    false,
  );
  assert.equal(
    isMembershipActiveAt(
      row("active", "2026-01-01T00:00:00Z", "2026-09-25T09:00:00Z"),
      now,
    ),
    false,
  );
});

test("windowsOverlap is half-open and compares instants, not strings", () => {
  const summer = {
    startsAt: "2026-09-25T09:00:00Z",
    expiresAt: "2026-10-31T19:59:59.999999+00:00",
  };
  const winter = {
    startsAt: "2026-10-31T20:00:00+00:00",
    expiresAt: "2027-03-31T19:59:59.999Z",
  };
  assert.equal(windowsOverlap(summer, winter), false);
  assert.equal(windowsOverlap(winter, summer), false);
  assert.equal(
    windowsOverlap(summer, {
      startsAt: "2026-10-01T00:00:00Z",
      expiresAt: "2026-11-02T00:00:00Z",
    }),
    true,
  );
  // same instant written in two formats
  assert.equal(
    windowsOverlap(
      {
        startsAt: "2026-10-31T23:59:00+04:00",
        expiresAt: "2026-11-01T00:00:00+04:00",
      },
      summer,
    ),
    true,
  );
});

test("deriveMembershipState separates active, upcoming, pending and expired rows", () => {
  const now = Date.parse("2026-09-25T09:00:00Z");
  const state = deriveMembershipState(
    [
      {
        status: "active",
        starts_at: "2026-01-01T00:00:00Z",
        expires_at: "2026-03-31T19:59:59Z",
      }, // expired
      {
        status: "active",
        starts_at: "2026-09-25T08:00:00Z",
        expires_at: "2026-10-31T19:59:59.999Z",
      }, // current summer
      {
        status: "active",
        starts_at: "2026-10-31T20:00:00Z",
        expires_at: "2027-03-31T19:59:59.999Z",
      }, // pre-bought winter
      {
        status: "rejected",
        starts_at: "2026-09-20T00:00:00Z",
        expires_at: "2026-10-31T19:59:59.999Z",
      },
    ],
    now,
  );
  assert.equal(state.activeUntil, "2026-10-31T19:59:59.999Z");
  assert.deepEqual(state.upcoming, {
    startsAt: "2026-10-31T20:00:00Z",
    expiresAt: "2027-03-31T19:59:59.999Z",
  });
  assert.equal(state.pending, null);
  assert.equal(state.covered.length, 2);

  const pendingOnly = deriveMembershipState(
    [
      {
        status: "pending_approval",
        starts_at: "2026-09-25T09:00:00Z",
        expires_at: "2026-10-31T19:59:59.999Z",
      },
    ],
    now,
  );
  assert.equal(pendingOnly.activeUntil, null);
  assert.deepEqual(pendingOnly.pending, {
    startsAt: "2026-09-25T09:00:00Z",
    expiresAt: "2026-10-31T19:59:59.999Z",
  });
  assert.equal(pendingOnly.covered.length, 1);
  assert.deepEqual(deriveMembershipState([], now), {
    activeUntil: null,
    upcoming: null,
    pending: null,
    covered: [],
  });
});

test("rental posting gate follows the SQL trigger: only a started, active membership allows", () => {
  const now = Date.parse("2026-09-25T09:00:00Z");
  const active = {
    status: "active",
    starts_at: "2026-09-01T00:00:00Z",
    expires_at: "2026-10-31T19:59:59.999Z",
  };
  const future = {
    status: "active",
    starts_at: "2026-10-31T20:00:00Z",
    expires_at: "2027-03-31T19:59:59.999Z",
  };
  const pending = { ...active, status: "pending_approval" };
  const gate = (rows) => rentalPostingGate(deriveMembershipState(rows, now));
  assert.equal(gate([]), "missing");
  assert.equal(gate([active]), "allowed");
  assert.equal(gate([future]), "upcoming");
  assert.equal(gate([pending]), "pending");
  assert.equal(gate([pending, future]), "pending");
  assert.equal(gate([active, pending, future]), "allowed");
  assert.equal(
    gate([{ ...active, expires_at: "2026-09-25T09:00:00Z" }]),
    "missing",
  );
});

test("isRentalMembershipRequiredError matches only the trigger's HINT", () => {
  assert.equal(RENTAL_MEMBERSHIP_REQUIRED_HINT, "RENTAL_MEMBERSHIP_REQUIRED");
  assert.equal(
    isRentalMembershipRequiredError({
      code: "42501",
      message:
        "გაქირავების განცხადების განთავსებისთვის საჭიროა აქტიური სეზონური წევრობა",
      hint: "RENTAL_MEMBERSHIP_REQUIRED",
      details: null,
    }),
    true,
  );
  assert.equal(
    isRentalMembershipRequiredError({ code: "42501", hint: null }),
    false,
  );
  assert.equal(isRentalMembershipRequiredError(new Error("x")), false);
  assert.equal(isRentalMembershipRequiredError(null), false);
  assert.equal(
    isRentalMembershipRequiredError("RENTAL_MEMBERSHIP_REQUIRED"),
    false,
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_STATUS_MAX_TARGETS,
  addYears,
  adminStatusErrorFromDb,
  isValidEndDate,
  maxEndDate,
  parseCompanyChange,
  parseListingChange,
  parseMembershipChange,
  remaining,
  tbilisiDateOf,
  tbilisiDateTimeOf,
  tbilisiToday,
} from "../../src/lib/admin-statuses.ts";

const TODAY = "2026-10-06";
const U1 = "98d78998-a264-408f-a1e8-989a51a63c17";
const U2 = "67630fe2-5613-4fc2-b453-ffad4e7b9040";
const P1 = "8cef8faf-389d-4c59-a45c-3b6ca26afc1c";
const S1 = "c4757339-94ca-4929-9b5f-82cab5f60752";

const err = (result) => (result.ok ? null : result.error);

test("Tbilisi dates are UTC+4 calendar days", () => {
  // 20:30 UTC on Oct 5 is already Oct 6 in Tbilisi.
  assert.equal(tbilisiToday(new Date("2026-10-05T20:30:00Z")), "2026-10-06");
  assert.equal(tbilisiToday(new Date("2026-10-05T19:59:59Z")), "2026-10-05");
  // A season end (23:59:59.999999 Tbilisi) is that calendar day.
  assert.equal(tbilisiDateOf("2026-10-31T19:59:59.999999+00:00"), "2026-10-31");
  assert.equal(tbilisiDateTimeOf("2026-10-09T21:34:51Z"), "2026-10-10 01:34");
});

test("end-date window matches PostgreSQL date + interval '2 years'", () => {
  assert.equal(maxEndDate("2026-10-06"), "2028-10-06");
  // Feb 29 + 2 years clamps to Feb 28, as PostgreSQL does.
  assert.equal(addYears("2028-02-29", 2), "2030-02-28");
  assert.equal(addYears("2026-10-06", -2), "2024-10-06");
  assert.equal(isValidEndDate("2026-10-06", TODAY), true);
  assert.equal(isValidEndDate("2028-10-06", TODAY), true);
  assert.equal(isValidEndDate("2028-10-07", TODAY), false);
  assert.equal(isValidEndDate("2026-10-05", TODAY), false);
  assert.equal(isValidEndDate("2026-02-30", TODAY), false);
  assert.equal(isValidEndDate(20261010, TODAY), false);
});

test("remaining() counts whole days and hours, null once passed", () => {
  const now = Date.parse("2026-10-06T00:00:00Z");
  assert.deepEqual(remaining("2026-10-08T05:30:00Z", now), {
    days: 2,
    hours: 5,
  });
  assert.deepEqual(remaining("2026-10-06T00:59:00Z", now), {
    days: 0,
    hours: 0,
  });
  assert.equal(remaining("2026-10-06T00:00:00Z", now), null);
  assert.equal(remaining(null, now), null);
  assert.equal(remaining("garbage", now), null);
});

test("database tokens map to request error codes", () => {
  assert.equal(
    adminStatusErrorFromDb("ADMIN_STATUS_DAYS_INVALID"),
    "invalid_days",
  );
  assert.equal(
    adminStatusErrorFromDb(
      "ERROR: ADMIN_STATUS_REFUND_TOO_LARGE (SQLSTATE 22023)",
    ),
    "refund_too_large",
  );
  assert.equal(adminStatusErrorFromDb("ADMIN_STATUS_UNKNOWN_THING"), null);
  assert.equal(adminStatusErrorFromDb("duplicate key"), null);
  assert.equal(adminStatusErrorFromDb(undefined), null);
});

test("membership: extend / shorten need 1..365 whole days and users", () => {
  const ok = parseMembershipChange(
    {
      action: "extend",
      userIds: [U1, U2, U1],
      days: 5,
      notify: true,
      note: "  hi  ",
    },
    TODAY,
  );
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.args, {
    p_action: "extend",
    p_user_ids: [U1, U2],
    p_days: 5,
    p_notify: true,
    p_note: "hi",
    p_dry_run: true,
  });
  for (const days of [0, 366, 2.5, "5", null]) {
    assert.equal(
      err(
        parseMembershipChange(
          { action: "shorten", userIds: [U1], days },
          TODAY,
        ),
      ),
      "invalid_days",
    );
  }
  assert.equal(
    err(
      parseMembershipChange({ action: "extend", userIds: [], days: 1 }, TODAY),
    ),
    "invalid_targets",
  );
  assert.equal(
    err(
      parseMembershipChange(
        { action: "extend", userIds: ["x"], days: 1 },
        TODAY,
      ),
    ),
    "invalid_targets",
  );
  const many = Array.from(
    { length: ADMIN_STATUS_MAX_TARGETS + 1 },
    (_, i) => `00000000-0000-4000-a000-${String(i).padStart(12, "0")}`,
  );
  assert.equal(
    err(
      parseMembershipChange(
        { action: "extend", userIds: many, days: 1 },
        TODAY,
      ),
    ),
    "invalid_targets",
  );
});

test("membership: only dryRun === false applies", () => {
  const base = { action: "extend", userIds: [U1], days: 1 };
  assert.equal(parseMembershipChange(base, TODAY).args.p_dry_run, true);
  assert.equal(
    parseMembershipChange({ ...base, dryRun: "false" }, TODAY).args.p_dry_run,
    true,
  );
  assert.equal(
    parseMembershipChange({ ...base, dryRun: false }, TODAY).args.p_dry_run,
    false,
  );
});

test("membership: grant takes explicit dates or a package season", () => {
  const dated = parseMembershipChange(
    {
      action: "grant",
      userIds: [U1],
      startDate: "2026-11-01",
      endDate: "2027-03-31",
    },
    TODAY,
  );
  assert.equal(dated.ok, true);
  assert.equal(dated.args.p_start_date, "2026-11-01");
  assert.equal(dated.args.p_end_date, "2027-03-31");

  const season = parseMembershipChange(
    { action: "grant", userIds: [U1], packageId: P1 },
    TODAY,
  );
  assert.equal(season.ok, true);
  assert.equal(season.args.p_package_id, P1);
  assert.equal(season.args.p_end_date, undefined);

  assert.equal(
    err(parseMembershipChange({ action: "grant", userIds: [U1] }, TODAY)),
    "period_required",
  );
  // A start date without an end date is ambiguous with a package season.
  assert.equal(
    err(
      parseMembershipChange(
        { action: "grant", userIds: [U1], packageId: P1, startDate: TODAY },
        TODAY,
      ),
    ),
    "period_required",
  );
  assert.equal(
    err(
      parseMembershipChange(
        {
          action: "grant",
          userIds: [U1],
          startDate: "2026-10-01",
          endDate: "2026-12-01",
        },
        TODAY,
      ),
    ),
    "invalid_date",
  );
  assert.equal(
    err(
      parseMembershipChange(
        {
          action: "grant",
          userIds: [U1],
          startDate: "2026-12-02",
          endDate: "2026-12-01",
        },
        TODAY,
      ),
    ),
    "invalid_period",
  );
  assert.equal(
    err(
      parseMembershipChange(
        { action: "grant", userIds: [U1], packageId: "nope" },
        TODAY,
      ),
    ),
    "invalid_package",
  );
});

test("membership: set_period names one subscription and at least one date", () => {
  const ok = parseMembershipChange(
    { action: "set_period", subscriptionId: S1, endDate: "2026-11-15" },
    TODAY,
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.args.p_subscription_id, S1);
  assert.equal(ok.args.p_user_ids, undefined);
  assert.equal(
    err(
      parseMembershipChange(
        { action: "set_period", subscriptionId: S1 },
        TODAY,
      ),
    ),
    "period_required",
  );
  assert.equal(
    err(
      parseMembershipChange(
        { action: "set_period", userIds: [U1], endDate: "2026-11-15" },
        TODAY,
      ),
    ),
    "invalid_targets",
  );
  // A start date may lie in the past (an already running membership).
  assert.equal(
    parseMembershipChange(
      { action: "set_period", subscriptionId: S1, startDate: "2026-09-01" },
      TODAY,
    ).ok,
    true,
  );
});

test("membership: a custom refund amount needs one row, refund on, 2 decimals", () => {
  const ok = parseMembershipChange(
    { action: "revoke", subscriptionId: S1, refund: true, refundAmount: 12.5 },
    TODAY,
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.args.p_refund_amount, 12.5);
  const bulk = parseMembershipChange(
    { action: "revoke", userIds: [U1, U2], refund: true },
    TODAY,
  );
  assert.equal(bulk.ok, true);
  assert.equal(bulk.args.p_refund, true);
  assert.equal(
    err(
      parseMembershipChange(
        { action: "revoke", userIds: [U1], refund: true, refundAmount: 5 },
        TODAY,
      ),
    ),
    "invalid_refund",
  );
  assert.equal(
    err(
      parseMembershipChange(
        { action: "revoke", subscriptionId: S1, refundAmount: 5 },
        TODAY,
      ),
    ),
    "invalid_refund",
  );
  assert.equal(
    err(
      parseMembershipChange(
        {
          action: "revoke",
          subscriptionId: S1,
          refund: true,
          refundAmount: 1.005,
        },
        TODAY,
      ),
    ),
    "invalid_refund",
  );
});

test("membership: note length and unknown actions", () => {
  assert.equal(
    err(
      parseMembershipChange(
        { action: "extend", userIds: [U1], days: 1, note: "x".repeat(301) },
        TODAY,
      ),
    ),
    "note_too_long",
  );
  assert.equal(
    err(parseMembershipChange({ action: "approve", userIds: [U1] }, TODAY)),
    "invalid_action",
  );
  assert.equal(err(parseMembershipChange(null, TODAY)), "invalid_request");
  assert.equal(err(parseMembershipChange([1], TODAY)), "invalid_request");
});

test("listings: targets are de-duplicated per kind", () => {
  const ok = parseListingChange(
    {
      action: "vip_extend",
      days: 2,
      targets: [
        { kind: "property", id: P1 },
        { kind: "property", id: P1.toUpperCase() },
        { kind: "service", id: P1 },
      ],
    },
    TODAY,
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.args.p_targets.length, 2);
  assert.equal(
    err(
      parseListingChange(
        { action: "vip_end", targets: [{ kind: "listing", id: P1 }] },
        TODAY,
      ),
    ),
    "invalid_targets",
  );
  assert.equal(
    err(parseListingChange({ action: "vip_end", targets: [] }, TODAY)),
    "invalid_targets",
  );
});

test("listings: grant and discount_set need exactly one of days / end date", () => {
  const target = [{ kind: "property", id: P1 }];
  const days = parseListingChange(
    { action: "vip_grant", targets: target, tier: "super", days: 3 },
    TODAY,
  );
  assert.deepEqual(
    [days.args.p_tier, days.args.p_days, days.args.p_end_date],
    ["super", 3, undefined],
  );
  const dated = parseListingChange(
    {
      action: "discount_set",
      targets: target,
      percent: 15,
      endDate: "2026-10-20",
    },
    TODAY,
  );
  assert.deepEqual(
    [dated.args.p_discount_percent, dated.args.p_end_date],
    [15, "2026-10-20"],
  );
  assert.equal(
    err(
      parseListingChange(
        {
          action: "vip_grant",
          targets: target,
          tier: "vip",
          days: 3,
          endDate: "2026-10-20",
        },
        TODAY,
      ),
    ),
    "period_required",
  );
  assert.equal(
    err(
      parseListingChange(
        { action: "vip_grant", targets: target, tier: "gold", days: 3 },
        TODAY,
      ),
    ),
    "invalid_tier",
  );
  for (const percent of [0, 91, 12.5, "10"]) {
    assert.equal(
      err(
        parseListingChange(
          { action: "discount_set", targets: target, percent, days: 1 },
          TODAY,
        ),
      ),
      "invalid_percent",
    );
  }
  assert.equal(
    parseListingChange({ action: "vip_end", targets: target }, TODAY).ok,
    true,
  );
});

test("companies: tiers, periods and targets", () => {
  const ok = parseCompanyChange(
    { action: "grant", orgIds: [U1], tier: "pro", days: 30 },
    TODAY,
  );
  assert.deepEqual(
    [ok.args.p_action, ok.args.p_tier, ok.args.p_days, ok.args.p_org_ids],
    ["grant", "pro", 30, [U1]],
  );
  assert.equal(
    err(
      parseCompanyChange(
        { action: "set_tier", orgIds: [U1], tier: "gold" },
        TODAY,
      ),
    ),
    "invalid_tier",
  );
  assert.equal(
    err(
      parseCompanyChange(
        { action: "set_end", orgIds: [U1], endDate: "2030-01-01" },
        TODAY,
      ),
    ),
    "invalid_date",
  );
  assert.equal(
    err(parseCompanyChange({ action: "end", orgIds: [] }, TODAY)),
    "invalid_targets",
  );
  assert.equal(
    parseCompanyChange({ action: "end", orgIds: [U1] }, TODAY).ok,
    true,
  );
});

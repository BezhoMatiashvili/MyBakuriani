import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countBookings,
  filterBookings,
} from "../../src/lib/renter/booking-filters.ts";

const TODAY = "2026-10-04";

function booking(id, checkIn, checkOut, extra = {}) {
  return {
    id,
    check_in: checkIn,
    check_out: checkOut,
    status: "booked",
    created_at: null,
    cancelled_at: null,
    guest_name: null,
    guest_phone: null,
    ...extra,
  };
}

const ids = (rows) => rows.map((r) => r.id);

test("current includes stays that check in or check out today", () => {
  const rows = [
    booking("in-today", "2026-10-04", "2026-10-08"),
    booking("out-today", "2026-10-01", "2026-10-04"),
    booking("single-night-today", "2026-10-04", "2026-10-04"),
    booking("spans", "2026-09-30", "2026-10-10"),
    booking("ended-yesterday", "2026-09-28", "2026-10-03"),
    booking("starts-tomorrow", "2026-10-05", "2026-10-07"),
  ];
  assert.deepEqual(ids(filterBookings(rows, "current", TODAY)), [
    "out-today",
    "single-night-today",
    "in-today",
    "spans",
  ]);
});

test("upcoming starts after today, nearest first", () => {
  const rows = [
    booking("far", "2026-12-20", "2026-12-25"),
    booking("tomorrow", "2026-10-05", "2026-10-06"),
    booking("today", "2026-10-04", "2026-10-06"),
  ];
  assert.deepEqual(ids(filterBookings(rows, "upcoming", TODAY)), [
    "tomorrow",
    "far",
  ]);
});

test("past ended before today, most recent first", () => {
  const rows = [
    booking("old", "2025-12-20", "2025-12-25"),
    booking("yesterday", "2026-10-01", "2026-10-03"),
    booking("out-today", "2026-10-01", "2026-10-04"),
  ];
  assert.deepEqual(ids(filterBookings(rows, "past", TODAY)), [
    "yesterday",
    "old",
  ]);
});

test("cancelled bookings appear only under the cancelled filter", () => {
  const rows = [
    booking("live", "2026-10-04", "2026-10-05"),
    booking("gone-now", "2026-10-04", "2026-10-05", {
      status: "cancelled",
      cancelled_at: "2026-10-02T10:00:00Z",
    }),
    booking("gone-later", "2026-11-01", "2026-11-02", {
      status: "cancelled",
      cancelled_at: "2026-10-03T10:00:00Z",
    }),
  ];
  assert.deepEqual(ids(filterBookings(rows, "current", TODAY)), ["live"]);
  assert.deepEqual(ids(filterBookings(rows, "upcoming", TODAY)), []);
  assert.deepEqual(ids(filterBookings(rows, "recent", TODAY)), ["live"]);
  assert.deepEqual(ids(filterBookings(rows, "cancelled", TODAY)), [
    "gone-later",
    "gone-now",
  ]);
});

test("recent sorts by created_at desc with missing timestamps last", () => {
  const rows = [
    booking("no-ts", "2026-10-10", "2026-10-11"),
    booking("older", "2026-10-12", "2026-10-13", {
      created_at: "2026-09-01T08:00:00Z",
    }),
    booking("newest", "2026-09-01", "2026-09-02", {
      created_at: "2026-10-03T08:00:00Z",
    }),
  ];
  assert.deepEqual(ids(filterBookings(rows, "recent", TODAY)), [
    "newest",
    "older",
    "no-ts",
  ]);
});

test("search matches guest name case-insensitively and phone by digits", () => {
  const rows = [
    booking("nino", "2026-10-10", "2026-10-11", {
      guest_name: "Nino Beridze",
      guest_phone: "+995 555 12 34 56",
    }),
    booking("giorgi", "2026-10-12", "2026-10-13", {
      guest_name: "გიორგი",
      guest_phone: "599001122",
    }),
  ];
  assert.deepEqual(ids(filterBookings(rows, "upcoming", TODAY, "nino")), [
    "nino",
  ]);
  assert.deepEqual(ids(filterBookings(rows, "upcoming", TODAY, "გიორ")), [
    "giorgi",
  ]);
  assert.deepEqual(ids(filterBookings(rows, "upcoming", TODAY, "555 1234")), [
    "nino",
  ]);
  assert.deepEqual(ids(filterBookings(rows, "upcoming", TODAY, "  ")), [
    "nino",
    "giorgi",
  ]);
  // Letters only: no digits to compare, so a phone never matches by accident.
  assert.deepEqual(ids(filterBookings(rows, "upcoming", TODAY, "xyz")), []);
});

test("countBookings counts every chip and respects the search", () => {
  const rows = [
    booking("current", "2026-10-03", "2026-10-05", { guest_name: "Ana" }),
    booking("upcoming", "2026-10-20", "2026-10-22", { guest_name: "Ana" }),
    booking("past", "2026-09-01", "2026-09-03", { guest_name: "Luka" }),
    booking("cancelled", "2026-10-20", "2026-10-22", {
      status: "cancelled",
      guest_name: "Ana",
    }),
  ];
  assert.deepEqual(countBookings(rows, TODAY), {
    current: 1,
    upcoming: 1,
    past: 1,
    recent: 3,
    cancelled: 1,
  });
  assert.deepEqual(countBookings(rows, TODAY, "ana"), {
    current: 1,
    upcoming: 1,
    past: 0,
    recent: 2,
    cancelled: 1,
  });
});

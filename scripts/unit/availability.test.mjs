import { test } from "node:test";
import assert from "node:assert/strict";
import { datesInRange, occupancyWindow, nextOccupiedAfter, previousIsoDate, mapBookingError, isWeekend } from "../../src/lib/utils/availability.ts";

test("datesInRange is inclusive and order-independent", () => {
  assert.deepEqual(datesInRange("2026-02-27", "2026-03-01"), ["2026-02-27", "2026-02-28", "2026-03-01"]);
  assert.deepEqual(datesInRange("2026-03-01", "2026-02-27"), ["2026-02-27", "2026-02-28", "2026-03-01"]);
  assert.deepEqual(datesInRange("2026-05-05", "2026-05-05"), ["2026-05-05"]);
});

test("occupancyWindow starts 3 months back and ends on the last day of the 23rd month ahead", () => {
  // `new Date(y, m + 24, 0)` is day 0 of the 24th month ahead, i.e. the last
  // day of the 23rd. Pinning the real bound so the pickers' greyed-out range
  // cannot silently shift if the arithmetic is "tidied".
  assert.deepEqual(occupancyWindow(new Date(2026, 8, 21)), ["2026-06-01", "2028-08-31"]);
});

test("nextOccupiedAfter returns the earliest occupied day strictly after the pivot", () => {
  const occupied = new Map([["2026-01-10", "booked"], ["2026-01-05", "blocked"], ["2026-01-20", "booked"]]);
  assert.equal(nextOccupiedAfter(occupied, "2026-01-05"), "2026-01-10");
  assert.equal(nextOccupiedAfter(occupied, "2026-01-20"), null);
  assert.equal(nextOccupiedAfter(new Map(), "2026-01-01"), null);
});

test("previousIsoDate crosses month and year boundaries", () => {
  assert.equal(previousIsoDate("2026-03-01"), "2026-02-28");
  assert.equal(previousIsoDate("2026-01-01"), "2025-12-31");
});

test("mapBookingError recognises the RPC's Georgian conflict text", () => {
  assert.equal(mapBookingError("თარიღები დაკავებულია"), "datesUnavailable");
  assert.equal(mapBookingError("permission denied"), "generic");
  assert.equal(mapBookingError(null), "generic");
});

test("isWeekend treats Friday, Saturday and Sunday as weekend", () => {
  assert.equal(isWeekend(new Date(2026, 8, 18)), true); // Friday
  assert.equal(isWeekend(new Date(2026, 8, 20)), true); // Sunday
  assert.equal(isWeekend(new Date(2026, 8, 21)), false); // Monday
});

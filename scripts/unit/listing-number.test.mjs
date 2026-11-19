import { test } from "node:test";
import assert from "node:assert/strict";
import { parseListingNumber } from "../../src/lib/listing-number.ts";

test("an ID typed in the search box is recognised in its usual spellings", () => {
  for (const q of [
    "10000042",
    "  10000042  ",
    "ID: 10000042",
    "id:10000042",
    "ID 10000042",
    "id10000042",
    "Id#10000042",
    "#10000042",
    "# 10000042",
    "№10000042",
    "№ 10000042",
  ]) {
    assert.equal(parseListingNumber(q), 10000042, q);
  }
});

test("anything else stays a keyword search", () => {
  for (const q of [
    "",
    "   ",
    null,
    undefined,
    "კოტეჯი",
    "2",
    "1000004", // 7 digits
    "100000420", // 9 digits
    "10000000", // below the first number
    "00000042",
    "10000042a",
    "a10000042",
    "10 000 042",
    "ID: 1000-0042",
    "ბინა 10000042",
  ]) {
    assert.equal(parseListingNumber(q), null, String(q));
  }
});

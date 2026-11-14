import { test } from "node:test";
import assert from "node:assert/strict";
import { scheduleChipId } from "../../src/lib/employment/schedule.ts";
import { optionKeyFor } from "../../src/lib/constants/listing-options.ts";

const chip = (raw) => scheduleChipId(raw, optionKeyFor("employmentTypes", raw));

test("stored Georgian labels map to their /employment chip", () => {
  assert.equal(chip("სრული განაკვეთი"), "fulltime");
  assert.equal(chip("ნახევარი განაკვეთი"), "parttime");
  assert.equal(chip("სეზონური"), "seasonal");
});

test("the demo seed's chip ids are accepted", () => {
  assert.equal(chip("fulltime"), "fulltime");
  assert.equal(chip("parttime"), "parttime");
  assert.equal(chip("seasonal"), "seasonal");
});

test("everything else is other: flexible, empty and unknown text", () => {
  assert.equal(chip("მოქნილი"), "other");
  assert.equal(chip(null), "other");
  assert.equal(chip(undefined), "other");
  assert.equal(chip(""), "other");
  assert.equal(chip("რაღაც სხვა"), "other");
  assert.equal(chip("constructor"), "other");
});

test("the form's four options each land in exactly one chip", () => {
  const chips = [
    "სრული განაკვეთი",
    "ნახევარი განაკვეთი",
    "სეზონური",
    "მოქნილი",
  ].map(chip);
  assert.deepEqual(chips, ["fulltime", "parttime", "seasonal", "other"]);
});

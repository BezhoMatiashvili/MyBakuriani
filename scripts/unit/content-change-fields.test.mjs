import { test } from "node:test";
import assert from "node:assert/strict";
import { REVIEWABLE_FIELDS, hasOnlyReviewableValues, pickReviewableValues } from "../../src/lib/content-change/fields.ts";

test("identity fields stay out of the profile review list (self-service exception)", () => {
  for (const f of ["display_name", "phone", "avatar_url", "role"]) assert.equal(REVIEWABLE_FIELDS.profile.includes(f), false);
  assert.deepEqual([...REVIEWABLE_FIELDS.profile], ["bio", "response_time_minutes"]);
});

test("operational property fields are not reviewable", () => {
  for (const f of ["check_in_time", "cadastral_code_public", "organization_id", "status", "owner_id", "progress_note"]) {
    assert.equal(REVIEWABLE_FIELDS.property.includes(f), false, f);
  }
});

test("hasOnlyReviewableValues is all-or-nothing", () => {
  assert.equal(hasOnlyReviewableValues("property", { title: "x", rooms: 2 }), true);
  assert.equal(hasOnlyReviewableValues("property", { title: "x", owner_id: "y" }), false);
  assert.equal(hasOnlyReviewableValues("service", {}), true);
});

test("pickReviewableValues drops non-allow-listed keys", () => {
  assert.deepEqual(pickReviewableValues("service", { title: "t", status: "active", price: 5 }), { title: "t", price: 5 });
});

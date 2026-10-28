import { test } from "node:test";
import assert from "node:assert/strict";
import { CLEANER_PROFILE_FIELDS, REVIEWABLE_FIELDS, hasOnlyReviewableValues, pickReviewableValues } from "../../src/lib/content-change/fields.ts";
import { FIELD_LABELS, TARGET_LABELS, isPdfUrl, photoDiffNotes, photoListDiff, roomMarks, roomsLostData } from "../../src/lib/content-change/diff-display.ts";

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

test("the sale price pair is reviewable (C54)", () => {
  const pair = { sale_price: 57757, sale_price_gel: 150000, sale_price_currency: "GEL" };
  assert.equal(hasOnlyReviewableValues("property", pair), true);
  assert.deepEqual(pickReviewableValues("property", { ...pair, status: "active" }), pair);
});

test("every reviewable field has an admin label (C14)", () => {
  const keys = [...Object.values(REVIEWABLE_FIELDS).flat(), "cleaner_profile", ...CLEANER_PROFILE_FIELDS];
  for (const k of keys) assert.ok(FIELD_LABELS[k]?.trim(), k);
  assert.deepEqual(Object.keys(TARGET_LABELS).sort(), Object.keys(REVIEWABLE_FIELDS).sort());
});

test("photoListDiff: a pure reorder that swaps the cover", () => {
  const d = photoListDiff(["a", "b", "c"], ["b", "a", "c"]);
  assert.equal(d.coverChanged, true);
  assert.equal(d.orderChanged, true);
  assert.equal(d.added.size, 0);
  assert.equal(d.removed.size, 0);
  assert.deepEqual(photoDiffNotes(d), ["მთავარი ფოტო შეიცვალა", "იგივე ფოტოები — შეიცვალა მხოლოდ რიგი"]);
});

test("photoListDiff: add + remove is not a reorder; non-string lists are null", () => {
  const d = photoListDiff(["a", "b"], ["a", "c"]);
  assert.deepEqual([...d.added], ["c"]);
  assert.deepEqual([...d.removed], ["b"]);
  assert.equal(d.coverChanged, false);
  assert.equal(d.orderChanged, false);
  assert.equal(photoListDiff(["a"], ["a", 5]), null);
});

test("roomMarks matches rooms by name; roomsLostData; isPdfUrl", () => {
  const room = (name, price) => ({ name, guests: 2, beds: null, area_sqm: null, price, quantity: 1, photos: [] });
  assert.deepEqual(roomMarks([room("A", 50), room("B", 60)], [room("A", 55), room("C", 70)]), {
    before: [null, "removed"],
    after: ["changed", "new"],
  });
  assert.equal(roomsLostData([{ name: "" }], []), true);
  assert.equal(roomsLostData(null, []), false);
  assert.equal(isPdfUrl("https://x.supabase.co/storage/v1/object/public/restaurant-menus/u/m.PDF"), true);
  assert.equal(isPdfUrl("not a url"), false);
});

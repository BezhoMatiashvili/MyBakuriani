import { test } from "node:test";
import assert from "node:assert/strict";
import { firstPhotoOnly } from "../../src/lib/utils/photos.ts";

test("firstPhotoOnly keeps only the first photo", () => {
  const row = { id: "a", photos: ["1.jpg", "2.jpg", "3.jpg"] };
  assert.deepEqual(firstPhotoOnly(row), { id: "a", photos: ["1.jpg"] });
  assert.deepEqual(row.photos, ["1.jpg", "2.jpg", "3.jpg"], "input not mutated");
});

test("firstPhotoOnly preserves null, empty and single-photo rows as-is", () => {
  const nullRow = { id: "n", photos: null };
  const emptyRow = { id: "e", photos: [] };
  const oneRow = { id: "o", photos: ["only.jpg"] };
  assert.equal(firstPhotoOnly(nullRow), nullRow);
  assert.equal(firstPhotoOnly(emptyRow), emptyRow);
  assert.equal(firstPhotoOnly(oneRow), oneRow);
});

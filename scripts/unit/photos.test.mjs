import { test } from "node:test";
import assert from "node:assert/strict";
import {
  firstPhotoOnly,
  parseStorageObjectUrl,
  sanitizePhotos,
} from "../../src/lib/utils/photos.ts";

test("a malformed %-escape drops that photo instead of throwing", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
  const base =
    "https://abc.supabase.co/storage/v1/object/public/property-photos";
  const good = `${base}/u1/ok.jpg`;
  const bad = `${base}/u1/a%ZZ.jpg`;
  assert.equal(parseStorageObjectUrl(bad), null);
  assert.deepEqual(sanitizePhotos([bad, good]), [good]);
  assert.equal(parseStorageObjectUrl(good)?.path, "u1/ok.jpg");
});

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

import { test } from "node:test";
import assert from "node:assert/strict";
import { BANNER_PLACEMENTS, BANNER_PLACEMENT_IDS, getPlacementSpec } from "../../src/lib/banner-placements.ts";

test("placement ids are unique and match the registry length", () => {
  assert.equal(new Set(BANNER_PLACEMENT_IDS).size, BANNER_PLACEMENTS.length);
  assert.equal(BANNER_PLACEMENTS.length, 11);
});

test("getPlacementSpec returns null, never throws, for an unmapped value", () => {
  assert.equal(getPlacementSpec("not_a_placement"), null);
  assert.equal(getPlacementSpec("home_hero")?.id, "home_hero");
});

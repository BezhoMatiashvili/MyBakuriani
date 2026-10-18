import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BANNER_PLACEMENTS,
  BANNER_PLACEMENT_IDS,
  compareSlotCandidates,
  getPlacementSpec,
  placementRequiresMedia,
  selectLiveCreatives,
  slotHolder,
  slotState,
} from "../../src/lib/banner-placements.ts";
import {
  tbilisiDateOf,
  tbilisiDayEnd,
  tbilisiDayStart,
} from "../../src/lib/admin-statuses.ts";

test("placement ids are unique and match the registry length", () => {
  assert.equal(new Set(BANNER_PLACEMENT_IDS).size, BANNER_PLACEMENTS.length);
  assert.equal(BANNER_PLACEMENTS.length, 12);
});

test("getPlacementSpec returns null, never throws, for an unmapped value", () => {
  assert.equal(getPlacementSpec("not_a_placement"), null);
  assert.equal(getPlacementSpec("home_hero")?.id, "home_hero");
});

// The public loader and both admin pages decide "shown or not" through the
// slot helpers below.

const NOW = Date.parse("2026-10-06T12:00:00Z");
const IMG = "https://images.unsplash.com/x.jpg";
function cand(over) {
  return {
    id: "x",
    placement: "home_hero",
    sortOrder: 0,
    sponsored: false,
    startAt: null,
    endAt: null,
    createdAt: "2026-10-01T00:00:00Z",
    imageUrl: IMG,
    videoUrl: null,
    ...over,
  };
}

test("media-first placements need media, text-led ones do not", () => {
  for (const p of ["home_hero", "footer_leaderboard", "listing_top", "listing_grid", "detail_sidebar"]) {
    assert.equal(placementRequiresMedia(p), true, p);
  }
  for (const p of ["header_strip", "sticky_bottom", "home_top_strip", "home_promo", "home_between_sections", "blog_inline"]) {
    assert.equal(placementRequiresMedia(p), false, p);
  }
  assert.equal(placementRequiresMedia("nope"), false);
});

test("selectLiveCreatives keeps only scheduled, placed, renderable creatives", () => {
  const live = selectLiveCreatives(
    [
      cand({ id: "ok" }),
      cand({ id: "future", startAt: "2026-10-07T00:00:00Z" }),
      cand({ id: "past", endAt: "2026-10-06T00:00:00Z" }),
      cand({ id: "nomedia", imageUrl: null }),
      cand({ id: "text", placement: "header_strip", imageUrl: null }),
      cand({ id: "badplace", placement: "nope" }),
    ],
    NOW,
  );
  assert.deepEqual(live.map((c) => c.id).sort(), ["ok", "text"]);
});

test("order: sort order, then paid before editorial, then newest", () => {
  const sorted = [
    cand({ id: "old", createdAt: "2026-09-01T00:00:00Z" }),
    cand({ id: "ad", sponsored: true, createdAt: "2026-08-01T00:00:00Z" }),
    cand({ id: "first", sortOrder: -1 }),
    cand({ id: "new", createdAt: "2026-10-05T00:00:00Z" }),
  ].sort(compareSlotCandidates);
  assert.deepEqual(sorted.map((c) => c.id), ["first", "ad", "new", "old"]);
});

test("slotState explains why an enabled creative is not on the site", () => {
  const ad = cand({ id: "ad", sponsored: true });
  const banner = cand({ id: "banner" });
  const strip1 = cand({ id: "s1", placement: "header_strip" });
  const strip2 = cand({ id: "s2", placement: "header_strip" });
  const live = selectLiveCreatives([ad, banner, strip1, strip2], NOW);
  assert.equal(slotState(ad, live, NOW), "live");
  assert.equal(slotState(banner, live, NOW), "hidden");
  // Strips stack: every live one is shown.
  assert.equal(slotState(strip2, live, NOW), "live");
  assert.equal(slotState(cand({ endAt: "2026-10-01T00:00:00Z" }), live, NOW), "expired");
  assert.equal(slotState(cand({ startAt: "2026-10-09T00:00:00Z" }), live, NOW), "scheduled");
  assert.equal(slotState(cand({ id: "n", imageUrl: null, placement: "listing_grid" }), live, NOW), "needs_media");
});

// C47: in a single-creative placement every paid ad rotates by its share of
// voice; an editorial banner is house fill in the share the ads leave.
test("ads rotate by share of voice; editorial banners fill what is left", () => {
  const a25 = cand({ id: "a25", sponsored: true, sovPercent: 25 });
  const a50 = cand({ id: "a50", sponsored: true, sovPercent: 50 });
  const h1 = cand({ id: "h1" });
  const h2 = cand({ id: "h2", createdAt: "2026-09-01T00:00:00Z" });
  let live = selectLiveCreatives([a25, a50, h1, h2], NOW);
  assert.equal(slotState(a25, live, NOW), "live");
  assert.equal(slotState(a50, live, NOW), "live");
  assert.equal(slotState(h1, live, NOW), "live");
  assert.equal(slotState(h2, live, NOW), "hidden");
  assert.equal(slotHolder("home_hero", live)?.id, "h1");

  const a100 = cand({ id: "a100", sponsored: true, sovPercent: 100 });
  live = selectLiveCreatives([a100, h1], NOW);
  assert.equal(slotState(a100, live, NOW), "live");
  assert.equal(slotState(h1, live, NOW), "hidden");
  assert.equal(slotHolder("home_hero", live)?.id, "a100");

  // The sponsored grid card: two positions a page, ads first.
  const g = (over) => cand({ placement: "listing_grid", ...over });
  const ga = g({ id: "ga", sponsored: true, sovPercent: 25 });
  const gh1 = g({ id: "gh1" });
  const gh2 = g({ id: "gh2", createdAt: "2026-09-01T00:00:00Z" });
  live = selectLiveCreatives([ga, gh1, gh2], NOW);
  assert.equal(slotState(gh1, live, NOW), "live");
  assert.equal(slotState(gh2, live, NOW), "hidden");

  assert.equal(getPlacementSpec("mobile_strip")?.surface, "site");
  assert.equal(placementRequiresMedia("mobile_strip"), true);
});

test("ad dates cover whole Tbilisi days and read back unchanged", () => {
  // A one-day campaign picked as start = end = today is live all day.
  const start = tbilisiDayStart("2026-10-06");
  const end = tbilisiDayEnd("2026-10-06");
  assert.equal(Date.parse(start), Date.parse("2026-10-05T20:00:00Z"));
  assert.equal(Date.parse(end), Date.parse("2026-10-06T19:59:59.999Z"));
  const oneDay = cand({ startAt: start, endAt: end });
  assert.equal(selectLiveCreatives([oneDay], NOW).length, 1);
  // The edit form reads the stored instants back as the same days.
  assert.equal(tbilisiDateOf(new Date(Date.parse(start)).toISOString()), "2026-10-06");
  assert.equal(tbilisiDateOf(new Date(Date.parse(end)).toISOString()), "2026-10-06");
  // Rows saved before the fix (UTC midnight) still read as the day picked.
  assert.equal(tbilisiDateOf("2026-07-17T00:00:00+00:00"), "2026-07-17");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  AD_PRIORITY_MAX,
  AD_PRIORITY_MIN,
  DEFAULT_SOV,
  FREQUENCY_CAP_MAX,
  MAX_SPONSORED_PER_PAGE,
  ROTATION_PLACEMENTS,
  SOV_TIERS,
  interleaveSponsored,
  isDeterministic,
  pickAd,
  pickSlot,
  rotationModeFor,
  sponsoredGridPositions,
  stackSlot,
} from "../../src/lib/ad-rotation.ts";
import {
  RATE_CARD_PACKAGES,
  RATE_CARD_SLOTS,
  rateCardSlot,
} from "../../src/lib/ad-rate-card.ts";
import { BANNER_PLACEMENT_IDS } from "../../src/lib/banner-placements.ts";

// C47: share of voice, exclusivity, priority, frequency cap, rotation and the
// sponsored-card positions of the owner's media plan, simulated over many
// page views with a seeded generator (the same numbers on every run).

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ad = (id, sovPercent, priority = 5, frequencyCap = null) => ({
  id,
  sponsored: true,
  sovPercent,
  priority,
  frequencyCap,
});
const house = (id) => ({
  id,
  sponsored: false,
  sovPercent: 0,
  priority: 0,
  frequencyCap: null,
});

const RUNS = 20_000;

function shares(candidates, mode = "sov", extra = {}) {
  const random = seeded(46);
  const counts = new Map();
  for (let i = 0; i < RUNS; i++) {
    const pick = pickSlot(candidates, mode, { random: random(), ...extra });
    const key = pick ? pick.id : "empty";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts].map(([k, v]) => [k, Math.round((v / RUNS) * 1000) / 10]),
  );
}

const near = (actual, expected, tolerance = 1.5) =>
  assert.ok(
    Math.abs((actual ?? 0) - expected) <= tolerance,
    `expected ≈${expected}%, got ${actual}%`,
  );

test("a lone 25 % ad gets about a quarter; the rest is house fill or empty", () => {
  const withHouse = shares([ad("a", 25), house("h")]);
  near(withHouse.a, 25);
  near(withHouse.h, 75);

  const alone = shares([ad("a", 25)]);
  near(alone.a, 25);
  near(alone.empty, 75);
});

test("25 % + 50 % split the slot 25 / 50 / 25 (unsold)", () => {
  const s = shares([ad("a", 25), ad("b", 50), house("h")]);
  near(s.a, 25);
  near(s.b, 50);
  near(s.h, 25);
});

test("four 25 % ads fill the slot; nothing is left for house fill", () => {
  const s = shares([
    ad("a", 25),
    ad("b", 25),
    ad("c", 25),
    ad("d", 25),
    house("h"),
  ]);
  for (const id of ["a", "b", "c", "d"]) near(s[id], 25);
  assert.equal(s.h, undefined);
});

test("100 % SOV excludes every other ad and the house fill", () => {
  const s = shares([ad("x", 100), ad("a", 25), house("h")]);
  assert.equal(s.x, 100);
});

test("an oversold slot squeezes the lowest priority first", () => {
  const s = shares([ad("low", 50, 1), ad("high", 50, 9), ad("mid", 50, 5)]);
  near(s.high, 50);
  near(s.mid, 50);
  assert.equal(s.low, undefined);
});

test("a capped ad's share falls to the house fill on that device", () => {
  const s = shares([ad("a", 50, 5, 3), ad("b", 25), house("h")], "sov", {
    capped: new Set(["a"]),
  });
  assert.equal(s.a, undefined);
  near(s.b, 25);
  near(s.h, 75);
});

test("no ads on a phone page that already shows two paid placements", () => {
  const s = shares([ad("a", 100), house("h")], "sov", { adsAllowed: false });
  assert.equal(s.h, 100);
});

test("rotation splits every sponsored position between the booked ads", () => {
  assert.equal(rotationModeFor("listing_grid"), "rotation");
  assert.equal(rotationModeFor("home_hero"), "sov");
  const s = shares([ad("a", 25), ad("b", 25), house("h")], "rotation");
  near(s.a, 50);
  near(s.b, 50);
  assert.equal(s.h, undefined);
  assert.equal(s.empty, undefined);
});

test("a second grid position never repeats the first one's creative", () => {
  const candidates = [ad("a", 25), house("h")];
  const first = pickSlot(candidates, "rotation", { random: 0.1 });
  const second = pickSlot(candidates, "rotation", {
    random: 0.1,
    exclude: new Set([first.id]),
  });
  assert.equal(first.id, "a");
  assert.equal(second.id, "h");
  const third = pickSlot(candidates, "rotation", {
    random: 0.1,
    exclude: new Set(["a", "h"]),
  });
  assert.equal(third, null);
});

test("stacked slots keep every editorial banner and add at most one ad first", () => {
  const candidates = [house("h1"), ad("a", 25), house("h2"), ad("b", 25)];
  const drawn = pickAd(candidates, "sov", { random: 0.1 });
  assert.deepEqual(
    stackSlot(candidates, drawn).map((c) => c.id),
    [drawn.id, "h1", "h2"],
  );
  assert.deepEqual(
    stackSlot(candidates, null).map((c) => c.id),
    ["h1", "h2"],
  );
  assert.equal(isDeterministic([house("h1")]), true);
  assert.equal(isDeterministic(candidates), false);
});

test("sponsored cards: after every 8th listing, at most 2, short pages at the end", () => {
  assert.deepEqual(sponsoredGridPositions(0), []);
  assert.deepEqual(sponsoredGridPositions(1), [1]);
  assert.deepEqual(sponsoredGridPositions(6), [6]);
  assert.deepEqual(sponsoredGridPositions(7), [7]);
  assert.deepEqual(sponsoredGridPositions(8), [8]);
  assert.deepEqual(sponsoredGridPositions(9), [8]);
  assert.deepEqual(sponsoredGridPositions(12), [8]);
  assert.deepEqual(sponsoredGridPositions(16), [8, 16]);
  assert.deepEqual(sponsoredGridPositions(40), [8, 16]);
  assert.equal(MAX_SPONSORED_PER_PAGE, 2);

  const nine = interleaveSponsored([1, 2, 3, 4, 5, 6, 7, 8, 9], (i) => `S${i}`);
  assert.deepEqual(nine, [1, 2, 3, 4, 5, 6, 7, 8, "S0", 9]);
  const six = interleaveSponsored([1, 2, 3, 4, 5, 6], (i) => `S${i}`);
  assert.deepEqual(six, [1, 2, 3, 4, 5, 6, "S0"]);
  assert.deepEqual(
    interleaveSponsored([], (i) => `S${i}`),
    [],
  );
});

test("the rate card only names real placements and sold SOV tiers", () => {
  const placements = new Set(BANNER_PLACEMENT_IDS);
  for (const slot of RATE_CARD_SLOTS) {
    assert.ok(
      placements.has(slot.placement),
      `${slot.placement} is not a placement`,
    );
    if (slot.sov === null) {
      assert.ok(
        ROTATION_PLACEMENTS.includes(slot.placement),
        `${slot.placement} sold by rotation but rotates by SOV`,
      );
    } else {
      assert.ok(SOV_TIERS.includes(slot.sov), `${slot.sov} is not a tier`);
    }
  }
  for (const pkg of RATE_CARD_PACKAGES) {
    for (const item of pkg.items) {
      if ("native" in item) continue;
      assert.ok(
        placements.has(item.placement),
        `${pkg.code}: ${item.placement}`,
      );
    }
  }
  // §2 and §5 prices, as the owner's document prints them.
  assert.deepEqual(
    RATE_CARD_SLOTS.map((s) => s.priceGel),
    [250, 450, 750, 180, 320, 550, 120, 210, 90, 150, 270, 100, 80],
  );
  assert.deepEqual(
    RATE_CARD_PACKAGES.map((p) => [p.name, p.priceGel]),
    [
      ["START", 180],
      ["GROWTH", 300],
      ["PREMIUM", 550],
      ["DOMINANCE", 1050],
      ["SEASON TAKEOVER", 1500],
    ],
  );
  assert.equal(rateCardSlot("home_hero", 50)?.priceGel, 450);
  assert.equal(rateCardSlot("listing_grid", 25)?.priceGel, 90);
  assert.equal(rateCardSlot("footer_leaderboard", 25), null);
});

// The SQL side: the CHECKs on ads and the capacity trigger must agree with
// these constants, or the form offers a value the database refuses.
const dir = new URL("../../supabase/migrations/", import.meta.url);
const newest = (pattern) => {
  const file = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => pattern.test(readFileSync(new URL(f, dir), "utf8")))
    .at(-1);
  assert.ok(file, `no migration matches ${pattern}`);
  return readFileSync(new URL(file, dir), "utf8");
};

test("ads CHECKs and the capacity trigger match the rotation constants", () => {
  const sql = newest(/ads_sov_percent_check/);
  const sov = sql.match(
    /ads_sov_percent_check\s+check\s*\(\s*sov_percent\s+in\s*\(([^)]*)\)/i,
  );
  assert.ok(sov, "sov CHECK not found");
  assert.deepEqual(
    sov[1].split(",").map((v) => Number(v.trim())),
    [...SOV_TIERS],
  );
  const prio = sql.match(
    /ads_priority_check\s+check\s*\(\s*priority\s+between\s+(\d+)\s+and\s+(\d+)/i,
  );
  assert.deepEqual(
    [Number(prio[1]), Number(prio[2])],
    [AD_PRIORITY_MIN, AD_PRIORITY_MAX],
  );
  const cap = sql.match(/frequency_cap_per_day\s+between\s+1\s+and\s+(\d+)/i);
  assert.equal(Number(cap[1]), FREQUENCY_CAP_MAX);
  const dflt = sql.match(
    /sov_percent\s+smallint\s+not\s+null\s+default\s+(\d+)/i,
  );
  assert.equal(Number(dflt[1]), DEFAULT_SOV);

  const trigger = newest(/function public\.ads_enforce_slot_capacity\(/);
  const rotation = trigger.match(/new\.placement\s+in\s*\(([^)]*)\)/i);
  assert.ok(rotation, "rotation list not found in the capacity trigger");
  assert.deepEqual(
    [...rotation[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]),
    [...ROTATION_PLACEMENTS],
  );
});

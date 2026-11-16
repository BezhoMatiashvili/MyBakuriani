import { test } from "node:test";
import assert from "node:assert/strict";
import { DOT_SIZE, layoutPins } from "../../src/lib/maps/pin-layout.ts";

// Map pins: every listing gets its own marker and no marker covers another
// (the price pills that stacked on one coordinate hid each other).

const pin = (x, y, rank = 2, w = 70, h = 32) => ({ x, y, w, h, rank });

/** Where each marker is actually drawn, as centre + size. */
function drawn(pins, placed) {
  return pins.map((p, i) => ({
    x: p.x + placed[i].dx,
    y: p.y + placed[i].dy,
    w: placed[i].dot ? DOT_SIZE : p.w,
    h: placed[i].dot ? DOT_SIZE : p.h,
  }));
}

function assertNoOverlap(rects) {
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const apart =
        Math.abs(a.x - b.x) >= (a.w + b.w) / 2 ||
        Math.abs(a.y - b.y) >= (a.h + b.h) / 2;
      assert.ok(apart, `markers ${i} and ${j} overlap`);
    }
  }
}

function check(pins, frame) {
  const placed = layoutPins(pins, frame);
  assert.equal(placed.length, pins.length, "one placement per pin");
  assertNoOverlap(drawn(pins, placed));
  return placed;
}

test("pins that are far apart stay exactly where they are", () => {
  const placed = check([pin(0, 0), pin(200, 0), pin(0, 200), pin(300, 300)]);
  for (const p of placed) assert.deepEqual(p, { dx: 0, dy: 0, dot: false });
});

test("two listings on one coordinate: both keep a price pill", () => {
  const placed = check([pin(100, 100), pin(100, 100)]);
  assert.deepEqual(placed[0], { dx: 0, dy: 0, dot: false });
  assert.equal(placed[1].dot, false);
  assert.ok(placed[1].dx !== 0 || placed[1].dy !== 0);
});

test("three listings on one coordinate: three price pills", () => {
  const placed = check([pin(100, 100), pin(100, 100), pin(100, 100)]);
  assert.ok(placed.every((p) => !p.dot));
});

test("pills of different widths do not overlap (sale prices are wider)", () => {
  check([
    pin(50, 50, 2, 48),
    pin(60, 55, 2, 96),
    pin(70, 40, 2, 70),
    pin(55, 60, 2, 110),
  ]);
});

test("100 listings on one coordinate: all placed, none overlapping, VIP first", () => {
  const pins = Array.from({ length: 100 }, (_, i) =>
    pin(200, 200, i === 99 ? 0 : 2),
  );
  const placed = check(pins);
  assert.deepEqual(placed[99], { dx: 0, dy: 0, dot: false }); // rank 0 keeps the spot
  assert.ok(
    placed.some((p) => !p.dot),
    "some price pills fit",
  );
  assert.ok(
    placed.some((p) => p.dot),
    "the rest fall back to dots",
  );
});

test("a pill stays within reach of its true point; only dots may go further", () => {
  const placed = check(Array.from({ length: 60 }, () => pin(0, 0)));
  for (const p of placed) {
    if (!p.dot) assert.ok(Math.hypot(p.dx, p.dy) <= 2.5 * 32);
  }
});

test("one far outlier squeezes the rest into a few pixels: still no overlap", () => {
  // E.g. a listing pinned in Tbilisi: fitBounds zooms out until every
  // Bakuriani pin sits within ~20px of the others.
  const pins = [pin(5000, 4000)];
  for (let i = 0; i < 15; i++) {
    pins.push(pin((i % 5) * 4, Math.floor(i / 5) * 6));
  }
  const placed = check(pins);
  assert.deepEqual(placed[0], { dx: 0, dy: 0, dot: false });
});

test("a higher-ranked pin (VIP) keeps its true point whatever the input order", () => {
  const placed = check([pin(10, 10, 2), pin(10, 10, 2), pin(10, 10, 1)]);
  assert.deepEqual(placed[2], { dx: 0, dy: 0, dot: false });
});

test("pills are placed before dots: a dot never costs a later pill its spot", () => {
  // Same point, 40 pins: whatever fits as a pill is placed in rank order, so
  // the pin ranked last cannot be a pill while a better-ranked one is a dot.
  const pins = Array.from({ length: 40 }, (_, i) => pin(0, 0, i % 4));
  const placed = check(pins);
  const order = pins
    .map((_, i) => i)
    .sort((a, b) => pins[a].rank - pins[b].rank || a - b);
  let seenDot = false;
  for (const i of order) {
    if (placed[i].dot) seenDot = true;
    else assert.ok(!seenDot, "a pill ranked after a dot");
  }
});

test("the layout is deterministic", () => {
  const pins = Array.from({ length: 30 }, (_, i) =>
    pin((i * 7) % 40, (i * 11) % 30, i % 3),
  );
  assert.deepEqual(layoutPins(pins), layoutPins(pins));
});

test("no pins, one pin", () => {
  assert.deepEqual(layoutPins([]), []);
  assert.deepEqual(layoutPins([pin(1, 2)]), [{ dx: 0, dy: 0, dot: false }]);
});

const FRAME = { width: 280, height: 400 };
const inside = (r) =>
  r.x - r.w / 2 >= 0 &&
  r.y - r.h / 2 >= 0 &&
  r.x + r.w / 2 <= FRAME.width &&
  r.y + r.h / 2 <= FRAME.height;

test("frame: a pill on the edge is moved fully into view", () => {
  const pins = [pin(5, 200), pin(275, 395), pin(140, 2)];
  const placed = check(pins, FRAME);
  for (const r of drawn(pins, placed)) assert.ok(inside(r), "inside the frame");
});

test("frame: a stack beside the edge stays fully visible", () => {
  // The owner's case, at the right edge of the 280px panel.
  const pins = [pin(262, 200), pin(262, 200), pin(262, 200), pin(262, 200)];
  const placed = check(pins, FRAME);
  assert.ok(placed.every((p) => !p.dot));
  for (const r of drawn(pins, placed)) assert.ok(inside(r), "inside the frame");
});

test("frame: a pin panned off screen is placed freely, not dragged inside", () => {
  const pins = [pin(-500, 100), pin(-500, 100), pin(140, 200)];
  const placed = check(pins, FRAME);
  assert.deepEqual(placed[0], { dx: 0, dy: 0, dot: false });
  assert.deepEqual(placed[2], { dx: 0, dy: 0, dot: false });
});

test("frame: too many pins for it still terminates, none overlapping", () => {
  const tiny = { width: 100, height: 100 };
  const pins = Array.from({ length: 50 }, (_, i) => pin(50, 50, i % 3));
  const placed = check(pins, tiny);
  assert.equal(placed.length, 50);
});

test("frame: no usable size (not laid out yet) behaves like no frame", () => {
  const pins = [pin(0, 0), pin(0, 0)];
  assert.deepEqual(layoutPins(pins, { width: 0, height: 0 }), layoutPins(pins));
});

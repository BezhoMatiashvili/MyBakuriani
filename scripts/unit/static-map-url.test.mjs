import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fitStaticMapView,
  staticMapUrl,
} from "../../src/lib/maps/staticMapUrl.ts";

const TOKEN = "pk.test-token";
const CENTER = { lat: 41.7509, lng: 43.5294 };
const DIDVELI = { lat: 41.7375, lng: 43.4979 };

test("no token, no size, or nothing to frame -> no URL (caller keeps the placeholder)", () => {
  const pins = [CENTER];
  assert.equal(
    staticMapUrl({ token: "", width: 343, height: 420, pins }),
    null,
  );
  assert.equal(
    staticMapUrl({ token: TOKEN, width: 0, height: 420, pins }),
    null,
  );
  assert.equal(
    staticMapUrl({ token: TOKEN, width: 343, height: 420, pins: [] }),
    null,
  );
});

test("explicit view: pins drawn, view kept, @2x, attribution left on", () => {
  const url = staticMapUrl({
    token: TOKEN,
    width: 343.4,
    height: 420,
    pins: [{ ...CENTER, highlight: true }],
    view: { ...CENTER, zoom: 14 },
  });
  assert.equal(
    url,
    "https://api.mapbox.com/styles/v1/mapbox/light-v11/static/pin-s+f59e0b(43.5294,41.7509)/43.5294,41.7509,14/343x420@2x?access_token=pk.test-token",
  );
  assert.doesNotMatch(url, /logo=false|attribution=false/);
});

test("no pins but an explicit view -> bare position segment", () => {
  const url = staticMapUrl({
    token: TOKEN,
    width: 300,
    height: 200,
    pins: [],
    view: { ...CENTER, zoom: 13 },
  });
  assert.match(url, /\/static\/43\.5294,41\.7509,13\/300x200@2x\?/);
});

// Screen position of a point in a W x H static image of `view` (Web Mercator,
// 512px tiles), independent of the module's own math.
function toScreen(point, view, width, height) {
  const scale = 512 * 2 ** view.zoom;
  const x = (lng) => ((lng + 180) / 360) * scale;
  const y = (lat) => {
    const sin = Math.sin((lat * Math.PI) / 180);
    return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  };
  return {
    x: width / 2 + x(point.lng) - x(view.lng),
    y: height / 2 + y(point.lat) - y(view.lat),
  };
}

test("fit: every pin lands inside the padded band, clear of the top-right button", () => {
  for (const [w, h] of [
    [343, 420],
    [356, 240],
    [700, 420],
    [200, 150], // too short for the insets: middle half
  ]) {
    const view = fitStaticMapView([CENTER, DIDVELI], w, h);
    // Top inset 96 (button bottom 56 + pin height), bottom 40 — or the
    // middle half of a frame too short for them.
    const [top, bottom] = h - 136 >= 40 ? [96, h - 40] : [h / 4, (h * 3) / 4];
    assert.ok(view.zoom > 10 && view.zoom <= 15, `zoom ${view.zoom}`);
    const ys = [];
    for (const pin of [CENTER, DIDVELI]) {
      const { x, y } = toScreen(pin, view, w, h);
      ys.push(y);
      assert.ok(x >= 40 - 1e-6 && x <= w - 40 + 1e-6, `${w}x${h} x=${x}`);
      assert.ok(y <= bottom + 1e-6, `${w}x${h} y=${y}`);
      assert.ok(y >= top - 1e-6, `${w}x${h} y=${y}`);
    }
    // The band is used fully in one axis (the fit is tight, not just safe).
    const { x: x1 } = toScreen(CENTER, view, w, h);
    const { x: x2 } = toScreen(DIDVELI, view, w, h);
    const tightX = Math.abs(x1 - x2) >= w - 80 - 1e-3;
    const tightY = Math.abs(ys[0] - ys[1]) >= bottom - top - 1e-3;
    assert.ok(tightX || tightY || view.zoom === 15, `${w}x${h} not tight`);
  }

  const same = fitStaticMapView([CENTER, CENTER], 343, 420);
  assert.equal(same.zoom, 15);
  assert.ok(Math.abs(same.lng - CENTER.lng) < 1e-9);
  // A lone point is drawn 28px below center (inside the band), not under the button.
  const { y } = toScreen(CENTER, same, 343, 420);
  assert.ok(Math.abs(y - (420 / 2 + 28)) < 1e-6, `y=${y}`);
});

test("invalid coordinates are skipped, size and pin count are capped", () => {
  const pins = [
    { lat: Number.NaN, lng: 43.5 },
    { lat: 95, lng: 43.5 },
    ...Array.from({ length: 200 }, (_, i) => ({
      lat: 41.74 + i * 0.0001,
      lng: 43.52,
    })),
  ];
  const url = staticMapUrl({ token: TOKEN, width: 4000, height: 420, pins });
  assert.match(url, /\/1280x420@2x\?/);
  assert.equal(url.match(/pin-s\+/g).length, 80);
  assert.doesNotMatch(url, /NaN|,95\)/);
  assert.ok(url.length < 8192);
});

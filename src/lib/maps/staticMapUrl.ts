// Mapbox Static Images API URL for BakurianiMap's phone preview: a real
// picture of the map instead of an empty placeholder, without mounting
// mapbox-gl (heavy on phones, and its canvas traps one-finger page scroll).
//
// Pure and dependency-free so scripts/unit can import it directly.
// Never add `logo=false` / `attribution=false`: the image's built-in Mapbox
// wordmark and © Mapbox © OpenStreetMap text are the ToS attribution.
// The host must stay in CSP img-src (src/middleware.ts) — contract C6.

export interface StaticMapPin {
  lat: number;
  lng: number;
  /** VIP / SUPER VIP — amber pin, matching the interactive map's VIP border. */
  highlight?: boolean;
}

export interface StaticMapView {
  lat: number;
  lng: number;
  zoom: number;
}

export interface StaticMapOptions {
  token: string;
  /** Rendered size in CSS px; the image is requested at @2x. */
  width: number;
  height: number;
  pins: StaticMapPin[];
  /** Explicit view. Omitted: fit every pin, like the interactive fitBounds. */
  view?: StaticMapView;
}

const STYLE = "mapbox/light-v11"; // BakurianiMap's MAPBOX_STYLE
const MAX_SIDE = 1280; // API limit per side (before @2x)
const MAX_PINS = 80; // keeps the URL well under the API's 8192-char cap
// Same as the interactive map's fitBounds({ padding: 40, maxZoom: 15 }),
// except the top, which also clears BakurianiMap's top-right expand button
// (12px inset + 44px) and the ~35px pin standing on each point.
const FIT_PADDING = 40;
const FIT_PADDING_TOP = 96;
const FIT_MAX_ZOOM = 15;
const TILE_SIZE = 512; // mapbox-gl / Static Images zoom scale

function isValidPin(pin: StaticMapPin): boolean {
  return (
    Number.isFinite(pin.lat) &&
    Number.isFinite(pin.lng) &&
    Math.abs(pin.lat) <= 85 &&
    Math.abs(pin.lng) <= 180
  );
}

function mercatorX(lng: number): number {
  return (lng + 180) / 360;
}

function mercatorY(lat: number): number {
  const sin = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
}

function latFromMercatorY(y: number): number {
  return (360 / Math.PI) * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - 90;
}

const MIN_BAND = 40;

/** Pixel range [start, end] the pins fit in along one side: inside the
 * insets, or the middle half when the frame is too small for them. */
function fitBand(size: number, startInset: number, endInset: number) {
  return size - startInset - endInset >= MIN_BAND
    ? [startInset, size - endInset]
    : [size / 4, (size * 3) / 4];
}

/** Center + zoom that fits every pin, capped like the interactive map. */
export function fitStaticMapView(
  pins: StaticMapPin[],
  width: number,
  height: number,
): StaticMapView {
  const xs = pins.map((pin) => mercatorX(pin.lng));
  const ys = pins.map((pin) => mercatorY(pin.lat));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const [left, right] = fitBand(width, FIT_PADDING, FIT_PADDING);
  const [top, bottom] = fitBand(height, FIT_PADDING_TOP, FIT_PADDING);
  const zoomX =
    maxX > minX
      ? Math.log2((right - left) / (TILE_SIZE * (maxX - minX)))
      : Infinity;
  const zoomY =
    maxY > minY
      ? Math.log2((bottom - top) / (TILE_SIZE * (maxY - minY)))
      : Infinity;
  const zoom = Math.max(0, Math.min(zoomX, zoomY, FIT_MAX_ZOOM));
  // The band is off-center vertically (bigger top inset): move the map
  // center north by that offset so the pins land in the band's middle.
  const bandOffset =
    ((top + bottom) / 2 - height / 2) / (TILE_SIZE * 2 ** zoom);
  return {
    lng: ((minX + maxX) / 2) * 360 - 180,
    lat: latFromMercatorY((minY + maxY) / 2 - bandOffset),
    zoom,
  };
}

const coord = (value: number) => Number(value.toFixed(5));

export function staticMapUrl({
  token,
  width,
  height,
  pins,
  view,
}: StaticMapOptions): string | null {
  const w = Math.min(MAX_SIDE, Math.round(width));
  const h = Math.min(MAX_SIDE, Math.round(height));
  if (!token || w < 1 || h < 1) return null;

  const drawn = pins.filter(isValidPin).slice(0, MAX_PINS);
  const target =
    view ?? (drawn.length > 0 ? fitStaticMapView(drawn, w, h) : null);
  if (!target) return null;

  const overlay = drawn
    .map(
      (pin) =>
        `pin-s+${pin.highlight ? "f59e0b" : "2563eb"}(${coord(pin.lng)},${coord(pin.lat)})`,
    )
    .join(",");
  const position = `${coord(target.lng)},${coord(target.lat)},${Number(target.zoom.toFixed(2))}`;
  const path = overlay ? `${overlay}/${position}` : position;

  return `https://api.mapbox.com/styles/v1/${STYLE}/static/${path}/${w}x${h}@2x?access_token=${encodeURIComponent(token)}`;
}

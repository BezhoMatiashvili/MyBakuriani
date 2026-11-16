// Where each listing's marker is drawn on the interactive map, so that none
// hides another: MapboxCanvas projects every pin to screen pixels at the current
// zoom, asks for a layout here and applies the offsets.
//
// Why this exists: a price pill is ~70x32px, and listings in one building share
// coordinates (or sit a few metres apart), so zooming can never separate them.
// Every listing therefore ends up as its own marker with no overlaps, by two
// tiers:
//   1. a price pill, at its true point or the nearest free spot within
//      PILL_REACH pill-heights of it;
//   2. else a small dot (DOT_SIZE), placed at the nearest free spot, however far.
// Pills are all placed first, in `rank` order, so a dot never takes a pill's spot
// and the listings that matter most (VIP) keep their true position. A pin on
// screen is also kept fully inside the frame, never pushed half out of view.
//
// Pure and dependency-free so scripts/unit can import it directly.

export interface PinBox {
  /** Projected screen position of the listing's true point, in px. */
  x: number;
  y: number;
  /** Size of its price pill, in px. */
  w: number;
  h: number;
  /** Lower ranks are placed first (SUPER VIP 0, VIP 1, the rest 2). */
  rank: number;
}

export interface PinPlacement {
  /** From the true point to the centre of the drawn marker, in px. */
  dx: number;
  dy: number;
  /** Drawn as a DOT_SIZE dot, not a price pill. */
  dot: boolean;
}

/** Side of the square a dot occupies (also its tap target). */
export const DOT_SIZE = 24;

const PILL_GAP = 4;
const DOT_GAP = 2;
/** A pill may sit this many of its own heights away from its true point. */
const PILL_REACH = 2.5;
/** Spacing of the search rings, and the directions tried on each. */
const RING_STEP = 4;
const RING_DIRECTIONS = 24;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function collides(a: Rect, b: Rect, gap: number): boolean {
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap &&
    Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap
  );
}

/**
 * The nearest offset from (x, y) at which a w x h box clears every placed rect
 * (and, if given, lies inside `frame`), searching outwards ring by ring (up
 * first) up to `reach` px; null if none. Without a frame and with an infinite
 * reach it always finds a spot: the placed rects are finite.
 */
function nearestFree(
  { x, y, w, h }: Rect,
  placed: Rect[],
  gap: number,
  reach: number,
  frame?: PinFrame,
): { dx: number; dy: number } | null {
  const isFree = (dx: number, dy: number) =>
    (!frame ||
      (x + dx - w / 2 >= 0 &&
        y + dy - h / 2 >= 0 &&
        x + dx + w / 2 <= frame.width &&
        y + dy + h / 2 <= frame.height)) &&
    !placed.some((p) => collides({ x: x + dx, y: y + dy, w, h }, p, gap));

  if (isFree(0, 0)) return { dx: 0, dy: 0 };
  for (let r = RING_STEP; r <= reach; r += RING_STEP) {
    for (let k = 0; k < RING_DIRECTIONS; k++) {
      const angle = -Math.PI / 2 + (k * 2 * Math.PI) / RING_DIRECTIONS;
      const dx = Math.round(r * Math.cos(angle));
      const dy = Math.round(r * Math.sin(angle));
      if (isFree(dx, dy)) return { dx, dy };
    }
  }
  return null;
}

/** The visible map area, in the same px as the pins (0,0 = its top-left). */
export interface PinFrame {
  width: number;
  height: number;
}

/**
 * One placement per pin, in the order given. Deterministic. With a `frame`,
 * every pin whose true point is inside it is kept fully inside it where there
 * is room (pins outside it, panned away, are placed freely).
 */
export function layoutPins(pins: PinBox[], frame?: PinFrame): PinPlacement[] {
  const order = pins
    .map((_, i) => i)
    .sort((a, b) => pins[a].rank - pins[b].rank || a - b);
  const placed: Rect[] = [];
  const result: PinPlacement[] = new Array(pins.length);
  const needDot: number[] = [];
  const usable =
    frame && frame.width > 0 && frame.height > 0 ? frame : undefined;
  const frameFor = ({ x, y }: PinBox) =>
    usable && x >= 0 && y >= 0 && x <= usable.width && y <= usable.height
      ? usable
      : undefined;

  for (const i of order) {
    const { x, y, w, h } = pins[i];
    const spot = nearestFree(
      { x, y, w, h },
      placed,
      PILL_GAP,
      PILL_REACH * h,
      frameFor(pins[i]),
    );
    if (!spot) {
      needDot.push(i);
      continue;
    }
    placed.push({ x: x + spot.dx, y: y + spot.dy, w, h });
    result[i] = { ...spot, dot: false };
  }

  for (const i of needDot) {
    const { x, y } = pins[i];
    const dot = { x, y, w: DOT_SIZE, h: DOT_SIZE };
    const inFrame = frameFor(pins[i]);
    // Inside the frame if it has room; else anywhere (always terminates).
    const spot =
      (inFrame &&
        nearestFree(
          dot,
          placed,
          DOT_GAP,
          Math.hypot(inFrame.width, inFrame.height),
          inFrame,
        )) ||
      nearestFree(dot, placed, DOT_GAP, Infinity)!;
    placed.push({ x: x + spot.dx, y: y + spot.dy, w: DOT_SIZE, h: DOT_SIZE });
    result[i] = { ...spot, dot: true };
  }

  return result;
}

/**
 * Hotel room types (contract C45). A hotel listing (properties.type = 'hotel')
 * lists its rooms in properties.hotel_rooms. The shape and every limit below
 * equal hotel_rooms_valid() in
 * supabase/migrations/20261006100000_hotel_rooms.sql
 * (scripts/unit/hotel-rooms.test.mjs compares them). Pure module: no "@/"
 * imports, so the unit test can load it.
 */

export const MAX_HOTEL_ROOMS = 30;
export const ROOM_NAME_MAX = 60;
export const ROOM_GUESTS_MAX = 20;
export const ROOM_BEDS_MAX = 20;
export const ROOM_AREA_MAX = 1000;
export const ROOM_PRICE_MAX = 100000;
export const ROOM_QUANTITY_MAX = 500;
export const ROOM_PHOTOS_MAX = 5;

// A type alias, not an interface: the Supabase insert payload wants Json, and
// only aliases get the implicit index signature that makes them assignable.
export type HotelRoom = {
  name: string;
  guests: number;
  beds: number | null;
  area_sqm: number | null;
  /** Price per night, ₾. */
  price: number;
  /** How many rooms of this type the hotel has. */
  quantity: number;
  photos: string[];
};

/** Form state of one room: numbers as typed, plus a stable React key. */
export interface HotelRoomDraft {
  key: string;
  name: string;
  guests: string;
  beds: string;
  area: string;
  price: string;
  quantity: string;
  photos: string[];
}

export type HotelRoomProblem =
  "name" | "guests" | "beds" | "area" | "price" | "quantity";

function isIntIn(n: unknown, min: number, max: number): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;
}

/** (0, max] — the database's price and area rule. */
function isPositiveUpTo(n: unknown, max: number): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 && n <= max;
}

function isStoredPhoto(p: unknown): p is string {
  return (
    typeof p === "string" &&
    p.length > 0 &&
    p.length <= 2048 &&
    !p.startsWith("data:") &&
    !p.startsWith("blob:")
  );
}

/** Reads a stored hotel_rooms value; malformed entries are dropped. */
export function parseHotelRooms(value: unknown): HotelRoom[] {
  if (!Array.isArray(value)) return [];
  const rooms: HotelRoom[] = [];
  for (const entry of value.slice(0, MAX_HOTEL_ROOMS)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const r = entry as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!name || name.length > ROOM_NAME_MAX) continue;
    if (
      !isIntIn(r.guests, 1, ROOM_GUESTS_MAX) ||
      !isIntIn(r.quantity, 1, ROOM_QUANTITY_MAX) ||
      !isPositiveUpTo(r.price, ROOM_PRICE_MAX)
    ) {
      continue;
    }
    rooms.push({
      name,
      guests: r.guests,
      beds: isIntIn(r.beds, 1, ROOM_BEDS_MAX) ? r.beds : null,
      area_sqm: isPositiveUpTo(r.area_sqm, ROOM_AREA_MAX) ? r.area_sqm : null,
      price: r.price,
      quantity: r.quantity,
      photos: Array.isArray(r.photos)
        ? r.photos.filter(isStoredPhoto).slice(0, ROOM_PHOTOS_MAX)
        : [],
    });
  }
  return rooms;
}

export function emptyRoomDraft(key: string): HotelRoomDraft {
  return {
    key,
    name: "",
    guests: "2",
    beds: "",
    area: "",
    price: "",
    quantity: "1",
    photos: [],
  };
}

export function draftFromRoom(room: HotelRoom, key: string): HotelRoomDraft {
  return {
    key,
    name: room.name,
    guests: String(room.guests),
    beds: room.beds != null ? String(room.beds) : "",
    area: room.area_sqm != null ? String(room.area_sqm) : "",
    price: String(room.price),
    quantity: String(room.quantity),
    photos: room.photos,
  };
}

/** The stored room for a draft, or the first field that is missing/invalid. */
export function roomFromDraft(
  d: HotelRoomDraft,
): { ok: true; room: HotelRoom } | { ok: false; problem: HotelRoomProblem } {
  const name = d.name.trim();
  if (!name || name.length > ROOM_NAME_MAX)
    return { ok: false, problem: "name" };
  const guests = Number(d.guests);
  if (!d.guests.trim() || !isIntIn(guests, 1, ROOM_GUESTS_MAX))
    return { ok: false, problem: "guests" };
  const price = Number(d.price);
  if (!d.price.trim() || !isPositiveUpTo(price, ROOM_PRICE_MAX))
    return { ok: false, problem: "price" };
  const quantity = Number(d.quantity);
  if (!d.quantity.trim() || !isIntIn(quantity, 1, ROOM_QUANTITY_MAX))
    return { ok: false, problem: "quantity" };
  const beds = d.beds.trim() ? Number(d.beds) : null;
  if (beds !== null && !isIntIn(beds, 1, ROOM_BEDS_MAX))
    return { ok: false, problem: "beds" };
  const area = d.area.trim() ? Number(d.area) : null;
  if (area !== null && !isPositiveUpTo(area, ROOM_AREA_MAX))
    return { ok: false, problem: "area" };
  return {
    ok: true,
    room: {
      name,
      guests,
      beds,
      area_sqm: area,
      price,
      quantity,
      photos: d.photos.filter(isStoredPhoto).slice(0, ROOM_PHOTOS_MAX),
    },
  };
}

export type HotelRoomsCheck =
  | { ok: true; rooms: HotelRoom[] }
  /** index null = no room at all; otherwise the first invalid room. */
  | { ok: false; index: number | null; problem: HotelRoomProblem | null };

/** All drafts as stored rooms, or where the first problem is. */
export function checkHotelRoomDrafts(
  drafts: readonly HotelRoomDraft[],
): HotelRoomsCheck {
  if (drafts.length === 0) return { ok: false, index: null, problem: null };
  const rooms: HotelRoom[] = [];
  for (const [index, draft] of drafts.entries()) {
    const result = roomFromDraft(draft);
    if (!result.ok) return { ok: false, index, problem: result.problem };
    rooms.push(result.room);
  }
  return { ok: true, rooms };
}

/**
 * The listing-level numbers a hotel's rooms stand for: the cheapest room is
 * the "from" price (properties.price_per_night), rooms counts every room and
 * guests every bed place, so cards, search and the booking sidebar work
 * unchanged. Null when there are no rooms.
 */
export function hotelRoomsSummary(rooms: readonly HotelRoom[]): {
  minPrice: number;
  totalRooms: number;
  totalGuests: number;
} | null {
  if (rooms.length === 0) return null;
  return {
    minPrice: Math.min(...rooms.map((r) => r.price)),
    totalRooms: rooms.reduce((sum, r) => sum + r.quantity, 0),
    totalGuests: rooms.reduce((sum, r) => sum + r.guests * r.quantity, 0),
  };
}

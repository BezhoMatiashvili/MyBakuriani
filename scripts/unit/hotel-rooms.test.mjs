import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  MAX_HOTEL_ROOMS,
  ROOM_NAME_MAX,
  ROOM_GUESTS_MAX,
  ROOM_BEDS_MAX,
  ROOM_AREA_MAX,
  ROOM_PRICE_MAX,
  ROOM_QUANTITY_MAX,
  ROOM_PHOTOS_MAX,
  parseHotelRooms,
  emptyRoomDraft,
  draftFromRoom,
  roomFromDraft,
  checkHotelRoomDrafts,
  hotelRoomsSummary,
} from "../../src/lib/hotel-rooms.ts";

const room = (over = {}) => ({
  name: "სტანდარტული",
  guests: 2,
  price: 120,
  quantity: 3,
  ...over,
});

test("parseHotelRooms keeps valid rooms and drops malformed ones", () => {
  const parsed = parseHotelRooms([
    room({
      name: "  ლუქსი  ",
      beds: 2,
      area_sqm: 32.5,
      photos: ["https://a/x.jpg", "data:x", 5],
    }),
    room({ guests: 0 }),
    room({ price: 0 }),
    room({ name: "" }),
    room({ quantity: 1.5 }),
    "nope",
    null,
    [room()],
  ]);
  assert.deepEqual(parsed, [
    {
      name: "ლუქსი",
      guests: 2,
      beds: 2,
      area_sqm: 32.5,
      price: 120,
      quantity: 3,
      photos: ["https://a/x.jpg"],
    },
  ]);
  assert.deepEqual(parseHotelRooms(null), []);
  assert.deepEqual(parseHotelRooms({ name: "x" }), []);
});

test("parseHotelRooms caps rooms and photos", () => {
  const many = Array.from({ length: MAX_HOTEL_ROOMS + 5 }, () => room());
  assert.equal(parseHotelRooms(many).length, MAX_HOTEL_ROOMS);
  const photos = Array.from(
    { length: ROOM_PHOTOS_MAX + 3 },
    (_, i) => `https://a/${i}.jpg`,
  );
  assert.equal(
    parseHotelRooms([room({ photos })])[0].photos.length,
    ROOM_PHOTOS_MAX,
  );
  assert.equal(
    parseHotelRooms([room({ beds: "2", area_sqm: -1 })])[0].beds,
    null,
  );
});

test("roomFromDraft names the first invalid field", () => {
  const ok = { ...emptyRoomDraft("k"), name: "ორადგილიანი", price: "90" };
  assert.deepEqual(roomFromDraft(ok), {
    ok: true,
    room: {
      name: "ორადგილიანი",
      guests: 2,
      beds: null,
      area_sqm: null,
      price: 90,
      quantity: 1,
      photos: [],
    },
  });
  assert.deepEqual(roomFromDraft({ ...ok, name: "  " }), {
    ok: false,
    problem: "name",
  });
  assert.deepEqual(
    roomFromDraft({ ...ok, name: "a".repeat(ROOM_NAME_MAX + 1) }),
    { ok: false, problem: "name" },
  );
  assert.deepEqual(roomFromDraft({ ...ok, guests: "" }), {
    ok: false,
    problem: "guests",
  });
  assert.deepEqual(
    roomFromDraft({ ...ok, guests: String(ROOM_GUESTS_MAX + 1) }),
    { ok: false, problem: "guests" },
  );
  assert.deepEqual(roomFromDraft({ ...ok, price: "" }), {
    ok: false,
    problem: "price",
  });
  assert.deepEqual(roomFromDraft({ ...ok, price: "0" }), {
    ok: false,
    problem: "price",
  });
  assert.deepEqual(roomFromDraft({ ...ok, quantity: "0" }), {
    ok: false,
    problem: "quantity",
  });
  assert.deepEqual(roomFromDraft({ ...ok, beds: "1.5" }), {
    ok: false,
    problem: "beds",
  });
  assert.deepEqual(roomFromDraft({ ...ok, area: String(ROOM_AREA_MAX + 1) }), {
    ok: false,
    problem: "area",
  });
});

test("a stored room survives the draft round-trip", () => {
  const stored = {
    name: "ლუქსი",
    guests: 4,
    beds: 2,
    area_sqm: 40,
    price: 250,
    quantity: 2,
    photos: ["https://a/1.jpg"],
  };
  assert.deepEqual(roomFromDraft(draftFromRoom(stored, "k")), {
    ok: true,
    room: stored,
  });
});

test("checkHotelRoomDrafts: no rooms, first invalid room, or all rooms", () => {
  assert.deepEqual(checkHotelRoomDrafts([]), {
    ok: false,
    index: null,
    problem: null,
  });
  const good = { ...emptyRoomDraft("a"), name: "A", price: "50" };
  const bad = { ...emptyRoomDraft("b"), name: "B" };
  assert.deepEqual(checkHotelRoomDrafts([good, bad, bad]), {
    ok: false,
    index: 1,
    problem: "price",
  });
  const result = checkHotelRoomDrafts([
    good,
    { ...good, key: "c", price: "70" },
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.rooms.map((r) => r.price),
    [50, 70],
  );
});

test("hotelRoomsSummary: cheapest room, all rooms, all guests", () => {
  assert.equal(hotelRoomsSummary([]), null);
  assert.deepEqual(
    hotelRoomsSummary([
      room({ price: 150, guests: 2, quantity: 3 }),
      room({ price: 90, guests: 4, quantity: 1 }),
    ]),
    { minPrice: 90, totalRooms: 4, totalGuests: 10 },
  );
});

test("limits equal hotel_rooms_valid() in the newest migration that defines it", () => {
  const dir = new URL("../../supabase/migrations/", import.meta.url);
  const file = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) =>
      /FUNCTION public\.hotel_rooms_valid\(/.test(
        readFileSync(new URL(f, dir), "utf8"),
      ),
    )
    .at(-1);
  assert.ok(file, "no migration defines hotel_rooms_valid");
  const sql = readFileSync(new URL(file, dir), "utf8");
  const num = (re) => {
    const m = sql.match(re);
    assert.ok(m, `pattern not found in ${file}: ${re}`);
    return Number(m[1]);
  };
  assert.equal(num(/jsonb_array_length\(p\) <= (\d+)/), MAX_HOTEL_ROOMS);
  assert.equal(
    num(/char_length\(btrim\(r\.v ->> 'name'\)\) BETWEEN 1 AND (\d+)/),
    ROOM_NAME_MAX,
  );
  assert.equal(
    num(/\(r\.v ->> 'guests'\)::numeric BETWEEN 1 AND (\d+)/),
    ROOM_GUESTS_MAX,
  );
  assert.equal(
    num(/\(r\.v ->> 'beds'\)::numeric BETWEEN 1 AND (\d+)/),
    ROOM_BEDS_MAX,
  );
  assert.equal(num(/\(r\.v ->> 'area_sqm'\)::numeric <= (\d+)/), ROOM_AREA_MAX);
  assert.equal(num(/\(r\.v ->> 'price'\)::numeric <= (\d+)/), ROOM_PRICE_MAX);
  assert.equal(
    num(/\(r\.v ->> 'quantity'\)::numeric BETWEEN 1 AND (\d+)/),
    ROOM_QUANTITY_MAX,
  );
  assert.equal(
    num(/jsonb_array_length\(r\.v -> 'photos'\) <= (\d+)/),
    ROOM_PHOTOS_MAX,
  );
  const keys = sql
    .match(/\(r\.v - ARRAY\[([^\]]+)\]\)/)?.[1]
    .match(/'([a-z_]+)'/g)
    .map((k) => k.slice(1, -1));
  const written = roomFromDraft({
    ...emptyRoomDraft("k"),
    name: "x",
    price: "1",
  });
  assert.deepEqual([...keys].sort(), Object.keys(written.room).sort());
});

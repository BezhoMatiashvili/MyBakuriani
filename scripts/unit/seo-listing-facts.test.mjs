import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_LOCATION_CHARS,
  buildPropertyFacts,
  sentenceCase,
} from "../../src/lib/seo/listing-facts.ts";

const base = {
  type: "apartment",
  isForSale: false,
  location: "Didveli",
  rooms: 2,
  capacity: 4,
  areaSqm: 65,
  distanceToSlopeM: 150,
  hotelStars: null,
  price: 120,
};

test("a rental with every fact keeps them all", () => {
  assert.deepEqual(buildPropertyFacts(base), {
    kind: "rent",
    type: "apartment",
    location: "Didveli",
    rooms: 2,
    capacity: 4,
    areaSqm: 65,
    slopeM: 150,
    stars: null,
    price: 120,
  });
});

test("for sale wins over the type, and a hotel is still a rental", () => {
  assert.equal(buildPropertyFacts({ ...base, isForSale: true }).kind, "sale");
  assert.equal(buildPropertyFacts({ ...base, type: "hotel" }).kind, "rent");
});

test("unknown types are dropped, known ones kept", () => {
  assert.equal(buildPropertyFacts({ ...base, type: "castle" }).type, null);
  assert.equal(buildPropertyFacts({ ...base, type: null }).type, null);
  for (const type of [
    "flat",
    "apartment",
    "cottage",
    "villa",
    "house",
    "studio",
    "hotel",
    "land",
  ]) {
    assert.equal(buildPropertyFacts({ ...base, type }).type, type);
  }
});

test("numbers that are missing, zero, negative, NaN or absurd become null", () => {
  const empty = buildPropertyFacts({
    ...base,
    rooms: 0,
    capacity: -3,
    areaSqm: Number.NaN,
    distanceToSlopeM: Number.POSITIVE_INFINITY,
    hotelStars: 9,
    price: 0,
  });
  assert.equal(empty.rooms, null);
  assert.equal(empty.capacity, null);
  assert.equal(empty.areaSqm, null);
  assert.equal(empty.slopeM, null);
  assert.equal(empty.stars, null);
  assert.equal(empty.price, null);
  assert.equal(buildPropertyFacts({ ...base, rooms: undefined }).rooms, null);
});

test("fractions are rounded and a discounted price keeps whole lari", () => {
  const facts = buildPropertyFacts({ ...base, areaSqm: 64.6, price: 119.99 });
  assert.equal(facts.areaSqm, 65);
  assert.equal(facts.price, 120);
  assert.equal(buildPropertyFacts({ ...base, hotelStars: 4 }).stars, 4);
});

test("the area name is flattened and cut to a name's length", () => {
  assert.equal(
    buildPropertyFacts({ ...base, location: "  Didveli,\n  near   the lift " })
      .location,
    "Didveli, near the lift",
  );
  assert.equal(buildPropertyFacts({ ...base, location: "   " }).location, null);
  assert.equal(buildPropertyFacts({ ...base, location: null }).location, null);
  assert.equal(
    buildPropertyFacts({ ...base, location: "x".repeat(200) }).location.length,
    MAX_LOCATION_CHARS,
  );
});

test("a fragment opens a sentence in every script", () => {
  assert.equal(sentenceCase("from 120 ₾ per night"), "From 120 ₾ per night");
  assert.equal(sentenceCase("от 120 ₾ за ночь"), "От 120 ₾ за ночь");
  // Georgian has no case: the text is unchanged.
  assert.equal(sentenceCase("ბინა ბაკურიანში"), "ბინა ბაკურიანში");
  assert.equal(sentenceCase(""), "");
});

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildCheckIn } from "../../supabase/functions/sms-automation-run/domain.ts";

// F-V5-R8-01: properties.location_lat/lng are numeric(10,7), and a numeric NaN
// reaches sms-automation-run as the string "NaN" (PostgREST). The pin used to
// call .toFixed on it, which threw and ended the whole daily run for every
// owner after the row. A pin that is not a finite number is no pin.
const rule = { owner_phone: null };
const property = (lat, lng) => ({
  id: "property-id",
  type: "apartment",
  is_for_sale: false,
  location_lat: lat,
  location_lng: lng,
  location: "ცენტრი",
  phone: null,
  check_in_time: "15:30:00",
  title: "ნინოს ბინა",
});
const text = (lat, lng) =>
  buildCheckIn(
    {
      source: "manual",
      booking_id: "b",
      owner_id: "o",
      recipient_id: null,
      guest_phone: "+995555111111",
      guest_name: "ნინო",
      property: property(lat, lng),
    },
    rule,
    "https://mybakuriani.ge",
    true,
  );

test("a non-numeric pin never throws and reads as no pin", () => {
  const noPin = text(null, null);
  assert.ok(!noPin.includes("maps.google.com"));
  assert.ok(noPin.includes("ცენტრი"));
  for (const [lat, lng] of [
    ["NaN", "NaN"],
    ["NaN", 43.53],
    [41.75, "NaN"],
    [Number.NaN, 43.53],
    ["41.75", "43.53"],
  ]) {
    assert.equal(text(lat, lng), noPin, `${String(lat)},${String(lng)}`);
  }
});

test("a real pin is still rounded to five decimals", () => {
  assert.ok(
    text(41.7603214, 43.5301987).includes("maps.google.com/?q=41.76032,43.5302"),
  );
});

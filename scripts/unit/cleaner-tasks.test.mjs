import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fromManualTask,
  fromPlatformTask,
  keepLoadedDetails,
  listingLinkTarget,
  mergeCleanerTasks,
} from "../../src/lib/cleaner/tasks.ts";
import { propertyViewUrl } from "../../src/lib/utils/listingUrls.ts";

const platformRow = (over = {}) => ({
  id: "task-1",
  property_id: "prop-1",
  owner_id: "owner-1",
  cleaner_id: "cleaner-1",
  cleaner_service_id: "svc-1",
  service_title: "Morning clean",
  cleaning_type: "standard",
  scheduled_at: "2026-10-05T10:00:00+00:00",
  price: "50.00",
  price_unit: "საათი",
  status: "pending",
  notes: "გასაღები მეზობელთანაა",
  address: "დიდველი / კრისტალი, ბინა 14",
  created_at: "2026-10-01T08:00:00+00:00",
  started_at: null,
  completed_at: null,
  ...over,
});

const details = (over = {}) => ({
  task_id: "task-1",
  owner_name: "ტესტ მესაკუთრე",
  owner_avatar_url: "https://example.test/a.jpg",
  phone: "+995599123456",
  whatsapp: "+995599123456",
  property_id: "prop-1",
  property_title: "მაგარი ბინა",
  property_location: "დიდველი / კრისტალი",
  property_lat: 41.75,
  property_lng: 43.52,
  property_type: "studio",
  property_is_for_sale: false,
  property_is_active: true,
  property_area_sqm: 65.5,
  property_rooms: 2,
  property_bathrooms: 1,
  ...over,
});

// What the RPC returns for a declined or cancelled call-out: the row, nothing else.
const withheld = (over = {}) => ({
  task_id: "task-1",
  owner_name: null,
  owner_avatar_url: null,
  phone: null,
  whatsapp: null,
  property_id: null,
  property_title: null,
  property_location: null,
  property_lat: null,
  property_lng: null,
  property_type: null,
  property_is_for_sale: false,
  property_is_active: false,
  property_area_sqm: null,
  property_rooms: null,
  property_bathrooms: null,
  ...over,
});

const manualRow = (over = {}) => ({
  id: "manual-1",
  cleaner_id: "cleaner-1",
  client_name: "პირადი კლიენტი",
  client_phone: "+995599000111",
  address: "ბაკურიანი, 10",
  cleaning_type: "general",
  scheduled_at: "2026-10-04T09:00:00+00:00",
  price: 120,
  status: "accepted",
  notes: null,
  ...over,
});

test("a platform call-out carries the apartment, owner, number, note and price unit the cleaner needs", () => {
  const item = fromPlatformTask(platformRow(), details());
  assert.equal(item.title, "მაგარი ბინა");
  assert.equal(item.contactName, "ტესტ მესაკუთრე");
  assert.equal(item.contactPhone, "+995599123456");
  assert.equal(item.contactWhatsapp, "+995599123456");
  assert.equal(item.contactAvatar, "https://example.test/a.jpg");
  assert.equal(item.propertyLat, 41.75);
  assert.equal(item.propertyLng, 43.52);
  assert.equal(item.notes, "გასაღები მეზობელთანაა");
  assert.equal(item.price, 50);
  assert.equal(item.priceUnit, "საათი");
  assert.equal(item.serviceTitle, "Morning clean");
});

test("the apartment's own facts come through, so a studio is not mistaken for a villa", () => {
  const item = fromPlatformTask(platformRow(), details());
  assert.equal(item.propertyId, "prop-1");
  assert.equal(item.propertyType, "studio");
  assert.equal(item.propertyIsForSale, false);
  assert.equal(item.propertyIsActive, true);
  assert.equal(item.areaSqm, 65.5);
  assert.equal(item.rooms, 2);
  assert.equal(item.bathrooms, 1);
});

test("numeric columns that arrive as strings become numbers; a missing one stays null", () => {
  const item = fromPlatformTask(
    platformRow(),
    details({
      property_area_sqm: "65.50",
      property_lat: "41.7500000",
      property_lng: "43.5200000",
      property_rooms: null,
    }),
  );
  assert.equal(item.areaSqm, 65.5);
  assert.equal(item.propertyLat, 41.75);
  assert.equal(item.propertyLng, 43.52);
  assert.equal(item.rooms, null);

  const noPin = fromPlatformTask(
    platformRow(),
    details({
      property_lat: null,
      property_lng: null,
      property_area_sqm: null,
    }),
  );
  assert.equal(noPin.propertyLat, null);
  assert.equal(noPin.propertyLng, null);
  assert.equal(noPin.areaSqm, null);
});

test("the address the owner typed for this call-out wins over the listing's location", () => {
  assert.equal(
    fromPlatformTask(platformRow(), details()).address,
    "დიდველი / კრისტალი, ბინა 14",
  );
  assert.equal(
    fromPlatformTask(platformRow({ address: null }), details()).address,
    "დიდველი / კრისტალი",
  );
});

test("an address that is only the listing's area name is flagged, so the cleaner knows to ask", () => {
  // typed something more exact: not flagged
  assert.equal(
    fromPlatformTask(platformRow(), details()).addressAreaOnly,
    false,
  );
  // nothing typed (the database falls back to the listing's location): flagged
  assert.equal(
    fromPlatformTask(platformRow({ address: null }), details()).addressAreaOnly,
    true,
  );
  // the owner left the prefilled location untouched (or only added spaces): flagged
  assert.equal(
    fromPlatformTask(
      platformRow({ address: "  დიდველი / კრისტალი " }),
      details(),
    ).addressAreaOnly,
    true,
  );
  // no listing details at all: nothing to compare against, so nothing to claim
  assert.equal(fromPlatformTask(platformRow()).addressAreaOnly, false);
  assert.equal(fromManualTask(manualRow()).addressAreaOnly, false);
});

test("without owner details (RPC failed or not deployed yet) the call-out still renders and says so", () => {
  const item = fromPlatformTask(platformRow());
  assert.equal(item.detailsLoaded, false);
  assert.equal(item.title, null);
  assert.equal(item.contactName, null);
  assert.equal(item.contactPhone, null);
  assert.equal(item.propertyLat, null);
  assert.equal(listingLinkTarget(item), null);
  // what the task row itself holds is still there
  assert.equal(item.address, "დიდველი / კრისტალი, ბინა 14");
  assert.equal(item.notes, "გასაღები მეზობელთანაა");
  assert.equal(item.priceUnit, "საათი");

  assert.equal(fromPlatformTask(platformRow(), details()).detailsLoaded, true);
});

test("a declined or cancelled call-out arrives with nothing but its own row, and offers no listing link", () => {
  for (const status of ["declined", "cancelled"]) {
    const item = fromPlatformTask(platformRow({ status }), withheld());
    // the RPC answered (the row is there), it just withheld everything: not "failed to load"
    assert.equal(item.detailsLoaded, true, status);
    assert.equal(item.contactName, null, status);
    assert.equal(item.contactPhone, null, status);
    assert.equal(item.contactWhatsapp, null, status);
    assert.equal(item.title, null, status);
    assert.equal(item.propertyId, null, status);
    assert.equal(item.propertyIsActive, false, status);
    assert.equal(item.propertyLat, null, status);
    assert.equal(listingLinkTarget(item), null, status);
  }
});

test("a listing link exists only for an active listing, and points at the right public page", () => {
  const active = fromPlatformTask(platformRow(), details());
  const target = listingLinkTarget(active);
  assert.deepEqual(target, {
    id: "prop-1",
    is_for_sale: false,
    type: "studio",
  });
  assert.equal(propertyViewUrl(target), "/apartments/prop-1");

  // a draft/pending/blocked listing has no public page: no link, but the facts stay
  const draft = fromPlatformTask(
    platformRow(),
    details({ property_is_active: false }),
  );
  assert.equal(listingLinkTarget(draft), null);
  assert.equal(draft.areaSqm, 65.5);

  const hotel = fromPlatformTask(
    platformRow(),
    details({ property_type: "hotel" }),
  );
  assert.equal(propertyViewUrl(listingLinkTarget(hotel)), "/hotels/prop-1");

  const forSale = fromPlatformTask(
    platformRow(),
    details({ property_is_for_sale: true }),
  );
  assert.equal(propertyViewUrl(listingLinkTarget(forSale)), "/sales/prop-1");

  assert.equal(listingLinkTarget(fromManualTask(manualRow())), null);
});

test("mergeCleanerTasks matches details by task id only and sorts both sources chronologically", () => {
  const merged = mergeCleanerTasks(
    [
      platformRow({ id: "task-1", scheduled_at: "2026-10-05T10:00:00+00:00" }),
      platformRow({ id: "task-2", scheduled_at: "2026-10-03T10:00:00+00:00" }),
    ],
    [manualRow()],
    [
      details({ task_id: "task-1" }),
      details({ task_id: "task-9", property_title: "სხვა ბინა" }),
    ],
  );
  assert.deepEqual(
    merged.map((i) => `${i.source}:${i.id}`),
    ["platform:task-2", "manual:manual-1", "platform:task-1"],
  );
  assert.equal(merged.find((i) => i.id === "task-1").title, "მაგარი ბინა");
  // task-2 had no details of its own and must not borrow task-9's
  assert.equal(merged.find((i) => i.id === "task-2").title, null);
  assert.equal(merged.find((i) => i.id === "task-2").detailsLoaded, false);
});

test("a manual job keeps its own client details and none of the platform-only fields", () => {
  const item = fromManualTask(manualRow());
  assert.equal(item.source, "manual");
  assert.equal(item.contactName, "პირადი კლიენტი");
  assert.equal(item.contactPhone, "+995599000111");
  assert.equal(item.contactWhatsapp, null);
  assert.equal(item.propertyLat, null);
  assert.equal(item.propertyLng, null);
  assert.equal(item.priceUnit, null);
  assert.equal(item.serviceTitle, null);
  assert.equal(item.propertyId, null);
  assert.equal(item.areaSqm, null);
  // a manual job has no lookup to fail
  assert.equal(item.detailsLoaded, true);
});

test("a refetch whose details lookup failed keeps the details the cleaner already has", () => {
  // The same call-out, read once with details and then again without (the lookup failed).
  // Everything the details feed has to come back exactly as it was: a field that
  // fromPlatformTask learns from the details but this function forgets shows up here.
  for (const row of [
    platformRow(),
    platformRow({ address: null }), // the address is the listing's area, which only the details know
  ]) {
    const loaded = fromPlatformTask(row, details());
    const blank = fromPlatformTask(row);
    assert.equal(blank.detailsLoaded, false);
    assert.deepEqual(keepLoadedDetails([loaded], [blank]), [loaded]);
  }
});

test("what changed on the call-out itself comes from the new row, only the details are carried", () => {
  const loaded = fromPlatformTask(platformRow(), details());
  const next = fromPlatformTask(
    platformRow({ status: "in_progress", notes: "nova", price: "70.00" }),
  );
  const [kept] = keepLoadedDetails([loaded], [next]);
  assert.equal(kept.status, "in_progress");
  assert.equal(kept.notes, "nova");
  assert.equal(kept.price, 70);
  assert.equal(kept.title, "მაგარი ბინა");
  assert.equal(kept.contactPhone, "+995599123456");
  assert.equal(kept.detailsLoaded, true);
});

test("a call-out that never had details stays without them, so Confirm keeps waiting", () => {
  const blank = fromPlatformTask(platformRow());
  const [kept] = keepLoadedDetails([blank], [blank]);
  assert.equal(kept.detailsLoaded, false);
  assert.equal(kept.title, null);
  // ...and so does one that is new to the list
  const [fresh] = keepLoadedDetails(
    [
      fromPlatformTask(
        platformRow({ id: "task-9" }),
        details({ task_id: "task-9" }),
      ),
    ],
    [blank],
  );
  assert.equal(fresh.detailsLoaded, false);
});

test("fresh details win over carried ones, and manual jobs are never touched", () => {
  const loaded = fromPlatformTask(
    platformRow(),
    details({ phone: "+995599111111" }),
  );
  const refreshed = fromPlatformTask(
    platformRow(),
    details({ phone: "+995599222222" }),
  );
  assert.equal(
    keepLoadedDetails([loaded], [refreshed])[0].contactPhone,
    "+995599222222",
  );

  const manual = fromManualTask(manualRow());
  assert.deepEqual(keepLoadedDetails([manual], [manual]), [manual]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { propertyViewUrl, propertyEditUrl, serviceViewUrl, serviceEditUrl, ownershipVerificationUrl, shortLinkPathForPath, parseShortLinkCode, shortLinkIdRange } from "../../src/lib/utils/listingUrls.ts";
import { parseOwnershipListingParam } from "../../src/lib/ownership/document-file.ts";
import { FIXTURE_IDS } from "../../e2e/helpers/fixture-manifest.mjs";

test("property view URLs branch sale → hotel → apartment", () => {
  assert.equal(propertyViewUrl({ id: "a", is_for_sale: true, type: "hotel" }), "/sales/a");
  assert.equal(propertyViewUrl({ id: "a", type: "hotel" }), "/hotels/a");
  assert.equal(propertyViewUrl({ id: "a", type: "studio" }), "/apartments/a");
  assert.equal(propertyViewUrl({ id: "a" }, { preview: true }), "/apartments/a?preview=1");
});

test("property edit URLs go to the matching create form", () => {
  assert.equal(propertyEditUrl({ id: "a", is_for_sale: true }), "/create/sale?edit=a");
  assert.equal(propertyEditUrl({ id: "a" }), "/create/rental?edit=a");
});

test("service URLs follow the category with /services as the fallback", () => {
  assert.equal(serviceViewUrl({ id: "s", category: "food" }), "/food/s");
  assert.equal(serviceViewUrl({ id: "s", category: "cleaning" }), "/services/s");
  assert.equal(serviceViewUrl({ id: "s", category: "unknown" }, { preview: true }), "/services/s?preview=1");
  assert.equal(serviceEditUrl({ id: "s", category: "transport" }), "/create/transport?edit=s");
  assert.equal(serviceEditUrl({ id: "s", category: "handyman" }), "/create/service?edit=s");
});

test("ownership verification URLs preselect the listing and carry created/next", () => {
  assert.equal(ownershipVerificationUrl("property", "p"), "/dashboard/account/ownership?listing=property:p");
  assert.equal(
    ownershipVerificationUrl("service", "s", { created: true, next: "/dashboard/services" }),
    "/dashboard/account/ownership?listing=service:s&created=1&next=%2Fdashboard%2Fservices",
  );
  assert.equal(
    ownershipVerificationUrl("property", "p", { created: false, next: "/dashboard/renter?a=1&b=2" }),
    "/dashboard/account/ownership?listing=property:p&next=%2Fdashboard%2Frenter%3Fa%3D1%26b%3D2",
  );
});

test("the owner page parses the listing and next back out of the URL", () => {
  const id = "0b8f2c4e-1d2a-4c3b-9e8f-7a6b5c4d3e2f";
  const url = new URL(ownershipVerificationUrl("service", id, { created: true, next: "/dashboard/cleaner" }), "https://example.test");
  assert.deepEqual(parseOwnershipListingParam(url.searchParams.get("listing")), { kind: "service", id });
  assert.equal(url.searchParams.get("created"), "1");
  assert.equal(url.searchParams.get("next"), "/dashboard/cleaner");
});

// C58: the share menu hands out /l/<first 12 hex digits of the listing id>.
const LISTING_ID = "62166030-7a14-4b06-9a62-a8cd6bb1681b";
const DETAIL_KINDS = ["apartments", "hotels", "sales", "food", "services", "entertainment", "transport", "employment"];

test("a listing page shares /l/ + the first 12 hex digits of its id, keeping en/ru", () => {
  for (const kind of DETAIL_KINDS) {
    assert.equal(shortLinkPathForPath(`/${kind}/${LISTING_ID}`, "ka", "ka"), "/l/621660307a14");
    assert.equal(shortLinkPathForPath(`/en/${kind}/${LISTING_ID}`, "en", "ka"), "/en/l/621660307a14");
    assert.equal(shortLinkPathForPath(`/ru/${kind}/${LISTING_ID}`, "ru", "ka"), "/ru/l/621660307a14");
  }
  assert.equal(shortLinkPathForPath(`/apartments/${LISTING_ID.toUpperCase()}`, "ka", "ka"), "/l/621660307a14");
});

test("every other page shares its own URL", () => {
  for (const path of [
    `/blog/${LISTING_ID}`, "/blog/e2e-test-blog-e2e00001", "/apartments", "/apartments/mock-1", "/",
    `/apartments/${LISTING_ID}/extra`, `/preview/apartments/${LISTING_ID}`, `/dashboard/renter/${LISTING_ID}`,
  ]) {
    assert.equal(shortLinkPathForPath(path, "ka", "ka"), null, path);
  }
  // The prefix has to be the page's own locale.
  assert.equal(shortLinkPathForPath(`/apartments/${LISTING_ID}`, "en", "ka"), null);
  assert.equal(shortLinkPathForPath(`/english/apartments/${LISTING_ID}`, "en", "ka"), null);
  assert.equal(shortLinkPathForPath(`/en/apartments/${LISTING_ID}`, "ka", "ka"), null);
});

test("a code is read in any case and is exactly 12 hex digits", () => {
  assert.equal(parseShortLinkCode("621660307a14"), "621660307a14");
  assert.equal(parseShortLinkCode("621660307A14"), "621660307a14");
  for (const bad of ["", "621660307a1", "621660307a145", "62166030-7a1", "621660307g14", "621660307a14/", " 621660307a14"]) {
    assert.equal(parseShortLinkCode(bad), null, JSON.stringify(bad));
  }
});

test("a code covers exactly the ids that start with it", () => {
  const { from, to } = shortLinkIdRange("621660307a14");
  assert.equal(from, "62166030-7a14-0000-0000-000000000000");
  assert.equal(to, "62166030-7a14-ffff-ffff-ffffffffffff");
  assert.ok(from <= LISTING_ID && LISTING_ID <= to);
  assert.ok("62166030-7a13-ffff-ffff-ffffffffffff" < from);
  assert.ok("62166030-7a15-0000-0000-000000000000" > to);
});

test("the shared code reads back to a range holding the listing's id", () => {
  for (const id of [LISTING_ID, ...Object.values(FIXTURE_IDS)]) {
    const short = shortLinkPathForPath(`/food/${id}`, "ka", "ka");
    const { from, to } = shortLinkIdRange(parseShortLinkCode(short.slice("/l/".length)));
    assert.ok(from <= id && id <= to, id);
  }
});

// A code two public listings share sends the link home, so the e2e fixtures
// keep distinct codes. STRESS_IDS (layout stress listings) differ only in their
// last digits and share codes on purpose: their short links go home.
test("every e2e fixture id has its own short code", () => {
  const seen = new Map();
  for (const [name, id] of Object.entries(FIXTURE_IDS)) {
    const code = id.replace(/-/g, "").slice(0, 12);
    const other = seen.get(code);
    assert.ok(!other || FIXTURE_IDS[other] === id, `${name} and ${other} share the short code ${code}`);
    seen.set(code, name);
  }
});

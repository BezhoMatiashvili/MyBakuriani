import { test } from "node:test";
import assert from "node:assert/strict";
import { propertyViewUrl, propertyEditUrl, serviceViewUrl, serviceEditUrl, ownershipVerificationUrl } from "../../src/lib/utils/listingUrls.ts";
import { parseOwnershipListingParam } from "../../src/lib/ownership/document-file.ts";

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

import { test } from "node:test";
import assert from "node:assert/strict";
import { propertyViewUrl, propertyEditUrl, serviceViewUrl, serviceEditUrl } from "../../src/lib/utils/listingUrls.ts";

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

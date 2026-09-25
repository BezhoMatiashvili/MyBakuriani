import { test } from "node:test";
import assert from "node:assert/strict";
import {
  facebookShareUrl,
  shareableUrl,
  whatsappShareUrl,
} from "../../src/lib/share.ts";
import { ogCardUrlForPath } from "../../src/lib/utils/listingUrls.ts";

const ID = "4373879b-fe28-499e-bac6-70d7e693b7c7";

test("the shared URL drops the owner-preview query and the hash", () => {
  const preview = new URL(
    `https://staging.mybakuriani.ge/en/apartments/${ID}?preview=1#photos`,
  );
  assert.equal(
    shareableUrl(preview),
    `https://staging.mybakuriani.ge/en/apartments/${ID}`,
  );
});

test("Facebook and WhatsApp targets carry only the encoded page URL", () => {
  const url = `https://mybakuriani.ge/apartments/${ID}`;
  const encoded = encodeURIComponent(url);
  assert.equal(
    facebookShareUrl(url),
    `https://www.facebook.com/sharer/sharer.php?u=${encoded}`,
  );
  assert.equal(whatsappShareUrl(url), `https://wa.me/?text=${encoded}`);
});

test("the OG card URL is versioned so crawlers drop the old PNG", () => {
  assert.equal(
    ogCardUrlForPath(`/apartments/${ID}`),
    `/api/og/listing/property/${ID}?v=2`,
  );
  assert.equal(
    ogCardUrlForPath(`/food/${ID}`, "story"),
    `/api/og/listing/service/${ID}?v=2&format=story`,
  );
  assert.equal(ogCardUrlForPath(`/blog/${ID}`), null);
  assert.equal(ogCardUrlForPath("/apartments/mock-1"), null);
});

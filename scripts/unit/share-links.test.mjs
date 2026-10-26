import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

// Social-blocking filter lists hide share LINKS by href: Fanboy's Social has
// ##a[href^="https://www.facebook.com/sharer/sharer.php"] and
// ##a[href^="https://wa.me/?text="]. A phone running one showed only Copy and
// Print (2026-10-24), so the menu opens these targets from buttons instead.
test("Facebook and WhatsApp open from buttons, not links a filter list hides", () => {
  const menu = readFileSync(
    new URL("../../src/components/shared/ShareMenu.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(menu, /Menu\.LinkItem|\bhref=\{/);
  assert.match(menu, /window\.open\(target, "_blank", "noopener,noreferrer"\)/);
  for (const build of ["facebookShareUrl", "whatsappShareUrl"]) {
    assert.match(menu, new RegExp(`openInNewTab\\(${build}\\(url\\)\\)`));
  }
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

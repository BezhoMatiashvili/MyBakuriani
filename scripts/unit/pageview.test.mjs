import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePublicPageviewPath } from "../../src/lib/analytics/pageview.ts";

test("strips the locale prefix and trailing slashes", () => {
  assert.equal(normalizePublicPageviewPath("/en/apartments/abc/"), "/apartments/abc");
  assert.equal(normalizePublicPageviewPath("/ru"), "/");
  assert.equal(normalizePublicPageviewPath("/"), "/");
});

test("rejects queries, fragments, traversal and non-public roots", () => {
  assert.equal(normalizePublicPageviewPath("/apartments?x=1"), null);
  assert.equal(normalizePublicPageviewPath("/apartments#top"), null);
  assert.equal(normalizePublicPageviewPath("/apartments/../dashboard"), null);
  assert.equal(normalizePublicPageviewPath("//evil.example"), null);
  assert.equal(normalizePublicPageviewPath("/dashboard/renter"), null);
  assert.equal(normalizePublicPageviewPath("/api/track/view"), null);
  assert.equal(normalizePublicPageviewPath("relative"), null);
  assert.equal(normalizePublicPageviewPath(""), null);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AD_PREVIEW_HASH_KEY,
  adPreviewHash,
  parseAdPreviewHash,
  previewPathForSurface,
} from "../../src/lib/ad-preview.ts";
import {
  STAFF_BROWSER_KEY,
  clearStaffBrowser,
  isStaffBrowser,
  markStaffBrowser,
} from "../../src/lib/staff-browser.ts";
import { BANNER_PLACEMENTS } from "../../src/lib/banner-placements.ts";

// C47 (2026-10-11): the admin's on-site ad preview link and the "admin
// browser" flag that keeps an admin's own views out of the cap and the stats.

const ID = "0bb99a5f-b13f-43b7-90f8-762f94af7dc6";

test("the preview hash round-trips and accepts only a UUID", () => {
  assert.equal(adPreviewHash(ID), `#${AD_PREVIEW_HASH_KEY}=${ID}`);
  assert.equal(parseAdPreviewHash(adPreviewHash(ID)), ID);
  assert.equal(parseAdPreviewHash(adPreviewHash(ID).slice(1)), ID);
  assert.equal(parseAdPreviewHash(adPreviewHash(ID.toUpperCase())), ID);
  assert.equal(parseAdPreviewHash(`${adPreviewHash(ID)}&x=1`), ID);
  for (const bad of [
    "",
    "#",
    `#${AD_PREVIEW_HASH_KEY}=`,
    `#${AD_PREVIEW_HASH_KEY}=123`,
    `#${AD_PREVIEW_HASH_KEY}=javascript:alert(1)`,
    `#${AD_PREVIEW_HASH_KEY}=${ID}x`,
    `#other=${ID}`,
  ]) {
    assert.equal(parseAdPreviewHash(bad), null, bad);
  }
});

test("every placement's surface has a preview page or a row lookup", () => {
  for (const spec of BANNER_PLACEMENTS) {
    const path = previewPathForSurface(spec.surface);
    if (spec.surface === "site" || spec.surface === "home") {
      assert.equal(path, "/", spec.id);
    } else if (spec.surface === "listing") {
      assert.equal(path, "/apartments", spec.id);
    } else {
      // detail and blog pages need a real row: the preview route finds one.
      assert.equal(path, null, spec.id);
      assert.ok(["detail", "blog"].includes(spec.surface), spec.id);
    }
  }
  assert.equal(previewPathForSurface(undefined), null);
});

test("the admin-browser flag is set, read and cleared, and never throws", () => {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
  };
  try {
    assert.equal(STAFF_BROWSER_KEY, "mybakuriani:staff_browser");
    assert.equal(isStaffBrowser(), false);
    markStaffBrowser();
    assert.equal(store.get(STAFF_BROWSER_KEY), "1");
    assert.equal(isStaffBrowser(), true);
    store.set(STAFF_BROWSER_KEY, "yes");
    assert.equal(isStaffBrowser(), false);
    markStaffBrowser();
    clearStaffBrowser();
    assert.equal(isStaffBrowser(), false);

    // Blocked storage (private mode, policy): a visitor, and no exception.
    globalThis.window = {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
        removeItem: () => {
          throw new Error("blocked");
        },
      },
    };
    assert.doesNotThrow(() => markStaffBrowser());
    assert.doesNotThrow(() => clearStaffBrowser());
    assert.equal(isStaffBrowser(), false);
  } finally {
    delete globalThis.window;
  }
  // Server render: no window at all.
  assert.equal(isStaffBrowser(), false);
  assert.doesNotThrow(() => markStaffBrowser());
});

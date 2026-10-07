// Admin analytics (C49): the five traffic-source buckets of spec §4 and the
// device classes of spec §8.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifySource,
  hasExternalSignal,
  isOwnHost,
  normalizeHost,
} from "../../src/lib/analytics/traffic-source.ts";
import { classifyDevice } from "../../src/lib/analytics/device.ts";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const IPAD_OLD =
  "Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1";
const ANDROID_PHONE =
  "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const ANDROID_TABLET =
  "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const INSTAGRAM_APP = `${IPHONE} Instagram 350.0.0.0.0 (iPhone15,2; iOS 18_0; ka_GE)`;
const FACEBOOK_APP = `${IPHONE} [FBAN/FBIOS;FBAV/480.0.0.0;FBBV/1;FBDV/iPhone15,2]`;

const signals = (patch = {}) => ({
  referrerHost: null,
  utmSource: null,
  gclid: false,
  fbclid: false,
  userAgent: WINDOWS,
  ...patch,
});

test("referrer hosts are normalized and the site's own hosts recognized", () => {
  assert.equal(
    normalizeHost("https://www.Google.com/search?q=bakuriani"),
    "google.com",
  );
  assert.equal(normalizeHost("l.facebook.com"), "l.facebook.com");
  assert.equal(
    normalizeHost("android-app://com.google.android.gm/"),
    "com.google.android.gm",
  );
  assert.equal(normalizeHost("localhost"), "localhost");
  for (const bad of ["", "   ", "nohost", "http://[::1]/", 42, null]) {
    assert.equal(normalizeHost(bad), null, String(bad));
  }
  for (const own of [
    "mybakuriani.ge",
    "staging.mybakuriani.ge",
    "mybakuriani.com",
    "mybakuriani.com.ge",
    "mybakuriani-staging-abc.ondigitalocean.app",
    "localhost",
  ]) {
    assert.ok(isOwnHost(own), own);
  }
  for (const other of [
    "google.com",
    "notmybakuriani.ge",
    "mybakuriani.ge.evil.com",
  ]) {
    assert.ok(!isOwnHost(other), other);
  }
});

test("classifySource: campaign tag, click ids, in-app browsers, referrer, direct", () => {
  const cases = [
    [{ utmSource: "facebook", referrerHost: "google.com" }, "facebook"],
    [{ utmSource: "IG" }, "instagram"],
    [{ utmSource: "instagram_story" }, "instagram"],
    [{ utmSource: "google" }, "google"],
    [{ utmSource: "newsletter" }, "referral"],
    [{ utmSource: "fb-ads" }, "facebook"],
    [{ utmSource: "google_ads" }, "google"],
    [{ utmSource: "igloo" }, "referral"],
    [{ utmSource: "metasearch" }, "referral"],
    [{ gclid: true }, "google"],
    [{ fbclid: true }, "facebook"],
    [{ fbclid: true, userAgent: INSTAGRAM_APP }, "instagram"],
    [{ userAgent: INSTAGRAM_APP }, "instagram"],
    [{ userAgent: FACEBOOK_APP }, "facebook"],
    [{ referrerHost: "google.com" }, "google"],
    [{ referrerHost: "google.com.ge" }, "google"],
    [{ referrerHost: "google.co.uk" }, "google"],
    [{ referrerHost: "googleadservices.com" }, "google"],
    [{ referrerHost: "instagram.com" }, "instagram"],
    [{ referrerHost: "l.instagram.com" }, "instagram"],
    [{ referrerHost: "m.facebook.com" }, "facebook"],
    [{ referrerHost: "fb.me" }, "facebook"],
    [{ referrerHost: "bing.com" }, "referral"],
    [{ referrerHost: "booking.com" }, "referral"],
    [{ referrerHost: "mybakuriani.ge" }, "direct"],
    [{}, "direct"],
  ];
  for (const [patch, expected] of cases) {
    assert.equal(
      classifySource(signals(patch)),
      expected,
      JSON.stringify(patch),
    );
  }
});

test("only an outside signal starts a new session", () => {
  assert.equal(hasExternalSignal(signals()), false);
  assert.equal(
    hasExternalSignal(signals({ referrerHost: "mybakuriani.ge" })),
    false,
  );
  assert.equal(
    hasExternalSignal(signals({ referrerHost: "google.com" })),
    true,
  );
  assert.equal(hasExternalSignal(signals({ utmSource: "facebook" })), true);
  assert.equal(hasExternalSignal(signals({ utmSource: "  " })), false);
  assert.equal(hasExternalSignal(signals({ gclid: true })), true);
  assert.equal(hasExternalSignal(signals({ fbclid: true })), true);
  // An in-app browser alone is not a new arrival: every page of the visit
  // carries the same User-Agent.
  assert.equal(hasExternalSignal(signals({ userAgent: INSTAGRAM_APP })), false);
});

test("classifyDevice: phones, tablets (iPadOS included), desktops", () => {
  assert.equal(classifyDevice(IPHONE), "mobile");
  assert.equal(classifyDevice(ANDROID_PHONE), "mobile");
  assert.equal(classifyDevice(ANDROID_TABLET), "tablet");
  assert.equal(classifyDevice(IPAD_OLD), "tablet");
  assert.equal(classifyDevice(IPAD_DESKTOP_UA, 5), "tablet");
  assert.equal(classifyDevice(IPAD_DESKTOP_UA, 0), "desktop");
  assert.equal(classifyDevice(IPAD_DESKTOP_UA), "desktop");
  assert.equal(classifyDevice(WINDOWS, 10), "desktop");
  assert.equal(classifyDevice(null), "desktop");
  assert.equal(classifyDevice(""), "desktop");
  assert.equal(
    classifyDevice(
      "Mozilla/5.0 (Linux; Android 11; KFTRWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/120.4.1 like Chrome/120.0.0.0 Safari/537.36",
    ),
    "tablet",
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cookieQuestionPending,
  hasAnalyticsConsent,
  hasMarketingConsent,
  parseCookieConsent,
  serializeCookieConsent,
} from "../../src/lib/consent/cookies.ts";

// The Meta Pixel's consent field (C59, C38). consent.test.mjs keeps pinning
// the strings of a build without the Pixel; this file adds what a Pixel build
// writes and reads.

test("marketing is written between analytics and location, only as a boolean", () => {
  assert.equal(
    serializeCookieConsent({
      analytics: true,
      marketing: true,
      location: true,
    }),
    "v2|analytics=1|marketing=1|location=1",
  );
  assert.equal(
    serializeCookieConsent({
      analytics: false,
      marketing: false,
      location: null,
    }),
    "v2|analytics=0|marketing=0",
  );
  assert.equal(
    serializeCookieConsent({
      analytics: true,
      marketing: null,
      location: false,
    }),
    "v2|analytics=1|location=0",
  );
  assert.equal(
    serializeCookieConsent({ analytics: true, location: null }),
    "v2|analytics=1",
  );
  // The longest value stays far under the 128-character cap.
  assert.ok(
    serializeCookieConsent({ analytics: true, marketing: true, location: true })
      .length <= 38,
  );
});

test("the parse result has a marketing key only when the cookie has the field", () => {
  assert.deepEqual(parseCookieConsent("v2|analytics=1|location=0"), {
    analytics: true,
    location: false,
  });
  assert.deepEqual(
    parseCookieConsent("v2|analytics=1|marketing=1|location=0"),
    {
      analytics: true,
      location: false,
      marketing: true,
    },
  );
  assert.deepEqual(parseCookieConsent("v2|marketing=0|analytics=0"), {
    analytics: false,
    location: null,
    marketing: false,
  });
  assert.deepEqual(parseCookieConsent("v2|analytics=1|marketing=yes"), {
    analytics: true,
    location: null,
    marketing: null,
  });
});

test("only marketing=1 is Meta consent", () => {
  assert.equal(hasMarketingConsent("v2|analytics=1|marketing=1"), true);
  for (const raw of [
    null,
    "",
    "v2|analytics=1",
    "v1|analytics=1",
    "v2|analytics=1|marketing=0",
    "v2|analytics=1|marketing=yes",
    "v2|marketing=1",
    "v3|analytics=1|marketing=1",
  ]) {
    assert.equal(hasMarketingConsent(raw), false, `raw=${raw}`);
  }
  // Analytics is read exactly as before.
  assert.equal(hasAnalyticsConsent("v2|analytics=1|marketing=0"), true);
});

test("the re-ask: once for an old analytics yes, never for a decline, never without the Pixel", () => {
  const p = (raw, metaOn) =>
    cookieQuestionPending(parseCookieConsent(raw), metaOn);
  // No answer: always asked, with or without the Pixel.
  assert.equal(p(null, true), true);
  assert.equal(p(null, false), true);
  // Pixel build.
  assert.equal(p("v1|analytics=1", true), true);
  assert.equal(p("v2|analytics=1", true), true);
  assert.equal(p("v2|analytics=1|location=1", true), true);
  assert.equal(p("v2|analytics=1|marketing=yes", true), true);
  assert.equal(p("v2|analytics=0", true), false);
  assert.equal(p("v2|analytics=0|marketing=0", true), false);
  assert.equal(p("v2|analytics=1|marketing=1", true), false);
  assert.equal(p("v2|analytics=1|marketing=0", true), false);
  // No Pixel: exactly the old rule (only an unanswered cookie opens it).
  for (const raw of [
    "v1|analytics=1",
    "v2|analytics=1",
    "v2|analytics=0",
    "v2|analytics=1|marketing=1",
  ]) {
    assert.equal(p(raw, false), false, raw);
  }
});

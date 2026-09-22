import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONSENT_COOKIE_NAME,
  hasAnalyticsConsent,
  parseCookieConsent,
  readCookieValue,
  serializeCookieConsent,
} from "../../src/lib/consent/cookies.ts";
import {
  hasAcceptedRequiredPolicies,
  marketingChannelAllowed,
} from "../../src/lib/consent/channels.ts";

test("cookie consent round-trips both answers", () => {
  assert.equal(serializeCookieConsent({ analytics: true }), "v1|analytics=1");
  assert.equal(serializeCookieConsent({ analytics: false }), "v1|analytics=0");
  assert.deepEqual(parseCookieConsent("v1|analytics=1"), { analytics: true });
  assert.deepEqual(parseCookieConsent("v1|analytics=0"), { analytics: false });
});

test("an unanswered or unreadable cookie is never treated as consent", () => {
  // null means "not answered" and must never default to yes.
  for (const raw of [
    null,
    undefined,
    "",
    "garbage",
    "v2|analytics=1", // future version this build cannot interpret
    "v1|analytics=yes",
    "v1|",
    "v1|other=1",
    `v1|analytics=${"1".repeat(200)}`, // over the length cap
  ]) {
    assert.equal(parseCookieConsent(raw), null, `raw=${raw}`);
    assert.equal(hasAnalyticsConsent(raw), false, `raw=${raw}`);
  }
  // Declining is an answer, but still not consent.
  assert.equal(hasAnalyticsConsent("v1|analytics=0"), false);
  assert.equal(hasAnalyticsConsent("v1|analytics=1"), true);
});

test("readCookieValue picks the right cookie out of a jar", () => {
  const jar = `foo=1; ${CONSENT_COOKIE_NAME}=v1%7Canalytics%3D1; bar=2`;
  assert.equal(readCookieValue(jar, CONSENT_COOKIE_NAME), "v1|analytics=1");
  assert.equal(readCookieValue(jar, "foo"), "1");
  assert.equal(readCookieValue(jar, "missing"), null);
  assert.equal(readCookieValue("", CONSENT_COOKIE_NAME), null);
  assert.equal(readCookieValue(null, CONSENT_COOKIE_NAME), null);
  // A name that is only a prefix of a present cookie must not match.
  assert.equal(readCookieValue("mb_cookie_consent_x=1", CONSENT_COOKIE_NAME), null);
});

test("marketing consent is affirmative opt-in, not opt-out", () => {
  // This is the whole point of the tri-state: `null` (never answered) and
  // `false` (declined) both deny. Only an explicit true allows a send.
  assert.equal(marketingChannelAllowed({ marketing_sms_consent: true }, "sms"), true);
  assert.equal(marketingChannelAllowed({ marketing_sms_consent: false }, "sms"), false);
  assert.equal(marketingChannelAllowed({ marketing_sms_consent: null }, "sms"), false);
  assert.equal(marketingChannelAllowed({}, "sms"), false);
  assert.equal(marketingChannelAllowed(null, "sms"), false);
  assert.equal(marketingChannelAllowed(undefined, "sms"), false);
});

test("each channel reads its own column", () => {
  const profile = {
    marketing_sms_consent: true,
    marketing_email_consent: false,
    push_consent: null,
  };
  assert.equal(marketingChannelAllowed(profile, "sms"), true);
  assert.equal(marketingChannelAllowed(profile, "email"), false);
  assert.equal(marketingChannelAllowed(profile, "push"), false);
});

test("the blocking gate needs BOTH terms and privacy", () => {
  const stamp = "2026-09-22T10:00:00Z";
  assert.equal(
    hasAcceptedRequiredPolicies({
      terms_accepted_at: stamp,
      privacy_accepted_at: stamp,
    }),
    true,
  );
  assert.equal(
    hasAcceptedRequiredPolicies({ terms_accepted_at: stamp, privacy_accepted_at: null }),
    false,
  );
  assert.equal(
    hasAcceptedRequiredPolicies({ terms_accepted_at: null, privacy_accepted_at: stamp }),
    false,
  );
  assert.equal(hasAcceptedRequiredPolicies({}), false);
  assert.equal(hasAcceptedRequiredPolicies(null), false);
  // Marketing consent is irrelevant to the gate.
  assert.equal(
    hasAcceptedRequiredPolicies({
      terms_accepted_at: stamp,
      privacy_accepted_at: stamp,
      marketing_sms_consent: false,
    }),
    true,
  );
});

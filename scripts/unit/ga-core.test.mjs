import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GA_EVENTS,
  gaCookieNames,
  gaEventParams,
  isGaEventName,
} from "../../src/lib/ga/core.ts";
import { gaMeasurementIdFrom } from "../../src/lib/ga/measurement-id.ts";
import {
  cleanTrackedReferrer,
  cleanTrackedUrl,
  cookieDeletions,
  metaCookieDeletions,
} from "../../src/lib/meta/core.ts";
import {
  cookieQuestionPending,
  hasGaConsent,
  parseCookieConsent,
  serializeCookieConsent,
} from "../../src/lib/consent/cookies.ts";

const O = "https://mybakuriani.ge";

test("measurement id: only a G- id turns GA on", () => {
  assert.equal(gaMeasurementIdFrom("G-8YX1DG56R1"), "G-8YX1DG56R1");
  assert.equal(gaMeasurementIdFrom(" g-8yx1dg56r1 "), "G-8YX1DG56R1");
  for (const bad of [undefined, null, "", "UA-1234-1", "GTM-NC6GGSM5", "G-", "G-abc<script>", "1101874889499231"]) {
    assert.equal(gaMeasurementIdFrom(bad), null, String(bad));
  }
});

test("event catalog and parameters: names only, no ids or free text", () => {
  assert.deepEqual(Object.keys(GA_EVENTS).sort(), [
    "add_to_wishlist",
    "contact_click",
    "contact_reveal",
    "job_application",
    "sign_up",
    "smart_match_request",
  ]);
  assert.equal(isGaEventName("page_view"), false);
  assert.equal(isGaEventName("toString"), false);
  assert.deepEqual(gaEventParams("contact_click", { channel: "call", listing_type: "property" }), { channel: "call", listing_type: "property" });
  assert.deepEqual(gaEventParams("contact_reveal", { channel: "sms", listing_type: "x", phone: "+995555" }), {});
  assert.deepEqual(gaEventParams("sign_up", { channel: "call" }), {});
  assert.deepEqual(gaCookieNames("G-8YX1DG56R1"), ["_ga", "_ga_8YX1DG56R1"]);
});

test("cleanTrackedUrl keeps public pages, utm, click ids and filters", () => {
  assert.equal(cleanTrackedUrl(`${O}/`), `${O}/`);
  assert.equal(cleanTrackedUrl(`${O}/en/apartments`), `${O}/en/apartments`);
  assert.equal(cleanTrackedUrl(`${O}/apartments?utm_source=fb&gclid=abc.1`), `${O}/apartments?utm_source=fb&gclid=abc.1`);
  assert.equal(cleanTrackedUrl(`${O}/search?mode=rent&guests=4&q=ლიფტთან`), `${O}/search?mode=rent&guests=4`);
  assert.equal(cleanTrackedUrl(`${O}/apartments#photos`), `${O}/apartments`);
});

test("cleanTrackedUrl cuts token pages to their root and drops free text", () => {
  assert.equal(cleanTrackedUrl(`${O}/auth/reset-password?token_hash=SECRET&type=recovery`), `${O}/auth/reset-password`);
  assert.equal(cleanTrackedUrl(`${O}/ka/auth/confirm?token_hash=SECRET&type=email`), `${O}/auth/confirm`);
  assert.equal(cleanTrackedUrl(`${O}/sms-stop/abcdef0123456789`), `${O}/sms-stop`);
  assert.equal(cleanTrackedUrl(`${O}/review/TOKEN`), `${O}/review`);
  assert.equal(cleanTrackedUrl(`${O}/join/CODE`), `${O}/join`);
  assert.equal(cleanTrackedUrl(`${O}/l/0123456789ab`), `${O}/l`);
  assert.equal(cleanTrackedUrl(`${O}/auth/callback?code=SECRET`), `${O}/auth/callback`);
  assert.equal(cleanTrackedUrl(`${O}/dashboard/renter?task=uuid&email=a@b.ge`), `${O}/dashboard/renter`);
  assert.equal(cleanTrackedUrl(`${O}/auth/login?next=/dashboard&email=a@b.ge`), `${O}/auth/login`);
  for (const href of [`${O}/x?token=1`, `${O}/search?phone=599`]) assert.doesNotMatch(cleanTrackedUrl(href), /token|phone|599/);
  assert.equal(cleanTrackedUrl("javascript:alert(1)"), null);
  assert.equal(cleanTrackedUrl("not a url"), null);
  assert.equal(cleanTrackedUrl(""), null);
});

test("cleanTrackedReferrer: other sites to their origin, ours cleaned", () => {
  assert.equal(cleanTrackedReferrer("", O), "");
  assert.equal(cleanTrackedReferrer("https://www.google.com/search?q=bakuriani", O), "https://www.google.com/");
  assert.equal(cleanTrackedReferrer("https://l.facebook.com/l.php?u=x&h=y", O), "https://l.facebook.com/");
  assert.equal(cleanTrackedReferrer(`${O}/auth/reset-password?token_hash=SECRET`, O), `${O}/auth/reset-password`);
  assert.equal(cleanTrackedReferrer(`${O}/search?q=name`, O), `${O}/search`);
  assert.equal(cleanTrackedReferrer("android-app://com.google", O), "");
});

test("cookieDeletions generalises the Meta deletions", () => {
  assert.deepEqual(metaCookieDeletions("mybakuriani.ge"), cookieDeletions(["_fbp", "_fbc"], "mybakuriani.ge"));
  const writes = cookieDeletions(gaCookieNames("G-8YX1DG56R1"), "www.mybakuriani.ge");
  assert.ok(writes.includes("_ga=; Max-Age=0; path=/; domain=.mybakuriani.ge"));
  assert.ok(writes.includes("_ga_8YX1DG56R1=; Max-Age=0; path=/"));
  assert.ok(!writes.some((w) => w.endsWith("domain=.ge")));
});

test("consent: ga is its own field, needs analytics, and re-asks an old yes", () => {
  const both = serializeCookieConsent({ analytics: true, location: false, marketing: true, ga: true });
  assert.equal(both, "v2|analytics=1|marketing=1|ga=1|location=0");
  assert.deepEqual(parseCookieConsent(both), { analytics: true, location: false, marketing: true, ga: true });
  assert.equal(hasGaConsent(both), true);
  assert.equal(hasGaConsent("v2|analytics=0|ga=1"), false);
  assert.equal(hasGaConsent("v2|analytics=1|location=1"), false);
  assert.equal(hasGaConsent("v2|analytics=1|ga=x"), false);
  assert.equal(hasGaConsent(null), false);
  // Without the ga field the cookie reads exactly as before.
  assert.deepEqual(parseCookieConsent("v2|analytics=1|location=1"), { analytics: true, location: true });
  // An analytics yes from before GA is asked again on a GA build only.
  const oldYes = parseCookieConsent("v2|analytics=1|marketing=1|location=1");
  assert.equal(cookieQuestionPending(oldYes, true, false), false);
  assert.equal(cookieQuestionPending(oldYes, true, true), true);
  assert.equal(cookieQuestionPending(parseCookieConsent(both), true, true), false);
  // A decline is never asked again.
  assert.equal(cookieQuestionPending(parseCookieConsent("v2|analytics=0|location=0"), true, true), false);
  assert.equal(cookieQuestionPending(null, false, true), true);
});

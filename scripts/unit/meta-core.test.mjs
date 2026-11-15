import { test } from "node:test";
import assert from "node:assert/strict";
import {
  META_EVENTS,
  META_TOKEN_ROOTS,
  isSafeMetaReferrer,
  isSafeMetaUrl,
  metaCallAllowed,
  metaCookieDeletions,
} from "../../src/lib/meta/core.ts";
import { metaPixelIdFrom } from "../../src/lib/meta/pixel-id.ts";
import { normalizePublicPageviewPath } from "../../src/lib/analytics/pageview.ts";

const ORIGIN = "https://staging.mybakuriani.ge";
const isPublicPath = (pathname) =>
  normalizePublicPageviewPath(pathname) !== null;
const ctx = (path, referrer = "") => ({
  href: `${ORIGIN}${path}`,
  referrer,
  origin: ORIGIN,
  isPublicPath,
});

test("the Pixel ID must be 6-20 digits, else the Pixel is off", () => {
  assert.equal(metaPixelIdFrom("1371344281543333"), "1371344281543333");
  assert.equal(metaPixelIdFrom(" 1371344281543333 "), "1371344281543333");
  for (const value of [
    undefined,
    null,
    "",
    "abc",
    "12345",
    "1".repeat(21),
    "1371344281543333x",
    "13713 44281543333",
  ]) {
    assert.equal(metaPixelIdFrom(value), null, `value=${value}`);
  }
});

test("the catalog is the four events and their fbq methods", () => {
  assert.deepEqual(META_EVENTS, {
    PageView: "track",
    CompleteRegistration: "track",
    Lead: "track",
    SmartMatchRequest: "trackCustom",
  });
});

test("ad landings and plain public pages are safe", () => {
  for (const path of [
    "/",
    "/apartments",
    "/en/apartments",
    "/ru",
    "/?fbclid=IwAR0abc-_.~&utm_source=fb&utm_medium=cpc&utm_campaign=c&utm_id=1&utm_content=a",
    "/apartments?gclid=Y",
    "/search?mode=rent&check_in=2026-12-01&guests=2",
    "/search?mode=sale&price_min=100&price_max=2500.50&types=flat,house&amenities=wifi,ski_storage&verified_only=true",
    "/sales/all?type=flat&roi_min=7.5",
    "/apartments?source=map",
    "/auth/register?next=/dashboard/guest",
    "/?utm_term=" + "x".repeat(200),
    "/?wbraid=a&gbraid=b&msclkid=c&ttclid=d&igshid=e&brid=f",
    "/?igsh=MWQ1ZGUxMzZlbw&mibextid=Zbwkwl&_gl=1.abc-_~&srsltid=AfmBOoq3x_Y",
    "/?_gl=1*1x2y3z*_ga*MTIzNDU2Nzg5MC4xNzAwMDAwMDAw*_ga_ABC123*MTcwMDAwMDAwMC4xLjEuMTcwMDAwMDAwMC4wLjAuMA..",
    "/?igsh=MWQ1ZGUxMzBkMA==",
  ]) {
    assert.equal(isSafeMetaUrl(`${ORIGIN}${path}`), true, path);
  }
});

test("token pages, fragments, free text and unknown keys are never safe", () => {
  for (const root of META_TOKEN_ROOTS) {
    assert.equal(isSafeMetaUrl(`${ORIGIN}${root}/abc`), false, root);
    assert.equal(isSafeMetaUrl(`${ORIGIN}/en${root}/abc`), false, `/en${root}`);
  }
  for (const path of [
    "/auth/confirm?token_hash=abc&type=email",
    "/auth/reset-password?token_hash=abc&type=recovery",
    "/auth/callback?code=abc",
    "/sms-consent/tok",
    "/sms-stop/tok",
    "/review/tok",
    "/join/CODE",
    "/l/0123456789ab",
    "/preview/apartments/x",
    "/AUTH/confirm",
    "/%61uth/confirm",
    "/#mb-ad-preview=1",
    "/apartments#",
    "/apartments?preview=1",
    "/search?q=SECRET",
    "/search?mode=rent&q=SECRET",
    "/search?location=Didveli",
    "/search?zone=x",
    "/search?cadastral=1",
    "/search?mode=other",
    "/search?check_in=2026-12-1",
    "/search?guests=1000",
    "/apartments?mode=rent",
    "/?next=/x",
    "/auth/register?next=//evil.example",
    "/auth/register?next=/auth/reset-password",
    "/auth/register?next=/x?y=1",
    "/?fbclid=",
    "/?fbclid=a%20b",
    "/?utm_source=" + "x".repeat(201),
    "/?utm_source=a%0Ab",
    "/?" + "x".repeat(2100),
  ]) {
    assert.equal(isSafeMetaUrl(`${ORIGIN}${path}`), false, path);
  }
  for (const href of [
    "",
    "not a url",
    "javascript:alert(1)",
    "https://user:pw@staging.mybakuriani.ge/",
  ]) {
    assert.equal(isSafeMetaUrl(href), false, href);
  }
});

test("a same-origin referrer must be a safe public page; other sites pass", () => {
  assert.equal(isSafeMetaReferrer("", ORIGIN, isPublicPath), true);
  assert.equal(
    isSafeMetaReferrer("https://www.facebook.com/", ORIGIN, isPublicPath),
    true,
  );
  assert.equal(
    isSafeMetaReferrer(
      "https://l.facebook.com/?q=anything",
      ORIGIN,
      isPublicPath,
    ),
    true,
  );
  assert.equal(
    isSafeMetaReferrer(`${ORIGIN}/apartments`, ORIGIN, isPublicPath),
    true,
  );
  for (const path of [
    "/search?q=SECRET",
    "/auth/reset-password?token_hash=x",
    "/dashboard/guest",
    "/auth/login",
    "/apartments#x",
  ]) {
    assert.equal(
      isSafeMetaReferrer(`${ORIGIN}${path}`, ORIGIN, isPublicPath),
      false,
      path,
    );
  }
  assert.equal(isSafeMetaReferrer("::::", ORIGIN, isPublicPath), false);
});

test("PageView needs a public page; the conversion events only a safe URL and referrer", () => {
  assert.equal(metaCallAllowed("PageView", ctx("/")), true);
  assert.equal(metaCallAllowed("PageView", ctx("/en/apartments/123")), true);
  for (const path of [
    "/auth/login",
    "/auth/register",
    "/dashboard/guest",
    "/dashboard/admin",
    "/create/rental",
    "/checkout/x",
  ]) {
    assert.equal(metaCallAllowed("PageView", ctx(path)), false, path);
  }
  assert.equal(
    metaCallAllowed("CompleteRegistration", ctx("/auth/register")),
    true,
  );
  assert.equal(metaCallAllowed("Lead", ctx("/employment/abc")), true);
  assert.equal(
    metaCallAllowed("SmartMatchRequest", ctx("/dashboard/guest")),
    true,
  );
  assert.equal(metaCallAllowed("Lead", ctx("/employment/abc?q=SECRET")), false);
  assert.equal(
    metaCallAllowed(
      "Lead",
      ctx("/employment/abc", `${ORIGIN}/search?q=SECRET`),
    ),
    false,
  );
  assert.equal(
    metaCallAllowed(
      "PageView",
      ctx("/apartments", `${ORIGIN}/auth/callback?code=x`),
    ),
    false,
  );
  assert.equal(metaCallAllowed("Purchase", ctx("/")), false);
});

test("withdrawal deletes _fbp/_fbc host-only and on parent domains, never a bare TLD", () => {
  const writes = metaCookieDeletions("staging.mybakuriani.ge");
  assert.deepEqual(writes, [
    "_fbp=; Max-Age=0; path=/",
    "_fbp=; Max-Age=0; path=/; domain=.staging.mybakuriani.ge",
    "_fbp=; Max-Age=0; path=/; domain=.mybakuriani.ge",
    "_fbc=; Max-Age=0; path=/",
    "_fbc=; Max-Age=0; path=/; domain=.staging.mybakuriani.ge",
    "_fbc=; Max-Age=0; path=/; domain=.mybakuriani.ge",
  ]);
  for (const host of [
    "staging.mybakuriani.ge",
    "mybakuriani.ge",
    "www.mybakuriani.ge",
  ]) {
    assert.equal(
      metaCookieDeletions(host).some((w) => /domain=\.ge$/.test(w)),
      false,
      host,
    );
  }
  assert.deepEqual(metaCookieDeletions("localhost"), [
    "_fbp=; Max-Age=0; path=/",
    "_fbc=; Max-Age=0; path=/",
  ]);
  assert.deepEqual(metaCookieDeletions("127.0.0.1"), [
    "_fbp=; Max-Age=0; path=/",
    "_fbc=; Max-Age=0; path=/",
  ]);
});

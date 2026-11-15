import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTopGeHit } from "../../src/lib/analytics/pageview.ts";

const ORIGIN = "https://mybakuriani.ge";
const hit = (over = {}) =>
  buildTopGeHit({
    origin: ORIGIN,
    pathname: "/ru/apartments/abc",
    referrer: "",
    rand: 1234.5,
    width: 390,
    height: 844,
    depth: 24,
    ...over,
  });
// Encoded values hold no raw "+", so the fields split cleanly.
const referer = (url) =>
  decodeURIComponent(url.match(/\+REFERER:([^+]*)\+/)[1]);

// TOP.GE's counter.js builds its request like this (copied from the script).
const vendor = (referer, jl) =>
  "https://counter.top.ge/cgi-bin/count222?" +
  [
    ["ID", 119119],
    ["JS", 11],
    ["RAND", 1234.5],
    ["ISFRM", 0],
    ["REFERER", referer],
    ["RESOLUTION", 390 + "x" + 844],
    ["JL", jl],
    ["DEPT", 24],
  ]
    .map((t) => t[0] + ":" + encodeURIComponent(t[1]))
    .join("+");

test("builds the request exactly like TOP.GE's own counter.js", () => {
  assert.equal(
    hit({ referrer: "https://www.google.com/" }).url,
    vendor("https://www.google.com/", `${ORIGIN}/ru/apartments/abc`),
  );
  assert.equal(hit().url, vendor("", `${ORIGIN}/ru/apartments/abc`));
  // An escaped path is escaped again, as the vendor does with location.href.
  assert.equal(
    hit({ pathname: "/blog/a%20b" }).url,
    vendor("", `${ORIGIN}/blog/a%20b`),
  );
});

test("reports origin + the real path, locale prefix kept, detail pages included", () => {
  assert.equal(hit().page, `${ORIGIN}/ru/apartments/abc`);
  assert.equal(hit({ pathname: "/" }).page, `${ORIGIN}/`);
  assert.equal(hit({ pathname: "/ka" }).page, `${ORIGIN}/ka`);
  assert.equal(hit({ pathname: "/hotels/9f1c" }).page, `${ORIGIN}/hotels/9f1c`);
});

test("sends nothing for a page that is not public or has a query or hash", () => {
  for (const pathname of [
    "/auth/reset-password",
    "/en/auth/login",
    "/dashboard/renter",
    "/create/sale",
    "/checkout/x",
    "/api/support",
    "/apartments?x=1",
    "/apartments#top",
    "/apartments/../dashboard",
    "//evil.example",
    "x",
    "",
  ]) {
    assert.equal(hit({ pathname }), null, pathname);
  }
});

test("a referrer never carries a query, a fragment or a private page of this site", () => {
  const cases = [
    ["https://example.com/p?token=SECRET#frag", "https://example.com/p"],
    [`${ORIGIN}/ru/apartments?zone=1`, `${ORIGIN}/ru/apartments`],
    [
      `${ORIGIN}/auth/reset-password?token_hash=SECRET&type=recovery`,
      `${ORIGIN}/`,
    ],
    [`${ORIGIN}/ru/dashboard/renter/balance`, `${ORIGIN}/`],
    ["android-app://com.google.android.gm", ""],
    ["not a url", ""],
    ["", ""],
  ];
  for (const [input, expected] of cases) {
    const { url } = hit({ referrer: input });
    assert.equal(referer(url), expected, input);
    assert.ok(!url.includes("SECRET"), input);
  }
});

test("a long referrer is cut at 1000 characters before it is encoded", () => {
  const long = `https://example.com/${"a".repeat(2000)}`;
  assert.equal(referer(hit({ referrer: long }).url).length, 1000);
});

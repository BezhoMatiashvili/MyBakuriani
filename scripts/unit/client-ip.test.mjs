import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLOUDFLARE_IPV4_RANGES,
  CLOUDFLARE_IPV6_RANGES,
  getClientIp,
  isCloudflareIp,
} from "../../src/lib/client-ip.ts";

const req = (headers) => ({ headers: new Headers(headers) });
// A real Cloudflare edge address from staging's view events, and a client.
const CF = "162.158.151.148";
const CLIENT = "203.0.113.50";

test("without X-Forwarded-For: x-real-ip, else unknown", () => {
  assert.equal(getClientIp(req({})), "unknown");
  assert.equal(getClientIp(req({ "x-real-ip": CLIENT })), CLIENT);
});

test("a non-Cloudflare peer is the client; spoofed hops and headers are ignored", () => {
  assert.equal(
    getClientIp(req({ "x-forwarded-for": "198.51.100.9" })),
    "198.51.100.9",
  );
  // The first hop is client-supplied (the 2026-09-08 bypass): never returned.
  assert.equal(
    getClientIp(req({ "x-forwarded-for": "6.6.6.6, 198.51.100.9" })),
    "198.51.100.9",
  );
  // Only a Cloudflare edge can vouch for CF-Connecting-IP.
  assert.equal(
    getClientIp(
      req({
        "x-forwarded-for": "6.6.6.6, 198.51.100.9",
        "cf-connecting-ip": "6.6.6.6",
      }),
    ),
    "198.51.100.9",
  );
});

test("a Cloudflare peer defers to CF-Connecting-IP", () => {
  assert.equal(
    getClientIp(
      req({
        "x-forwarded-for": `${CLIENT}, ${CF}`,
        "cf-connecting-ip": CLIENT,
      }),
    ),
    CLIENT,
  );
  assert.equal(
    getClientIp(
      req({
        "x-forwarded-for": `6.6.6.6, ${CLIENT}, ${CF}`,
        "cf-connecting-ip": CLIENT,
      }),
    ),
    CLIENT,
  );
  // The header wins over the appended hop when the two disagree.
  assert.equal(
    getClientIp(
      req({
        "x-forwarded-for": `198.51.100.9, ${CF}`,
        "cf-connecting-ip": CLIENT,
      }),
    ),
    CLIENT,
  );
});

test("a Cloudflare peer without a valid header falls back to the hop before it", () => {
  assert.equal(
    getClientIp(req({ "x-forwarded-for": `${CLIENT}, ${CF}` })),
    CLIENT,
  );
  assert.equal(
    getClientIp(
      req({
        "x-forwarded-for": `${CLIENT}, ${CF}`,
        "cf-connecting-ip": "not-an-ip",
      }),
    ),
    CLIENT,
  );
  // Nothing usable before the edge: degrade to the edge (the old behaviour).
  assert.equal(getClientIp(req({ "x-forwarded-for": CF })), CF);
  assert.equal(getClientIp(req({ "x-forwarded-for": `garbage, ${CF}` })), CF);
});

test("IPv6 edges and IPv4-mapped addresses", () => {
  assert.equal(
    getClientIp(
      req({
        "x-forwarded-for": "2001:db8::1, 2400:cb00:2049::1",
        "cf-connecting-ip": "2001:db8::1",
      }),
    ),
    "2001:db8::1",
  );
  // A mapped edge is still an edge...
  assert.equal(
    getClientIp(
      req({
        "x-forwarded-for": `${CLIENT}, ::ffff:${CF}`,
        "cf-connecting-ip": CLIENT,
      }),
    ),
    CLIENT,
  );
  // ...and a mapped client gets the same key as its plain IPv4 form.
  assert.equal(
    getClientIp(req({ "x-forwarded-for": "::ffff:198.51.100.9" })),
    "198.51.100.9",
  );
  assert.equal(
    getClientIp(
      req({ "x-forwarded-for": CF, "cf-connecting-ip": `::ffff:${CLIENT}` }),
    ),
    CLIENT,
  );
});

test("loopback, whitespace, empty hops and garbage", () => {
  assert.equal(getClientIp(req({ "x-forwarded-for": "::1" })), "::1");
  assert.equal(
    getClientIp(req({ "x-forwarded-for": " 203.0.113.7 , , 198.51.100.9 " })),
    "198.51.100.9",
  );
  assert.equal(
    getClientIp(req({ "x-forwarded-for": " , ", "x-real-ip": CLIENT })),
    CLIENT,
  );
  assert.equal(getClientIp(req({ "x-forwarded-for": "garbage" })), "garbage");
});

test("isCloudflareIp matches the published ranges, edges included", () => {
  for (const ip of [
    "162.158.0.0",
    "162.159.255.255",
    "172.66.0.96",
    "104.27.255.255",
    "131.0.72.1",
    "2606:4700::1",
    "2a06:98c7:ffff::1",
    "2400:CB00::1",
    "::ffff:162.158.1.1",
  ]) {
    assert.equal(isCloudflareIp(ip), true, ip);
  }
  for (const ip of [
    "162.160.0.0",
    "104.28.0.0",
    CLIENT,
    "::1",
    "127.0.0.1",
    "2a06:98c8::1",
    "",
    "unknown",
    "162.158.1.1:443",
  ]) {
    assert.equal(isCloudflareIp(ip), false, ip);
  }
});

test("range tables match cloudflare.com/ips-v4 and /ips-v6 (2026-09-26)", () => {
  assert.equal(CLOUDFLARE_IPV4_RANGES.length, 15);
  assert.equal(CLOUDFLARE_IPV6_RANGES.length, 7);
});

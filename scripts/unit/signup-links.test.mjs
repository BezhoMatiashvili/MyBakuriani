import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SIGNUP_LINK_COOKIE,
  SIGNUP_LINK_PRESETS,
  generateSignupLinkCode,
  normalizeSignupLinkCode,
  readSignupLinkCookie,
  validateSignupLinkDestination,
} from "../../src/lib/signup-links.ts";

test("codes are lowercase slugs without dots", () => {
  assert.equal(normalizeSignupLinkCode("  Smart-Match-FB "), "smart-match-fb");
  assert.equal(normalizeSignupLinkCode("abc"), "abc");
  assert.equal(normalizeSignupLinkCode("ab"), null);
  assert.equal(normalizeSignupLinkCode("-abc"), null);
  assert.equal(normalizeSignupLinkCode("a.bc"), null);
  assert.equal(normalizeSignupLinkCode("a/bc"), null);
  assert.equal(normalizeSignupLinkCode("a".repeat(41)), null);
  assert.equal(normalizeSignupLinkCode(42), null);
});

test("generated codes pass the code check", () => {
  for (let i = 0; i < 200; i += 1) {
    const code = generateSignupLinkCode();
    assert.equal(normalizeSignupLinkCode(code), code);
  }
});

test("every preset destination passes the destination check unchanged", () => {
  for (const preset of SIGNUP_LINK_PRESETS) {
    assert.equal(
      validateSignupLinkDestination(preset.destination),
      preset.destination,
    );
  }
});

test("destinations are internal, locale-neutral paths", () => {
  assert.equal(
    validateSignupLinkDestination("/create/rental"),
    "/create/rental",
  );
  assert.equal(validateSignupLinkDestination(" /create/sale "), "/create/sale");
  assert.equal(
    validateSignupLinkDestination("/en/create/sale"),
    "/create/sale",
  );
  assert.equal(validateSignupLinkDestination("/ru"), "/");
  assert.equal(validateSignupLinkDestination("/en?x=1"), "/?x=1");
  assert.equal(
    validateSignupLinkDestination("/entertainment"),
    "/entertainment",
  );
  assert.equal(validateSignupLinkDestination("/"), "/");
});

test("off-site, looping and malformed destinations are refused", () => {
  for (const bad of [
    "",
    "create/rental",
    "https://evil.example/x",
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "/%E0%A4%A",
    "/auth/login",
    "/AUTH/register",
    "/api/admin/stats",
    "/join/abc",
    "/en/join/abc",
    "/en//evil.example",
    `/${"a".repeat(300)}`,
    null,
  ]) {
    assert.equal(validateSignupLinkDestination(bad), null, String(bad));
  }
});

test("the cookie reader finds and validates the code", () => {
  assert.equal(
    readSignupLinkCookie(`a=1; ${SIGNUP_LINK_COOKIE}=smart-fb; b=2`),
    "smart-fb",
  );
  assert.equal(readSignupLinkCookie(`${SIGNUP_LINK_COOKIE}=bad.code`), null);
  assert.equal(readSignupLinkCookie(`${SIGNUP_LINK_COOKIE}=%E0%A4%A`), null);
  assert.equal(readSignupLinkCookie("other=abc"), null);
  assert.equal(readSignupLinkCookie(""), null);
});

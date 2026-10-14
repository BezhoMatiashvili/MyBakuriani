import { test } from "node:test";
import assert from "node:assert/strict";
import { isFacebookProfileUrl } from "../../src/lib/fb-profile-url.ts";

test("Facebook profile links pass", () => {
  for (const url of [
    "https://www.facebook.com/some.person",
    "https://facebook.com/profile.php?id=100012345678",
    "https://m.facebook.com/some.person",
    "https://web.facebook.com/some.person",
    "https://fb.com/some.person",
    "https://WWW.FACEBOOK.COM/Some.Person",
  ]) {
    assert.equal(isFacebookProfileUrl(url), true, url);
  }
});

test("anything else is not linked", () => {
  for (const url of [
    "http://www.facebook.com/some.person",
    "https://evil.example/login",
    "https://facebook.com.evil.example/login",
    "https://evilfacebook.com/login",
    "https://l.facebook.com/l.php?u=https%3A%2F%2Fevil.example",
    "https://lm.facebook.com/l.php?u=https%3A%2F%2Fevil.example",
    "https://www.facebook.com/l.php?u=https%3A%2F%2Fevil.example",
    "https://user:pass@facebook.com/x",
    "https://facebook.com:8443/x",
    "javascript:alert(1)",
    "https://www.facebook.com/" + "a".repeat(300),
    "not a url",
    "",
    null,
    undefined,
    42,
  ]) {
    assert.equal(isFacebookProfileUrl(url), false, String(url));
  }
});

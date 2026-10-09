import { test } from "node:test";
import assert from "node:assert/strict";

import { passwordChangeErrorKey } from "../../src/lib/auth/password.ts";

// Shapes as staging's GoTrue answered them (probed 2026-10-07).
test("GoTrue refusals map to their own message", () => {
  const cases = [
    [{ code: "invalid_credentials", status: 400 }, "wrongCurrent"],
    [{ code: "same_password", status: 422 }, "samePassword"],
    [
      { code: "weak_password", status: 422, reasons: ["pwned"] },
      "leakedPassword",
    ],
    [
      { code: "weak_password", status: 422, reasons: ["length", "characters"] },
      "weakPassword",
    ],
    [{ code: "weak_password", status: 422 }, "weakPassword"],
    [{ code: "over_request_rate_limit", status: 429 }, "tooManyAttempts"],
    [{ status: 429 }, "tooManyAttempts"],
    [{ code: "reauthentication_needed", status: 400 }, "reauthenticate"],
  ];
  for (const [err, key] of cases) {
    assert.equal(passwordChangeErrorKey(err), key, JSON.stringify(err));
  }
});

test("a lost answer is a network error, anything else generic", () => {
  assert.equal(
    passwordChangeErrorKey({ name: "AuthRetryableFetchError", status: 0 }),
    "network",
  );
  assert.equal(
    passwordChangeErrorKey({ code: "unexpected_failure", status: 500 }),
    "generic",
  );
  assert.equal(passwordChangeErrorKey(new Error("boom")), "generic");
  assert.equal(passwordChangeErrorKey(null), "generic");
  assert.equal(passwordChangeErrorKey(undefined), "generic");
});

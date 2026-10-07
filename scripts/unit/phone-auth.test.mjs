import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  AUTH_SMS_ERRORS as appTokens,
  localToE164,
  phoneAuthErrorKey,
} from "../../src/lib/auth/phone.ts";
import { AUTH_SMS_ERRORS as hookTokens } from "../../supabase/functions/_shared/auth-sms.ts";

// C48: the hook refuses with these tokens and the app turns them into
// messages, so the two copies must be identical.
test("app and hook agree on the refusal tokens", () => {
  assert.deepEqual(appTokens, hookTokens);
});

test("localToE164 takes only a Georgian mobile", () => {
  assert.equal(localToE164("599123456"), "+995599123456");
  assert.equal(localToE164("599 12 34 56"), "+995599123456");
  assert.equal(localToE164("59912345"), null);
  assert.equal(localToE164("322123456"), null);
  assert.equal(localToE164("995599123456"), null);
  assert.equal(localToE164(""), null);
});

test("hook refusals map to their own message", () => {
  const cases = [
    [hookTokens.phoneNotSupported, 400, "phoneNotSupported"],
    [hookTokens.numberLimit, 429, "numberLimit"],
    [hookTokens.ipLimit, 429, "ipLimit"],
    [hookTokens.unavailable, 503, "unavailable"],
    [hookTokens.sendFailed, 502, "sendFailed"],
  ];
  for (const [message, status, key] of cases) {
    assert.equal(
      phoneAuthErrorKey({ name: "AuthApiError", message, status }),
      key,
    );
  }
});

test("GoTrue refusals map by code", () => {
  const cases = [
    ["otp_expired", 403, "wrongCode"],
    ["phone_exists", 422, "phoneTaken"],
    ["over_sms_send_rate_limit", 429, "tooSoon"],
    ["over_request_rate_limit", 429, "tooSoon"],
    ["validation_failed", 400, "phoneNotSupported"],
    ["phone_provider_disabled", 400, "unavailable"],
    ["sms_send_failed", 500, "unavailable"],
    ["hook_timeout_after_retry", 500, "sendFailed"],
  ];
  for (const [code, status, key] of cases) {
    assert.equal(
      phoneAuthErrorKey({ name: "AuthApiError", message: "x", code, status }),
      key,
      code,
    );
  }
});

test("network failures, bare 5xx and unknowns", () => {
  assert.equal(
    phoneAuthErrorKey({
      name: "AuthRetryableFetchError",
      message: "Failed to fetch",
      status: 0,
    }),
    "timeout",
  );
  assert.equal(
    phoneAuthErrorKey({ name: "AuthApiError", message: "boom", status: 500 }),
    "sendFailed",
  );
  assert.equal(
    phoneAuthErrorKey({ name: "AuthApiError", message: "slow", status: 429 }),
    "tooSoon",
  );
  assert.equal(phoneAuthErrorKey(new Error("whatever")), "generic");
  assert.equal(phoneAuthErrorKey(null), "generic");
});

test("every error key has a message in every locale", () => {
  const keys = [
    "phoneNotSupported",
    "numberLimit",
    "ipLimit",
    "unavailable",
    "sendFailed",
    "tooSoon",
    "wrongCode",
    "phoneTaken",
    "timeout",
    "generic",
    "invalidPhone",
    "invalidOtp",
  ];
  for (const locale of ["ka", "en", "ru"]) {
    const messages = JSON.parse(
      readFileSync(`messages/${locale}.json`, "utf8"),
    );
    for (const key of keys) {
      assert.equal(
        typeof messages.PhoneOtp.errors[key],
        "string",
        `${locale} PhoneOtp.errors.${key}`,
      );
    }
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  RESET_RESEND_SECONDS,
  recoveryTokenHash,
  resetRequestOutcome,
} from "../../src/lib/auth/password-reset.ts";

// C51: shapes of the errors supabase-js throws for POST /recover.
const apiError = (status, code, message) => ({
  name: "AuthApiError",
  status,
  code,
  message,
});

test("a sent link starts the resend countdown", () => {
  assert.deepEqual(resetRequestOutcome(null), {
    kind: "sent",
    resendIn: RESET_RESEND_SECONDS,
  });
});

test("GoTrue's per-address resend window is the sent state, not an error", () => {
  const err = apiError(
    429,
    "over_email_send_rate_limit",
    "For security purposes, you can only request this after 37 seconds.",
  );
  assert.deepEqual(resetRequestOutcome(err), { kind: "sent", resendIn: 37 });
  // "1 second" and an absurd value stay sane.
  assert.deepEqual(
    resetRequestOutcome(
      apiError(429, "over_email_send_rate_limit", "… after 1 second."),
    ),
    { kind: "sent", resendIn: 1 },
  );
  assert.deepEqual(
    resetRequestOutcome(
      apiError(429, "over_email_send_rate_limit", "… after 99999 seconds."),
    ),
    { kind: "sent", resendIn: 3600 },
  );
});

test("the project-wide email cap says nothing was sent", () => {
  const err = apiError(
    429,
    "over_email_send_rate_limit",
    "Email rate limit exceeded",
  );
  assert.deepEqual(resetRequestOutcome(err), { kind: "mailUnavailable" });
});

test("the per-IP limit and any other 429 are their own error", () => {
  assert.deepEqual(
    resetRequestOutcome(
      apiError(429, "over_request_rate_limit", "Request rate limit reached"),
    ),
    { kind: "ipLimited" },
  );
  assert.deepEqual(resetRequestOutcome(apiError(429, undefined, "Too many")), {
    kind: "ipLimited",
  });
});

test("no answer at all is a network error", () => {
  assert.deepEqual(
    resetRequestOutcome({
      name: "AuthRetryableFetchError",
      status: 0,
      message: "Failed to fetch",
    }),
    { kind: "network" },
  );
});

test("other refusals keep the neutral sent state (no account enumeration)", () => {
  for (const err of [
    apiError(
      400,
      "validation_failed",
      "Unable to validate email address: invalid format",
    ),
    apiError(500, "unexpected_failure", "Error sending recovery email"),
    new Error("boom"),
  ]) {
    assert.deepEqual(resetRequestOutcome(err), {
      kind: "sent",
      resendIn: RESET_RESEND_SECONDS,
    });
  }
});

test("recoveryTokenHash takes only a recovery token", () => {
  const q = (s) => new URLSearchParams(s);
  assert.equal(
    recoveryTokenHash(q("token_hash=pkce_abc&type=recovery")),
    "pkce_abc",
  );
  assert.equal(recoveryTokenHash(q("token_hash=abc")), "abc");
  assert.equal(recoveryTokenHash(q("token_hash=abc&type=email")), null);
  assert.equal(recoveryTokenHash(q("type=recovery")), null);
  assert.equal(recoveryTokenHash(q("token_hash=&type=recovery")), null);
  assert.equal(recoveryTokenHash(q("")), null);
});

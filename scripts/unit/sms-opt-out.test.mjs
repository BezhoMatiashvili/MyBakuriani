import { test } from "node:test";
import assert from "node:assert/strict";

import { hashSmsOptOutToken } from "../../src/lib/sms/opt-out.ts";
import { smsMarketingGateOpen } from "../../src/lib/sms/marketing-gates.ts";

// C18: sms-automation-run/opt-out.ts stores the hash of the token it texts; the
// /api/sms-stop route recomputes it from the URL. Same vector as opt-out_test.ts.
test("the opt-out route hashes the URL token the way the Deno side stored it", () => {
  assert.equal(
    hashSmsOptOutToken("AAAAAAAAAAAAAAAAAAAAAA"),
    "8a5bdb4cc15164126c6ef2668de9dd240d299ce6397a42c95a9411b93d080ed8",
  );
});

test("only a 22-character base64url token is looked up", () => {
  for (const token of [
    "",
    "A".repeat(21),
    "A".repeat(23),
    "A".repeat(43),
    "AAAAAAAAAAAAAAAAAAAAA/",
    "AAAAAAAAAAAAAAAAAAAAA=",
  ]) {
    assert.equal(hashSmsOptOutToken(token), null, token);
  }
});

// = SQL sms_marketing_gate_open: value ->> gate = 'true'.
test("a marketing gate opens only on an explicit true", () => {
  assert.equal(smsMarketingGateOpen({ win_back: true }, "win_back"), true);
  assert.equal(smsMarketingGateOpen({ win_back: "true" }, "win_back"), true);
  for (const value of [
    null,
    undefined,
    "true",
    [],
    {},
    { win_back: false },
    { win_back: 1 },
    { win_back: "TRUE" },
    { consent_requests: true },
  ]) {
    assert.equal(
      smsMarketingGateOpen(value, "win_back"),
      false,
      JSON.stringify(value),
    );
  }
});

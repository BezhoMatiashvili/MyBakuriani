import { test } from "node:test";
import assert from "node:assert/strict";

import { toCanonicalGePhone as appPhone } from "../../src/lib/sms/phone.ts";
import {
  buildConsentRequest,
  TEMPLATES,
  toCanonicalGePhone as denoPhone,
} from "../../supabase/functions/sms-automation-run/domain.ts";

// C18: the Next route pre-checks the booking phone with src/lib/sms/phone.ts,
// while the Deno pipeline and sms_canonical_ge_phone (SQL) decide the actual
// recipient. They must agree on every input.
const PHONE_CASES = [
  ["555111111", "+995555111111"],
  ["555 11 11 11", "+995555111111"],
  ["+995 555 11 11 11", "+995555111111"],
  ["995555111111", "+995555111111"],
  ["+995-599-12-34-56", "+995599123456"],
  ["995555111111999", null], // 15-digit legacy value: rejected, never truncated
  ["995123456", null], // 9 digits that start with 995 but not with 5
  ["59911111", null],
  ["322111111", null], // landline
  ["+1 555 111 1111", null],
  ["", null],
  [null, null],
  [undefined, null],
];

test("app and Deno phone normalisation agree", () => {
  for (const [input, expected] of PHONE_CASES) {
    assert.equal(appPhone(input), expected, `app ${String(input)}`);
    assert.equal(denoPhone(input), expected, `deno ${String(input)}`);
  }
  // Seeded pseudo-random 7-16 digit strings (reproducible on failure), biased
  // towards the 9-digit mobile and 12-digit 995-prefixed shapes that pass.
  let seed = 0x5eed;
  const nextDigit = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return (seed >>> 16) % 10;
  };
  for (let i = 0; i < 5000; i++) {
    let digits = "";
    for (let j = 0; j < 7 + (i % 10); j++) {
      digits += String(nextDigit());
    }
    if (i % 2 === 0) digits = `5${digits.slice(1)}`;
    if (i % 4 === 1) digits = `9955${digits.slice(4)}`;
    const input = (i % 3 === 0 ? "+" : "") + digits;
    assert.equal(appPhone(input), denoPhone(input), input);
  }
});

test("consent request SMS carries only the platform link", () => {
  const token = "A".repeat(43);
  const link = `https://staging.mybakuriani.ge/sms-consent/${token}`;
  const message = buildConsentRequest(link);
  assert.ok(message.includes(link));
  assert.doesNotMatch(message, /\[[A-Za-z_]+\]/);
  // sms_outbound_message_len allows at most 320 characters.
  assert.ok(message.length <= 320, `length ${message.length}`);
  assert.ok(TEMPLATES.consent_request.includes("[Consent_Link]"));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupGePhone,
  hasValidWhatsapp,
  isValidGeContactPhone,
  isValidGePhone,
  sanitizeGePhone,
  toGeContactE164,
} from "../../src/lib/utils/number.ts";
import { normalizeE164Phone } from "../../src/lib/security.ts";

// C56: a listing's or company's contact phone may be a Georgian mobile or a
// landline; everything texted, signed in with, matched or opened in WhatsApp
// stays a mobile (5XX XX XX XX).

const LANDLINES = [
  "322118047", // Tbilisi 32
  "367241234", // Bakuriani / Borjomi 367
  "341123456", // Rustavi
  "350123456", // Telavi
  "370123456", // Gori
  "373123456", // Mtskheta
  "415123456", // Zugdidi
  "422123456", // Batumi
  "431123456", // Kutaisi
  "493123456", // Poti
  "790123456", // MagtiFix home phone
  "791123456", // Silknet home phone
];

const NOT_CONTACT = [
  "706123456", // VoIP, not internationally diallable
  "707123456",
  "800123456", // toll-free
  "900123456", // premium-rate
  "995123456", // 9 digits that start with 995 are not a number
  "330123456", // no such range
  "32211804", // 8 digits
  "3221180471", // 10 digits
  "0322118047", // a trunk 0 is the field's to drop, not the validator's
  "",
];

test("a contact phone is a mobile or a Georgian landline", () => {
  assert.equal(isValidGeContactPhone("599123456"), true);
  assert.equal(isValidGeContactPhone("599 12 34 56"), true);
  for (const landline of LANDLINES) {
    assert.equal(isValidGeContactPhone(landline), true, landline);
  }
  for (const value of NOT_CONTACT) {
    assert.equal(isValidGeContactPhone(value), false, value);
  }
  assert.equal(isValidGeContactPhone(null), false);
  assert.equal(isValidGeContactPhone(undefined), false);
});

test("mobile-only checks still refuse a landline", () => {
  for (const landline of LANDLINES) {
    assert.equal(isValidGePhone(landline), false, landline);
    assert.equal(hasValidWhatsapp(`+995${landline}`), false, landline);
    assert.equal(normalizeE164Phone(`+995${landline}`), null, landline);
  }
  assert.equal(isValidGePhone("599123456"), true);
});

test("sanitizeGePhone keeps the local number of typed, pasted or stored text", () => {
  const cases = [
    ["0322 11 80 47", "322118047"],
    ["+995 32 211 80 47", "322118047"],
    ["00995 32 211 80 47", "322118047"],
    ["+995 0322 11 80 47", "322118047"],
    ["995322118047", "322118047"],
    ["+995 599 12 34 56", "599123456"],
    ["995599123456", "599123456"],
    ["0599123456", "599123456"],
    ["599-12-34-56", "599123456"],
    // while typing: a short "995…" stays, and a 0 stays until the 10th digit,
    // so deleting the 5 of "507 12 34 56" keeps the 0 behind it
    ["5991", "5991"],
    ["995", "995"],
    ["995123456", "995123456"],
    ["0", "0"],
    ["032211804", "032211804"],
    ["07 12 34 56", "07123456"],
    // a field holds 9 digits at most
    ["5991234567", "599123456"],
    ["", ""],
    [null, ""],
    [undefined, ""],
  ];
  for (const [input, expected] of cases) {
    assert.equal(sanitizeGePhone(input), expected, String(input));
  }
});

test("groupGePhone groups mobiles exactly as PhoneInput did, Tbilisi 2-3-2-2", () => {
  // PhoneInput's grouping before C56, for every prefix of a mobile.
  const before = (raw) => {
    const d = raw.replace(/\D/g, "").slice(0, 9);
    if (d.length <= 3) return d;
    if (d.length <= 5) return `${d.slice(0, 3)} ${d.slice(3)}`;
    if (d.length <= 7) return `${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5)}`;
    return `${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7)}`;
  };
  const mobile = "599123456";
  for (let n = 0; n <= mobile.length; n += 1) {
    assert.equal(groupGePhone(mobile.slice(0, n)), before(mobile.slice(0, n)));
  }
  assert.equal(groupGePhone("322118047"), "32 211 80 47");
  assert.equal(groupGePhone("3"), "3");
  assert.equal(groupGePhone("32"), "32");
  assert.equal(groupGePhone("322"), "32 2");
  assert.equal(groupGePhone("32211"), "32 211");
  assert.equal(groupGePhone("322118"), "32 211 8");
  assert.equal(groupGePhone("367241234"), "367 24 12 34");
  assert.equal(groupGePhone("790123456"), "790 12 34 56");
});

test("toGeContactE164 dials a mobile or a landline and never truncates", () => {
  const cases = [
    ["+995322118047", "+995322118047"],
    ["322118047", "+995322118047"],
    ["0322 11 80 47", "+995322118047"],
    ["032 2 00 00 00", "+995322000000"],
    ["00995 367 24 12 34", "+995367241234"],
    ["+995 790 12 34 56", "+995790123456"],
    ["+995599123456", "+995599123456"],
    ["706 12 34 56", null],
    ["+995 800 12 34 56", null],
    ["995123456", null],
    ["5991234567", null],
    ["9955991234567", null],
    ["", null],
    [null, null],
    [undefined, null],
    [599123456, null],
  ];
  for (const [input, expected] of cases) {
    assert.equal(toGeContactE164(input), expected, String(input));
  }
});

test("toGeContactE164 agrees with normalizeE164Phone on every mobile", () => {
  for (const value of [
    "599123456",
    "+995599123456",
    "995599123456",
    "+995 599 12 34 56",
    "555 11 11 11",
  ]) {
    assert.equal(toGeContactE164(value), normalizeE164Phone(value), value);
  }
});
